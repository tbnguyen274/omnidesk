import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { CurrentUser as CurrentUserType } from '../../common/auth/current-user.type';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateEmailSyncDto } from './dto/create-email-sync.dto';
import { ListEmailSyncLogsDto } from './dto/list-email-sync-logs.dto';
import { EmailService } from './email.service';

@ApiTags('Email')
@ApiCookieAuth()
@Controller('email')
@Roles(UserRole.ADMIN, UserRole.AGENT)
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @ApiOperation({
    summary: 'Manually trigger email synchronization',
    description:
      'Forces a manual synchronization of incoming emails from the configured IMAP server.',
  })
  @Post('sync')
  async createSync(
    @Body() dto: CreateEmailSyncDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    const data = await this.emailService.createSync(dto, user.id);
    return {
      success: true,
      data,
    };
  }

  @ApiOperation({
    summary: 'Retrieve email sync logs',
    description:
      'Returns a list of historical email synchronization operations and their status.',
  })
  @Get('sync-logs')
  async listSyncLogs(@Query() query: ListEmailSyncLogsDto) {
    const data = await this.emailService.listSyncLogs(query);
    return {
      success: true,
      data,
    };
  }
}
