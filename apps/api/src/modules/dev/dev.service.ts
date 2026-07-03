import { Injectable } from '@nestjs/common';
import {
  ChannelAccountType,
  ChannelType,
  MessageContentType,
  MessageDeliveryStatus,
  MessageDirection,
  MessageSenderType,
  Prisma,
  Priority,
  TicketStatus,
  UserRole,
} from '@prisma/client';
import { calculateSlaDueAt, encrypt } from '@omnidesk/shared';
import { hash } from 'bcryptjs';
import { PrismaService } from '../../common/database/prisma.service';
import { providerConfig } from '../../config/provider.config';

@Injectable()
export class DevService {
  constructor(private readonly prisma: PrismaService) {}

  getProvidersHealth() {
    return {
      email: {
        providerMode: providerConfig.email.providerMode,
        inboundMode: providerConfig.email.inboundMode,
        outboundMode: providerConfig.email.outboundMode,
        smtpConfigured: Boolean(
          providerConfig.email.smtp.host &&
          providerConfig.email.smtp.user &&
          providerConfig.email.smtp.password,
        ),
        imapConfigured: Boolean(
          providerConfig.email.imap.host &&
          providerConfig.email.imap.user &&
          providerConfig.email.imap.password,
        ),
      },
      facebook: {
        providerMode: providerConfig.facebook.providerMode,
        appConfigured: Boolean(
          providerConfig.facebook.appId && providerConfig.facebook.appSecret,
        ),
        pageConfigured: Boolean(
          providerConfig.facebook.pageId &&
          providerConfig.facebook.pageAccessToken,
        ),
        signatureRequired: providerConfig.facebook.webhookSignatureRequired,
      },
    };
  }

  async resetDemoData() {
    await this.prisma.$transaction([
      this.prisma.auditLog.deleteMany(),
      this.prisma.conversationTag.deleteMany(),
      this.prisma.outboundMessage.deleteMany(),
      this.prisma.emailSyncLog.deleteMany(),
      this.prisma.message.deleteMany(),
      this.prisma.ticket.deleteMany(),
      this.prisma.inboundEvent.deleteMany(),
      this.prisma.conversation.deleteMany(),
      this.prisma.customer.deleteMany(),
      this.prisma.channelAccount.deleteMany(),
      this.prisma.tag.deleteMany(),
    ]);

    return {
      reset: true,
    };
  }

