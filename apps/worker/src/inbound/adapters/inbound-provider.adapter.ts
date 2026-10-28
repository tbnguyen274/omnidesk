import type { ChannelProvider } from '@omnidesk/shared';
import type {
  InboundProviderEvent,
  NormalizedInboundMessage,
} from '../inbound.types';

export const INBOUND_ADAPTERS = Symbol('INBOUND_ADAPTERS');

/** Validate, normalize and enrich provider data outside a DB transaction.
 * Ingestion owns domain persistence, event lifecycle, SLA and notifications.
 */
export interface InboundProviderAdapter {
  readonly provider: ChannelProvider;
  supports(eventType: InboundProviderEvent['eventType']): boolean;
  normalize(event: InboundProviderEvent): Promise<NormalizedInboundMessage>;
}
