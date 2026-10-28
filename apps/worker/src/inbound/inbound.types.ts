import type {
  ChannelProvider,
  ChannelType,
  InboundEmailAttachment,
  MessageContentType,
  MessageDirection,
} from '@omnidesk/shared';

/** Internal Worker contract; independent of Prisma and queue wire formats. */
export type InboundProviderEvent = {
  id: string;
  provider: ChannelProvider;
  eventType: 'MESSAGE' | 'COMMENT' | 'EMAIL_RECEIVED';
  dedupKey: string;
  receivedAt: Date;
  rawPayload: unknown;
};

export type ClaimedInboundEvent = {
  event: InboundProviderEvent;
  leaseStartedAt: Date;
};

export type InboundPresentation = {
  subject: string;
  subjectStyle: 'email' | 'facebook';
  originalPost?: { id: string; content: string };
};

export type NormalizedInboundMessage = {
  channelType: ChannelType;
  account: {
    id?: string;
    type: ChannelProvider;
    externalId: string;
    displayName: string;
    defaultConfig: Record<string, string>;
  };
  customer: {
    identity: { kind: 'email' | 'facebook'; value: string };
    name?: string;
    avatarUrl?: string;
  };
  externalConversationId: string;
  externalMessageId: string;
  content: string;
  contentType: MessageContentType;
  receivedAt: Date;
  direction: MessageDirection;
  senderType: 'CUSTOMER' | 'AGENT';
  attachments: InboundEmailAttachment[];
  presentation: InboundPresentation;
};

export type IngestionResult = {
  inboundEventId: string;
  conversationId: string;
  conversationCreated: boolean;
  messageId: string | null;
  ticketId: string | null;
  duplicated: boolean;
};

export class InboundLeaseLostError extends Error {
  constructor(eventId: string) {
    super(`Inbound processing lease lost: ${eventId}`);
    this.name = 'InboundLeaseLostError';
  }
}
