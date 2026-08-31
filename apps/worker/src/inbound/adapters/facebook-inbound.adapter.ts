import { Injectable } from '@nestjs/common';
import {
  InboundEvent,
  InboundEventType,
  InboundProvider,
} from '@prisma/client';
import { FacebookInboundService } from '../../facebook/services/facebook-inbound.service';
import { InboundProviderAdapter } from './inbound-provider.adapter';

/**
 * Inbound adapter for the FACEBOOK channel.
 *
 * Handles both MESSAGE and COMMENT event types, delegating to
 * {@link FacebookInboundService} for payload normalisation and domain upsert.
 */
@Injectable()
export class FacebookInboundAdapter implements InboundProviderAdapter {
  readonly provider = InboundProvider.FACEBOOK;

  constructor(
    private readonly facebookInboundService: FacebookInboundService,
  ) {}

  supports(eventType: InboundEventType): boolean {
    return (
      eventType === InboundEventType.MESSAGE ||
      eventType === InboundEventType.COMMENT
    );
  }

  process(inboundEvent: InboundEvent): Promise<void> {
    return this.facebookInboundService.process(inboundEvent);
  }
}
