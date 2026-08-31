import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiCookieAuth,
  ApiOperation,
  ApiConsumes,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { CurrentUser as CurrentUserType } from '../../common/auth/current-user.type';
import { Roles } from '../../common/auth/roles.decorator';
import { AttachmentsService } from '../attachments/attachments.service';
import { CreateOutboundMessageDto } from './dto/create-outbound-message.dto';
import { OutboundService } from './outbound.service';

@ApiTags('Outbound')
@ApiCookieAuth()
@Controller('outbound')
@Roles(UserRole.ADMIN, UserRole.AGENT)
export class OutboundController {
  constructor(
    private readonly outboundService: OutboundService,
    private readonly attachmentsService: AttachmentsService,
  ) {}

  @ApiOperation({
    summary: 'Send outbound message',
    description:
      'Sends a reply or new outbound message to a customer through the appropriate channel (Email, Facebook).',
  })
  @Post('messages')
  async create(
    @Body() dto: CreateOutboundMessageDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    const data = await this.outboundService.create(dto, user);
    return {
      success: true,
      data,
    };
  }

  @ApiOperation({
    summary: 'Upload attachment (Deprecated alias -> /attachments/upload)',
    description:
      'Uploads a file to object storage and returns the public URL. Allowed: JPEG, PNG, GIF, WEBP (≤5 MB), PDF, DOCX, XLSX (≤10 MB).',
    deprecated: true,
  })
  @ApiConsumes('multipart/form-data')
  @Post('attachments')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(@UploadedFile() file: Express.Multer.File) {
    const data = await this.attachmentsService.uploadAttachment(file);
    return {
      success: true,
      data,
    };
  }
}

