# Manual Test Checklist: Provider Integration (Phase 9)

Use this checklist to manually verify the live integration of external providers before and after deployment. Live Facebook and Email providers are the primary production-ready path; mock mode is only a fallback for local demos and provider/network failures.

## I1. Email Outbound Live

- [ ] Set `EMAIL_OUTBOUND_MODE=live` and configure `EMAIL_SMTP_*` variables.
- [ ] Send a reply from the OmniDesk UI to an existing Email conversation.
- [ ] Verify that the `OutboundMessage` status is set to `SENT`.
- [ ] Check the target recipient's mailbox to ensure the email was received correctly.
- [ ] Ensure the OmniDesk Conversation timeline correctly displays the `OUTBOUND` message.

## I2. Email Inbound Live

- [ ] Set `EMAIL_INBOUND_MODE=live` and configure `EMAIL_IMAP_*` variables.
- [ ] Send a real email from an external client to the OmniDesk configured support email.
- [ ] Wait for the background worker to poll the inbox (or manually trigger if possible).
- [ ] Verify that an `InboundEvent` is created successfully.
- [ ] Check the OmniDesk Inbox UI to ensure the new conversation/message appears correctly.
- [ ] Wait for the next polling cycle and ensure the message is **not** duplicated.

## I3. Facebook Webhook Verification

- [ ] Set `FACEBOOK_PROVIDER_MODE=live` and configure `FACEBOOK_APP_SECRET`, `FACEBOOK_VERIFY_TOKEN`.
- [ ] Expose the local API to the public internet using an HTTPS tunnel (e.g., ngrok).
- [ ] Go to the Facebook App Dashboard -> Webhooks -> Edit Subscription.
- [ ] Enter the ngrok Callback URL (e.g., `https://<ngrok>/api/v1/facebook/webhook`) and the `FACEBOOK_VERIFY_TOKEN`.
- [ ] Click "Verify and Save" and ensure Meta accepts it.
- [ ] Test with an incorrect verify token and ensure your API rejects it with a `403 Forbidden`.

## I4. Facebook Inbound Live

- [ ] Ensure `FACEBOOK_PROVIDER_MODE=live` and the Page is subscribed to the webhook `messages` field.
- [ ] Send a message to the Facebook Page via Facebook Messenger (from a standard user account).
- [ ] Check the API logs to ensure the webhook payload was received and parsed.
- [ ] Verify that the worker processes the inbound event successfully.
- [ ] Open the OmniDesk Inbox UI and verify the new Facebook Messenger conversation appears.
- [ ] Resend the exact same webhook payload (e.g., via Postman) and ensure duplicate delivery is ignored by the database constraints.

## I5. Facebook Outbound Live

- [ ] Ensure `FACEBOOK_PAGE_ACCESS_TOKEN` is configured.
- [ ] Reply from the OmniDesk UI into the Facebook Messenger conversation created in I4.
- [ ] Check the target user's Facebook Messenger app to see if they received the reply.
- [ ] Verify that the `OutboundMessage` status is marked as `SENT`.
- [ ] Temporarily invalidate the Page Access Token (e.g., replace a character). Attempt to send a reply.
- [ ] Verify that the `OutboundMessage` status transitions to `FAILED` and `lastError` clearly contains the Facebook Graph API error.

## I6. Fallback Mock Mode

- [ ] Change the `.env` settings to `EMAIL_INBOUND_MODE=mock`, `EMAIL_OUTBOUND_MODE=mock`, and `FACEBOOK_PROVIDER_MODE=mock`.
- [ ] Use the internal demo endpoints (e.g. `seed-demo-data`) to create mock conversations.
- [ ] Reply to a mock conversation via the UI.
- [ ] Verify that the system still behaves correctly in mock mode as it did in Phases 5/6/8, and no real external calls are attempted.

---

### Diagnostic Command
To quickly check which modes are active and if environment configurations are present, hit the health endpoint:
```
GET /api/v1/dev/providers/health
```

## Phase 11: Automated Ticket Workflows

### 11.1 SLA Pause Logic
- [ ] Create a ticket and take note of the SLA Due time.
- [ ] Change the ticket status to `WAITING_CUSTOMER`.
- [ ] Wait for a few minutes.
- [ ] Reply to the conversation as a customer to transition the status back to `IN_PROGRESS`.
- [ ] Verify that the SLA Due time has been pushed back (extended) by the exact amount of time the ticket spent in `WAITING_CUSTOMER`.

### 11.2 Auto-Reopen & Graph API
- [ ] Resolve an existing Facebook Messenger ticket.
- [ ] Send a new message from the customer's Facebook account.
- [ ] Verify the ticket status automatically changes from `RESOLVED` back to `IN_PROGRESS`.
- [ ] Verify the conversation subject displays as `Facebook Messenger - [ID]` or `Facebook Comment - [ID]`.
- [ ] Verify the customer's real name is fetched via Graph API and displayed in the UI.

### 11.3 Auto-Close Cronjob
- [ ] Manually edit a ticket in the database to have status `RESOLVED` and `resolvedAt` set to 4 days ago.
- [ ] Wait for the `AutoCloseScheduler` to trigger (or manually trigger the queue).
- [ ] Verify the ticket and conversation status are permanently transitioned to `CLOSED`.
