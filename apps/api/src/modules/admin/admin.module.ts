import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database/database.module';
import { QueuesModule } from '../../common/queues/queues.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { DeadLetterController } from './dead-letter.controller';
import { OutboxModule } from '../../common/outbox/outbox.module';

@Module({
  imports: [DatabaseModule, QueuesModule, AuditLogModule, OutboxModule],
  controllers: [DeadLetterController],
})
export class AdminModule {}
