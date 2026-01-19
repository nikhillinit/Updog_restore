---
status: ACTIVE
last_updated: 2026-01-19
---

# Testcontainers Guide

## Overview

Testcontainers provide real PostgreSQL and Redis instances for integration
tests. This enables schema validation, RLS behavior checks, and complex query
coverage that mocks cannot provide.

## Prerequisites

### Docker Desktop vs Rancher Desktop

- Docker Desktop requires a paid license for organizations with more than 250
  employees or more than $10M in revenue.
- Rancher Desktop is recommended for local development (free, open source).

Installation links:

- Docker Desktop: https://www.docker.com/products/docker-desktop/
- Rancher Desktop: https://rancherdesktop.io/

### System Requirements

- Docker daemon running and accessible to your user.
- Recommended: 4+ CPU cores, 8+ GB RAM.
- Ports: PostgreSQL uses 5432 and Redis uses 6379 (testcontainers allocates
  random host ports, but these should not be blocked).

## Quick Start

### 1. Verify Docker Installation

```bash
docker --version
docker ps
```

### 2. Run Smoke Tests

```bash
npm test -- tests/integration/testcontainers-smoke.test.ts
```

Expected: containers start in under 30 seconds and migrations complete
successfully.

### 3. Enable Phase 4 Tests

```bash
# In .env or environment
ENABLE_PHASE4_TESTS=true
npm test
```

## Test Patterns

### Using withTransaction for Isolation

```ts
import { withTransaction } from '../helpers/testcontainers';
import * as schema from '@shared/schema';

await withTransaction(async (db) => {
  const funds = await db.select().from(schema.funds);
  return funds;
});
```

### Seeding Test Data

```ts
import { seedDatabase } from '../helpers/testcontainers-seeder';
import { createScenarioComparisonFixture } from '../fixtures/scenario-comparison-fixtures';

const fixture = createScenarioComparisonFixture();

await seedDatabase(container, [
  { table: 'funds', data: [fixture.fund] },
  { table: 'scenarios', data: Object.values(fixture.scenarios) },
  { table: 'fund_snapshots', data: Object.values(fixture.snapshots) },
]);
```

### Migration Testing

```ts
import {
  runMigrationsToVersion,
  resetDatabase,
} from '../helpers/testcontainers-migration';

await runMigrationsToVersion(container); // latest
await resetDatabase(container); // drop + reapply
```

## CI/CD Integration

### GitHub Actions

```yaml
- name: Pre-pull images
  run: |
    docker pull postgres:16-alpine
    docker pull redis:7-alpine
```

### Environment Variables

- ENABLE_PHASE4_TESTS
- TESTCONTAINERS_RYUK_DISABLED (use in CI if Ryuk cleanup is blocked)

## Troubleshooting

### Container Startup Timeout

- Increase the startup timeout in `tests/helpers/testcontainers.ts` (default
  30s).
- Confirm Docker daemon is running.
- Check Docker Desktop or Rancher Desktop resource limits.

### Migration Failures

- Verify the migrations folder exists and matches the configured output path.
- Ensure the Drizzle journal (`migrations/meta/_journal.json`) is present.
- Inspect the `drizzle_migrations` table for applied migrations.

### Port Conflicts

- Check for local PostgreSQL or Redis instances already bound to ports.
- Use container logs to confirm which host ports were assigned.

## Performance Tips

- Reuse containers across suites (global setup) to reduce startup overhead.
- Run tests in parallel only when isolation is guaranteed.
- Cache images in CI to speed up startup.

## References

- `docs/foundation/PHASE4-KICKOFF.md`
- https://testcontainers.org/modules/postgresql
- https://orm.drizzle.team/docs/migrations
