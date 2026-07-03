import { Controller, ForbiddenException, Get, Post } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator';
import { DevService } from './dev.service';

@Public()
@ApiTags('Dev')
@ApiCookieAuth()
@Controller('dev')
export class DevController {
  constructor(private readonly devService: DevService) {}

  @ApiOperation({
    summary: 'Check provider configurations',
    description:
      'Validates and returns the health status of external providers (Email, Facebook).',
  })
  @Get('providers/health')
  getProvidersHealth() {
    this.ensureDevelopment();
    return this.devService.getProvidersHealth();
  }

  @ApiOperation({
    summary: 'Reset database to initial state',
    description:
      'Clears all existing transactional data and restores the system to a clean state for demonstration purposes.',
  })
  @Post('reset-demo-data')
  async resetDemoData() {
    this.ensureDevelopment();
    const data = await this.devService.resetDemoData();
    return {
      success: true,
      data,
    };
  }

  @ApiOperation({
    summary: 'Seed sample data',
    description:
      'Populates the database with synthetic data (conversations, messages, customers) for testing and UI demonstration.',
  })
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
