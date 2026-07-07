# Microservice Readiness Rules - OmniDesk

## 1. Purpose

OmniDesk hiện triển khai theo kiến trúc Modular Monolith. Tài liệu này định nghĩa các quy tắc để đảm bảo codebase có thể tách thành microservice trong tương lai mà không phải viết lại toàn bộ.

## 2. Core Principle

> Build as a modular monolith, design as future microservices.

Điều này có nghĩa:

- Một backend app có thể chứa nhiều module.
- Mỗi module phải có boundary rõ.
- Core domain không phụ thuộc chi tiết provider.
- Giao tiếp giữa các module nên thông qua interface, event hoặc service contract.
- Không để database access bị rải lung tung.

## 3. Module Boundary Rules

### Rule 1 - Single Responsibility per Module

Mỗi module chỉ xử lý một nhóm trách nhiệm rõ ràng.

Ví dụ:

| Module | Trách nhiệm |
|---|---|
| `facebook` | Facebook webhook, Facebook payload, Facebook send API |
| `email` | IMAP/SMTP/Gmail API, email parsing |
| `conversations` | Customer, conversation, message timeline |
| `tickets` | Ticket, status, assignment, SLA |
| `notifications` | WebSocket/SSE push |
| `analytics` | Dashboard/reporting |
| `outbound` | Outbox, retry, outbound status |

### Rule 2 - No Cross-module Database Access

Không nên để module này thao tác trực tiếp bảng thuộc module khác.

Không nên:

```ts
// facebook module
await prisma.ticket.create(...)
await prisma.conversation.update(...)
```

Nên:

```ts
await messageIngestionService.ingest(normalizedMessage)
```

hoặc:

```ts
await eventBus.publish("channel.message.received", normalizedMessage)
```

### Rule 3 - Provider Modules Must Not Own Core Business Logic

`facebook` và `email` chỉ là adapter.

Không nên:

```txt
FacebookService tự tạo ticket, tự set SLA, tự push analytics.
```

Nên:

```txt
FacebookService -> NormalizedMessage -> Ingestion/Core Domain
```

### Rule 4 - Core Domain Must Not Depend on Provider Details

`conversations` và `tickets` không nên biết:

- Facebook payload field cụ thể.
- SMTP/IMAP raw format.
- Gmail API-specific response.

Core chỉ xử lý:

```txt
NormalizedMessage
NormalizedCustomer
OutboundMessage
```

## 4. Channel Adapter Contract

Mỗi kênh nên implement interface tương tự:

```ts
export interface ChannelAdapter {
  provider: ChannelProvider;

  parseInboundEvent(rawPayload: unknown): Promise<NormalizedMessage[]>;

  sendMessage(params: SendMessageParams): Promise<SendMessageResult>;

  verifyWebhook?(params: WebhookVerifyParams): Promise<WebhookVerifyResult>;
}
```

### Example Providers

```txt
FacebookAdapter
EmailAdapter
MockFacebookAdapter
MockEmailAdapter
```

### Benefit

Khi thêm Zalo/Instagram/Live Chat:

```txt
ZaloAdapter implements ChannelAdapter
```

Core inbox không cần thay đổi lớn.

## 5. Normalized Message Contract

Mọi inbound message từ provider phải được chuyển về:

```ts
export type NormalizedMessage = {
  provider: "FACEBOOK" | "EMAIL";
  channelType: "FACEBOOK_MESSAGE" | "FACEBOOK_COMMENT" | "EMAIL";

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
    contentType: "TEXT" | "HTML";
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
```

## 6. Event-driven Rules

### Rule 1 - Slow Work Must Be Async

Webhook endpoint không xử lý nặng trực tiếp.

Nên:

```txt
Webhook receives event
  -> store inbound_event
  -> enqueue job
  -> return 200 OK
```

### Rule 2 - Events Need Stable Names

Event name phải rõ, nhất quán:

```txt
channel.message.received
message.normalized
conversation.created
conversation.updated
ticket.created
ticket.updated
reply.requested
reply.sent
reply.failed
sla.overdue
```

### Rule 3 - Event Payloads Must Be Versioned

Khi chuyển sang Kafka/microservice, event nên có version:

```json
{
  "eventName": "channel.message.received",
  "eventVersion": 1,
  "eventId": "uuid",
  "occurredAt": "2026-06-03T10:00:00Z",
  "payload": {}
}
```

### Rule 4 - Consumers Must Be Idempotent

Consumer có thể nhận lại event do retry. Xử lý phải an toàn.

Cách làm:

- Dùng `dedupKey`.
- Unique constraint.
- Check event processed status.

