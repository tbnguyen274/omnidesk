# OmniDesk Event Contracts

## 1. Purpose

Event contract giúp OmniDesk xử lý bất đồng bộ qua queue/event bus và sẵn sàng nâng cấp lên microservice.

Trong hệ thống hiện tại sử dụng:

- Redis 7 & BullMQ 5
- Socket.io Realtime Events
- Database Transactional Outbox (`outbox_events`)

Trong tương lai có thể mở rộng sang:

- Kafka / Redpanda
- RabbitMQ

## 2. Standard Event Envelope

Mọi event có envelope chuẩn:

```ts
export type EventEnvelope<TPayload> = {
  eventId: string;
  eventName: string;
  eventVersion: number;
  occurredAt: string;
  source: string;
  correlationId?: string;
  causationId?: string;
  payload: TPayload;
};
```

Ví dụ:

```json
{
  "eventId": "evt_001",
  "eventName": "channel.message.received",
  "eventVersion": 1,
  "occurredAt": "2026-06-03T10:00:00Z",
  "source": "facebook-module",
  "correlationId": "corr_001",
  "payload": {}
}
```

## 3. Event Names

| Event | Producer | Consumer |
|---|---|---|
| `channel.message.received` | Facebook/Email module | Inbound processor |
| `message.normalized` | Inbound processor | Conversation module |
| `conversation.created` | Conversation module | Notification, Analytics, Ticket |
| `conversation.updated` | Conversation module | Notification, Analytics |
| `ticket.created` | Ticket module | Notification, Analytics |
| `ticket.updated` | Ticket module | Notification, Analytics |
| `reply.requested` | Outbound module | Outbound worker |
| `reply.sent` | Outbound worker | Conversation, Notification |
| `reply.failed` | Outbound worker | Conversation, Notification |
| `agent.typing` | Client WebSocket Gateway | Other agents in conversation room |
| `sla.near_due` | SLA worker | Notification |
| `sla.overdue` | SLA worker | Notification, Analytics |
| `cron.auto_close` | AutoCloseScheduler | AutoCloseProcessor |

## 4. `channel.message.received`

Producer:
- Facebook module.
- Email module.

Payload:

```ts
export type ChannelMessageReceivedPayload = {
  provider: "FACEBOOK" | "EMAIL";
  channelType: "FACEBOOK_MESSAGE" | "FACEBOOK_COMMENT" | "EMAIL";
  inboundEventId: string;
  dedupKey: string;
  rawPayloadRef?: string;
};
```

## 5. `message.normalized`

Producer:
- Inbound processor.

Payload:

```ts
export type MessageNormalizedPayload = {
  inboundEventId: string;
  normalizedMessage: NormalizedMessage;
};
```

## 6. `conversation.created`

Producer:
- Conversation module.

Payload:

```ts
export type ConversationCreatedPayload = {
  conversationId: string;
  customerId: string;
  channelType: "FACEBOOK_MESSAGE" | "FACEBOOK_COMMENT" | "EMAIL";
  firstMessageId: string;
  createdAt: string;
};
```

## 7. `conversation.updated`

Payload:

```ts
export type ConversationUpdatedPayload = {
  conversationId: string;
  lastMessageId?: string;
  status?: "NEW" | "IN_PROGRESS" | "WAITING_CUSTOMER" | "RESOLVED" | "CLOSED";
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  assignedAgentId?: string;
  updatedAt: string;
};
```

## 8. `ticket.created`

Payload:

```ts
export type TicketCreatedPayload = {
  ticketId: string;
  conversationId: string;
  slaDueAt?: string;
  firstResponseDueAt?: string;
  createdAt: string;
};
```

## 9. `ticket.updated`

Payload:

```ts
export type TicketUpdatedPayload = {
  ticketId: string;
  conversationId: string;
  slaDueAt?: string;
  slaPausedAt?: string;
  isOverdue?: boolean;
  firstResponseDueAt?: string;
  updatedAt: string;
};
```

## 10. `reply.requested`

Producer:
- API Outbound module (Transactional Outbox).

Payload:

