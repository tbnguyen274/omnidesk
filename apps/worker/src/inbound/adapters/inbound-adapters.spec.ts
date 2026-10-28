import { PermanentJobError } from '../../errors/permanent-job.error';
import { FacebookProfileService } from '../../facebook/services/facebook-profile.service';
import type { InboundProviderEvent } from '../inbound.types';
import { EmailInboundAdapter } from './email-inbound.adapter';
import { FacebookInboundAdapter } from './facebook-inbound.adapter';
import { InboundAdapterRegistry } from './inbound-adapter.registry';

const receivedAt = new Date('2026-01-01T00:00:00Z');
const event = (
  rawPayload: unknown,
  overrides: Partial<InboundProviderEvent> = {},
): InboundProviderEvent => ({
  id: 'event',
  provider: 'EMAIL',
  eventType: 'EMAIL_RECEIVED',
  dedupKey: 'key',
  receivedAt,
  rawPayload,
  ...overrides,
});
const email = {
  mailbox: 'Support@Example.com',
  messageId: '<mail-1>',
  fromEmail: 'Customer@Example.com',
  subject: 'Re: Need Help',
  text: 'Hello',
};
const facebook = {
  pageId: 'page',
  senderId: 'customer',
  messageId: 'msg',
  text: 'Hello',
};

describe('provider normalization contracts', () => {
  const profiles = { enrich: jest.fn().mockResolvedValue(undefined) };
  const emailAdapter = new EmailInboundAdapter();
  const fbAdapter = new FacebookInboundAdapter(
    profiles as unknown as FacebookProfileService,
  );
  afterEach(() => jest.clearAllMocks());

  it.each([
    [{ threadId: 'thread' }, 'thread'],
    [{ inReplyTo: 'parent' }, 'parent'],
    [{}, 'need-help'],
  ])('preserves email threading: %j', async (extra, thread) => {
    const normalized = await emailAdapter.normalize(
      event({ ...email, ...extra }),
    );
    expect(normalized.externalConversationId).toBe(
      `EMAIL:support@example.com:${thread}`,
    );
    expect(normalized.customer.identity).toEqual({
      kind: 'email',
      value: 'customer@example.com',
    });
    expect(normalized.receivedAt).toEqual(receivedAt);
    expect(normalized.presentation.subject).toBe(email.subject);
  });

  it('preserves lazy IMAP attachment keys and sanitizes email HTML', async () => {
    const attachment = {
      key: 'lazy:imap:account:mail:0:file.pdf',
      url: '/file',
      fileName: 'file.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 100,
    };
    const normalized = await emailAdapter.normalize(
      event({
        ...email,
        html: '<script>bad()</script><img onerror="bad()"><a href="javascript:bad()">Hi</a>',
        attachments: [attachment],
      }),
    );
    expect(normalized.contentType).toBe('ATTACHMENT');
    expect(normalized.content).not.toMatch(/script|onerror|javascript:/);
    expect(normalized.content).toContain('Hi');
    expect(normalized.attachments).toEqual([attachment]);
  });

  it('preserves Facebook message keys and classifies Page messages', async () => {
    const normalized = await fbAdapter.normalize(
      event(
        { ...facebook, senderId: 'page', threadId: 'thread' },
        {
          provider: 'FACEBOOK',
          eventType: 'MESSAGE',
          dedupKey: 'FACEBOOK_MESSAGE:page:msg',
        },
      ),
    );
    expect(normalized.externalConversationId).toBe('FB_MSG:page:thread');
    expect(normalized.direction).toBe('OUTBOUND');
    expect(normalized.senderType).toBe('AGENT');
    expect(normalized.presentation.subject).toBe('Facebook Messenger - page');
    expect(profiles.enrich).not.toHaveBeenCalled();
  });

  it('preserves parent comment threading, subject preview and post context', async () => {
    const normalized = await fbAdapter.normalize(
      event(
        {
          pageId: 'page',
          postId: 'post',
          commentId: 'child',
          parentCommentId: 'parent',
          commenterId: 'customer',
          commenterName: 'Name',
          text: 'a'.repeat(60),
          channelAccountId: '11111111-1111-4111-8111-111111111111',
        },
        {
          provider: 'FACEBOOK',
          eventType: 'COMMENT',
          dedupKey: 'FACEBOOK_COMMENT:page:child',
        },
      ),
    );
    expect(normalized.externalConversationId).toBe(
      'FB_COMMENT:page:post:parent',
    );
    expect(normalized.presentation.subject).toBe(
      `Facebook Comment - Name: "${'a'.repeat(47)}..."`,
    );
    expect(normalized.presentation.originalPost).toEqual({
      id: 'post',
      content: 'Original Facebook Post: https://facebook.com/post',
    });
    expect(profiles.enrich).toHaveBeenCalledTimes(1);
  });

  it.each([{}, { ...email, receivedAt: 'invalid' }])(
    'rejects invalid email input permanently',
    async (payload) => {
      await expect(
        Promise.resolve().then(() => emailAdapter.normalize(event(payload))),
      ).rejects.toBeInstanceOf(PermanentJobError);
    },
  );

  it('rejects invalid Facebook payload and dedup prefix permanently', async () => {
    await expect(
      fbAdapter.normalize(
        event({}, { eventType: 'MESSAGE', dedupKey: 'FACEBOOK_MESSAGE:x' }),
      ),
    ).rejects.toBeInstanceOf(PermanentJobError);
    await expect(fbAdapter.normalize(event(facebook))).rejects.toBeInstanceOf(
      PermanentJobError,
    );
  });

  it('registers adapters through a collection and rejects duplicates', () => {
    const registry = new InboundAdapterRegistry([emailAdapter, fbAdapter]);
    expect(registry.find(event(email))).toBe(emailAdapter);
    expect(registry.find(event({}, { eventType: 'COMMENT' }))).toBeUndefined();
    expect(
      () => new InboundAdapterRegistry([emailAdapter, emailAdapter]),
    ).toThrow('Duplicate inbound adapter');
  });
});
