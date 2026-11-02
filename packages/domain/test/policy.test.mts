import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateConversationChange as evaluate,
  initialTicketDeadline,
  type ConversationSnapshot,
  type ConversationAction,
} from "../dist/index.js";

const at = (hour: number) =>
  new Date(`2026-10-29T${String(hour).padStart(2, "0")}:00:00Z`);
const waiting: ConversationSnapshot = {
  status: "WAITING_CUSTOMER",
  ticket: { slaDueAt: at(12), slaPausedAt: at(8), isOverdue: false },
};
type InboundAction = Extract<ConversationAction, { type: "INBOUND_MESSAGE" }>;
const message = (
  receivedAt: Date,
  extra: Partial<InboundAction> = {},
): InboundAction => ({
  type: "INBOUND_MESSAGE",
  direction: "INBOUND",
  senderType: "CUSTOMER",
  receivedAt,
  ...extra,
});

test("customer reply resumes from received time, while overdue uses processing time", () => {
  const result = evaluate(waiting, message(at(10)), { now: at(15) });
  assert.deepEqual(result.conversationPatch, { status: "IN_PROGRESS" });
  assert.deepEqual(result.ticketPatch, {
    slaDueAt: at(14),
    slaPausedAt: null,
    isOverdue: true,
  });
});
test("old/equal messages and page echoes do not resume waiting", () => {
  for (const action of [
    message(at(7)),
    message(at(8)),
    message(at(10), { direction: "OUTBOUND", senderType: "AGENT" }),
  ]) {
    const result = evaluate(waiting, action, { now: at(15) });
    assert.deepEqual(result.conversationPatch, {});
    assert.deepEqual(result.ticketPatch, {});
  }
});
test("repeated waiting status does not reset the pause timestamp or version decision", () => {
  assert.equal(
    evaluate(
      waiting,
      { type: "AGENT_SET_STATUS", status: "WAITING_CUSTOMER" },
      { now: at(10) },
    ).changed,
    false,
  );
});
test("agent resume and customer resume apply the same extension", () => {
  const a = evaluate(
    waiting,
    { type: "AGENT_SET_STATUS", status: "IN_PROGRESS" },
    { now: at(10) },
  );
  const b = evaluate(waiting, message(at(10)), { now: at(10) });
  assert.deepEqual(a.ticketPatch, b.ticketPatch);
});
test("missing pause metadata resumes without inventing an extension", () => {
  const result = evaluate(
    { ...waiting, ticket: { slaDueAt: at(12) } },
    message(at(10)),
    { now: at(10) },
  );
  assert.equal(result.conversationPatch.status, "IN_PROGRESS");
  assert.equal(result.ticketPatch.slaDueAt, undefined);
  assert.deepEqual(result.warnings, ["MISSING_SLA_PAUSE"]);
});
test("overdue is a current flag and clears when inactive, paused or no longer due", () => {
  for (const snapshot of [
    {
      status: "WAITING_CUSTOMER",
      ticket: { slaDueAt: at(7), isOverdue: true },
    },
    { status: "RESOLVED", ticket: { slaDueAt: at(7), isOverdue: true } },
    { status: "CLOSED", ticket: { slaDueAt: at(7), isOverdue: true } },
    { status: "IN_PROGRESS", ticket: { slaDueAt: at(12), isOverdue: true } },
    {
      status: "IN_PROGRESS",
      ticket: { slaDueAt: at(7), slaPausedAt: at(8), isOverdue: true },
    },
  ] satisfies ConversationSnapshot[])
    assert.equal(
      evaluate(snapshot, { type: "SLA_CHECK" }, { now: at(10) }).ticketPatch
        .isOverdue,
      false,
    );
});
test("resolved reopen keeps the deadline; initial deadlines follow existing priority hours", () => {
  const result = evaluate(
    { status: "RESOLVED", resolvedAt: at(8), ticket: { slaDueAt: at(7) } },
    message(at(10)),
    { now: at(10) },
  );
  assert.equal(result.conversationPatch.status, "IN_PROGRESS");
  assert.equal(result.conversationPatch.resolvedAt, null);
  assert.equal(result.ticketPatch.slaDueAt, undefined);
  for (const [priority, hours] of [
    ["URGENT", 2],
    ["HIGH", 8],
    ["MEDIUM", 24],
    ["LOW", 72],
  ] as const) {
    assert.equal(
      initialTicketDeadline(false, priority, at(8))!.getTime(),
      at(8).getTime() + hours * 3600000,
    );
  }
  assert.equal(initialTicketDeadline(true, "URGENT", at(8)), null);
});
test("outbound does not reopen resolved/closed and auto-close uses the current clock", () => {
  assert.equal(
    evaluate(
      { status: "CLOSED" },
      { type: "OUTBOUND_SENT", sentAt: at(9) },
      { now: at(10) },
    ).conversationPatch.status,
    undefined,
  );
  const old: ConversationSnapshot = {
    status: "RESOLVED",
    resolvedAt: new Date("2026-10-25T00:00:00Z"),
  };
  assert.equal(
    evaluate(old, { type: "AUTO_CLOSE" }, { now: at(10) }).conversationPatch
      .status,
    "CLOSED",
  );
  assert.equal(
    evaluate(
      old,
      { type: "AUTO_CLOSE" },
      { now: new Date("2026-10-26T00:00:00Z") },
    ).changed,
    false,
  );
});
