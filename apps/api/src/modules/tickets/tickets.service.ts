import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TicketStatus, UserRole, UserStatus } from '@prisma/client';
import { ListTicketsDto } from './dto/list-tickets.dto';
import { TicketsRepository } from './tickets.repository';

@Injectable()
export class TicketsService {
  constructor(private readonly ticketsRepository: TicketsRepository) {}

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

    const [items, total] = await this.ticketsRepository.list({
      where,
      skip: (page - 1) * limit,
      take: limit,
    });

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
    const ticket = await this.ticketsRepository.findById(id);

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return ticket;
  }

  async updateStatus(id: string, status: TicketStatus) {
    await this.ensureTicketExists(id);

    return this.ticketsRepository.updateStatus(id, status);
  }

  async updateAssignment(id: string, assignedAgentId: string) {
    await this.ensureTicketExists(id);
    await this.ensureAssignableAgent(assignedAgentId);

    return this.ticketsRepository.updateAssignment(id, assignedAgentId);
  }

  private async ensureTicketExists(id: string) {
    const ticket = await this.ticketsRepository.findExistingById(id);

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }
  }

  private async ensureAssignableAgent(id: string) {
    const user = await this.ticketsRepository.findAssignableUser(id);

    if (!user) {
      throw new NotFoundException('Assigned agent not found');
    }

    if (user.role !== UserRole.AGENT || user.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('Assigned user must be an active agent');
    }
  }
}
