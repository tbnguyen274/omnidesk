import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { OutboxModule } from '../outbox/outbox.module';
import { ReconcileScheduler } from './reconcile.scheduler';

@Module({
  imports: [DatabaseModule, OutboxModule],
  providers: [ReconcileScheduler],
})
export class ReconcileModule {}
