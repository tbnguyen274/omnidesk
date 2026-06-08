import { Module } from '@nestjs/common';
import { EmailModule } from './email/email.module';
import { FacebookModule } from './facebook/facebook.module';

@Module({
  imports: [FacebookModule, EmailModule],
})
export class ChannelsModule {}
