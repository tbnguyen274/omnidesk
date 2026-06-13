import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { appConfig } from '../../config/app.config';
import { UsersModule } from '../users/users.module';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';
import { NOTIFICATIONS_PUBLISHER } from './ports/notifications-publisher.port';

@Module({
  imports: [
    UsersModule,
    JwtModule.register({
      secret: appConfig.jwtSecret,
    }),
  ],
  providers: [
    NotificationsService,
    NotificationsGateway,
    {
      provide: NOTIFICATIONS_PUBLISHER,
      useExisting: NotificationsGateway,
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
