import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  async getSummary() {
    const data = await this.dashboardService.getSummary();
    return { data };
  }

  @Get('agent-performance')
  async getAgentPerformance() {
    const data = await this.dashboardService.getAgentPerformance();
    return { data };
  }
}