## 7. Outbox Rules

Khi agent gửi reply, không gọi provider trực tiếp rồi mới lưu DB. Phải tạo outbound record trước.

Flow:

```txt
Agent sends reply
  -> API creates message/outbound_message PENDING
  -> enqueue outbound job
  -> worker sends to provider
  -> update SENT/FAILED/RETRYING
```

Lợi ích:

- Không mất message khi provider timeout.
- Có retry.
- Có trạng thái gửi rõ ràng.
- Dễ tách Outbound Service sau này.

## 8. Inbound Event Rules

Mọi event từ provider phải đi qua `inbound_events`.

Flow:

```txt
Raw provider event
  -> inbound_events
  -> normalize
  -> conversations/messages/tickets
```

Lợi ích:

- Debug được.
- Retry được.
- Có audit trail.
- Có thể replay event nếu cần.

## 9. Database Ownership Rules

| Owner Module | Tables |
|---|---|
| Auth | `users` |
| Integration | `channel_accounts`, `inbound_events`, `email_sync_logs` |
| Conversation | `customers`, `conversations`, `messages` |
| Ticket | `tickets`, `tags`, `conversation_tags` |
| Outbound | `outbound_messages` |
| Audit | `audit_logs` |
| Analytics | Read model/materialized views nếu có |

Quy tắc:

1. Owner module là nơi duy nhất được trực tiếp write vào bảng của mình.
2. Module khác phải gọi service hoặc publish event.
3. Khi tách microservice, bảng owner sẽ trở thành database/schema riêng.

## 10. Dependency Direction

Dependency nên đi theo hướng:

```txt
Provider Adapter -> Application Service -> Domain Service -> Repository
```

Không nên có circular dependency.

Không nên:

```txt
TicketModule -> FacebookModule -> ConversationModule -> TicketModule
```

Nên:

```txt
FacebookModule -> MessageIngestionService
EmailModule -> MessageIngestionService
MessageIngestionService -> ConversationModule
MessageIngestionService -> TicketModule
```

Hoặc dùng event:

```txt
FacebookModule -> EventBus -> ConversationModule -> EventBus -> TicketModule
```

## 11. Migration Path to Microservices

### Phase 1 - Modular Monolith

```txt
apps/api
apps/worker
shared PostgreSQL
Redis Queue
```

### Phase 2 - Extract Worker

```txt
api
worker
```

Worker xử lý email sync, outbound send, retry, SLA checking (SlaCheckScheduler) và Auto-Close (AutoCloseScheduler).

### Phase 3 - Extract Channel Services

```txt
facebook-service
email-service
api
worker
```

Channel service publish event vào Redis/Kafka.

### Phase 4 - Extract Notification and Analytics

```txt
notification-service
analytics-service
```

Hai service này consume event và ít ảnh hưởng core transaction.

### Phase 5 - Extract Core Domain

```txt
conversation-service
ticket-service
customer-service
```

Giai đoạn này khó hơn vì liên quan database ownership và consistency.

## 12. Monorepo vs Multi-repo

OmniDesk nên bắt đầu bằng monorepo:

```txt
apps/
  web/
  api/
  worker/
packages/
  shared/
```

Khi tách microservice vẫn có thể giữ monorepo:

```txt
apps/
  api-gateway/
  facebook-service/
  email-service/
  conversation-service/
  ticket-service/
  notification-service/
  analytics-service/
packages/
  shared-contracts/
```

Multi-repo chỉ nên dùng khi:

- Có nhiều team độc lập.
- Cần CI/CD độc lập mạnh.
- Service đã ổn định về boundary.

## 13. Checklist Before Extracting a Module

Trước khi tách module thành service riêng, kiểm tra:

- [ ] Module có trách nhiệm rõ ràng.
- [ ] Không bị circular dependency.
- [ ] Có input/output contract rõ.
- [ ] Không truy cập trực tiếp bảng của module khác.
- [ ] Có event contract nếu giao tiếp async.
- [ ] Có idempotency.
- [ ] Có logging.
- [ ] Có test cho module.
- [ ] Có Dockerfile riêng nếu cần.
- [ ] Có config/env riêng.

## 14. Anti-patterns to Avoid

- Module gọi trực tiếp repository của module khác.
- Business logic nằm trong controller.
- Facebook/email adapter xử lý ticket logic.
- Không lưu raw event.
- Không có dedup key.
- Gửi outbound trực tiếp trong HTTP request.
- Event payload không có version.
- Shared package chứa quá nhiều business logic.
- Dùng microservice chỉ để “trông xịn” nhưng demo không ổn định.
