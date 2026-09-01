import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { OutboxModule } from '../../common/outbox/outbox.module';
import { ConversationsController } from './conversations.controller';
import { ConversationsRepository } from './conversations.repository';
import { ConversationsService } from './conversations.service';

@Module({
  controllers: [ConversationsController],
  providers: [ConversationsService, ConversationsRepository],
  imports: [NotificationsModule, OutboxModule],
  exports: [ConversationsService],
})
export class ConversationsModule {}
