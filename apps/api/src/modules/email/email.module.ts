import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { DevEmailController, EmailController } from './email.controller';
import { EmailService } from './email.service';

@Module({
  imports: [EventsModule],
  controllers: [EmailController, DevEmailController],
  providers: [EmailService],
})
export class EmailModule {}
