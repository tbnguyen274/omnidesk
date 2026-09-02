# OmniDesk API Specification

## 1. Overview

Base URL local:

```txt
http://localhost:3000/api/v1
```

OmniDesk dùng URI versioning cho public API. Các endpoint bên dưới được mô tả tương đối theo base URL `/api/v1`.

Auth:

Toàn bộ các API yêu cầu xác thực đều sử dụng **HttpOnly Cookies**. Trình duyệt (hoặc client) phải đính kèm header `Cookie` chứa `Authentication` (Access Token) khi gọi API.

```txt
Cookie: Authentication=<access_token>;
```

Các API quản trị sử dụng RBAC theo role trong JWT. Endpoint có ghi chú "Requires ADMIN role" chỉ cho phép user `ADMIN`; agent thường nhận `403 Forbidden`.

Response format khuyến nghị:

```json
{
  "success": true,
  "data": {},
  "message": "OK"
}
```

Error format:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "details": {}
  }
}
```

## 2. Auth APIs

### POST `/auth/login`

Đăng nhập.

Request:

```json
{
  "email": "agent@omnidesk.local",
  "password": "password"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "name": "Agent A",
      "email": "agent@omnidesk.local",
      "role": "AGENT"
    }
  }
}
```

*Lưu ý:* Endpoint này sẽ trả về 2 headers `Set-Cookie` (một cho `Authentication` sống 15 phút, một cho `Refresh` sống 7 ngày).

### POST `/auth/refresh`

Gia hạn Access Token và Refresh Token (Refresh Token Rotation). Bắt buộc phải có Cookie `Refresh` hợp lệ.

Response:

```json
{
  "success": true
}
```

*Lưu ý:* Endpoint này sẽ ghi đè 2 cookies mới thông qua header `Set-Cookie`.

### POST `/auth/logout`

Đăng xuất và thu hồi toàn bộ token.

Response:

```json
{
  "success": true
}
```

*Lưu ý:* Endpoint này sẽ ra lệnh cho trình duyệt xoá cookie và thu hồi refresh token trong Database.

### POST `/auth/forgot-password`

Yêu cầu gửi link đặt lại mật khẩu. Endpoint luôn trả về thành công để tránh dò email tồn tại trong hệ thống.

Request:

```json
{
  "email": "agent@omnidesk.local"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "success": true
  }
}
```

*Lưu ý:* Reset token có hiệu lực 1 giờ. Nếu email outbound đang ở mock mode hoặc chưa cấu hình SMTP, reset URL sẽ được ghi vào log API để test local.

### POST `/auth/reset-password`

Đặt lại mật khẩu bằng token hợp lệ.

Request:

```json
{
  "token": "reset-token-here",
  "newPassword": "newpassword123"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "success": true
  }
}
```

*Lưu ý:* `newPassword` tối thiểu 8 ký tự. Sau khi reset thành công, refresh token hiện tại của user bị thu hồi để buộc đăng nhập lại.

### GET `/auth/me`

Lấy thông tin user hiện tại.

Response:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Agent A",
    "email": "agent@omnidesk.local",
    "role": "AGENT"
  }
}
```

## 3. Users APIs

### GET `/users/agents`

Lấy danh sách agent đang hoạt động (`role = AGENT`, `status = ACTIVE`) để phục vụ assign ticket/conversation. Cho phép `ADMIN` và `AGENT`.

Response:

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Agent A",
      "email": "agent@omnidesk.local"
    }
  ]
}
```

### GET `/users`

Lấy danh sách toàn bộ user. Requires `ADMIN` role.

Response:

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Agent A",
      "email": "agent@omnidesk.local",
      "role": "AGENT",
      "status": "ACTIVE",
      "createdAt": "2026-07-04T10:00:00.000Z"
    }
  ]
}
```

### POST `/users`

Tạo user mới. Requires `ADMIN` role.

Request:

```json
{
  "name": "Nguyen Van A",
  "email": "new.agent@omnidesk.local",
  "role": "AGENT"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Nguyen Van A",
    "email": "new.agent@omnidesk.local",
    "role": "AGENT",
    "status": "ACTIVE",
    "createdAt": "2026-07-04T10:00:00.000Z"
  }
}
```

