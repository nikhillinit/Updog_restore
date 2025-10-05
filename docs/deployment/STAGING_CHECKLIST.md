# Staging Deployment Checklist - Phase 0 Foundation

## Pre-Deployment Validation

### Code Quality Gates
- [ ] All 4 critical blockers fixed
  - [ ] Feature flag memoization removed (P0-001)
  - [ ] Vite manual chunking removed/fixed (P0-002)
  - [ ] Golden dataset tolerance changed to AND logic (P0-003)
  - [ ] CI workflow refactored to 3 jobs (P0-004)
- [ ] TypeScript compilation passes: `npm run check`
- [ ] Linting passes: `npm run lint`
- [ ] All tests pass: `npm test`
- [ ] Bundle size within limits: `npm run size-limit`
- [ ] Forbidden token violations: 0

### Regression Test Validation
- [ ] Feature flag tests pass (memoization)
  - [ ] `tests/unit/feature-flags.test.ts` - all passing
  - [ ] Provider does not memoize values
  - [ ] Updates propagate correctly to consumers
- [ ] Golden dataset tolerance tests pass (AND logic)
  - [ ] `tests/unit/deterministic-engine.test.ts` - all passing
  - [ ] Both relative AND absolute tolerances enforced
  - [ ] Strict validation prevents false positives
- [ ] Vite build tests pass (no TDZ errors)
  - [ ] `npm run build` completes successfully
  - [ ] No Temporal Dead Zone errors in console
  - [ ] Chunks load in correct dependency order
- [ ] CI workflow tests pass (3-job structure)
  - [ ] Test job runs independently
  - [ ] Build job runs independently
  - [ ] Deploy job depends on both
- [ ] Integration tests pass (all fixes together)
  - [ ] Full test suite: `npm test` - 100% pass rate
  - [ ] No interdependencies between fixes

### Build Verification
- [ ] Production build succeeds: `npm run build`
- [ ] Build uses Preact (verify in bundle analysis)
- [ ] No console errors in build output
- [ ] Bundle analysis shows expected chunks:
  - [ ] Critical path: < 150KB
  - [ ] Deterministic engine: < 50KB
  - [ ] Math/crypto vendor: < 30KB
- [ ] Source maps generated correctly
- [ ] Environment variables configured

## Staging Environment Setup

### Vercel Configuration
- [ ] Create staging environment in Vercel dashboard
  - [ ] Project: updog-pressonventures (or similar)
  - [ ] Environment: Staging
  - [ ] Git branch: `feat/iteration-a-deterministic-engine`
- [ ] Set environment variables in Vercel:
  ```
  VITE_ENV=staging
  BUILD_WITH_PREACT=1
  NODE_ENV=production
  VITE_API_URL=<staging-api-url>

  # If auth PR merged (RS256):
  JWT_ALG=RS256
  JWT_JWKS_URL=<staging-auth-url>
  JWT_ISSUER=<staging-issuer>
  JWT_AUDIENCE=<staging-audience>

  # Database & Redis
  DATABASE_URL=<staging-postgres-url>
  REDIS_URL=<staging-redis-url>
  ENABLE_QUEUES=1
  ```
- [ ] Configure custom domain (optional): `staging.updog.pressonventures.com`
- [ ] Enable preview deployments for branch
- [ ] Set up deployment notifications:
  - [ ] Slack integration enabled
  - [ ] Email notifications configured

### Feature Flags
- [ ] Verify `deterministicEngineV1: true` in staging config
- [ ] Verify staging ribbon configuration:
  - [ ] `VITE_ENV=staging` triggers staging banner
  - [ ] Banner displays "STAGING ENVIRONMENT"
  - [ ] Banner is dismissible
- [ ] Verify feature flag provider doesn't have stale memoized data
- [ ] Test flag changes propagate (if admin UI exists)

### Database & Services
- [ ] Staging database provisioned (PostgreSQL)
  - [ ] Separate instance from production
  - [ ] Connection pooling configured
  - [ ] Migrations applied: `npm run db:push`
- [ ] Redis instance configured
  - [ ] Upstash Redis or similar
  - [ ] Connection tested
  - [ ] Password masked in logs
- [ ] BullMQ workers configured
  - [ ] Reserve calculation worker
  - [ ] Pacing analysis worker
  - [ ] Health checks passing
- [ ] Seed data loaded (if needed)
  - [ ] Test funds created
  - [ ] Sample portfolio data

## Deployment Execution

