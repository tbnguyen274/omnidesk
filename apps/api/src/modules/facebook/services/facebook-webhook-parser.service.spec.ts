import { ChannelType, InboundEventType } from '@prisma/client';
import { FacebookWebhookParserService } from './facebook-webhook-parser.service';

describe('FacebookWebhookParserService', () => {
  const service = new FacebookWebhookParserService();

  it('parses live Messenger message events', () => {
    const events = service.parse({
      object: 'page',
      entry: [
        {
          id: 'page-1',
          messaging: [
            {
              sender: { id: 'psid-1' },
              recipient: { id: 'page-1' },
              timestamp: 1710000000000,
              message: {
                mid: 'mid-1',
                text: 'Hello OmniDesk',
              },
            },
          ],
        },
      ],
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: InboundEventType.MESSAGE,
      channelType: ChannelType.FACEBOOK_MESSAGE,
      externalEventId: 'mid-1',
      dedupKey: 'FACEBOOK_MESSAGE:page-1:mid-1',
      rawPayload: {
        pageId: 'page-1',
        senderId: 'psid-1',
        messageId: 'mid-1',
        text: 'Hello OmniDesk',
      },
    });
  });

  it('ignores Messenger echo events', () => {
    const events = service.parse({
      entry: [
        {
          id: 'page-1',
          messaging: [
            {
              sender: { id: 'page-1' },
              message: {
                mid: 'mid-echo',
                text: 'Own outbound echo',
                is_echo: true,
              },
            },
          ],
        },
      ],
    });

    expect(events).toHaveLength(0);
  });

  it('parses live Page comment changes (real Facebook payload with from object)', () => {
    const events = service.parse({
      object: 'page',
      entry: [
        {
          id: 'page-1',
          changes: [
            {
              field: 'feed',
              value: {
                item: 'comment',
                verb: 'add',
                post_id: 'post-1',
                comment_id: 'comment-1',
                // Real Facebook live webhook uses `from: { id, name }` — NOT `sender_id`
                from: {
                  id: 'user-1',
                  name: 'Commenter',
                },
                message: 'I need help',
                created_time: 1710000000000,
              },
            },
          ],
        },
      ],
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: InboundEventType.COMMENT,
      channelType: ChannelType.FACEBOOK_COMMENT,
      externalEventId: 'comment-1',
      dedupKey: 'FACEBOOK_COMMENT:page-1:comment-1',
      rawPayload: {
        pageId: 'page-1',
        postId: 'post-1',
        commentId: 'comment-1',
        commenterId: 'user-1',
        commenterName: 'Commenter',
        text: 'I need help',
      },
    });
  });

  it('ignores unsupported webhook entries', () => {
    const events = service.parse({
      object: 'page',
      entry: [
        {
          id: 'page-1',
          messaging: [{ sender: { id: 'psid-1' }, read: { watermark: 1 } }],
          changes: [{ field: 'ratings', value: {} }],
        },
      ],
    });

    expect(events).toHaveLength(0);
  });

  it('falls back to sender_id when from object is absent (mock/legacy payloads)', () => {
    const events = service.parse({
      object: 'page',
      entry: [
        {
          id: 'page-1',
          changes: [
            {
              field: 'feed',
              value: {
                item: 'comment',
                verb: 'add',
                post_id: 'post-1',
                comment_id: 'comment-1',
                sender_id: 'user-legacy',
                sender_name: 'Legacy Commenter',
                message: 'Legacy comment',
                created_time: 1710000000000,
              },
            },
          ],
        },
      ],
    });

    expect(events).toHaveLength(1);
    expect(events[0].rawPayload).toMatchObject({
      commenterId: 'user-legacy',
      commenterName: 'Legacy Commenter',
    });
  });

  it('ignores comment change when sender info is completely absent', () => {
    const events = service.parse({
      object: 'page',
      entry: [
        {
          id: 'page-1',
          changes: [
            {
              field: 'feed',
              value: {
                item: 'comment',
                verb: 'add',
                post_id: 'post-1',
                comment_id: 'comment-1',
                // no `from` and no `sender_id`
                message: 'Anonymous comment',
              },
            },
          ],
        },
      ],
    });

    expect(events).toHaveLength(0);
  });
});
