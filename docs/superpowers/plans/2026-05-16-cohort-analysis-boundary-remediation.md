# Cohort Analysis Boundary Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Cohort Analysis reachable through the canonical server route
path, move Analysis Cohort domain logic into shared code, and align the
client/backend Cohort Definition ID contract.

**Architecture:** Treat **Cohort Analysis** as the sector/vintage performance
feature and keep the legacy `CohortEngine` public surface stable as the **Exit
Cohort Model** surface. The canonical Analysis Cohort implementation moves to
`shared/core/cohorts/analysis/`; client files become one-file-per-module shims
and server routes import shared domain logic directly.

**Tech Stack:** TypeScript, Express, Drizzle query chains, Vitest, Supertest,
React/TanStack Query client hooks.

---

## Scope And Decisions

This plan implements the decisions already resolved in the grill session:

- Mount `/api/cohorts` in both server surfaces, with `server/routes.ts` treated
  as regression-critical.
- Use a new focused `registerRoutes` route test with mocked DB and a real `200`
  response shape.
- Use direct `analyzeCohorts` semantic tests before moving files, then update
  those tests to import the canonical shared module after the move.
- Preserve the current five-file Analysis Cohort split: `advanced-engine`,
  `resolvers`, `company-cohorts`, `cash-flows`, `metrics`.
- Keep one-file-per-current-module client shims.
- Fold the client UUID contract fix into the shared-boundary/refactor commit.
- Add a targeted server-import guard for old client cohort-analysis module
  imports.
- Do not change seeding behavior, user-facing navigation, historical docs, or
  the legacy `CohortEngine` public symbol.

## Post-Review Amendment

Final review found two API contract gaps after the shared-boundary move:

- `analyzeCohorts` accepted `dateRange`, `sectorIds`, and `stages` in the public
  request but did not apply them.
- `GET /api/cohorts/definitions?includeArchived=false` parsed the string
  `"false"` as truthy.

The final implementation includes a follow-up fix commit that applies filters in
the shared Analysis Cohort engine and replaces `z.coerce.boolean()` with
explicit query-boolean parsing.

## File Structure

**Create**

- `tests/unit/server/cohort-routes-registration.test.ts`  
  Focused route-registration test that creates an Express app, calls
  `registerRoutes(app)`, sends `POST /api/cohorts/analyze`, uses a narrow mocked
  DB, and expects `200`.

- `tests/unit/cohorts/analyze-cohorts.test.ts`  
  Direct semantic tests for `analyzeCohorts`: company-level assignment,
  investment-level assignment, unmapped inclusion, and exposure-only rows.

- `shared/core/cohorts/analysis/advanced-engine.ts`  
  Moved canonical Analysis Cohort pipeline.

- `shared/core/cohorts/analysis/resolvers.ts`  
  Moved sector/vintage resolution helpers.

- `shared/core/cohorts/analysis/company-cohorts.ts`  
  Moved company-level cohort-key helpers.

- `shared/core/cohorts/analysis/cash-flows.ts`  
  Moved lot-to-cash-flow helpers.

- `shared/core/cohorts/analysis/metrics.ts`  
  Moved XIRR/DPI/TVPI/cohort-row helpers.

- `tests/unit/contract/cohort-analysis-boundary.test.ts`  
  Targeted guard that fails if server files import Analysis Cohort modules from
  `client/src/core/cohorts`.

**Modify**

- `server/routes.ts`  
  Mount `server/routes/cohort-analysis.ts` at `/api/cohorts` in the canonical
  `registerRoutes` path.

- `server/routes/cohort-analysis.ts`  
  Replace dynamic import from `../../client/src/core/cohorts/advanced-engine.js`
  with a shared import.

- `client/src/core/cohorts/advanced-engine.ts`  
  Replace implementation with a re-export shim.

- `client/src/core/cohorts/resolvers.ts`  
  Replace implementation with a re-export shim.

- `client/src/core/cohorts/company-cohorts.ts`  
  Replace implementation with a re-export shim.

