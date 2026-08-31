import { Injectable } from '@nestjs/common';
import {
  InboundEvent,
  InboundEventType,
  InboundProvider,
} from '@prisma/client';
import { EmailInboundService } from '../../email/email-inbound.service';
import { InboundProviderAdapter } from './inbound-provider.adapter';

/**
 * Inbound adapter for the EMAIL channel.
 *
 * Delegates processing to {@link EmailInboundService} which handles MIME
 * parsing, thread matching, and domain upsert (Customer -> Conversation ->
 * Message -> Ticket).
 */
@Injectable()
export class EmailInboundAdapter implements InboundProviderAdapter {
  readonly provider = InboundProvider.EMAIL;

  constructor(private readonly emailInboundService: EmailInboundService) {}

  supports(eventType: InboundEventType): boolean {
    return eventType === InboundEventType.EMAIL_RECEIVED;
  }

  process(inboundEvent: InboundEvent): Promise<void> {
    return this.emailInboundService.process(inboundEvent);
  }
}
