import { Injectable } from '@nestjs/common';
import { OutboundProvider } from '@prisma/client';
import { EmailOutboundAdapter } from './email-outbound.adapter';
import { FacebookOutboundAdapter } from './facebook-outbound.adapter';
import { OutboundProviderAdapter } from './outbound-provider.adapter';

@Injectable()
export class OutboundAdapterRegistry {
  private readonly adapters: Map<OutboundProvider, OutboundProviderAdapter>;

  constructor(
    emailOutboundAdapter: EmailOutboundAdapter,
    facebookOutboundAdapter: FacebookOutboundAdapter,
  ) {
    this.adapters = new Map(
      [emailOutboundAdapter, facebookOutboundAdapter].map((adapter) => [
        adapter.provider,
        adapter,
      ]),
    );
  }

  get(provider: OutboundProvider) {
    const adapter = this.adapters.get(provider);

    if (!adapter) {
      throw new Error(`Outbound adapter for provider ${provider} not found`);
    }

    return adapter;
  }
}
