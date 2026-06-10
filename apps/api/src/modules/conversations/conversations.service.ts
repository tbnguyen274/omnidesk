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
import { PrismaService } from '../../common/database/prisma.service';
import { ListConversationsDto } from './dto/list-conversations.dto';

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

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

    const [items, total] = await this.prisma.$transaction([
      this.prisma.conversation.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { lastMessageAt: 'desc' },
        include: {
          customer: true,
          assignedAgent: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          ticket: true,
        },
      }),
      this.prisma.conversation.count({ where }),
    ]);

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
      })),
      page,
      limit,
      total,
    };
  }

  async findById(id: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        customer: true,
        assignedAgent: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
        ticket: true,
        conversationTags: {
          include: {
            tag: true,
          },
        },
      },
    });

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
      messages: conversation.messages.map((message) => ({
        id: message.id,
        direction: message.direction,
        senderType: message.senderType,
        senderId: message.senderId,
        content: message.content,
        contentType: message.contentType,
        deliveryStatus: message.deliveryStatus,
        createdAt: message.createdAt,
        sentAt: message.sentAt,
      })),
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  async updateStatus(id: string, status: ConversationStatus) {
    await this.ensureConversationExists(id);

    return this.prisma.conversation.update({
      where: { id },
      data: {
        status,
        resolvedAt:
          status === ConversationStatus.RESOLVED ? new Date() : undefined,
      },
    });
  }

  async updatePriority(id: string, priority: Priority) {
    await this.ensureConversationExists(id);

    return this.prisma.conversation.update({
      where: { id },
      data: { priority },
    });
  }

  async updateAssignment(id: string, assignedAgentId: string) {
    await this.ensureConversationExists(id);
    await this.ensureAssignableAgent(assignedAgentId);

    return this.prisma.conversation.update({
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

  private async ensureConversationExists(id: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
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
