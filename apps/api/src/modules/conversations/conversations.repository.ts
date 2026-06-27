import { Injectable } from '@nestjs/common';
import { ConversationStatus, Prisma, Priority, TicketStatus } from '@prisma/client';
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

  async updateStatus(id: string, status: ConversationStatus) {
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
    } else if (!isWaitingCustomer && conversation.ticket?.slaPausedAt && conversation.ticket?.slaDueAt) {
      // Unpause SLA: calculate how long it was paused and add it to the due date
      const pauseDurationMs = now.getTime() - conversation.ticket.slaPausedAt.getTime();
      newSlaDueAt = new Date(conversation.ticket.slaDueAt.getTime() + pauseDurationMs);
      newSlaPausedAt = null;
    }

    return this.prisma.conversation.update({
      where: { id },
      data: {
        status,
        resolvedAt: isResolved ? now : undefined,
        ticket: {
          update: {
            status: status as unknown as TicketStatus,
            resolvedAt: isResolved ? now : undefined,
            slaDueAt: newSlaDueAt,
            slaPausedAt: newSlaPausedAt,
          },
        },
      },
    });
  }

  updatePriority(id: string, priority: Priority) {
    return this.prisma.conversation.update({
      where: { id },
      data: { priority },
    });
  }

  updateAssignment(id: string, assignedAgentId: string) {
    return this.prisma.conversation.update({
      where: { id },
      data: {
        assignedAgentId,
        ticket: {
          update: {
            status: TicketStatus.ASSIGNED,
            assignedAgentId,
          },
        },
      },
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
}
