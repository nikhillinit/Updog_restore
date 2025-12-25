# Testing Strategy and Suite

## Overview
Comprehensive testing suite covering unit tests, integration tests, E2E tests, load testing, and chaos engineering. This document outlines what runs where and why certain architectural decisions were made.

## Test Types and Environments

### Unit Tests (Vitest + JSDOM)
**Location:** `tests/unit/`  
**Environment:** JSDOM  
**Purpose:** Test pure functions and small DOM components that don't trigger React's focus/selection internals

**Run commands:**
```bash
npm run test:unit          # Run all unit tests
npm run test:unit:watch    # Watch mode for development
```

**What to test here:**
- Pure utility functions (e.g., `fund-setup-utils.ts`)
- Simple React components without complex interactions
- Business logic and calculations
- Store actions and selectors

### Integration Tests (Vitest + Node)
**Location:** `tests/integration/`  
**Environment:** Node  
**Purpose:** Test server modules, API endpoints, and data flows

**Run commands:**
```bash
npm run test:integration       # Run all integration tests
npm run test:integration:watch # Watch mode for development
```

**What to test here:**
- API endpoint behavior
- Database operations
- Worker processes
- Server-side business logic

### E2E/Smoke Tests (Playwright)
**Location:** `tests/e2e/`  
**Environment:** Real browser (Chrome, Firefox, etc.)  
**Purpose:** Test full user workflows and verify no React rendering issues

**Run commands:**
```bash
npm run test:e2e        # Run fund-setup smoke tests
npm run test:e2e:all    # Run all E2E tests
```

**What to test here:**
- Multi-step user workflows (e.g., fund setup wizard)
- Component rendering without React churn errors
- Interactive elements and navigation
- Performance characteristics

### Quarantined Tests
**Location:** `tests/quarantine/`  
**Purpose:** Tests that cannot run in current environments due to technical limitations

These tests are excluded from all test runs and kept for reference. They document functionality that should be tested but requires different tooling or environment fixes.

## Why This Testing Split?

### The DOM Simulator Problem
React 18's internal `getActiveElementDeep` function uses `instanceof HTMLIFrameElement`, which fails in DOM simulation environments (JSDOM/happy-dom) because these constructors aren't properly exposed. This is a fundamental limitation that cannot be reliably polyfilled.

**Solution:** Component smoke tests that verify React rendering (no churn, no hydration errors) must run in real browsers via Playwright.

### Testing Philosophy
1. **Unit Tests** - Fast, focused on logic, run in JSDOM
2. **Integration Tests** - Server/API focused, run in Node
3. **E2E Tests** - User-focused, run in real browsers

This separation ensures:
- Fast feedback during development (unit/integration)
- Reliable smoke testing (E2E with real browsers)
- Clear boundaries for what to test where

## Load and Performance Testing

### 1. k6 Load Testing
Located in `tests/k6/`

#### Baseline Test (`k6-baseline.js`)
Standard load test with SLO thresholds:
```bash
k6 run -e BASE_URL=https://staging.yourdomain.com \
       -e METRICS_KEY=$METRICS_KEY \
       -e HEALTH_KEY=$HEALTH_KEY \
       -e FUND_SIZE=100000000 \
       -e RATE=5 -e DURATION=2m -e VUS=20 \
       tests/k6/k6-baseline.js
```

**Thresholds:**
- Error rate < 1%
- P95 latency < 500ms
- End-to-end calculation < 1.5s
- Calculation failure rate < 2%

#### Chaos Test (`k6-chaos.js`)
Run during Redis disruptions to observe circuit breaker behavior:
```bash
k6 run -e BASE_URL=https://staging.yourdomain.com \
       -e METRICS_KEY=$METRICS_KEY \
       -e FUND_SIZE=100000000 \
       -e RATE=3 -e DURATION=5m \
       tests/k6/k6-chaos.js
```

### 2. Chaos Engineering
Located in `tests/chaos/`

#### Local ToxiProxy Setup
Simulates network issues between app and Redis:

