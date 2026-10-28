import { Test } from '@nestjs/testing';
import { QueueModule } from './queue.module';
import { QueueService } from './queue.service';
import { PrismaService } from '../database/prisma.service';
import { RealtimeEventsPublisher } from '../realtime/realtime-events.publisher';
import { InboundAdapterRegistry } from '../inbound/adapters/inbound-adapter.registry';

describe('Worker wiring and graceful shutdown', () => {
  it('wires adapters through DI and keeps DB/realtime alive until jobs drain', async () => {
    let release!: () => void;
    let started!: () => void;
    const drain = new Promise<void>((resolve) => {
      release = resolve;
    });
    const draining = new Promise<void>((resolve) => {
      started = resolve;
    });
    const module = await Test.createTestingModule({ imports: [QueueModule] })
      .overrideProvider(QueueService)
      .useValue({
        removeRepeatable: jest.fn(),
        onModuleDestroy: async () => {
          started();
          await drain;
        },
      })
      .compile();
    const registry = module.get(InboundAdapterRegistry);
    expect(
      registry.find({ provider: 'EMAIL', eventType: 'EMAIL_RECEIVED' })
        ?.provider,
    ).toBe('EMAIL');
    expect(
      registry.find({ provider: 'FACEBOOK', eventType: 'COMMENT' })?.provider,
    ).toBe('FACEBOOK');
    const disconnect = jest
      .spyOn(module.get(PrismaService), '$disconnect')
      .mockResolvedValue(undefined);
    const quit = jest
      .spyOn(module.get(RealtimeEventsPublisher), 'onApplicationShutdown')
      .mockResolvedValue(undefined);
    const closing = module.close();
    try {
      await draining;
      expect(disconnect).not.toHaveBeenCalled();
      expect(quit).not.toHaveBeenCalled();
    } finally {
      release();
      await closing;
    }
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(quit).toHaveBeenCalledTimes(1);
  });
});