*Lưu ý:* Hệ thống tạo mật khẩu ngẫu nhiên nội bộ, sinh invitation/reset token có hiệu lực 7 ngày và gửi email mời user đặt mật khẩu. Ở mock mode, link đặt mật khẩu được ghi vào log API.

### PATCH `/users/:id/status`

Kích hoạt hoặc vô hiệu hóa tài khoản user. Requires `ADMIN` role.

Request:

```json
{
  "status": "INACTIVE"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Agent A",
    "email": "agent@omnidesk.local",
    "role": "AGENT",
    "status": "INACTIVE"
  }
}
```

## 4. Conversation APIs

### GET `/conversations`

Lấy danh sách conversation.

Query params:

| Param | Type | Description |
|---|---|---|
| channelType | string | `FACEBOOK_MESSAGE`, `FACEBOOK_COMMENT`, `EMAIL` |
| status | string | `NEW`, `IN_PROGRESS`, `WAITING_CUSTOMER`, `RESOLVED`, `CLOSED` |
| assignedAgentId | string | UUID của agent |
| priority | string | `LOW`, `MEDIUM`, `HIGH`, `URGENT` |
| search | string | Tìm kiếm theo tên khách hàng hoặc nội dung |
| page | number | Trang cần lấy (Mặc định 1) |
| limit | number | Số lượng mỗi trang (Mặc định 20) |

Response:

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "channelType": "EMAIL",
        "customer": {
          "id": "uuid",
          "name": "Nguyen Van A",
          "email": "customer@example.com"
        },
        "subject": "Tôi cần hỗ trợ hóa đơn",
        "status": "NEW",
        "priority": "HIGH",
        "assignedAgent": null,
        "lastMessage": {
          "content": "Tôi chưa nhận được hóa đơn",
          "direction": "INBOUND",
          "createdAt": "2026-06-03T10:00:00Z"
        },
        "lastMessageAt": "2026-06-03T10:00:00Z"
      }
    ],
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

### GET `/conversations/:id`

Lấy chi tiết conversation.

Response:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "channelType": "FACEBOOK_MESSAGE",
    "customer": {
      "id": "uuid",
      "name": "Customer A",
      "avatarUrl": "https://example.com/avatar.png"
    },
    "status": "IN_PROGRESS",
    "priority": "MEDIUM",
    "assignedAgent": {
      "id": "uuid",
      "name": "Agent A"
    },
    "tags": ["billing", "complaint"],
    "version": 1
  }
}
```

### GET `/conversations/:id/messages`

Lấy lịch sử tin nhắn của conversation (Phân trang theo cursor).

Query params:

| Param | Type | Description |
|---|---|---|
| cursor | string | ID của tin nhắn làm mốc. API sẽ trả về các tin nhắn *cũ hơn* mốc này. (Tùy chọn) |
| limit | number | Số lượng tin nhắn cần lấy (Mặc định 50) |

Response:

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "direction": "INBOUND",
      "senderType": "CUSTOMER",
      "content": "Tôi chưa nhận được hóa đơn",
      "replyToMessageId": null,
      "attachments": [],
      "createdAt": "2026-06-03T10:00:00Z"
    }
  ]
}
```

### PATCH `/conversations/:id/status`

Cập nhật status hội thoại (`NEW`, `IN_PROGRESS`, `WAITING_CUSTOMER`, `RESOLVED`, `CLOSED`).

Request:

```json
{
  "status": "RESOLVED",
  "version": 1
}
```

*Lưu ý:* Endpoint có tích hợp OCC (Optimistic Concurrency Control). Cần gửi kèm `version` hiện tại. Nếu trả về `409 Conflict`, dữ liệu đã bị sửa bởi một tiến trình khác.

### PATCH `/conversations/:id/assignment`

Gán agent phụ trách hội thoại.

Request:

```json
{
  "assignedAgentId": "uuid",
  "version": 1
}
```

*Lưu ý:* Cần gửi kèm `version` hiện tại để tránh Race Condition (HTTP 409).

### PATCH `/conversations/:id/priority`

Cập nhật độ ưu tiên hội thoại (`LOW`, `MEDIUM`, `HIGH`, `URGENT`).

Request:

```json
{
  "priority": "HIGH",
  "version": 1
}
```

*Lưu ý:* Cần gửi kèm `version` hiện tại để tránh Race Condition (HTTP 409).

### PATCH `/conversations/:id/read-status`

Cập nhật trạng thái đã đọc/chưa đọc.

