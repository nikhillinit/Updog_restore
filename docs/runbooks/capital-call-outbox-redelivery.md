# Capital-call notification outbox redelivery

Capital-call status transitions commit durable notification outbox rows. The worker dispatcher retries pending rows and marks rows `exhausted` after five failed delivery attempts.

## Inspect first

Run dry-run mode with explicit row IDs:

```bash
node scripts/release/redeliver-capital-call-outbox.mjs --ids=<outbox-uuid>
```

Use `--all` to inspect every exhausted row. Dry-run performs no writes.

## Reset targeted rows

Review dry-run output, then reset only approved rows:

```bash
node scripts/release/redeliver-capital-call-outbox.mjs --ids=<outbox-uuid> --apply
```

For a deliberate full reset:

```bash
node scripts/release/redeliver-capital-call-outbox.mjs --all
node scripts/release/redeliver-capital-call-outbox.mjs --all --apply
```

Apply mode changes only rows currently `exhausted`: status becomes `pending`, attempt count and failure metadata reset, and `next_attempt_at` becomes the database clock. The worker dispatcher delivers rows after reset; its durable outbox UUID remains the notification idempotency key.

Verify after redelivery:

```sql
SELECT id, status, attempt_count, delivered_at, last_error
FROM capital_call_notification_outbox
WHERE id = '<outbox-uuid>';
```
