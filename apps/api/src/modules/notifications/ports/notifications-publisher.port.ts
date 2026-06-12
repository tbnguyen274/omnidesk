import type { RealtimeEvent, RealtimeRoom } from '@omnidesk/shared';

export const NOTIFICATIONS_PUBLISHER = Symbol('NOTIFICATIONS_PUBLISHER');

export type NotificationPublishTarget = {
  rooms: RealtimeRoom[];
};

export interface NotificationsPublisher {
  publish(event: RealtimeEvent, target: NotificationPublishTarget): void;
}
