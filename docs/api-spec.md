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
| assignedAgentId | string | UUID |
| priority | string | `LOW`, `MEDIUM`, `HIGH`, `URGENT` |
| search | string | Search customer/content |
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
    "messages": [
      {
        "id": "uuid",
        "direction": "INBOUND",
        "senderType": "CUSTOMER",
        "content": "Tôi chưa nhận được hóa đơn",
        "createdAt": "2026-06-03T10:00:00Z"
      }
    ]
  }
}
```

### GET `/conversations/:id/messages`

Lấy lịch sử tin nhắn của conversation (Phân trang với cursor).

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
      "createdAt": "2026-06-03T10:00:00Z"
    }
  ]
}
```

### POST `/conversations/:id/reply`

Agent gửi reply.

Request:

```json
{
  "content": "Chào anh/chị, em sẽ kiểm tra thông tin hóa đơn và phản hồi sớm ạ.",
  "internalNote": false
}
```

Response:

```json
{
  "success": true,
  "data": {
    "messageId": "uuid",
    "outboundMessageId": "uuid",
    "status": "PENDING"
  }
}
```

### PATCH `/conversations/:id/status`

Cập nhật status.

Request:

```json
{
  "status": "RESOLVED",
  "version": 1
}
```

*Lưu ý:* Endpoint có tích hợp OCC (Optimistic Concurrency Control). Cần gửi kèm `version` hiện tại. Nếu trả về `409 Conflict`, dữ liệu đã bị sửa bởi một tiến trình khác.

### PATCH `/conversations/:id/assignment`

Gán agent.

Request:

```json
{
  "assignedAgentId": "uuid",
  "version": 1
}
```

*Lưu ý:* Cần gửi kèm `version` hiện tại để tránh Race Condition (HTTP 409).

### PATCH `/conversations/:id/priority`

Cập nhật priority.

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

Gắn tag.

Request:

```json
{
  "tags": ["billing", "complaint"]
}
```

## 5. Ticket APIs

### GET `/tickets`

Lấy danh sách ticket.

Query params:

- `status`
- `priority`
- `assignedAgentId`
- `overdue`
- `page`
- `limit`

### GET `/tickets/:id`

Lấy chi tiết ticket.

### PATCH `/tickets/:id/status`

Request:

```json
{
  "status": "IN_PROGRESS"
}
```

### PATCH `/tickets/:id/assignment`

Request:

```json
{
  "assignedAgentId": "uuid"
}
```

## 6. Message APIs

### GET `/webhooks/facebook`

Webhook verification endpoint.

Query params thường gặp:

```txt
hub.mode
hub.verify_token
hub.challenge
```

Response:

```txt
<hub.challenge>
```

### POST `/webhooks/facebook`

Nhận Facebook webhook event live từ Meta. Production phải bật xác thực verify token/chữ ký webhook và lưu event theo dedup key trước khi enqueue worker.

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

### POST `/dev/facebook/mock-message`

Development-only endpoint để giả lập Facebook message. Endpoint này chỉ dùng cho local demo/fallback khi Meta hoặc Ngrok không khả dụng; production phải disable.

Request:

```json
{
  "pageId": "test_page",
  "senderId": "customer_fb_1",
  "senderName": "Customer FB",
  "messageId": "fb_msg_001",
  "text": "Tôi muốn hỏi về hóa đơn"
}
```

### POST `/dev/facebook/mock-comment`

Development-only endpoint để giả lập Facebook comment. Endpoint này chỉ dùng cho local demo/fallback khi Meta hoặc Ngrok không khả dụng; production phải disable.

Request:

```json
{
  "pageId": "test_page",
  "postId": "post_001",
  "commentId": "comment_001",
  "senderId": "customer_fb_2",
  "senderName": "Customer Comment",
  "text": "Shop phản hồi giúp mình"
}
```

## 7. Channel APIs

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

Lấy log sync email.

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

### POST `/dev/email/mock-inbound`

Development-only endpoint để giả lập inbound email. Endpoint này chỉ dùng cho local demo/fallback khi mailbox IMAP/SMTP không khả dụng; production phải disable.

Request:

```json
{
  "from": "customer@example.com",
  "fromName": "Nguyen Van A",
  "subject": "Khiếu nại hóa đơn",
  "body": "Tôi đã thanh toán nhưng chưa nhận được hóa đơn.",
  "messageId": "email_msg_001"
}
```

## 8. Customer APIs

### GET `/channel-accounts`

Lấy danh sách kênh đã cấu hình.

### POST `/channel-accounts`

Tạo channel account.

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

## 9. Integration APIs

### GET `/events/inbound`

Lấy inbound event log.

Query params:

- `provider`
- `eventType`
- `status`
- `page`
- `limit`

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
        "dedupKey": "FACEBOOK_MESSAGE:page:mid",
        "normalizedStatus": "PROCESSED",
        "receivedAt": "2026-06-03T10:00:00Z"
      }
    ]
  }
}
```

### GET `/events/outbound`

Lấy outbound message log.

## 10. Dashboard APIs

### GET `/dashboard/summary`

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

## 11. AI Assist APIs - Optional

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

## 12. WebSocket/SSE Events

Frontend cần nhận các event realtime:

```txt
conversation.created
conversation.updated
message.created
ticket.updated
outbound_message.updated
sla.overdue
```

Payload ví dụ:

```json
{
  "event": "conversation.updated",
  "data": {
    "conversationId": "uuid",
    "lastMessageAt": "2026-06-03T10:00:00Z",
    "status": "IN_PROGRESS"
  }
}
```

## 13. Development-only APIs

Các API bắt đầu bằng `/dev` chỉ bật trong môi trường development/demo:

- `/dev/facebook/mock-message`
- `/dev/facebook/mock-comment`
- `/dev/email/mock-inbound`
- `/dev/reset-demo-data`
- `/dev/seed-demo-data`

Trong production, các route này phải bị disable.
