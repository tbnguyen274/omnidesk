import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EmailActionsJobPayload } from '@omnidesk/shared';
import { EmailActionsService } from '../email/email-actions.service';
import { PermanentJobError } from '../errors/permanent-job.error';

@Injectable()
export class EmailActionsProcessor {
  private readonly logger = new Logger(EmailActionsProcessor.name);

  constructor(private readonly emailActionsService: EmailActionsService) {}

  async process(job: Job<EmailActionsJobPayload>) {
    this.logger.log(`Processing email action job ${job.id}`);
    const { action, messageId, channelAccountId } = job.data;

    try {
      switch (action) {
        case 'MARK_READ':
          await this.emailActionsService.markAsRead(
            channelAccountId,
            messageId,
          );
          break;
        case 'MARK_UNREAD':
          await this.emailActionsService.markAsUnread(
            channelAccountId,
            messageId,
          );
          break;
        case 'MARK_STARRED':
          await this.emailActionsService.markAsStarred(
            channelAccountId,
            messageId,
          );
          break;
        case 'UNMARK_STARRED':
          await this.emailActionsService.unmarkStarred(
            channelAccountId,
            messageId,
          );
          break;
        case 'MOVE_TO_ARCHIVE':
          await this.emailActionsService.moveToArchive(
            channelAccountId,
            messageId,
          );
          break;
        default:
          throw new PermanentJobError(
            `Unknown email action "${String(action)}" — cannot process, no retry will help`,
          );
      }
      this.logger.log(
        `Successfully processed email action ${action} for ${messageId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process email action ${action} for ${messageId}`,
        error,
      );
      throw error;
    }
  }
}
