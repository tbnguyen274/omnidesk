import { Injectable } from '@nestjs/common';
import { QUEUE_NAMES } from '@omnidesk/shared';
import { Prisma } from '@prisma/client';
import { QueuesService } from '../../common/queues/queues.service';
import { CreateInboundEventDto } from './dto/create-inbound-event.dto';
import { ListInboundEventsDto } from './dto/list-inbound-events.dto';
import { ListOutboundEventsDto } from './dto/list-outbound-events.dto';
import { EventsRepository } from './events.repository';

@Injectable()
export class EventsService {
  constructor(
    private readonly eventsRepository: EventsRepository,
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

    let inboundEvent;
    try {
      inboundEvent = await this.eventsRepository.createInbound(dto);
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
