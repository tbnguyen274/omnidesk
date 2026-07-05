import { Injectable } from '@nestjs/common';
import { OutboundProvider } from '@prisma/client';
import { FacebookOutboundService } from '../../facebook/services/facebook-outbound.service';
import {
  OutboundProviderAdapter,
  SendOutboundResult,
} from './outbound-provider.adapter';

@Injectable()
export class FacebookOutboundAdapter implements OutboundProviderAdapter {
  readonly provider = OutboundProvider.FACEBOOK;

  constructor(
    private readonly facebookOutboundService: FacebookOutboundService,
  ) {}

  send(outboundMessageId: string): Promise<SendOutboundResult> {
    return this.facebookOutboundService.sendOutboundMessage(outboundMessageId);
  }

  createTimelineMessage(outboundMessageId: string) {
    return this.facebookOutboundService.createTimelineMessage(
      outboundMessageId,
    );
  }
}
