import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../../common/auth/roles.decorator';
import { AttachmentsService } from './attachments.service';

@ApiTags('Attachments')
@ApiCookieAuth()
@Controller('attachments')
@Roles(UserRole.ADMIN, UserRole.AGENT)
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @ApiOperation({
    summary: 'Stream attachment content',
    description:
      'Fetches the attachment content on-demand (with MinIO caching) and streams it to the browser.',
  })
  @Get(':id/content')
  async getContent(
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @Res() res: Response,
  ) {
    const { buffer, mimeType, fileName } =
      await this.attachmentsService.getAttachmentContent(id);

    const disposition = download === 'true' ? 'attachment' : 'inline';

    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    res.setHeader(
      'Cache-Control',
      'public, max-age=86400, stale-while-revalidate=604800',
    );
    res.setHeader('Content-Length', buffer.length.toString());

    res.end(buffer);
  }
}
