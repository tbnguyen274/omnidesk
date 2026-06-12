import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { DevEmailController, EmailController } from './email.controller';
import { EmailRepository } from './email.repository';
import { EmailService } from './email.service';

@Module({
  imports: [EventsModule],
  controllers: [EmailController, DevEmailController],
  providers: [EmailService, EmailRepository],
})
export class EmailModule {}