- `client/src/core/cohorts/cash-flows.ts`  
  Replace implementation with a re-export shim.

- `client/src/core/cohorts/metrics.ts`  
  Replace implementation with a re-export shim.

- `client/src/core/cohorts/index.ts`  
  Keep exports but update comments so legacy `CohortEngine` is not described as
  the main entry point.

- `client/src/hooks/useCohortAnalysis.ts`  
  Change local `CohortDefinition.id` from `number` to `string`.

- `client/src/components/cohorts/CohortDefinitionSelector.tsx`  
  Change selected ID props and callbacks from `number` to `string`; remove
  `Number(v)`.

- `tests/unit/contract/funds-boundary-guard.test.ts`  
  Add re-export completeness pairs for the new shared analysis modules and their
  client shims.

---

### Task 1: Canonical Route Reachability

**Files:**

- Create: `tests/unit/server/cohort-routes-registration.test.ts`
- Modify: `server/routes.ts`

- [ ] **Step 1: Write the failing route-registration test**

Create `tests/unit/server/cohort-routes-registration.test.ts` with this content:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const DEFAULT_DEFINITION_ID = '11111111-1111-4111-8111-111111111111';
const SECTOR_ID = '22222222-2222-4222-8222-222222222222';
const LOT_ID = '33333333-3333-4333-8333-333333333333';

const {
  mockDb,
  resetMockDb,
  mockRegisterCompletionHandlers,
  mockAutomationStart,
} = vi.hoisted(() => {
  const selectResults: unknown[][] = [];

  function makeSelectChain(rows: unknown[]) {
    const resolved = Promise.resolve(rows);
    const chain = {
      from: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(() => resolved),
      then: resolved.then.bind(resolved),
      catch: resolved.catch.bind(resolved),
      finally: resolved.finally.bind(resolved),
    };
    return chain;
  }

  const mockDb = {
    select: vi.fn(() => makeSelectChain(selectResults.shift() ?? [])),
  };

  return {
    mockDb,
    resetMockDb(results: unknown[][]) {
      selectResults.splice(0, selectResults.length, ...results);
      mockDb.select.mockClear();
    },
    mockRegisterCompletionHandlers: vi.fn(),
    mockAutomationStart: vi.fn(),
  };
});

vi.mock('../../../server/db', () => ({
  db: mockDb,
}));

vi.mock('../../../server/services/calc-run-completion-handlers.js', () => ({
  registerCompletionHandlers: mockRegisterCompletionHandlers,
}));

vi.mock('../../../server/services/variance-alert-automation.js', () => ({
  varianceAlertAutomationService: {
    start: mockAutomationStart,
  },
}));

