import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { FacebookService } from './facebook.service';
import { FacebookSignatureService } from './services/facebook-signature.service';
import { Public } from '../../common/auth/public.decorator';

@Public()
@ApiTags('Facebook')
@ApiCookieAuth()
@Controller('webhooks/facebook')
export class FacebookController {
  constructor(
    private readonly facebookService: FacebookService,
    private readonly facebookSignatureService: FacebookSignatureService,
  ) {}

  @ApiOperation({
    summary: 'Verify Facebook webhook subscription',
    description:
      'Handles the initial verification challenge sent by Facebook when configuring a webhook.',
  })
  @Get()
  verifyWebhook(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') verifyToken?: string,
    @Query('hub.challenge') challenge?: string,
  ) {
    return this.facebookService.verifyWebhook({
      mode,
      verifyToken,
      challenge,
    });
  }

  @ApiOperation({
    summary: 'Receive Facebook Messenger events',
    description:
      'Ingests real-time events and messages from Facebook Messenger webhook.',
  })
  @Post()
  async receiveWebhook(
    @Body() payload: Record<string, unknown>,
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    this.facebookSignatureService.verifyRequest(request.rawBody, signature);
    const data = await this.facebookService.receiveWebhook(payload);
    return {
      success: true,
      data,
    };
  }
}
