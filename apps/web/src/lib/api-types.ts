export type UserRole = "ADMIN" | "AGENT";
export type ChannelType = "FACEBOOK_MESSAGE" | "FACEBOOK_COMMENT" | "EMAIL";
export type ConversationStatus =
  | "NEW"
  | "IN_PROGRESS"
  | "WAITING_CUSTOMER"
  | "RESOLVED"
  | "CLOSED";
export type TicketStatus =
  | "NEW"
  | "ASSIGNED"
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
    status: TicketStatus;
    priority: Priority;
    slaDueAt: string | null;
  } | null;
  lastMessage: {
    id: string;
    content: string;
    direction: MessageDirection;
    createdAt: string;
  } | null;
  lastMessageAt: string;
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
  createdAt: string;
  sentAt: string | null;
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
    status: TicketStatus;
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
};

export type ConversationFilters = {
  channelType?: ChannelType;
  status?: ConversationStatus;
  priority?: Priority;
  search?: string;
};

export type CreateOutboundMessagePayload = {
  conversationId: string;
  channelType: ChannelType;
  provider: OutboundProvider;
  recipientExternalId?: string;
  content: string;
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

