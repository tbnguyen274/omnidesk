import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ConversationStatus,
  Prisma,
  Priority,
  UserRole,
  UserStatus,
} from '@prisma/client';
import {
  REALTIME_EVENT_TYPES,
  getPaginationParams,
  createPaginatedResponse,
} from '@omnidesk/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { ConversationsRepository } from './conversations.repository';
import { ListConversationsDto } from './dto/list-conversations.dto';
import {
  mapConversationListItemResponse,
  mapConversationDetailResponse,
  mapMessageResponse,
} from './conversations.mapper';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly conversationsRepository: ConversationsRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

  async list(query: ListConversationsDto) {
    const { page, limit, skip, take } = getPaginationParams(query);
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
      skip,
      take,
    });

    const mappedItems = items.map(mapConversationListItemResponse);

    return createPaginatedResponse(mappedItems, total, page, limit);
  }

  async findById(id: string) {
    const conversation = await this.conversationsRepository.findById(id);

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return mapConversationDetailResponse(conversation);
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

    return messages.reverse().map(mapMessageResponse);
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

  async updateReadStatus(id: string, isRead: boolean, version: number) {
    await this.ensureConversationExists(id);

    const conversation = await this.conversationsRepository.updateReadStatus(
      id,
      isRead,
      version,
    );

    this.publishConversationUpdated(conversation.id);

    return conversation;
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

    if (user.role !== UserRole.AGENT || user.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('Assigned user must be an active agent');
    }
  }
}
