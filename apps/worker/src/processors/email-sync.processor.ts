import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EmailSyncJobPayload } from '@omnidesk/shared';
import { EmailSyncStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class EmailSyncProcessor {
  private readonly logger = new Logger(EmailSyncProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  async process(job: Job<EmailSyncJobPayload>) {
    if (!job.data.syncLogId) {
      this.logger.log(`Email sync mock processed job ${job.id}`);
      return;
    }

    await this.prisma.emailSyncLog.update({
      where: { id: job.data.syncLogId },
      data: {
        status: EmailSyncStatus.SUCCESS,
        syncFinishedAt: new Date(),
        fetchedCount: 0,
        processedCount: 0,
        errorMessage: null,
      },
    });
  }
}
