import { OutboundProvider } from '@prisma/client';
import { EmailOutboundAdapter } from './email-outbound.adapter';
import { FacebookOutboundAdapter } from './facebook-outbound.adapter';
import { OutboundAdapterRegistry } from './outbound-adapter.registry';

describe('Outbound adapters', () => {
  it('delegates email send and timeline creation to EmailOutboundService', async () => {
    const emailService = {
      sendOutboundMessage: jest.fn().mockResolvedValue({
        externalMessageId: 'email-1',
        sentAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
      createTimelineMessage: jest.fn().mockResolvedValue(undefined),
    };
    const adapter = new EmailOutboundAdapter(emailService as never);

    await expect(adapter.send('outbound-1')).resolves.toMatchObject({
      externalMessageId: 'email-1',
    });
    await adapter.createTimelineMessage('outbound-1');

    expect(adapter.provider).toBe(OutboundProvider.EMAIL);
    expect(emailService.sendOutboundMessage).toHaveBeenCalledWith('outbound-1');
    expect(emailService.createTimelineMessage).toHaveBeenCalledWith(
      'outbound-1',
    );
  });

  it('delegates facebook send and timeline creation to FacebookOutboundService', async () => {
    const facebookService = {
      sendOutboundMessage: jest.fn().mockResolvedValue({
        externalMessageId: 'fb-1',
        sentAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
      createTimelineMessage: jest.fn().mockResolvedValue(undefined),
    };
    const adapter = new FacebookOutboundAdapter(facebookService as never);

    await expect(adapter.send('outbound-1')).resolves.toMatchObject({
      externalMessageId: 'fb-1',
    });
    await adapter.createTimelineMessage('outbound-1');

    expect(adapter.provider).toBe(OutboundProvider.FACEBOOK);
    expect(facebookService.sendOutboundMessage).toHaveBeenCalledWith(
      'outbound-1',
    );
    expect(facebookService.createTimelineMessage).toHaveBeenCalledWith(
      'outbound-1',
    );
  });

  it('resolves provider adapters and fails fast for missing providers', () => {
    const emailAdapter = {
      provider: OutboundProvider.EMAIL,
      send: jest.fn(),
      createTimelineMessage: jest.fn(),
    } as unknown as EmailOutboundAdapter;
    const facebookAdapter = {
      provider: OutboundProvider.FACEBOOK,
      send: jest.fn(),
      createTimelineMessage: jest.fn(),
    } as unknown as FacebookOutboundAdapter;
    const registry = new OutboundAdapterRegistry(emailAdapter, facebookAdapter);

    expect(registry.get(OutboundProvider.EMAIL)).toBe(emailAdapter);
    expect(registry.get(OutboundProvider.FACEBOOK)).toBe(facebookAdapter);
    expect(() => registry.get('SMS' as OutboundProvider)).toThrow(
      'Outbound adapter for provider SMS not found',
    );
  });
});
