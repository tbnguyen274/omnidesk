import { Module } from '@nestjs/common';
import { MailModule } from '../../common/mail/mail.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  imports: [MailModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
