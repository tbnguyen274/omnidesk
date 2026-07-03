import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateInboundEventDto } from './dto/create-inbound-event.dto';
import { ListInboundEventsDto } from './dto/list-inbound-events.dto';
import { ListOutboundEventsDto } from './dto/list-outbound-events.dto';
import { EventsService } from './events.service';

@ApiTags('Events')
@ApiCookieAuth()
@Controller('events')
@Roles(UserRole.ADMIN, UserRole.AGENT)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @ApiOperation({
    summary: 'List inbound webhook events',
    description:
      'Retrieves a log of incoming webhook events received from third-party channels.',
  })
  @Get('inbound')
  async listInbound(@Query() query: ListInboundEventsDto) {
    const data = await this.eventsService.listInbound(query);
    return {
      success: true,
      data,
    };
  }

  @ApiOperation({
    summary: 'List outbound webhook events',
    description:
      'Retrieves a log of webhook events sent from the system to external services.',
  })
  @Get('outbound')
  async listOutbound(@Query() query: ListOutboundEventsDto) {
    const data = await this.eventsService.listOutbound(query);
    return {
      success: true,
      data,
    };
  }

  @ApiOperation({
    summary: 'Ingest third-party webhook payload',
    description:
      'Endpoint for receiving real-time webhook payloads from third-party channels (e.g., Facebook, Email).',
  })
  @Post('inbound')
  async createInbound(@Body() dto: CreateInboundEventDto) {
    const data = await this.eventsService.createInbound(dto);
    return {
      success: true,
      data,
    };
  }
}
