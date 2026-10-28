import { Injectable, Logger } from '@nestjs/common';
import { REALTIME_EVENT_TYPES } from '@omnidesk/shared';
import type { RealtimeEvent } from '@omnidesk/shared';
import { RealtimeEventsPublisher } from '../../realtime/realtime-events.publisher';
import type { IngestionResult } from '../inbound.types';

export const INBOUND_NOTIFICATION_TIMEOUT_MS = 2000;

/** Best-effort notifications: domain has already committed before this is called. */
@Injectable()
export class InboundNotificationsService {
  private readonly logger = new Logger(InboundNotificationsService.name);
  constructor(private readonly publisher: RealtimeEventsPublisher) {}

  async publish(result: IngestionResult) {
    if (result.duplicated) return;
    const { conversationId, messageId, ticketId } = result;
    const occurredAt = new Date().toISOString();
    const events: RealtimeEvent[] = [
      {
        type: result.conversationCreated
          ? REALTIME_EVENT_TYPES.CONVERSATION_CREATED
          : REALTIME_EVENT_TYPES.CONVERSATION_UPDATED,
        conversationId,
        occurredAt,
      },
    ];
    if (messageId)
      events.push({
        type: REALTIME_EVENT_TYPES.MESSAGE_CREATED,
        conversationId,
        messageId,
        occurredAt,
      });
    if (ticketId)
      events.push({
        type: REALTIME_EVENT_TYPES.TICKET_UPDATED,
        conversationId,
        ticketId,
        occurredAt,
      });
    const rooms = [
      this.publisher.conversationRoom(conversationId),
      this.publisher.teamInboxRoom(),
    ];
    await Promise.all(
      events.map(async (event) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          // ioredis may buffer commands indefinitely during an outage. Bound this
          // optional side effect without replaying an already committed domain write.
          await Promise.race([
            this.publisher.publish(event, rooms),
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () => reject(new Error('Inbound notification timeout')),
                INBOUND_NOTIFICATION_TIMEOUT_MS,
              );
            }),
          ]);
        } catch {
          this.logger.warn(
            JSON.stringify({
              action: 'inbound_notification_failed',
              inboundEventId: result.inboundEventId,
              conversationId,
              eventType: event.type,
            }),
          );
        } finally {
          clearTimeout(timer);
        }
      }),
    );
  }
}
