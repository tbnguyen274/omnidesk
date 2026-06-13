import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TicketStatus, UserRole, UserStatus } from '@prisma/client';
import { REALTIME_EVENT_TYPES } from '@omnidesk/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { ListTicketsDto } from './dto/list-tickets.dto';
import { TicketsRepository } from './tickets.repository';

@Injectable()
export class TicketsService {
  constructor(
    private readonly ticketsRepository: TicketsRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

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
    const existingTicket = await this.ensureTicketExists(id);

    const ticket = await this.ticketsRepository.updateStatus(id, status);

    this.publishTicketUpdated(ticket.id, existingTicket.conversationId);

    return ticket;
  }

  async updateAssignment(id: string, assignedAgentId: string) {
    const existingTicket = await this.ensureTicketExists(id);
    await this.ensureAssignableAgent(assignedAgentId);

    const ticket = await this.ticketsRepository.updateAssignment(
      id,
      assignedAgentId,
    );

    this.publishTicketUpdated(ticket.id, existingTicket.conversationId);

    this.notificationsService.publishToAgent(assignedAgentId, {
      type: REALTIME_EVENT_TYPES.TICKET_UPDATED,
      ticketId: ticket.id,
      conversationId: existingTicket.conversationId,
      occurredAt: new Date().toISOString(),
    });

    return ticket;
  }

  private async ensureTicketExists(id: string) {
    const ticket = await this.ticketsRepository.findExistingById(id);

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return ticket;
  }

  private publishTicketUpdated(ticketId: string, conversationId: string) {
    this.notificationsService.publishToConversation(conversationId, {
      type: REALTIME_EVENT_TYPES.TICKET_UPDATED,
      ticketId,
      conversationId,
      occurredAt: new Date().toISOString(),
    });
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
