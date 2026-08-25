import { REALTIME_EVENT_TYPES, type RealtimeEvent } from "@omnidesk/shared";
import { ApiError } from "@/lib/api-client";
import type {
  ConversationDetail,
  CreateOutboundMessagePayload,
  OutboundAttachmentItem,
} from "@/lib/api-types";

export function shouldRefreshConversationList(event: RealtimeEvent) {
  return (
    event.type === REALTIME_EVENT_TYPES.CONVERSATION_CREATED ||
    event.type === REALTIME_EVENT_TYPES.CONVERSATION_UPDATED ||
    event.type === REALTIME_EVENT_TYPES.MESSAGE_CREATED ||
    event.type === REALTIME_EVENT_TYPES.TICKET_UPDATED ||
    event.type === REALTIME_EVENT_TYPES.OUTBOUND_MESSAGE_UPDATED ||
    event.type === REALTIME_EVENT_TYPES.SLA_OVERDUE
  );
}

export function normalizeConversationDetail(
  conversation: ConversationDetail,
): ConversationDetail {
  return {
    ...conversation,
    messages: dedupeById(conversation.messages),
  };
}

export function dedupeById<T extends { id: string }>(items: T[]) {
  const byId = new Map<string, T>();

  for (const item of items) {
    byId.set(item.id, item);
  }

  return Array.from(byId.values());
}

export function createOutboundMessagePayload(
  conversation: ConversationDetail,
  content: string,
  replyToExternalId?: string | null,
  attachmentUrls?: string[],
  attachments?: OutboundAttachmentItem[],
): CreateOutboundMessagePayload {
  const disabledReason = getReplyDisabledReason(conversation);

  if (disabledReason) {
    throw new Error(disabledReason);
  }

  return {
    conversationId: conversation.id,
    replyToMessageId: replyToExternalId ?? undefined,
    content,
    attachmentUrls: attachmentUrls && attachmentUrls.length > 0 ? attachmentUrls : undefined,
    attachments: attachments && attachments.length > 0 ? attachments : undefined,
  };
}

export function getReplyDisabledReason(conversation: ConversationDetail) {
  if (conversation.channelType === "EMAIL" && !conversation.customer.email) {
    return "Customer email is missing.";
  }

  if (
    conversation.channelType === "FACEBOOK_MESSAGE" &&
    !conversation.customer.externalFacebookId
  ) {
    return "Customer Facebook id is missing.";
  }

  return null;
}

export function getInboxErrorMessage(caught: unknown) {
  if (caught instanceof ApiError || caught instanceof Error) {
    return caught.message;
  }

  return "Unexpected error";
}
