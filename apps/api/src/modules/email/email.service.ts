import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChannelAccountType,
  ChannelType,
  InboundEventType,
  InboundProvider,
  Prisma,
} from '@prisma/client';
import { MockInboundEmailPayload, QUEUE_NAMES } from '@omnidesk/shared';
import { QueuesService } from '../../common/queues/queues.service';
import { providerConfig } from '../../config/provider.config';
import { EventsService } from '../events/events.service';
import { CreateEmailSyncDto } from './dto/create-email-sync.dto';
import { ListEmailSyncLogsDto } from './dto/list-email-sync-logs.dto';
import { MockInboundEmailDto } from './dto/mock-inbound-email.dto';
import { EmailRepository } from './email.repository';

@Injectable()
export class EmailService {
  constructor(
    private readonly emailRepository: EmailRepository,
    private readonly queues: QueuesService,
    private readonly events: EventsService,
  ) {}

  async mockInbound(dto: MockInboundEmailDto) {
    const rawPayload: MockInboundEmailPayload = {
      mailbox: dto.mailbox,
      messageId: dto.messageId,
      fromEmail: dto.fromEmail,
      fromName: dto.fromName,
      toEmail: dto.toEmail,
      subject: dto.subject,
      text: dto.text,
      html: dto.html,
      contentType: dto.contentType,
      receivedAt: dto.receivedAt,
      threadId: dto.threadId,
      inReplyTo: dto.inReplyTo,
      channelAccountId: dto.channelAccountId,
    };

    const dedupKey = this.buildDedupKey(dto.mailbox, dto.messageId);

    return this.events.createInbound({
      provider: InboundProvider.EMAIL,
      eventType: InboundEventType.EMAIL_RECEIVED,
      channelType: ChannelType.EMAIL,
      externalEventId: dto.messageId,
      dedupKey,
      rawPayload: rawPayload,
    });
  }

  async createSync(dto: CreateEmailSyncDto, requestedBy: string) {
    const channelAccount = await this.resolveEmailChannelAccount(
      dto.channelAccountId,
    );

    const syncLog = await this.emailRepository.createSyncLog(channelAccount.id);

    const job = await this.queues.add(QUEUE_NAMES.EMAIL_SYNC, 'sync-email', {
      channelAccountId: channelAccount.id,
      syncLogId: syncLog.id,
      requestedBy,
    });

    return {
      syncLog,
      jobId: job.id,
      queued: true,
    };
  }

  async listSyncLogs(query: ListEmailSyncLogsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.EmailSyncLogWhereInput = {
      channelAccountId: query.channelAccountId,
      status: query.status,
    };

    const [items, total] = await this.emailRepository.listSyncLogs({
      where,
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items,
      page,
      limit,
      total,
    };
  }

  private buildDedupKey(mailbox: string, messageId: string) {
    return `EMAIL:${mailbox.trim().toLowerCase()}:${messageId.trim()}`;
  }

  private async resolveEmailChannelAccount(channelAccountId?: string) {
    if (channelAccountId) {
      const channelAccount =
        await this.emailRepository.findChannelAccountById(channelAccountId);

      if (!channelAccount) {
        throw new NotFoundException('Email channel account not found');
      }

      if (channelAccount.type !== ChannelAccountType.EMAIL) {
        throw new BadRequestException('Channel account must be EMAIL');
      }

      return channelAccount;
    }

    const channelAccount =
      await this.emailRepository.findFirstEmailChannelAccount();

    if (!channelAccount) {
      const mailbox =
        providerConfig.email.imap.user ?? providerConfig.email.smtp.fromAddress;

      if (!mailbox) {
        throw new NotFoundException('No email channel account is configured');
      }

      return this.emailRepository.createEmailChannelAccount(mailbox);
    }

    return channelAccount;
  }
}
