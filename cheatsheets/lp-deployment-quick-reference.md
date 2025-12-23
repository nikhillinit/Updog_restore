# LP Reporting Dashboard: Deployment Quick Reference

**Deployment Infrastructure Version**: 1.0
**Last Updated**: December 23, 2025

Fast reference for LP deployment operations. See full guide in `docs/lp-deployment-checklist.md`.

## Files Created

| File | Purpose | Size |
|------|---------|------|
| `scripts/migrate-lp-tables.ts` | Migration runner with rollback | 698 lines |
| `server/routes/lp-health.ts` | Health check endpoint | 267 lines |
| `docs/lp-deployment-checklist.md` | Complete deployment guide | 750 lines |
| `.env.example` | Environment configuration | +5 lines |
| `server/routes.ts` | Route registration | +3 lines |

## Pre-Deployment (5 minutes)

```bash
# 1. Create report storage directory
mkdir -p "${LP_REPORT_STORAGE_PATH:-/tmp/reports}"
chmod 755 "${LP_REPORT_STORAGE_PATH:-/tmp/reports}"

# 2. Test database connectivity
psql "$DATABASE_URL" -c "SELECT version();"

# 3. Verify funds table exists (prerequisite)
psql "$DATABASE_URL" -c "SELECT EXISTS(SELECT 1 FROM funds);"

# 4. Backup database
pg_dump "$DATABASE_URL" > db-backup-$(date +%Y%m%d-%H%M%S).sql

# 5. Test migration with --dry-run
npm run migrate:lp -- --dry-run

# 6. Test Redis (if enabled)
redis-cli -u "$REDIS_URL" ping
```

## Deployment

```bash
# 1. Run migration
npm run migrate:lp
# Output should show: Migration 001-lp-base complete, Migration 002-lp-commitments complete, Migration 003-lp-reports complete

# 2. Verify migrations applied
psql "$DATABASE_URL" -c "SELECT * FROM lp_reporting_migrations;"
# Should show 3 rows

# 3. Verify tables created
psql "$DATABASE_URL" -c "SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'lp_%' ORDER BY table_name;"

# 4. Deploy application code
npm run build

# 5. Restart API server
systemctl restart app-api

# 6. Enable feature flag
curl -X PUT "http://api.example.com/api/flags/LP_DASHBOARD_ENABLED" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"enabled": true}'
```

## Post-Deployment Verification (15 minutes)

```bash
# 1. Health check endpoint (must return 200 with status: healthy)
curl -X GET "http://api.example.com/api/lp/health" | jq .

# 2. Test profile endpoint
curl -X GET "http://api.example.com/api/lp/profile" \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -H "X-LP-ID: 1" | jq .

# 3. Check logs for errors
tail -100 /var/log/app/api.log | grep -i error

# 4. Verify table constraints
psql "$DATABASE_URL" -c "
  INSERT INTO limited_partners (name, email, entity_type)
  VALUES ('Test', 'duplicate@test.com', 'individual');
  INSERT INTO limited_partners (name, email, entity_type)
  VALUES ('Test2', 'duplicate@test.com', 'individual');" 2>&1
# Should show constraint violation on second insert

# 5. Monitor error rate
# Check monitoring system - should stay < 0.1% for 30 minutes
```

## Rollback (Emergency Use Only)

```bash
# 1. Stop accepting LP requests (update feature flag)
curl -X PUT "http://api.example.com/api/flags/LP_DASHBOARD_ENABLED" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"enabled": false}'

# 2. Rollback migrations
npm run migrate:lp -- --rollback

# 3. Verify rollback
psql "$DATABASE_URL" -c "SELECT * FROM lp_reporting_migrations;"
# Should return no rows

# 4. Revert application code
git revert HEAD~1
npm run build
systemctl restart app-api

# 5. Verify core functionality restored
curl -X GET "http://api.example.com/api/funds" \
  -H "Authorization: Bearer $TEST_TOKEN" | jq .
```

## Environment Variables

```env
# Required for deployment
LP_REPORT_STORAGE_PATH=/tmp/reports           # Directory for reports
LP_REPORT_MAX_SIZE_MB=50                      # Max file size
LP_CACHE_TTL_SECONDS=300                      # Cache duration
LP_RATE_LIMIT_MAX=100                         # Requests per window
LP_RATE_LIMIT_WINDOW_MS=60000                 # Window duration (ms)
```

## Health Check Response

