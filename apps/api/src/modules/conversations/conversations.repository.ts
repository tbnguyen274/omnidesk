import { evaluateConversationChange } from '@omnidesk/domain';
import { observeDatabaseOperation } from '@omnidesk/shared';
import { Injectable, ConflictException, Logger } from '@nestjs/common';
import {
  ConversationStatus,
  MessageDirection,
  Prisma,
  Priority,
  ChannelType,
} from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import { OutboxDispatcherService } from '../../common/outbox/outbox-dispatcher.service';

@Injectable()
export class ConversationsRepository {
  private readonly logger = new Logger(ConversationsRepository.name);

  private runTransaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return observeDatabaseOperation(
      'api.conversation.write',
      () => this.prisma.$transaction(work),
      (record) => this.logger.log(JSON.stringify(record)),
    );
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly outboxDispatcher: OutboxDispatcherService,
  ) {}

  list(params: {
    where: Prisma.ConversationWhereInput;
    skip: number;
    take: number;
  }) {
    return this.prisma.$transaction([
      this.prisma.conversation.findMany({
        where: params.where,
        skip: params.skip,
        take: params.take,
        orderBy: { lastMessageAt: 'desc' },
        include: {
          customer: true,
          assignedAgent: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              content: true,
              contentType: true,
              direction: true,
              senderType: true,
              senderId: true,
              createdAt: true,
            },
          },
          ticket: true,
        },
      }),
      this.prisma.conversation.count({ where: params.where }),
    ]);
  }

  findById(id: string) {
    return this.prisma.conversation.findUnique({
      where: { id },
      include: {
        customer: true,
        assignedAgent: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            attachments: true,
          },
        },
        ticket: true,
        conversationTags: {
          include: {
            tag: true,
          },
        },
      },
    });
  }

  getMessages(
    conversationId: string,
    cursor: string | undefined,
    limit: number,
  ) {
    return this.prisma.message.findMany({
      where: { conversationId },
      take: limit,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        attachments: true,
      },
    });
  }

  findExistingById(id: string) {
    return this.prisma.conversation.findUnique({
      where: { id },
      select: { id: true },
    });
  }

  async updateStatus(id: string, status: ConversationStatus, version: number) {
    const result = await this.runTransaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "conversations" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const conversation = await tx.conversation.findUnique({
        where: { id },
        include: { ticket: true },
      });

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      if (conversation.version !== version) {
        throw new ConflictException(
          'Data was modified by another agent. Please refresh.',
        );
      }
      const previousStatus = conversation.status;
      const policy = evaluateConversationChange(
        conversation,
        { type: 'AGENT_SET_STATUS', status },
        { now: new Date() },
      );
      if (!policy.changed) return conversation;
      const result = await tx.conversation.updateMany({
        where: { id, version },
        data: { ...policy.conversationPatch, version: { increment: 1 } },
      });
      if (!result.count)
        throw new ConflictException(
          'Data was modified by another agent. Please refresh.',
        );
      if (conversation.ticket && Object.keys(policy.ticketPatch).length) {
        await tx.ticket.update({
          where: { id: conversation.ticket.id },
          data: policy.ticketPatch,
        });
      }

      const updated = await tx.conversation.findUniqueOrThrow({
        where: { id },
        include: { ticket: true },
      });

      let externalMessageId: string | null = null;
      if (updated.channelType === ChannelType.EMAIL) {
        const latestMsg = await tx.message.findFirst({
          where: {
            conversationId: updated.id,
            direction: MessageDirection.INBOUND,
            externalMessageId: { not: null },
          },
          orderBy: { createdAt: 'desc' },
          select: { externalMessageId: true },
        });
        externalMessageId = latestMsg?.externalMessageId ?? null;
      }

      if (previousStatus !== updated.status) {
        await this.outbox.createEvent(
          tx,
          'CONVERSATION_STATUS_CHANGED',
          updated.id,
          {
            conversationId: updated.id,
            conversationVersion: updated.version,
            previousStatus,
            newStatus: updated.status,
            channelType: updated.channelType,
            channelAccountId: updated.channelAccountId,
            externalMessageId,
          },
        );
      }

      return updated;
    });

    this.outboxDispatcher.trigger();
    return result;
  }

  async updatePriority(id: string, priority: Priority, version: number) {
    const result = await this.runTransaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "conversations" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const current = await tx.conversation.findUnique({
        where: { id },
        select: {
          priority: true,
          version: true,
          channelType: true,
          channelAccountId: true,
        },
      });

      if (!current) {
        throw new Error('Conversation not found');
      }

      if (current.version !== version)
        throw new ConflictException(
          'Data was modified by another agent. Please refresh.',
        );
      if (current.priority === priority)
        return tx.conversation.findUniqueOrThrow({
          where: { id },
          include: { ticket: true },
        });
      const previousPriority = current.priority;

      const result = await tx.conversation.updateMany({
        where: { id, version },
        data: { priority, version: { increment: 1 } },
      });

      if (result.count === 0) {
        throw new ConflictException(
          'Data was modified by another agent. Please refresh.',
        );
      }

      const conversation = await tx.conversation.findUniqueOrThrow({
        where: { id },
        include: { ticket: true },
      });

      let externalMessageId: string | null = null;
      if (conversation.channelType === ChannelType.EMAIL) {
        const latestMsg = await tx.message.findFirst({
          where: {
            conversationId: conversation.id,
            direction: MessageDirection.INBOUND,
            externalMessageId: { not: null },
          },
          orderBy: { createdAt: 'desc' },
          select: { externalMessageId: true },
        });
        externalMessageId = latestMsg?.externalMessageId ?? null;
      }

      await this.outbox.createEvent(
        tx,
        'CONVERSATION_PRIORITY_CHANGED',
        conversation.id,
        {
          conversationId: conversation.id,
          conversationVersion: conversation.version,
          previousPriority,
          newPriority: conversation.priority,
          channelType: conversation.channelType,
          channelAccountId: conversation.channelAccountId,
          externalMessageId,
        },
      );

      return conversation;
    });

    this.outboxDispatcher.trigger();
    return result;
  }

  async updateAssignment(
    id: string,
    assignedAgentId: string | null,
    version: number,
  ) {
    return this.runTransaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "conversations" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const current = await tx.conversation.findUniqueOrThrow({
        where: { id },
        include: {
          assignedAgent: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      });
      if (current.version !== version)
        throw new ConflictException(
          'Data was modified by another agent. Please refresh.',
        );
      if (current.assignedAgentId === assignedAgentId) return current;
      const result = await tx.conversation.updateMany({
        where: { id, version },
        data: {
          assignedAgentId,
          version: { increment: 1 },
        },
      });

      if (result.count === 0) {
        throw new ConflictException(
          'Data was modified by another agent. Please refresh.',
        );
      }

      return tx.conversation.findUniqueOrThrow({
        where: { id },
        include: {
          assignedAgent: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
      });
    });
  }

  async updateReadStatus(id: string, isRead: boolean, version: number) {
    const result = await this.runTransaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "conversations" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const current = await tx.conversation.findUnique({ where: { id } });
      if (!current) throw new Error('Conversation not found');
      if (current.version !== version)
        throw new ConflictException(
          'Data was modified by another agent. Please refresh.',
        );
      if (current.isRead === isRead) return current;
      const result = await tx.conversation.updateMany({
        where: { id, version },
        data: {
          isRead,
          version: { increment: 1 },
        },
      });

      if (result.count === 0) {
        throw new ConflictException(
          'Data was modified by another agent. Please refresh.',
        );
      }

      const conversation = await tx.conversation.findUniqueOrThrow({
        where: { id },
      });

      let externalMessageId: string | null = null;
      if (conversation.channelType === ChannelType.EMAIL) {
        const latestMsg = await tx.message.findFirst({
          where: {
            conversationId: conversation.id,
            direction: MessageDirection.INBOUND,
            externalMessageId: { not: null },
          },
          orderBy: { createdAt: 'desc' },
          select: { externalMessageId: true },
        });
        externalMessageId = latestMsg?.externalMessageId ?? null;
      }

      await this.outbox.createEvent(
        tx,
        'CONVERSATION_READ_STATUS_CHANGED',
        conversation.id,
        {
          conversationId: conversation.id,
          conversationVersion: conversation.version,
          isRead: conversation.isRead,
          channelType: conversation.channelType,
          channelAccountId: conversation.channelAccountId,
          externalMessageId,
        },
      );

      return conversation;
    });

    this.outboxDispatcher.trigger();
    return result;
  }

  async getLatestExternalMessageId(
    conversationId: string,
  ): Promise<string | null> {
    const message = await this.prisma.message.findFirst({
      where: {
        conversationId,
        direction: MessageDirection.INBOUND,
        externalMessageId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: { externalMessageId: true },
    });
    return message?.externalMessageId || null;
  }

  findAssignableUser(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        role: true,
        status: true,
      },
    });
  }

  async addTag(conversationId: string, tagId: string) {
    // Avoid duplicate creation errors by using upsert or checking first
    const existing = await this.prisma.conversationTag.findUnique({
      where: {
        conversationId_tagId: {
          conversationId,
          tagId,
        },
      },
    });

    if (existing) return existing;

    return this.prisma.conversationTag.create({
      data: {
        conversationId,
        tagId,
      },
      include: {
        tag: true,
      },
    });
  }

  async removeTag(conversationId: string, tagId: string) {
    return this.prisma.conversationTag.delete({
      where: {
        conversationId_tagId: {
          conversationId,
          tagId,
        },
      },
    });
  }
}
