import {
  InboundNotificationsService,
  INBOUND_NOTIFICATION_TIMEOUT_MS,
} from './inbound-notifications.service';

describe('InboundNotificationsService', () => {
  afterEach(() => jest.useRealTimers());
  it('does not wait forever for buffered Redis commands during an outage', async () => {
    jest.useFakeTimers();
    const publisher = {
      publish: jest.fn(() => new Promise<void>(() => {})),
      conversationRoom: () => 'conversation:id',
      teamInboxRoom: () => 'team:inbox',
    };
    const pending = new InboundNotificationsService(publisher as never).publish(
      {
        inboundEventId: 'event',
        conversationId: 'id',
        conversationCreated: false,
        messageId: null,
        ticketId: null,
        duplicated: false,
      },
    );
    await jest.advanceTimersByTimeAsync(INBOUND_NOTIFICATION_TIMEOUT_MS);
    await expect(pending).resolves.toBeUndefined();
  });
  it('contains publish failures and attempts each event independently', async () => {
    const publisher = {
      publish: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
      conversationRoom: () => 'conversation:id',
      teamInboxRoom: () => 'team:inbox',
    };
    const service = new InboundNotificationsService(publisher as never);
    await expect(
      service.publish({
        inboundEventId: 'event',
        conversationId: 'id',
        conversationCreated: true,
        messageId: 'message',
        ticketId: 'ticket',
        duplicated: false,
      }),
    ).resolves.toBeUndefined();
    expect(publisher.publish).toHaveBeenCalledTimes(3);
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'message.created' }),
      ['conversation:id', 'team:inbox'],
    );
  });
  it('does not publish domain events for duplicate delivery', async () => {
    const publisher = { publish: jest.fn() };
    await new InboundNotificationsService(publisher as never).publish({
      inboundEventId: 'event',
      conversationId: 'id',
      conversationCreated: false,
      messageId: null,
      ticketId: null,
      duplicated: true,
    });
    expect(publisher.publish).not.toHaveBeenCalled();
  });
});