```ts
export type ReplyRequestedPayload = {
  outboundMessageId: string;
  conversationId: string;
  provider: "FACEBOOK" | "EMAIL";
  channelType: "FACEBOOK_MESSAGE" | "FACEBOOK_COMMENT" | "EMAIL";
  content: string;
  attachments?: Array<{
    url: string;
    fileName: string;
    mimeType?: string;
    sizeBytes?: number;
  }>;
  recipientExternalId?: string;
  createdBy: string;
  requestedAt: string;
};
```

## 11. `reply.sent`

Payload:

```ts
export type ReplySentPayload = {
  outboundMessageId: string;
  conversationId: string;
  externalMessageId?: string;
  provider: "FACEBOOK" | "EMAIL";
  sentAt: string;
};
```

## 12. `reply.failed`

Payload:

```ts
export type ReplyFailedPayload = {
  outboundMessageId: string;
  conversationId: string;
  provider: "FACEBOOK" | "EMAIL";
  errorCode?: string;
  errorMessage: string;
  retryCount: number;
  failedAt: string;
};
```

## 13. `agent.typing`

Payload:

```ts
export type AgentTypingPayload = {
  conversationId: string;
  agentName: string;
  isTyping: boolean;
};
```

## 14. `sla.overdue`

Payload:

```ts
export type SlaOverduePayload = {
  ticketId: string;
  conversationId: string;
  assignedAgentId?: string;
  slaDueAt: string;
  overdueAt: string;
};
```

## 15. Transactional Outbox & Current Implementation

Hệ thống OmniDesk kết hợp 2 tầng sự kiện:

### 15.1. Transactional Outbox Event Types (Thực tế trong mã nguồn `OutboxEventType`)

Các sự kiện được ghi đồng thời vào bảng `outbox_events` trong cùng database transaction với dữ liệu nghiệp vụ:

| OutboxEventType | Trigger | Target Queue | Mô tả hành động |
|---|---|---|---|
| `INBOUND_EVENT_CREATED` | Khi nhận webhook Facebook hoặc fetch Email mới | `inbound-events` | Enqueue worker để chuẩn hóa và tạo conversation/message |
| `CONVERSATION_STATUS_CHANGED` | Khi đổi trạng thái hội thoại (e.g. `CLOSED`) | `email-actions` / `analytics` | Đồng bộ 2 chiều: Chuyển email vào thư mục Archive |
| `CONVERSATION_PRIORITY_CHANGED` | Khi đổi độ ưu tiên (e.g. `URGENT`) | `email-actions` / `analytics` | Đồng bộ 2 chiều: Gắn cờ/star cho email trên mail server |
| `CONVERSATION_READ_STATUS_CHANGED` | Khi agent đọc/đánh dấu chưa đọc | `email-actions` | Đồng bộ 2 chiều: Đánh dấu `\Seen` trên IMAP |

### 15.2. Dead-Letter Protocol & Replay

Khi dispatch event thất bại vượt quá số lần retry tối đa (`maxRetries`):
1. `OutboxEvent` được đánh dấu chuyển trạng thái sang `DEAD`.
2. Lưu `failedAt`, `attempts`, và `errorMessage`.
3. Hệ thống hỗ trợ endpoint / CLI command `replayDeadEvents()` để re-enqueue và khôi phục xử lý các sự kiện bị lỗi mà không làm mất tính toàn vẹn dữ liệu.

## 16. Queue Names (BullMQ)

Hệ thống sử dụng đầy đủ 7 queue tiêu chuẩn trên Redis 7 theo hằng số `QUEUE_NAMES` (`packages/shared/src/index.ts`):

```txt
inbound-events          # Xử lý các webhook event và email mới tải về
outbound-messages       # Gửi tin nhắn phản hồi qua Graph API và SMTP
email-sync              # Scheduler và job đồng bộ hòm thư IMAP
email-actions           # Đồng bộ các thao tác IMAP 2 chiều (Mark Read, Star, Archive)
sla-check               # Định kỳ kiểm tra và cảnh báo vi phạm SLA
analytics-aggregation   # Tổng hợp số liệu thống kê dashboard
auto-close              # Tự động đóng hội thoại không hoạt động sau 3 ngày
```

