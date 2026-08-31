import { Injectable } from '@nestjs/common';
import { ConversationStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    const [total, newTickets, inProgress, resolved, overdue] =
      await Promise.all([
        this.prisma.conversation.count(),
        this.prisma.conversation.count({
          where: { status: ConversationStatus.NEW },
        }),
        this.prisma.conversation.count({
          where: { status: ConversationStatus.IN_PROGRESS },
        }),
        this.prisma.conversation.count({
          where: { status: ConversationStatus.RESOLVED },
        }),
        this.prisma.ticket.count({
          where: {
            isOverdue: true,
            conversation: {
              status: {
                notIn: [ConversationStatus.RESOLVED, ConversationStatus.CLOSED],
              },
            },
          },
        }),
      ]);

    const channelCounts = await this.prisma.conversation.groupBy({
      by: ['channelType'],
      _count: {
        id: true,
      },
    });

    const byChannel = channelCounts.reduce(
      (acc, item) => {
        acc[item.channelType] = item._count.id;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      total,
      new: newTickets,
      inProgress,
      resolved,
      overdue,
      byChannel,
    };
  }

  async getAgentPerformance() {
    const agents = await this.prisma.user.findMany({
      where: { role: 'AGENT' },
      select: {
        id: true,
        name: true,
        email: true,
        _count: {
          select: {
            assignedConversations: {
              where: {
                status: ConversationStatus.RESOLVED,
              },
            },
          },
        },
      },
    });

    return agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      email: agent.email,
      resolvedTickets: agent._count.assignedConversations,
    }));
  }
}
