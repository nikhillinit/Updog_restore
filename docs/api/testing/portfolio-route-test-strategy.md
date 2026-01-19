---
status: ACTIVE
last_updated: 2026-01-19
---

# Portfolio Route API Test Strategy

**Version:** 1.0.0
**Created:** 2025-11-08
**Scope:** Phase 2 - Portfolio Route API (6 endpoints)

## Table of Contents

1. [Overview](#overview)
2. [Test Pyramid Strategy](#test-pyramid-strategy)
3. [Coverage Requirements](#coverage-requirements)
4. [Test Infrastructure](#test-infrastructure)
5. [Test Scenarios](#test-scenarios)
6. [Testcontainers Setup](#testcontainers-setup)
7. [CI/CD Integration](#cicd-integration)
8. [Test Data Management](#test-data-management)

---

## Overview

This document defines the comprehensive testing strategy for the Portfolio Route API, covering 6 endpoints that manage investment lots, forecast snapshots, and reserve allocations.

### API Endpoints Under Test

1. **POST /api/funds/:fundId/portfolio/snapshots** - Create snapshot (202 Accepted)
2. **GET /api/funds/:fundId/portfolio/snapshots** - List snapshots (cursor pagination)
3. **GET /api/snapshots/:snapshotId** - Get snapshot status (polling)
4. **POST /api/funds/:fundId/portfolio/lots** - Create lot (idempotent)
5. **GET /api/funds/:fundId/portfolio/lots** - List lots (filtering)
6. **PUT /api/snapshots/:snapshotId** - Update snapshot (optimistic locking)

### Test Framework Stack

- **Test Runner:** Vitest with dual-project setup (server/Node.js + client/jsdom)
- **Integration Tests:** Testcontainers (PostgreSQL + Redis)
- **HTTP Client:** Supertest for API testing
- **Schema Validation:** Zod (shared/schemas/portfolio-route.ts)
- **Test Utilities:** Custom fixtures and assertion helpers

---

## Test Pyramid Strategy

### Level 1: Unit Tests (60% of coverage)

**Scope:** Isolated component testing without external dependencies

**Components:**
- Schema validation functions (Zod validators)
- Helper functions (BigInt serialization, cost basis calculation)
- Status transition validation
- Request/response transformers
- Business logic utilities

**Example:**
```typescript
describe('Status Transition Validation', () => {
  it('should allow pending → calculating', () => {
    expect(validateStatusTransition('pending', 'calculating')).toBe(true);
  });

  it('should prevent complete → pending', () => {
    expect(validateStatusTransition('complete', 'pending')).toBe(false);
  });
});
```

**Location:** `tests/unit/api/portfolio-route-validation.test.ts`

---

### Level 2: Integration Tests (30% of coverage)

**Scope:** API endpoints with real database (Testcontainers)

**Components:**
- Full API request/response cycle
- Database persistence and retrieval
- Transaction handling
- Idempotency middleware
- Optimistic locking
- Background job queueing (BullMQ + Redis)

**Example:**
```typescript
describe('POST /api/funds/:fundId/portfolio/lots', () => {
  it('should create lot and persist to database', async () => {
    const response = await request(app)
      .post('/api/funds/1/portfolio/lots')
      .set('Idempotency-Key', randomUUID())
      .send(createLotPayload);

    expect(response.status).toBe(201);
    expect(response.body.lot.id).toBeDefined();

    // Verify database persistence
    const lot = await db.query.investmentLots.findFirst({
      where: eq(investmentLots.id, response.body.lot.id)
    });
    expect(lot).toBeDefined();
  });
});
```

**Location:** `tests/integration/portfolio-route.test.ts`

---

### Level 3: End-to-End Tests (10% of coverage)

**Scope:** Complete workflows across multiple endpoints

**Workflows:**
1. **Snapshot Creation Workflow**
   - Create snapshot → Poll status → Verify completion → Retrieve calculated metrics

2. **Lot Management Workflow**
   - Create investment → Create lot → List lots → Verify lot appears in listing

3. **Optimistic Locking Workflow**
   - Get snapshot → Concurrent updates → Verify version conflict → Retry with new version

**Example:**
```typescript
describe('Snapshot Creation Workflow', () => {
  it('should create snapshot, poll until complete, and retrieve metrics', async () => {
    // 1. Create snapshot
    const createResp = await request(app)
      .post('/api/funds/1/portfolio/snapshots')
      .send({ name: 'Q4 2024', idempotencyKey: randomUUID() });

    expect(createResp.status).toBe(202);
    const { snapshotId, statusUrl } = createResp.body;

    // 2. Poll until complete
    let status = 'pending';
    while (status !== 'complete') {
      const statusResp = await request(app).get(statusUrl);
      status = statusResp.body.snapshot.status;
      if (status === 'calculating') {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    // 3. Verify calculated metrics
    const finalResp = await request(app).get(`/api/snapshots/${snapshotId}`);
    expect(finalResp.body.snapshot.calculatedMetrics).toBeDefined();
  });
});
```

**Location:** `tests/e2e/portfolio-workflows.test.ts`

---

## Coverage Requirements

### Functional Coverage

| Category                | Target | Priority |
|-------------------------|--------|----------|
| Happy paths             | 100%   | P0       |
| Error scenarios         | 100%   | P0       |
| Edge cases              | 90%    | P1       |
| Idempotency             | 100%   | P0       |
| Optimistic locking      | 100%   | P0       |
| Pagination              | 90%    | P1       |
| Status transitions      | 100%   | P0       |
| Background jobs         | 80%    | P2       |

### Code Coverage Targets

- **Line Coverage:** 85%
- **Branch Coverage:** 80%
- **Function Coverage:** 90%
- **Statement Coverage:** 85%

### Priority Levels

- **P0 (Critical):** Must pass before merge
- **P1 (High):** Should pass before deployment
- **P2 (Medium):** Can fail in dev, must pass in staging

---

## Test Infrastructure

### Vitest Configuration

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    projects: [
      {
        name: 'server',
        environment: 'node',
        include: ['tests/integration/**/*.test.ts'],
        setupFiles: ['./tests/setup/test-infrastructure.ts'],
      }
    ],
    testTimeout: 30000, // Testcontainers startup time
  }
});
```

### Test Execution Commands

```bash
# Run all tests
npm test

# Run server tests only
npm test -- --project=server

# Run specific test file
npm test tests/integration/portfolio-route.test.ts

# Run with coverage
npm test -- --coverage

# Run integration tests only (skip slow API tests)
npm run test:quick
```

---

## Test Scenarios

### POST /api/funds/:fundId/portfolio/snapshots

#### Happy Paths
- ✅ **Create snapshot successfully** (202 Accepted)
  - Request: Valid fund ID, snapshot name, optional idempotency key
  - Response: `snapshotId`, `status: 'pending'`, `statusUrl`, `retryAfter`
  - Database: Snapshot record created with `status='pending'`
  - Background: Job queued in BullMQ

- ✅ **Idempotency: duplicate request returns same snapshot**
  - Request: Same idempotency key, same payload
  - Response: Original snapshot ID (not a new snapshot)
  - Database: No duplicate snapshot created

#### Error Scenarios
- ❌ **Invalid fund ID** (404 Not Found)
  - Request: Non-existent fund ID
  - Response: `{ error: 'Fund not found' }`

- ❌ **Missing required fields** (400 Bad Request)
  - Request: Missing `name` field
  - Response: Zod validation error with field details

- ❌ **Invalid idempotency key format** (400 Bad Request)
  - Request: Non-UUID idempotency key
  - Response: Validation error

---

### GET /api/funds/:fundId/portfolio/snapshots

#### Happy Paths
- ✅ **Pagination with cursor**
  - Request: `?cursor=<uuid>&limit=20`
  - Response: Up to 20 snapshots, `nextCursor`, `hasMore`

- ✅ **Filter by status**
  - Request: `?status=complete`
  - Response: Only snapshots with `status='complete'`

- ✅ **Empty results**
  - Request: Fund with no snapshots
  - Response: `{ snapshots: [], pagination: { hasMore: false } }`

#### Error Scenarios
- ❌ **Invalid cursor** (400 Bad Request)
  - Request: Malformed cursor (non-UUID)
  - Response: Validation error

- ❌ **Invalid limit** (400 Bad Request)
  - Request: `limit=0` or `limit=1000`
  - Response: Validation error (limit must be 1-100)

---

### GET /api/snapshots/:snapshotId

#### Happy Paths
- ✅ **Get complete snapshot**
  - Request: Valid snapshot ID with `status='complete'`
  - Response: Full snapshot with `calculatedMetrics`

- ✅ **Get calculating snapshot with progress**
  - Request: Valid snapshot ID with `status='calculating'`
  - Response: Snapshot + `progress: { current, total }` + `retryAfter`

#### Error Scenarios
- ❌ **Snapshot not found** (404 Not Found)
  - Request: Non-existent snapshot ID
  - Response: `{ error: 'Snapshot not found' }`

---

### POST /api/funds/:fundId/portfolio/lots

#### Happy Paths
- ✅ **Create lot successfully**
  - Request: Valid investment ID, lot type, shares, price, cost basis
  - Response: Created lot with generated UUID
  - Database: Lot persisted with `version=1`

- ✅ **Idempotency: duplicate request**
  - Request: Same idempotency key, same payload
  - Response: `{ lot: <original>, created: false }`

- ✅ **Cost basis validation**
  - Request: `costBasisCents ≈ sharePriceCents * sharesAcquired` (within tolerance)
  - Response: Success

#### Error Scenarios
- ❌ **Invalid investment ID** (404 Not Found)
  - Request: Non-existent investment ID
  - Response: `{ error: 'Investment not found' }`

- ❌ **Invalid lot type** (400 Bad Request)
  - Request: `lotType='invalid_type'`
  - Response: Zod validation error

- ❌ **Cost basis mismatch** (400 Bad Request)
  - Request: `costBasisCents` significantly different from `sharePriceCents * sharesAcquired`
  - Response: `{ error: 'costBasisCents must be approximately equal to sharePriceCents * sharesAcquired' }`

---

### GET /api/funds/:fundId/portfolio/lots

#### Happy Paths
- ✅ **Pagination with cursor**
  - Request: `?cursor=<uuid>&limit=50`
  - Response: Up to 50 lots, pagination metadata

- ✅ **Filter by investmentId**
  - Request: `?investmentId=123`
  - Response: Only lots for investment 123

- ✅ **Filter by lotType**
  - Request: `?lotType=follow_on`
  - Response: Only `follow_on` lots

- ✅ **Combined filters**
  - Request: `?investmentId=123&lotType=initial`
  - Response: Initial lots for investment 123

- ✅ **Empty results**
  - Request: Fund with no lots
  - Response: `{ lots: [], pagination: { hasMore: false } }`

#### Error Scenarios
- ❌ **Invalid filters** (400 Bad Request)
  - Request: `?investmentId=abc` (non-numeric)
  - Response: Validation error

---

### PUT /api/snapshots/:snapshotId

#### Happy Paths
- ✅ **Update successfully**
  - Request: `{ name: 'Updated Name', version: 1 }`
  - Response: Updated snapshot with `version=2`
  - Database: Version incremented, `updatedAt` timestamp updated

- ✅ **Optimistic locking: version match**
  - Request: Current version matches database version
  - Response: Success

#### Error Scenarios
- ❌ **Version mismatch** (409 Conflict)
  - Request: `version=1` but database has `version=2`
  - Response: `{ error: 'Version conflict', currentVersion: 2 }`

- ❌ **Snapshot not found** (404 Not Found)
  - Request: Non-existent snapshot ID
  - Response: `{ error: 'Snapshot not found' }`

- ❌ **Invalid status transition** (400 Bad Request)
  - Request: `status='pending'` on snapshot with `status='complete'`
  - Response: `{ error: 'Invalid status transition: complete → pending' }`

---

## Testcontainers Setup

### PostgreSQL Container

```typescript
import { PostgreSqlContainer } from '@testcontainers/postgresql';

let pgContainer: StartedPostgreSqlContainer;
let dbClient: NodePgDatabase;

beforeAll(async () => {
  // Start PostgreSQL container
  pgContainer = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('updog_test')
    .withUsername('test_user')
    .withPassword('test_password')
    .withExposedPorts(5432)
    .start();

  // Get connection string
  const connectionString = pgContainer.getConnectionUri();

  // Initialize Drizzle client
  const pool = new Pool({ connectionString });
  dbClient = drizzle(pool, { schema: dbSchema });

  // Run migrations
  await migrate(dbClient, { migrationsFolder: './migrations' });
}, 60000); // 60s timeout for container startup

afterAll(async () => {
  await dbClient.$client.end();
  await pgContainer.stop();
});
```

### Redis Container (for BullMQ)

```typescript
import { GenericContainer } from 'testcontainers';

let redisContainer: StartedTestContainer;
let queueClient: Queue;

beforeAll(async () => {
  // Start Redis container
  redisContainer = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .start();

  const redisHost = redisContainer.getHost();
  const redisPort = redisContainer.getMappedPort(6379);

  // Initialize BullMQ queue
  queueClient = new Queue('snapshot-calculations', {
    connection: {
      host: redisHost,
      port: redisPort,
    },
  });
}, 30000);

afterAll(async () => {
  await queueClient.close();
  await redisContainer.stop();
});
```

### Database Seeding

```typescript
async function seedTestData(db: NodePgDatabase) {
  // Seed funds
  const [fund] = await db.insert(funds).values({
    name: 'Test Fund',
    size: 50000000,
    vintageYear: 2024,
  }).returning();

  // Seed investments
  const [investment] = await db.insert(investments).values({
    fundId: fund.id,
    companyName: 'TechCorp',
    stage: 'Series A',
  }).returning();

  return { fund, investment };
}
```

### Cleanup Strategy

```typescript
afterEach(async () => {
  // Clean up test data in reverse dependency order
  await db.delete(reserveAllocations);
  await db.delete(investmentLots);
  await db.delete(forecastSnapshots);
  await db.delete(investments);
  await db.delete(funds);
});
```

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
name: Portfolio API Tests

on:
  push:
    paths:
      - 'server/routes/portfolio/**'
      - 'shared/schemas/portfolio-route.ts'
      - 'tests/integration/portfolio-route.test.ts'
      - 'migrations/**/*.sql'

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20.19.x'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run integration tests
        run: npm test -- --project=server --coverage
        env:
          NODE_ENV: test
          CI: true

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

### Pre-commit Hooks

```bash
#!/bin/bash
# .husky/pre-commit

# Run affected tests only
npm test -- --changed --bail

# Fail if coverage drops below threshold
npm test -- --coverage --coverageThreshold='{"global":{"lines":85}}'
```

---

## Test Data Management

### Factory Functions

```typescript
// tests/fixtures/portfolio-route-fixtures.ts

export function createFundFactory(overrides?: Partial<Fund>): Fund {
  return {
    id: Math.floor(Math.random() * 10000),
    name: 'Test Fund',
    size: 50000000,
    vintageYear: 2024,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createLotFactory(overrides?: Partial<InvestmentLotV1>): CreateLotRequest {
  const sharePriceCents = BigInt(250000); // $2.50 per share
  const sharesAcquired = '1000.00';
  const costBasisCents = calculateCostBasis(sharePriceCents, sharesAcquired);

  return {
    investmentId: 1,
    lotType: 'initial',
    sharePriceCents: sharePriceCents.toString(),
    sharesAcquired,
    costBasisCents: costBasisCents.toString(),
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}
```

### Sample Datasets

```typescript
export const SAMPLE_SNAPSHOTS = [
  {
    name: 'Q1 2024 Snapshot',
    status: 'complete',
    calculatedMetrics: { irr: 0.185, moic: 2.4 },
  },
  {
    name: 'Q2 2024 Snapshot',
    status: 'calculating',
    calculatedMetrics: null,
  },
] as const;
```

### Assertion Helpers

```typescript
// tests/utils/portfolio-route-test-utils.ts

export function assertValidSnapshot(snapshot: unknown): asserts snapshot is ForecastSnapshotV1 {
  ForecastSnapshotV1Schema.parse(snapshot);
}

export function assertValidLot(lot: unknown): asserts lot is InvestmentLotV1 {
  InvestmentLotV1Schema.parse(lot);
}
```

---

## Performance Benchmarks

### Target Response Times

| Endpoint                     | Target (p95) | Max (p99) |
|------------------------------|--------------|-----------|
| POST /snapshots              | 200ms        | 500ms     |
| GET /snapshots (list)        | 100ms        | 250ms     |
| GET /snapshots/:id           | 50ms         | 150ms     |
| POST /lots                   | 150ms        | 400ms     |
| GET /lots (list)             | 100ms        | 250ms     |
| PUT /snapshots/:id           | 100ms        | 300ms     |

### Load Testing Targets

- **Concurrent Users:** 50
- **Requests/Second:** 100
- **Error Rate:** < 0.1%
- **Database Connections:** < 20 active

---

## Success Criteria

### Definition of Done

- [ ] All P0 tests passing (100%)
- [ ] All P1 tests passing (90%+)
- [ ] Code coverage > 85% (lines)
- [ ] No flaky tests (3 consecutive runs)
- [ ] Performance benchmarks met
- [ ] Testcontainers startup < 10s
- [ ] Test execution < 60s (full suite)
- [ ] CI pipeline green

### Review Checklist

- [ ] Test scenarios cover all edge cases
- [ ] Error messages are actionable
- [ ] Test data cleanup is comprehensive
- [ ] Idempotency tests are thorough
- [ ] Optimistic locking tests cover race conditions
- [ ] Pagination tests cover boundary conditions
- [ ] Background job tests verify queue integration

---

## Appendix

### Related Documentation

- [Portfolio Route API Schemas](../../../shared/schemas/portfolio-route.ts)
- [Drizzle Schema](../../../shared/db/schema.ts)
- [Idempotency Pattern](../../../docs/architecture/idempotency.md)
- [Optimistic Locking](../../../docs/architecture/optimistic-locking.md)

### Test File Locations

```
tests/
├── unit/
│   └── api/
│       └── portfolio-route-validation.test.ts
├── integration/
│   └── portfolio-route.test.ts
├── e2e/
│   └── portfolio-workflows.test.ts
├── fixtures/
│   └── portfolio-route-fixtures.ts
└── utils/
    └── portfolio-route-test-utils.ts
```

### Test Coverage Dashboard

Run `npm test -- --coverage --ui` to view interactive coverage dashboard.

---

**Document Version:** 1.0.0
**Last Updated:** 2025-11-08
**Maintainer:** Test Engineering Team
