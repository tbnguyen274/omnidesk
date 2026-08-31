import { z } from 'zod';

export const InboundEmailAttachmentSchema = z.object({
  key: z.string().min(1),
  url: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().nonnegative(),
});

export const InboundEmailPayloadSchema = z.object({
  mailbox: z.string().min(1),
  messageId: z.string().min(1),
  fromEmail: z.string().email(),
  fromName: z.string().optional(),
  toEmail: z.string().email().optional(),
  subject: z.string().default('(no subject)'),
  text: z.string().optional(),
  html: z.string().optional(),
  contentType: z.enum(['TEXT', 'HTML', 'ATTACHMENT']).optional(),
  receivedAt: z.string().optional(),
  threadId: z.string().optional(),
  inReplyTo: z.string().optional(),
  references: z.array(z.string()).optional(),
  channelAccountId: z.string().uuid().optional(),
  attachments: z.array(InboundEmailAttachmentSchema).optional(),
});

export const FacebookMessagePayloadSchema = z.object({
  pageId: z.string().min(1),
  senderId: z.string().min(1),
  senderName: z.string().optional(),
  messageId: z.string().min(1),
  text: z.string().min(1),
  sentAt: z.string().optional(),
  threadId: z.string().optional(),
  channelAccountId: z.string().uuid().optional(),
});

export const FacebookCommentPayloadSchema = z.object({
  pageId: z.string().min(1),
  postId: z.string().min(1),
  commentId: z.string().min(1),
  commenterId: z.string().min(1),
  commenterName: z.string().optional(),
  text: z.string().min(1),
  sentAt: z.string().optional(),
  parentCommentId: z.string().optional(),
  channelAccountId: z.string().uuid().optional(),
  postUrl: z.string().optional(),
});

export type InboundEmailAttachment = z.infer<
  typeof InboundEmailAttachmentSchema
>;
export type InboundEmailPayload = z.infer<typeof InboundEmailPayloadSchema>;
export type FacebookMessageInboundPayload = z.infer<
  typeof FacebookMessagePayloadSchema
>;
export type FacebookCommentInboundPayload = z.infer<
  typeof FacebookCommentPayloadSchema
>;

// Backward compatibility aliases
export type MockInboundEmailPayload = InboundEmailPayload;
export type MockFacebookMessagePayload = FacebookMessageInboundPayload;
export type MockFacebookCommentPayload = FacebookCommentInboundPayload;
