/**
 * The provider request may have crossed the network boundary, but no
 * authoritative response was received. Retrying automatically could send a
 * duplicate customer message, so the record must be reconciled explicitly.
 */
export class DeliveryOutcomeUnknownError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DeliveryOutcomeUnknownError';
  }
}
