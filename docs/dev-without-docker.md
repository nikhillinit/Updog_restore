# Development Without Docker - Cloud-Native Mode

**Quick Start:** `npm run dev:quick` with Neon + memory:// cache

## Overview

This guide covers cloud-native development using managed services instead of
local Docker containers. This approach eliminates Docker Desktop requirements,
reduces local resource usage, and matches production infrastructure more
closely.

**Benefits:**

- Zero Docker dependencies
- Faster startup (no container orchestration)
- Lower memory footprint
- Production-like environment (Neon serverless Postgres)
- Windows/macOS/Linux compatible

**Trade-offs:**

- Requires internet connectivity
- Neon free tier has connection limits
- Background workers disabled (ENABLE_QUEUES=0)
- No local Redis (memory:// cache only)

## Prerequisites

**Required:**

- Node.js >= 20.19.0
- npm >= 10.8.0
- Neon account (free tier: neon.tech)
- Git

**Optional:**

- Upstash account (for Redis if needed)
- Vercel account (for preview deployments)

## Quick Start (3 Steps)

### Step 1: Configure Environment Variables

```bash
cp .env.local.example .env.local
```

### Step 2: Set Cloud Database URLs

Edit `.env.local`:

```bash
# Neon serverless Postgres
DATABASE_URL=postgresql://user:password@ep-example.us-east-1.neon.tech/updog

# Memory cache (no Redis required)
REDIS_URL=memory://

# Disable background workers
ENABLE_QUEUES=0

# Optional: Upstash Redis (if needed)
# REDIS_URL=rediss://default:password@region.upstash.io:6379
```

### Step 3: Start Development Environment

```bash
# Install dependencies
npm install

# Push schema to database
npm run db:push

# Start dev server (frontend + backend)
npm run dev:quick
```

Server runs on: http://localhost:5000

## Configuration Options

### Database Options

**Option A: Neon (Recommended)**

- Free tier: 0.5 GB storage, 10 GB transfer/month
- Serverless Postgres with connection pooling
- Auto-pause after inactivity
- SSL/TLS by default

```bash
DATABASE_URL=postgresql://user:password@ep-coolname.us-east-1.neon.tech/dbname
```

**Option B: Supabase**

- Free tier: 500 MB database, 1 GB bandwidth
- Built-in auth and storage
- GraphQL and REST APIs

```bash
DATABASE_URL=postgresql://postgres:password@db.project.supabase.co:5432/postgres
```

**Option C: Railway**

- Free trial: $5 credit/month
- No sleep/pause behavior
- Usage-based pricing

```bash
DATABASE_URL=postgresql://postgres:password@containers.railway.app:port/railway
```

### Cache Options

| Option      | Use Case        | Configuration                      | Pros                  | Cons                            |
| ----------- | --------------- | ---------------------------------- | --------------------- | ------------------------------- |
| memory://   | Local dev       | `REDIS_URL=memory://`              | Zero setup, fast      | Lost on restart, single process |
| Upstash     | Production-like | `REDIS_URL=rediss://...`           | Serverless, free tier | Requires account                |
| Local Redis | Full features   | `REDIS_URL=redis://localhost:6379` | Full Redis features   | Requires Docker/install         |

### Queue Configuration

Background workers disabled in cloud dev mode:

```bash
ENABLE_QUEUES=0
ENABLE_WORKERS=false
```

To enable workers, use Docker Compose:

```bash
docker compose -f docker-compose.dev.yml up worker-reserve worker-pacing
```

## NPM Scripts

### Development

```bash
# Full stack (frontend + backend)
npm run dev

# Quick mode (no Docker dependencies)
npm run dev:quick

# Frontend only (Vite dev server)
npm run dev:client

# Backend only (Express API)
npm run dev:api
```

### Database

```bash
# Push schema changes
npm run db:push

# Open Drizzle Studio (visual DB browser)
npm run db:studio

# Generate migrations (for production)
npm run db:generate
```

### Testing

```bash
# All tests
npm test

# Quick tests (excludes integration)
npm test -- --quick

# Watch mode
npm test -- --watch
```

### Build

```bash
# Production build
npm run build

# Type check only
npm run check
```

## Troubleshooting

### Issue: "Connection refused" to database

**Symptoms:**

- API returns 500 errors
- Logs show "ECONNREFUSED" or "Connection refused"

**Fix:**

1. Verify DATABASE_URL is correct (check Neon dashboard)
2. Ensure database is not paused (wake it up in Neon console)
3. Check firewall allows outbound port 5432
4. Test connection: `psql $DATABASE_URL -c "SELECT 1"`

### Issue: "Too many connections" error

**Symptoms:**

- Database queries timeout
- Error: "remaining connection slots are reserved"

**Fix:**

1. Use connection pooling URL from Neon (ends with `?pgbouncer=true`)
2. Reduce `DB_POOL_MAX` in .env.local (default: 20, try 5-10)
3. Upgrade Neon plan if consistently hitting limits

### Issue: Memory cache lost on restart

**Symptoms:**

- Session logout on server restart
- Cache misses after every restart

**Expected Behavior:** This is normal with `REDIS_URL=memory://` - cache is
process-local.

**Solutions:**

- Use Upstash Redis for persistence
- Accept data loss in local dev (sessions, rate limits)
- Use Docker Redis if needed

### Issue: Background jobs not processing

**Symptoms:**

- Reserve calculations don't update
- Pacing analysis stuck

**Expected Behavior:** `ENABLE_QUEUES=0` disables background workers in cloud
dev mode.

**Solutions:**

- Wait for API responses (synchronous fallback)
- Enable Docker workers for testing queue behavior
- Deploy to staging for full worker testing

### Issue: Slow database queries

**Symptoms:**

- API requests take >2 seconds
- Database queries timeout

**Fix:**

1. Check Neon region matches your location
2. Run `npm run db:studio` to check indexes
3. Use `EXPLAIN ANALYZE` to identify slow queries
4. Consider upgrading Neon plan for faster compute

### Issue: npm install fails on Windows

**Symptoms:**

- "EPERM: operation not permitted" errors
- "EACCES: permission denied"

**Fix:**

1. Run terminal as Administrator
2. Close VS Code and other editors
3. Disable antivirus temporarily during install
4. Use WSL2 for better compatibility

### Issue: Port 5000 already in use

**Symptoms:**

- Error: "EADDRINUSE: address already in use :::5000"

**Fix:**

```bash
# Windows: Find and kill process
netstat -ano | findstr :5000
taskkill /PID <pid> /F

# macOS/Linux
lsof -ti:5000 | xargs kill -9

# Or change port in .env.local
PORT=3000
```

### Issue: Vite HMR not working

**Symptoms:**

- Changes not reflected in browser
- "WebSocket connection failed" errors

**Fix:**

1. Check `VITE_API_URL` in .env.local matches backend URL
2. Disable browser extensions (especially ad blockers)
3. Clear Vite cache: `rm -rf node_modules/.vite`
4. Restart dev server

### Issue: TypeScript errors in IDE

**Symptoms:**

- Red squiggles everywhere
- "Cannot find module" errors

**Fix:**

```bash
# Restart TypeScript server (VS Code)
Ctrl+Shift+P -> "TypeScript: Restart TS Server"

# Rebuild type definitions
npm run check

# Clear TypeScript cache
rm -rf node_modules/.cache
```

### Issue: Database schema out of sync

**Symptoms:**

- "relation does not exist" errors
- "column does not exist" errors

**Fix:**

```bash
# Push latest schema
npm run db:push

# If that fails, check for drift
npm run db:studio

# Nuclear option: reset database
# WARNING: Deletes all data
npm run db:push -- --force
```

## When to Use Docker

Cloud-native development works for most scenarios, but Docker is required for:

**Use Docker if you need:**

- Full queue/worker testing
- Local Redis with persistence
- Prometheus/Grafana monitoring stack
- PostgreSQL-specific features (e.g., pgvector)
- Offline development
- Integration testing with Docker Compose

**Start Docker stack:**

```bash
# Full development environment
docker compose -f docker-compose.dev.yml up -d

# Workers only
docker compose -f docker-compose.dev.yml up -d worker-reserve worker-pacing

# Observability (archived - see _archive/2026-01-obsolete/)
# docker compose -f docker-compose.observability.yml up -d
```

## Environment Variables Reference

```bash
# Required
DATABASE_URL=postgresql://...        # Neon/Supabase/Railway
REDIS_URL=memory://                   # memory:// or rediss://...
NODE_ENV=development
PORT=5000

# Feature Flags
ENABLE_QUEUES=0                       # 0=disabled, 1=enabled
ENABLE_WORKERS=false                  # Background workers
DEMO_MODE=0                           # 0=normal, 1=demo
REQUIRE_AUTH=1                        # 0=disabled, 1=enabled

# Optional
VITE_API_URL=http://localhost:5000   # Frontend -> backend
SENTRY_DSN=https://...               # Error tracking
HEALTH_KEY=secret                    # Health endpoint protection
```

## Performance Tips

1. **Use Neon connection pooling**: Add `?pgbouncer=true` to DATABASE_URL
2. **Enable caching**: Set `REDIS_URL` to Upstash if hitting rate limits
3. **Reduce DB pool size**: `DB_POOL_MAX=5` for development
4. **Use dev build**: Production builds are slower to iterate on
5. **Close unused apps**: Browser tabs, Docker Desktop, etc.
6. **Increase Node memory**: `NODE_OPTIONS=--max-old-space-size=4096`

## Security Notes

**Never commit to git:**

- `.env.local` (in .gitignore)
- Database URLs with credentials
- API keys and secrets

**Use environment variables in CI/CD:**

- Vercel: Project Settings -> Environment Variables
- GitHub Actions: Repository Secrets

**Rotate credentials regularly:**

- Regenerate DATABASE_URL monthly
- Use unique credentials per environment

## Next Steps

1. Read [CLAUDE.md](../CLAUDE.md) for project conventions
2. Review [cheatsheets/daily-workflow.md](../cheatsheets/daily-workflow.md)
3. Check [CAPABILITIES.md](../CAPABILITIES.md) for existing tools
4. Join `#engineering` Slack for support

## See Also

- [INFRASTRUCTURE_REMEDIATION.md](INFRASTRUCTURE_REMEDIATION.md) - Historical
  Docker setup
- [WSL2_BUILD_TEST.md](WSL2_BUILD_TEST.md) - Windows development guide
- [docs/dev/wsl2-quickstart.md](dev/wsl2-quickstart.md) - WSL2 quick start
- [docs/archive/2025-sidecar/](archive/2025-sidecar/) - Eliminated sidecar
  architecture
- [\_archive/2026-01-obsolete/observability/](../_archive/2026-01-obsolete/observability/) -
  Archived monitoring stack
