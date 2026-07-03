import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { CurrentUser as CurrentUserType } from '../../common/auth/current-user.type';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { CreateOutboundMessageDto } from './dto/create-outbound-message.dto';
import { OutboundService } from './outbound.service';

@Controller('outbound')
@Roles(UserRole.ADMIN, UserRole.AGENT)
export class OutboundController {
  constructor(private readonly outboundService: OutboundService) {}

  @Post('messages')
  async create(
    @Body() dto: CreateOutboundMessageDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    const data = await this.outboundService.create(dto, user.id);
    return {
      success: true,
      data,
    };
  }
}
