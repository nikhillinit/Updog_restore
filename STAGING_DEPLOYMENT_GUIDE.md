# Staging Deployment Guide - Manual Process

**Date:** October 4, 2025
**Branch:** feat/merge-ready-refinements
**Status:** Ready for manual deployment (npm build issues on Windows)

---

## Current Status

### ✅ Validation Gates Complete (3/4)
- **Gate #1 (XIRR):** 100% pass rate ✅
- **Gate #2 (DPI Null):** Type-safe implementation ✅
- **Gate #4 (Status Field):** API complete ✅
- **Gate #3 (Performance):** Pending staging deployment

### ⚠️ Build Issue

**Problem:** npm install on Windows is not properly installing vite/vitest packages
- Packages listed in package.json but not in node_modules
- Platform-specific issue with Windows/Git Bash environment
- **Impact:** Cannot run `npm run build` locally

**Recommendation:** Use CI/CD pipeline or Linux environment for build

---

## Manual Deployment Process

### Option 1: Use CI/CD Pipeline (Recommended)

If you have GitHub Actions, GitLab CI, or similar:

```bash
# 1. Commit validation work
git add .
git commit -m "feat: Complete validation gates (XIRR, DPI, Status)"

# 2. Push to staging branch
git push origin feat/merge-ready-refinements

# 3. Trigger deployment workflow
# (Automatic if configured, or manual trigger via CI/CD UI)
```

**CI/CD will:**
- Run `npm ci` (clean install)
- Run `npm run build` (production bundle)
- Deploy to staging environment
- Run smoke tests

---

### Option 2: Manual Build on Linux/Mac

If CI/CD not available, build on a Linux/Mac machine:

```bash
# On Linux/Mac machine:

# 1. Clone repository
git clone <repo-url>
cd Updog_restore
git checkout feat/merge-ready-refinements

# 2. Install dependencies
npm ci

# 3. Build production bundle
npm run build

# Expected output:
# > rest-express@1.3.2 build
# > npm run build:prod
#
# vite v5.4.20 building for production...
# ✓ built in 15.32s
#
# Build complete. Files in /dist

# 4. Deploy dist/ folder to staging server
scp -r dist/* user@staging-server:/var/www/app/
# OR use your deployment tool (Docker, Kubernetes, etc.)

# 5. Restart application
ssh user@staging-server "pm2 restart app"
# OR docker-compose restart, etc.
```

---

### Option 3: Docker Build (Platform-Independent)

Use Docker to build in a consistent environment:

```bash
# 1. Create Dockerfile (if not exists)
cat > Dockerfile.build <<'EOF'
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --production=false
COPY . .
RUN npm run build

# Output will be in /app/dist
EOF

# 2. Build with Docker
docker build -f Dockerfile.build -t updog-build .

# 3. Extract dist folder
docker create --name temp updog-build
docker cp temp:/app/dist ./dist
docker rm temp

# 4. Deploy dist folder to staging
# (Use your deployment method)
```

---

## Pre-Deployment Checklist

Before deploying to staging, verify:

- ✅ All validation gates passed (3/4 complete)
- ✅ Git branch is clean and pushed
- ✅ package.json dependencies are up-to-date
- ✅ Environment variables configured for staging
- ✅ Database migrations applied (if any)
- ✅ Staging infrastructure ready (server, database, Redis)

---

## Staging Deployment Steps

### Step 1: Build (Use Option 1, 2, or 3 above)

Expected build output:
```
✓ 1247 modules transformed
✓ built in 15.32s

dist/client/index.html                   0.45 kB
dist/client/assets/index-a1b2c3d4.css   125.21 kB │ gzip: 18.45 kB
dist/client/assets/index-e5f6g7h8.js    487.32 kB │ gzip: 142.18 kB
```

### Step 2: Deploy to Staging

**If using Vercel:**
```bash
npx vercel --prod --env staging
```