### Deploy to Vercel
- [ ] Ensure branch is up to date: `git pull origin feat/iteration-a-deterministic-engine`
- [ ] Push branch to GitHub: `git push origin feat/iteration-a-deterministic-engine`
- [ ] Trigger Vercel deployment:
  - [ ] Option 1: Automatic trigger (push to branch)
  - [ ] Option 2: Manual via Vercel CLI: `vercel --yes`
  - [ ] Option 3: Manual via Vercel dashboard
- [ ] Wait for build to complete (~3-5 minutes)
- [ ] Verify deployment URL: https://<project-name>-<hash>.vercel.app
- [ ] Check deployment logs for errors:
  - [ ] Build logs clean
  - [ ] No critical warnings
  - [ ] All assets bundled correctly

### Post-Deployment Smoke Tests
- [ ] Homepage loads without errors
  - [ ] Navigate to deployment URL
  - [ ] Page renders within 3 seconds
  - [ ] No 404 or 500 errors
- [ ] Staging ribbon visible at top
  - [ ] Banner shows "STAGING ENVIRONMENT"
  - [ ] Correct styling applied
  - [ ] Dismissible via close button
- [ ] Feature flags accessible via `useFeatureFlags()`
  - [ ] Open browser DevTools
  - [ ] Check feature flag values
  - [ ] Verify `deterministicEngineV1: true`
- [ ] Authentication works (if RS256 merged)
  - [ ] Login page accessible
  - [ ] JWT validation working
  - [ ] Protected routes enforced
- [ ] Navigation between routes works
  - [ ] All routes load correctly
  - [ ] No route-level errors
  - [ ] Lazy loading works
- [ ] No console errors in browser
  - [ ] Open DevTools console
  - [ ] No red errors
  - [ ] No TDZ errors
  - [ ] No chunk loading errors

### Bundle Size Validation
- [ ] Check Vercel Analytics for bundle sizes
  - [ ] Critical path: < 150KB
  - [ ] Total bundle: < 600KB
  - [ ] Meets size budget
- [ ] Verify Preact is used (not React)
  - [ ] Inspect bundle with DevTools
  - [ ] Look for `preact` imports
  - [ ] Confirm no `react-dom` in bundle
- [ ] Confirm chunks loaded in correct order
  - [ ] Network tab in DevTools
  - [ ] Check chunk dependencies
  - [ ] No TDZ errors
- [ ] Test lazy loading of routes
  - [ ] Navigate to different pages
  - [ ] Observe chunks loaded on demand
  - [ ] No premature loading
- [ ] Measure Time to Interactive (TTI)
  - [ ] Use Lighthouse
  - [ ] Target: < 3.5s
  - [ ] Document actual value

## 48-Hour Soak Test Plan

### Automated Monitoring (Set Up Before Deployment)

**Monitoring Script**: `scripts/staging-monitor.sh`
- [ ] Script created and executable
- [ ] Health check endpoint tested: `/api/health`
- [ ] Bundle size check configured
- [ ] Feature flag check configured
- [ ] Slack webhook configured (optional)
- [ ] Cron job or GitHub Actions scheduled (every 15 minutes)

**GitHub Actions Workflow**: `.github/workflows/staging-monitor.yml`
- [ ] Workflow created
- [ ] Schedule configured (every 15 minutes)
- [ ] Health check step added
- [ ] Feature flag verification step added
- [ ] Bundle size check step added
- [ ] Slack notification on failure (optional)
- [ ] Workflow enabled

### Manual Validation Checklist

**Day 1 - Deployment Day (Hour 0)**
- [ ] **Hour 0-2: Intensive Testing**
  - [ ] Feature flags work correctly
    - [ ] `deterministicEngineV1: true` confirmed
    - [ ] No memoization issues
    - [ ] Updates propagate
  - [ ] Staging ribbon dismissible
    - [ ] Click close button
    - [ ] Banner disappears
    - [ ] Preference saved
  - [ ] No console errors
    - [ ] Check all pages
    - [ ] Check all routes
    - [ ] Check all modals/dialogs
  - [ ] All routes load
    - [ ] Dashboard
    - [ ] Fund setup
    - [ ] Portfolio view
    - [ ] Reports
  - [ ] Golden dataset tests pass in staging
    - [ ] Run test suite against staging API
    - [ ] Verify AND logic enforcement
    - [ ] Confirm no false positives

