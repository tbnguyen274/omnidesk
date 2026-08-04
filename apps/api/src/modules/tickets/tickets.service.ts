import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConversationStatus, Prisma, TicketStatus } from '@prisma/client';
import { REALTIME_EVENT_TYPES } from '@omnidesk/shared';
import { ConversationsService } from '../conversations/conversations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ListTicketsDto } from './dto/list-tickets.dto';
import { TicketsRepository } from './tickets.repository';

@Injectable()
export class TicketsService {
  constructor(
    private readonly ticketsRepository: TicketsRepository,
    private readonly notificationsService: NotificationsService,
    private readonly conversationsService: ConversationsService,
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
          version: ticket.conversation.version,
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

  async updateStatus(id: string, status: TicketStatus, version: number) {
    const existingTicket = await this.ensureTicketExists(id);
    const conversationStatus = this.toConversationStatus(status);

    await this.conversationsService.updateStatus(
      existingTicket.conversationId,
      conversationStatus,
      version,
    );
    const ticket = await this.findById(id);

    this.publishTicketUpdated(ticket.id, existingTicket.conversationId);

    return ticket;
  }

  async updateAssignment(id: string, assignedAgentId: string, version: number) {
    const existingTicket = await this.ensureTicketExists(id);

    await this.conversationsService.updateAssignment(
      existingTicket.conversationId,
      assignedAgentId,
      version,
    );
    const ticket = await this.findById(id);

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

  private toConversationStatus(status: TicketStatus): ConversationStatus {
    if (status === TicketStatus.ASSIGNED) {
      throw new BadRequestException(
        'Use the assignment endpoint to move a ticket to ASSIGNED',
      );
    }

    const statusMap: Record<
      Exclude<TicketStatus, typeof TicketStatus.ASSIGNED>,
      ConversationStatus
    > = {
      [TicketStatus.NEW]: ConversationStatus.NEW,
      [TicketStatus.IN_PROGRESS]: ConversationStatus.IN_PROGRESS,
      [TicketStatus.WAITING_CUSTOMER]: ConversationStatus.WAITING_CUSTOMER,
      [TicketStatus.RESOLVED]: ConversationStatus.RESOLVED,
      [TicketStatus.CLOSED]: ConversationStatus.CLOSED,
    };

    return statusMap[status];
  }
}
