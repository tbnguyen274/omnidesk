import { Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { EmailInboundService } from '../email/email-inbound.service';
import { EmailLiveInboundService } from '../email/email-live-inbound.service';
import { EmailOutboundService } from '../email/email-outbound.service';
import { EmailSyncScheduler } from '../email/email-sync.scheduler';
import { FacebookInboundRepository } from '../facebook/repositories/facebook-inbound.repository';
import { FacebookOutboundRepository } from '../facebook/repositories/facebook-outbound.repository';
import { FacebookInboundService } from '../facebook/services/facebook-inbound.service';
import { FacebookOutboundService } from '../facebook/services/facebook-outbound.service';
import { EmailSyncProcessor } from '../processors/email-sync.processor';
import { EmailActionsProcessor } from '../processors/email-actions.processor';
import { EmailActionsService } from '../email/email-actions.service';
import { EmailOutboundAdapter } from '../outbound/adapters/email-outbound.adapter';
import { FacebookOutboundAdapter } from '../outbound/adapters/facebook-outbound.adapter';
import { OutboundAdapterRegistry } from '../outbound/adapters/outbound-adapter.registry';
import { InboundEventsProcessor } from '../processors/inbound-events.processor';
import { OutboundMessagesProcessor } from '../processors/outbound-messages.processor';
import { SlaCheckProcessor } from '../processors/sla-check.processor';
import { SlaCheckScheduler } from '../processors/sla-check.scheduler';
import { AutoCloseProcessor } from '../processors/auto-close.processor';
import { AutoCloseScheduler } from '../processors/auto-close.scheduler';
import { RealtimeEventsPublisher } from '../realtime/realtime-events.publisher';
import { QueueService } from './queue.service';

@Module({
  providers: [
    PrismaService,
    RealtimeEventsPublisher,
    EmailInboundService,
    EmailLiveInboundService,
    EmailOutboundService,
    EmailSyncScheduler,
    FacebookInboundRepository,
    FacebookInboundService,
    FacebookOutboundRepository,
    FacebookOutboundService,
    EmailOutboundAdapter,
    FacebookOutboundAdapter,
    OutboundAdapterRegistry,
    InboundEventsProcessor,
    OutboundMessagesProcessor,
    EmailSyncProcessor,
    EmailActionsProcessor,
    EmailActionsService,
    SlaCheckProcessor,
    SlaCheckScheduler,
    AutoCloseProcessor,
    AutoCloseScheduler,
    QueueService,
  ],
  exports: [QueueService],
})
export class QueueModule {}
