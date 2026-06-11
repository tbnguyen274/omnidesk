import { Injectable } from '@nestjs/common';
import { FacebookOutboundRepository } from '../repositories/facebook-outbound.repository';

@Injectable()
export class FacebookOutboundService {
  constructor(
    private readonly facebookOutboundRepository: FacebookOutboundRepository,
  ) {}

  async createTimelineMessage(outboundMessageId: string) {
    await this.facebookOutboundRepository.createTimelineMessage(
      outboundMessageId,
    );
  }
}