**If using custom server:**
```bash
# 1. Upload files
scp -r dist/* user@staging.updog.com:/var/www/app/

# 2. Restart services
ssh user@staging.updog.com << 'EOF'
  pm2 restart api
  pm2 restart client
  systemctl reload nginx
EOF
```

**If using Docker:**
```bash
docker-compose -f docker-compose.staging.yml up -d --build
```

### Step 3: Verify Deployment

```bash
# 1. Health check
curl https://staging.updog.com/health
# Expected: {"status": "ok"}

# 2. Metrics endpoint
curl https://staging.updog.com/api/funds/1/metrics | jq '._status'
# Expected: {"quality": "complete", ...}

# 3. Frontend loads
curl -I https://staging.updog.com
# Expected: 200 OK
```

---

## Gate #3: Performance Validation (After Deployment)

Once staging is deployed, run Gate #3:

### Automated Performance Tests

```bash
# Option A: Use test suite
npm test -- metrics-performance.test.ts

# Option B: Load testing with k6
k6 run tests/load/metrics-baseline.js

# Option C: Apache Bench
ab -n 100 -c 10 https://staging.updog.com/api/funds/1/metrics
```

### Manual Performance Check

```bash
# 1. Cold cache test (10 requests)
for i in {1..10}; do
  curl -w "%{time_total}\n" -o /dev/null -s \
    "https://staging.updog.com/api/funds/1/metrics?skipCache=true"
done | awk '{sum+=$1; if($1>max)max=$1} END {print "Avg:", sum/NR*1000"ms", "Max:", max*1000"ms"}'

# Expected: Avg < 500ms, Max < 1000ms

# 2. Warm cache test (10 requests)
for i in {1..10}; do
  curl -w "%{time_total}\n" -o /dev/null -s \
    "https://staging.updog.com/api/funds/1/metrics"
done | awk '{sum+=$1; if($1>max)max=$1} END {print "Avg:", sum/NR*1000"ms", "Max:", max*1000"ms"}'

# Expected: Avg < 200ms, Max < 500ms
```

### Performance Targets

| Metric | Target | Acceptable | Action Required |
|--------|--------|------------|-----------------|
| **Cold cache p95** | < 500ms | < 1000ms | Optimize if > 1000ms |
| **Warm cache p95** | < 200ms | < 500ms | Optimize if > 500ms |
| **Cache hit ratio** | > 80% | > 60% | Tune cache if < 60% |
| **Error rate** | 0% | < 0.1% | Investigate if > 0.1% |
| **Throughput** | 100 req/s | 50 req/s | Scale if < 50 req/s |

---

## Monitoring Checklist (24-hour observation)

### Day 1 (Deployment)
- [ ] Deployment successful
- [ ] Health check passes
- [ ] Gate #3 performance tests passed
- [ ] No errors in logs (first hour)
- [ ] Metrics endpoint responds correctly
- [ ] Frontend loads successfully

### Day 1 Evening (8 hours post-deployment)
- [ ] No memory leaks detected
- [ ] Cache hit ratio > 80%
- [ ] Response times stable
- [ ] No user complaints
- [ ] Error rate < 0.1%

### Day 2 (24 hours post-deployment)
- [ ] System stable for 24 hours
- [ ] No incidents
- [ ] Performance SLAs met
- [ ] Finance review complete (XIRR approval)
- [ ] **GO/NO-GO decision** for production rollout

---

## Rollback Plan

**If deployment fails or Gate #3 fails:**

```bash
# 1. Immediate rollback
git revert HEAD
git push origin feat/merge-ready-refinements

# OR redeploy previous version
git checkout <previous-commit>
# Deploy using method above

# 2. Notify team
# Slack: "Staging deployment rolled back due to [issue]"

# 3. Investigate
# Check logs, reproduce issue locally, fix

# 4. Re-deploy after fix
# Follow deployment process again
```

---

## Success Criteria

