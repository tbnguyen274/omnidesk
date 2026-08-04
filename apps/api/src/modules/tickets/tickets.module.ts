import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TicketsController } from './tickets.controller';
import { TicketsRepository } from './tickets.repository';
import { TicketsService } from './tickets.service';

@Module({
  controllers: [TicketsController],
  providers: [TicketsService, TicketsRepository],
  imports: [ConversationsModule, NotificationsModule],
  exports: [TicketsService],
})
export class TicketsModule {}
