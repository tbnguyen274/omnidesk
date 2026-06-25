import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
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
