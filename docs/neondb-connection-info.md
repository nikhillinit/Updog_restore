# NeonDB Connection Information

**Last Updated:** 2025-10-12

## Connection Details

### PostgreSQL Host
```
pg.neon.tech
```

### Connection Command
```bash
psql -h pg.neon.tech
```

## Using with This Project

### 1. Get Your Full Connection String

1. Log in to [Neon Console](https://console.neon.tech)
2. Select your project
3. Copy the connection string (format below)

### 2. Update Environment Variables

Add to your `.env` file:

```env
DATABASE_URL=postgresql://[user]:[password]@[project].neon.tech/[database]?sslmode=require
```

Example:
```env
DATABASE_URL=postgresql://myuser:mypassword@ep-cool-breeze-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
```

### 3. Initialize Database Schema

```bash
npm run db:push
```

### 4. Verify Connection

```bash
# Start the API server
npm run dev:api

# Should see successful database connection in logs
```

## Benefits of NeonDB

- ✅ **No Docker required** - Works immediately
- ✅ **Serverless** - Scales automatically, pauses when idle
- ✅ **Free tier** - 512MB storage, 3GB transfer/month
- ✅ **Branch databases** - Create test/staging branches easily
- ✅ **Time travel** - Point-in-time restore up to 7 days

## Local Development vs NeonDB

| Feature | Local PostgreSQL (Docker) | NeonDB |
|---------|---------------------------|---------|
| Setup Time | 2-5 minutes | 30 seconds |
| Requires Docker | ✅ Yes | ❌ No |
| Offline Access | ✅ Yes | ❌ No |
| Free | ✅ Yes | ✅ Yes (with limits) |
| Backups | Manual | ✅ Automatic |
| Branching | Manual | ✅ Built-in |

## Performance Testing with NeonDB

NeonDB works perfectly for k6 performance testing:

```bash
# 1. Set DATABASE_URL in .env to your NeonDB connection string
# 2. Run the API
npm run dev:api

# 3. Run k6 tests
npm run perf:local
```

## Troubleshooting

### Connection Timeout
- Ensure `?sslmode=require` is in the connection string
- Check firewall/network allows connections to port 5432

### "Database does not exist"
```bash
npm run db:push
```

### Connection Pooling
The app automatically uses `@neondatabase/serverless` for NeonDB hosts (detected by `.neon.tech` domain).

## Related Documentation

- [Local k6 Testing Guide](local-k6-testing-guide.md)
- [Performance Gates Workflow](../.github/workflows/performance-gates.yml)
- [NeonDB Official Docs](https://neon.tech/docs/introduction)
