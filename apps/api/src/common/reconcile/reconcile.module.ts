import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ReconcileScheduler } from './reconcile.scheduler';

@Module({
  imports: [DatabaseModule],
  providers: [ReconcileScheduler],
})
export class ReconcileModule {}
