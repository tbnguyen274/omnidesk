import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NOTIFICATIONS_PUBLISHER } from './ports/notifications-publisher.port';
import { NoopNotificationsPublisher } from './publishers/noop-notifications.publisher';

@Module({
  providers: [
    NotificationsService,
    NoopNotificationsPublisher,
    {
      provide: NOTIFICATIONS_PUBLISHER,
      useExisting: NoopNotificationsPublisher,
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
