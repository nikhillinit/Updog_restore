# Runbook — Stage Normalization v3.4 Rollout

## Week‑0 Pre‑Flight (Required)

1. **Consumer Audit**
   - Run `scripts/audit-api-consumers.sh` and manually classify unknown IPs/UAs
     as internal or external.
   - If external consumers exist, remain in WARN longer and address them
     directly.

2. **Redis & Fallback**
   - Verify Redis connectivity in staging. Kill Redis briefly and confirm mode
     resolver degrades to last‑known/default and logs WARN.

3. **Backups**
   - Run `scripts/verify-backup-integrity.cjs ./backups` → checksum OK.
   - Run `scripts/test-restore.sh ./backups/latest.sql` → restore + smoke query
     OK in < 5 min.

4. **Exit Criteria**
   - Consumer audit clear or mitigations documented.
   - Redis GET p99 < 10 ms (staging); fallback verified.
   - Backup restore test OK.
   - Test DB seeded (≥1k rows).

---

## Week 1 (Routes + Infra)

- Deploy boundary validators for 3 endpoints.
- Deploy Redis mode store and `_ops` webhook.
- Add validator micro‑bench (path only).

## Week 2 (Tests + Migration)

- Unit + integration (9 scenarios).
- Perf baseline in CI.
- Dry‑run batched migration; review audit logs; then run with `--apply` when
  ready.

## Week 3 (Observability + Docs)

- Add Prometheus rules in `observability/prometheus/rules/stage-validation.yml`.
- Configure Alertmanager → `_ops` webhook.
- Update OpenAPI & ADR addendum.

## Week 4 (Rollout)

- **Day 1–2:** `mode=off`; collect ≥10k requests/endpoint; baseline unknown
  fraction.
- **Day 3–5:** `mode=warn`; verify unknowns < 0.5%.
- **Day 5:** backup → restore test → normalize (batched or transactional) →
  verify distinct stages.
- **Day 6:** canary enforce: 10% (2 h), 50% (4 h), 100% if stable.

---

## Rollback Procedures

**If canary fails**

1. Auto‑downgrade to WARN (webhook).
2. Inspect structured logs for top offenders and variants.
3. Extend WARN 7 days; adjust alias map or add temp normalization.
4. Retry canary.

**If migration fails mid‑batch**

1. Check `stage_migration_control` for `last_id` and status.
2. Inspect `stage_normalization_log`.
3. Fix data; resume:

```bash
ts-node scripts/normalize-stages-batched.ts --apply --resume-from <last_good_id>
```

**If backup restore fails**

1. Do **not** proceed.
2. Fix backup job/DB perms; re‑run backup; re‑verify checksum + restore.

---

## KPIs & Alerts

- **SLIs**: p99 validator < 1 ms; enforce‑error < 0.1%; unknown in WARN < 0.5%.
- **Auto‑downgrade** on enforce‑error spikes; **block ENFORCE** if WARN unknown
  ≥ 1% for 10 min.
- **Exit WARN** after 7 consecutive days < 0.5% (cap 30 days).