describe('cohort routes on registerRoutes surface', () => {
  let server: import('http').Server | undefined;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    resetMockDb([
      [
        {
          id: DEFAULT_DEFINITION_ID,
          fundId: 1,
          name: 'Default Company View',
          vintageGranularity: 'year',
          sectorTaxonomyVersion: 'v1',
          unit: 'company',
          isDefault: true,
          archivedAt: null,
        },
      ],
      [{ id: 10, name: 'Acme', sector: 'SaaS' }],
      [
        {
          id: 100,
          companyId: 10,
          investmentDate: new Date('2024-01-15T00:00:00Z'),
          amount: '1000000',
          round: 'Seed',
        },
      ],
      [{ id: SECTOR_ID, slug: 'saas', name: 'SaaS', isSystem: false }],
      [{ rawValueNormalized: 'saas', canonicalSectorId: SECTOR_ID }],
      [],
      [],
      [
        {
          id: LOT_ID,
          investmentId: 100,
          lotType: 'initial',
          sharePriceCents: 100n,
          sharesAcquired: '1000000',
          costBasisCents: 100000000n,
          createdAt: new Date('2024-01-15T00:00:00Z'),
        },
      ],
    ]);
  });

  afterEach(async () => {
    const serverToClose = server;
    server = undefined;

    if (serverToClose?.listening) {
      await new Promise<void>((resolve, reject) => {
        serverToClose.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it('mounts Cohort Analysis on the canonical registerRoutes API surface', async () => {
    const app = express();
    app.set('trust proxy', false);
    app.use(express.json({ limit: '1mb' }));

    const { registerRoutes } = await import('../../../server/routes');
    server = await registerRoutes(app);

    const res = await request(app)
      .post('/api/cohorts/analyze')
      .send({ fundId: 1 });

    expect(res.status).toBe(200);
    expect(res.body.cohortDefinition).toMatchObject({
      id: DEFAULT_DEFINITION_ID,
      fundId: 1,
      name: 'Default Company View',
      vintageGranularity: 'year',
      sectorTaxonomyVersion: 'v1',
      unit: 'company',
    });
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0]).toMatchObject({
      cohortKey: '2024',
      sectorId: SECTOR_ID,
      sectorName: 'SaaS',
      counts: {
        companies: 1,
        investments: 1,
      },
      exposure: {
        paidIn: 1000000,
        distributions: 0,
      },
      performance: {
        dpi: 0,
        tvpi: null,
        irr: null,
      },
    });
  }, 30_000);
});
```

- [ ] **Step 2: Run the test and verify it fails because the route is not
      mounted**

Run:

```powershell
npx vitest run tests/unit/server/cohort-routes-registration.test.ts --project=server
```

Expected: FAIL. The response status should be `404` instead of `200`, proving
the canonical `registerRoutes` surface does not yet mount `/api/cohorts`.

- [ ] **Step 3: Mount the cohort router in `server/routes.ts`**

In `server/routes.ts`, add this after the deal pipeline route mount:

```ts
// Cohort Analysis routes
const cohortAnalysisRoutes = await import('./routes/cohort-analysis.js');
app.use('/api/cohorts', cohortAnalysisRoutes.default);
```

The surrounding block should read:

```ts
// Deal pipeline routes
const dealPipelineRoutes = await import('./routes/deal-pipeline.js');
app.use('/api/deals', dealPipelineRoutes.dealPipelineRouter);

// Cohort Analysis routes
const cohortAnalysisRoutes = await import('./routes/cohort-analysis.js');
app.use('/api/cohorts', cohortAnalysisRoutes.default);

// Feature flags routes
const flagsRoutes = await import('./routes/flags.js');
app.use('/api/flags', flagsRoutes.flagsRouter);
```

- [ ] **Step 4: Run the route-registration test and verify it passes**

Run:

```powershell
npx vitest run tests/unit/server/cohort-routes-registration.test.ts --project=server
```

Expected: PASS. The test should return `200` with one company-level Cohort
Analysis row.

- [ ] **Step 5: Commit reachability**

Run:

```powershell
git add server/routes.ts tests/unit/server/cohort-routes-registration.test.ts
git commit -m "fix: expose Cohort Analysis through canonical API routing" -m "The normal dev and production server path uses registerRoutes, but only the alternate makeApp surface mounted /api/cohorts. This wires the Cohort Analysis router into the canonical path and locks the default company-view request with a real handler response." -m "Constraint: Keep server/app.ts as an alternate surface rather than consolidating bootstrap paths in this remediation." -m "Rejected: Static route registration inspection | it would not prove the handler reaches schema-valid response generation." -m "Confidence: high" -m "Scope-risk: narrow" -m "Tested: npx vitest run tests/unit/server/cohort-routes-registration.test.ts --project=server" -m "Not-tested: Full suite deferred until final verification."
```

---

### Task 2: Direct Analysis Cohort Semantic Tests

**Files:**

- Create: `tests/unit/cohorts/analyze-cohorts.test.ts`

- [ ] **Step 1: Write direct semantic tests against the current client-path
      export**

Create `tests/unit/cohorts/analyze-cohorts.test.ts` with this content:

```ts
import { describe, expect, it } from 'vitest';
import {
  analyzeCohorts,
  type AnalyzeCohortInput,
} from '@/core/cohorts/advanced-engine';
import type { CohortUnit } from '@shared/types';

const FUND_ID = 1;
const DEFINITION_ID = '11111111-1111-4111-8111-111111111111';
const SAAS_ID = '22222222-2222-4222-8222-222222222222';
const FINTECH_ID = '33333333-3333-4333-8333-333333333333';
const UNMAPPED_ID = '44444444-4444-4444-8444-444444444444';

function makeInput(unit: CohortUnit): AnalyzeCohortInput {
  return {
    request: { fundId: FUND_ID },
    cohortDefinition: {
      id: DEFINITION_ID,
      fundId: FUND_ID,
      name: unit === 'company' ? 'Company View' : 'Investment View',
      vintageGranularity: 'year',
      sectorTaxonomyVersion: 'v1',
      unit,
    },
    resolutionInput: {
      fundId: FUND_ID,
      taxonomyVersion: 'v1',
      granularity: 'year',
      companies: [
        { id: 10, name: 'Alpha', sector: 'SaaS' },
        { id: 20, name: 'Beta', sector: 'FinTech' },
        { id: 30, name: 'Gamma', sector: 'Mystery' },
      ],
      investments: [
        {
          id: 100,
          companyId: 10,
          investmentDate: new Date('2022-01-15T00:00:00Z'),
          amount: '1000000',
          round: 'Seed',
        },
        {
          id: 101,
          companyId: 10,
          investmentDate: new Date('2024-03-01T00:00:00Z'),
          amount: '500000',
          round: 'Series A',
        },
        {
          id: 200,
          companyId: 20,
          investmentDate: new Date('2023-02-10T00:00:00Z'),
          amount: '750000',
          round: 'Seed',
        },
        {
          id: 300,
          companyId: 30,
          investmentDate: new Date('2023-07-01T00:00:00Z'),
          amount: '250000',
          round: 'Seed',
        },
      ],
      sectorTaxonomy: [
        { id: SAAS_ID, slug: 'saas', name: 'SaaS', isSystem: false },
        { id: FINTECH_ID, slug: 'fintech', name: 'FinTech', isSystem: false },
        { id: UNMAPPED_ID, slug: 'unmapped', name: 'Unmapped', isSystem: true },
      ],
      sectorMappings: [
        { rawValueNormalized: 'saas', canonicalSectorId: SAAS_ID },
        { rawValueNormalized: 'fintech', canonicalSectorId: FINTECH_ID },
      ],
      companyOverrides: [],
      investmentOverrides: [],
    },
    lots: [],
  };
}

describe('analyzeCohorts', () => {
  it('assigns all included investments for a company to the earliest included cohort key in company-level analysis', () => {
    const result = analyzeCohorts(makeInput('company'));

    const alphaRows = result.rows.filter((row) => row.sectorId === SAAS_ID);

    expect(alphaRows).toHaveLength(1);
    expect(alphaRows[0]).toMatchObject({
      cohortKey: '2022',
      sectorName: 'SaaS',
      counts: {
        companies: 1,
        investments: 2,
      },
      exposure: {
        paidIn: 1500000,
        distributions: 0,
      },
    });
  });

  it('assigns each investment to its own cohort key in investment-level analysis', () => {
    const result = analyzeCohorts(makeInput('investment'));

    const alphaRows = result.rows.filter((row) => row.sectorId === SAAS_ID);

    expect(alphaRows.map((row) => row.cohortKey)).toEqual(['2022', '2024']);
    expect(alphaRows.map((row) => row.counts)).toEqual([
      { companies: 1, investments: 1 },
      { companies: 1, investments: 1 },
    ]);
  });

  it('keeps unmapped sector classifications included in rows and unmapped reporting', () => {
    const result = analyzeCohorts(makeInput('company'));

    const unmappedRow = result.rows.find((row) => row.sectorId === UNMAPPED_ID);

    expect(unmappedRow).toMatchObject({
      cohortKey: '2023',
      sectorName: 'Unmapped',
      counts: {
        companies: 1,
        investments: 1,
      },
      exposure: {
        paidIn: 250000,
        distributions: 0,
      },
    });
    expect(result.unmapped).toEqual([
      {
        rawValue: 'Mystery',
        rawValueNormalized: 'mystery',
        companyCount: 1,
        investmentCount: 1,
        totalInvested: 250000,
      },
    ]);
  });

  it('returns exposure-only rows without performance metrics when no lot cash-flow events exist', () => {
    const result = analyzeCohorts(makeInput('company'));

    expect(
      result.rows.map((row) => `${row.cohortKey}:${row.sectorName}`)
    ).toEqual(['2022:SaaS', '2023:FinTech', '2023:Unmapped']);
    expect(result.rows.every((row) => row.performance === undefined)).toBe(
      true
    );
  });
});
```

- [ ] **Step 2: Run the direct semantic tests and verify they pass before the
      move**

Run:

```powershell
npx vitest run tests/unit/cohorts/analyze-cohorts.test.ts --project=server
```

Expected: PASS. These tests lock the current behavior before the shared-module
move.

- [ ] **Step 3: Commit semantic lock**

Run:

```powershell
git add tests/unit/cohorts/analyze-cohorts.test.ts
git commit -m "test: lock Analysis Cohort assignment semantics" -m "Before moving the implementation boundary, direct tests capture the behavior users depend on: company-level earliest included cohort keys, investment-level cohort keys, unmapped sector inclusion, exposure-only rows, and stable row ordering." -m "Constraint: Preserve current semantics while moving modules in the next commit." -m "Rejected: Route-only coverage | it proves reachability but not Analysis Cohort assignment rules." -m "Confidence: high" -m "Scope-risk: narrow" -m "Tested: npx vitest run tests/unit/cohorts/analyze-cohorts.test.ts --project=server" -m "Not-tested: Full suite deferred until final verification."
```

---

### Task 3: Shared Boundary, Shims, Guards, And UUID Contract

**Files:**

- Create: `shared/core/cohorts/analysis/advanced-engine.ts`
- Create: `shared/core/cohorts/analysis/resolvers.ts`
- Create: `shared/core/cohorts/analysis/company-cohorts.ts`
- Create: `shared/core/cohorts/analysis/cash-flows.ts`
- Create: `shared/core/cohorts/analysis/metrics.ts`
- Create: `tests/unit/contract/cohort-analysis-boundary.test.ts`
- Modify: `server/routes/cohort-analysis.ts`
- Modify: `client/src/core/cohorts/advanced-engine.ts`
- Modify: `client/src/core/cohorts/resolvers.ts`
- Modify: `client/src/core/cohorts/company-cohorts.ts`
- Modify: `client/src/core/cohorts/cash-flows.ts`
- Modify: `client/src/core/cohorts/metrics.ts`
- Modify: `client/src/core/cohorts/index.ts`
- Modify: `client/src/hooks/useCohortAnalysis.ts`
- Modify: `client/src/components/cohorts/CohortDefinitionSelector.tsx`
- Modify: `tests/unit/cohorts/analyze-cohorts.test.ts`
- Modify: `tests/unit/contract/funds-boundary-guard.test.ts`

- [ ] **Step 1: Move the Analysis Cohort implementation files**

Run:

```powershell
New-Item -ItemType Directory -Force shared\core\cohorts\analysis
git mv client\src\core\cohorts\advanced-engine.ts shared\core\cohorts\analysis\advanced-engine.ts
git mv client\src\core\cohorts\resolvers.ts shared\core\cohorts\analysis\resolvers.ts
git mv client\src\core\cohorts\company-cohorts.ts shared\core\cohorts\analysis\company-cohorts.ts
git mv client\src\core\cohorts\cash-flows.ts shared\core\cohorts\analysis\cash-flows.ts
git mv client\src\core\cohorts\metrics.ts shared\core\cohorts\analysis\metrics.ts
```

After the move, keep sibling imports inside the moved files relative. For
example, `shared/core/cohorts/analysis/advanced-engine.ts` should still contain:

```ts
import {
  getResolvedInvestments,
  getUnmappedSectors,
  type ResolutionInput,
} from './resolvers';
import {
  computeCompanyCohortKeys,
  getShiftedCompanies,
  countCompanies,
} from './company-cohorts';
import {
  getCashFlowEvents,
  groupEventsByCohortSector,
  type LotData,
} from './cash-flows';
import { generateCohortRow } from './metrics';
```

Keep cross-shared imports using `@shared/...`, matching the existing
shared-engine pattern.

- [ ] **Step 2: Add client one-file-per-module shims**

Create `client/src/core/cohorts/advanced-engine.ts`:

```ts
export { analyzeCohorts } from '@shared/core/cohorts/analysis/advanced-engine';
export type { AnalyzeCohortInput } from '@shared/core/cohorts/analysis/advanced-engine';
```

Create `client/src/core/cohorts/resolvers.ts`:

```ts
export {
  getResolvedInvestments,
  getUnmappedSectors,
} from '@shared/core/cohorts/analysis/resolvers';
export type { ResolutionInput } from '@shared/core/cohorts/analysis/resolvers';
```

Create `client/src/core/cohorts/company-cohorts.ts`:

```ts
export {
  computeCompanyCohortKeys,
  getShiftedCompanies,
  countCompanies,
} from '@shared/core/cohorts/analysis/company-cohorts';
```

Create `client/src/core/cohorts/cash-flows.ts`:

```ts
export {
  getCashFlowEvents,
  groupEventsByCohortSector,
  aggregateCashFlowsByDate,
  calculateCashFlowTotals,
  hasResidualValue,
} from '@shared/core/cohorts/analysis/cash-flows';
export type {
  LotData,
  CashFlowInput,
} from '@shared/core/cohorts/analysis/cash-flows';
```

Create `client/src/core/cohorts/metrics.ts`:

```ts
export {
  calculateXIRR,
  calculateDPI,
  calculateTVPI,
  calculateMetricsFromEvents,
  generateCohortRow,
} from '@shared/core/cohorts/analysis/metrics';
export type {
  CohortMetrics,
  CohortRowInput,
} from '@shared/core/cohorts/analysis/metrics';
```

- [ ] **Step 3: Update server route import to shared**

In `server/routes/cohort-analysis.ts`, add this import near the other imports:

```ts
import { analyzeCohorts } from '@shared/core/cohorts/analysis/advanced-engine';
```

Remove this dynamic import from inside the route handler:

```ts
// Import and run the analysis engine dynamically to avoid circular imports
const { analyzeCohorts } =
  await import('../../client/src/core/cohorts/advanced-engine.js');
```

The call should remain:

```ts
    const response = analyzeCohorts({
```

- [ ] **Step 4: Update `client/src/core/cohorts/index.ts` comments**

Replace the opening comment and section comments with wording that separates the
legacy and analysis surfaces:

```ts
/**
 * Cohort Analysis Module
 *
 * Exports cohort-related functionality including:
 * - Legacy CohortEngine compatibility exports for exit/value progression modeling
 * - Analysis Cohort pipeline exports for sector/vintage performance grouping
 * - Resolvers, company cohort keys, cash-flow events, and metrics
 */

// Legacy exit/value progression surface
export {
  CohortEngine,
  generateCohortSummary,
  compareCohorts,
} from './CohortEngine';

// Analysis Cohort pipeline
export { analyzeCohorts, type AnalyzeCohortInput } from './advanced-engine';
```

Keep the remaining resolver/company/cash-flow/metrics exports as they are.

- [ ] **Step 5: Update direct semantic tests to import the canonical shared
      module**

In `tests/unit/cohorts/analyze-cohorts.test.ts`, change:

```ts
import {
  analyzeCohorts,
  type AnalyzeCohortInput,
} from '@/core/cohorts/advanced-engine';
```

to:

```ts
import {
  analyzeCohorts,
  type AnalyzeCohortInput,
} from '@shared/core/cohorts/analysis/advanced-engine';
```

- [ ] **Step 6: Add targeted server import boundary guard**

Create `tests/unit/contract/cohort-analysis-boundary.test.ts` with this content:

```ts
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SERVER_ROOT = join(process.cwd(), 'server');
const FORBIDDEN_CLIENT_COHORT_MODULES = [
  'client/src/core/cohorts/advanced-engine',
  'client/src/core/cohorts/resolvers',
  'client/src/core/cohorts/company-cohorts',
  'client/src/core/cohorts/cash-flows',
  'client/src/core/cohorts/metrics',
] as const;

function listTypeScriptFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTypeScriptFiles(fullPath));
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      statSync(fullPath).isFile()
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const pattern =
    /(?:from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\))/g;

  for (const match of source.matchAll(pattern)) {
    const specifier = match[1] ?? match[2];
    if (specifier) {
      specs.push(specifier.replace(/\\/g, '/'));
    }
  }

  return specs;
}

