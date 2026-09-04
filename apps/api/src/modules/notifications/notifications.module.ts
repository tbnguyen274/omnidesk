import { Module } from '@nestjs/common';
import { AuthTokenModule } from '../../common/auth/auth-token.module';
import { RedisModule } from '../../common/redis/redis.module';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';
import { NotificationsRedisBridgeService } from './notifications-redis-bridge.service';
import { NOTIFICATIONS_PUBLISHER } from './ports/notifications-publisher.port';

@Module({
  imports: [
    RedisModule,
    AuthTokenModule,
  ],
  providers: [
    NotificationsService,
    NotificationsGateway,
    NotificationsRedisBridgeService,
    {
      provide: NOTIFICATIONS_PUBLISHER,
      useExisting: NotificationsGateway,
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
