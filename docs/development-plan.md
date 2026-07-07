# OmniDesk Development Plan

## 1. Development Strategy

Ưu tiên:

1. Làm core inbox trước.
2. Làm email live qua IMAP/SMTP ổn định, mock chỉ fallback.
3. Làm Facebook webhook/Graph API live, mock chỉ fallback.
4. Thêm queue/worker.
5. Thêm ticket workflow.
6. Thêm dashboard/event log.
7. Thêm AI assist nếu còn thời gian.

Không nên bắt đầu bằng full microservice hoặc Kafka phức tạp nếu chưa có core product.

## 2. Phase 0 - Project Setup

Tasks:

- Tạo monorepo.
- Tạo `apps/web`, `apps/api`, `apps/worker`, `packages/shared`.
- Cài Docker Compose.
- Setup PostgreSQL, Redis.
- Setup lint/format.
- Setup environment variables.

Deliverables:

- Repo chạy được.
- API health check.
- Frontend home/login page.
- Worker boot được.

## 3. Phase 1 - Core Domain & Auth

Tasks:

- Thiết kế Prisma schema/database migration.
- Tạo bảng users, customers, conversations, messages, tickets.
- Auth login.
- Seed admin/agent.
- Conversation APIs cơ bản.
- Ticket APIs cơ bản.

Deliverables:

- Login được.
- Inbox mock data từ database.
- Xem conversation detail.

## 4. Phase 2 - Unified Inbox UI

Tasks:

- Layout inbox.
- Conversation list.
- Conversation timeline.
- Reply box.
- Customer profile panel.
- Ticket status/priority/tag panel.
- Filter channel/status/priority.

Deliverables:

- UI gần hoàn chỉnh.
- Thao tác status/priority/tag được.

## 5. Phase 3 - Event Infrastructure

Tasks:

- Setup Redis + BullMQ.
- Tạo queue:
  - inbound-events
  - outbound-messages
  - email-sync
  - sla-check
- Tạo `inbound_events`.
- Tạo `outbound_messages`.
- Tạo worker processors.

Deliverables:

- Event được enqueue và worker xử lý.
- Event log hiển thị.

## 6. Phase 4 - Email Integration

Tasks:

- Chọn IMAP/SMTP live.
- Parse email inbound.
- Normalize email thành `NormalizedMessage`.
- Gửi email outbound.
- Mock email endpoint nếu cần fallback local/demo.

Deliverables:

- Email inbound xuất hiện trong inbox.
- Agent gửi reply email được.
- Có email sync log.

## 7. Phase 5 - Facebook Integration

Tasks:

- Tạo Facebook webhook verification endpoint.
- Tạo Facebook webhook verification endpoint cho live provider.
- Tạo mock Facebook message/comment endpoint làm fallback.
- Parse Facebook payload.
- Normalize thành `NormalizedMessage`.
- Gửi reply live qua Graph API, mock chỉ fallback.
- Chống duplicate bằng dedup key.

Deliverables:

- Facebook message/comment live xuất hiện trong inbox.
- Mock endpoint vẫn hoạt động cho fallback demo.
- Reply flow hoạt động qua outbox.
- Có inbound event log.

## 8. Phase 6 - Realtime & Notification

Tasks:

- WebSocket hoặc SSE.
- Push event khi conversation/message/ticket update.
- Fallback polling nếu realtime lỗi.

Deliverables:

- Message mới xuất hiện realtime.
- Ticket update realtime.

## 9. Phase 7 - SLA & Dashboard

Tasks:

- Tính SLA due date theo channel/priority.
- Worker check overdue.
- Dashboard summary:
  - ticket by status
  - ticket by channel
  - overdue count
  - agent performance

Deliverables:

- Dashboard có số liệu.
- Ticket quá SLA được đánh dấu.

## 10. Phase 8 - AI Assist Optional

Tasks:

- Auto-tag intent.
- Suggested reply.
- Conversation summary.
- Human-in-the-loop only.

Deliverables:

- Agent bấm generate suggestion.
- Gợi ý hiển thị, agent chỉnh sửa rồi gửi.

## 11. Phase 9 - Documentation & Demo

Tasks:

- Cập nhật docs.
- Chụp màn hình.
- Viết báo cáo.
- Làm slide.
- Chuẩn bị demo data.
- Test fallback mode.

Deliverables:

- Báo cáo 15 trang.
- Slide 15 trang.
- Demo script.
- Project chạy ổn local.

## 12. Suggested Priority

Nếu thời gian ít, ưu tiên:

1. Core Inbox.
2. Email inbound/outbound.
3. Facebook live webhook/Graph API.
4. Ticket workflow.
5. Event log.
6. Redis queue/worker.
7. Dashboard.
8. AI assist.

## 13. Definition of Done

Project được xem là hoàn thành tốt nếu:

- Có sản phẩm chạy được.
- Demo ưu tiên Facebook và Email live.
- Có fallback mock nếu Facebook/Email provider hoặc mạng lỗi.
- Có Facebook live event.
- Có unified inbox.
- Có ticket workflow.
- Có queue/worker.
- Có tài liệu kiến trúc rõ.
- Có roadmap microservice.