Request:

```json
{
  "isRead": true,
  "version": 1
}
```

*Lưu ý:* Cần gửi kèm `version` hiện tại để tránh Race Condition (HTTP 409).

### POST `/conversations/:id/tags`

Gắn tag cho conversation.

Request:

```json
{
  "tagId": "uuid"
}
```

### DELETE `/conversations/:id/tags/:tagId`

Xóa tag khỏi conversation.

Response:

```json
{
  "success": true
}
```

## 5. Outbound APIs

### POST `/outbound/messages`

Gửi tin nhắn phản hồi tới khách hàng qua kênh tương ứng (Facebook Messenger, Facebook Comment, Email) kèm file/ảnh đính kèm nếu có.

Request:

```json
{
  "conversationId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "content": "Chào anh/chị, em sẽ kiểm tra thông tin hóa đơn và phản hồi sớm ạ.",
  "replyToMessageId": "optional-message-id",
  "attachments": [
    {
      "url": "http://localhost:9000/omnidesk/attachments/invoice.png",
      "fileName": "invoice.png",
      "mimeType": "image/png",
      "sizeBytes": 102400
    }
  ]
}
```

Response:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "conversationId": "uuid",
    "status": "PENDING",
    "createdAt": "2026-07-04T10:00:00.000Z"
  }
}
```

## 6. Attachments APIs

### POST `/attachments/upload`

Tải tệp đính kèm (ảnh, PDF, tài liệu) lên Object Storage (MinIO / S3). Requires `ADMIN` hoặc `AGENT`.

Content-Type: `multipart/form-data`
Body form: `file` (File binary)

Hạn mức cho phép:
- Ảnh (JPEG, PNG, GIF, WEBP): tối đa 5 MB.
- Tài liệu (PDF, DOCX, XLSX): tối đa 10 MB.

Response:

```json
{
  "success": true,
  "data": {
    "storageKey": "attachments/uuid-invoice.pdf",
    "url": "http://localhost:9000/omnidesk/attachments/uuid-invoice.pdf",
    "fileName": "invoice.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 204800
  }
}
```

### GET `/attachments/:id/content`

Stream nội dung tệp đính kèm trực tiếp từ Object Storage về trình duyệt với cơ chế Cache-Control.

Query params:
- `download`: `true` để tải về (`Content-Disposition: attachment`), hoặc `false` (mặc định) để preview inline.

Response: Binary Stream kèm headers `Content-Type`, `Content-Disposition`, `Content-Length`, `Cache-Control`.

## 7. Ticket APIs

### GET `/tickets`

Lấy danh sách ticket có phân trang và filter SLA.

Query params:

| Param | Type | Description |
|---|---|---|
| status | string | `NEW`, `IN_PROGRESS`, `WAITING_CUSTOMER`, `RESOLVED`, `CLOSED` |
| priority | string | `LOW`, `MEDIUM`, `HIGH`, `URGENT` |
| assignedAgentId | string | UUID của agent phụ trách |
| overdue | boolean | `true` để chỉ lấy ticket đã quá hạn SLA |
| page | number | Trang cần lấy (Mặc định 1) |
| limit | number | Số lượng mỗi trang (Mặc định 20) |

Response:

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "status": "IN_PROGRESS",
        "priority": "HIGH",
        "slaDueAt": "2026-06-03T18:00:00.000Z",
        "firstResponseDueAt": "2026-06-03T11:00:00.000Z",
        "resolvedAt": null,
        "assignedAgent": {
          "id": "uuid",
          "name": "Agent A",
          "email": "agent@omnidesk.local"
        },
        "conversation": {
          "id": "uuid",
          "channelType": "FACEBOOK_MESSAGE",
          "subject": "Hỗ trợ đơn hàng #1234",
          "status": "IN_PROGRESS",
          "version": 2,
          "lastMessageAt": "2026-06-03T10:00:00.000Z",
          "customer": {
            "id": "uuid",
            "name": "Customer A",
            "email": "customer@example.com",
            "avatarUrl": "https://example.com/avatar.png"
          }
        },
        "createdAt": "2026-06-03T10:00:00.000Z",
        "updatedAt": "2026-06-03T10:05:00.000Z"
      }
    ],
    "page": 1,
    "limit": 20,
    "total": 45
  }
}
```

### GET `/tickets/:id`

