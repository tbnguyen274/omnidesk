export type UserRole = "ADMIN" | "AGENT";
export type ChannelType = "FACEBOOK_MESSAGE" | "FACEBOOK_COMMENT" | "EMAIL";
export type ConversationStatus =
  | "NEW"
  | "IN_PROGRESS"
  | "WAITING_CUSTOMER"
  | "RESOLVED"
  | "CLOSED";
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type MessageDirection = "INBOUND" | "OUTBOUND";
export type MessageSenderType = "CUSTOMER" | "AGENT" | "SYSTEM";
export type MessageContentType = "TEXT" | "HTML" | "ATTACHMENT" | "SYSTEM";
export type DeliveryStatus = "RECEIVED" | "PENDING" | "SENT" | "FAILED";
export type OutboundProvider = "FACEBOOK" | "EMAIL";
export type OutboundMessageStatus =
  | "PENDING"
  | "SENDING"
  | "SENT"
  | "FAILED"
  | "RETRYING";

export type Attachment = {
  id: string;
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type UploadAttachmentResponse = {
  key: string;
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type ApiResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status?: string;
};

export type LoginResponse = {
  accessToken: string;
  user: CurrentUser;
};

export type ConversationListItem = {
  id: string;
  channelType: ChannelType;
  customer: {
    id: string;
    name: string | null;
    email: string | null;
    avatarUrl: string | null;
  };
  subject: string | null;
  status: ConversationStatus;
  priority: Priority;
  assignedAgent: CurrentUser | null;
  ticket: {
    id: string;
    status: ConversationStatus;
    priority: Priority;
    slaDueAt: string | null;
  } | null;
  lastMessage: {
    id: string;
    content: string;
    contentType?: MessageContentType;
    direction: MessageDirection;
    createdAt: string;
  } | null;
  lastMessageAt: string;
  isRead: boolean;
};

export type ConversationListResponse = {
  items: ConversationListItem[];
  page: number;
  limit: number;
  total: number;
};

export type ConversationMessage = {
  id: string;
  direction: MessageDirection;
  senderType: MessageSenderType;
  senderId: string | null;
  content: string;
  contentType: MessageContentType;
  deliveryStatus: DeliveryStatus;
  externalMessageId: string | null;
  replyToMessageId?: string | null;
  createdAt: string;
  sentAt: string | null;
  attachments?: Attachment[];
};

export type ConversationDetail = {
  id: string;
  channelType: ChannelType;
  customer: {
    id: string;
    name: string | null;
    email: string | null;
    avatarUrl: string | null;
    externalFacebookId: string | null;
  };
  subject: string | null;
  status: ConversationStatus;
  priority: Priority;
  assignedAgent: CurrentUser | null;
  ticket: {
    id: string;
    status: ConversationStatus;
    priority: Priority;
    assignedAgentId: string | null;
    slaDueAt: string | null;
    firstResponseDueAt: string | null;
    resolvedAt: string | null;
    closedAt: string | null;
  } | null;
  tags: Array<{
    id: string;
    name: string;
    color: string | null;
  }>;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
  version: number;
  isRead: boolean;
};

export type ConversationFilters = {
  channelType?: ChannelType;
  status?: ConversationStatus;
  priority?: Priority;
  search?: string;
};

export type OutboundAttachmentItem = {
  url: string;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
};

export type CreateOutboundMessagePayload = {
  conversationId: string;
  replyToMessageId?: string;
  content: string;
  attachmentUrls?: string[];
  attachments?: OutboundAttachmentItem[];
};

export type OutboundMessage = {
  id: string;
  conversationId: string;
  channelType: ChannelType;
  provider: OutboundProvider;
  recipientExternalId: string | null;
  content: string;
  status: OutboundMessageStatus;
  retryCount: number;
  maxRetries: number;
  lastError: string | null;
  externalMessageId: string | null;
  createdBy: string;
  createdAt: string;
  sentAt: string | null;
  updatedAt: string;
};

export type CreateOutboundMessageResponse = {
  outboundMessage: OutboundMessage;
  jobId: string | number | null;
  queued: boolean;
};

export type DashboardSummary = {
  total: number;
  new: number;
  inProgress: number;
  resolved: number;
  overdue: number;
  byChannel: Record<string, number>;
};

export type AgentPerformance = {
  id: string;
  name: string;
  email: string;
  resolvedTickets: number;
};

export type QueueName =
  | "inbound-events"
  | "outbound-messages"
  | "email-sync"
  | "email-actions"
  | "sla-check"
  | "auto-close"
  | "analytics-aggregation";

export type DeadLetterJob = {
  id: string | undefined;
  name: string;
  data: Record<string, unknown>;
  attemptsMade: number;
  failedReason: string | undefined;
  timestamp: number;
  processedOn: number | undefined;
  finishedOn: number | undefined;
};

export type DeadLetterJobsResponse = {
  queue: string;
  jobs: DeadLetterJob[];
  total: number;
};
