# Production Runbook

## Health Endpoints

### `/healthz` (Liveness)

- **Purpose**: Indicates if the service is alive and can handle requests
- **Returns**: 200 OK if the process is running
- **Use case**: Kubernetes liveness probe, load balancer health checks

### `/readyz` (Readiness)

- **Purpose**: Indicates if the service is ready to handle traffic
- **Returns**:
  - 200 OK when database is connected (Redis is optional)
  - 503 Service Unavailable when database is unreachable
- **Requirements**:
  - ✅ Database connectivity (critical)
  - ⚠️ Redis connectivity (optional/degraded)

### `/health/detailed` (Diagnostics)

- **Purpose**: Detailed health information for debugging
- **Protection**: Requires `X-Health-Key` header matching `HEALTH_KEY` env var
- **Access**: Localhost requests allowed without key
- **Returns**: Detailed JSON with component status and metrics

## Idempotency

### Configuration

- **TTL**: 24 hours (configurable via `IDEMPOTENCY_TTL`)
- **Max Entries**: 200 (configurable via `VITE_IDEMPOTENCY_MAX`)
- **Eviction**: LRU policy, only evicts completed requests
- **Namespace**: Environment-specific to prevent cross-env collisions

### Headers

- **Request**: `Idempotency-Key: <unique-key>`
- **Response**:
  - 201 Created (new resource)
  - 200 OK (replayed response)
  - 409 Conflict (key reused with different body)

## Request Correlation

### X-Request-ID

- **Accepted**: Client can provide via `X-Request-ID` header
- **Generated**: Server generates if not provided
- **Echoed**: Always returned in response headers
- **Logged**: Included in all server logs for tracing

## Docker Development

### Quick Start

```bash
# Start all services
npm run dev:env

# Or manually
docker-compose up -d

# Stop and clean
npm run dev:clean
```

### Services

- **PostgreSQL**: localhost:5432 (user: postgres, pass: postgres)
- **Redis**: localhost:6379 (optional, graceful degradation)
- **Adminer**: http://localhost:8080 (database UI)

## Deployment Gates

### Pre-flight Checks

```bash
npm run deploy:gate
```

Validates:

- TypeScript compilation
- Lint rules
- Smoke tests
- Bundle size (<350KB)
- Health endpoints

### Progressive Rollout

```bash
npm run deploy:rollout
```

- Gradual increase: 5% → 25% → 50% → 100%
- Health monitoring at each stage
- Automatic rollback on errors

### Production Monitoring

```bash
npm run deploy:monitor 30 0.5
```

- Duration: 30 minutes
- Error threshold: 0.5%
- Auto-rollback on threshold breach

## Troubleshooting

### Common Issues

#### Port Already in Use

```bash
# Windows
powershell -Command "Stop-Process -Id (Get-NetTCPConnection -LocalPort 5000).OwningProcess -Force"

# Mac/Linux
lsof -ti:5000 | xargs kill -9
```

#### Redis Connection Errors

- Redis is optional - the app will run without it
- Workers will be idle but API remains functional
- Check `redis-cli ping` if Redis is needed

#### Database Not Ready

- Ensure Docker is running: `docker ps`
- Check PostgreSQL logs: `docker-compose logs postgres`
- Verify connection: `docker-compose exec postgres pg_isready`

## Environment Variables

See `.env.example` for all configuration options.

Critical variables:

- `DATABASE_URL`: PostgreSQL connection string
- `HEALTH_KEY`: Protection for /health/detailed endpoint
- `IDEMPOTENCY_MAX`: Max in-flight requests (default: 200)
- `NODE_ENV`: development/production
- `TRUST_PROXY`: Configure based on deployment:
  - **Local/dev**: `loopback, linklocal, uniquelocal` (default)
  - **Behind single proxy (ELB/NGINX)**: `1`
  - **Behind known CIDR(s)**: `10.0.0.0/8, 172.16.0.0/12`
  - **Behind Cloudflare**: Use their published IP ranges
