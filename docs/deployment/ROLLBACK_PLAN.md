---
status: ACTIVE
last_updated: 2026-01-19
---

# Staging Rollback Plan

## Overview

This document outlines the rollback strategy for the Phase 0 Foundation staging deployment. It defines triggers, procedures, and verification steps to ensure safe and rapid rollback if issues are detected during the 48-hour soak test.

## Rollback Philosophy

- **Safety First**: When in doubt, roll back
- **Fast Response**: Rollback should complete within 5 minutes
- **Zero Data Loss**: Rollback must not cause data corruption
- **Reversible**: All rollbacks should be reversible
- **Documented**: Every rollback must be documented

## Rollback Triggers

### Critical Triggers (Immediate Rollback Required)

Any ONE of the following triggers immediate rollback:

#### 1. Application Completely Broken
- [ ] **Trigger**: 500 errors on all routes for > 2 minutes
- [ ] **Severity**: P0 - Critical
- [ ] **Impact**: All users blocked
- [ ] **Response Time**: Immediate (< 1 minute)
- [ ] **Verification**: Check multiple routes, clear browser cache
- [ ] **Example**: Homepage returns 500 error consistently

#### 2. Feature Flags Not Working
- [ ] **Trigger**: `deterministicEngineV1` unavailable or stuck at `false`
- [ ] **Severity**: P0 - Critical
- [ ] **Impact**: Core feature unavailable
- [ ] **Response Time**: Immediate (< 2 minutes)
- [ ] **Verification**: Check browser console, test feature flag service
- [ ] **Example**: `useFeatureFlags()` returns empty object or throws error

#### 3. Critical Bundle Size Regression
- [ ] **Trigger**: Bundle size increased by > 50% (> 900KB total)
- [ ] **Severity**: P0 - Critical
- [ ] **Impact**: Severe performance degradation
- [ ] **Response Time**: Within 5 minutes
- [ ] **Verification**: Run `npm run size-limit`, check Vercel Analytics
- [ ] **Example**: Critical path bundle grew from 150KB to 300KB

#### 4. Temporal Dead Zone (TDZ) Errors
- [ ] **Trigger**: TDZ errors in browser console on any route
- [ ] **Severity**: P0 - Critical
- [ ] **Impact**: Chunks loading in wrong order, features broken
- [ ] **Response Time**: Immediate (< 2 minutes)
- [ ] **Verification**: Check browser console, test all routes
- [ ] **Example**: "Cannot access 'X' before initialization" error

#### 5. Golden Dataset Tests Failing
- [ ] **Trigger**: Any golden dataset test failing in staging
- [ ] **Severity**: P0 - Critical
- [ ] **Impact**: Calculation engine producing incorrect results
- [ ] **Response Time**: Within 10 minutes
- [ ] **Verification**: Run `npm test`, check specific failing tests
- [ ] **Example**: Deterministic engine returns values outside tolerance

#### 6. Authentication Completely Broken
- [ ] **Trigger**: No users can log in (if RS256 PR merged)
- [ ] **Severity**: P0 - Critical
- [ ] **Impact**: All users blocked
- [ ] **Response Time**: Immediate (< 2 minutes)
- [ ] **Verification**: Test login flow, check JWT validation
- [ ] **Example**: JWT validation fails for all tokens

#### 7. Database Connection Failures
- [ ] **Trigger**: Persistent database connection failures (> 5 minutes)
- [ ] **Severity**: P0 - Critical
- [ ] **Impact**: No data can be read or written
- [ ] **Response Time**: Within 5 minutes
- [ ] **Verification**: Check health endpoint, database logs
- [ ] **Example**: Connection pool exhausted, no connections available

#### 8. Redis Connection Failures
- [ ] **Trigger**: Persistent Redis connection failures (> 5 minutes)
- [ ] **Severity**: P0 - Critical
- [ ] **Impact**: Queues and caching broken
- [ ] **Response Time**: Within 5 minutes
- [ ] **Verification**: Check health endpoint, Redis logs
- [ ] **Example**: Redis client cannot connect, workers failing

### Warning Triggers (Investigate, Consider Rollback)

Any TWO of the following trigger rollback consideration:

#### 1. Performance Degradation
- [ ] **Trigger**: Any Core Web Vital exceeds threshold by 50%
- [ ] **Severity**: P1 - High
- [ ] **Impact**: Poor user experience
- [ ] **Response Time**: Within 30 minutes
- [ ] **Example**: TTI increased from 3s to 5s

