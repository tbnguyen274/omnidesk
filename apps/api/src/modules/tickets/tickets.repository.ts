import { Injectable } from '@nestjs/common';
import { Prisma, TicketStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';

@Injectable()
export class TicketsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(params: { where: Prisma.TicketWhereInput; skip: number; take: number }) {
    return this.prisma.$transaction([
      this.prisma.ticket.findMany({
        where: params.where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
        include: {
          assignedAgent: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          conversation: {
            include: {
              customer: true,
            },
          },
        },
      }),
      this.prisma.ticket.count({ where: params.where }),
    ]);
  }

  findById(id: string) {
    return this.prisma.ticket.findUnique({
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
        conversation: {
          include: {
            customer: true,
            messages: {
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });
  }

  findExistingById(id: string) {
    return this.prisma.ticket.findUnique({
      where: { id },
      select: { id: true },
    });
  }

  updateStatus(id: string, status: TicketStatus) {
    return this.prisma.ticket.update({
      where: { id },
      data: {
        status,
        resolvedAt: status === TicketStatus.RESOLVED ? new Date() : undefined,
        closedAt: status === TicketStatus.CLOSED ? new Date() : undefined,
      },
    });
  }

  updateAssignment(id: string, assignedAgentId: string) {
    return this.prisma.ticket.update({
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
