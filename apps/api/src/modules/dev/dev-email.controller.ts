import { Body, Controller, ForbiddenException, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator';
import { MockInboundEmailDto } from '../email/dto/mock-inbound-email.dto';
import { EmailService } from '../email/email.service';

@Public()
@ApiTags('Dev')
@Controller('dev/email')
export class DevEmailController {
  constructor(private readonly emailService: EmailService) {}

  @ApiOperation({
    summary: 'Mock inbound email',
    description:
      'Simulates receiving an inbound email for local testing purposes.',
  })
  @Post('mock-inbound')
  async mockInbound(@Body() dto: MockInboundEmailDto) {
    this.ensureDevelopment();
    const data = await this.emailService.mockInbound(dto);
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
