import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { CurrentUser as CurrentUserType } from '../../common/auth/current-user.type';
import { Public } from '../../common/auth/public.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { CreateEmailSyncDto } from './dto/create-email-sync.dto';
import { ListEmailSyncLogsDto } from './dto/list-email-sync-logs.dto';
import { MockInboundEmailDto } from './dto/mock-inbound-email.dto';
import { EmailService } from './email.service';

@Controller('email')
@Roles(UserRole.ADMIN, UserRole.AGENT)
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

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

  @Get('sync-logs')
  async listSyncLogs(@Query() query: ListEmailSyncLogsDto) {
    const data = await this.emailService.listSyncLogs(query);
    return {
      success: true,
      data,
    };
  }
}

@Public()
@Controller('dev/email')
export class DevEmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post('mock-inbound')
  async mockInbound(@Body() dto: MockInboundEmailDto) {
    this.ensureDevelopment();
    const data = await this.emailService.mockInbound(dto);
    return {
      success: true,
      data,
    };
  }

  private ensureDevelopment() {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Development endpoints are disabled');
    }
  }
}
