import { Injectable } from '@nestjs/common';
import { InboundEvent, InboundProvider } from '@prisma/client';
import { EmailInboundAdapter } from './email-inbound.adapter';
import { FacebookInboundAdapter } from './facebook-inbound.adapter';
import { InboundProviderAdapter } from './inbound-provider.adapter';

/**
 * Registry (Strategy pattern) for all inbound provider adapters.
 *
 * Mirrors {@link OutboundAdapterRegistry} on the send side.
 *
 * At construction time each concrete adapter is registered by its
 * {@link InboundProviderAdapter.provider} key. Callers use {@link find} to
 * obtain the adapter that can handle a specific event, so
 * {@link InboundEventsProcessor} never needs to know about individual channels.
 *
 * Adding a new inbound channel is as simple as:
 *  1. Implementing {@link InboundProviderAdapter}.
 *  2. Injecting it into this registry's constructor.
 *  3. Registering it in {@link QueueModule}.
 *
 * No changes to the processor are required.
 */
@Injectable()
export class InboundAdapterRegistry {
  private readonly adapters: Map<InboundProvider, InboundProviderAdapter>;

  constructor(
    emailInboundAdapter: EmailInboundAdapter,
    facebookInboundAdapter: FacebookInboundAdapter,
  ) {
    this.adapters = new Map(
      [emailInboundAdapter, facebookInboundAdapter].map((adapter) => [
        adapter.provider,
        adapter,
      ]),
    );
  }

  /**
   * Finds the adapter that can handle the given {@link InboundEvent}.
   *
   * Returns `undefined` when no registered adapter matches both the provider
   * and the event type. The processor treats this as an unknown/no-op event.
   */
  find(event: Pick<InboundEvent, 'provider' | 'eventType'>): InboundProviderAdapter | undefined {
    const adapter = this.adapters.get(event.provider);
    if (!adapter) return undefined;
    return adapter.supports(event.eventType) ? adapter : undefined;
  }
}
