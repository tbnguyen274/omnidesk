import { OutboundProvider } from '@prisma/client';

export type SendOutboundResult = {
  externalMessageId: string;
  sentAt: Date;
};

export interface OutboundProviderAdapter {
  readonly provider: OutboundProvider;
  send(outboundMessageId: string): Promise<SendOutboundResult>;
  createTimelineMessage(outboundMessageId: string): Promise<void>;
}
