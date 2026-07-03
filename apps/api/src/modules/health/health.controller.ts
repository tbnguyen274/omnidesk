import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator';
import { HealthService } from './health.service';

@Public()
@ApiTags('Health')
@ApiCookieAuth()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @ApiOperation({
    summary: 'System health check',
    description: 'Returns the operational status of the API server and its core dependencies.',
  })
  @Get()
  async check() {
    return this.healthService.check();
  }
}
