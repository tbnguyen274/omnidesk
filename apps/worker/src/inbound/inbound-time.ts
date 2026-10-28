import { PermanentJobError } from '../errors/permanent-job.error';

export function inboundTime(value: string | undefined, fallback: Date): Date {
  const date = value === undefined ? fallback : new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new PermanentJobError('Invalid inbound message timestamp');
  return date;
}
