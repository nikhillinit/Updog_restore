---
status: ACTIVE
last_updated: 2026-01-19
---

# Runbook — Stage Normalization v3.4 Rollout

## Week‑0 Pre‑Flight (Required)

1) **Consumer Audit**  
   - Run `scripts/audit-api-consumers.sh` and manually classify unknown IPs/UAs as internal or external.  
   - If external consumers exist, remain in WARN longer and address them directly.

2) **Redis & Fallback**  
   - Verify Redis connectivity in staging. Kill Redis briefly and confirm mode resolver degrades to last‑known/default and logs WARN.

3) **Backups**  
   - Run `scripts/verify-backup-integrity.cjs ./backups` → checksum OK.  
   - Run `scripts/test-restore.sh ./backups/latest.sql` → restore + smoke query OK in < 5 min.

4) **Exit Criteria**  
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
- Dry‑run batched migration; review audit logs; then run with `--apply` when ready.

## Week 3 (Observability + Docs)

- Add Prometheus rules in `observability/prometheus/rules/stage-validation.yml`.  
- Configure Alertmanager → `_ops` webhook.  
- Update OpenAPI & ADR addendum.

## Week 4 (Rollout)

- **Day 1–2:** `mode=off`; collect ≥10k requests/endpoint; baseline unknown fraction.
- **Day 3–5:** `mode=warn`; verify unknowns < 0.5%.
- **Day 5:** backup → restore test → normalize (batched or transactional) → verify distinct stages.
- **Day 6:** canary enforce with promotion gates (see below).

### Canary Enforce Promotion Gates

**30-Minute Promotion Window Between Stages**

Each canary stage must maintain green metrics for **30 consecutive minutes** before promoting to the next stage:

#### Stage 1: 10% Traffic (2 hours minimum)
**Promotion Criteria (all must be met):**
- ✅ p99 latency < 1ms sustained for 30 minutes
- ✅ Error rate < 0.1% sustained for 30 minutes
- ✅ Unknown stage rate < 0.5% sustained for 30 minutes
- ✅ No auto-downgrade webhooks triggered
- ✅ Structured audit logs show no anomalies

**If criteria met:** Wait 30 minutes, then promote to 50%

#### Stage 2: 50% Traffic (4 hours minimum)
**Promotion Criteria (same as above):**
- ✅ All metrics green for 30 consecutive minutes
- ✅ No regressions from 10% stage
- ✅ Database query patterns stable

**If criteria met:** Wait 30 minutes, then promote to 100%

#### Stage 3: 100% Traffic (monitor for 24 hours)
**Success Criteria:**
- ✅ All metrics remain green for 24 hours
- ✅ No customer complaints or incidents
- ✅ Exit WARN mode after 7 consecutive days < 0.5% unknown rate

---

## Rollback Procedures

**If canary fails**  
1) Auto‑downgrade to WARN (webhook).  
2) Inspect structured logs for top offenders and variants.  
3) Extend WARN 7 days; adjust alias map or add temp normalization.  
4) Retry canary.

**If migration fails mid‑batch**  
1) Check `stage_migration_control` for `last_id` and status.  
2) Inspect `stage_normalization_log`.  
3) Fix data; resume:
```bash
ts-node scripts/normalize-stages-batched.ts --apply --resume-from <last_good_id>
```

**If backup restore fails**  
1) Do **not** proceed.  
2) Fix backup job/DB perms; re‑run backup; re‑verify checksum + restore.

---

## KPIs & Alerts

- **SLIs**: p99 validator < 1 ms; enforce‑error < 0.1%; unknown in WARN < 0.5%.
- **Auto‑downgrade** on enforce‑error spikes; **block ENFORCE** if WARN unknown ≥ 1% for 10 min.
- **Exit WARN** after 7 consecutive days < 0.5% (cap 30 days).

---

## Troubleshooting Guide

### "Redis connection failed"
**Symptoms:** Logs show `[stage-mode] Redis connect failed`
**Impact:** Mode store falls back to cache/default (safe degradation)
**Action:**
1. Check Redis connectivity: `redis-cli ping`
2. Verify REDIS_URL environment variable
3. Check Redis logs for connection issues
4. Mode resolver continues operating with fallback behavior
5. **No immediate action required** - system degrades gracefully

### "Backup checksum mismatch"
**Symptoms:** `❌ checksum mismatch` from verify script
**Impact:** Backup is corrupt or was modified
**Action:**
1. **DO NOT PROCEED** with migration
2. Re-run backup script: `scripts/backup-database.sh`
3. Re-verify checksum: `scripts/verify-backup-integrity.cjs ./backups/latest.sql`
4. Investigate disk/transfer issues if problem persists
5. Consider increasing backup retention

### "Migration batch failed"
**Symptoms:** Error during UPDATE in batch N, checkpoint saved
**Impact:** Partial migration (batches 1 to N-1 completed)
**Action:**
1. Check `stage_migration_control` table for last successful ID:
   ```sql
   SELECT * FROM stage_migration_control ORDER BY updated_at DESC LIMIT 1;
   ```
2. Inspect `stage_normalization_log` for error details:
   ```sql
   SELECT * FROM stage_normalization_log WHERE normalized_stage IS NULL;
   ```
3. Fix data issues if identified
4. Resume migration:
   ```bash
   ts-node scripts/normalize-stages-batched.ts --apply --resume-from <last_good_id>
   ```

### "HMAC signature validation failed"
**Symptoms:** Webhook returns `{ error: 'invalid-signature' }`
**Impact:** Auto-downgrade webhook rejected
**Action:**
1. Verify ALERTMANAGER_WEBHOOK_SECRET matches Alertmanager config
2. Check webhook payload is JSON stringified correctly
3. Verify X-Alertmanager-Signature header is present
4. Test signature generation:
   ```bash
   echo -n '{"test":"data"}' | openssl dgst -sha256 -hmac "$SECRET"
   ```
5. Check server logs for timing-safe comparison failures

### "Mode flip rejected"
**Symptoms:** `setStageValidationMode()` throws error
**Impact:** Mode change not applied
**Action:**
1. Verify mode value is one of: `off`, `warn`, `enforce`
2. Check Redis connectivity (may need fallback)
3. Review structured audit logs for rejection reason
4. Verify caller has correct permissions
5. Check for concurrent mode changes

### "Performance regression detected"
**Symptoms:** Alert `StageValidatorLatencyRegression` fires
**Impact:** p99 latency > 1ms for 5 minutes
**Action:**
1. Check performance baseline:
   ```bash
   npm test tests/perf/validator.microbench.test.ts
   ```
2. Review recent code changes affecting validator
3. Check for database query regressions
4. Investigate system resource contention
5. Consider rolling back recent changes if regression is severe

### "Promotion gate blocked"
**Symptoms:** Alert `EnforceGateUnknownRateHigh` fires
**Impact:** Cannot promote to ENFORCE mode
**Action:**
1. Check unknown stage rate:
   ```
   stage_warn_unknown_total / http_requests_total
   ```
2. Query top unknown stages:
   ```sql
   SELECT stage, COUNT(*) FROM portfolio_companies
   WHERE stage NOT IN ('pre-seed','seed','series-a','series-b','series-c','series-c+')
   GROUP BY stage ORDER BY COUNT(*) DESC LIMIT 10;
   ```
3. Add aliases to normalization map if needed
4. Extend WARN mode by 7 days
5. Re-attempt promotion after unknown rate < 0.5%

