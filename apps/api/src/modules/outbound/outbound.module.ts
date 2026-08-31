import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../../common/storage/storage.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { OutboundController } from './outbound.controller';
import { OutboundRepository } from './outbound.repository';
import { OutboundService } from './outbound.service';

@Module({
  imports: [
    NotificationsModule,
    StorageModule,
    AttachmentsModule,
    MulterModule.register({ storage: memoryStorage() }),
  ],
  controllers: [OutboundController],
  providers: [OutboundService, OutboundRepository],
  exports: [OutboundService],
})
export class OutboundModule {}
