import type { Job } from 'bullmq';
import type { InboundEventJobPayload } from '@omnidesk/shared';
import { InboundEventsProcessor } from './inbound-events.processor';
import { InboundLeaseLostError } from '../inbound/inbound.types';
import { PermanentJobError } from '../errors/permanent-job.error';
import { InboundEventType, InboundProvider } from '@prisma/client';

describe('InboundEventsProcessor ownership and notification boundary', () => {
  function setup() {
    const claim = {
      event: {
        id: 'event',
        provider: InboundProvider.EMAIL,
        eventType: InboundEventType.EMAIL_RECEIVED,
      },
      leaseStartedAt: new Date(),
    };
    const events = {
      claim: jest.fn().mockResolvedValue(claim),
      completeNoop: jest.fn(),
      fail: jest.fn(),
    };
    const adapter = {
      normalize: jest.fn().mockResolvedValue({ content: 'hello' }),
    };
    const adapters = { find: jest.fn().mockReturnValue(adapter) };
    const ingestion = {
      ingest: jest.fn().mockResolvedValue({ conversationId: 'conversation' }),
    };
    const notifications = { publish: jest.fn() };
    const processor = new InboundEventsProcessor(
      events as never,
      adapters as never,
      ingestion as never,
      notifications as never,
    );
    const run = () =>
      processor.process({
        id: 'job',
        data: { inboundEventId: 'event' },
      } as Job<InboundEventJobPayload>);
    return { claim, events, adapter, adapters, ingestion, notifications, run };
  }

  it('does not normalize unclaimed jobs (processed or currently owned)', async () => {
    const s = setup();
    s.events.claim.mockResolvedValue(null);
    await s.run();
    expect(s.adapter.normalize).not.toHaveBeenCalled();
  });
  it('normalizes, commits and only then publishes notifications', async () => {
    const s = setup();
    await s.run();
    expect(s.ingestion.ingest).toHaveBeenCalledWith(s.claim, {
      content: 'hello',
    });
    expect(s.ingestion.ingest.mock.invocationCallOrder[0]).toBeLessThan(
      s.notifications.publish.mock.invocationCallOrder[0],
    );
    expect(s.events.fail).not.toHaveBeenCalled();
  });
  it.each([new Error('transient'), new PermanentJobError('invalid payload')])(
    'records failure and propagates retry classification',
    async (error) => {
      const s = setup();
      s.adapter.normalize.mockRejectedValue(error);
      await expect(s.run()).rejects.toBe(error);
      expect(s.events.fail).toHaveBeenCalledWith(s.claim, error);
      expect(s.notifications.publish).not.toHaveBeenCalled();
    },
  );
  it('does not publish after transaction rollback', async () => {
    const s = setup();
    s.ingestion.ingest.mockRejectedValue(new Error('rollback'));
    await expect(s.run()).rejects.toThrow('rollback');
    expect(s.notifications.publish).not.toHaveBeenCalled();
  });
  it('does not let an old owner mark a new owner as failed', async () => {
    const s = setup();
    s.ingestion.ingest.mockRejectedValue(new InboundLeaseLostError('event'));
    await expect(s.run()).rejects.toBeInstanceOf(InboundLeaseLostError);
    expect(s.events.fail).not.toHaveBeenCalled();
  });
  it('completes unsupported events as no-op', async () => {
    const s = setup();
    s.adapters.find.mockReturnValue(undefined);
    await s.run();
    expect(s.events.completeNoop).toHaveBeenCalledWith(s.claim);
    expect(s.ingestion.ingest).not.toHaveBeenCalled();
  });
  it('never marks a committed domain transaction failed on notification error', async () => {
    const s = setup();
    s.notifications.publish.mockRejectedValue(new Error('notification error'));
    await expect(s.run()).rejects.toThrow('notification error');
    expect(s.events.fail).not.toHaveBeenCalled();
  });
});
