import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import {
  DevFacebookController,
  FacebookController,
} from './facebook.controller';
import { FacebookRepository } from './facebook.repository';
import { FacebookService } from './facebook.service';

@Module({
  imports: [EventsModule],
  controllers: [FacebookController, DevFacebookController],
  providers: [FacebookService, FacebookRepository],
})
export class FacebookModule {}
