import {
  ChannelAccount,
  ChannelAccountType,
  ChannelType,
  Conversation,
  MessageContentType,
  MessageDeliveryStatus,
  MessageDirection,
  MessageSenderType,
  Prisma,
  PrismaClient,
  Priority,
  TicketStatus,
  User,
  UserRole,
} from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function upsertUser(params: {
  email: string;
  name: string;
  role: UserRole;
}) {
  const passwordHash = await hash('password', 10);

  return prisma.user.upsert({
    where: { email: params.email },
    update: {
      name: params.name,
      role: params.role,
      status: 'ACTIVE',
    },
    create: {
      email: params.email,
      name: params.name,
      passwordHash,
      role: params.role,
      status: 'ACTIVE',
    },
  });
}

async function upsertChannelAccount(params: {
  type: ChannelAccountType;
  displayName: string;
  externalId: string;
  configJson: Prisma.InputJsonObject;
}) {
  const existing = await prisma.channelAccount.findFirst({
    where: {
      type: params.type,
      externalId: params.externalId,
    },
  });

  if (existing) {
    return prisma.channelAccount.update({
      where: { id: existing.id },
      data: {
        displayName: params.displayName,
        configJson: params.configJson,
        status: 'ACTIVE',
      },
    });
  }

  return prisma.channelAccount.create({
    data: {
      type: params.type,
      displayName: params.displayName,
      externalId: params.externalId,
      configJson: params.configJson,
      status: 'ACTIVE',
    },
  });
}

async function upsertCustomer(params: {
  name: string;
  email?: string;
  externalFacebookId?: string;
  avatarUrl?: string;
}) {
  const existing = await prisma.customer.findFirst({
    where: params.email
      ? { email: params.email }
      : { externalFacebookId: params.externalFacebookId },
  });

  if (existing) {
    return prisma.customer.update({
      where: { id: existing.id },
      data: params,
    });
  }

  return prisma.customer.create({
    data: params,
  });
}

async function upsertConversation(params: {
  channelType: ChannelType;
  channelAccount: ChannelAccount;
  customerId: string;
  externalConversationId: string;
  subject: string;
  priority: Priority;
  assignedAgentId?: string;
}) {
  const existing = await prisma.conversation.findFirst({
    where: {
      channelAccountId: params.channelAccount.id,
      externalConversationId: params.externalConversationId,
    },
  });

  if (existing) {
    return prisma.conversation.update({
      where: { id: existing.id },
      data: {
        subject: params.subject,
        priority: params.priority,
        assignedAgentId: params.assignedAgentId,
        lastMessageAt: new Date(),
      },
    });
  }

  return prisma.conversation.create({
    data: {
      channelType: params.channelType,
      channelAccountId: params.channelAccount.id,
      customerId: params.customerId,
      externalConversationId: params.externalConversationId,
      subject: params.subject,
      status: 'NEW',
      priority: params.priority,
      assignedAgentId: params.assignedAgentId,
      lastMessageAt: new Date(),
    },
  });
}

async function upsertMessage(params: {
  conversation: Conversation;
  externalMessageId: string;
  direction: MessageDirection;
  senderType: MessageSenderType;
  senderId?: string;
  content: string;
  contentType?: MessageContentType;
  deliveryStatus?: MessageDeliveryStatus;
}) {
  return prisma.message.upsert({
    where: {
      conversationId_externalMessageId: {
        conversationId: params.conversation.id,
        externalMessageId: params.externalMessageId,
      },
    },
    update: {
      content: params.content,
      deliveryStatus: params.deliveryStatus ?? 'RECEIVED',
    },
    create: {
      conversationId: params.conversation.id,
      externalMessageId: params.externalMessageId,
      direction: params.direction,
      senderType: params.senderType,
      senderId: params.senderId,
      content: params.content,
      contentType: params.contentType ?? 'TEXT',
      deliveryStatus: params.deliveryStatus ?? 'RECEIVED',
      rawPayload: {
        seed: true,
      },
    },
  });
}

async function upsertTicket(params: {
  conversation: Conversation;
  priority: Priority;
  assignedAgentId?: string;
}) {
  return prisma.ticket.upsert({
    where: { conversationId: params.conversation.id },
    update: {
      priority: params.priority,
      assignedAgentId: params.assignedAgentId,
    },
    create: {
      conversationId: params.conversation.id,
      status: TicketStatus.NEW,
      priority: params.priority,
      assignedAgentId: params.assignedAgentId,
      slaDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      firstResponseDueAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    },
  });
}

