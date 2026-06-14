import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConversationsController } from './conversations.controller';
import { ConversationsRepository } from './conversations.repository';
import { ConversationsService } from './conversations.service';

@Module({
  controllers: [ConversationsController],
  providers: [ConversationsService, ConversationsRepository],
  imports: [NotificationsModule],
  exports: [ConversationsService],
})
export class ConversationsModule {}
