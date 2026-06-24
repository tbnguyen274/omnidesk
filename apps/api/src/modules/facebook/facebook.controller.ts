import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { MockFacebookCommentDto } from './dto/mock-facebook-comment.dto';
import { MockFacebookMessageDto } from './dto/mock-facebook-message.dto';
import { FacebookService } from './facebook.service';
import { FacebookSignatureService } from './services/facebook-signature.service';

@Controller('webhooks/facebook')
export class FacebookController {
  constructor(
    private readonly facebookService: FacebookService,
    private readonly facebookSignatureService: FacebookSignatureService,
  ) {}

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

@Controller('dev/facebook')
export class DevFacebookController {
  constructor(private readonly facebookService: FacebookService) {}

  @Post('mock-message')
  async mockMessage(@Body() dto: MockFacebookMessageDto) {
    this.ensureDevelopment();
    const data = await this.facebookService.mockMessage(dto);
    return {
      success: true,
      data,
    };
  }

  @Post('mock-comment')
  async mockComment(@Body() dto: MockFacebookCommentDto) {
    this.ensureDevelopment();
    const data = await this.facebookService.mockComment(dto);
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
