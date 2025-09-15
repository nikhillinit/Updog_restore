# Railway MVP Deployment Guide

## Quick Deploy to Railway (15 minutes)

1. **Install Railway CLI**
```bash
npm install -g @railway/cli
railway login
```

2. **Initialize Project**
```bash
railway create updog-fund-platform
railway environment
```

3. **Add Database Services**
```bash
railway add postgresql
railway add redis
```

4. **Set Environment Variables**
```bash
railway variables set NODE_ENV=production
railway variables set CORS_ORIGIN=https://your-domain.up.railway.app
# DATABASE_URL and REDIS_URL are auto-set by Railway
```

5. **Deploy**
```bash
railway up
railway open
```

## Expected Result
- **App URL**: https://updog-fund-platform.up.railway.app
- **Database**: PostgreSQL managed by Railway
- **Cache**: Redis managed by Railway
- **Cost**: ~$15/month total
- **Features**: Auto-scaling, automatic SSL, monitoring

## Post-Deploy Checklist
- [ ] App loads without errors
- [ ] Can create a fund
- [ ] Security headers present
- [ ] Health endpoints responding
- [ ] Database connected and migrations applied