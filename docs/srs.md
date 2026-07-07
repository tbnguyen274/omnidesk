# Software Requirements Specification - OmniDesk

## 1. Giới thiệu

### 1.1. Tên project

**OmniDesk - Omnichannel Customer Support Platform for Facebook and Email**

### 1.2. Bối cảnh

Trong thực tế, doanh nghiệp thường tiếp nhận yêu cầu khách hàng từ nhiều kênh khác nhau như Facebook Messenger, Facebook Comment và Email. Nếu mỗi kênh được xử lý riêng lẻ, nhân viên chăm sóc khách hàng dễ gặp các vấn đề:

- Bỏ sót tin nhắn hoặc comment.
- Khó theo dõi lịch sử tương tác của cùng một khách hàng.
- Không có quy trình phân công xử lý rõ ràng.
- Khó đo lường hiệu suất phản hồi.
- Khó mở rộng thêm kênh mới trong tương lai.

OmniDesk được xây dựng để gom các tương tác khách hàng từ Facebook và Email vào một giao diện xử lý tập trung.

### 1.3. Mục tiêu

OmniDesk hướng tới các mục tiêu chính:

1. Tích hợp Facebook Page để nhận tin nhắn Messenger và comment.
2. Tích hợp Email để nhận và gửi email chăm sóc khách hàng.
3. Chuẩn hóa dữ liệu từ nhiều kênh về mô hình chung `Customer - Conversation - Message - Ticket`.
4. Cung cấp dashboard cho agent xử lý hội thoại, gán trạng thái, tag, priority và phản hồi khách hàng.
5. Hỗ trợ xử lý bất đồng bộ bằng queue/worker.
6. Thiết kế hệ thống theo Modular Monolith nhưng sẵn sàng tách thành Microservice.

### 1.4. Phạm vi

#### Trong phạm vi MVP

- Đăng nhập agent/admin.
- Quên mật khẩu/đặt lại mật khẩu qua email hoặc mock email log.
- Admin tạo, xem danh sách và vô hiệu hóa tài khoản agent/admin.
- Unified Inbox hiển thị hội thoại từ Facebook và Email.
- Conversation detail hiển thị timeline message.
- Nhận và gửi email qua IMAP/SMTP live; mock email chỉ dùng khi demo/dev fallback.
- Nhận Facebook event qua webhook live từ Page đã cấu hình; mock endpoint chỉ dùng khi demo/dev fallback.
- Trả lời Facebook/email từ dashboard.
- Quản lý ticket status, priority, tag.
- Realtime update bằng WebSocket hoặc SSE.
- Queue/worker xử lý inbound/outbound message.
- Event log để debug webhook/email event.

#### Ngoài phạm vi MVP

- Multi-tenant SaaS hoàn chỉnh.
- Call center/voice.
- Zalo, Instagram, TikTok.
- Payment/CRM enterprise integration.
- Microservice full deployment với service database riêng.
- AI tự động trả lời khách hàng không cần agent kiểm duyệt.

## 2. Người dùng hệ thống

### 2.1. Admin

Admin có thể:

- Quản lý agent.
- Tạo tài khoản agent/admin mới và gửi link thiết lập mật khẩu.
- Kích hoạt/vô hiệu hóa tài khoản người dùng.
- Cấu hình channel account.
- Xem dashboard thống kê.
- Xem log tích hợp.
- Theo dõi lỗi gửi/nhận message.

### 2.2. Agent

Agent có thể:

- Xem danh sách conversation/ticket.
- Nhận và xử lý ticket được gán.
- Trả lời khách hàng.
- Gắn tag, priority, status.
- Ghi chú nội bộ.
- Sử dụng AI assist nếu có.

### 2.3. Customer

Customer không truy cập OmniDesk trực tiếp. Customer tương tác qua:

- Facebook Messenger.
- Facebook Comment.
- Email.

## 3. Yêu cầu chức năng

### 3.1. Authentication & Authorization

