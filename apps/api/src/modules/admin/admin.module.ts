import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database/database.module';
import { QueuesModule } from '../../common/queues/queues.module';
import { AuditLogService } from '../audit-log/audit-log.service';
import { DeadLetterController } from './dead-letter.controller';

@Module({
  imports: [DatabaseModule, QueuesModule],
  controllers: [DeadLetterController],
  providers: [AuditLogService],
})
export class AdminModule {}
