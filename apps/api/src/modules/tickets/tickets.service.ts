import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConversationStatus, Prisma } from '@prisma/client';
import {
  REALTIME_EVENT_TYPES,
  getPaginationParams,
  createPaginatedResponse,
} from '@omnidesk/shared';
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
    const { page, limit, skip, take } = getPaginationParams(query);
    const conversationWhere: Prisma.ConversationWhereInput = {};

    if (query.status) {
      conversationWhere.status = query.status;
    }

    if (query.priority) {
      conversationWhere.priority = query.priority;
    }

    if (query.assignedAgentId) {
      conversationWhere.assignedAgentId = query.assignedAgentId;
    }

    if (query.overdue) {
      conversationWhere.status = {
        notIn: [ConversationStatus.RESOLVED, ConversationStatus.CLOSED],
      };
    }

    const where: Prisma.TicketWhereInput = {};
    if (Object.keys(conversationWhere).length > 0) {
      where.conversation = conversationWhere;
    }

    if (query.overdue) {
      where.slaDueAt = {
        lt: new Date(),
      };
    }

    const [items, total] = await this.ticketsRepository.list({
      where,
      skip,
      take,
    });

    const mappedItems = items.map((ticket) => ({
      id: ticket.id,
      status: ticket.conversation.status,
      priority: ticket.conversation.priority,
      slaDueAt: ticket.slaDueAt,
      firstResponseDueAt: ticket.firstResponseDueAt,
      resolvedAt: ticket.conversation.resolvedAt,
      assignedAgent: ticket.conversation.assignedAgent,
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
    }));

    return createPaginatedResponse(mappedItems, total, page, limit);
  }

  async findById(id: string) {
    const ticket = await this.ticketsRepository.findById(id);

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return {
      ...ticket,
      status: ticket.conversation.status,
      priority: ticket.conversation.priority,
      assignedAgent: ticket.conversation.assignedAgent,
      resolvedAt: ticket.conversation.resolvedAt,
    };
  }

  async updateStatus(id: string, status: ConversationStatus, version: number) {
    const existingTicket = await this.ensureTicketExists(id);

    await this.conversationsService.updateStatus(
      existingTicket.conversationId,
      status,
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
}
