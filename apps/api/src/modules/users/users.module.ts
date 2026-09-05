import { Module } from '@nestjs/common';
import { MailModule } from '../../common/mail/mail.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  imports: [MailModule, AuditLogModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
