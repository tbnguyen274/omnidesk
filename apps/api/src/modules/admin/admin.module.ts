import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database/database.module';
import { QueuesModule } from '../../common/queues/queues.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { DeadLetterController } from './dead-letter.controller';

@Module({
  imports: [DatabaseModule, QueuesModule, AuditLogModule],
  controllers: [DeadLetterController],
})
export class AdminModule {}
