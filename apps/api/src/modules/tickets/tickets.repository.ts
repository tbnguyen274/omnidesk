import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
      select: {
        id: true,
        conversationId: true,
        conversation: {
          select: {
            version: true,
          },
        },
      },
    });
  }
}