- [ ] **Hour 2-8: Periodic Checks (every 2 hours)**
  - [ ] Check Vercel deployment logs
    - [ ] No errors
    - [ ] No unusual warnings
    - [ ] Resource usage normal
  - [ ] Monitor error rates in Sentry (if configured)
    - [ ] Zero critical errors
    - [ ] No error spikes
  - [ ] Verify bundle sizes stable
    - [ ] Run `npm run size-limit`
    - [ ] Compare to baseline
    - [ ] No unexpected growth
  - [ ] Test key user flows
    - [ ] Create fund
    - [ ] Edit portfolio
    - [ ] Generate report

- [ ] **Hour 8-24: Passive Monitoring**
  - [ ] Automated monitor script running
    - [ ] Check logs for script execution
    - [ ] Verify no failures
  - [ ] Slack notifications enabled (if configured)
    - [ ] Test notification
    - [ ] Verify webhook working

**Day 2 - Soak Test Day (Hour 24-48)**
- [ ] **Morning: Full Regression Test**
  - [ ] Run full test suite against staging
    - [ ] `npm test` - 100% pass rate
    - [ ] All unit tests passing
    - [ ] All integration tests passing
  - [ ] Verify feature flags still enabled
    - [ ] Check browser console
    - [ ] Verify `deterministicEngineV1: true`
  - [ ] Check for memory leaks (Vercel Analytics)
    - [ ] Memory usage stable
    - [ ] No leaks over 24 hours
  - [ ] Test with different browsers
    - [ ] Chrome (latest)
    - [ ] Firefox (latest)
    - [ ] Safari (latest)
    - [ ] Edge (latest)

- [ ] **Afternoon: Load Testing (if applicable)**
  - [ ] Simulate concurrent users
    - [ ] Use tool like k6 or Artillery
    - [ ] 10 concurrent users
    - [ ] 5-minute duration
  - [ ] Monitor response times
    - [ ] API endpoints < 200ms
    - [ ] Page loads < 3s
  - [ ] Check database query performance
    - [ ] No slow queries
    - [ ] Connection pool healthy

- [ ] **Evening: Final Validation**
  - [ ] All automated monitors passing
    - [ ] Review 48-hour logs
    - [ ] Zero failures
  - [ ] No errors in 48-hour period
    - [ ] Check Vercel logs
    - [ ] Check Sentry (if configured)
    - [ ] Check application logs
  - [ ] Bundle sizes stable
    - [ ] Compare to initial deployment
    - [ ] No drift
  - [ ] Feature flags working as expected
    - [ ] Final verification
    - [ ] Test flag updates

### Metrics to Track

**Performance Metrics** (Tracked via Lighthouse/Vercel Analytics)
- [ ] Time to First Byte (TTFB): < 200ms
- [ ] First Contentful Paint (FCP): < 1.5s
- [ ] Largest Contentful Paint (LCP): < 2.5s
- [ ] Time to Interactive (TTI): < 3.5s
- [ ] Total Blocking Time (TBT): < 200ms
- [ ] Cumulative Layout Shift (CLS): < 0.1

**Bundle Metrics** (Tracked via `npm run size-limit`)
- [ ] Critical Path: < 150KB (or 200KB if React)
- [ ] Deterministic Engine: < 50KB
- [ ] Math/Crypto Vendor: < 30KB
- [ ] Total Bundle: < 600KB
- [ ] Chunk load order: correct (no TDZ errors)

**Functional Metrics** (Tracked manually + automated)
- [ ] Feature flags: 100% uptime
- [ ] Staging ribbon: visible on all pages
- [ ] Golden dataset tests: 100% pass rate
- [ ] Zero forbidden token violations
- [ ] Zero TypeScript errors
- [ ] Zero linting errors

**Error Tracking** (Tracked via logs + Sentry)
- [ ] JavaScript errors: 0
- [ ] Network errors: < 0.1%
- [ ] API errors: < 1%
- [ ] Bundle load failures: 0
- [ ] Feature flag failures: 0

**Browser Compatibility** (Tested manually)
- [ ] Chrome 100+: All features working
- [ ] Firefox 100+: All features working
- [ ] Safari 15+: All features working
- [ ] Edge 100+: All features working
- [ ] Mobile Chrome: All features working
- [ ] Mobile Safari: All features working

## Rollback Plan

### Rollback Triggers

Immediate rollback required if ANY of the following occur:
- [ ] Critical error blocking all users (500 errors on all routes)
- [ ] Feature flags not working (deterministic engine unavailable)
- [ ] Bundle size increased by >50% (critical performance regression)
- [ ] TDZ errors in console (deployment broken)
- [ ] Golden dataset tests failing in staging (calculation errors)
- [ ] Authentication completely broken (if RS256 merged)
- [ ] Database connection failures (persistent)
- [ ] Redis connection failures (persistent)

