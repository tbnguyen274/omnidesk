import { Module } from '@nestjs/common';
import { OutboundController } from './outbound.controller';
import { OutboundRepository } from './outbound.repository';
import { OutboundService } from './outbound.service';

@Module({
  controllers: [OutboundController],
  providers: [OutboundService, OutboundRepository],
  exports: [OutboundService],
})
export class OutboundModule {}
