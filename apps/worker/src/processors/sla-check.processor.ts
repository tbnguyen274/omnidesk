import { Injectable, Logger } from '@nestjs/common';
import {
  REALTIME_EVENT_TYPES,
  type SlaCheckJobPayload,
} from '@omnidesk/shared';
import { TicketStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../database/prisma.service';
import { RealtimeEventsPublisher } from '../realtime/realtime-events.publisher';

@Injectable()
export class SlaCheckProcessor {
  private readonly logger = new Logger(SlaCheckProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeEventsPublisher: RealtimeEventsPublisher,
  ) {}

  async process(job: Job<SlaCheckJobPayload>) {
    const now = new Date(job.data.requestedAt);
    const overdueTickets = await this.prisma.ticket.findMany({
      where: {
        slaDueAt: {
          lt: now,
        },
        status: {
          notIn: [TicketStatus.RESOLVED, TicketStatus.CLOSED],
        },
      },
      select: {
        id: true,
        conversationId: true,
      },
    });

    await Promise.all(
      overdueTickets.map((ticket) =>
        this.realtimeEventsPublisher.publish(
          {
            type: REALTIME_EVENT_TYPES.SLA_OVERDUE,
            ticketId: ticket.id,
            conversationId: ticket.conversationId,
            occurredAt: now.toISOString(),
          },
          [
            this.realtimeEventsPublisher.conversationRoom(
              ticket.conversationId,
            ),
          ],
        ),
      ),
    );

    this.logger.log(
      `Published SLA overdue events for ${overdueTickets.length} ticket(s)`,
    );
  }
}
