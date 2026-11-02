import { Injectable } from '@nestjs/common';
import {
  FacebookMessagePayloadSchema,
  FacebookCommentPayloadSchema,
} from '@omnidesk/shared';
import { PermanentJobError } from '../../errors/permanent-job.error';
import { FacebookProfileService } from '../../facebook/services/facebook-profile.service';
import { inboundTime } from '../inbound-time';
import type {
  InboundProviderEvent,
  NormalizedInboundMessage,
} from '../inbound.types';
import type { InboundProviderAdapter } from './inbound-provider.adapter';

@Injectable()
export class FacebookInboundAdapter implements InboundProviderAdapter {
  readonly provider = 'FACEBOOK' as const;
  constructor(private readonly profiles: FacebookProfileService) {}

  supports(eventType: InboundProviderEvent['eventType']) {
    return eventType === 'MESSAGE' || eventType === 'COMMENT';
  }

  async normalize(
    event: InboundProviderEvent,
  ): Promise<NormalizedInboundMessage> {
    const comment = event.eventType === 'COMMENT';
    if (
      !event.dedupKey.startsWith(
        comment ? 'FACEBOOK_COMMENT:' : 'FACEBOOK_MESSAGE:',
      )
    ) {
      throw new PermanentJobError('Invalid Facebook dedup key prefix');
    }
    const parsed = comment
      ? FacebookCommentPayloadSchema.safeParse(event.rawPayload)
      : FacebookMessagePayloadSchema.safeParse(event.rawPayload);
    if (!parsed.success)
      throw new PermanentJobError(
        `Invalid Facebook payload: ${parsed.error.message}`,
      );
    const payload = parsed.data;
    const externalId =
      'commenterId' in payload ? payload.commenterId : payload.senderId;
    const name =
      'commenterId' in payload ? payload.commenterName : payload.senderName;
    const externalConversationId =
      'commentId' in payload
        ? `FB_COMMENT:${payload.pageId}:${payload.postId}:${payload.parentCommentId || payload.commentId}`
        : `FB_MSG:${payload.pageId}:${payload.threadId ?? payload.senderId}`;
    const fromPage = externalId === payload.pageId;
    const normalized: NormalizedInboundMessage = {
      channelType: comment ? 'FACEBOOK_COMMENT' : 'FACEBOOK_MESSAGE',
      account: {
        id: payload.channelAccountId,
        type: 'FACEBOOK',
        externalId: payload.pageId,
        displayName: `Facebook Page - ${payload.pageId}`,
        defaultConfig: { mode: 'mock', pageId: payload.pageId },
      },
      customer: { identity: { kind: 'facebook', value: externalId }, name },
      externalConversationId,
      externalMessageId:
        'commentId' in payload ? payload.commentId : payload.messageId,
      content: payload.text,
      contentType: 'TEXT',
      receivedAt: inboundTime(payload.sentAt, event.receivedAt),
      direction: fromPage ? 'OUTBOUND' : 'INBOUND',
      senderType: fromPage ? 'AGENT' : 'CUSTOMER',
      attachments: [],
      presentation: {
        subject: '',
        subjectStyle: 'facebook',
        originalPost:
          'postId' in payload
            ? {
                id: payload.postId,
                content: `Original Facebook Post: https://facebook.com/${payload.postId}`,
              }
            : undefined,
      },
    };
    if (!fromPage)
      await this.profiles.enrich(
        normalized.customer,
        payload.channelAccountId,
        payload.pageId,
      );
    const displayName = normalized.customer.name || externalId;
    const preview =
      payload.text.length > 50
        ? payload.text.substring(0, 47) + '...'
        : payload.text;
    normalized.presentation.subject = comment
      ? `Facebook Comment - ${displayName}: "${preview}"`
      : `Facebook Messenger - ${displayName}`;
    return normalized;
  }
}
