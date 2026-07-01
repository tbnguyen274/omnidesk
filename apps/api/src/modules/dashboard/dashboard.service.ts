import { Injectable } from '@nestjs/common';
import { TicketStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    const [total, newTickets, inProgress, resolved, overdue] =
      await Promise.all([
        this.prisma.ticket.count(),
        this.prisma.ticket.count({ where: { status: TicketStatus.NEW } }),
        this.prisma.ticket.count({
          where: { status: TicketStatus.IN_PROGRESS },
        }),
        this.prisma.ticket.count({ where: { status: TicketStatus.RESOLVED } }),
        this.prisma.ticket.count({
          where: {
            isOverdue: true,
            status: { notIn: [TicketStatus.RESOLVED, TicketStatus.CLOSED] },
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
                ticket: {
                  status: TicketStatus.RESOLVED,
                },
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
