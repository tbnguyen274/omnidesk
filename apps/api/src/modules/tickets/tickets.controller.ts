import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/auth/roles.decorator';
import { ListTicketsDto } from './dto/list-tickets.dto';
import { UpdateTicketAssignmentDto } from './dto/update-ticket-assignment.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { TicketsService } from './tickets.service';

@Controller('tickets')
@Roles(UserRole.ADMIN, UserRole.AGENT)
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get()
  async list(@Query() query: ListTicketsDto) {
    const data = await this.ticketsService.list(query);
    return {
      success: true,
      data,
    };
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const data = await this.ticketsService.findById(id);
    return {
      success: true,
      data,
    };
  }

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