```bash
# Start ToxiProxy and Redis
docker compose -f tests/chaos/docker-compose.toxiproxy.yml up -d

# Point app to proxy
export REDIS_URL=redis://localhost:6380

# Induce chaos
./tests/chaos/chaos.sh break  # Add latency and packet loss
./tests/chaos/chaos.sh heal   # Restore connection
./tests/chaos/chaos.sh status # Check proxy status
```

### 3. Smoke Tests
Quick validation script in `scripts/smoke.sh`:

```bash
export BASE_URL=https://staging.yourdomain.com
export METRICS_KEY=your-metrics-key
export HEALTH_KEY=your-health-key
./scripts/smoke.sh
```

Validates:
- Health endpoints (/healthz, /readyz)
- Metrics authentication
- Fund calculation async flow

## Monitoring

### Prometheus Alert Rules
Located in `monitoring/prometheus-rules.yaml`

**Critical Alerts:**
- `RedisDown`: Redis connection lost for 2m
- `CircuitBreakerOpen`: Breaker open for 1m
- `HighErrorRate`: 5xx > 1% for 5m
- `SLOBurnFast`: Error budget burning too quickly

**Warning Alerts:**
- `TargetDown`: Service down for 2m
- `P95LatencyHigh`: P95 > 500ms for 10m
- `CacheHitRateLow`: Hit rate < 80% for 10m
- `SLOBurnSlow`: Prolonged elevated errors

## Test Scenarios

### 1. Baseline Performance
```bash
# Run 2-minute baseline at 5 req/s
npm run test:baseline
```

### 2. Redis Failure
```bash
# Terminal 1: Start chaos monitor
npm run test:chaos

# Terminal 2: Break Redis
./tests/chaos/chaos.sh break

# Wait 30s, then heal
./tests/chaos/chaos.sh heal
```

### 3. Staging Validation
```bash
# After deployment
npm run test:staging
```

## CI Integration

### GitHub Actions
Tests run automatically on:
- Pull requests (unit + integration + E2E smoke)
- Staging deployments (smoke + baseline)
- Nightly (full chaos suite)

**Essential CI Pipeline Steps:**
```yaml
- name: Install Playwright browsers
  run: npx playwright install --with-deps

- name: Unit tests
  run: npm run test:unit

- name: Integration tests
  run: npm run test:integration

- name: Build
  run: npm run build

- name: E2E smoke (production build)
  run: npm run test:e2e
```

**Optional CI Script:**
```json
{
  "ci:e2e": "playwright test --project=core tests/e2e/fund-setup.spec.ts"
}
```

### Required Secrets
- `METRICS_KEY`: Bearer token for /metrics
- `HEALTH_KEY`: Token for detailed health
- `STAGING_URL`: Staging environment URL

## Performance Targets

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Availability | 99.9% | < 99% |
| P95 Latency | < 500ms | > 500ms |
| P99 Latency | < 1000ms | > 1500ms |
| Error Rate | < 0.1% | > 1% |
| Cache Hit Rate | > 90% | < 80% |

## Troubleshooting