  async seedDemoData() {
    const passwordHash = await hash('password', 10);

    await this.prisma.user.upsert({
      where: { email: 'admin@omnidesk.local' },
      update: {
        name: 'OmniDesk Admin',
        role: UserRole.ADMIN,
        status: 'ACTIVE',
      },
      create: {
        email: 'admin@omnidesk.local',
        name: 'OmniDesk Admin',
        passwordHash,
        role: UserRole.ADMIN,
        status: 'ACTIVE',
      },
    });

    const agent = await this.prisma.user.upsert({
      where: { email: 'agent@omnidesk.local' },
      update: {
        name: 'OmniDesk Agent',
        role: UserRole.AGENT,
        status: 'ACTIVE',
      },
      create: {
        email: 'agent@omnidesk.local',
        name: 'OmniDesk Agent',
        passwordHash,
        role: UserRole.AGENT,
        status: 'ACTIVE',
      },
    });

    const facebookPage = await this.upsertChannelAccount({
      type: ChannelAccountType.FACEBOOK,
      displayName: 'OmniDesk Demo Page',
      externalId: 'demo_page_001',
      accessTokenPlain: 'mock-facebook-page-token-123456789',
      configJson: {
        mode: 'mock',
        pageId: 'demo_page_001',
      },
    });

    const supportMailbox = await this.upsertChannelAccount({
      type: ChannelAccountType.EMAIL,
      displayName: 'Support Mailbox',
      externalId: 'support@omnidesk.local',
      accessTokenPlain: 'mock-email-app-password-98765',
      configJson: {
        mode: 'mock',
        mailbox: 'support@omnidesk.local',
      },
    });

    const facebookCustomer = await this.upsertCustomer({
      name: 'Nguyen Van Facebook',
      externalFacebookId: 'customer_fb_001',
      avatarUrl: 'https://example.com/avatar-facebook.png',
    });
    const commentCustomer = await this.upsertCustomer({
      name: 'Tran Thi Comment',
      externalFacebookId: 'customer_fb_comment_001',
      avatarUrl: 'https://example.com/avatar-comment.png',
    });
    const emailCustomer = await this.upsertCustomer({
      name: 'Le Van Email',
      email: 'customer@example.com',
    });

    await this.createConversationWithMessage({
      channelType: ChannelType.FACEBOOK_MESSAGE,
      channelAccountId: facebookPage.id,
      customerId: facebookCustomer.id,
      externalConversationId: 'fb_thread_001',
      subject: 'Facebook Messenger - Hỏi về hóa đơn',
      priority: Priority.HIGH,
      assignedAgentId: agent.id,
      externalMessageId: 'fb_msg_seed_001',
      content: 'Tôi chưa nhận được hóa đơn, hỗ trợ giúp tôi.',
      tags: ['billing', 'complaint'],
    });

    await this.createConversationWithMessage({
      channelType: ChannelType.FACEBOOK_COMMENT,
      channelAccountId: facebookPage.id,
      customerId: commentCustomer.id,
      externalConversationId: 'fb_post_001:comment_001',
      subject: 'Facebook Comment - Cần phản hồi',
      priority: Priority.MEDIUM,
      externalMessageId: 'fb_comment_seed_001',
      content: 'Shop phản hồi giúp mình về đơn hàng này.',
      tags: ['complaint'],
    });

    const emailConversation = await this.createConversationWithMessage({
      channelType: ChannelType.EMAIL,
      channelAccountId: supportMailbox.id,
      customerId: emailCustomer.id,
      externalConversationId: 'email_thread_001',
      subject: 'Khiếu nại: chưa nhận hóa đơn',
      priority: Priority.HIGH,
      assignedAgentId: agent.id,
      externalMessageId: 'email_seed_001',
      content: 'Tôi đã thanh toán nhưng chưa nhận được hóa đơn.',
      tags: ['billing'],
    });

    await this.prisma.message.upsert({
      where: {
        conversationId_externalMessageId: {
          conversationId: emailConversation.id,
          externalMessageId: 'email_seed_reply_001',
        },
      },
      update: {
        content: 'Chào anh/chị, em đã nhận thông tin và sẽ kiểm tra hóa đơn.',
      },
      create: {
        conversationId: emailConversation.id,
        externalMessageId: 'email_seed_reply_001',
        direction: MessageDirection.OUTBOUND,
        senderType: MessageSenderType.AGENT,
        senderId: agent.id,
        content: 'Chào anh/chị, em đã nhận thông tin và sẽ kiểm tra hóa đơn.',
        contentType: MessageContentType.TEXT,
        deliveryStatus: MessageDeliveryStatus.SENT,
        rawPayload: {
          seed: true,
        },
      },
    });

    await this.createConversationWithMessage({
      channelType: ChannelType.EMAIL,
      channelAccountId: supportMailbox.id,
      customerId: emailCustomer.id,
      externalConversationId: 'email_thread_resolved_001',
      subject: 'Hỗ trợ đổi trả hàng',
      priority: Priority.LOW,
      assignedAgentId: agent.id,
      externalMessageId: 'email_seed_resolved_001',
      content: 'Tôi muốn đổi trả sản phẩm do bị lỗi.',
      tags: ['return'],
      status: TicketStatus.RESOLVED,
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
    });

    await this.createConversationWithMessage({
      channelType: ChannelType.FACEBOOK_MESSAGE,
      channelAccountId: facebookPage.id,
      customerId: facebookCustomer.id,
      externalConversationId: 'fb_thread_overdue_001',
      subject: 'Phản ánh chất lượng dịch vụ',
      priority: Priority.URGENT,
      externalMessageId: 'fb_msg_seed_overdue_001',
      content: 'Dịch vụ của bên bạn quá tệ, tôi cần hỗ trợ gấp.',
      tags: ['complaint'],
      status: TicketStatus.NEW,
      isOverdue: true,
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    });

    await this.createConversationWithMessage({
      channelType: ChannelType.FACEBOOK_MESSAGE,
      channelAccountId: facebookPage.id,
      customerId: commentCustomer.id,
      externalConversationId: 'fb_thread_waiting_001',
      subject: 'Yêu cầu cung cấp thêm thông tin',
      priority: Priority.MEDIUM,
      assignedAgentId: agent.id,
      externalMessageId: 'fb_msg_seed_waiting_001',
      content: 'Bạn cho mình xin thêm ảnh sản phẩm bị lỗi nhé.',
      tags: ['return'],
      status: TicketStatus.WAITING_CUSTOMER,
      slaPausedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Paused 1 day ago
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // Created 2 days ago
    });

    await this.createConversationWithMessage({
      channelType: ChannelType.EMAIL,
      channelAccountId: supportMailbox.id,
      customerId: emailCustomer.id,
      externalConversationId: 'email_thread_autoclose_001',
      subject: 'Thắc mắc về bảo hành',
      priority: Priority.MEDIUM,
      assignedAgentId: agent.id,
      externalMessageId: 'email_seed_autoclose_001',
      content: 'Cho mình hỏi thời gian bảo hành là bao lâu?',
      tags: ['info'],
      status: TicketStatus.RESOLVED,
      resolvedAt: new Date(Date.now() - 3.1 * 24 * 60 * 60 * 1000), // Resolved 3.1 days ago
      createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), // Created 4 days ago
    });

