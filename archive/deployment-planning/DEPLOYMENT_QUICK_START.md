# 🚀 CODEX Fixes - Deployment Quick Start

**Ready to deploy all CODEX fixes? Follow these 4 simple steps.**

---

## ⚡ **Quick Start (5 Minutes)**

### **Step 1: Deploy to Staging**

```powershell
cd c:\dev\Updog_restore
.\scripts\deploy-staging.ps1
```

**What it does**:

- ✅ Runs all 125 tests
- ✅ Builds application
- ✅ Deploys to Vercel staging
- ✅ Verifies Redis connection
- ✅ Checks password masking

**Expected output**:

```
✅ Deployed to: https://updog-staging-xyz.vercel.app
✅ Redis connection verified
✅ Passwords appear to be masked
```

---

### **Step 2: Run Smoke Tests**

```powershell
.\scripts\smoke-test.ps1 -BaseUrl "https://updog-staging-xyz.vercel.app"
```

**What it tests**:

- ✅ Health & Redis connection
- ✅ Reserve API accepts dates (P1 fix)
- ✅ Pagination works (P1 fix - was limited to 3)
- ✅ Query params parse (P2 fix)
- ✅ No password leakage (security)

**Expected output**:

```
Tests Passed: 8
Tests Failed: 0
✅ All smoke tests passed!
```

---

### **Step 3: Monitor Logs**

```powershell
.\scripts\monitor-logs.ps1 -Environment staging -Minutes 5
```

**What it checks**:

- 🔐 Password masking working
- ❌ No exposed credentials
- ✅ Redis connection successful
- 📊 Error rates normal

**Expected output**:

```
✅ No unmasked passwords found
✅ Passwords appear to be properly masked
✅ Redis connection successful
✅ No security issues detected in logs
```

---

### **Step 4: Deploy to Production**

```powershell
.\scripts\deploy-production.ps1
```

**Safety confirmations** (you'll be asked):

1. All smoke tests passed in staging? → `y`
2. Team members notified? → `y`
3. Ready to deploy? Type → `DEPLOY`

**What it does**:

- 📋 Captures current production URL (for rollback)
- 🧪 Runs final tests
- 🔨 Production build
- 🚀 Deploys to production
- ✅ Verifies health + Redis
- 🧪 Runs smoke tests
- 📊 Monitors initial logs

**Expected output**:

```
✅ Production Deployment Complete!
  Deployment URL: https://updog-prod.vercel.app
  ✅ Health check passed
  ✅ Redis connected
  ✅ Smoke tests passed

🎉 Deployment successful!
```

---

## 📋 **Manual Verification (Important!)**

After deployment, manually verify the **P0 fee calculation fix**:

1. Navigate to fund setup wizard in production
2. Create a fund with 2% management fee
3. **Verify**: Fee drag shows **20%** (not 0.2%)
4. **Check**: Net investable capital is correct

**Example**:

- Fund size: $100M
- Fee: 2% annual × 10 years = 20% total
- **Expected**: Fee drag = $20M
- **Net capital**: $80M

**If you see 0.2% instead of 20%, the fix didn't deploy correctly.**

---

## 🆘 **Troubleshooting**

### **Tests Fail in Step 1**

```powershell
# Run tests locally to diagnose
npm run test:unit

# Check specific failing test
npm run test:unit -- tests/unit/redis-factory.test.ts
```

### **Smoke Tests Fail in Step 2**

Check the specific test that failed:

- **Health Check**: Deployment didn't start properly
- **Redis**: Connection credentials issue (check `REDIS_URL` in Vercel)
- **Reserve API**: Date schema fix didn't apply
- **Pagination**: Portfolio truncation fix didn't apply

### **Password Not Masked in Step 3**

This is **CRITICAL** - do not proceed to production!

1. Check logs manually: `vercel logs --env=staging`
2. Search for "Redis" - should see "Redis connected to host:port"
3. Should NOT see `rediss://user:password@host`
4. If password visible, code didn't deploy correctly

### **Production Deploy Blocked**

If deployment asks for confirmations you can't answer:

```powershell
# Skip smoke tests if already verified
.\scripts\deploy-production.ps1 -SkipSmokeTest

# Force deployment (use with caution!)
.\scripts\deploy-production.ps1 -Force
```

---

## 🔄 **Rollback (If Needed)**

If something goes wrong in production:

```powershell
# The deploy script shows the rollback command
vercel rollback https://previous-url.vercel.app --yes

# Or get list of previous deployments
vercel ls --prod

# Rollback to specific deployment
vercel rollback <deployment-url> --yes
```

---

## ✅ **Success Indicators**

You'll know deployment succeeded when you see:

1. ✅ **All 125 tests passing** in Step 1
2. ✅ **8/8 smoke tests passing** in Step 2
3. ✅ **No security issues** in Step 3
4. ✅ **Production health check passes** in Step 4
5. ✅ **Fee calculations show 20% not 0.2%** in manual verification

---

## 📞 **Need Help?**

Review detailed documentation:

- [scripts/DEPLOYMENT_AUTOMATION_README.md](./scripts/DEPLOYMENT_AUTOMATION_README.md) -
  Full script documentation
- [CODEX_FIXES_COMPLETE.md](./CODEX_FIXES_COMPLETE.md) - Complete fix details
- [REDIS_FACTORY_UPGRADE_SUMMARY.md](./REDIS_FACTORY_UPGRADE_SUMMARY.md) -
  Redis-specific info

Check Vercel:

- Dashboard: https://vercel.com/dashboard
- Logs: `vercel logs --follow`
- Environment vars: `vercel env ls`

---

## 📊 **What Gets Fixed**

| Issue                 | Before            | After            | Script Verifies |
| --------------------- | ----------------- | ---------------- | --------------- |
| **P0 - Fees**         | 0.2% (100x error) | 20% (correct)    | Manual UI check |
| **P1 - Redis**        | Auth fails        | Works with TLS   | Health endpoint |
| **P1 - Portfolio**    | 3 companies max   | All companies    | Smoke test API  |
| **P1 - Dates**        | JSON rejected     | ISO strings work | Smoke test API  |
| **P2 - Query Params** | "true" fails      | Coerced to bool  | Smoke test API  |

---

## ⏱️ **Timeline**

- **Step 1** (Staging): ~3-5 minutes
- **Step 2** (Smoke Tests): ~1 minute
- **Step 3** (Monitor): ~2 minutes
- **Step 4** (Production): ~3-5 minutes
- **Manual Verification**: ~2 minutes

**Total: ~15 minutes end-to-end**

---

## 🎯 **You're Ready!**

All scripts are tested and production-ready. Just run the 4 steps above and
you're done!

**Start now**:

```powershell
cd c:\dev\Updog_restore
.\scripts\deploy-staging.ps1
```

Good luck! 🚀
