# POVC Fund Model - Infrastructure Setup Guide

## Prerequisites

1. **Node.js v16+** (via WSL if on Windows)
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   nvm install 16
   nvm use 16
   ```

2. **pnpm** (faster than npm)
   ```bash
   npm install -g pnpm
   ```

3. **Docker & Docker Compose**
   - [Docker Desktop](https://www.docker.com/products/docker-desktop/)
   - Ensure WSL2 integration is enabled

## Quick Start

```bash
# Clone the repository
git clone https://github.com/nikhillinit/Updog_restore.git
cd Updog_restore

# Install dependencies
pnpm install

# Start infrastructure
docker compose up -d postgres redis

# Run database migrations
pnpm prisma migrate dev

# Seed initial data
pnpm run seed

# Start the development server
pnpm run dev

# In another terminal, start the worker orchestrator
pnpm run orchestrator
```

## Infrastructure Components

### Core Services
- **PostgreSQL 15**: Primary database
- **Redis 7**: Queue backend for BullMQ

### Optional Tools (via profiles)
```bash
# Start with admin tools
docker compose --profile tools up -d

# Access:
# - pgAdmin: http://localhost:5050
# - Redis Commander: http://localhost:8081
```

### Observability Stack
```bash
# Start monitoring stack
docker compose -f docker-compose.observability.yml up -d

# Access:
# - Prometheus: http://localhost:9090
# - Grafana: http://localhost:3001 (admin/admin)
```

## Development Workflow

### 1. Database Changes
```bash
# Create a new migration
pnpm prisma migrate dev --name add_fund_snapshots

# Reset database (careful!)
pnpm prisma migrate reset
```

### 2. Running Tests
```bash
# Unit tests
pnpm test

# Integration tests (requires DB)
pnpm test:integration

# Benchmarks
pnpm run bench
```

### 3. Worker Development
```bash
# Watch mode for workers
pnpm run workers:dev

# Test a specific job
pnpm run queue:test reserve:calc --fundId=123
```

## Environment Variables

Create a `.env` file:
```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/povc_fund"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Calculation Versions
ALG_RESERVE_VERSION=1.0.0
ALG_PACING_VERSION=1.0.0
ALG_COHORT_VERSION=1.0.0

# Feature Flags
ALG_RESERVE_ENABLED=true
ALG_PACING_ENABLED=true
ALG_COHORT_ENABLED=false

# Monitoring (optional)
PROMETHEUS_PUSHGATEWAY=http://localhost:9091
```

## Troubleshooting

### Port Conflicts
```bash
# Check what's using a port
lsof -i :5432

# Use alternative ports
POSTGRES_PORT=5433 docker compose up postgres
```

### Database Connection Issues
```bash
# Test connection
psql postgresql://postgres:postgres@localhost:5432/povc_fund

# Reset everything
docker compose down -v
docker compose up -d
```

### Queue Issues
```bash
# Check Redis
redis-cli ping

# Clear all queues (development only!)
redis-cli FLUSHALL
```

## Production Considerations

1. **Database**: Use managed PostgreSQL (RDS, Cloud SQL, etc.)
2. **Redis**: Use managed Redis (ElastiCache, Redis Cloud)
3. **Secrets**: Never commit `.env` files
4. **Migrations**: Run via CI/CD pipeline
5. **Monitoring**: Ship metrics to Datadog/New Relic