describe('Cohort Analysis server boundary', () => {
  it('keeps server Analysis Cohort imports out of client source modules', () => {
    const offenders = listTypeScriptFiles(SERVER_ROOT).flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return importSpecifiers(source)
        .filter((specifier) =>
          FORBIDDEN_CLIENT_COHORT_MODULES.some((forbidden) =>
            specifier.includes(forbidden)
          )
        )
        .map(
          (specifier) =>
            `${relative(process.cwd(), file).replace(/\\/g, '/')}: ${specifier}`
        );
    });

    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 7: Add shared-analysis shim pairs to the existing re-export
      completeness guard**

In `tests/unit/contract/funds-boundary-guard.test.ts`, add these entries to
`reExportPairs` after the existing `shared/core/cohorts/CohortEngine.ts` pair:

```ts
  {
    source: 'shared/core/cohorts/analysis/advanced-engine.ts',
    shim: 'client/src/core/cohorts/advanced-engine.ts',
  },
  {
    source: 'shared/core/cohorts/analysis/resolvers.ts',
    shim: 'client/src/core/cohorts/resolvers.ts',
  },
  {
    source: 'shared/core/cohorts/analysis/company-cohorts.ts',
    shim: 'client/src/core/cohorts/company-cohorts.ts',
  },
  {
    source: 'shared/core/cohorts/analysis/cash-flows.ts',
    shim: 'client/src/core/cohorts/cash-flows.ts',
  },
  {
    source: 'shared/core/cohorts/analysis/metrics.ts',
    shim: 'client/src/core/cohorts/metrics.ts',
  },
```

- [ ] **Step 8: Fix the client Cohort Definition UUID contract**

In `client/src/hooks/useCohortAnalysis.ts`, change:

```ts
interface CohortDefinition {
  id: number;
```

to:

```ts
interface CohortDefinition {
  id: string;
```

In `client/src/components/cohorts/CohortDefinitionSelector.tsx`, change the
props interface:

```ts
interface CohortDefinitionSelectorProps {
  /** Currently selected definition ID */
  selectedId: string | undefined;
  /** Callback when selection changes */
  onSelect: (id: string | undefined) => void;
  /** Compact mode for inline display */
  compact?: boolean;
}
```

In the compact `Select`, change:

```tsx
          value={selectedId?.toString() || 'default'}
          onValueChange={(v) => onSelect(v === 'default' ? undefined : Number(v))}
```

to:

```tsx
          value={selectedId ?? 'default'}
          onValueChange={(v) => onSelect(v === 'default' ? undefined : v)}
```

In the compact item value, change:

```tsx
                <SelectItem key={def.id} value={def.id.toString()}>
```

to:

```tsx
                <SelectItem key={def.id} value={def.id}>
```

The non-compact `onClick={() => onSelect(def.id)}` already works after the prop
type changes.

- [ ] **Step 9: Run targeted tests for the shared-boundary commit**

Run:

```powershell
npx vitest run tests/unit/cohorts/analyze-cohorts.test.ts tests/unit/server/cohort-routes-registration.test.ts tests/unit/contract/cohort-analysis-boundary.test.ts tests/unit/contract/funds-boundary-guard.test.ts --project=server
```

Expected: PASS. This proves the direct semantics, canonical route reachability,
server import boundary, and client shim exports.

- [ ] **Step 10: Run typecheck after the UUID contract fix**

Run:

```powershell
npm run check
```

Expected: PASS with `Current errors: 0`.

- [ ] **Step 11: Commit shared boundary and contract alignment**

Run:

```powershell
git add server/routes/cohort-analysis.ts client/src/core/cohorts/advanced-engine.ts client/src/core/cohorts/resolvers.ts client/src/core/cohorts/company-cohorts.ts client/src/core/cohorts/cash-flows.ts client/src/core/cohorts/metrics.ts client/src/core/cohorts/index.ts client/src/hooks/useCohortAnalysis.ts client/src/components/cohorts/CohortDefinitionSelector.tsx shared/core/cohorts/analysis/advanced-engine.ts shared/core/cohorts/analysis/resolvers.ts shared/core/cohorts/analysis/company-cohorts.ts shared/core/cohorts/analysis/cash-flows.ts shared/core/cohorts/analysis/metrics.ts tests/unit/cohorts/analyze-cohorts.test.ts tests/unit/contract/cohort-analysis-boundary.test.ts tests/unit/contract/funds-boundary-guard.test.ts
git commit -m "refactor: put Analysis Cohort logic behind a shared boundary" -m "Analysis Cohort semantics now live in shared/core/cohorts/analysis so server routes and client shims use the same domain implementation. Client Cohort Definition IDs now match the backend UUID contract." -m "Constraint: Preserve the legacy CohortEngine public symbol as the Exit Cohort Model surface." -m "Rejected: Merge Analysis Cohorts into CohortEngine | it would conflate performance grouping with exit/value progression modeling." -m "Rejected: Repo-wide server-to-client import ban | useful but broader than this regression." -m "Confidence: high" -m "Scope-risk: moderate" -m "Directive: Server code must import Analysis Cohort logic from shared/core/cohorts/analysis, not client/src/core/cohorts." -m "Tested: npx vitest run tests/unit/cohorts/analyze-cohorts.test.ts tests/unit/server/cohort-routes-registration.test.ts tests/unit/contract/cohort-analysis-boundary.test.ts tests/unit/contract/funds-boundary-guard.test.ts --project=server" -m "Tested: npm run check" -m "Not-tested: Full suite deferred until final verification."
```

---

### Task 4: Final Verification

**Files:**

- No source files changed in this task.

- [ ] **Step 1: Run lint**

Run:

```powershell
npm run lint
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```powershell
npm run check
```

Expected: PASS with `Current errors: 0`.

- [ ] **Step 3: Run server build**

Run:

```powershell
npm run build:server
```

Expected: PASS and output includes `Server build complete: dist/index.js`.

- [ ] **Step 4: Run full test suite**

Run:

```powershell
npm test
```

Expected: PASS.

- [ ] **Step 5: Inspect final diff and status**

Run:

```powershell
git status --short
git log --oneline -3
```

Expected:

- Only intentional uncommitted documentation/planning files remain if they were
  intentionally kept outside implementation commits.
- The last three implementation commits correspond to route reachability, direct
  semantic tests, and shared-boundary/UUID alignment.

## Self-Review

**Spec coverage:** Covered route reachability, direct `analyzeCohorts` semantic
tests, shared module move, one-file-per-module shims, targeted boundary guard,
UUID client contract, comments distinguishing legacy `CohortEngine`, and final
automated verification.

**Placeholder scan:** This plan contains concrete file paths, code snippets,
commands, expected outcomes, and commit messages. It does not rely on
unspecified implementation steps.

**Type consistency:** `cohortDefinitionId` remains a string in request options;
`CohortDefinition.id` and `CohortDefinitionSelector.selectedId` are string IDs
matching backend UUIDs. Semantic tests import from the client shim before the
move and from the shared canonical module after the move.
