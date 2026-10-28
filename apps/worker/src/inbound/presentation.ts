import type { InboundPresentation } from './inbound.types';

/** Channel-specific display compatibility, separate from lifecycle/SLA policies. */
export function inboundSubject(
  current: string | null,
  presentation: InboundPresentation,
): string {
  if (presentation.subjectStyle === 'email')
    return current ?? presentation.subject;
  return !current ||
    current.startsWith('Facebook Messenger -') ||
    current.startsWith('Comment from ') ||
    current.includes('Unknown Customer') ||
    current.includes('undefined')
    ? presentation.subject
    : current;
}