| ID | Yêu cầu |
|---|---|
| FR-AUTH-01 | Người dùng có thể đăng nhập bằng email/password. |
| FR-AUTH-02 | Hệ thống phân quyền `ADMIN` và `AGENT`. |
| FR-AUTH-03 | Chỉ user đã đăng nhập mới truy cập dashboard. |
| FR-AUTH-04 | Admin có quyền cấu hình channel, agent chỉ xử lý conversation. |
| FR-AUTH-05 | Người dùng có thể yêu cầu quên mật khẩu; hệ thống gửi link reset nếu tài khoản đang active và không tiết lộ email có tồn tại hay không. |
| FR-AUTH-06 | Người dùng có thể đặt lại mật khẩu bằng reset token còn hạn; sau khi reset, refresh token hiện tại bị thu hồi. |
| FR-AUTH-07 | Admin có thể tạo user mới với role `ADMIN` hoặc `AGENT`; hệ thống gửi invitation link để user tự đặt mật khẩu ban đầu. |
| FR-AUTH-08 | Admin có thể xem danh sách user và chuyển trạng thái `ACTIVE`/`INACTIVE`; user inactive không thể đăng nhập. |

### 3.2. Unified Inbox

| ID | Yêu cầu |
|---|---|
| FR-INBOX-01 | Hiển thị danh sách conversation từ Facebook và Email. |
| FR-INBOX-02 | Hỗ trợ filter theo channel: Facebook Message, Facebook Comment, Email. |
| FR-INBOX-03 | Hỗ trợ filter theo status: New, In Progress, Waiting Customer, Resolved, Closed. |
| FR-INBOX-04 | Hiển thị last message, customer name, channel, priority, assigned agent. |
| FR-INBOX-05 | Cập nhật realtime khi có message mới. |

### 3.3. Conversation & Message

| ID | Yêu cầu |
|---|---|
| FR-CONV-01 | Hiển thị timeline message trong conversation. |
| FR-CONV-02 | Phân biệt inbound, outbound và system message. |
| FR-CONV-03 | Lưu raw payload của message để debug. |
| FR-CONV-04 | Hỗ trợ gửi reply từ dashboard. |
| FR-CONV-05 | Hỗ trợ internal note không gửi cho customer. |
| FR-CONV-06 | Tải danh sách tin nhắn theo cơ chế phân trang (Pagination) để tối ưu API. |

### 3.4. Ticket Management

| ID | Yêu cầu |
|---|---|
| FR-TICKET-01 | Mỗi conversation có thể gắn với một ticket. |
| FR-TICKET-02 | Ticket có status: New, Assigned, In Progress, Waiting Customer, Resolved, Closed. |
| FR-TICKET-03 | Ticket có priority: Low, Medium, High, Urgent. |
| FR-TICKET-04 | Agent có thể gán tag cho ticket/conversation. |
| FR-TICKET-05 | Admin hoặc agent có thể assign ticket cho agent. |

### 3.5. Facebook Integration

| ID | Yêu cầu |
|---|---|
| FR-FB-01 | Hệ thống có endpoint xác thực webhook live từ Facebook bằng verify token. |
| FR-FB-02 | Hệ thống nhận message event live từ Facebook Messenger. |
| FR-FB-03 | Hệ thống nhận comment event live từ Facebook Page. |
| FR-FB-04 | Facebook event được lưu vào inbound event log. |
| FR-FB-05 | Facebook event được normalize thành `NormalizedMessage`. |
| FR-FB-06 | Agent có thể gửi reply ra Facebook qua Graph API bằng Page Access Token. |
| FR-FB-07 | Hệ thống chống duplicate event bằng external event id/message id. |
| FR-FB-08 | Hệ thống có mock Facebook adapter/dev endpoint làm fallback cho local demo khi Meta/Ngrok không khả dụng. |

### 3.6. Email Integration

| ID | Yêu cầu |
|---|---|
| FR-EMAIL-01 | Hệ thống nhận email live qua IMAP polling. |
| FR-EMAIL-02 | Hệ thống gửi email live qua SMTP. |
| FR-EMAIL-03 | Email được parse sender, recipient, subject, body, timestamp. |
| FR-EMAIL-04 | Email được normalize thành conversation/message. |
| FR-EMAIL-05 | Hệ thống lưu email sync log và raw payload. |
| FR-EMAIL-06 | Hỗ trợ tương tác hai chiều qua IMAP (đánh dấu đã đọc/chưa đọc, gán cờ, chuyển vào lưu trữ Archive khi ticket closed). |
| FR-EMAIL-07 | Hệ thống có mock email adapter/dev endpoint làm fallback cho local demo khi mailbox/SMTP không khả dụng. |

### 3.7. Event Processing & Worker

