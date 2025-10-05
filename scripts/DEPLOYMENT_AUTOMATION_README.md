# Deployment Automation Scripts

Complete automation for deploying CODEX fixes to staging and production with comprehensive smoke tests and security monitoring.

## 📋 Overview

These PowerShell scripts automate the entire deployment pipeline:

1. **Deploy to Staging** → Automated deployment with health checks
2. **Smoke Tests** → Verify all CODEX fixes work correctly
3. **Monitor Logs** → Security checks and password masking verification
4. **Deploy to Production** → Safe production rollout with rollback support

---

## 🚀 Quick Start

### **Full Deployment Pipeline**

```powershell
# 1. Deploy to staging
.\scripts\deploy-staging.ps1

# 2. Run smoke tests
.\scripts\smoke-test.ps1 -BaseUrl "https://your-staging-url.vercel.app"

# 3. Monitor logs for security issues
.\scripts\monitor-logs.ps1 -Environment staging -Minutes 5

# 4. Deploy to production (after verification)
.\scripts\deploy-production.ps1
```

---

## 📜 Scripts Reference

### **1. deploy-staging.ps1**

Deploys code to Vercel staging environment with automated checks.

#### Usage
```powershell
.\scripts\deploy-staging.ps1 [-SkipBuild] [-Verbose]
```

#### Parameters
- `-SkipBuild` - Skip build and tests (use for hotfixes)
- `-Verbose` - Show detailed output

#### What It Does
1. ✅ Pre-deployment checks (git status, branch verification)
2. 🧪 Runs unit tests (125 tests)
3. 🔨 Builds application
4. 📦 Deploys to Vercel staging
5. 🔍 Verifies Redis connections
6. 🔐 Checks logs for password masking

#### Example
```powershell
# Standard deployment
.\scripts\deploy-staging.ps1

# Quick deploy (skip tests)
.\scripts\deploy-staging.ps1 -SkipBuild

# Verbose output
.\scripts\deploy-staging.ps1 -Verbose
```

---

### **2. smoke-test.ps1**

Comprehensive smoke tests verifying all CODEX fixes.

#### Usage
```powershell
.\scripts\smoke-test.ps1 -BaseUrl "https://your-app.vercel.app" [-Verbose]
```

#### Parameters
- `-BaseUrl` (required) - Deployment URL to test
- `-Verbose` - Show detailed output

#### Test Suites

**Suite 1: Health & Infrastructure**
- ✅ Health endpoint responds
- ✅ Redis connection verified

**Suite 2: Fee Calculations (P0 Fix)**
- ⚠️ Manual verification required
- Navigate to fund setup UI and verify:
  - 2% annual fee → 20% total drag (not 0.2%)
  - Fee calculations use fractions correctly

**Suite 3: Reserve API (P1 Fix - Date Schema)**
- ✅ Accepts ISO date strings (`"2023-10-27T10:00:00.000Z"`)
- ✅ Returns reserve allocations
- ✅ Handles portfolio of 4+ companies

**Suite 4: Pagination (P1 Fix - Portfolio Truncation)**
- ✅ Respects `limit` parameter (was hard-coded to 3)
- ✅ Returns all companies when limit > portfolio size
- ✅ Pagination works correctly

**Suite 5: Query Parameters (P2 Fix)**
- ✅ Boolean strings parsed (`"true"` → `true`)
- ✅ Enum values case-insensitive (`"HIGH"` → `"high"`)

**Suite 6: Security**
- ✅ No passwords in API responses
- ✅ Redis credentials masked in logs

#### Example
```powershell
# Run all smoke tests
.\scripts\smoke-test.ps1 -BaseUrl "https://updog-staging.vercel.app"

# Verbose output
.\scripts\smoke-test.ps1 -BaseUrl "https://updog-staging.vercel.app" -Verbose
```

#### Exit Codes
- `0` - All tests passed
- `1` - One or more tests failed

---

### **3. monitor-logs.ps1**

Monitors deployment logs and performs security checks.

#### Usage
```powershell
.\scripts\monitor-logs.ps1 [-Environment staging|production] [-Minutes 5] [-Follow] [-CheckSecurity]
```

