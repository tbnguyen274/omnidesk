import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RedisModule } from '../../common/redis/redis.module';
import { appConfig } from '../../config/app.config';
import { UsersModule } from '../users/users.module';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';
import { NotificationsRedisBridgeService } from './notifications-redis-bridge.service';
import { NOTIFICATIONS_PUBLISHER } from './ports/notifications-publisher.port';

@Module({
  imports: [
    RedisModule,
    UsersModule,
    JwtModule.register({
      secret: appConfig.jwtSecret,
    }),
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
