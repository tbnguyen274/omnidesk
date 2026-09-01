import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { QueuesModule } from '../queues/queues.module';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import { OutboxService } from './outbox.service';

@Module({
  imports: [DatabaseModule, QueuesModule],
  providers: [OutboxService, OutboxDispatcherService],
  exports: [OutboxService, OutboxDispatcherService],
})
export class OutboxModule {}
