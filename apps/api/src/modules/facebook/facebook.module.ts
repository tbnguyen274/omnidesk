import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import {
  DevFacebookController,
  FacebookController,
} from './facebook.controller';
import { FacebookRepository } from './facebook.repository';
import { FacebookService } from './facebook.service';
import { FacebookSignatureService } from './services/facebook-signature.service';

@Module({
  imports: [EventsModule],
  controllers: [FacebookController, DevFacebookController],
  providers: [FacebookService, FacebookRepository, FacebookSignatureService],
})
export class FacebookModule {}
