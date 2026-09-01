import {
  InboundEvent,
  InboundEventType,
  InboundProvider,
} from '@prisma/client';

/**
 * Shared port (interface) for all inbound provider adapters.
 *
 * Mirrors {@link OutboundProviderAdapter} on the send side. Every inbound channel
 * (Email, Facebook, …) must implement this interface so that
 * {@link InboundAdapterRegistry} can look up the correct adapter and
 * {@link InboundEventsProcessor} can route events without knowing anything
 * about the specific channel.
 */
export interface InboundProviderAdapter {
  /** The provider this adapter handles. Used as the registry key. */
  readonly provider: InboundProvider;

  /**
   * Returns `true` when this adapter is capable of handling the given
   * event type. Allows a single provider to handle multiple event types
   * (e.g. Facebook handles both MESSAGE and COMMENT).
   */
  supports(eventType: InboundEventType): boolean;

  /**
   * Processes a fully-persisted {@link InboundEvent}. The implementation is
   * responsible for normalising the raw payload, upserting domain entities
   * (Customer -> Conversation -> Message -> Ticket), and publishing realtime events.
   *
   * The adapter is NOT responsible for managing the InboundEvent status
   * (PROCESSING / PROCESSED / FAILED) — that remains the processor's concern.
   */
  process(inboundEvent: InboundEvent): Promise<void>;
}
