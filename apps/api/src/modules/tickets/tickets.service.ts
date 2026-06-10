import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TicketStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { ListTicketsDto } from './dto/list-tickets.dto';

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListTicketsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.TicketWhereInput = {
      status: query.status,
      priority: query.priority,
      assignedAgentId: query.assignedAgentId,
    };

    if (query.overdue) {
      where.slaDueAt = {
        lt: new Date(),
      };
      where.status = {
        notIn: [TicketStatus.RESOLVED, TicketStatus.CLOSED],
      };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
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
      this.prisma.ticket.count({ where }),
    ]);

    return {
      items: items.map((ticket) => ({
        id: ticket.id,
        status: ticket.status,
        priority: ticket.priority,
        slaDueAt: ticket.slaDueAt,
        firstResponseDueAt: ticket.firstResponseDueAt,
        resolvedAt: ticket.resolvedAt,
        closedAt: ticket.closedAt,
        assignedAgent: ticket.assignedAgent,
        conversation: {
          id: ticket.conversation.id,
          channelType: ticket.conversation.channelType,
          subject: ticket.conversation.subject,
          status: ticket.conversation.status,
          lastMessageAt: ticket.conversation.lastMessageAt,
          customer: {
            id: ticket.conversation.customer.id,
            name: ticket.conversation.customer.name,
            email: ticket.conversation.customer.email,
            avatarUrl: ticket.conversation.customer.avatarUrl,
          },
        },
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
      })),
      page,
      limit,
      total,
    };
  }

  async findById(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
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

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return ticket;
  }

  async updateStatus(id: string, status: TicketStatus) {
    await this.ensureTicketExists(id);

    return this.prisma.ticket.update({
      where: { id },
      data: {
        status,
        resolvedAt: status === TicketStatus.RESOLVED ? new Date() : undefined,
        closedAt: status === TicketStatus.CLOSED ? new Date() : undefined,
      },
    });
  }

  async updateAssignment(id: string, assignedAgentId: string) {
    await this.ensureTicketExists(id);
    await this.ensureAssignableAgent(assignedAgentId);

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

  private async ensureTicketExists(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }
  }

  private async ensureAssignableAgent(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        role: true,
        status: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Assigned agent not found');
    }

    if (user.role !== UserRole.AGENT || user.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('Assigned user must be an active agent');
    }
  }
}
