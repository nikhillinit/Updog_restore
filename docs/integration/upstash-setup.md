---
status: ACTIVE
last_updated: 2026-01-19
---

# Upstash Redis Setup - 5 Minute Guide

## Step 1: Create Account (1 minute)

1. Open: https://upstash.com
2. Click the green "Start Free" button
3. Sign up with GitHub (easiest) - just click "Continue with GitHub"
4. Authorize Upstash

## Step 2: Create Database (1 minute)

You'll land on the dashboard. Look for the green "Create Database" button.

Fill in:

```
Database Name: fund-calc-staging
Type: Regional (already selected)
Region: us-east-1 (or closest to you)
```

Click "Create" (bottom right)

## Step 3: Copy Your URL (30 seconds)

After creation, you'll see your database page.

1. Look for the "Details" tab (should be selected)
2. Find "Endpoint" - it looks like: `settling-pony-30456.upstash.io`
3. Find "Password" - click the eye icon to show it
4. Your Redis URL format is:
   ```
   rediss://default:PASSWORD@ENDPOINT:6379
   ```

Example:

```
rediss://default:AX7nAWQzYmU2NTIwMzI0NGU0@settling-pony-30456.upstash.io:6379
```

## Step 4: Test It (1 minute)

Copy this command, replace YOUR_REDIS_URL with your actual URL:

```cmd
set REDIS_URL=YOUR_REDIS_URL && npx tsx scripts/test-redis-upstash.ts
```

You should see:

```
✅ Connected successfully!
✅ SET test:key
✅ GET test:key = "Hello from Upstash!"
✅ PING = PONG
🎉 All tests passed!
```

## Step 5: Add to GitHub Secrets (2 minutes)

1. Go to: https://github.com/nikhillinit/Updog_restore/settings/secrets/actions
2. Click "New repository secret"
3. Add each secret:

| Name                           | Value                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| STAGING_REDIS_URL              | Your rediss://... URL from Upstash                                                              |
| METRICS_KEY                    | 27f3efc05f8feda4da2eede2331e130b6c4bf804c0757aff872a7b4a8ae9ac88                                |
| HEALTH_KEY                     | c56d0dca2d9147256da1b0f5c6a7235085789ba222f69a7b45cb47cfafc0658f                                |
| GCP_PROJECT                    | updog-staging-placeholder                                                                       |
| GCP_WORKLOAD_IDENTITY_PROVIDER | projects/123456789/locations/global/workloadIdentityPools/github-pool/providers/github-provider |
| GCP_SERVICE_ACCOUNT            | github-deploy@updog-staging-placeholder.iam.gserviceaccount.com                                 |
| GCP_REGION                     | us-central1                                                                                     |
| GCP_SERVICE_NAME               | fund-calc-staging                                                                               |
| STAGING_URL                    | http://localhost:5000                                                                           |

## Done! 🎉

Your staging environment now has real Redis. The PR tests will work even though
GCP deployment will be skipped.
