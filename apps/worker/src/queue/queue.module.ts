import { Module } from '@nestjs/common';
import { INBOUND_ADAPTERS } from '../inbound/adapters/inbound-provider.adapter';
import { InboundEventRepository } from '../inbound/ingestion/inbound-event.repository';
import { InboundIngestionRepository } from '../inbound/ingestion/inbound-ingestion.repository';
import { InboundIngestionService } from '../inbound/ingestion/inbound-ingestion.service';
import { InboundNotificationsService } from '../inbound/ingestion/inbound-notifications.service';
import { FacebookProfileService } from '../facebook/services/facebook-profile.service';
import { ChannelAccountCredentialsReader } from '../facebook/services/channel-account-credentials.reader';
import { PrismaService } from '../database/prisma.service';
import { EmailLiveInboundService } from '../email/email-live-inbound.service';
import { EmailOutboundService } from '../email/email-outbound.service';
import { EmailSyncScheduler } from '../email/email-sync.scheduler';
import { FacebookOutboundService } from '../facebook/services/facebook-outbound.service';
import { EmailSyncProcessor } from '../processors/email-sync.processor';
import { EmailActionsProcessor } from '../processors/email-actions.processor';
import { EmailActionsService } from '../email/email-actions.service';
import { EmailInboundAdapter } from '../inbound/adapters/email-inbound.adapter';
import { FacebookInboundAdapter } from '../inbound/adapters/facebook-inbound.adapter';
import { InboundAdapterRegistry } from '../inbound/adapters/inbound-adapter.registry';
import { EmailOutboundAdapter } from '../outbound/adapters/email-outbound.adapter';
import { FacebookOutboundAdapter } from '../outbound/adapters/facebook-outbound.adapter';
import { OutboundAdapterRegistry } from '../outbound/adapters/outbound-adapter.registry';
import { InboundEventsProcessor } from '../processors/inbound-events.processor';
import { OutboundMessagesProcessor } from '../processors/outbound-messages.processor';
import { SlaCheckProcessor } from '../processors/sla-check.processor';
import { SlaCheckScheduler } from '../processors/sla-check.scheduler';
import { AutoCloseProcessor } from '../processors/auto-close.processor';
import { AutoCloseScheduler } from '../processors/auto-close.scheduler';
import { StorageModule } from '../storage/storage.module';
import { QueueService } from './queue.service';
import { RealtimeEventsPublisher } from '../realtime/realtime-events.publisher';

@Module({
  imports: [StorageModule],
  providers: [
    PrismaService,
    RealtimeEventsPublisher,
    // --- Inbound ---
    EmailLiveInboundService,
    EmailSyncScheduler,
    EmailInboundAdapter,
    FacebookInboundAdapter,
    InboundAdapterRegistry,
    InboundEventRepository,
    InboundIngestionRepository,
    InboundIngestionService,
    InboundNotificationsService,
    FacebookProfileService,
    ChannelAccountCredentialsReader,
    {
      provide: INBOUND_ADAPTERS,
      useFactory: (
        email: EmailInboundAdapter,
        facebook: FacebookInboundAdapter,
      ) => [email, facebook],
      inject: [EmailInboundAdapter, FacebookInboundAdapter],
    },
    // --- Outbound ---
    EmailOutboundService,
    FacebookOutboundService,
    EmailOutboundAdapter,
    FacebookOutboundAdapter,
    OutboundAdapterRegistry,
    // --- Processors & Schedulers ---
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
