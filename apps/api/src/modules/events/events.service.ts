import { Injectable } from '@nestjs/common';
import { QUEUE_NAMES } from '@omnidesk/shared';
import { InboundEventStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { QueuesService } from '../../common/queues/queues.service';
import { CreateInboundEventDto } from './dto/create-inbound-event.dto';
import { ListInboundEventsDto } from './dto/list-inbound-events.dto';
import { ListOutboundEventsDto } from './dto/list-outbound-events.dto';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueuesService,
  ) {}

  async listInbound(query: ListInboundEventsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.InboundEventWhereInput = {
      provider: query.provider,
      eventType: query.eventType,
      normalizedStatus: query.status,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.inboundEvent.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { receivedAt: 'desc' },
        select: {
          id: true,
          provider: true,
          eventType: true,
          externalEventId: true,
          dedupKey: true,
          rawPayload: true,
          normalizedStatus: true,
          errorMessage: true,
          receivedAt: true,
          processedAt: true,
        },
      }),
      this.prisma.inboundEvent.count({ where }),
    ]);

    return {
      items,
      page,
      limit,
      total,
    };
  }

  async listOutbound(query: ListOutboundEventsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.OutboundMessageWhereInput = {
      provider: query.provider,
      status: query.status,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.outboundMessage.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          conversationId: true,
          channelType: true,
          provider: true,
          recipientExternalId: true,
          content: true,
          status: true,
          retryCount: true,
          maxRetries: true,
          lastError: true,
          externalMessageId: true,
          createdBy: true,
          createdAt: true,
          sentAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.outboundMessage.count({ where }),
    ]);

    return {
      items,
      page,
      limit,
      total,
    };
  }

  async createInbound(dto: CreateInboundEventDto) {
    const existing = await this.prisma.inboundEvent.findUnique({
      where: { dedupKey: dto.dedupKey },
    });

    if (existing) {
      return {
        inboundEvent: existing,
        duplicated: true,
        queued: false,
      };
    }

    const inboundEvent = await this.prisma.inboundEvent.create({
      data: {
        provider: dto.provider,
        eventType: dto.eventType,
        externalEventId: dto.externalEventId,
        dedupKey: dto.dedupKey,
        rawPayload: dto.rawPayload,
        normalizedStatus: InboundEventStatus.PENDING,
      },
    });

    await this.queues.add(QUEUE_NAMES.INBOUND_EVENTS, 'process-inbound-event', {
      inboundEventId: inboundEvent.id,
      dedupKey: inboundEvent.dedupKey,
      provider: inboundEvent.provider,
      eventType: inboundEvent.eventType,
    });

    return {
      inboundEvent,
      duplicated: false,
      queued: true,
    };
  }
}
