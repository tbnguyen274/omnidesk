import { QUEUE_NAMES } from '@omnidesk/shared';
import { ConversationStatus, Priority } from '@prisma/client';
import { OutboxDispatcherService } from './outbox-dispatcher.service';

describe('OutboxDispatcherService', () => {
  let dispatcher: OutboxDispatcherService;
  let outboxService: any;
  let queuesService: any;

  beforeEach(() => {
    outboxService = {
      findPending: jest.fn(),
      markPublished: jest.fn(),
      markFailed: jest.fn(),
      incrementAttempts: jest.fn(),
      cleanup: jest.fn().mockResolvedValue({ count: 0 }),
    };

    queuesService = {
      addWithJobId: jest.fn().mockResolvedValue({ id: 'job-123' }),
    };

    dispatcher = new OutboxDispatcherService(outboxService, queuesService);
  });

  afterEach(() => {
    dispatcher.onModuleDestroy();
  });

  it('dispatches INBOUND_EVENT_CREATED to INBOUND_EVENTS queue', async () => {
    outboxService.findPending.mockResolvedValueOnce([
      {
        id: 'evt-1',
        type: 'INBOUND_EVENT_CREATED',
        payload: { inboundEventId: 'inbound-123' },
        attempts: 0,
      },
    ]);

    await dispatcher.dispatch();

    expect(queuesService.addWithJobId).toHaveBeenCalledWith(
      QUEUE_NAMES.INBOUND_EVENTS,
      'process-inbound-event',
      { inboundEventId: 'inbound-123' },
      'outbox:evt-1',
    );
    expect(outboxService.markPublished).toHaveBeenCalledWith(
      'evt-1',
      'job-123',
    );
  });

  it('maps CONVERSATION_STATUS_CHANGED (CLOSED) to MOVE_TO_ARCHIVE with deterministic jobId', async () => {
    outboxService.findPending.mockResolvedValueOnce([
      {
        id: 'evt-2',
        type: 'CONVERSATION_STATUS_CHANGED',
        payload: {
          conversationId: 'c-1',
          newStatus: ConversationStatus.CLOSED,
          channelType: 'EMAIL',
          channelAccountId: 'ca-1',
          externalMessageId: 'msg-ext-1',
        },
        attempts: 0,
      },
    ]);

    await dispatcher.dispatch();

    expect(queuesService.addWithJobId).toHaveBeenCalledWith(
      QUEUE_NAMES.EMAIL_ACTIONS,
      'email-channel-action',
      {
        action: 'MOVE_TO_ARCHIVE',
        messageId: 'msg-ext-1',
        channelAccountId: 'ca-1',
      },
      'outbox:evt-2',
    );
    expect(outboxService.markPublished).toHaveBeenCalledWith(
      'evt-2',
      'job-123',
    );
  });

  it('maps CONVERSATION_PRIORITY_CHANGED (URGENT/HIGH) to MARK_STARRED', async () => {
    outboxService.findPending.mockResolvedValueOnce([
      {
        id: 'evt-3',
        type: 'CONVERSATION_PRIORITY_CHANGED',
        payload: {
          conversationId: 'c-1',
          newPriority: Priority.URGENT,
          channelType: 'EMAIL',
          channelAccountId: 'ca-1',
          externalMessageId: 'msg-ext-1',
        },
        attempts: 0,
      },
    ]);

    await dispatcher.dispatch();

    expect(queuesService.addWithJobId).toHaveBeenCalledWith(
      QUEUE_NAMES.EMAIL_ACTIONS,
      'email-channel-action',
      {
        action: 'MARK_STARRED',
        messageId: 'msg-ext-1',
        channelAccountId: 'ca-1',
      },
      'outbox:evt-3',
    );
    expect(outboxService.markPublished).toHaveBeenCalledWith(
      'evt-3',
      'job-123',
    );
  });

  it('maps CONVERSATION_READ_STATUS_CHANGED (true) to MARK_READ', async () => {
    outboxService.findPending.mockResolvedValueOnce([
      {
        id: 'evt-4',
        type: 'CONVERSATION_READ_STATUS_CHANGED',
        payload: {
          conversationId: 'c-1',
          isRead: true,
          channelType: 'EMAIL',
          channelAccountId: 'ca-1',
          externalMessageId: 'msg-ext-1',
        },
        attempts: 0,
      },
    ]);

    await dispatcher.dispatch();

    expect(queuesService.addWithJobId).toHaveBeenCalledWith(
      QUEUE_NAMES.EMAIL_ACTIONS,
      'email-channel-action',
      {
        action: 'MARK_READ',
        messageId: 'msg-ext-1',
        channelAccountId: 'ca-1',
      },
      'outbox:evt-4',
    );
    expect(outboxService.markPublished).toHaveBeenCalledWith(
      'evt-4',
      'job-123',
    );
  });

  it('handles No-op event without downstream action by marking no_action_required', async () => {
    outboxService.findPending.mockResolvedValueOnce([
      {
        id: 'evt-5',
        type: 'CONVERSATION_STATUS_CHANGED',
        payload: {
          conversationId: 'c-1',
          newStatus: ConversationStatus.RESOLVED, // RESOLVED requires no IMAP action
          channelType: 'EMAIL',
          channelAccountId: 'ca-1',
          externalMessageId: 'msg-ext-1',
        },
        attempts: 0,
      },
      {
        id: 'evt-6',
        type: 'CONVERSATION_STATUS_CHANGED',
        payload: {
          conversationId: 'c-2',
          newStatus: ConversationStatus.CLOSED,
          channelType: 'FACEBOOK_MESSAGE', // Non-EMAIL channel
          channelAccountId: 'ca-2',
        },
        attempts: 0,
      },
    ]);

    await dispatcher.dispatch();

    expect(queuesService.addWithJobId).not.toHaveBeenCalled();
    expect(outboxService.markPublished).toHaveBeenCalledWith(
      'evt-5',
      'no_action_required',
    );
    expect(outboxService.markPublished).toHaveBeenCalledWith(
      'evt-6',
      'no_action_required',
    );
  });

  it('marks outbox event failed when unknown event type is encountered', async () => {
    outboxService.findPending.mockResolvedValueOnce([
      {
        id: 'evt-unknown',
        type: 'UNKNOWN_TYPE',
        payload: {},
        attempts: 0,
      },
    ]);

    await dispatcher.dispatch();

    expect(outboxService.markFailed).toHaveBeenCalledWith(
      'evt-unknown',
      'Unknown event type: UNKNOWN_TYPE',
    );
  });
});
