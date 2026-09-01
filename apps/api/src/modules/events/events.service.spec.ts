import { ChannelType, InboundEventType, InboundProvider } from '@prisma/client';
import { EventsService } from './events.service';

describe('EventsService', () => {
  let service: EventsService;
  let eventsRepository: any;
  let prisma: any;
  let outboxService: any;
  let outboxDispatcher: any;
  let tx: any;

  beforeEach(() => {
    tx = {
      inboundEvent: {
        create: jest.fn().mockResolvedValue({
          id: 'inbound-1',
          provider: InboundProvider.FACEBOOK,
          eventType: InboundEventType.MESSAGE,
          dedupKey: 'fb_msg_1',
          rawPayload: {},
        }),
      },
    };

    eventsRepository = {
      findInboundByDedupKey: jest.fn().mockResolvedValue(null),
      listInbound: jest.fn().mockResolvedValue([[], 0]),
      listOutbound: jest.fn().mockResolvedValue([[], 0]),
    };

    prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };

    outboxService = {
      createEvent: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
    };

    outboxDispatcher = {
      trigger: jest.fn(),
    };

    service = new EventsService(
      eventsRepository,
      prisma,
      outboxService,
      outboxDispatcher,
    );
  });

  it('creates an inbound event, writes outbox event, and triggers fast-path dispatch', async () => {
    const result = await service.createInbound({
      provider: InboundProvider.FACEBOOK,
      eventType: InboundEventType.MESSAGE,
      channelType: ChannelType.FACEBOOK_MESSAGE,
      dedupKey: 'fb_msg_1',
      rawPayload: {},
    });

    expect(eventsRepository.findInboundByDedupKey).toHaveBeenCalledWith(
      'fb_msg_1',
    );
    expect(tx.inboundEvent.create).toHaveBeenCalled();
    expect(outboxService.createEvent).toHaveBeenCalledWith(
      tx,
      'INBOUND_EVENT_CREATED',
      'inbound-1',
      expect.objectContaining({
        inboundEventId: 'inbound-1',
        dedupKey: 'fb_msg_1',
      }),
    );
    expect(outboxDispatcher.trigger).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      inboundEvent: expect.objectContaining({ id: 'inbound-1' }),
      duplicated: false,
      queued: false,
    });
  });

  it('returns duplicated without outbox trigger if dedupKey exists', async () => {
    eventsRepository.findInboundByDedupKey.mockResolvedValueOnce({
      id: 'existing-inbound',
    });

    const result = await service.createInbound({
      provider: InboundProvider.FACEBOOK,
      eventType: InboundEventType.MESSAGE,
      channelType: ChannelType.FACEBOOK_MESSAGE,
      dedupKey: 'fb_msg_existing',
      rawPayload: {},
    });

    expect(result.duplicated).toBe(true);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(outboxDispatcher.trigger).not.toHaveBeenCalled();
  });
});