Lấy chi tiết ticket kèm thông tin SLA và hội thoại liên kết.

Response:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "IN_PROGRESS",
    "priority": "HIGH",
    "slaDueAt": "2026-06-03T18:00:00.000Z",
    "firstResponseDueAt": "2026-06-03T11:00:00.000Z",
    "resolvedAt": null,
    "assignedAgent": {
      "id": "uuid",
      "name": "Agent A",
      "email": "agent@omnidesk.local"
    },
    "conversation": {
      "id": "uuid",
      "channelType": "FACEBOOK_MESSAGE",
      "subject": "Hỗ trợ đơn hàng #1234",
      "status": "IN_PROGRESS",
      "version": 2,
      "lastMessageAt": "2026-06-03T10:00:00.000Z",
      "customer": {
        "id": "uuid",
        "name": "Customer A",
        "email": "customer@example.com",
        "avatarUrl": "https://example.com/avatar.png"
      }
    },
    "createdAt": "2026-06-03T10:00:00.000Z",
    "updatedAt": "2026-06-03T10:05:00.000Z"
  }
}
```

### PATCH `/tickets/:id/status`

Cập nhật trạng thái ticket.

Request:

```json
{
  "status": "IN_PROGRESS",
  "version": 1
}
```

*Lưu ý:* Trạng thái và phân công của Ticket được xử lý đồng bộ qua **Conversation Aggregate**. `Conversation` là Single Source of Truth; mutation cập nhật cả 2 bản ghi trong cùng một database transaction. `version` là số phiên bản OCC hiện tại của Conversation (trả về HTTP 409 Conflict nếu bị xung đột dữ liệu).

### PATCH `/tickets/:id/assignment`

Gán agent phụ trách ticket.

Request:

```json
{
  "assignedAgentId": "uuid",
  "version": 1
}
```

*Lưu ý:* Gán agent được thực thi qua Conversation aggregate trong cùng database transaction kèm kiểm tra OCC version.

## 8. Webhook APIs

### GET `/webhooks/facebook`

Webhook verification endpoint của Meta Graph API.

Query params:
- `hub.mode`: Phải bằng `subscribe`
- `hub.verify_token`: Token cấu hình trong Meta Developer Dashboard
- `hub.challenge`: Chuỗi challenge ngẫu nhiên cần trả về

Response: `<hub.challenge>` (plain text)

### POST `/webhooks/facebook`

Nhận Facebook webhook event live từ Meta (Messenger message, Feed comment). Production bắt buộc bật xác thực chữ ký `X-Hub-Signature-256` và lưu event kèm Transactional Outbox.

Request:

```json
{
  "object": "page",
  "entry": [
    {
      "id": "page_id",
      "time": 1710000000,
      "messaging": [
        {
          "sender": { "id": "user_id" },
          "recipient": { "id": "page_id" },
          "timestamp": 1710000000,
          "message": {
            "mid": "message_id",
            "text": "Tôi cần hỗ trợ"
          }
        }
      ]
    }
  ]
}
```

Response:

```json
{
  "success": true,
  "data": {
    "received": true
  }
}
```

## 9. Email Synchronization APIs

### POST `/email/sync`

Trigger email sync thủ công. Với `EMAIL_INBOUND_MODE=live`, worker poll mailbox IMAP thật; mock mode chỉ dùng cho local fallback.

Response:

```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "status": "QUEUED"
  }
}
```

### GET `/email/sync-logs`

Lấy log lịch sử đồng bộ email từ IMAP mailbox.

Response:

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "status": "SUCCESS",
        "fetchedCount": 5,
        "processedCount": 5,
        "syncStartedAt": "2026-06-03T10:00:00Z",
        "syncFinishedAt": "2026-06-03T10:00:10Z"
      }
    ]
  }
}
```

## 10. Channel Account APIs

### GET `/channel-accounts`

Lấy danh sách các tài khoản kênh tích hợp đã cấu hình (Facebook Pages, Email Mailboxes). Requires `ADMIN`.