### Rollback Procedure

**Step 1: Identify Issue**
1. [ ] Check Vercel deployment logs
2. [ ] Check browser console for errors
3. [ ] Run `npm run size-limit` locally
4. [ ] Run `npm test` locally
5. [ ] Document the issue and timestamp

**Step 2: Execute Rollback**

**Option 1: Revert to previous deployment via Vercel UI**
1. [ ] Go to Vercel Dashboard → Deployments
2. [ ] Select previous working deployment
3. [ ] Click "Promote to Production" (or Staging)
4. [ ] Wait for rollback to complete (~1 minute)

**Option 2: Git revert and redeploy**
```bash
# Revert commits since last working state
git revert HEAD~1..HEAD

# Push reverted state
git push origin feat/iteration-a-deterministic-engine

# Vercel will auto-deploy the reverted state
```

**Option 3: Force deploy from previous commit**
```bash
# Checkout previous working commit
git checkout <previous-commit-hash>

# Force deploy
vercel --yes --force

# Return to branch
git checkout feat/iteration-a-deterministic-engine
```

**Step 3: Verify Rollback**
- [ ] Staging URL loads correctly
- [ ] Previous feature set working
- [ ] No errors in console
- [ ] Bundle sizes back to normal
- [ ] All metrics returning to baseline

**Step 4: Post-Mortem**
- [ ] Document what went wrong
- [ ] Identify root cause
- [ ] Create fix PR with regression test
- [ ] Add monitoring to prevent recurrence

## Success Criteria

At the end of 48 hours, ALL of the following must be true:

### Code Quality
- [x] All 4 critical blockers fixed
- [x] All regression tests passing
- [x] Zero TypeScript errors
- [x] Zero linting errors
- [x] Zero forbidden token violations

### Deployment Health
- [ ] Staging URL accessible 100% uptime
- [ ] Feature flags working correctly
- [ ] Staging ribbon visible and functional
- [ ] Bundle sizes within limits
- [ ] No TDZ errors
- [ ] No console errors
- [ ] No deployment errors in logs

### Testing
- [ ] Golden dataset tests pass (100% rate)
- [ ] All unit tests pass (100% rate)
- [ ] All integration tests pass (100% rate)
- [ ] Browser compatibility verified (6 browsers)
- [ ] Performance metrics met (all 6 metrics)

### Monitoring
- [ ] Automated monitor ran successfully for 48 hours
- [ ] All metrics tracked and documented
- [ ] Zero rollback triggers
- [ ] Zero critical incidents
- [ ] Error rate < 0.1%

### Performance
- [ ] TTFB < 200ms (average)
- [ ] FCP < 1.5s (average)
- [ ] LCP < 2.5s (average)
- [ ] TTI < 3.5s (average)
- [ ] TBT < 200ms (average)
- [ ] CLS < 0.1 (average)

## Next Steps After Soak Test

If all success criteria met:
1. [ ] Create PR to merge `feat/iteration-a-deterministic-engine` → `main`
2. [ ] Document soak test results in PR description
3. [ ] Get code review approval from team
4. [ ] Merge to main with squash commit
5. [ ] Deploy to production with feature flags DISABLED initially
6. [ ] Enable feature flags for 5% canary rollout
7. [ ] Monitor production for 1 week
8. [ ] Gradual rollout: 5% → 25% → 50% → 100%
9. [ ] Document lessons learned
10. [ ] Update deployment playbooks

## Appendix: Quick Reference

### Useful Commands
```bash
# Deploy to staging
vercel --yes

# Check deployment status
vercel ls

# View deployment logs
vercel logs --follow

# Run smoke tests
.\scripts\smoke-test.ps1 -BaseUrl "https://<deployment-url>.vercel.app"

# Check bundle size
npm run size-limit

# Run all tests
npm test

# Check TypeScript
npm run check

# Check linting
npm run lint
```

### Deployment URLs
- Staging: https://<project-name>-<hash>.vercel.app
- Vercel Dashboard: https://vercel.com/dashboard
- GitHub Actions: https://github.com/<org>/Updog_restore/actions

### Key Contacts
- DevOps: [Contact info]
- Team Lead: [Contact info]
- On-call: [Contact info]

### Documentation Links
- [Deployment Status](./CODEX-FIXES-DEPLOYMENT-STATUS.md)
- [Rollback Plan](./ROLLBACK_PLAN.md)
- [Staging Metrics](./STAGING_METRICS.md)
- [Integration PR Checklist](../INTEGRATION_PR_CHECKLIST.md)