#### Parameters
- `-Environment` - Which environment to monitor (default: `staging`)
- `-Minutes` - Time window in minutes (default: `5`)
- `-Follow` - Continuous monitoring (Ctrl+C to stop)
- `-CheckSecurity` - Run security checks (default: `true`)

#### Security Checks Performed

1. **Password Exposure**
   - ❌ Detects unmasked Redis passwords in logs
   - ✅ Verifies passwords are masked as `***`

2. **Password Masking**
   - ✅ Checks "Redis connected to host:port" format
   - ❌ Warns if credentials appear in connection strings

3. **API Keys**
   - ⚠️ Detects potential API key patterns
   - Recommends manual review

4. **Error Patterns**
   - 📊 Counts errors, timeouts, connection failures
   - ⚠️ Flags if error rate is high

5. **Redis Connection**
   - ✅ Verifies "Redis Client Connected" messages
   - ❌ Detects "Redis Client Error" messages

#### Examples
```powershell
# Monitor staging for last 5 minutes
.\scripts\monitor-logs.ps1 -Environment staging

# Continuous monitoring
.\scripts\monitor-logs.ps1 -Follow

# Production monitoring (last 10 minutes)
.\scripts\monitor-logs.ps1 -Environment production -Minutes 10

# Skip security checks
.\scripts\monitor-logs.ps1 -CheckSecurity:$false
```

---

### **4. deploy-production.ps1**

Safe production deployment with rollback support.

#### Usage
```powershell
.\scripts\deploy-production.ps1 [-SkipSmokeTest] [-Force]
```

#### Parameters
- `-SkipSmokeTest` - Skip smoke tests after deployment
- `-Force` - Skip safety confirmations (use with caution!)

#### Safety Features

**Pre-deployment Confirmations**
1. ✅ Smoke tests passed in staging?
2. ✅ Team members notified?
3. ✅ Type "DEPLOY" to confirm

**Rollback Protection**
- Captures current production URL before deployment
- Provides rollback command if anything fails
- Automatic rollback instructions if health checks fail

#### What It Does
1. 📋 Pre-deployment checks
2. 🧪 Final test suite run
3. 🔨 Production build
4. 🚀 Deploy to Vercel production
5. ✅ Post-deployment verification (health + Redis)
6. 🧪 Smoke tests (unless skipped)
7. 📊 Initial monitoring

#### Examples
```powershell
# Standard production deployment
.\scripts\deploy-production.ps1

# Skip smoke tests (if already verified)
.\scripts\deploy-production.ps1 -SkipSmokeTest

# Force deployment (no confirmations)
.\scripts\deploy-production.ps1 -Force
```

#### Rollback
If deployment fails or issues are detected:

```powershell
# Rollback to previous deployment
vercel rollback <previous-url> --yes
```

The script automatically provides the rollback command in case of failure.

---

## 🔐 Security Verification

### **What We're Checking**

All scripts verify the **P1 Redis Factory fix** properly masks passwords:

```powershell
# ❌ BAD (before fix)
Redis connecting to rediss://user:SECRET_PASSWORD@host:6379

# ✅ GOOD (after fix)
Redis connected to host:6379
```

### **Manual Verification Steps**

After deployment, verify in Vercel dashboard:

1. **Logs Tab** → Search for "Redis"
2. **Check**: Should see "Redis connected to host:port"
3. **Verify**: No passwords visible (`***` or absent)
4. **Confirm**: No `rediss://user:password@host` patterns

---

## 📊 Expected Test Results

### **Smoke Test Output**

