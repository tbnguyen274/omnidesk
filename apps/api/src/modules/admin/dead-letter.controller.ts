import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiCookieAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { QUEUE_NAMES, QueueName } from '@omnidesk/shared';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { CurrentUser as CurrentUserType } from '../../common/auth/current-user.type';
import { QueuesService } from '../../common/queues/queues.service';
import { AuditLogService } from '../audit-log/audit-log.service';

@ApiTags('Admin')
@ApiCookieAuth()
@Controller('admin')
@Roles(UserRole.ADMIN)
export class DeadLetterController {
  constructor(
    private readonly queues: QueuesService,
    private readonly auditLog: AuditLogService,
  ) {}

  @ApiOperation({
    summary: 'List dead-letter (failed) jobs',
    description:
      'Returns failed jobs from a specific queue for admin inspection and replay.',
  })
  @ApiQuery({ name: 'queue', enum: Object.values(QUEUE_NAMES) })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @Get('dead-letter-jobs')
  async listFailedJobs(
    @Query('queue') queueName: string,
    @Query('limit') limit?: string,
  ) {
    const jobs = await this.queues.getFailedJobs(
      queueName as QueueName,
      limit ? parseInt(limit, 10) : 50,
    );

    return {
      success: true,
      data: { queue: queueName, jobs, total: jobs.length },
    };
  }

  @ApiOperation({
    summary: 'Replay a dead-letter job',
    description:
      'Moves a failed job back to the waiting state for re-processing. Action is audit-logged.',
  })
  @Post('dead-letter-jobs/:jobId/replay')
  async replayJob(
    @Param('jobId') jobId: string,
    @Body() body: { queue: QueueName },
    @CurrentUser() user: CurrentUserType,
  ) {
    const result = await this.queues.retryJob(body.queue, jobId);

    await this.auditLog.log({
      actorId: user.id,
      action: 'dead_letter.replay',
      targetType: 'BullMQJob',
      targetId: jobId,
      metadata: { queue: body.queue, jobId },
    });

    return {
      success: true,
      data: result,
    };
  }
}
