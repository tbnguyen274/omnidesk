import { Inject, Injectable } from '@nestjs/common';
import type { ChannelProvider } from '@omnidesk/shared';
import type { InboundProviderEvent } from '../inbound.types';
import { INBOUND_ADAPTERS } from './inbound-provider.adapter';
import type { InboundProviderAdapter } from './inbound-provider.adapter';

@Injectable()
export class InboundAdapterRegistry {
  private readonly adapters = new Map<
    ChannelProvider,
    InboundProviderAdapter
  >();

  constructor(@Inject(INBOUND_ADAPTERS) adapters: InboundProviderAdapter[]) {
    for (const adapter of adapters) {
      if (this.adapters.has(adapter.provider))
        throw new Error(`Duplicate inbound adapter: ${adapter.provider}`);
      this.adapters.set(adapter.provider, adapter);
    }
  }

  find(event: Pick<InboundProviderEvent, 'provider' | 'eventType'>) {
    const adapter = this.adapters.get(event.provider);
    return adapter?.supports(event.eventType) ? adapter : undefined;
  }
}