#### 2. Elevated Error Rate
- [ ] **Trigger**: JS error rate > 1% or API error rate > 5%
- [ ] **Severity**: P1 - High
- [ ] **Impact**: Some features broken for some users
- [ ] **Response Time**: Within 30 minutes
- [ ] **Example**: 10% of API calls returning 500 errors

#### 3. Memory Leak Detected
- [ ] **Trigger**: Memory usage increasing > 10% per hour
- [ ] **Severity**: P1 - High
- [ ] **Impact**: Application will eventually crash
- [ ] **Response Time**: Within 1 hour
- [ ] **Example**: Memory grew from 100MB to 300MB over 12 hours

#### 4. Browser Compatibility Issues
- [ ] **Trigger**: Complete failure in any major browser
- [ ] **Severity**: P1 - High
- [ ] **Impact**: Some users cannot use application
- [ ] **Response Time**: Within 2 hours
- [ ] **Example**: Safari users see blank page

#### 5. Partial Feature Flag Failure
- [ ] **Trigger**: Feature flags intermittently unavailable (< 95% uptime)
- [ ] **Severity**: P1 - High
- [ ] **Impact**: Inconsistent feature availability
- [ ] **Response Time**: Within 1 hour
- [ ] **Example**: 5% of requests return default flags instead of configured

## Rollback Procedures

### Procedure 1: Vercel UI Rollback (Fastest - 1-2 minutes)

**Best For**:
- Critical issues requiring immediate rollback
- Simple deployments with no database migrations
- Situations where previous deployment is known to be good

**Steps**:

1. **Identify Previous Working Deployment**
   - [ ] Go to Vercel Dashboard: https://vercel.com/dashboard
   - [ ] Navigate to project deployments
   - [ ] Identify last known good deployment (timestamp, commit hash)
   - [ ] **Record**: Previous deployment URL: ___
   - [ ] **Record**: Previous commit hash: ___

2. **Initiate Rollback**
   - [ ] Click on previous working deployment
   - [ ] Click "Promote to Production" (or "Set as Staging")
   - [ ] Confirm rollback action
   - [ ] **Timestamp**: Rollback initiated at: ___

3. **Wait for Propagation**
   - [ ] Wait 30-60 seconds for deployment to propagate
   - [ ] Monitor deployment status in Vercel UI
   - [ ] **Timestamp**: Rollback completed at: ___

4. **Verify Rollback** (See Verification Section below)

**Estimated Time**: 1-2 minutes
**Advantages**: Fastest method, no Git operations needed
**Disadvantages**: Doesn't update Git branch

---

### Procedure 2: Git Revert Rollback (Safe - 3-5 minutes)

**Best For**:
- Issues requiring Git history to be preserved
- Situations where multiple commits need to be reverted
- When you want rollback documented in Git

**Steps**:

1. **Identify Problematic Commits**
   ```bash
   # View recent commits
   git log --oneline -10

   # Identify range to revert
   # Example: Revert last 3 commits
   ```
   - [ ] **Record**: Commits to revert: ___
   - [ ] **Record**: Last good commit: ___

2. **Create Revert Commits**
   ```bash
   # Revert a range of commits (creates new commits)
   git revert HEAD~3..HEAD

   # Or revert specific commits
   git revert <commit-hash-1>
   git revert <commit-hash-2>
   git revert <commit-hash-3>

   # If conflicts occur, resolve them
   git add .
   git revert --continue
   ```
   - [ ] Revert commits created
   - [ ] No merge conflicts (or resolved)
   - [ ] **Timestamp**: Revert commits created at: ___

3. **Push Reverted State**
   ```bash
   # Push to branch
   git push origin feat/iteration-a-deterministic-engine

   # Vercel will automatically deploy the reverted state
   ```
   - [ ] Push successful
   - [ ] Vercel deployment triggered
   - [ ] **Timestamp**: Push completed at: ___

4. **Wait for Deployment**
   - [ ] Monitor Vercel deployment progress
   - [ ] Wait for build to complete (~3-5 minutes)
   - [ ] **Timestamp**: Deployment completed at: ___

5. **Verify Rollback** (See Verification Section below)

**Estimated Time**: 3-5 minutes
**Advantages**: Git history preserved, rollback documented
**Disadvantages**: Slower than Vercel UI, requires Git operations

---

### Procedure 3: Force Deploy Previous Commit (Temporary - 2-3 minutes)

**Best For**:
- Emergency situations requiring immediate rollback
- When Git revert would be too slow
- Temporary rollback while fixing issue

