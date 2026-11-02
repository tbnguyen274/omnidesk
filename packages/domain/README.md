# Support domain policy

`@omnidesk/domain` is the internal conversation/SLA decision package shared by OmniDesk's API and Worker. It is pure TypeScript with an explicit clock and no framework, database, queue, provider or environment access.

```ts
const decision = evaluateConversationChange(
  snapshot,
  {
    type: "INBOUND_MESSAGE",
    direction: "INBOUND",
    senderType: "CUSTOMER",
    receivedAt,
  },
  { now: processingTime },
);
```

The caller locks and refreshes the aggregate, applies the returned conversation/ticket patches in one transaction, increments the conversation version once for a real aggregate mutation, handles warnings, persists any required outbox intent and publishes notifications after commit. `changed` describes policy patches; adding a timeline message is also a mutation even if there are no policy patches.

`decideInboundConversation` preserves creation/reopen compatibility. `initialTicketDeadline` uses the canonical SLA hours helper in `@omnidesk/shared`; it never replaces an existing ticket's deadline. `evaluateConversationChange` covers agent status, inbound customer resume, outbound finalization, auto-close and current overdue checks. Dates supplied by adapters must already be valid; policy does not validate transport payloads.

```powershell
pnpm --filter @omnidesk/domain build
pnpm --filter @omnidesk/domain test
```

Build shared before domain before either backend. Workspace dependency ordering and Docker stages do this explicitly. Domain code and its consumer ship in the same application artifact; a shared-package edit does not modify a running replica. Future independent services should use versioned commands/events instead of importing this implementation.

See [ownership and rules](../../docs/domain-ownership.md), [migration governance](../../docs/migration-governance.md), and [database operations](../../docs/database-operations.md).