```json
{
  "status": "healthy",
  "checks": {
    "database": {
      "status": "healthy",
      "latencyMs": 15,
      "tables": {
        "limited_partners": { "status": "healthy" },
        "lp_fund_commitments": { "status": "healthy" },
        "capital_activities": { "status": "healthy" },
        "lp_distributions": { "status": "healthy" },
        "lp_capital_accounts": { "status": "healthy" },
        "lp_performance_snapshots": { "status": "healthy" },
        "lp_reports": { "status": "healthy" },
        "report_templates": { "status": "healthy" }
      },
      "missingTables": []
    },
    "redis": {
      "status": "healthy",
      "enabled": true,
      "mode": "cluster",
      "latencyMs": 5
    },
    "reportStorage": {
      "status": "healthy",
      "path": "/tmp/reports",
      "exists": true,
      "writable": true
    }
  },
  "timestamp": "2025-12-23T13:35:00Z"
}
```

## Troubleshooting

**Health check returns degraded database**
```bash
# Check which tables are missing
psql "$DATABASE_URL" -c "SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'lp_%';"

# Re-run migration
npm run migrate:lp
```

**Migration fails with "Required table funds is missing"**
```bash
# Apply core migrations first
npm run db:push

# Then retry LP migrations
npm run migrate:lp
```

**Report storage path not writable**
```bash
# Fix permissions
chmod 755 "${LP_REPORT_STORAGE_PATH:-/tmp/reports}"

# Verify
touch "${LP_REPORT_STORAGE_PATH:-/tmp/reports}/.test" && rm .test && echo "OK"
```

**Rate limiting errors (429)**
```bash
# Increase limits in .env
LP_RATE_LIMIT_MAX=200              # Increase from 100
LP_RATE_LIMIT_WINDOW_MS=60000      # Keep same

# Restart app
systemctl restart app-api
```

## Monitoring Queries

```sql
-- Check migration status
SELECT id, name, applied_at FROM lp_reporting_migrations ORDER BY applied_at;

-- Table row counts
SELECT 'limited_partners' as table_name, count(*) FROM limited_partners
UNION ALL SELECT 'lp_fund_commitments', count(*) FROM lp_fund_commitments
UNION ALL SELECT 'lp_reports', count(*) FROM lp_reports;

-- Performance snapshots
SELECT commitment_id, count(*) FROM lp_performance_snapshots GROUP BY commitment_id;

-- Pending reports
SELECT status, count(*) FROM lp_reports GROUP BY status ORDER BY count DESC;

-- LP commitments by fund
SELECT f.name, count(lc.id) as num_lps, sum(lc.commitment_amount_cents)/100.0 as total_usd
FROM lp_fund_commitments lc
JOIN funds f ON f.id = lc.fund_id
GROUP BY f.id, f.name
ORDER BY total_usd DESC;
```

## API Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/lp/health` | GET | Health check | 200/503 |
| `/api/lp/profile` | GET | LP profile info | 200/401 |
| `/api/lp/summary` | GET | Dashboard summary | 200/401 |
| `/api/lp/capital-account` | GET | Account transactions | 200/401 |
| `/api/lp/funds/:fundId/detail` | GET | Fund detail | 200/401 |
| `/api/lp/funds/:fundId/holdings` | GET | Portfolio holdings | 200/401 |
| `/api/lp/performance` | GET | Performance timeseries | 200/401 |
| `/api/lp/performance/benchmark` | GET | Benchmark comparison | 200/401 |
| `/api/lp/reports/generate` | POST | Queue report generation | 200/401 |
| `/api/lp/reports` | GET | List reports | 200/401 |
| `/api/lp/reports/:reportId` | GET | Report status | 200/401 |
| `/api/lp/reports/:reportId/download` | GET | Download report | 200/401 |

## Features Controlled by Feature Flag

Feature: `LP_DASHBOARD_ENABLED`

When enabled: All LP endpoints available, health checks monitor LP feature
When disabled: LP endpoints return 404, not included in health checks

## Scaling Considerations

- **Database**: Each LP query adds single SELECT - index on lp_id and commitment_id
- **Cache**: 5-minute TTL (LP_CACHE_TTL_SECONDS) reduces database load by 80%
- **Rate Limit**: 100 requests/minute per LP (adjust LP_RATE_LIMIT_MAX if needed)
- **Storage**: Reports average 2-5 MB each, monitor LP_REPORT_STORAGE_PATH usage

## Performance Targets

| Operation | Target | Alert Threshold |
|-----------|--------|-----------------|
| Health Check | < 50ms | > 500ms |
| DB Query (p95) | < 200ms | > 1000ms |
| LP API (p95) | < 200ms | > 500ms |
| Report Gen | < 5 min | > 10 min |
| Cache Hit | < 5ms | > 50ms |

## Contacts

**Deployment Issues**: Engineering team
**Incidents**: On-call engineer
**Post-Mortem**: Team lead

## Links

- Full Deployment Guide: `docs/lp-deployment-checklist.md`
- Implementation Summary: `.claude/LP-DEPLOYMENT-INFRASTRUCTURE-SUMMARY.md`
- Migration Script: `scripts/migrate-lp-tables.ts`
- Health Check: `server/routes/lp-health.ts`
- LP Schema: `shared/schema-lp-reporting.ts`
