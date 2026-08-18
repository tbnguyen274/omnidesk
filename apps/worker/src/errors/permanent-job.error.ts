import { UnrecoverableError } from 'bullmq';

/**
 * Throw this error inside a BullMQ processor to signal that the failure
 * is permanent and should NOT be retried.
 *
 * BullMQ treats `UnrecoverableError` as a terminal failure: it moves the
 * job directly to the `failed` set, bypassing all remaining retry attempts.
 *
 * Use this for:
 *  - Resource not found (the record was deleted before the job ran)
 *  - Unknown/unsupported job type or action (retrying would always fail)
 *  - Data validation failures that cannot be fixed by retrying
 *
 * Do NOT use this for transient failures (network timeouts, provider 5xx,
 * temporary DB unavailability) — those should be left to the normal retry
 * mechanism with exponential backoff.
 */
export class PermanentJobError extends UnrecoverableError {
  constructor(message: string) {
    super(`[permanent] ${message}`);
    this.name = 'PermanentJobError';
  }
}
