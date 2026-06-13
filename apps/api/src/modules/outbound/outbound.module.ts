import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { OutboundController } from './outbound.controller';
import { OutboundRepository } from './outbound.repository';
import { OutboundService } from './outbound.service';

@Module({
  imports: [NotificationsModule],
  controllers: [OutboundController],
  providers: [OutboundService, OutboundRepository],
  exports: [OutboundService],
})
export class OutboundModule {}