**WARNING**: This method doesn't update Git history. Use only as temporary measure.

**Steps**:

1. **Checkout Previous Commit**
   ```bash
   # Identify last good commit
   git log --oneline -10

   # Checkout that commit (detached HEAD state)
   git checkout <previous-good-commit-hash>
   ```
   - [ ] Previous commit identified: ___
   - [ ] Checked out successfully
   - [ ] **Timestamp**: Checkout at: ___

2. **Force Deploy from Commit**
   ```bash
   # Deploy directly from this commit
   vercel --yes --force
   ```
   - [ ] Deployment initiated
   - [ ] **Timestamp**: Deploy started at: ___

3. **Wait for Deployment**
   - [ ] Monitor deployment progress
   - [ ] Wait for build to complete
   - [ ] **Timestamp**: Deploy completed at: ___

4. **Return to Branch**
   ```bash
   # Return to your branch
   git checkout feat/iteration-a-deterministic-engine

   # DO NOT push - this was a temporary rollback
   ```
   - [ ] Back on branch
   - [ ] **Note**: Remember to create proper fix and redeploy

5. **Verify Rollback** (See Verification Section below)

**Estimated Time**: 2-3 minutes
**Advantages**: Very fast, simple
**Disadvantages**: Temporary, Git history not updated, easy to forget to fix properly

**IMPORTANT**: After using this procedure, you MUST:
- [ ] Create proper fix
- [ ] Test fix locally
- [ ] Either merge fix or create new revert commit
- [ ] Deploy fix to staging

---

### Procedure 4: Environment Variable Rollback (Specific - 1 minute)

**Best For**:
- Issues caused by environment variable changes
- Feature flag configuration problems
- Configuration-only issues

**Steps**:

1. **Identify Changed Variables**
   - [ ] Go to Vercel Dashboard → Settings → Environment Variables
   - [ ] Review recent changes
   - [ ] Identify problematic variables
   - [ ] **Record**: Changed variables: ___

2. **Revert Variables**
   - [ ] Click on each changed variable
   - [ ] Revert to previous value
   - [ ] Save changes
   - [ ] **Timestamp**: Variables reverted at: ___

3. **Trigger Redeployment**
   ```bash
   # Trigger redeploy with new env vars
   vercel --yes --force
   ```
   - [ ] Redeployment triggered
   - [ ] **Timestamp**: Deploy started at: ___

4. **Wait for Deployment**
   - [ ] Monitor deployment progress
   - [ ] **Timestamp**: Deploy completed at: ___

5. **Verify Rollback** (See Verification Section below)

**Estimated Time**: 1 minute
**Advantages**: Very fast for config issues
**Disadvantages**: Only works for environment variable issues

---

## Rollback Verification

After ANY rollback procedure, perform the following verification steps:

### Step 1: Basic Functionality (1-2 minutes)

- [ ] **Homepage loads correctly**
  - [ ] Navigate to staging URL
  - [ ] Page renders without errors
  - [ ] No 500 errors
  - [ ] **Timestamp**: ___

- [ ] **No console errors**
  - [ ] Open browser DevTools console
  - [ ] Refresh page
  - [ ] Verify no red errors
  - [ ] No TDZ errors
  - [ ] **Timestamp**: ___

- [ ] **Feature flags accessible**
  - [ ] Open browser console
  - [ ] Run: `window.featureFlags` or similar
  - [ ] Verify flags object returned
  - [ ] **Timestamp**: ___

- [ ] **Navigation works**
  - [ ] Navigate to dashboard
  - [ ] Navigate to fund setup
  - [ ] Navigate to portfolio
  - [ ] All routes load correctly
  - [ ] **Timestamp**: ___

### Step 2: Bundle Size Check (1 minute)

```bash
# Check bundle sizes locally
npm run size-limit
```

- [ ] **Bundle size within limits**
  - [ ] Critical path < 150KB
  - [ ] Total bundle < 600KB
  - [ ] No size warnings
  - [ ] **Actual sizes**: ___
  - [ ] **Timestamp**: ___

### Step 3: Test Suite (2-5 minutes)

```bash
# Run full test suite
npm test
```

- [ ] **All tests passing**
  - [ ] Unit tests: 100% pass
  - [ ] Integration tests: 100% pass
  - [ ] Golden dataset tests: 100% pass
  - [ ] **Test results**: ___/___
  - [ ] **Timestamp**: ___

### Step 4: Performance Check (2-3 minutes)