    return {
      seeded: true,
    };
  }

  private async upsertChannelAccount(params: {
    type: ChannelAccountType;
    displayName: string;
    externalId: string;
    accessTokenPlain?: string;
    configJson: Prisma.InputJsonObject;
  }) {
    const existing = await this.prisma.channelAccount.findFirst({
      where: {
        type: params.type,
        externalId: params.externalId,
      },
    });

    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY is required to seed channel accounts');
    }

    const accessTokenEncrypted = params.accessTokenPlain
      ? encrypt(params.accessTokenPlain, encryptionKey)
      : null;

    if (existing) {
      return this.prisma.channelAccount.update({
        where: { id: existing.id },
        data: {
          displayName: params.displayName,
          configJson: params.configJson,
          accessTokenEncrypted:
            accessTokenEncrypted ?? existing.accessTokenEncrypted,
          status: 'ACTIVE',
        },
      });
    }

    return this.prisma.channelAccount.create({
      data: {
        type: params.type,
        displayName: params.displayName,
        externalId: params.externalId,
        accessTokenEncrypted,
        configJson: params.configJson,
        status: 'ACTIVE',
      },
    });
  }

  private async upsertCustomer(params: {
    name: string;
    email?: string;
    externalFacebookId?: string;
    avatarUrl?: string;
  }) {
    const existing = await this.prisma.customer.findFirst({
      where: params.email
        ? { email: params.email }
        : { externalFacebookId: params.externalFacebookId },
    });

    if (existing) {
      return this.prisma.customer.update({
        where: { id: existing.id },
        data: params,
      });
    }

    return this.prisma.customer.create({
      data: params,
    });
  }

  private async createConversationWithMessage(params: {
    channelType: ChannelType;
    channelAccountId: string;
    customerId: string;
    externalConversationId: string;
    subject: string;
    priority: Priority;
    assignedAgentId?: string;
    externalMessageId: string;
    content: string;
    tags: string[];
    isOverdue?: boolean;
    status?: TicketStatus;
    createdAt?: Date;
    resolvedAt?: Date;
    slaPausedAt?: Date;
  }) {
    const creationTime = params.createdAt ?? new Date();
    const existing = await this.prisma.conversation.findFirst({
      where: {
        channelAccountId: params.channelAccountId,
        externalConversationId: params.externalConversationId,
      },
    });

    const conversation = existing
      ? await this.prisma.conversation.update({
          where: { id: existing.id },
          data: {
            subject: params.subject,
            priority: params.priority,
            assignedAgentId: params.assignedAgentId,
            lastMessageAt: new Date(),
            resolvedAt: params.resolvedAt,
          },
        })
      : await this.prisma.conversation.create({
          data: {
            channelType: params.channelType,
            channelAccountId: params.channelAccountId,
            customerId: params.customerId,
            externalConversationId: params.externalConversationId,
            subject: params.subject,
            status:
              params.status === TicketStatus.RESOLVED
                ? 'RESOLVED'
                : params.status === TicketStatus.CLOSED
                  ? 'CLOSED'
                  : 'NEW',
            priority: params.priority,
            assignedAgentId: params.assignedAgentId,
            lastMessageAt: new Date(),
            resolvedAt: params.resolvedAt,
          },
        });

    await this.prisma.message.upsert({
      where: {
        conversationId_externalMessageId: {
          conversationId: conversation.id,
          externalMessageId: params.externalMessageId,
        },
      },
      update: {
        content: params.content,
      },
      create: {
        conversationId: conversation.id,
        externalMessageId: params.externalMessageId,
        direction: MessageDirection.INBOUND,
        senderType: MessageSenderType.CUSTOMER,
        content: params.content,
        contentType: MessageContentType.TEXT,
        deliveryStatus: MessageDeliveryStatus.RECEIVED,
        rawPayload: {
          seed: true,
        },
      },
    });

    await this.prisma.ticket.upsert({
      where: { conversationId: conversation.id },
      update: {
        priority: params.priority,
        assignedAgentId: params.assignedAgentId,
        status: params.status ?? TicketStatus.NEW,
        isOverdue: params.isOverdue ?? false,
        resolvedAt: params.resolvedAt,
        slaPausedAt: params.slaPausedAt,
      },
      create: {
        conversationId: conversation.id,
        status: params.status ?? TicketStatus.NEW,
        priority: params.priority,
        assignedAgentId: params.assignedAgentId,
        slaDueAt: calculateSlaDueAt(params.priority, creationTime),
        isOverdue: params.isOverdue ?? false,
        resolvedAt: params.resolvedAt,
        slaPausedAt: params.slaPausedAt,
      },
    });

    for (const tagName of params.tags) {
      const tag = await this.prisma.tag.upsert({
        where: { name: tagName },
        update: {},
        create: {
          name: tagName,
          color: tagName === 'billing' ? '#2563eb' : '#dc2626',
        },
      });

      await this.prisma.conversationTag.upsert({
        where: {
          conversationId_tagId: {
            conversationId: conversation.id,
            tagId: tag.id,
          },
        },
        update: {},
        create: {
          conversationId: conversation.id,
          tagId: tag.id,
        },
      });
    }

    return conversation;
  }
}
