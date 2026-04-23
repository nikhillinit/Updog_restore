# Stage Normalization v3.4 — Solo‑Operator Package

This package contains the production‑ready plan, runbook, observability rules,
and operational scripts for rolling out Stage Normalization v3.

## Contents

- `docs/stage-normalization-v3.4.md` — Full plan (scope, timeline, safeguards,
  success metrics)
- `docs/runbooks/stage-normalization-rollout.md` — Step‑by‑step operational
  runbook
- `observability/prometheus/rules/stage-validation.yml` — Low‑cardinality alerts
- `server/lib/stage-validation-mode.ts` — Redis‑backed mode store with TTL cache
  and fallback
- `server/lib/stage-logging.ts` — Adaptive log sampling helper
- `server/routes/_ops-stage-validation.ts` — Alertmanager webhook (HMAC + replay
  guard) to auto‑downgrade
- `scripts/normalize-stages-batched.ts` — Batched migration (checkpoint/resume,
  dry‑run, progress)
- `scripts/verify-backup-integrity.cjs` — Streaming checksum verification for
  backup files
- `scripts/test-restore.sh` — Backup restore test (temporary DB + smoke query)
- `scripts/audit-api-consumers.sh` — Consumer audit helper (code grep + access
  log probe)
- `tests/perf/validator-microbench.example.test.ts` — Example micro‑benchmark
  for validator path
- `.env.example` — Required environment variables

## How to integrate

1. Copy files into your repository at matching paths (or adjust paths in
   imports).
2. Ensure environment variables are set (see `.env.example`).
3. Run Week‑0 Pre‑Flight in the runbook, then proceed with Week‑by‑Week plan.
