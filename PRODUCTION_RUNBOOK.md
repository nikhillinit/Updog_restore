---
status: ACTIVE
last_updated: 2026-01-19
---

# Production Deployment Runbook

## 📋 Pre-Deployment Checklist

### 1. Local Validation (2 minutes)
```bash
# Verify TypeScript compilation
npm run check
# Expected: 0 errors

# Run gate script
./scripts/test-gates-locally.sh
# Expected: All gates PASS

# Quick build test
npm run build:web
# Expected: ~258KB bundle
```

### 2. Environment Variables Ready
Ensure you have values for:
- `DATABASE_URL` - Neon HTTP connection string
- `JWT_SECRET` - Generate with: `openssl rand -base64 32`
- `ALLOWED_ORIGINS` - Your production domain

## 🚀 Deployment Steps

### Step 1: Push to GitHub (1 minute)
```bash
git add -A
git commit -m "feat: production-ready Vercel deployment

- Direct Express handling (no serverless-http overhead)
- Serverless-optimized DB client (HTTP on Vercel, WebSocket locally)  
- Filesystem-first routing (prevents asset serving bugs)
- Health endpoints for monitoring
- 0 TypeScript errors, 258KB bundle"

git push origin feat/build-optimizations-and-fixes
```

### Step 2: Initial Vercel Setup (5 minutes)

#### First-time setup:
```bash
# Install Vercel CLI if needed
npm i -g vercel

# Link repository to Vercel
vercel link
# Follow prompts to connect GitHub repo
```

#### Set environment variables:
```bash
# Production secrets
vercel env add DATABASE_URL production
vercel env add JWT_SECRET production
vercel env add NODE_ENV production  # Value: "production"
vercel env add ALLOWED_ORIGINS production

# Preview environment (optional)
vercel env add DATABASE_URL preview
# Use a separate preview database
```

### Step 3: Deploy to Preview (2 minutes)
```bash
# Deploy to preview for testing
vercel
# Or explicitly:
vercel --env preview

# Note the preview URL (e.g., https://your-app-abc123.vercel.app)
```

### Step 4: Smoke Test Preview (1 minute)
```bash
# Run smoke tests against preview
./scripts/smoke.sh https://your-app-abc123.vercel.app

# Expected output:
# ✅ All smoke tests passed!
```

### Step 5: Deploy to Production (1 minute)
```bash
# If smoke tests pass, deploy to production
vercel --prod

# Your production URL will be:
# https://your-app.vercel.app
```

### Step 6: Verify Production (1 minute)
```bash
# Quick production check
curl https://your-app.vercel.app/api/health
# Expected: {"ok":true,"status":"healthy","timestamp":"..."}

curl https://your-app.vercel.app/api/version
# Expected: {"version":"1.3.2","environment":"production","commit":"..."}
```

## 🔍 Post-Deployment Verification

### Health Monitoring
```bash
# Continuous health check (run for 30 seconds)
for i in {1..30}; do 
  curl -s https://your-app.vercel.app/api/health | jq .status
  sleep 1
done
```

### Performance Check
```bash
# Verify bundle size hasn't regressed
curl -s https://your-app.vercel.app/ | grep -o '/assets/.*\.js' | head -1 | \
  xargs -I {} curl -sI https://your-app.vercel.app{} | grep content-length
# Expected: ~258KB total
```

### Database Connectivity
```bash
# Test API endpoints that hit the database
curl https://your-app.vercel.app/api/flags
# Should return JSON, not an error
```

## 🚨 Rollback Procedure

If issues are detected:

### Quick Rollback (30 seconds)
```bash
# In Vercel Dashboard:
# 1. Go to Deployments tab
# 2. Find last known good deployment
# 3. Click "..." → "Promote to Production"

# Via CLI:
vercel rollback
# Select the deployment to rollback to
```

### Troubleshooting

#### Function Timeout Issues
```bash
# Check function logs
vercel logs https://your-app.vercel.app --since 10m

# Common causes:
# - Database connection issues (check DATABASE_URL)
# - Cold start delays (normal, will improve after warming)
```

#### Asset Serving Issues  
```bash
# Verify routes configuration
cat vercel.json | jq .routes
# Must have filesystem handler between API and SPA routes
```

#### TypeScript Alias Issues
```bash
# If you see "Cannot find module '@schema'" errors:
# We've already added tsconfig-paths, but verify:
grep tsconfig-paths api/\[\[...slug\]\].ts
# Should show: import 'tsconfig-paths/register';
```

## 📊 Production Metrics

### What to Monitor
- **Response Times**: Should be <100ms after warm
- **Error Rate**: Should be <0.1%  
- **Bundle Size**: Should stay ~258KB
- **TypeScript Errors**: Must stay at 0

### Vercel Analytics
```bash
# View in dashboard
open https://vercel.com/[your-team]/[your-project]/analytics
```

### Manual Health Check
```bash
# Create a simple monitoring script
cat > monitor.sh << 'EOF'
#!/bin/bash
URL="https://your-app.vercel.app"
while true; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" $URL/api/health)
  if [ "$STATUS" != "200" ]; then
    echo "⚠️ Health check failed: $STATUS"
    # Add alerting here (Slack, email, etc.)
  fi
  sleep 60
done
EOF
chmod +x monitor.sh
```

## 🎯 Success Criteria

Your deployment is successful when:

✅ All smoke tests pass (`./scripts/smoke.sh`)  
✅ TypeScript compilation has 0 errors  
✅ Bundle size remains ~258KB  
✅ `/api/health` returns 200 OK  
✅ Assets load with correct content-type (not HTML)  
✅ Database queries complete in <100ms  
✅ No errors in Vercel function logs  

## 📝 Notes

- **Cold Starts**: First request after idle may take 2-3 seconds. This is normal for serverless.
- **Database**: We use HTTP driver on Vercel to prevent connection exhaustion.
- **Monitoring**: Consider adding Sentry for error tracking in production.
- **Scaling**: Vercel automatically scales based on traffic.

## 🔄 Regular Maintenance

### Weekly
- Review Vercel function logs for errors
- Check bundle size hasn't increased significantly
- Verify all gate tests still pass

### Monthly  
- Update dependencies with security patches
- Review and optimize slow database queries
- Audit environment variables for unused entries

---

**Last Updated**: 2025-09-03  
**Maintained By**: Engineering Team  
**Questions**: Create issue in GitHub repository