# 🚀 Deploy CODEX Fixes - Instructions

## ✅ **Code is Ready!**

All CODEX fixes are committed and ready for deployment:

- Commit: `9c3313f`
- Branch: `feat/iteration-a-deterministic-engine`
- Files: 38 files changed, 7539 insertions
- Tests: 125 passing

---

## 📋 **Option 1: Automated Deployment (Recommended)**

Open **PowerShell** and run:

```powershell
cd C:\dev\Updog_restore

# Step 1: Deploy to staging
.\scripts\deploy-staging.ps1

# Step 2: Run smoke tests (use URL from step 1)
.\scripts\smoke-test.ps1 -BaseUrl "https://your-staging-url.vercel.app"

# Step 3: Monitor logs
.\scripts\monitor-logs.ps1 -Environment staging -Minutes 5

# Step 4: Deploy to production
.\scripts\deploy-production.ps1
```

---

## 📋 **Option 2: Manual Deployment**

If automation scripts don't work, deploy manually:

### **Step 1: Push to GitHub**

```powershell
git push origin feat/iteration-a-deterministic-engine
```

### **Step 2: Create Pull Request**

```powershell
gh pr create --title "fix: CODEX P0/P1/P2 issues - production ready" `
  --body "Fixes all 5 CODEX issues with 125 passing tests. See CODEX_FIXES_COMPLETE.md for details."
```

### **Step 3: Deploy via Vercel CLI**

```powershell
# Install Vercel CLI if needed
npm install -g vercel

# Login
vercel login

# Deploy to staging
vercel --env=staging

# Deploy to production (after testing)
vercel --prod
```

### **Step 4: Manual Testing**

After deployment, test these fixes:

1. **P0 - Fee Calculation**
   - Navigate to fund setup wizard
   - Create fund with 2% management fee
   - **Verify**: Shows 20% total drag (NOT 0.2%)

2. **P1 - Redis Connection**
   - Check Vercel logs for "Redis connected"
   - **Verify**: No passwords visible in logs

3. **P1 - Portfolio API**
   - Test reserve API with 4+ companies
   - **Verify**: All companies returned (not just 3)

4. **P1 - Date Schema**
   - Send ISO date string to reserve API
   - **Verify**: API accepts it (doesn't return 400)

5. **P2 - Query Params**
   - Test with `?async=true&priority=HIGH`
   - **Verify**: API parses correctly

---

## 📋 **Option 3: Vercel Dashboard**

### **Web-Based Deployment**

1. Go to https://vercel.com/dashboard
2. Find your project
3. Click "Deploy" button
4. Select branch: `feat/iteration-a-deterministic-engine`
5. Click "Deploy to Staging"
6. Test staging URL
7. Promote to production

---

## 🔍 **What to Verify After Deployment**

### **Critical Checks**

✅ **Health Endpoint**

```powershell
curl https://your-app.vercel.app/api/health
# Should return: { "status": "healthy", "redis": { "status": "connected" } }
```

✅ **Password Masking** Check Vercel logs - should see:

```
✅ GOOD: Redis connected to host:6379
❌ BAD:  rediss://user:password@host:6379
```

✅ **Fee Calculation**

- Open fund setup in browser
- Create $100M fund with 2% annual fee
- Should show: **$20M fee drag (20%)**
- Should NOT show: **$200K (0.2%)**

---

## 🆘 **Troubleshooting**

### **PowerShell Scripts Don't Run**

```powershell
# Enable script execution
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Or run in bypas mode
powershell -ExecutionPolicy Bypass -File scripts/deploy-staging.ps1
```

### **Vercel CLI Not Found**

```powershell
npm install -g vercel
vercel --version
```

### **Tests Fail**

```powershell
# Run tests locally
npm run test:unit

# Run specific test
npm run test:unit -- tests/unit/redis-factory.test.ts
```

### **Redis Connection Fails**

Check environment variables in Vercel:

```
REDIS_URL=rediss://...
REDIS_PASSWORD=... (if separate)
```

---

## 📊 **Expected Results**

### **Test Results**

```
✓ tests/unit/fees.test.ts (14 tests)
✓ tests/unit/units.test.ts (50 tests)
✓ tests/unit/unit-schemas.test.ts (35 tests)
✓ tests/unit/redis-factory.test.ts (26 tests)

Tests: 125 passed (125)
```

### **Deployment Output**

```
✅ Deployed to: https://updog-xyz.vercel.app
✅ Health check passed
✅ Redis connected
✅ All smoke tests passed
```

---

## 📚 **Documentation**

- [CODEX_FIXES_COMPLETE.md](./CODEX_FIXES_COMPLETE.md) - Complete fix details
- [DEPLOYMENT_QUICK_START.md](./DEPLOYMENT_QUICK_START.md) - Quick start guide
- [scripts/DEPLOYMENT_AUTOMATION_README.md](./scripts/DEPLOYMENT_AUTOMATION_README.md) -
  Script documentation
- [REDIS_FACTORY_UPGRADE_SUMMARY.md](./REDIS_FACTORY_UPGRADE_SUMMARY.md) - Redis
  details

---

## ✅ **Deployment Checklist**

Before deploying:

- [x] All code committed (9c3313f)
- [x] 125 tests passing
- [x] Documentation complete
- [x] Automation scripts created

After deploying to staging:

- [ ] Health endpoint returns 200
- [ ] Redis connection successful
- [ ] Passwords masked in logs
- [ ] Reserve API works
- [ ] All smoke tests pass

After deploying to production:

- [ ] Fee calculations show 20% (not 0.2%)
- [ ] Portfolio shows all companies
- [ ] Date fields accept ISO strings
- [ ] Query params parse correctly
- [ ] No security issues in logs

---

## 🎉 **You're Ready!**

Everything is committed and ready to deploy.

**Recommended approach**: Use the automated PowerShell scripts in Option 1.

**Alternative**: Use Vercel CLI (Option 2) or Dashboard (Option 3).

Good luck! 🚀
