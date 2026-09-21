import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiCookieAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { OutboundMessageStatus, UserRole } from '@prisma/client';
import { QUEUE_NAMES, QueueName } from '@omnidesk/shared';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { CurrentUser as CurrentUserType } from '../../common/auth/current-user.type';
import { QueuesService } from '../../common/queues/queues.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../../common/database/prisma.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import { OutboxDispatcherService } from '../../common/outbox/outbox-dispatcher.service';

@ApiTags('Admin')
@ApiCookieAuth()
@Controller('admin')
@Roles(UserRole.ADMIN)
export class DeadLetterController {
  constructor(
    private readonly queues: QueuesService,
    private readonly auditLog: AuditLogService,
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly outboxDispatcher: OutboxDispatcherService,
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

  @ApiOperation({
    summary: 'Retry a failed or ambiguous outbound message',
    description:
      'Resets the outbound message to PENDING and transactionally creates a new send-request outbox event.',
  })
  @Post('outbound-messages/:id/retry')
  async retryOutboundMessage(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    const outboundMessage = await this.prisma.$transaction(async (tx) => {
      const current = await tx.outboundMessage.findUnique({ where: { id } });
      if (!current) {
        throw new NotFoundException('Outbound message not found');
      }
      if (
        current.status !== OutboundMessageStatus.FAILED &&
        current.status !== OutboundMessageStatus.DELIVERY_UNKNOWN
      ) {
        throw new BadRequestException(
          'Only FAILED or DELIVERY_UNKNOWN outbound messages can be retried',
        );
      }

      const updated = await tx.outboundMessage.update({
        where: { id },
        data: {
          status: OutboundMessageStatus.PENDING,
          processingStartedAt: null,
          externalMessageId: null,
          sentAt: null,
          lastError: null,
        },
      });

      await this.outbox.createEvent(
        tx,
        'OUTBOUND_MESSAGE_SEND_REQUESTED',
        updated.id,
        {
          outboundMessageId: updated.id,
          conversationId: updated.conversationId,
          provider: updated.provider,
        },
      );
      return updated;
    });

    this.outboxDispatcher.trigger();
    await this.auditLog.log({
      actorId: user.id,
      action: 'outbound_message.retry',
      targetType: 'OutboundMessage',
      targetId: outboundMessage.id,
      metadata: {
        outboundMessageId: outboundMessage.id,
        previousStatus: 'FAILED_OR_DELIVERY_UNKNOWN',
      },
    });

    return { success: true, data: outboundMessage };
  }
}
