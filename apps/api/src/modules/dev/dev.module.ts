import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { FacebookModule } from '../facebook/facebook.module';
import { DevController } from './dev.controller';
import { DevEmailController } from './dev-email.controller';
import { DevFacebookController } from './dev-facebook.controller';
import { DevService } from './dev.service';

@Module({
  imports: [EmailModule, FacebookModule],
  controllers: [DevController, DevFacebookController, DevEmailController],
  providers: [DevService],
})
export class DevModule {}
