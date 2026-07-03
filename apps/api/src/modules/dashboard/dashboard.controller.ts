import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiCookieAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @ApiOperation({
    summary: 'Get dashboard statistics',
    description:
      'Retrieves high-level summary metrics (e.g., total open conversations, SLA breaches) for the dashboard view.',
  })
  @Get('summary')
  async getSummary() {
    const data = await this.dashboardService.getSummary();
    return { data };
  }

  @ApiOperation({
    summary: 'Get agent performance metrics',
    description:
      'Retrieves analytical data regarding support agents performance (e.g., resolution time, response time).',
  })
  @Get('agent-performance')
  async getAgentPerformance() {
    const data = await this.dashboardService.getAgentPerformance();
    return { data };
  }
}
