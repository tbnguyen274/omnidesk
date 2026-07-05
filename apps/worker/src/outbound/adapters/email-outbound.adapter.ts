import { Injectable } from '@nestjs/common';
import { OutboundProvider } from '@prisma/client';
import { EmailOutboundService } from '../../email/email-outbound.service';
import {
  OutboundProviderAdapter,
  SendOutboundResult,
} from './outbound-provider.adapter';

@Injectable()
export class EmailOutboundAdapter implements OutboundProviderAdapter {
  readonly provider = OutboundProvider.EMAIL;

  constructor(private readonly emailOutboundService: EmailOutboundService) {}

  send(outboundMessageId: string): Promise<SendOutboundResult> {
    return this.emailOutboundService.sendOutboundMessage(outboundMessageId);
  }

  createTimelineMessage(outboundMessageId: string) {
    return this.emailOutboundService.createTimelineMessage(outboundMessageId);
  }
}