```
🧪 Running Smoke Tests
======================

📋 Test Suite 1: Health & Infrastructure
  Testing: Health Check
    ✅ PASS: Health Check
  Testing: Redis Health
    ✅ PASS: Redis Health

📋 Test Suite 2: Fee Calculations
    ⚠️  MANUAL: Verify fee calculations in UI

📋 Test Suite 3: Reserve API
  Testing: Reserve Calculation (Date Schema Fix)
    ✅ PASS: Reserve Calculation (Date Schema Fix)

📋 Test Suite 4: Pagination
  Testing: Reserve API with Pagination (limit=2)
    ✅ PASS: Reserve API with Pagination (limit=2)
  Testing: Reserve API with Pagination (limit=100)
    ✅ PASS: Reserve API with Pagination (limit=100)

📋 Test Suite 5: Query Parameters
  Testing: Query Params - Boolean string 'true'
    ✅ PASS: Query Params - Boolean string 'true'
  Testing: Query Params - Priority enum 'high'
    ✅ PASS: Query Params - Priority enum 'high'

📋 Test Suite 6: Security Checks
    ✅ PASS: No passwords found in API responses

📊 Smoke Test Summary
=====================
  Tests Passed: 8
  Tests Failed: 0
  Total: 8

✅ All smoke tests passed!
```

---

## 🛠️ Troubleshooting

### **Vercel CLI Not Found**

```powershell
npm install -g vercel
vercel login
```

### **Tests Failing**

```powershell
# Run tests locally first
npm run test:unit

# Check specific test
npm run test:unit -- tests/unit/redis-factory.test.ts
```

### **Health Check Fails**

```powershell
# Check deployment logs
vercel logs

# Verify environment variables
vercel env ls

# Check Redis connection
# Ensure REDIS_URL or REDIS_PASSWORD is set
```

### **Password Masking Not Working**

Check `server/db/redis-factory.ts` has the updated code:

```typescript
client.on('connect', () => {
  const { host, port } = client.options;
  logger.info(`Redis connected to ${host}:${port}`);
  // ✅ Password NOT logged
});
```

---

## 📋 Deployment Checklist

Use this checklist for each deployment:

### **Pre-Deployment**
- [ ] All CODEX fixes merged to main branch
- [ ] 125 unit tests passing locally
- [ ] TypeScript compiles without errors
- [ ] Environment variables configured in Vercel

### **Staging Deployment**
- [ ] Run `.\scripts\deploy-staging.ps1`
- [ ] Verify deployment URL works
- [ ] Run `.\scripts\smoke-test.ps1` with staging URL
- [ ] All smoke tests pass
- [ ] Run `.\scripts\monitor-logs.ps1` for 5-10 minutes
- [ ] No security issues detected

### **Production Deployment**
- [ ] Team notified of deployment
- [ ] All staging tests passed
- [ ] Run `.\scripts\deploy-production.ps1`
- [ ] Health checks pass
- [ ] Smoke tests pass
- [ ] Monitor logs for 30 minutes
- [ ] Verify fee calculations in production UI
- [ ] No errors in production logs

### **Post-Deployment**
- [ ] Monitor error rates in Vercel dashboard
- [ ] Check Redis connection metrics
- [ ] Verify no password exposure in logs
- [ ] Update deployment documentation
- [ ] Notify team of successful deployment

---

## 🎯 What Each Script Verifies

| Fix | Script | Verification Method |
|-----|--------|-------------------|
| **P0 - Fee Calculation** | smoke-test.ps1 | Manual UI verification required |
| **P1 - Redis Factory** | deploy-staging.ps1<br>monitor-logs.ps1 | Health endpoint<br>Log password masking |
| **P1 - Portfolio Truncation** | smoke-test.ps1 | API returns >3 companies |
| **P1 - Date Schema** | smoke-test.ps1 | API accepts ISO strings |
| **P2 - Query Params** | smoke-test.ps1 | Boolean/enum parsing |

---

## 📚 Additional Resources

- [CODEX_FIXES_COMPLETE.md](../CODEX_FIXES_COMPLETE.md) - Complete fix documentation
- [REDIS_FACTORY_UPGRADE_SUMMARY.md](../REDIS_FACTORY_UPGRADE_SUMMARY.md) - Redis-specific details
- [Vercel Documentation](https://vercel.com/docs) - Deployment platform docs

---

## 🆘 Support

If you encounter issues:

1. Check script output for specific error messages
2. Review Vercel deployment logs: `vercel logs`
3. Verify environment variables: `vercel env ls`
4. Run tests locally: `npm run test:unit`
5. Check Redis connection in Vercel dashboard

---

**Generated**: 2025-01-04
**Version**: 1.0.0
**Compatibility**: Windows PowerShell 5.1+, PowerShell Core 7+
