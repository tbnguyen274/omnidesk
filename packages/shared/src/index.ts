export const CHANNEL_PROVIDERS = ['FACEBOOK', 'EMAIL'] as const;
export type ChannelProvider = (typeof CHANNEL_PROVIDERS)[number];

export const CHANNEL_TYPES = [
  'FACEBOOK_MESSAGE',
  'FACEBOOK_COMMENT',
  'EMAIL',
] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const CONVERSATION_STATUSES = [
  'NEW',
  'IN_PROGRESS',
  'WAITING_CUSTOMER',
  'RESOLVED',
  'CLOSED',
] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const TICKET_STATUSES = [
  'NEW',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_CUSTOMER',
  'RESOLVED',
  'CLOSED',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const MESSAGE_DIRECTIONS = ['INBOUND', 'OUTBOUND'] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

export const MESSAGE_CONTENT_TYPES = [
  'TEXT',
  'HTML',
  'ATTACHMENT',
  'SYSTEM',
] as const;
export type MessageContentType = (typeof MESSAGE_CONTENT_TYPES)[number];

export const EVENT_NAMES = {
  CHANNEL_MESSAGE_RECEIVED: 'channel.message.received',
  MESSAGE_NORMALIZED: 'message.normalized',
  CONVERSATION_CREATED: 'conversation.created',
  CONVERSATION_UPDATED: 'conversation.updated',
  TICKET_CREATED: 'ticket.created',
  TICKET_UPDATED: 'ticket.updated',
  REPLY_REQUESTED: 'reply.requested',
  REPLY_SENT: 'reply.sent',
  REPLY_FAILED: 'reply.failed',
  SLA_NEAR_DUE: 'sla.near_due',
  SLA_OVERDUE: 'sla.overdue',
} as const;
export type EventName = (typeof EVENT_NAMES)[keyof typeof EVENT_NAMES];

export const REALTIME_EVENT_TYPES = {
  CONVERSATION_CREATED: 'conversation.created',
  CONVERSATION_UPDATED: 'conversation.updated',
  MESSAGE_CREATED: 'message.created',
  TICKET_UPDATED: 'ticket.updated',
  OUTBOUND_MESSAGE_UPDATED: 'outbound_message.updated',
  SLA_OVERDUE: 'sla.overdue',
} as const;
export type RealtimeEventType =
  (typeof REALTIME_EVENT_TYPES)[keyof typeof REALTIME_EVENT_TYPES];

export const OUTBOUND_MESSAGE_STATUSES = [
  'PENDING',
  'SENDING',
  'SENT',
  'FAILED',
  'RETRYING',
] as const;
export type OutboundMessageStatus =
  (typeof OUTBOUND_MESSAGE_STATUSES)[number];

export type RealtimeRoom =
  | `agent:${string}`
  | `conversation:${string}`
  | `team:${string}`
  | `tenant:${string}`
  | `supervisor:${string}`;

export type BaseRealtimeEvent<TType extends RealtimeEventType> = {
  type: TType;
  occurredAt: string;
};

export type ConversationRealtimeEvent = BaseRealtimeEvent<
  | typeof REALTIME_EVENT_TYPES.CONVERSATION_CREATED
  | typeof REALTIME_EVENT_TYPES.CONVERSATION_UPDATED
> & {
  conversationId: string;
};

export type MessageCreatedRealtimeEvent = BaseRealtimeEvent<
  typeof REALTIME_EVENT_TYPES.MESSAGE_CREATED
> & {
  conversationId: string;
  messageId: string;
};

export type TicketUpdatedRealtimeEvent = BaseRealtimeEvent<
  typeof REALTIME_EVENT_TYPES.TICKET_UPDATED
> & {
  ticketId: string;
  conversationId: string;
};

export type OutboundMessageUpdatedRealtimeEvent = BaseRealtimeEvent<
  typeof REALTIME_EVENT_TYPES.OUTBOUND_MESSAGE_UPDATED
> & {
  outboundMessageId: string;
  conversationId: string;
  status: OutboundMessageStatus;
};

export type SlaOverdueRealtimeEvent = BaseRealtimeEvent<
  typeof REALTIME_EVENT_TYPES.SLA_OVERDUE
> & {
  ticketId: string;
  conversationId: string;
};

export type RealtimeEvent =
  | ConversationRealtimeEvent
  | MessageCreatedRealtimeEvent
  | TicketUpdatedRealtimeEvent
  | OutboundMessageUpdatedRealtimeEvent
  | SlaOverdueRealtimeEvent;

export const QUEUE_NAMES = {
  INBOUND_EVENTS: 'inbound-events',
  OUTBOUND_MESSAGES: 'outbound-messages',
  EMAIL_SYNC: 'email-sync',
  SLA_CHECK: 'sla-check',
  ANALYTICS_AGGREGATION: 'analytics-aggregation',
  AUTO_CLOSE: 'auto-close',
} as const;
export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export type EventEnvelope<TPayload> = {
  eventId: string;
  eventName: EventName | string;
  eventVersion: number;
  occurredAt: string;
  source: string;
  correlationId?: string;
  causationId?: string;
  payload: TPayload;
};

export type InboundEventJobPayload = {
  inboundEventId: string;
  dedupKey: string;
  provider: ChannelProvider;
  eventType: 'MESSAGE' | 'COMMENT' | 'EMAIL_RECEIVED';
};

export type OutboundMessageJobPayload = {
  outboundMessageId: string;
  conversationId: string;
  provider: ChannelProvider;
};

export type EmailSyncJobPayload = {
  channelAccountId?: string;
  syncLogId?: string;
  requestedBy?: string;
};

export type SlaCheckJobPayload = {
  requestedAt: string;
};

export type AnalyticsAggregationJobPayload = {
  requestedAt: string;
};

export type AutoCloseJobPayload = {
  requestedAt: string;
};

export type QueuePayloadByName = {
  [QUEUE_NAMES.INBOUND_EVENTS]: InboundEventJobPayload;
  [QUEUE_NAMES.OUTBOUND_MESSAGES]: OutboundMessageJobPayload;
  [QUEUE_NAMES.EMAIL_SYNC]: EmailSyncJobPayload;
  [QUEUE_NAMES.SLA_CHECK]: SlaCheckJobPayload;
  [QUEUE_NAMES.ANALYTICS_AGGREGATION]: AnalyticsAggregationJobPayload;
  [QUEUE_NAMES.AUTO_CLOSE]: AutoCloseJobPayload;
};

export type MockInboundEmailPayload = {
  mailbox: string;
  messageId: string;
  fromEmail: string;
  fromName?: string;
  toEmail?: string;
  subject: string;
  text?: string;
  html?: string;
  contentType?: Extract<MessageContentType, 'TEXT' | 'HTML'>;
  receivedAt?: string;
  threadId?: string;
  inReplyTo?: string;
  channelAccountId?: string;
};

export type NormalizedEmailMessage = {
  provider: Extract<ChannelProvider, 'EMAIL'>;
  channelType: Extract<ChannelType, 'EMAIL'>;
  externalMessageId: string;
  externalConversationId: string;
  customer: {
    name?: string;
    email: string;
  };
  message: {
    subject: string;
    content: string;
    contentType: Extract<MessageContentType, 'TEXT' | 'HTML'>;
    receivedAt: string;
  };
  source: {
    mailbox: string;
    channelAccountId?: string;
    toEmail?: string;
    threadId?: string;
    inReplyTo?: string;
  };
  rawPayload: MockInboundEmailPayload;
  dedupKey: string;
};

// FACEBOOK_MESSAGE:{pageId}:{messageId}
export type FacebookMessageDedupKey =
  `FACEBOOK_MESSAGE:${string}:${string}`;

// FACEBOOK_COMMENT:{pageId}:{commentId}
export type FacebookCommentDedupKey =
  `FACEBOOK_COMMENT:${string}:${string}`;

// FACEBOOK_MESSAGE:{pageId}:{senderId}
export type FacebookMessageConversationId = `FB_MSG:${string}:${string}`;

// FACEBOOK_COMMENT:{pageId}:{postId}:{commentId}
export type FacebookCommentConversationId =
  `FB_COMMENT:${string}:${string}:${string}`;

export type MockFacebookMessagePayload = {
  pageId: string;
  senderId: string;
  senderName?: string;
  messageId: string;
  text: string;
  sentAt?: string;
  threadId?: string;
  channelAccountId?: string;
};

export type MockFacebookCommentPayload = {
  pageId: string;
  postId: string;
  commentId: string;
  commenterId: string;
  commenterName?: string;
  text: string;
  sentAt?: string;
  parentCommentId?: string;
  channelAccountId?: string;
  postUrl?: string;
};

export type NormalizedFacebookMessage = {
  provider: Extract<ChannelProvider, 'FACEBOOK'>;
  channelType: Extract<
    ChannelType,
    'FACEBOOK_MESSAGE' | 'FACEBOOK_COMMENT'
  >;
  externalMessageId: string;
  externalConversationId:
    | FacebookMessageConversationId
    | FacebookCommentConversationId;
  customer: {
    externalId: string;
    name?: string;
  };
  message: {
    content: string;
    contentType: Extract<MessageContentType, 'TEXT'>;
    receivedAt: string;
  };
  source: {
    pageId: string;
    channelAccountId?: string;
    threadId?: string;
    postId?: string;
    commentId?: string;
    parentCommentId?: string;
    postUrl?: string;
  };
  rawPayload: MockFacebookMessagePayload | MockFacebookCommentPayload;
  dedupKey: FacebookMessageDedupKey | FacebookCommentDedupKey;
};

export type NormalizedMessage = {
  provider: ChannelProvider;
  channelType: ChannelType;
  externalEventId?: string;
  externalMessageId: string;
  externalConversationId?: string;
  customer: {
    externalId?: string;
    name?: string;
    email?: string;
    avatarUrl?: string;
  };
  message: {
    content: string;
    contentType: Extract<MessageContentType, 'TEXT' | 'HTML'>;
    receivedAt: string;
  };
  source: {
    channelAccountId?: string;
    pageId?: string;
    mailbox?: string;
    postId?: string;
    commentId?: string;
  };
  rawPayload: unknown;
  dedupKey: string;
};

export type HealthStatus = 'ok' | 'error';

export type PriorityLevel = 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';

export function calculateSlaDueAt(priority: PriorityLevel | string, createdAt: Date = new Date()): Date {
  const hours = getSlaHours(priority as PriorityLevel);
  return new Date(createdAt.getTime() + hours * 60 * 60 * 1000);
}

export function getSlaHours(priority: PriorityLevel | string): number {
  switch (priority) {
    case 'URGENT':
      return 2;
    case 'HIGH':
      return 4;
    case 'MEDIUM':
      return 8;
    case 'LOW':
      return 24;
    default:
      return 8; // fallback
  }
}