- [ ] **Lighthouse audit**
  - [ ] Run Lighthouse in Chrome DevTools
  - [ ] Performance score > 80
  - [ ] No critical issues
  - [ ] **Score**: ___
  - [ ] **Timestamp**: ___

- [ ] **Key metrics within range**
  - [ ] TTFB < 300ms
  - [ ] FCP < 2s
  - [ ] LCP < 3s
  - [ ] TTI < 4s
  - [ ] **Actual metrics**: ___
  - [ ] **Timestamp**: ___

### Step 5: Health Checks (1 minute)

```bash
# Check health endpoint
curl https://<staging-url>/api/health
```

- [ ] **Health endpoint responds**
  - [ ] Status: 200 OK
  - [ ] Response includes health data
  - [ ] Database: connected
  - [ ] Redis: connected (if applicable)
  - [ ] **Response**: ___
  - [ ] **Timestamp**: ___

### Step 6: Verification Summary

- [ ] **Rollback successful**: [Yes / No]
- [ ] **All checks passed**: [Yes / No]
- [ ] **Issues remaining**: ___
- [ ] **Confidence level**: [High / Medium / Low]
- [ ] **Safe to resume testing**: [Yes / No]

**Total Verification Time**: 7-14 minutes

---

## Post-Rollback Actions

### Immediate Actions (Within 15 minutes)

1. **Document the Incident**
   - [ ] Create incident report document
   - [ ] Record trigger that caused rollback
   - [ ] Document rollback procedure used
   - [ ] Note timestamp of issue detection
   - [ ] Note timestamp of rollback completion
   - [ ] Record any data loss or corruption

2. **Notify Stakeholders**
   - [ ] Notify team in Slack
   - [ ] Update status page (if exists)
   - [ ] Inform project lead
   - [ ] Message format:
     ```
     🚨 ROLLBACK EXECUTED
     Time: <timestamp>
     Trigger: <trigger description>
     Procedure: <procedure used>
     Status: <current status>
     Next steps: <action plan>
     ```

3. **Preserve Evidence**
   - [ ] Save Vercel deployment logs
   - [ ] Export browser console errors
   - [ ] Capture network traffic if relevant
   - [ ] Screenshot error states
   - [ ] Save test failure output

### Investigation Phase (Within 1 hour)

1. **Root Cause Analysis**
   - [ ] Identify what changed between deployments
   - [ ] Review commit diff: `git diff <good-commit> <bad-commit>`
   - [ ] Check for environment variable changes
   - [ ] Review recent dependency updates
   - [ ] Analyze logs for clues
   - [ ] **Root cause**: ___

2. **Impact Assessment**
   - [ ] Determine scope of issue
   - [ ] Identify affected users (if any)
   - [ ] Check for data corruption
   - [ ] Assess whether issue could occur in production
   - [ ] **Impact summary**: ___

3. **Fix Strategy**
   - [ ] Determine fix approach
   - [ ] Estimate fix complexity
   - [ ] Identify testing requirements
   - [ ] Plan redeployment strategy
   - [ ] **Fix plan**: ___

### Fix and Redeploy (Within 4 hours)

1. **Create Fix**
   - [ ] Create new branch or commit to existing
   - [ ] Implement fix
   - [ ] Add regression test to prevent recurrence
   - [ ] Run full test suite locally
   - [ ] Code review (if team available)

2. **Test Fix Thoroughly**
   - [ ] Unit tests pass
   - [ ] Integration tests pass
   - [ ] Manual testing of affected area
   - [ ] Performance testing
   - [ ] Browser compatibility testing

3. **Redeploy to Staging**
   - [ ] Deploy fix to staging
   - [ ] Monitor deployment closely
   - [ ] Run full verification checklist
   - [ ] Monitor for 1 hour before considering stable

4. **Document Lessons Learned**
   - [ ] What went wrong
   - [ ] What we learned
   - [ ] How to prevent in future
   - [ ] Update deployment checklist
   - [ ] Update monitoring/alerts

---

## Rollback Decision Matrix

Use this matrix to decide on rollback procedure:

