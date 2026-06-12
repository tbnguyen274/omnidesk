import { Injectable } from '@nestjs/common';
import { InboundEventStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CreateInboundEventDto } from './dto/create-inbound-event.dto';

@Injectable()
export class EventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listInbound(params: {
    where: Prisma.InboundEventWhereInput;
    skip: number;
    take: number;
  }) {
    return this.prisma.$transaction([
      this.prisma.inboundEvent.findMany({
        where: params.where,
        skip: params.skip,
        take: params.take,
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
      this.prisma.inboundEvent.count({ where: params.where }),
    ]);
  }

  async listOutbound(params: {
    where: Prisma.OutboundMessageWhereInput;
    skip: number;
    take: number;
  }) {
    return this.prisma.$transaction([
      this.prisma.outboundMessage.findMany({
        where: params.where,
        skip: params.skip,
        take: params.take,
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
      this.prisma.outboundMessage.count({ where: params.where }),
    ]);
  }

  findInboundByDedupKey(dedupKey: string) {
    return this.prisma.inboundEvent.findUnique({
      where: { dedupKey },
    });
  }

  createInbound(dto: CreateInboundEventDto) {
    return this.prisma.inboundEvent.create({
      data: {
        provider: dto.provider,
        eventType: dto.eventType,
        externalEventId: dto.externalEventId,
        dedupKey: dto.dedupKey,
        rawPayload: dto.rawPayload,
        normalizedStatus: InboundEventStatus.PENDING,
      },
    });
  }
}