### k6 Installation
```bash
# macOS
brew install k6

# Windows
choco install k6

# Linux
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

### Common Load Testing Issues

**Circuit breaker not opening:**
- Check `REDIS_URL` is correct
- Verify circuit breaker is enabled in providers.ts
- Check metrics endpoint for `circuit_breaker_state`

**Load test timeouts:**
- Increase VUS parameter
- Check network connectivity
- Verify service scaling

**ToxiProxy connection refused:**
- Ensure Docker is running
- Check port 8474 is available
- Verify proxy configuration in toxics.json

## CI/CD Strategy

### Pre-push (Local)
- Unit tests
- Integration tests (if configured)
- TypeScript checks
- Linting

Fast, deterministic checks that don't require browser infrastructure.

### CI Pipeline
1. Unit tests (`npm run test:unit`)
2. Integration tests (`npm run test:integration`)
3. Build application (`npm run build`)
4. E2E smoke tests (`npm run test:e2e`)
5. Extended E2E tests on main branch (`npm run test:e2e:all`)

### Nightly/Scheduled
- Full E2E test suite
- Load testing with k6
- Chaos engineering tests
- Performance benchmarks

## Common Testing Issues and Solutions

### "Right-hand side of 'instanceof' is not an object"
**Cause:** Running React component tests in JSDOM that trigger focus/selection code  
**Solution:** Move these tests to Playwright E2E

### "Should not already be working" 
**Cause:** React Testing Library cleanup conflicts with React 18's concurrent features  
**Solution:** Don't manually call cleanup(); RTL handles it automatically

### Hydration warnings in tests
**Cause:** Dev mode double-invocation or SSR/CSR mismatch  
**Solution:** Run E2E tests against production builds (`npm run build && npm run preview`)

### Tests pass locally but fail in CI
**Possible causes:**
1. Timing issues - Add proper `waitFor` assertions
2. Environment differences - Check NODE_ENV and other env vars
3. Port conflicts - Use dynamic ports or ensure cleanup

## Debugging Failed Tests

### Unit/Integration Tests
```bash
# Run specific test file
npm run test:unit -- tests/unit/specific.test.ts

# Run with debugging output
DEBUG=* npm run test:unit

# Run single test by name
npm run test:unit -- -t "should resolve step correctly"
```

### E2E Tests
```bash
# Run with headed browser
npx playwright test --headed

# Debug specific test
npx playwright test --debug tests/e2e/fund-setup.spec.ts

# View trace after failure
npx playwright show-trace trace.zip

# Generate new test with codegen
npx playwright codegen localhost:4173
```

## Best Practices

### Writing Unit Tests
- Extract pure logic from components for easier testing
- Mock external dependencies
- Focus on behavior, not implementation
- Keep tests fast and isolated

### Writing E2E Tests
- Test user journeys, not implementation details
- Use data-testid attributes for reliable element selection
- Capture console errors and network failures
- Enable trace and video on failure for debugging
- Run against production builds to avoid dev-mode noise

### Test Data
- Use factories for consistent test data
- Avoid hardcoded IDs that might conflict
- Clean up after tests (database, localStorage, etc.)
- Use deterministic data for reproducible tests

## Test Data Seeding

### Quick Start

```bash
# Seed database with comprehensive test data
npm run db:seed:test

# Reset and reseed (clears existing test data)
npm run db:seed:test:reset

# Minimal dataset for quick tests
npm run db:seed:test:minimal
```

### Test Data Schema

The `db:seed:test` script creates the following test data for QA and E2E testing:

#### Test Fund
- **Name**: Test Venture Fund I
- **Size**: $100M
- **Vintage**: 2023
- **Management Fee**: 2.0% on committed capital (quarterly payment)
- **Carried Interest**: 20% with 8% preferred return, 100% catch-up
- **GP Commitment**: 2%
- **Status**: Active

#### Portfolio Companies (4 companies)

| Company Name | Sector | Stage | Initial Investment | Valuation | Ownership | Status | Exit Details |
|---|---|---|---|---|---|---|---|
| Alpha SaaS Corp | SaaS | Series A | $1M | $10M | 10% | Active | - |
| Beta AI Labs | AI/ML | Seed | $500K | $5M | 10% | Active | - |
| Gamma Fintech Inc | Fintech | Series B | $5M | $50M | 10% | Active | - |
| Delta Biotech | Biotech | Series A | $2M | $20M | 10% | Exited | $30M (1.5x MOIC) |

**Follow-on Investments** (automatically created for Series A+ companies):
- Alpha SaaS Corp: $500K at $20M valuation (2.5% ownership)
- Gamma Fintech Inc: $2.5M at $100M valuation (2.5% ownership)
- Delta Biotech: $1M at $40M valuation (2.5% ownership)

#### LP Accounts (3 LPs)

| LP Name | Email | Commitment | Capital Called | Call % | Distributions | DPI |
|---|---|---|---|---|---|---|
| Institutional LP 1 | lp1@test.com | $10M | $5M | 50% | $2M | 0.4x |
| Institutional LP 2 | lp2@test.com | $20M | $10M | 50% | $4M | 0.4x |
| Family Office LP | lp3@test.com | $5M | $2.5M | 50% | $1M | 0.4x |

**Distribution Records**: All LPs have one distribution record dated 2023-12-15 (type: capital_return)

#### Scenarios (3 scenarios)

| Scenario | Description | Success Rate | Avg Multiple | Deployment Pace |
|---|---|---|---|---|
| Base Case | Conservative assumptions with historical market returns | 25% | 3.0x | Steady |
| Bull Case | Optimistic assumptions with above-market returns | 40% | 5.0x | Aggressive |
| Bear Case | Conservative assumptions with below-market returns | 15% | 2.0x | Cautious |

### Minimal Mode

Use `--minimal` flag for faster test data creation (skips LP accounts, scenarios, and follow-on investments):

```bash
npm run db:seed:test:minimal
```

**Minimal dataset includes**:
- 1 test fund
- 4 portfolio companies
- 4 initial investments only (no follow-ons)

**Use minimal mode for**:
- Quick smoke tests
- Development iteration
- Unit test data requirements

### Test Data Cleanup

After testing, clean up test data:

```bash
# Automatic cleanup (recommended)
npm run db:seed:test:reset

