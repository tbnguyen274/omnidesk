import { Controller, ForbiddenException, Post } from '@nestjs/common';
import { DevService } from './dev.service';

@Controller('dev')
export class DevController {
  constructor(private readonly devService: DevService) {}

  @Post('reset-demo-data')
  async resetDemoData() {
    this.ensureDevelopment();
    const data = await this.devService.resetDemoData();
    return {
      success: true,
      data,
    };
  }

  @Post('seed-demo-data')
  async seedDemoData() {
    this.ensureDevelopment();
    const data = await this.devService.seedDemoData();
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