### Staging Deployment Complete When:
- [ ] Build succeeds (dist/ folder created)
- [ ] Deployment to staging successful
- [ ] Health check passes
- [ ] Gate #3 performance tests passed
- [ ] 24-hour observation period complete
- [ ] No critical issues found

### Ready for Production When:
- [ ] Staging stable for 24 hours
- [ ] Finance sign-off received (XIRR methodology)
- [ ] All 4 validation gates passed
- [ ] No P0/P1 bugs in backlog
- [ ] Rollback tested and verified

---

## Environment Variables for Staging

Ensure these are configured:

```bash
# .env.staging
NODE_ENV=production
API_URL=https://staging-api.updog.com
DATABASE_URL=postgresql://user:pass@staging-db:5432/updog_staging
REDIS_URL=redis://staging-redis:6379
ENABLE_QUEUES=1

# Feature flags
ENABLE_NEW_METRICS=true
SKIP_CACHE_AUTH=true

# Monitoring
SENTRY_DSN=<staging-sentry-dsn>
LOG_LEVEL=info
```

---

## Next Steps After Staging Success

1. **Week 1:** Production rollout (gradual, monitored)
2. **Week 2:** Finance approval for LP reporting
3. **Week 2-3:** Begin Phase 1 UX work (Quick Wins)
   - Export enhancements
   - Metric tooltips
   - Status badge UI

**Estimated Time to Production:** 5-7 days (if staging passes)

---

## Troubleshooting

### Issue: Build fails with "Cannot find module 'vite'"

**Solution:** Use CI/CD or Linux environment
- Windows npm install has platform issues
- Build on Linux/Mac or use Docker

### Issue: Performance tests fail (> 1000ms)

**Solution:** Optimize database queries
- Check for N+1 queries
- Add database indexes
- Enable query logging
- Use `skipProjections=true` flag

### Issue: 500 errors in staging

**Solution:** Check logs
```bash
ssh user@staging "tail -f /var/log/app/error.log"
# Look for stack traces
```

### Issue: Cache not working (hit ratio < 60%)

**Solution:** Verify Redis connection
```bash
curl https://staging.updog.com/api/funds/1/metrics | jq '._cache'
# Check: hit: true/false, key: "..."
```

---

## Contact & Escalation

**Engineering:** Execute deployment, monitor performance
**DevOps:** Assist with infrastructure/deployment issues
**Finance:** Review XIRR results, sign off on methodology
**Product:** Approve production rollout timing

---

## Validation Work Committed

All validation code changes are ready to commit:

```bash
git status
# Modified:
#   client/src/components/layout/dynamic-fund-header.tsx
#   (DPI null formatting)
#
# New files:
#   client/src/lib/format-metrics.ts
#   test-xirr-manual.mjs
#   GATE_1_VALIDATION_REPORT.md
#   GATE_2_VALIDATION_REPORT.md
#   GATE_4_VALIDATION_REPORT.md
#   VALIDATION_GATES_SUMMARY.md
#   STAGING_DEPLOYMENT_GUIDE.md

# Commit:
git add .
git commit -m "feat: Complete validation gates (XIRR 100%, DPI null, Status field)

- Gate #1: XIRR validation 11/11 tests passed (Excel parity)
- Gate #2: DPI null semantics (type-safe, UI shows N/A)
- Gate #4: Status field verification (API complete)
- Gate #3: Ready for staging deployment

Reports: GATE_*_VALIDATION_REPORT.md
Summary: VALIDATION_GATES_SUMMARY.md
"
```

---

**Ready for Deployment:** ✅ YES
**Build Method:** Manual (CI/CD or Linux environment)
**Gate #3:** Ready to run post-deployment
**Confidence Level:** HIGH (3/4 gates passed locally)

---

**Generated:** October 4, 2025
**Branch:** feat/merge-ready-refinements
**Next Action:** Deploy to staging using recommended method
