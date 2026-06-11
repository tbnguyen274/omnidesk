import { Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { EmailInboundService } from '../email/email-inbound.service';
import { EmailOutboundService } from '../email/email-outbound.service';
import { EmailSyncProcessor } from '../processors/email-sync.processor';
import { InboundEventsProcessor } from '../processors/inbound-events.processor';
import { OutboundMessagesProcessor } from '../processors/outbound-messages.processor';
import { QueueService } from './queue.service';

@Module({
  providers: [
    PrismaService,
    EmailInboundService,
    EmailOutboundService,
    InboundEventsProcessor,
    OutboundMessagesProcessor,
    EmailSyncProcessor,
    QueueService,
  ],
  exports: [QueueService],
})
export class QueueModule {}
