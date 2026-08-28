# Capital-call notification outbox redelivery

Capital-call status transitions commit durable notification outbox rows. The
worker dispatcher retries pending rows and marks rows `exhausted` after five
failed delivery attempts.

## Inspect first

Run dry-run mode with explicit row IDs:

```bash
(
: "${OUTBOX_UUID:?OUTBOX_UUID is required}"
node scripts/release/redeliver-capital-call-outbox.mjs --ids="$OUTBOX_UUID"
)
```

Use `--all` to inspect every exhausted row. Dry-run performs no writes.

## Mutation remains blocked

The command currently rejects every `--apply` invocation before database access.
This mechanical block is intentional while action-specific production data
hardening and the canonical production-action prerequisites remain unresolved.
Dry-run output is inspection evidence only; it does not authorize a reset.

Do not bypass or remove the block from an operator shell. Any future reset route
must first implement the controls required by
[`docs/workflows/PRODUCTION_SCRIPTS.md`](../workflows/PRODUCTION_SCRIPTS.md),
receive separate action-scoped authority, and ship with direct database and
failure-recovery proof. Until then, zero outbox mutation dispatch is permitted.

Use read-only SQL to verify current row state:

```sql
SELECT id, status, attempt_count, delivered_at, last_error
FROM capital_call_notification_outbox
WHERE id = '<outbox-uuid>';
```
