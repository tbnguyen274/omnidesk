import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  ChannelAccountStatus,
  ChannelAccountType,
  EmailSyncStatus,
} from '@prisma/client';
import { QUEUE_NAMES } from '@omnidesk/shared';
import { providerConfig } from '../config/provider.config';
import { PrismaService } from '../database/prisma.service';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class EmailSyncScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailSyncScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private tickInProgress = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  onModuleInit() {
    if (providerConfig.email.inboundMode !== 'live') {
      this.logger.log(
        'Email sync scheduler disabled outside live inbound mode',
      );
      return;
    }

    const intervalMs = providerConfig.email.pollIntervalMs;

    if (intervalMs <= 0) {
      this.logger.warn('Email sync scheduler disabled because interval <= 0');
      return;
    }

    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref?.();

    setTimeout(() => void this.tick(), 1000).unref?.();
    this.logger.log(`Email sync scheduler started every ${intervalMs}ms`);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick() {
    if (this.tickInProgress) {
      this.logger.debug(
        'Skipping email sync tick because previous tick is still running',
      );
      return;
    }

    this.tickInProgress = true;

    try {
      const channelAccount = await this.resolveEmailChannelAccount();

      if (!channelAccount) {
        this.logger.warn(
          'Skipping email sync tick because no mailbox is configured',
        );
        return;
      }

      const syncLog = await this.prisma.emailSyncLog.create({
        data: {
          channelAccountId: channelAccount.id,
          status: EmailSyncStatus.PARTIAL,
        },
      });

      const job = await this.queueService.add(
        QUEUE_NAMES.EMAIL_SYNC,
        'sync-email',
        {
          channelAccountId: channelAccount.id,
          syncLogId: syncLog.id,
          requestedBy: 'scheduler',
        },
      );

      this.logger.log(
        `Queued scheduled email sync job ${job.id} for ${channelAccount.externalId}`,
      );
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error.message : 'Scheduled email sync failed',
      );
    } finally {
      this.tickInProgress = false;
    }
  }

  private async resolveEmailChannelAccount() {
    const existing = await this.prisma.channelAccount.findFirst({
      where: {
        type: ChannelAccountType.EMAIL,
        status: ChannelAccountStatus.ACTIVE,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (existing) {
      return existing;
    }

    const mailbox =
      providerConfig.email.imap.user ?? providerConfig.email.smtp.fromAddress;

    if (!mailbox) {
      return null;
    }

    return this.prisma.channelAccount.create({
      data: {
        type: ChannelAccountType.EMAIL,
        displayName: `Email - ${mailbox}`,
        externalId: mailbox,
        configJson: {
          mailbox,
          mode: 'live',
          createdBy: 'worker-scheduler',
        },
      },
    });
  }
}
