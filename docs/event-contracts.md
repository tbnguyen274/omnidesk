# OmniDesk Event Contracts

## 1. Purpose

Event contract giúp OmniDesk xử lý bất đồng bộ qua queue/event bus và sẵn sàng nâng cấp lên microservice.

Trong MVP có thể dùng:

- Redis Queue / BullMQ
- Internal EventEmitter
- Redis Pub/Sub

Trong tương lai có thể thay bằng:

- Kafka
- Redpanda
- RabbitMQ

## 2. Standard Event Envelope

Mọi event nên có envelope chung:

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
| `reply.requested` | API/Conversation module | Outbound worker |
| `reply.sent` | Outbound worker | Conversation, Notification |
| `reply.failed` | Outbound worker | Conversation, Notification |
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

Example:

```json
{
  "eventName": "channel.message.received",
  "eventVersion": 1,
  "payload": {
    "provider": "FACEBOOK",
    "channelType": "FACEBOOK_MESSAGE",
    "inboundEventId": "uuid",
    "dedupKey": "FACEBOOK_MESSAGE:page_1:mid_1"
  }
}
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
  status: "NEW" | "ASSIGNED" | "IN_PROGRESS" | "WAITING_CUSTOMER" | "RESOLVED" | "CLOSED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  slaDueAt?: string;
  createdAt: string;
};
```

## 9. `ticket.updated`

Payload:

```ts
export type TicketUpdatedPayload = {
  ticketId: string;
  conversationId: string;
  status?: string;
  priority?: string;
  assignedAgentId?: string;
  slaDueAt?: string;
  updatedAt: string;
};
```

## 10. `reply.requested`

Producer:

- API.
- Conversation module.
- Outbound module.

Payload:

```ts
export type ReplyRequestedPayload = {
  outboundMessageId: string;
  conversationId: string;
  provider: "FACEBOOK" | "EMAIL";
  channelType: "FACEBOOK_MESSAGE" | "FACEBOOK_COMMENT" | "EMAIL";
  content: string;
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

## 13. `sla.overdue`

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

## 14. Event Versioning Rules

- Không sửa breaking change trong event version cũ.
- Nếu thay đổi field bắt buộc, tăng `eventVersion`.
- Consumer phải bỏ qua field không biết.
- Producer nên giữ backward compatibility càng lâu càng tốt.

## 15. Idempotency Rules

Mỗi consumer cần đảm bảo:

- Có `eventId`.
- Có `dedupKey` nếu event đến từ provider.
- Lưu trạng thái xử lý nếu cần.
- Retry không tạo trùng conversation/message.

## 16. Error Handling

Nếu event xử lý lỗi:

1. Retry theo cấu hình.
2. Nếu vẫn lỗi, cập nhật status `FAILED`.
3. Lưu error message.
4. Optional: đưa vào dead-letter queue.

## 17. Suggested Queue Names

Nếu dùng BullMQ/Redis:

```txt
inbound-events
outbound-messages
email-sync
sla-check
analytics-aggregation
```

Nếu dùng Kafka/Redpanda:

```txt
omni.channel.message.received
omni.message.normalized
omni.conversation.events
omni.ticket.events
omni.outbound.events
omni.sla.events
```