# Manual cleanup via SQL
psql $DATABASE_URL -c "DELETE FROM funds WHERE name = 'Test Venture Fund I';"
```

**Note**: Using `--reset` flag automatically removes all dependent records (cascade delete).

### Using Test Data in Tests

**E2E Tests (Playwright)**:
```typescript
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Seed runs once before test suite
  // Data persists across tests for performance
  await page.goto('/funds');
});

test('should display test fund', async ({ page }) => {
  await expect(page.getByText('Test Venture Fund I')).toBeVisible();
});
```

**Integration Tests (Vitest)**:
```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../server/db';
import { funds } from '../shared/schema';
import { eq } from 'drizzle-orm';

describe('Fund API', () => {
  let testFundId: number;

  beforeAll(async () => {
    // Find test fund seeded by db:seed:test
    const [fund] = await db.select()
      .from(funds)
      .where(eq(funds.name, 'Test Venture Fund I'));
    testFundId = fund.id;
  });

  it('should fetch fund details', async () => {
    const response = await fetch(`/api/funds/${testFundId}`);
    expect(response.status).toBe(200);
  });
});
```

### Test Data Requirements by Domain

**Fund Setup Tests**: Requires clean state (no pre-existing data)
```bash
npm run db:seed:test:reset && npm run test:e2e -- fund-setup
```

**Portfolio Management Tests**: Requires companies and investments
```bash
npm run db:seed:test && npm run test:e2e -- portfolio
```

**LP Portal Tests**: Requires LP accounts with distributions
```bash
npm run db:seed:test && npm run test:e2e -- lp-portal
```

**Calculation Engine Tests**: Requires exited companies for MOIC/IRR
```bash
npm run db:seed:test && npm run test -- xirr
```

### Data Consistency Validation

Verify test data integrity after seeding:

```bash
# Check fund created
psql $DATABASE_URL -c "SELECT id, name, size FROM funds WHERE name = 'Test Venture Fund I';"

# Check companies created
psql $DATABASE_URL -c "SELECT COUNT(*) FROM portfolio_companies WHERE fund_id = (SELECT id FROM funds WHERE name = 'Test Venture Fund I');"

# Check LP accounts
psql $DATABASE_URL -c "SELECT COUNT(*) FROM limited_partners WHERE fund_id = (SELECT id FROM funds WHERE name = 'Test Venture Fund I');"
```

Expected counts:
- Funds: 1
- Portfolio Companies: 4
- Investments: 7 (full mode) or 4 (minimal mode)
- LP Accounts: 3 (full mode) or 0 (minimal mode)
- Scenarios: 3 (full mode) or 0 (minimal mode)