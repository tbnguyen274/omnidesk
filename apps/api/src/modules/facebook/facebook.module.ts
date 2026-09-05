import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { FacebookController } from './facebook.controller';
import { FacebookRepository } from './facebook.repository';
import { FacebookService } from './facebook.service';
import { FacebookSignatureService } from './services/facebook-signature.service';
import { FacebookWebhookParserService } from './services/facebook-webhook-parser.service';

@Module({
  imports: [EventsModule],
  controllers: [FacebookController],
  providers: [
    FacebookService,
    FacebookRepository,
    FacebookSignatureService,
    FacebookWebhookParserService,
  ],
  exports: [FacebookService],
})
export class FacebookModule {}
