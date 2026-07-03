import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { CurrentUser as CurrentUserType } from '../../common/auth/current-user.type';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateOutboundMessageDto } from './dto/create-outbound-message.dto';
import { OutboundService } from './outbound.service';

@ApiTags('Outbound')
@ApiCookieAuth()
@Controller('outbound')
@Roles(UserRole.ADMIN, UserRole.AGENT)
export class OutboundController {
  constructor(private readonly outboundService: OutboundService) {}

  @ApiOperation({
    summary: 'Send outbound message',
    description:
      'Sends a reply or new outbound message to a customer through the appropriate channel (Email, Facebook).',
  })
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