| ID | Yêu cầu |
|---|---|
| FR-EVENT-01 | Webhook/email event được đưa vào queue thay vì xử lý nặng trực tiếp. |
| FR-EVENT-02 | Worker xử lý inbound event, normalize và lưu DB. |
| FR-EVENT-03 | Worker xử lý outbound message/email. |
| FR-EVENT-04 | Hệ thống retry khi gửi outbound thất bại. |
| FR-EVENT-05 | Event lỗi nhiều lần được đánh dấu failed hoặc đưa vào dead-letter queue. |

### 3.8. Dashboard & Analytics

| ID | Yêu cầu |
|---|---|
| FR-DASH-01 | Hiển thị số ticket theo trạng thái. |
| FR-DASH-02 | Hiển thị số conversation theo channel. |
| FR-DASH-03 | Hiển thị ticket quá hạn SLA nếu có. |
| FR-DASH-04 | Hiển thị số ticket xử lý bởi từng agent nếu có dữ liệu. |

### 3.9. AI Assist - Optional

| ID | Yêu cầu |
|---|---|
| FR-AI-01 | Hệ thống có thể gợi ý tag/intent cho message. |
| FR-AI-02 | Hệ thống có thể gợi ý câu trả lời cho agent. |
| FR-AI-03 | Agent phải duyệt/chỉnh sửa trước khi gửi. |

## 4. Yêu cầu phi chức năng

### 4.1. Hiệu năng

- Webhook endpoint phải phản hồi nhanh, không xử lý nghiệp vụ nặng trực tiếp.
- Inbox nên phản hồi trong dưới 1 giây với dữ liệu demo.
- Giao diện Chat sử dụng kỹ thuật **Infinite Scrolling (Cuộn vô hạn)** kết hợp với Pagination để tối ưu hiệu suất render DOM khi có hàng ngàn tin nhắn.
- Worker xử lý event bất đồng bộ qua Redis Queue hoặc Kafka/Redpanda.

### 4.2. Reliability

- Có idempotency để tránh trùng message.
- Có retry cho outbound message.
- Có log lỗi cho webhook/email event.
- Không mất message khi provider timeout tạm thời.

### 4.3. Maintainability

- Codebase chia module rõ ràng.
- Module giao tiếp qua service interface/event contract.
- Không để module truy cập dữ liệu thuộc ownership của module khác một cách tùy tiện.

### 4.4. Extensibility

- Có thể thêm kênh mới như Zalo, Instagram, Live Chat bằng cách thêm Channel Adapter mới.
- Có thể tách module thành microservice độc lập trong tương lai.

### 4.5. Security

- Sử dụng **HttpOnly Cookies** để chống rò rỉ token qua XSS. Áp dụng cơ chế **Refresh Token Rotation** (15m Access Token, 7d Refresh Token) và hash (Bcrypt) Refresh Token trên Database.
- Password reset token được lưu trong DB kèm thời điểm hết hạn, chỉ dùng cho luồng đặt lại mật khẩu hoặc invitation, và bị xóa sau khi đổi mật khẩu thành công.
- Webhook cần verify token/signature nếu provider hỗ trợ.
- API cần authentication (JwtAuthGuard).
- API quản trị user cần kiểm tra role bằng RBAC guard.
- Không log lộ password/token nhạy cảm.

## 5. Giả định và ràng buộc

- Project phục vụ mục tiêu mini-project, không phải production SaaS hoàn chỉnh.
- Facebook live integration yêu cầu App/Page đã cấu hình webhook, Page Access Token hợp lệ và callback public như Ngrok khi chạy local.
- Email live integration yêu cầu mailbox IMAP/SMTP hợp lệ.
- Mock mode chỉ là fallback cho local development hoặc khi provider/live network tạm thời không khả dụng.

## 6. Tiêu chí hoàn thành MVP

MVP được xem là đạt nếu:

1. Có dashboard đăng nhập được.
2. Có luồng quên mật khẩu/đặt lại mật khẩu hoạt động ở mock hoặc SMTP mode.
3. Admin quản lý được user cơ bản (tạo, xem danh sách, vô hiệu hóa).
4. Có Unified Inbox hiển thị conversation từ hai nguồn live: Email và Facebook.
5. Có thể xem timeline message.
6. Có thể gửi reply email thật.
7. Có thể gửi reply Facebook qua Graph API, hoặc chuyển mock provider khi cần fallback demo.
8. Có ticket status/priority/tag.
9. Có worker/queue xử lý event.
10. Có event log chứng minh luồng nhận và xử lý event.
11. Có demo script rõ ràng.
12. Có báo cáo và slide giải thích được kiến trúc.
