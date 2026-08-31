import { Injectable, ConflictException } from '@nestjs/common';
import {
  ConversationStatus,
  MessageDirection,
  Prisma,
  Priority,
} from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { OutboxService } from '../../common/outbox/outbox.service';

@Injectable()
export class ConversationsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
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
    return this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.findUnique({
        where: { id },
        include: { ticket: true },
      });

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      const previousStatus = conversation.status;
      const now = new Date();
      const isWaitingCustomer = status === ConversationStatus.WAITING_CUSTOMER;
      const isResolved = status === ConversationStatus.RESOLVED;
      const isClosed = status === ConversationStatus.CLOSED;

      let newSlaDueAt = conversation.ticket?.slaDueAt;
      let newSlaPausedAt = conversation.ticket?.slaPausedAt;

      if (isWaitingCustomer && !conversation.ticket?.slaPausedAt) {
        newSlaPausedAt = now;
      } else if (
        !isWaitingCustomer &&
        conversation.ticket?.slaPausedAt &&
        conversation.ticket?.slaDueAt
      ) {
        // Unpause SLA: calculate how long it was paused and add it to the due date
        const pauseDurationMs =
          now.getTime() - conversation.ticket.slaPausedAt.getTime();
        newSlaDueAt = new Date(
          conversation.ticket.slaDueAt.getTime() + pauseDurationMs,
        );
        newSlaPausedAt = null;
      }

      const result = await tx.conversation.updateMany({
        where: { id, version },
        data: {
          status,
          version: { increment: 1 },
          resolvedAt: isResolved
            ? now
            : isClosed
              ? conversation.resolvedAt
              : null,
        },
      });

      if (result.count === 0) {
        throw new ConflictException(
          'Data was modified by another agent. Please refresh.',
        );
      }

      if (
        conversation.ticket &&
        (newSlaDueAt !== conversation.ticket.slaDueAt ||
          newSlaPausedAt !== conversation.ticket.slaPausedAt)
      ) {
        await tx.ticket.update({
          where: { id: conversation.ticket.id },
          data: {
            slaDueAt: newSlaDueAt,
            slaPausedAt: newSlaPausedAt,
          },
        });
      }

      const updated = await tx.conversation.findUniqueOrThrow({
        where: { id },
        include: { ticket: true },
      });

      let externalMessageId: string | null = null;
      if (updated.channelType === 'EMAIL') {
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

      return updated;
    });
  }

  async updatePriority(id: string, priority: Priority, version: number) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.conversation.findUnique({
        where: { id },
        select: { priority: true, channelType: true, channelAccountId: true },
      });

      if (!current) {
        throw new Error('Conversation not found');
      }

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
      if (conversation.channelType === 'EMAIL') {
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
  }

  async updateAssignment(
    id: string,
    assignedAgentId: string | null,
    version: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
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
    return this.prisma.$transaction(async (tx) => {
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
      if (conversation.channelType === 'EMAIL') {
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
