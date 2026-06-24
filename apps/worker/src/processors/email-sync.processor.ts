import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EmailSyncJobPayload } from '@omnidesk/shared';
import { EmailSyncStatus } from '@prisma/client';
import { providerConfig } from '../config/provider.config';
import { PrismaService } from '../database/prisma.service';
import { EmailLiveInboundService } from '../email/email-live-inbound.service';

@Injectable()
export class EmailSyncProcessor {
  private readonly logger = new Logger(EmailSyncProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailLiveInboundService: EmailLiveInboundService,
  ) {}

  async process(job: Job<EmailSyncJobPayload>) {
    if (!job.data.syncLogId) {
      this.logger.log(`Email sync mock processed job ${job.id}`);
      return;
    }

    try {
      const result =
        providerConfig.email.inboundMode === 'live' && job.data.channelAccountId
          ? await this.emailLiveInboundService.sync({
              channelAccountId: job.data.channelAccountId,
            })
          : { fetchedCount: 0, processedCount: 0 };

      await this.prisma.emailSyncLog.update({
        where: { id: job.data.syncLogId },
        data: {
          status: EmailSyncStatus.SUCCESS,
          syncFinishedAt: new Date(),
          fetchedCount: result.fetchedCount,
          processedCount: result.processedCount,
          errorMessage: null,
        },
      });
    } catch (error) {
      await this.prisma.emailSyncLog.update({
        where: { id: job.data.syncLogId },
        data: {
          status: EmailSyncStatus.FAILED,
          syncFinishedAt: new Date(),
          errorMessage:
            error instanceof Error ? error.message : 'Email sync failed',
        },
      });

      throw error;
    }
  }
}
