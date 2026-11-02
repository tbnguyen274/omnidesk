import { calculateSlaDueAt } from "@omnidesk/shared";
import type { ConversationStatus, Priority } from "@omnidesk/shared";

/** Internal Support domain, shared by its API and Worker, not by autonomous services. */
export interface ConversationSnapshot {
  status: ConversationStatus;
  resolvedAt?: Date | null;
  lastMessageAt?: Date | null;
  firstResponseAt?: Date | null;
  ticket?: {
    slaDueAt?: Date | null;
    slaPausedAt?: Date | null;
    isOverdue?: boolean;
  } | null;
}

export type ConversationAction =
  | { type: "AGENT_SET_STATUS"; status: ConversationStatus }
  | {
      type: "INBOUND_MESSAGE";
      direction: "INBOUND" | "OUTBOUND";
      senderType: "CUSTOMER" | "AGENT";
      receivedAt: Date;
    }
  | { type: "OUTBOUND_SENT"; sentAt: Date }
  | { type: "AUTO_CLOSE" }
  | { type: "SLA_CHECK" };

export interface DomainDecision {
  conversationPatch: {
    status?: ConversationStatus;
    resolvedAt?: Date | null;
    lastMessageAt?: Date;
    firstResponseAt?: Date;
  };
  ticketPatch: {
    slaDueAt?: Date | null;
    slaPausedAt?: Date | null;
    isOverdue?: boolean;
  };
  changed: boolean;
  warnings: "MISSING_SLA_PAUSE"[];
}

export function decideInboundConversation(status?: ConversationStatus) {
  return {
    createNew: !status || status === "CLOSED",
    reopen: status === "RESOLVED",
  };
}

export function initialTicketDeadline(
  ticketExists: boolean,
  priority: Priority,
  receivedAt: Date,
): Date | null {
  return ticketExists ? null : calculateSlaDueAt(priority, receivedAt);
}

export function isCurrentlyOverdue(
  status: ConversationStatus,
  dueAt: Date | null | undefined,
  pausedAt: Date | null | undefined,
  now: Date,
): boolean {
  return (
    (status === "NEW" || status === "IN_PROGRESS") &&
    !pausedAt &&
    !!dueAt &&
    dueAt.getTime() < now.getTime()
  );
}

function sameDate(
  left: Date | null | undefined,
  right: Date | null | undefined,
) {
  return (left?.getTime() ?? null) === (right?.getTime() ?? null);
}

export function evaluateConversationChange(
  snapshot: ConversationSnapshot,
  action: ConversationAction,
  clock: { now: Date },
): DomainDecision {
  const decision: DomainDecision = {
    conversationPatch: {},
    ticketPatch: {},
    changed: false,
    warnings: [],
  };
  let status = snapshot.status;
  let dueAt = snapshot.ticket?.slaDueAt ?? null;
  let pausedAt = snapshot.ticket?.slaPausedAt ?? null;
  const resume = (at: Date) => {
    if (pausedAt && dueAt) {
      dueAt = new Date(
        dueAt.getTime() + Math.max(0, at.getTime() - pausedAt.getTime()),
      );
    }
    pausedAt = null;
  };

  switch (action.type) {
    case "AGENT_SET_STATUS":
      status = action.status;
      if (status === "WAITING_CUSTOMER") {
        if (snapshot.ticket && !pausedAt) pausedAt = clock.now;
      } else {
        resume(clock.now);
      }
      if (status !== snapshot.status) {
        const resolvedAt =
          status === "RESOLVED"
            ? clock.now
            : status === "CLOSED"
              ? (snapshot.resolvedAt ?? null)
              : null;
        if (!sameDate(resolvedAt, snapshot.resolvedAt))
          decision.conversationPatch.resolvedAt = resolvedAt;
      }
      break;
    case "INBOUND_MESSAGE":
      // Preserve RESOLVED reopen behavior; only customer inbound can resume WAITING.
      if (status === "RESOLVED") {
        status = "IN_PROGRESS";
        decision.conversationPatch.resolvedAt = null;
      } else if (
        status === "WAITING_CUSTOMER" &&
        action.direction === "INBOUND" &&
        action.senderType === "CUSTOMER" &&
        (!pausedAt || action.receivedAt > pausedAt)
      ) {
        status = "IN_PROGRESS";
        if (snapshot.ticket && !pausedAt)
          decision.warnings.push("MISSING_SLA_PAUSE");
        resume(action.receivedAt);
      }
      break;
    case "OUTBOUND_SENT":
      if (status === "NEW") status = "IN_PROGRESS";
      if (!snapshot.lastMessageAt || action.sentAt > snapshot.lastMessageAt)
        decision.conversationPatch.lastMessageAt = action.sentAt;
      if (!snapshot.firstResponseAt)
        decision.conversationPatch.firstResponseAt = action.sentAt;
      break;
    case "AUTO_CLOSE":
      if (
        status === "RESOLVED" &&
        snapshot.resolvedAt &&
        snapshot.resolvedAt.getTime() < clock.now.getTime() - 3 * 86400000
      )
        status = "CLOSED";
      break;
    case "SLA_CHECK":
      break;
  }

  if (status !== snapshot.status) decision.conversationPatch.status = status;
  if (snapshot.ticket) {
    if (!sameDate(dueAt, snapshot.ticket.slaDueAt))
      decision.ticketPatch.slaDueAt = dueAt;
    if (!sameDate(pausedAt, snapshot.ticket.slaPausedAt))
      decision.ticketPatch.slaPausedAt = pausedAt;
    const overdue = isCurrentlyOverdue(status, dueAt, pausedAt, clock.now);
    if (overdue !== (snapshot.ticket.isOverdue ?? false))
      decision.ticketPatch.isOverdue = overdue;
  }
  decision.changed =
    Object.keys(decision.conversationPatch).length > 0 ||
    Object.keys(decision.ticketPatch).length > 0;
  return decision;
}
