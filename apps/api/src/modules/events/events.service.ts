import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import { CreateInboundEventDto } from './dto/create-inbound-event.dto';
import { ListInboundEventsDto } from './dto/list-inbound-events.dto';
import { ListOutboundEventsDto } from './dto/list-outbound-events.dto';
import { EventsRepository } from './events.repository';

@Injectable()
export class EventsService {
  constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async listInbound(query: ListInboundEventsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.InboundEventWhereInput = {
      provider: query.provider,
      eventType: query.eventType,
      normalizedStatus: query.status,
    };

    const [items, total] = await this.eventsRepository.listInbound({
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

  async listOutbound(query: ListOutboundEventsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.OutboundMessageWhereInput = {
      provider: query.provider,
      status: query.status,
    };

    const [items, total] = await this.eventsRepository.listOutbound({
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

  async createInbound(dto: CreateInboundEventDto) {
    const existing = await this.eventsRepository.findInboundByDedupKey(
      dto.dedupKey,
    );

    if (existing) {
      return {
        inboundEvent: existing,
        duplicated: true,
        queued: false,
      };
    }

    try {
      // Write InboundEvent + OutboxEvent atomically in a single transaction.
      // The OutboxDispatcherService will pick up the outbox event and enqueue
      // it into BullMQ, ensuring the event is never lost even if Redis is down.
      const { inboundEvent } = await this.prisma.$transaction(async (tx) => {
        const event = await tx.inboundEvent.create({
          data: {
            provider: dto.provider,
            eventType: dto.eventType,
            externalEventId: dto.externalEventId,
            dedupKey: dto.dedupKey,
            rawPayload: dto.rawPayload,
          },
        });

        await this.outbox.createEvent(tx, 'INBOUND_EVENT_CREATED', event.id, {
          inboundEventId: event.id,
          dedupKey: event.dedupKey,
          provider: event.provider,
          eventType: event.eventType,
        });

        return { inboundEvent: event };
      });

      return {
        inboundEvent,
        duplicated: false,
        queued: false, // Will be enqueued by the OutboxDispatcher
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Race condition: another request just inserted this dedupKey
        const newlyCreated = await this.eventsRepository.findInboundByDedupKey(
          dto.dedupKey,
        );
        return {
          inboundEvent: newlyCreated,
          duplicated: true,
          queued: false,
        };
      }
      throw error;
    }
  }
}
