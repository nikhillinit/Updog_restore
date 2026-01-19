---
status: ACTIVE
last_updated: 2026-01-19
---

# Accessing Your Vercel Deployment

## 🔒 Your Deployment is Protected

Your preview deployment at https://updog-restore-k309lhcrv-nikhil-bhambis-projects.vercel.app/ is protected by Vercel's authentication. This is **normal and expected** for preview deployments.

## How to Access Your Protected Deployment

### Option 1: Disable Protection (Recommended for Testing)

1. **Go to Vercel Dashboard**:
   - Visit https://vercel.com/dashboard
   - Select your project: `updog-restore`

2. **Navigate to Settings → Deployment Protection**:
   - Find "Deployment Protection" in the left sidebar
   - Or direct link: https://vercel.com/[your-team]/updog-restore/settings/deployment-protection

3. **Configure Protection**:
   - For **Preview Deployments**: Change from "Only members of Vercel team" to "Anyone with the link"
   - For **Production**: Keep protection enabled for security
   - Click "Save"

4. **Access Your Deployment**:
   - Now visit: https://updog-restore-k309lhcrv-nikhil-bhambis-projects.vercel.app/
   - It should load without authentication

### Option 2: Use Protection Bypass Token

1. **Get your bypass token**:
   ```bash
   # In your Vercel project settings
   # Settings → Deployment Protection → Generate Bypass Token
   ```

2. **Access with bypass**:
   ```
   https://updog-restore-k309lhcrv-nikhil-bhambis-projects.vercel.app/?x-vercel-protection-bypass=YOUR_TOKEN_HERE
   ```

### Option 3: Authenticate via Vercel SSO

1. Visit the deployment URL
2. Click "Continue with Vercel"
3. Sign in with your Vercel account
4. You'll be redirected back to your app

## 🧪 Testing Your Deployment

Once you have access, test these endpoints:

### Frontend
```bash
# Should load the React app
curl https://your-deployment.vercel.app/
```

### API Health Checks
```bash
# Basic health
curl https://your-deployment.vercel.app/api/health
# Expected: {"ok":true,"status":"healthy","timestamp":"..."}

# Version info
curl https://your-deployment.vercel.app/api/version
# Expected: {"version":"1.3.2","environment":"production","commit":"..."}
```

### Smoke Tests
```bash
# Run the smoke test suite
./scripts/smoke.sh https://your-deployment.vercel.app
```

## 🐛 Troubleshooting Common Issues

### Issue: "Cannot find module" errors

**Solution**: We've already added dynamic imports and tsconfig-paths. The latest fix should resolve this.

### Issue: 500 errors on API routes

**Check function logs**:
```bash
vercel logs https://your-deployment.vercel.app --since 10m
```

**Common causes**:
1. Missing environment variables (DATABASE_URL, etc.)
2. Module resolution issues (already fixed)
3. Database connection issues

### Issue: Assets returning 404

**Verify build output**:
```bash
# Check if assets were built
ls -la dist/public/assets/
```

### Issue: CORS errors

**Ensure ALLOWED_ORIGINS is set**:
```bash
vercel env ls
# Should include ALLOWED_ORIGINS with your domain
```

## 📝 Development vs Production URLs

- **Production**: https://updog-restore.vercel.app (or your custom domain)
- **Preview**: https://updog-restore-[hash]-[team].vercel.app
- **Local Dev**: http://localhost:3000 (via `vercel dev`)

## 🔄 Quick Deploy Commands

```bash
# Deploy to preview (creates new URL)
vercel

# Deploy to production (uses main domain)
vercel --prod

# List recent deployments
vercel ls

# Inspect a deployment
vercel inspect [deployment-url]

# View logs
vercel logs [deployment-url] --since 1h
```

## 📊 Monitoring Your Deployment

### Check Deployment Status
1. Visit: https://vercel.com/[your-team]/updog-restore
2. Look for green checkmarks on recent deployments
3. Click on a deployment to see build logs

### View Function Logs
```bash
# Real-time logs
vercel logs --follow

# Last hour of logs
vercel logs --since 1h

# Filter for errors
vercel logs --since 1h | grep -i error
```

### Performance Metrics
- Visit: Analytics tab in Vercel dashboard
- Monitor: Response times, error rates, traffic

## ✅ Success Checklist

Your deployment is working when:

- [ ] Frontend loads without authentication (after disabling protection)
- [ ] `/api/health` returns 200 OK
- [ ] `/api/version` shows correct version info
- [ ] No errors in function logs
- [ ] Assets load with correct MIME types
- [ ] Database queries complete successfully

## 🆘 Need Help?

1. **Check build logs**: Click on deployment in Vercel dashboard
2. **Review function logs**: `vercel logs --since 30m`
3. **Test locally**: `vercel dev` to replicate the environment
4. **Check our runbook**: See PRODUCTION_RUNBOOK.md

---

**Note**: The authentication you're seeing is a Vercel security feature, not a bug in your application. Once you configure deployment protection settings, your app will be accessible.