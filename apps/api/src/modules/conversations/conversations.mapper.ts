import { Message, ConversationStatus, Attachment } from '@prisma/client';
import { ConversationsRepository } from './conversations.repository';

type MessageWithAttachments = Message & {
  attachments?: Attachment[];
};

type ConversationWithDetails = NonNullable<
  Awaited<ReturnType<ConversationsRepository['findById']>>
>;

type ConversationListItem = NonNullable<
  Awaited<ReturnType<ConversationsRepository['list']>>[0][number]
>;

function mapMessageResponse(message: MessageWithAttachments) {
  return {
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
    attachments:
      message.attachments?.map((att) => ({
        id: att.id,
        url: att.url,
        fileName: att.fileName,
        mimeType: att.mimeType,
        sizeBytes: att.sizeBytes,
      })) ?? [],
  };
}

function mapConversationDetailResponse(conversation: ConversationWithDetails) {
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
    ticket: conversation.ticket
      ? {
          id: conversation.ticket.id,
          status: conversation.status,
          priority: conversation.priority,
          assignedAgentId: conversation.assignedAgentId,
          slaDueAt: conversation.ticket.slaDueAt,
          firstResponseDueAt: conversation.ticket.firstResponseDueAt,
          slaPausedAt: conversation.ticket.slaPausedAt,
          isOverdue: conversation.ticket.isOverdue,
          resolvedAt: conversation.resolvedAt,
          closedAt:
            conversation.status === ConversationStatus.CLOSED
              ? conversation.updatedAt
              : null,
          createdAt: conversation.ticket.createdAt,
          updatedAt: conversation.ticket.updatedAt,
        }
      : null,
    tags: conversation.conversationTags.map(({ tag }) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
    })),
    messages: conversation.messages.reverse().map(mapMessageResponse),
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    version: conversation.version,
    isRead: conversation.isRead,
  };
}

function mapConversationListItemResponse(conversation: ConversationListItem) {
  return {
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
          status: conversation.status,
          priority: conversation.priority,
          slaDueAt: conversation.ticket.slaDueAt,
          firstResponseDueAt: conversation.ticket.firstResponseDueAt,
          isOverdue: conversation.ticket.isOverdue,
        }
      : null,
    lastMessage: conversation.messages[0]
      ? {
          id: conversation.messages[0].id,
          content: conversation.messages[0].content,
          contentType: conversation.messages[0].contentType,
          direction: conversation.messages[0].direction,
          createdAt: conversation.messages[0].createdAt,
        }
      : null,
    lastMessageAt: conversation.lastMessageAt,
    version: conversation.version,
    isRead: conversation.isRead,
  };
}

export {
  mapConversationDetailResponse,
  mapConversationListItemResponse,
  mapMessageResponse,
};
