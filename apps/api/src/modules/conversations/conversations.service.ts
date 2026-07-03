import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConversationStatus, Prisma, Priority } from '@prisma/client';
import { REALTIME_EVENT_TYPES } from '@omnidesk/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { ConversationsRepository } from './conversations.repository';
import { ListConversationsDto } from './dto/list-conversations.dto';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly conversationsRepository: ConversationsRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

  async list(query: ListConversationsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.ConversationWhereInput = {
      channelType: query.channelType,
      status: query.status,
      assignedAgentId: query.assignedAgentId,
      priority: query.priority,
    };

    if (query.search) {
      where.OR = [
        { subject: { contains: query.search, mode: 'insensitive' } },
        {
          customer: {
            name: { contains: query.search, mode: 'insensitive' },
          },
        },
        {
          customer: {
            email: { contains: query.search, mode: 'insensitive' },
          },
        },
        {
          messages: {
            some: {
              content: { contains: query.search, mode: 'insensitive' },
            },
          },
        },
      ];
    }

    const [items, total] = await this.conversationsRepository.list({
      where,
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: items.map((conversation) => ({
        id: conversation.id,
        channelType: conversation.channelType,
        customer: {
          id: conversation.customer.id,
          name: conversation.customer.name,
          email: conversation.customer.email,
          avatarUrl: conversation.customer.avatarUrl,
        },
        subject: conversation.subject,
        status: conversation.status,
        priority: conversation.priority,
        assignedAgent: conversation.assignedAgent,
        ticket: conversation.ticket
          ? {
              id: conversation.ticket.id,
              status: conversation.ticket.status,
              priority: conversation.ticket.priority,
              slaDueAt: conversation.ticket.slaDueAt,
            }
          : null,
        lastMessage: conversation.messages[0]
          ? {
              id: conversation.messages[0].id,
              content: conversation.messages[0].content,
              direction: conversation.messages[0].direction,
              createdAt: conversation.messages[0].createdAt,
            }
          : null,
        lastMessageAt: conversation.lastMessageAt,
        version: conversation.version,
      })),
      page,
      limit,
      total,
    };
  }

  async findById(id: string) {
    const conversation = await this.conversationsRepository.findById(id);

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return {
      id: conversation.id,
      channelType: conversation.channelType,
      customer: {
        id: conversation.customer.id,
        name: conversation.customer.name,
        email: conversation.customer.email,
        avatarUrl: conversation.customer.avatarUrl,
        externalFacebookId: conversation.customer.externalFacebookId,
      },
      subject: conversation.subject,
      status: conversation.status,
      priority: conversation.priority,
      assignedAgent: conversation.assignedAgent,
      ticket: conversation.ticket,
      tags: conversation.conversationTags.map(({ tag }) => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
      })),
      messages: conversation.messages.reverse().map((message) => ({
        id: message.id,
        direction: message.direction,
        senderType: message.senderType,
        senderId: message.senderId,
        content: message.content,
        contentType: message.contentType,
        deliveryStatus: message.deliveryStatus,
        externalMessageId: message.externalMessageId,
        replyToMessageId: message.replyToMessageId,
        createdAt: message.createdAt,
        sentAt: message.sentAt,
      })),
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      version: conversation.version,
    };
  }

  async getMessages(
    conversationId: string,
    cursor: string | undefined,
    limit: number,
  ) {
    await this.conversationsRepository.findExistingById(conversationId);

    const messages = await this.conversationsRepository.getMessages(
      conversationId,
      cursor,
      limit,
    );

    return messages.reverse().map((message) => ({
      id: message.id,
      direction: message.direction,
      senderType: message.senderType,
      senderId: message.senderId,
      content: message.content,
      contentType: message.contentType,
      deliveryStatus: message.deliveryStatus,
      externalMessageId: message.externalMessageId,
      replyToMessageId: message.replyToMessageId,
      createdAt: message.createdAt,
      sentAt: message.sentAt,
    }));
  }

  async updateStatus(id: string, status: ConversationStatus, version: number) {
    await this.ensureConversationExists(id);

    const conversation = await this.conversationsRepository.updateStatus(
      id,
      status,
      version,
    );

    this.publishConversationUpdated(conversation.id);

    return conversation;
  }

  async updatePriority(id: string, priority: Priority, version: number) {
    await this.ensureConversationExists(id);

    const conversation = await this.conversationsRepository.updatePriority(
      id,
      priority,
      version,
    );

    this.publishConversationUpdated(conversation.id);

    return conversation;
  }

  async updateAssignment(
    id: string,
    assignedAgentId: string | null,
    version: number,
  ) {
    await this.ensureConversationExists(id);
    await this.ensureAssignableAgent(assignedAgentId);

    const conversation = await this.conversationsRepository.updateAssignment(
      id,
      assignedAgentId,
      version,
    );

    this.publishConversationUpdated(conversation.id);
    if (assignedAgentId) {
      this.notificationsService.publishToAgent(assignedAgentId, {
        type: REALTIME_EVENT_TYPES.CONVERSATION_UPDATED,
        conversationId: conversation.id,
        occurredAt: new Date().toISOString(),
      });
    }

    return conversation;
  }

  async addTag(id: string, tagId: string) {
    await this.ensureConversationExists(id);

    await this.conversationsRepository.addTag(id, tagId);
    this.publishConversationUpdated(id);

    return { success: true };
  }

  async removeTag(id: string, tagId: string) {
    await this.ensureConversationExists(id);

    await this.conversationsRepository.removeTag(id, tagId);
    this.publishConversationUpdated(id);

    return { success: true };
  }

  private publishConversationUpdated(conversationId: string) {
    this.notificationsService.publishToConversation(conversationId, {
      type: REALTIME_EVENT_TYPES.CONVERSATION_UPDATED,
      conversationId,
      occurredAt: new Date().toISOString(),
    });
  }

  private async ensureConversationExists(id: string) {
    const conversation =
      await this.conversationsRepository.findExistingById(id);

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
  }

  private async ensureAssignableAgent(id: string | null) {
    if (!id) return;

    const user = await this.conversationsRepository.findAssignableUser(id);

    if (!user) {
      throw new NotFoundException('Assigned agent not found');
    }

    if (user.status !== 'ACTIVE') {
      throw new BadRequestException('Assigned user must be active');
    }
  }
}