| Scenario | Severity | Recommended Procedure | Max Response Time |
|----------|----------|----------------------|-------------------|
| Complete outage (500 on all routes) | P0 | Procedure 1 (Vercel UI) | 1 minute |
| TDZ errors breaking features | P0 | Procedure 1 (Vercel UI) | 2 minutes |
| Feature flags completely broken | P0 | Procedure 1 (Vercel UI) | 2 minutes |
| Bundle size >2x expected | P0 | Procedure 1 (Vercel UI) | 5 minutes |
| Database connection failed | P0 | Procedure 4 (Env vars) or 1 | 5 minutes |
| Golden dataset tests failing | P0 | Procedure 2 (Git revert) | 10 minutes |
| Performance degraded 50% | P1 | Procedure 2 (Git revert) | 30 minutes |
| High error rate (5-10%) | P1 | Investigate, then Procedure 2 | 30 minutes |
| One browser completely broken | P1 | Investigate, then Procedure 2 | 2 hours |
| Minor visual issues | P2 | No rollback, create fix | N/A |
| Non-critical warnings | P2 | No rollback, create fix | N/A |

---

## Special Rollback Scenarios

### Scenario 1: Database Migration Rollback

**If deployment included database migration**:

1. **Check Migration Status**
   ```bash
   # Connect to staging database
   npm run db:studio

   # Check migration table
   SELECT * FROM migrations ORDER BY applied_at DESC LIMIT 5;
   ```

2. **Rollback Migration**
   ```bash
   # If using Drizzle
   npm run db:rollback

   # Or manually revert schema changes
   ```

3. **Then Rollback Code** (Use Procedure 1 or 2)

4. **Verify Data Integrity**
   - [ ] Check key tables
   - [ ] Verify no data loss
   - [ ] Test critical queries

### Scenario 2: Feature Flag Service Failure

**If feature flag service itself is down**:

1. **Enable Hardcoded Fallbacks**
   - [ ] Update environment variable: `FEATURE_FLAGS_FALLBACK=true`
   - [ ] Redeploy with Procedure 4

2. **Or Rollback to Before Feature Flag Changes**
   - [ ] Use Procedure 1 or 2

### Scenario 3: Third-Party Service Degradation

**If issue is caused by external service**:

1. **Verify External Service Status**
   - [ ] Check service status page
   - [ ] Test API endpoints directly

2. **If Service is Down**:
   - [ ] Enable fallback/graceful degradation
   - [ ] Update environment variables
   - [ ] DO NOT rollback code

3. **If Our Integration is Broken**:
   - [ ] Rollback using Procedure 2
   - [ ] Fix integration
   - [ ] Add error handling

---

## Rollback Testing

Before relying on these procedures in production, test them in staging:

### Rollback Drill (Recommended: Do once before soak test)

1. **Setup**
   - [ ] Deploy a "broken" version intentionally
   - [ ] Example: Add `throw new Error("Test rollback")` to homepage

2. **Execute Rollback**
   - [ ] Detect the issue
   - [ ] Execute Procedure 1 (Vercel UI)
   - [ ] Time how long it takes
   - [ ] **Actual time**: ___

3. **Verify Rollback**
   - [ ] Run verification checklist
   - [ ] Confirm all checks pass

4. **Document**
   - [ ] Record any issues with procedure
   - [ ] Update procedures if needed
   - [ ] Train team on process

---

## Appendix: Contact Information

### Escalation Path

**Level 1: Developer**
- Self-service rollback using procedures above
- Decision authority for P1 and P2 issues

**Level 2: Tech Lead**
- Contact for P0 issues
- Decision authority for production rollbacks
- Contact: ___

**Level 3: Engineering Manager**
- Contact for critical incidents
- Final decision authority
- Contact: ___

### External Contacts

**Vercel Support**
- Support: support@vercel.com
- Status: https://vercel-status.com

**Database Provider**
- Support: ___
- Status: ___

**Redis Provider (Upstash)**
- Support: support@upstash.com
- Status: https://status.upstash.com

---

## Appendix: Rollback Commands Quick Reference

```bash
# Vercel rollback (after UI rollback)
vercel ls                    # List deployments
vercel inspect <url>         # Inspect specific deployment

# Git rollback
git log --oneline -10        # View recent commits
git revert HEAD              # Revert last commit
git revert HEAD~3..HEAD      # Revert last 3 commits
git reset --hard <commit>    # DANGEROUS: Hard reset to commit

# Force deploy from commit
git checkout <commit-hash>
vercel --yes --force
git checkout <branch>

# Check deployment status
vercel logs                  # View logs
vercel ls                    # List deployments

# Test deployment
curl https://<url>/api/health
npm run size-limit
npm test
```

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-10-04 | Initial rollback plan | Claude |

---

**Last Updated**: 2025-10-04
**Next Review**: After first rollback incident or before production deployment