Response:

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "type": "EMAIL",
      "displayName": "Support Mailbox",
      "externalId": "support@omnidesk.local",
      "status": "ACTIVE",
      "createdAt": "2026-06-01T00:00:00.000Z"
    }
  ]
}
```

### POST `/channel-accounts`

Tạo mới hoặc kết nối channel account. Requires `ADMIN`.

Request:

```json
{
  "type": "EMAIL",
  "displayName": "Support Mailbox",
  "externalId": "support@example.com",
  "config": {
    "provider": "SMTP_IMAP",
    "imapHost": "imap.example.com",
    "smtpHost": "smtp.example.com"
  }
}
```

## 11. Integration Event Log APIs

### GET `/events/inbound`

Lấy danh sách inbound event log nhận từ webhook/email.

Query params:

| Param | Type | Description |
|---|---|---|
| provider | string | `FACEBOOK`, `EMAIL` |
| eventType | string | `MESSAGE`, `COMMENT`, `EMAIL` |
| status | string | `RECEIVED`, `PROCESSING`, `PROCESSED`, `FAILED`, `DUPLICATE` |
| page | number | Default 1 |
| limit | number | Default 20 |

Response:

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "provider": "FACEBOOK",
        "eventType": "MESSAGE",
        "dedupKey": "FACEBOOK_MESSAGE:page_1:mid_1",
        "normalizedStatus": "PROCESSED",
        "receivedAt": "2026-06-03T10:00:00Z"
      }
    ],
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

### GET `/events/outbound`

Lấy danh sách outbound message log gửi ra kênh bên ngoài.

Query params:

| Param | Type | Description |
|---|---|---|
| provider | string | `FACEBOOK`, `EMAIL` |
| status | string | `PENDING`, `SENDING`, `SENT`, `FAILED`, `RETRYING` |
| page | number | Default 1 |
| limit | number | Default 20 |

Response:

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "conversationId": "uuid",
        "provider": "FACEBOOK",
        "channelType": "FACEBOOK_MESSAGE",
        "recipientExternalId": "fb_user_123",
        "content": "Chào anh/chị, em sẽ hỗ trợ ngay ạ.",
        "status": "SENT",
        "externalMessageId": "mid.1234567890",
        "errorMessage": null,
        "retryCount": 0,
        "createdAt": "2026-06-03T10:05:00.000Z"
      }
    ],
    "page": 1,
    "limit": 20,
    "total": 85
  }
}
```

## 12. Admin & Dead-Letter APIs

### GET `/admin/dead-letter-jobs`

Lấy danh sách các jobs bị lỗi (failed) trong hàng đợi BullMQ để admin kiểm tra và xử lý. Requires `ADMIN`.

Query params:
- `queue`: Tên queue (`inbound-events`, `outbound-messages`, `email-sync`, `email-actions`, `sla-check`, `analytics-aggregation`, `auto-close`)
- `limit`: Số lượng job cần lấy (Mặc định 50)

Response:

```json
{
  "success": true,
  "data": {
    "queue": "outbound-messages",
    "jobs": [
      {
        "id": "job_123",
        "name": "send-outbound-message",
        "data": { "outboundMessageId": "uuid" },
        "failedReason": "Graph API Rate limit reached (OAuthException)",
        "attemptsMade": 3,
        "timestamp": 1710000000000
      }
    ],
    "total": 1
  }
}
```

### POST `/admin/dead-letter-jobs/:jobId/replay`

Đưa một failed job trở lại trạng thái `waiting` để worker retry thực thi lại. Hành động này được ghi audit log. Requires `ADMIN`.

Request:

```json
{
  "queue": "outbound-messages"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "replayed": true,
    "jobId": "job_123"
  }
}
```

## 13. Dashboard APIs

### GET `/dashboard/summary`

Lấy tổng hợp chỉ số vận hành trung tâm hỗ trợ.

Response:

```json
{
  "success": true,
  "data": {
    "totalTickets": 120,
    "newTickets": 12,
    "inProgressTickets": 25,
    "resolvedTickets": 80,
    "overdueTickets": 3,
    "byChannel": {
      "FACEBOOK_MESSAGE": 40,
      "FACEBOOK_COMMENT": 30,
      "EMAIL": 50
    }
  }
}
```

### GET `/dashboard/agent-performance`

Lấy thống kê hiệu suất xử lý ticket theo từng agent.

