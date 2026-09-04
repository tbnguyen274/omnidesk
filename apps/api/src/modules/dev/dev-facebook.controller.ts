import {
  Body,
  Controller,
  ForbiddenException,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator';
import { MockFacebookCommentDto } from '../facebook/dto/mock-facebook-comment.dto';
import { MockFacebookMessageDto } from '../facebook/dto/mock-facebook-message.dto';
import { FacebookService } from '../facebook/facebook.service';

@Public()
@ApiTags('Dev')
@Controller('dev/facebook')
export class DevFacebookController {
  constructor(private readonly facebookService: FacebookService) {}

  @ApiOperation({
    summary: 'Mock Facebook message',
    description: 'Simulates receiving a Facebook Messenger chat message.',
  })
  @Post('mock-message')
  async mockMessage(@Body() dto: MockFacebookMessageDto) {
    this.ensureDevelopment();
    const data = await this.facebookService.mockMessage(dto);
    return {
      success: true,
      data,
    };
  }

  @ApiOperation({
    summary: 'Mock Facebook post comment',
    description: 'Simulates receiving a comment on a Facebook post.',
  })
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
