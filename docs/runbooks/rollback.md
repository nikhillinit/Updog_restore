# Rollback Procedure & Verification Checklist

## Auto-triggers
- Burn-rate > 14.4× (1h) or p-value < 0.01 on canary; critical user flow down.

## Execution
- Record rollback tuple (git SHA + migration hash).
- `scripts/rollback-verify.sh <SHA> <MIG_HASH>`
- Flush caches; restart services.

## Verification (must pass)
- `/ready` returns 200 for all deps
- Wizard smoke test passes
- Error rate < 1% for 10 minutes
- Schema version matches target
- Last deploy SHA attached to incident

## Post-mortem
- 48h, blameless; list remediations and owners.
