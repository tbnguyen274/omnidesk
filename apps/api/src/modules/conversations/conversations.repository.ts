import { Injectable } from '@nestjs/common';
import { ConversationStatus, Prisma, Priority } from '@prisma/client';
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

  updateStatus(id: string, status: ConversationStatus) {
    return this.prisma.conversation.update({
      where: { id },
      data: {
        status,
        resolvedAt:
          status === ConversationStatus.RESOLVED ? new Date() : undefined,
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
      data: { assignedAgentId },
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