async function attachTags(conversation: Conversation, names: string[]) {
  for (const name of names) {
    const tag = await prisma.tag.upsert({
      where: { name },
      update: {},
      create: {
        name,
        color: name === 'billing' ? '#2563eb' : '#dc2626',
      },
    });

    await prisma.conversationTag.upsert({
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
}

async function seedDemoConversations(agent: User) {
  const facebookPage = await upsertChannelAccount({
    type: ChannelAccountType.FACEBOOK,
    displayName: 'OmniDesk Demo Page',
    externalId: 'demo_page_001',
    configJson: {
      mode: 'mock',
      pageId: 'demo_page_001',
    },
  });

  const supportMailbox = await upsertChannelAccount({
    type: ChannelAccountType.EMAIL,
    displayName: 'Support Mailbox',
    externalId: 'support@omnidesk.local',
    configJson: {
      mode: 'mock',
      mailbox: 'support@omnidesk.local',
    },
  });

  const facebookCustomer = await upsertCustomer({
    name: 'Nguyen Van Facebook',
    externalFacebookId: 'customer_fb_001',
    avatarUrl: 'https://example.com/avatar-facebook.png',
  });

  const commentCustomer = await upsertCustomer({
    name: 'Tran Thi Comment',
    externalFacebookId: 'customer_fb_comment_001',
    avatarUrl: 'https://example.com/avatar-comment.png',
  });

  const emailCustomer = await upsertCustomer({
    name: 'Le Van Email',
    email: 'customer@example.com',
  });

  const fbMessageConversation = await upsertConversation({
    channelType: ChannelType.FACEBOOK_MESSAGE,
    channelAccount: facebookPage,
    customerId: facebookCustomer.id,
    externalConversationId: 'fb_thread_001',
    subject: 'Facebook Messenger - Hỏi về hóa đơn',
    priority: Priority.HIGH,
    assignedAgentId: agent.id,
  });

  await upsertMessage({
    conversation: fbMessageConversation,
    externalMessageId: 'fb_msg_seed_001',
    direction: MessageDirection.INBOUND,
    senderType: MessageSenderType.CUSTOMER,
    content: 'Tôi chưa nhận được hóa đơn, hỗ trợ giúp tôi.',
  });

  await upsertTicket({
    conversation: fbMessageConversation,
    priority: Priority.HIGH,
    assignedAgentId: agent.id,
  });

  await attachTags(fbMessageConversation, ['billing', 'complaint']);

  const fbCommentConversation = await upsertConversation({
    channelType: ChannelType.FACEBOOK_COMMENT,
    channelAccount: facebookPage,
    customerId: commentCustomer.id,
    externalConversationId: 'fb_post_001:comment_001',
    subject: 'Facebook Comment - Cần phản hồi',
    priority: Priority.MEDIUM,
  });

  await upsertMessage({
    conversation: fbCommentConversation,
    externalMessageId: 'fb_comment_seed_001',
    direction: MessageDirection.INBOUND,
    senderType: MessageSenderType.CUSTOMER,
    content: 'Shop phản hồi giúp mình về đơn hàng này.',
  });

  await upsertTicket({
    conversation: fbCommentConversation,
    priority: Priority.MEDIUM,
  });

  const emailConversation = await upsertConversation({
    channelType: ChannelType.EMAIL,
    channelAccount: supportMailbox,
    customerId: emailCustomer.id,
    externalConversationId: 'email_thread_001',
    subject: 'Khiếu nại: chưa nhận hóa đơn',
    priority: Priority.HIGH,
    assignedAgentId: agent.id,
  });

  await upsertMessage({
    conversation: emailConversation,
    externalMessageId: 'email_seed_001',
    direction: MessageDirection.INBOUND,
    senderType: MessageSenderType.CUSTOMER,
    content: 'Tôi đã thanh toán nhưng chưa nhận được hóa đơn.',
    contentType: MessageContentType.TEXT,
  });

  await upsertMessage({
    conversation: emailConversation,
    externalMessageId: 'email_seed_reply_001',
    direction: MessageDirection.OUTBOUND,
    senderType: MessageSenderType.AGENT,
    senderId: agent.id,
    content: 'Chào anh/chị, em đã nhận thông tin và sẽ kiểm tra hóa đơn.',
    deliveryStatus: MessageDeliveryStatus.SENT,
  });

  await upsertTicket({
    conversation: emailConversation,
    priority: Priority.HIGH,
    assignedAgentId: agent.id,
  });

  await attachTags(emailConversation, ['billing']);
}

async function main() {
  await upsertUser({
    email: 'admin@omnidesk.local',
    name: 'OmniDesk Admin',
    role: UserRole.ADMIN,
  });

  const agent = await upsertUser({
    email: 'agent@omnidesk.local',
    name: 'OmniDesk Agent',
    role: UserRole.AGENT,
  });

  await seedDemoConversations(agent);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
