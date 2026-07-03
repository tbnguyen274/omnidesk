import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/auth/roles.decorator';
import { ListTicketsDto } from './dto/list-tickets.dto';
import { UpdateTicketAssignmentDto } from './dto/update-ticket-assignment.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { TicketsService } from './tickets.service';

@ApiTags('Tickets')
@ApiCookieAuth()
@Controller('tickets')
@Roles(UserRole.ADMIN, UserRole.AGENT)
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @ApiOperation({
    summary: 'Retrieve tickets',
    description: 'Returns a paginated list of support tickets.',
  })
  @Get()
  async list(@Query() query: ListTicketsDto) {
    const data = await this.ticketsService.list(query);
    return {
      success: true,
      data,
    };
  }

  @ApiOperation({
    summary: 'Get ticket details',
    description:
      'Retrieves detailed information for a specific support ticket.',
  })
  @Get(':id')
  async findById(@Param('id') id: string) {
    const data = await this.ticketsService.findById(id);
    return {
      success: true,
      data,
    };
  }

  @ApiOperation({
    summary: 'Update ticket status',
    description: 'Changes the status of a ticket.',
  })
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTicketStatusDto,
  ) {
    const data = await this.ticketsService.updateStatus(id, dto.status);
    return {
      success: true,
      data,
    };
  }

  @ApiOperation({
    summary: 'Assign agent to ticket',
    description: 'Assigns a ticket to a specific support agent.',
  })
  @Patch(':id/assignment')
  async updateAssignment(
    @Param('id') id: string,
    @Body() dto: UpdateTicketAssignmentDto,
  ) {
    const data = await this.ticketsService.updateAssignment(
      id,
      dto.assignedAgentId,
    );
    return {
      success: true,
      data,
    };
  }
}
