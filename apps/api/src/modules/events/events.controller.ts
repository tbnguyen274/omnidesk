import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { CreateInboundEventDto } from './dto/create-inbound-event.dto';
import { ListInboundEventsDto } from './dto/list-inbound-events.dto';
import { ListOutboundEventsDto } from './dto/list-outbound-events.dto';
import { EventsService } from './events.service';

@Controller('events')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.AGENT)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('inbound')
  async listInbound(@Query() query: ListInboundEventsDto) {
    const data = await this.eventsService.listInbound(query);
    return {
      success: true,
      data,
    };
  }

  @Get('outbound')
  async listOutbound(@Query() query: ListOutboundEventsDto) {
    const data = await this.eventsService.listOutbound(query);
    return {
      success: true,
      data,
    };
  }

  @Post('inbound')
  async createInbound(@Body() dto: CreateInboundEventDto) {
    const data = await this.eventsService.createInbound(dto);
    return {
      success: true,
      data,
    };
  }
}
