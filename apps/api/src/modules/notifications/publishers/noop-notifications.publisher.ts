import { Injectable } from '@nestjs/common';
import type { RealtimeEvent } from '@omnidesk/shared';
import type {
  NotificationPublishTarget,
  NotificationsPublisher,
} from '../ports/notifications-publisher.port';

@Injectable()
export class NoopNotificationsPublisher implements NotificationsPublisher {
  publish(event: RealtimeEvent, target: NotificationPublishTarget) {
    void event;
    void target;
    // WebSocket gateway will replace this publisher in the next step.
  }
}
