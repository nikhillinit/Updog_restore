# Rollback Procedure & Verification Checklist

## Auto-triggers
- Burn-rate > 14.4× (1h) or p-value < 0.01 on canary
- Critical user flow down (wizard, fund creation, simulations)
- Error rate spike > 10% sustained for 5 minutes
- Database connection pool exhausted > 2 minutes

## Pre-Rollback Checklist
- [ ] Incident commander assigned
- [ ] Stakeholders notified via Slack #incidents
- [ ] Current deployment SHA recorded
- [ ] Database migration state captured
- [ ] Metrics baseline snapshot taken

## Execution Steps

### 1. Record Current State
```bash
# Capture current deployment info
git rev-parse HEAD > rollback-from.txt
npm run db:version >> rollback-from.txt
curl -s http://localhost:5000/health >> rollback-from.txt
```

### 2. Execute Rollback
```bash
# Run rollback script with target SHA and migration hash
./scripts/rollback-verify.sh <TARGET_SHA> <MIGRATION_HASH>

# Alternative manual rollback
git checkout <TARGET_SHA>
npm ci
npm run build
npm run db:rollback --to <MIGRATION_HASH>
pm2 restart all || systemctl restart app
```

### 3. Clear Caches & Restart
```bash
# Flush Redis caches
redis-cli FLUSHDB

# Clear CDN cache (if applicable)
curl -X POST https://api.cdn.com/purge

# Restart services
pm2 restart all
# OR
docker-compose restart
# OR  
systemctl restart nodejs-app
```

## Verification Checklist (Must Pass All)

### ✅ Service Health
- [ ] `/ready` endpoint returns 200
- [ ] `/health` shows all dependencies green
- [ ] All circuit breakers closed
- [ ] Redis connection active
- [ ] PostgreSQL pool healthy

### ✅ Smoke Tests
```bash
# Run synthetic smoke tests
npm run test:smoke

# Manual verification
curl -f http://localhost:5000/ready
curl -f http://localhost:5000/health
```

### ✅ Critical User Flows
- [ ] Wizard loads and submits successfully
- [ ] Fund creation completes
- [ ] Monte Carlo simulations run
- [ ] Dashboard renders with data
- [ ] Authentication/authorization working

### ✅ Metrics Validation
- [ ] Error rate < 1% for 10 minutes
- [ ] Response time p95 < 500ms
- [ ] Database query time < 100ms p95
- [ ] No memory leaks detected
- [ ] CPU usage normalized

### ✅ Database State
- [ ] Schema version matches target
- [ ] No pending migrations
- [ ] Connection pool stable
- [ ] Query performance normal

## Post-Rollback Actions

### Immediate (< 30 min)
1. Update incident status in Slack
2. Notify on-call team of rollback completion
3. Monitor metrics for 30 minutes
4. Document rollback reason and impact

### Follow-up (< 24 hours)
1. Create incident report
2. Schedule post-mortem meeting
3. Identify root cause
4. Create fix forward plan

## Post-Mortem Template

### Timeline
- Detection time:
- Rollback initiated:
- Rollback completed:
- Service restored:
- Total downtime:

### Impact
- Users affected:
- Features impacted:
- Data loss/corruption:
- Financial impact:

### Root Cause
- Primary cause:
- Contributing factors:
- Detection delay reasons:

### Action Items
| Action | Owner | Due Date | Status |
|--------|-------|----------|--------|
| | | | |

### Lessons Learned
- What went well:
- What went poorly:
- Lucky breaks:
- Process improvements:

## Rollback Script Location
`scripts/rollback-verify.sh`

## Emergency Contacts
- On-call Engineer: Check PagerDuty
- Incident Commander: Slack #incidents
- Database Admin: Slack #database
- Infrastructure: Slack #infrastructure

## Related Documentation
- [Deployment Guide](../deployment.md)
- [Monitoring & Alerts](../monitoring.md)
- [Circuit Breaker Operations](./circuit-breaker.md)
- [Database Recovery](./database-recovery.md)
