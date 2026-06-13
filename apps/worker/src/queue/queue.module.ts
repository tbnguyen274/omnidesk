import { Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { EmailInboundService } from '../email/email-inbound.service';
import { EmailOutboundService } from '../email/email-outbound.service';
import { FacebookInboundRepository } from '../facebook/repositories/facebook-inbound.repository';
import { FacebookOutboundRepository } from '../facebook/repositories/facebook-outbound.repository';
import { FacebookInboundService } from '../facebook/services/facebook-inbound.service';
import { FacebookOutboundService } from '../facebook/services/facebook-outbound.service';
import { EmailSyncProcessor } from '../processors/email-sync.processor';
import { InboundEventsProcessor } from '../processors/inbound-events.processor';
import { OutboundMessagesProcessor } from '../processors/outbound-messages.processor';
import { SlaCheckProcessor } from '../processors/sla-check.processor';
import { RealtimeEventsPublisher } from '../realtime/realtime-events.publisher';
import { QueueService } from './queue.service';

@Module({
  providers: [
    PrismaService,
    RealtimeEventsPublisher,
    EmailInboundService,
    EmailOutboundService,
    FacebookInboundRepository,
    FacebookInboundService,
    FacebookOutboundRepository,
    FacebookOutboundService,
    InboundEventsProcessor,
    OutboundMessagesProcessor,
    EmailSyncProcessor,
    SlaCheckProcessor,
    QueueService,
  ],
  exports: [QueueService],
})
export class QueueModule {}