Response:

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "agentId": "uuid",
        "agentName": "Agent A",
        "assignedTickets": 20,
        "resolvedTickets": 15
      }
    ]
  }
}
```

## 14. AI Assist APIs (Not Implemented - Draft Spec)

> [!NOTE]
> ⚠️ Tính năng AI Assist chưa được triển khai trong MVP hiện tại. Đặc tả dưới đây là bản thảo thiết kế (Design Draft) cho các giai đoạn phát triển tiếp theo.

### POST `/ai/suggest-reply`

Request:

```json
{
  "conversationId": "uuid"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "suggestedReply": "Chào anh/chị, em đã ghi nhận vấn đề hóa đơn và sẽ kiểm tra ngay ạ.",
    "intent": "billing_issue",
    "priority": "HIGH"
  }
}
```

## 15. Realtime WebSocket Gateway

OmniDesk sử dụng **Socket.io** với namespace cấu hình tại:

```txt
/notifications
```

### 15.1. Authentication
Client kết nối tới WebSocket Gateway cần gửi kèm HttpOnly Cookie `Authentication=<jwt_token>`. Gateway sẽ tự động trích xuất token, xác thực và đưa agent vào 2 room mặc định:
- `agent:{userId}`: Nhận các thông báo gán ticket/hội thoại cá nhân.
- `team:inbox`: Nhận các sự kiện tạo mới và cập nhật danh sách hội thoại toàn team.

### 15.2. Client-to-Server Events

| Event | Payload | Mô tả |
|---|---|---|
| `conversation.join` | `{ "conversationId": "uuid" }` | Tham gia vào room của một hội thoại cụ thể để nhận tin nhắn mới và trạng thái gõ phím. |
| `conversation.leave` | `{ "conversationId": "uuid" }` | Rời khỏi room hội thoại. |
| `agent_typing` | `{ "conversationId": "uuid", "isTyping": true }` | Phát tín hiệu agent đang soạn tin nhắn để hiển thị cho các agent khác trong cùng hội thoại. |

### 15.3. Server-to-Client Events (Fetch-on-Event Architecture)

Tất cả sự kiện realtime từ server được broadcast qua kênh: `realtime.event`.

> [!NOTE]
> **Cơ chế Fetch-on-Event**: Nhằm tối ưu hóa hiệu năng và băng thông mạng cho Redis Pub/Sub và WebSocket, các sự kiện realtime chỉ mang các định danh cần thiết (như `conversationId`, `messageId`, `ticketId`). Khi nhận được tín hiệu event, client (Frontend) thực hiện invalidation query cache hoặc gọi API tương ứng (ví dụ: `GET /conversations/:id/messages?cursor=...`) để lấy dữ liệu mới nhất.

Cấu trúc payload chuẩn khớp 100% với kiểu `RealtimeEvent` trong `@omnidesk/shared`:

#### 1. `conversation.updated` / `conversation.created`
```json
{
  "type": "conversation.updated",
  "conversationId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "occurredAt": "2026-07-04T10:00:00.000Z"
}
```

#### 2. `message.created`
```json
{
  "type": "message.created",
  "conversationId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "messageId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "occurredAt": "2026-07-04T10:00:00.000Z"
}
```

#### 3. `ticket.updated`
```json
{
  "type": "ticket.updated",
  "ticketId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "conversationId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "occurredAt": "2026-07-04T10:00:00.000Z"
}
```

#### 4. `outbound_message.updated`
```json
{
  "type": "outbound_message.updated",
  "outboundMessageId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "conversationId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "status": "SENT",
  "occurredAt": "2026-07-04T10:01:00.000Z"
}
```

#### 5. `agent.typing`
```json
{
  "type": "agent.typing",
  "conversationId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "agentName": "Agent A",
  "isTyping": true
}
```

#### 6. `sla.overdue`
```json
{
  "type": "sla.overdue",
  "ticketId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "conversationId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "occurredAt": "2026-07-04T18:00:01.000Z"
}
```

## 16. Development-only APIs

Các API bắt đầu bằng `/dev` chỉ bật trong môi trường development/demo:

- `/dev/facebook/mock-message`: Giả lập inbound message từ Facebook.
- `/dev/facebook/mock-comment`: Giả lập inbound comment từ Facebook Page.
- `/dev/email/mock-inbound`: Giả lập inbound email từ khách hàng.
- `/dev/reset-demo-data`: Xóa toàn bộ dữ liệu demo.
- `/dev/seed-demo-data`: Tạo dữ liệu mẫu phong phú để kiểm thử và demo.

Trong production (`NODE_ENV=production`), các route này tự động bị disable hoàn toàn.


