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

export const QUEUE_NAMES = {
  INBOUND_EVENTS: 'inbound-events',
  OUTBOUND_MESSAGES: 'outbound-messages',
  EMAIL_SYNC: 'email-sync',
  SLA_CHECK: 'sla-check',
  ANALYTICS_AGGREGATION: 'analytics-aggregation',
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
  requestedBy?: string;
};

export type SlaCheckJobPayload = {
  requestedAt: string;
};

export type AnalyticsAggregationJobPayload = {
  requestedAt: string;
};

export type QueuePayloadByName = {
  [QUEUE_NAMES.INBOUND_EVENTS]: InboundEventJobPayload;
  [QUEUE_NAMES.OUTBOUND_MESSAGES]: OutboundMessageJobPayload;
  [QUEUE_NAMES.EMAIL_SYNC]: EmailSyncJobPayload;
  [QUEUE_NAMES.SLA_CHECK]: SlaCheckJobPayload;
  [QUEUE_NAMES.ANALYTICS_AGGREGATION]: AnalyticsAggregationJobPayload;
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
