import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database/database.module';
import { OutboxModule } from '../../common/outbox/outbox.module';
import { EventsController } from './events.controller';
import { EventsRepository } from './events.repository';
import { EventsService } from './events.service';

@Module({
  imports: [DatabaseModule, OutboxModule],
  controllers: [EventsController],
  providers: [EventsService, EventsRepository],
  exports: [EventsService],
})
export class EventsModule {}
