import { Injectable, ConflictException } from '@nestjs/common';
import {
  ConversationStatus,
  Prisma,
  Priority,
  TicketStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';

@Injectable()
export class ConversationsRepository {
  constructor(private readonly prisma: PrismaService) {}

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
          orderBy: { createdAt: 'asc' },
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

  findExistingById(id: string) {
    return this.prisma.conversation.findUnique({
      where: { id },
      select: { id: true },
    });
  }

  async updateStatus(id: string, status: ConversationStatus, version: number) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: { ticket: true },
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const now = new Date();
    const isWaitingCustomer = status === ConversationStatus.WAITING_CUSTOMER;
    const isResolved = status === ConversationStatus.RESOLVED;

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

    const result = await this.prisma.conversation.updateMany({
      where: { id, version },
      data: {
        status,
        version: { increment: 1 },
        resolvedAt: isResolved ? now : undefined,
      },
    });

    if (result.count === 0) {
      throw new ConflictException('Data was modified by another agent. Please refresh.');
    }

    if (conversation.ticket) {
      await this.prisma.ticket.update({
        where: { id: conversation.ticket.id },
        data: {
          status: status as any,
          resolvedAt: isResolved ? now : undefined,
          slaDueAt: newSlaDueAt,
          slaPausedAt: newSlaPausedAt,
        },
      });
    }

    return this.prisma.conversation.findUniqueOrThrow({
      where: { id },
      include: { ticket: true },
    });
  }

  async updatePriority(id: string, priority: Priority, version: number) {
    const result = await this.prisma.conversation.updateMany({
      where: { id, version },
      data: { priority, version: { increment: 1 } },
    });

    if (result.count === 0) {
      throw new ConflictException('Data was modified by another agent. Please refresh.');
    }

    // Also update ticket priority if exists
    const conversation = await this.prisma.conversation.findUniqueOrThrow({
      where: { id },
      include: { ticket: true },
    });
    if (conversation?.ticket) {
      await this.prisma.ticket.update({
        where: { id: conversation.ticket.id },
        data: { priority },
      });
    }

    return conversation;
  }

  async updateAssignment(id: string, assignedAgentId: string | null, version: number) {
    const result = await this.prisma.conversation.updateMany({
      where: { id, version },
      data: {
        assignedAgentId,
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      throw new ConflictException('Data was modified by another agent. Please refresh.');
    }

    const conversation = await this.prisma.conversation.findUniqueOrThrow({
      where: { id },
      include: { ticket: true },
    });

    if (conversation?.ticket) {
      await this.prisma.ticket.update({
        where: { id: conversation.ticket.id },
        data: {
          status: TicketStatus.ASSIGNED,
          assignedAgentId,
        },
      });
    }

    return this.prisma.conversation.findUniqueOrThrow({
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
