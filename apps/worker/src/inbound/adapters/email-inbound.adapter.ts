import { Injectable } from '@nestjs/common';
import { InboundEmailPayloadSchema } from '@omnidesk/shared';
import { PermanentJobError } from '../../errors/permanent-job.error';
import { inboundTime } from '../inbound-time';
import type {
  InboundProviderEvent,
  NormalizedInboundMessage,
} from '../inbound.types';
import type { InboundProviderAdapter } from './inbound-provider.adapter';

@Injectable()
export class EmailInboundAdapter implements InboundProviderAdapter {
  readonly provider = 'EMAIL' as const;

  supports(eventType: InboundProviderEvent['eventType']) {
    return eventType === 'EMAIL_RECEIVED';
  }

  async normalize(
    event: InboundProviderEvent,
  ): Promise<NormalizedInboundMessage> {
    const parsed = InboundEmailPayloadSchema.safeParse(event.rawPayload);
    if (!parsed.success)
      throw new PermanentJobError(
        `Invalid email payload: ${parsed.error.message}`,
      );
    const payload = parsed.data;
    const html = payload.contentType === 'HTML' || !!payload.html;
    const content = html
      ? this.sanitizeHtml(payload.html ?? payload.text ?? '')
      : (payload.text ?? this.stripHtml(payload.html ?? ''));
    const thread =
      payload.threadId ??
      payload.inReplyTo ??
      this.normalizeSubject(payload.subject);
    return Promise.resolve({
      channelType: 'EMAIL',
      account: {
        id: payload.channelAccountId,
        type: 'EMAIL',
        externalId: payload.mailbox,
        displayName: `Email - ${payload.mailbox}`,
        defaultConfig: { mailbox: payload.mailbox, mode: 'mock' },
      },
      customer: {
        identity: { kind: 'email', value: payload.fromEmail.toLowerCase() },
        name: payload.fromName,
      },
      externalConversationId: `EMAIL:${payload.mailbox.toLowerCase()}:${thread}`,
      externalMessageId: payload.messageId,
      content,
      contentType: payload.attachments?.length
        ? 'ATTACHMENT'
        : html
          ? 'HTML'
          : 'TEXT',
      receivedAt: inboundTime(payload.receivedAt, event.receivedAt),
      direction: 'INBOUND',
      senderType: 'CUSTOMER',
      attachments: payload.attachments ?? [],
      presentation: { subject: payload.subject, subjectStyle: 'email' },
    });
  }

  private normalizeSubject(subject: string) {
    return subject
      .trim()
      .replace(/^(re|fw|fwd):\s*/i, '')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .slice(0, 120);
  }

  /**
   * Sanitizes email HTML content against XSS attacks.
   * Strips executable script blocks, iframes, objects, embeds, forms,
   * inline event handlers (onerror, onload, etc.), and dangerous URI protocols.
   */
  private sanitizeHtml(html: string): string {
    if (!html) return '';

    return (
      html
        // 1. Remove dangerous executable tags and their inner content
        .replace(/<script\b[\s\S]*?<\/script>/gi, '')
        .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '')
        .replace(/<object\b[\s\S]*?<\/object>/gi, '')
        .replace(/<embed\b[\s\S]*?<\/embed>/gi, '')
        .replace(/<applet\b[\s\S]*?<\/applet>/gi, '')
        .replace(/<form\b[\s\S]*?<\/form>/gi, '')
        .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '')
        // 2. Remove lingering self-closing or unclosed dangerous tags
        .replace(
          /<\/?(?:script|iframe|object|embed|applet|form|base|meta|link)\b[^>]*>/gi,
          '',
        )
        // 3. Remove all inline event handlers (e.g. onerror=..., onload=..., onclick=...)
        .replace(
          /\s+on[a-z0-9_-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi,
          '',
        )
        // 4. Neutralize javascript:, vbscript:, and non-image data: URIs in link/resource attributes
        .replace(
          /(href|src|action|formaction|background|poster)\s*=\s*(["']?)\s*(?:javascript|vbscript|data:(?!image\/))/gi,
          '$1=$2unsafe-blocked:',
        )
        // 5. Remove CSS expressions (IE legacy XSS vector)
        .replace(/expression\s*\([^)]*\)/gi, '')
    );
  }

  private stripHtml(html: string) {
    return this.sanitizeHtml(html)
      .replace(/<[^>]*>/g, '')
      .trim();
  }
}
