import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InboundEventType,
  InboundProvider,
  ChannelType,
  Prisma,
  EmailSyncStatus,
  ChannelAccountType,
} from '@prisma/client';
import { MockInboundEmailPayload, QUEUE_NAMES } from '@omnidesk/shared';
import { PrismaService } from '../../common/database/prisma.service';
import { QueuesService } from '../../common/queues/queues.service';
import { EventsService } from '../events/events.service';
import { CreateEmailSyncDto } from './dto/create-email-sync.dto';
import { ListEmailSyncLogsDto } from './dto/list-email-sync-logs.dto';
import { MockInboundEmailDto } from './dto/mock-inbound-email.dto';

@Injectable()
export class EmailService {
  constructor(
    private readonly prisma: PrismaService,
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

    const syncLog = await this.prisma.emailSyncLog.create({
      data: {
        channelAccountId: channelAccount.id,
        status: EmailSyncStatus.PARTIAL,
      },
    });

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

    const [items, total] = await this.prisma.$transaction([
      this.prisma.emailSyncLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { syncStartedAt: 'desc' },
        include: {
          channelAccount: {
            select: {
              id: true,
              displayName: true,
              externalId: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.emailSyncLog.count({ where }),
    ]);

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
      const channelAccount = await this.prisma.channelAccount.findUnique({
        where: { id: channelAccountId },
      });

      if (!channelAccount) {
        throw new NotFoundException('Email channel account not found');
      }

      if (channelAccount.type !== ChannelAccountType.EMAIL) {
        throw new BadRequestException('Channel account must be EMAIL');
      }

      return channelAccount;
    }

    const channelAccount = await this.prisma.channelAccount.findFirst({
      where: { type: ChannelAccountType.EMAIL },
      orderBy: { createdAt: 'asc' },
    });

    if (!channelAccount) {
      throw new NotFoundException('No email channel account is configured');
    }

    return channelAccount;
  }
}
