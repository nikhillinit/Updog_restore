# Term Conflict Audit — Tier 2 Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out the verified silent-corruption risks (Tier 2) from the
term-conflict audit: Economics summary multiple/money boundary tagging, Fund
decimal-string boundary crossing, PortfolioState alias shadowing, PeriodResult
name collision, reserves adapter unit ambiguity, and stranded dead-code copies
of the broken IRR.

**Architecture:** Each task is an independent refactor scoped to one concept.
Adapters at module boundaries; renames where types collide; deletions for
verified dead code. No new features, no new dependencies.

**Tech Stack:** TypeScript strict, Vitest (server + client projects), Drizzle
ORM, Express. Path aliases `@/` (client/src/), `@shared/` (shared/).

**Prerequisites (already completed by the user):**

- C1: `EconomicsAnnualRowV1Schema` dpi/tvpi/rvpi → `z.number().nonnegative()`
  with JSDoc (lines 222/224/226)
- C2: `client/src/core/selectors/fundKpis.ts` deleted, `HeaderKpis.tsx`
  repointed to `fund-kpis`
- C3 (starter): `dbToMOICInvestment` adapter added in `server/routes/moic.ts`

**Verification before starting:** Run `npm run check` and
`npm test -- --project=server` to confirm baseline is green.

**Ralplan amendments integrated after live-code review (2026-05-15):**

- Do **not** delete the entire repo-root `src/` tree in this plan. It contains
  21 files, not just the KPI duplicate. Task 0 is scoped to the verified
  KPI/HeaderKpis dead-copy files; broader root-`src` removal is deferred to a
  separate audit.
- `POST /funds` returns a Drizzle `Fund` row from `createFundWithInitialDraft`,
  not a storage `StoredFund`. `toClientFund()` must support that row shape
  directly; do not route it through `normalizeStoredFund()`.
- `PortfolioState` also exists as a page-local alias in
  `client/src/pages/portfolio-constructor.tsx`; Task 3 must remove/rename that
  alias and its component imports.
- `PeriodResult` exists in both `shared/core/capitalAllocation` and the mirrored
  `client/src/core/capitalAllocation`; Task 4 must cover both active copies and
  leave only the fund-model `PeriodResult` intact.
- `server/core/reserves/adapter.ts` keeps the conversion method private. Task 5
  should test through the public `FeatureFlaggedReserveEngine.compute()` path,
  or extract a narrow exported guard only if the public test becomes brittle.
- `EconomicsSummaryV1Schema` has the same final DPI/RVPI/TVPI multiple-vs-money
  boundary bug that C1 fixed for annual rows. Add Task -1 before Tier 2 work so
  the AI/reporting summary boundary reads final multiples as dimensionless
  ratios, not money.

---

## File Structure

**New files:**

- `tests/unit/server/routes/funds-boundary-transform.test.ts` — Fund
  decimal-to-number boundary test

**Modified files:**

- `server/routes/funds.ts` — add `toClientFund()` adapter, apply on all GET/POST
  responses
- `server/services/time-travel-analytics.ts` — rename `PortfolioState` →
  `PortfolioSnapshot` (interface at line 25, references at 54, 193)
- `shared/portfolio-strategy-schema.ts` — delete strategy alias at line 121
- `shared/types.ts` — remove `PortfolioState` re-export after confirming no
  consumers import it from `@shared/types`
- `client/src/pages/portfolio-constructor.tsx` — remove/rename page-local
  `PortfolioState` alias
- `client/src/components/portfolio-constructor/*.tsx` — update imports/usages to
  `PortfolioStrategy`
- `shared/core/capitalAllocation/periodLoop.ts` — rename `PeriodResult` →
  `AllocationPeriodSnapshot`
- `shared/core/capitalAllocation/periodLoopEngine.ts` — rename private
  processing `PeriodResult` to a distinct local name
- `shared/core/capitalAllocation/index.ts` — update barrel export
- `client/src/core/capitalAllocation/periodLoop.ts` — mirror exported rename
- `client/src/core/capitalAllocation/periodLoopEngine.ts` — mirror private
  processing rename
- `client/src/core/capitalAllocation/index.ts` — mirror barrel export update
- `server/core/reserves/adapter.ts` — add unit-guard invariant on lines 336-354
- `shared/contracts/economics-v1.contract.ts` — mark summary final DPI/RVPI/TVPI
  as dimensionless nonnegative numbers with JSDoc
- `tests/unit/phase3/fund-results-contract.test.ts` — source-level guard for
  final summary multiple annotations

**Deleted files (after verification of zero active references; do not delete the
full `src/` tree in this plan):**

- `src/core/selectors/fundKpis.ts` — root-level dead duplicate of the broken IRR
- `src/core/selectors/__tests__/fundKpis.test.ts`
- `src/components/overview/HeaderKpis.tsx`

---

## Task -1: Fix economics summary final multiple boundary tagging

**Context:** C1 corrected annual `dpi`/`rvpi`/`tvpi` rows from money schema
usage to dimensionless nonnegative numbers with JSDoc. The summary boundary
consumed by AI/reporting still used `NonNegativeMoneySchema` for `finalDpi`,
`finalRvpi`, and `finalTvpi`, so a final TVPI of `2.3` could be semantically
tagged as currency.

**Files:**

- Modify: `shared/contracts/economics-v1.contract.ts`
- Modify: `tests/unit/phase3/fund-results-contract.test.ts`

- [x] **Step 1: Add a regression guard before changing the contract**

Add a narrow contract-source test proving summary final multiples are documented
as dimensionless values and are not assigned `NonNegativeMoneySchema`.

- [x] **Step 2: Verify the guard fails on the existing bug**

Run:

```powershell
npm test -- --project=server tests/unit/phase3/fund-results-contract.test.ts
```

Expected before the fix: one failing test for the summary multiple annotation.

- [x] **Step 3: Apply the drop-in schema fix**

Change `finalDpi`, `finalRvpi`, and `finalTvpi` to `z.number().nonnegative()`
and add the same JSDoc pattern as the annual rows.

- [x] **Step 4: Re-run the targeted contract test**

Run:

```powershell
npm test -- --project=server tests/unit/phase3/fund-results-contract.test.ts
```

Expected after the fix: all contract tests pass.

---

## Task 0: Verify and remove root-level dead KPI/HeaderKpis copies

**Context:** The user deleted `client/src/core/selectors/fundKpis.ts`, but a
second copy at repo-root `src/core/selectors/fundKpis.ts` still contains the
broken period-index Newton-Raphson algorithm. Path aliases in `vite.config.ts`
map `@/` to `client/src/`, not `src/`, suggesting the KPI copy is dead.
Live-code review shows repo-root `src/` contains 21 files, so this task removes
only the verified KPI/HeaderKpis dead-copy files and defers broader `src/`
cleanup to a separate audit.

**Files:**

- Inspect: `vite.config.ts`, `vitest.config.ts`, `vitest.config.base.ts`,
  `tsconfig.json`, `tsconfig.*.json`
- Delete (if dead): `src/core/selectors/fundKpis.ts`,
  `src/core/selectors/__tests__/fundKpis.test.ts`,
  `src/components/overview/HeaderKpis.tsx`
- Defer: all other repo-root `src/**` files

- [ ] **Step 1: Confirm no build references `src/` at repo root**

```bash
npm run check 2>&1 | head -5
```

Then grep every config:

Use Grep tool, pattern `"src/"|"./src"|baseUrl|rootDir|paths`, files
`tsconfig*.json,vite.config.ts,vitest.config*.ts`. Expected: zero references to
a top-level `src/` directory (only `client/src/`, `server/`, `shared/`,
`packages/`).

- [ ] **Step 2: Confirm no production code imports from root `src/`**

Use Grep tool: pattern `from ['"](\.\./)+src/|from ['"]src/`, output_mode
`files_with_matches`. Inspect any hit. Expected: matches only inside `src/`
itself or `docs/archive/`.

- [ ] **Step 3: Run tests to capture current pass count**

Run: `npm test -- --reporter=default 2>&1 | tail -20` Record the number of
passing tests. We must not lose any after deletion.

- [ ] **Step 4: Delete only the verified dead KPI/HeaderKpis files**

PowerShell on Windows:

```powershell
Remove-Item -Force src/core/selectors/fundKpis.ts
Remove-Item -Force src/core/selectors/__tests__/fundKpis.test.ts
Remove-Item -Force src/components/overview/HeaderKpis.tsx
```

Do not delete the full repo-root `src/` tree in this plan. If Step 1/2 proves
the entire tree is orphaned, record that evidence and create a separate cleanup
task; this Tier 2 plan only removes the broken IRR duplicate and its local test
/ header wrapper.

- [ ] **Step 5: Verify no regressions**

Run: `npm run check && npm test -- --reporter=default 2>&1 | tail -20` Expected:
TypeScript clean, test pass count equals Step 3 (or higher because dead tests
removed).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove dead root KPI duplicate

The repo-root src/core/selectors/fundKpis.ts copy is not used by the
active client alias path (client uses @/ -> client/src/) and still
contains the period-index Newton-Raphson IRR removed from client/src/.

This removes only the verified KPI/HeaderKpis dead-copy files. The
broader repo-root src/ tree is deferred to a separate audit because it
contains additional files outside this Tier 2 risk."
```

---

## Task 1: Fund decimal-string boundary adapter (H1)

**Context:** Drizzle returns `funds.size`, `managementFee`, `carryPercentage`,
`deployedCapital` as **strings** (decimal type) and `createdAt` as a `Date`
object. Client components like `CashflowDashboard.tsx` compute
`currentFund.size / 1000000`, which produces NaN when `size` is a string.
Currently `server/routes/funds.ts` returns rows untransformed.

**Files:**

- Modify: `server/routes/funds.ts`
- Create: `tests/unit/server/routes/funds-boundary-transform.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/server/routes/funds-boundary-transform.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { toClientFund } from '../../../../server/routes/funds';

describe('toClientFund adapter', () => {
  it('converts decimal-string columns to numbers', () => {
    const row = {
      id: 1,
      name: 'Test Fund I',
      size: '100000000.00',
      managementFee: '0.02',
      carryPercentage: '0.20',
      deployedCapital: '5000000.50',
      vintageYear: 2024,
      status: 'active' as const,
      engineResults: null,
      createdAt: new Date('2026-01-15T12:00:00Z'),
      establishmentDate: null,
      isActive: true,
    };

    const client = toClientFund(row);

    expect(client.size).toBe(100_000_000);
    expect(client.managementFee).toBe(0.02);
    expect(client.carryPercentage).toBe(0.2);
    expect(client.deployedCapital).toBe(5_000_000.5);
    expect(client.createdAt).toBe('2026-01-15T12:00:00.000Z');
    expect(typeof client.size).toBe('number');
    expect(typeof client.createdAt).toBe('string');
  });

  it('handles null deployedCapital safely', () => {
    const row = {
      id: 2,
      name: 'Test Fund II',
      size: '50000000',
      managementFee: '0.025',
      carryPercentage: '0.20',
      deployedCapital: null,
      vintageYear: 2025,
      status: 'active' as const,
      engineResults: null,
      createdAt: new Date('2026-02-01T00:00:00Z'),
      establishmentDate: null,
      isActive: true,
    };

    const client = toClientFund(row);

    expect(client.deployedCapital).toBe(0);
    expect(client.size).toBe(50_000_000);
  });

  it('rejects non-numeric strings rather than silently emitting NaN', () => {
    const row = {
      id: 3,
      name: 'Bad Fund',
      size: 'not-a-number',
      managementFee: '0.02',
      carryPercentage: '0.20',
      deployedCapital: '0',
      vintageYear: 2025,
      status: 'active' as const,
      engineResults: null,
      createdAt: new Date(),
      establishmentDate: null,
      isActive: true,
    };

    expect(() => toClientFund(row)).toThrow(/size/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`npm test -- --project=server tests/unit/server/routes/funds-boundary-transform.test.ts`
Expected: FAIL — `toClientFund is not exported` (the symbol doesn't exist yet).

- [ ] **Step 3: Add the adapter to `server/routes/funds.ts`**

Open `server/routes/funds.ts`. Just after the `type StoredFund = ...`
declaration on line 26, insert:

```typescript
type ClientFundDate = Date | string | null | undefined;
type ClientFundRow = Pick<
  PersistedFund,
  | 'id'
  | 'name'
  | 'size'
  | 'managementFee'
  | 'carryPercentage'
  | 'deployedCapital'
  | 'vintageYear'
  | 'status'
  | 'engineResults'
  | 'createdAt'
  | 'establishmentDate'
  | 'isActive'
>;

export interface ClientFund {
  id: number;
  name: string;
  size: number;
  managementFee: number;
  carryPercentage: number;
  deployedCapital: number;
  vintageYear: number;
  status: PersistedFund['status'];
  engineResults: PersistedFund['engineResults'];
  createdAt: string;
  establishmentDate: string | null;
  isActive: boolean;
}

function parseDecimal(
  value: string | number | null | undefined,
  field: string
): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid decimal in field '${field}': ${value}`);
  }
  return n;
}

function toIsoString(
  value: ClientFundDate,
  field: string,
  required = false
): string | null {
  if (value === null || value === undefined) {
    if (required) {
      throw new Error(`Missing required date field '${field}'`);
    }
    return null;
  }
  return value instanceof Date ? value.toISOString() : value;
}

export function toClientFund(row: ClientFundRow): ClientFund {
  return {
    id: row.id,
    name: row.name,
    size: parseDecimal(row.size, 'size'),
    managementFee: parseDecimal(row.managementFee, 'managementFee'),
    carryPercentage: parseDecimal(row.carryPercentage, 'carryPercentage'),
    deployedCapital: parseDecimal(row.deployedCapital, 'deployedCapital'),
    vintageYear: row.vintageYear,
    status: row.status,
    engineResults: row.engineResults,
    createdAt: toIsoString(row.createdAt, 'createdAt', true)!,
    establishmentDate: toIsoString(row.establishmentDate, 'establishmentDate'),
    isActive: row.isActive ?? true,
  };
}
```

- [ ] **Step 4: Run unit test to verify it passes**

Run:
`npm test -- --project=server tests/unit/server/routes/funds-boundary-transform.test.ts`
Expected: PASS — all three tests green.

- [ ] **Step 5: Apply adapter to GET /funds handler**

Replace the body of the GET /funds handler (lines 71-82):

```typescript
router['get']('/funds', async (_req: Request, res: Response) => {
  try {
    const funds = await getCanonicalFunds();
    return res['json'](funds.map(toClientFund));
  } catch (error) {
    const apiError: ApiError = {
      error: 'Database query failed',
      message: error instanceof Error ? error.message : 'Failed to fetch funds',
    };
    return res['status'](500)['json'](apiError);
  }
});
```

- [ ] **Step 6: Apply adapter to GET /funds/:id handler**

Find the `return res['json'](fund);` line near line 110 inside the GET
/funds/:id handler and replace with:

```typescript
return res['json'](toClientFund(fund));
```

- [ ] **Step 7: Apply adapter to POST /funds handler**

Before editing, confirm the return type of
`fundPersistenceService.createFundWithInitialDraft`. It currently returns a
Drizzle `Fund` row (`@shared/schema/fund`), which is compatible with the
`ClientFundRow` adapter shape. Do **not** pass this row through
`normalizeStoredFund()`; that helper is for storage rows from
`storage.getAllFunds`.

Replace the response block at lines 153-168 with:

```typescript
res['status'](201);
return res['json']({
  success: true,
  data: toClientFund(fund),
  message: 'Fund created successfully',
});
```

- [ ] **Step 8: Run the full route test suite**

Run:
`npm test -- --project=server tests/unit/contract/funds-boundary-guard.test.ts tests/unit/contract/funds-endpoint-snapshots.test.ts tests/unit/contract/funds-route-ownership.test.ts tests/unit/routes/funds-legacy-removal.test.ts tests/unit/server/routes/funds-boundary-transform.test.ts`
Expected: PASS. If `funds-endpoint-snapshots.test.ts` fails because snapshots
expect strings, that's the bug — update snapshots in step 9.

- [ ] **Step 9: Update snapshot expectations if needed**

If `funds-endpoint-snapshots.test.ts` had been pinning the broken string-form
output, regenerate:

Run:
`npm test -- --project=server tests/unit/contract/funds-endpoint-snapshots.test.ts --update`
Then read the updated snapshots and verify the new shape uses numbers (not
strings) for monetary fields and ISO strings for dates.

- [ ] **Step 10: Type-check + commit**

Run: `npm run check` Expected: zero errors.

```bash
git add server/routes/funds.ts tests/unit/server/routes/funds-boundary-transform.test.ts
# only -u flag updates if snapshot file changed
git add tests/unit/contract/funds-endpoint-snapshots.test.ts -- 2>/dev/null
git commit -m "fix(funds): convert Drizzle decimal columns to numbers at API boundary

Drizzle returned 'size', 'managementFee', 'carryPercentage', and
'deployedCapital' as decimal strings, and 'createdAt' as a Date.
Client components compute 'currentFund.size / 1000000' which produced
NaN in CashflowDashboard and ExecutiveDashboard.

Adds toClientFund() adapter applied uniformly on GET /funds, GET /funds/:id,
and POST /funds responses. Throws on unparseable decimals rather than
silently emitting NaN downstream."
```

---

## Task 2: Rename time-travel `PortfolioState` → `PortfolioSnapshot` (H6 part 1)

**Context:** `server/services/time-travel-analytics.ts:25` defines
`interface PortfolioState` describing a point-in-time snapshot (current
holdings, totals). `shared/portfolio-strategy-schema.ts:121` separately aliases
`export type PortfolioState = PortfolioStrategy` — semantically the opposite
(target allocations, not current state). The two have collided across 11 files.
First step: rename the snapshot type to a non-conflicting name.

**Files:**

- Modify: `server/services/time-travel-analytics.ts` (interface declaration + 2
  references)
- Find consumers using Grep before editing

- [ ] **Step 1: Identify consumers of the snapshot type (not the alias)**

Use Grep: pattern `PortfolioState`, output_mode `content`, `-n true`. Read the
results. Snapshot consumers will be importing from `time-travel-analytics`;
alias consumers will be importing from `portfolio-strategy-schema` or
`shared/types`.

Expected snapshot consumers based on live-code review:
`server/services/time-travel-analytics.ts` (3 hits).
`tests/utils/portfolio-test-utils.ts` and
`tests/utils/portfolio-route-test-utils.ts` contain local
`generatePortfolioState` helper names only; they do not import the type.

- [ ] **Step 2: Rename the interface and its in-file references**

In `server/services/time-travel-analytics.ts`:

Replace at line 25:

```typescript
export interface PortfolioState {
```

with:

```typescript
export interface PortfolioSnapshot {
```

Replace at line 54:

```typescript
state: PortfolioState;
```

with:

```typescript
state: PortfolioSnapshot;
```

Replace at line 193:

```typescript
      state: snapshot.state as PortfolioState,
```

with:

```typescript
      state: snapshot.state as PortfolioSnapshot,
```

- [ ] **Step 3: Update any external snapshot consumers**

For each file that imports `PortfolioState` from `time-travel-analytics` (verify
with Grep first):

```typescript
// before
import type { PortfolioState } from '@/server/services/time-travel-analytics';
// after
import type { PortfolioSnapshot } from '@/server/services/time-travel-analytics';
```

Update all uses of the symbol in the same file.

- [ ] **Step 4: Type-check**

Run: `npm run check` Expected: zero errors. If errors mention `PortfolioState`
not found in a file that imported from `time-travel-analytics`, update that
import. If errors mention `PortfolioState` in a file importing from
`portfolio-strategy-schema`, that's Task 3 — leave it.

- [ ] **Step 5: Run server + integration tests**

Run: `npm test -- --project=server` Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/services/time-travel-analytics.ts
git commit -m "refactor: rename time-travel PortfolioState to PortfolioSnapshot

The snapshot type collided with the PortfolioStrategy alias from
portfolio-strategy-schema. Renaming the snapshot disambiguates the
two semantically-opposite concepts (current holdings vs target
allocations). Alias removal follows in the next commit."
```

---

## Task 3: Delete the `PortfolioState` strategy alias (H6 part 2)

**Context:** `shared/portfolio-strategy-schema.ts:121` aliases
`export type PortfolioState = PortfolioStrategy`. This is dead-weight
indirection — every consumer should import `PortfolioStrategy` directly. After
Task 2 renamed the conflicting snapshot type, removing this alias is safe.

**Files:**

- Modify: `shared/portfolio-strategy-schema.ts` (delete line 121)
- Modify: every file that imports or re-exports the strategy alias. Per
  live-code review, candidates include:
  - `client/src/components/portfolio-constructor/ScenarioComparison.tsx`
  - `client/src/components/portfolio-constructor/ReserveConfigurator.tsx`
  - `client/src/components/portfolio-constructor/FundStrategyBuilder.tsx`
  - `client/src/pages/portfolio-constructor.tsx`
  - `shared/types.ts`

- [ ] **Step 1: Confirm the alias is on line 121**

Use Read tool, file `shared/portfolio-strategy-schema.ts`, offset 118, limit 6.
Verify line 121 is exactly:

```typescript
export type PortfolioState = PortfolioStrategy;
```

- [ ] **Step 2: Find every consumer of the alias**

Use Grep, pattern `PortfolioState`, output_mode `files_with_matches`. From the
results, exclude:

- `server/services/time-travel-analytics.ts` (already renamed in Task 2)
- `tests/utils/portfolio-*` (local helper names only; do not edit unless an
  import is actually found)
- `docs/**` (documentation, ignore)
- `archive/**` (legacy, ignore)
- `.claude/worktrees/**` (worktree clones, ignore)

The remaining hits are alias consumers. For each: read the import line and
decide whether the file wants the strategy or the snapshot semantics. (Strategy
= target allocations; Snapshot = current holdings.)

Also grep specifically for consumers importing the alias from the shared
re-export:

```bash
rg -n "PortfolioState" shared client server tests -g '!node_modules' -g '!dist'
```

If any consumer imports `PortfolioState` from `@shared/types` or a relative
`shared/types` path, update that consumer before removing the re-export.

- [ ] **Step 3: Update each consumer to import `PortfolioStrategy`**

For each file identified in Step 2:

```typescript
// before
import type { PortfolioState } from '@shared/portfolio-strategy-schema';
// ... uses PortfolioState type ...

// after
import type { PortfolioStrategy } from '@shared/portfolio-strategy-schema';
// ... uses PortfolioStrategy type ...
```

Update all type references in the file. Use Edit's `replace_all: true` if the
symbol name is unique in the file.

- [ ] **Step 4: Remove/rename the page-local alias**

In `client/src/pages/portfolio-constructor.tsx`, remove the local alias:

```typescript
// before
export type PortfolioState = PortfolioStrategy;
// after
export type { PortfolioStrategy };
```

Then update imports in:

- `client/src/components/portfolio-constructor/ScenarioComparison.tsx`
- `client/src/components/portfolio-constructor/ReserveConfigurator.tsx`
- `client/src/components/portfolio-constructor/FundStrategyBuilder.tsx`

Example:

```typescript
// before
import type { PortfolioState } from '@/pages/portfolio-constructor';
// after
import type { PortfolioStrategy } from '@/pages/portfolio-constructor';
```

Rename prop types from `PortfolioState` to `PortfolioStrategy` in those files.

- [ ] **Step 5: Re-export inspection in `shared/types.ts`**

If `shared/types.ts` re-exports `PortfolioState`, remove the re-export (it's a
duplicate of the strategy type's main export).

- [ ] **Step 6: Delete the shared strategy alias**

In `shared/portfolio-strategy-schema.ts`, remove line 121:

```typescript
export type PortfolioState = PortfolioStrategy;
```

If a comment precedes it (e.g., `// Backward-compat alias`), delete that too.

- [ ] **Step 7: Type-check + test**

Run: `npm run check` Expected: zero errors. Any `PortfolioState`-not-found error
indicates a missed consumer — locate it via Grep and update.

Run both projects or the full suite because this touches shared and client type
surfaces:

```bash
npm test -- --project=server
npm test -- --project=client
```

If runtime allows before final handoff/merge, run `npm test`.

- [ ] **Step 8: Stale-symbol acceptance check**

Run:

```bash
rg -n "PortfolioState" server shared client tests -g '!node_modules' -g '!dist'
```

Expected remaining hits: none in active source except documentation/archive
references and unrelated local helper names such as `generatePortfolioState` if
those names remain.

- [ ] **Step 9: Commit**

```bash
git add shared/portfolio-strategy-schema.ts shared/types.ts client/src/components/portfolio-constructor/ client/src/pages/portfolio-constructor.tsx
git commit -m "refactor: delete PortfolioState alias for PortfolioStrategy

The alias shadowed the time-travel PortfolioSnapshot type (renamed in
the prior commit) with semantically-opposite semantics. Removing the
alias forces consumers to import PortfolioStrategy explicitly so the
intent is clear at every callsite."
```

---

## Task 4: Rename `PeriodResult` → `AllocationPeriodSnapshot` in capitalAllocation (H2)

**Context:** Two unrelated `PeriodResult` types coexist:

- `shared/schemas/fund-model.ts:230` — fund model performance metrics (TVPI,
  DPI, IRR, NAV)
- `shared/core/capitalAllocation/periodLoop.ts:40` — cash-flow centroids and
  recycling pools (cents-scale)

A wrong import would compile because the structural overlap on `period`/`month`
fields is enough to avoid a type error, but downstream code reading `.tvpi`
would get `undefined` at runtime. Renaming the capitalAllocation type stops the
collision.

**Files:**

- Modify: `shared/core/capitalAllocation/periodLoop.ts` (exported declaration +
  internal references)
- Modify: `shared/core/capitalAllocation/periodLoopEngine.ts` (private
  processing result interface + references)
- Modify: `shared/core/capitalAllocation/index.ts` (barrel re-export)
- Modify: `client/src/core/capitalAllocation/periodLoop.ts` (mirrored exported
  declaration + internal references)
- Modify: `client/src/core/capitalAllocation/periodLoopEngine.ts` (mirrored
  private processing result interface + references)
- Modify: `client/src/core/capitalAllocation/index.ts` (mirrored barrel
  re-export)
- Modify: any consumer outside capitalAllocation (verify with Grep)

- [ ] **Step 1: Inventory current references**

Use Grep: pattern `PeriodResult`, path `shared/core/capitalAllocation`,
output_mode `content`, `-n true`. Read all hits. Confirm the type is named
`PeriodResult` and find its declaration line.

Repeat the same inventory for `client/src/core/capitalAllocation`.

Use Grep: pattern
`PeriodResult.*from.*capitalAllocation|capitalAllocation.*PeriodResult`,
output_mode `files_with_matches`, to find external consumers. Also inspect
direct path imports such as
`../../client/src/core/capitalAllocation/periodLoop`.

- [ ] **Step 2: Rename exported `periodLoop.ts` declarations in shared and
      client**

In `shared/core/capitalAllocation/periodLoop.ts` at the type declaration (around
line 40), replace:

```typescript
export interface PeriodResult {
```

with:

```typescript
export interface AllocationPeriodSnapshot {
```

If declared with `export type PeriodResult = ...` instead, apply the same
rename.

Apply the same exported rename in
`client/src/core/capitalAllocation/periodLoop.ts`.

- [ ] **Step 3: Rename `periodLoop.ts` in-file references**

In both `shared/core/capitalAllocation/periodLoop.ts` and
`client/src/core/capitalAllocation/periodLoop.ts`, use Edit with
`replace_all: true`:

- old_string: `PeriodResult`
- new_string: `AllocationPeriodSnapshot`

If the symbol legitimately collides with anything else in the file (e.g., a
variable named `periodResult` — case differs, so safe), verify first.

- [ ] **Step 4: Rename private `periodLoopEngine.ts` processing result types**

`shared/core/capitalAllocation/periodLoopEngine.ts` and
`client/src/core/capitalAllocation/periodLoopEngine.ts` each define a private
`interface PeriodResult`. Rename these private processing result types to a
distinct local name such as `PeriodProcessingSnapshot`.

Do **not** use `AllocationPeriodSnapshot` for this private shape unless it is
actually the same exported shape from `periodLoop.ts`; current live-code review
shows it is a separate local shape.

- [ ] **Step 5: Update shared and client barrels**

In both `shared/core/capitalAllocation/index.ts` and
`client/src/core/capitalAllocation/index.ts`:

```typescript
// before
export type { PeriodResult } from './periodLoop';
// after
export type { AllocationPeriodSnapshot } from './periodLoop';
```

If the barrel re-exports more broadly (e.g., `export * from './periodLoop'`),
the rename propagates automatically — no change needed beyond the source file.

- [ ] **Step 6: Update external consumers**

For each external consumer file from Step 1:

```typescript
// before
import type { PeriodResult } from '@shared/core/capitalAllocation';
// after
import type { AllocationPeriodSnapshot } from '@shared/core/capitalAllocation';
```

Then `replace_all: true` on the symbol name in that file. Repeat for each
consumer.

- [ ] **Step 7: Type-check**

Run: `npm run check` Expected: zero errors. If a file previously importing
`PeriodResult` from capitalAllocation now reports a missing symbol, update it.
If a file imports `PeriodResult` from `shared/schemas/fund-model` (the
legitimate other meaning), leave it alone.

- [ ] **Step 8: Run capitalAllocation tests**

Run the client/shared capital allocation truth and parity tests that cover these
mirrors:

```bash
npm test -- --project=server tests/unit/truth-cases/capital-allocation.test.ts tests/unit/capital-allocation-engine.parity.test.ts
npm test -- --project=client
```

If the exact client project filter is too broad for local runtime, at minimum
run the capital-allocation-specific test files and `npm run check`.

- [ ] **Step 9: Stale-symbol acceptance check**

Run:

```bash
rg -n "\bPeriodResult\b" shared/core/capitalAllocation client/src/core/capitalAllocation
```

Expected: zero hits. Then run:

```bash
rg -n "\bPeriodResult\b" shared/schemas shared/lib server
```

Expected: only legitimate fund-model `PeriodResult` uses remain.

- [ ] **Step 10: Commit**

```bash
git add shared/core/capitalAllocation/ client/src/core/capitalAllocation/ # plus any external consumers updated
git commit -m "refactor: rename capitalAllocation PeriodResult to AllocationPeriodSnapshot

Two unrelated 'PeriodResult' types existed: fund-model.ts (KPIs) and
capitalAllocation/periodLoop.ts (cash-flow cents). Structural overlap
on common fields meant wrong imports compiled but would emit undefined
on downstream property access. Renaming the cash-flow variant stops
the collision."
```

---

## Task 5: Add unit-guard invariant to reserves adapter (H3)

**Context:** `server/core/reserves/adapter.ts:336-354` maps a `PortfolioCompany`
(port interface with `invested: number` semantically in dollars) onto a
`ReservePortfolioCompany` field `totalInvested: number`. Nothing prevents a
caller from passing cents (e.g., from a `*_cents` Drizzle column) by mistake. A
100× under-allocation would silently flow through reserves math. We add a guard
at the adapter that rejects suspicious values + JSDoc that pins the contract.

**Files:**

- Modify: `server/core/reserves/adapter.ts` lines 336-354
- Test: `tests/unit/server/core/reserves/adapter-unit-guard.test.ts` (create)

- [ ] **Step 1: Read the current adapter**

Use Read tool on `server/core/reserves/adapter.ts`, offset 330, limit 35.
Confirm the function signature, parameter type, and the line where
`totalInvested` is assigned from `company.invested`.

- [ ] **Step 2: Write the failing test through the public adapter path**

Create `tests/unit/server/core/reserves/adapter-unit-guard.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { FeatureFlaggedReserveEngine } from '../../../../../server/core/reserves/adapter';
import type {
  PortfolioCompany,
  MarketConditions,
} from '../../../../../server/core/reserves/ports';
import type { MlClient } from '../../../../../server/core/reserves/mlClient';
import type { DeterministicReserveEngine } from '@shared/core/reserves/DeterministicReserveEngine';
import type { ConstrainedReserveEngine } from '@shared/core/reserves/ConstrainedReserveEngine';
import type { ReserveAllocationInput } from '@shared/schemas/reserves-schemas';

describe('reserves adapter unit guard', () => {
  const market: MarketConditions = { asOfDate: '2026-01-01' };

  function buildCompany(
    overrides: Partial<PortfolioCompany> = {}
  ): PortfolioCompany {
    return {
      id: 'co-1',
      fundId: 'fund-1',
      name: 'Company 1',
      stage: 'seed',
      checkSize: 500_000,
      invested: 1_200_000,
      ownership: 0.1,
      ...overrides,
    };
  }

  function buildEngine() {
    const deterministicEngine = {
      calculateOptimalReserveAllocation: vi.fn(
        async (input: ReserveAllocationInput) => ({
          inputSummary: {
            totalAllocated: input.portfolio[0]!.totalInvested,
            allocationEfficiency: 100,
          },
          riskAnalysis: { keyRiskFactors: [], riskMitigationActions: [] },
        })
      ),
    };

    const engine = new FeatureFlaggedReserveEngine(
      deterministicEngine as unknown as DeterministicReserveEngine,
      {} as unknown as ConstrainedReserveEngine,
      {} as unknown as MlClient,
      {
        useMl: false,
        mode: 'rules',
        mlWeight: 0,
        enableABTest: false,
        abTestPercentage: 0,
        fallbackOnError: false,
        logAllDecisions: false,
      }
    );

    return { engine, deterministicEngine };
  }

  it('accepts dollar-scale invested amounts', async () => {
    const { engine, deterministicEngine } = buildEngine();
    await engine.compute(buildCompany(), market);
    expect(
      deterministicEngine.calculateOptimalReserveAllocation
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        portfolio: [expect.objectContaining({ totalInvested: 1_200_000 })],
      })
    );
  });

  it('rejects suspiciously large values that look like cents before calling the engine', async () => {
    const { engine, deterministicEngine } = buildEngine();
    await expect(
      engine.compute(buildCompany({ invested: 120_000_000_000 }), market)
    ).rejects.toThrow(/unit|scale|exceeds/i);
    expect(
      deterministicEngine.calculateOptimalReserveAllocation
    ).not.toHaveBeenCalled();
  });

  it('rejects negative invested amounts before calling the engine', async () => {
    const { engine, deterministicEngine } = buildEngine();
    await expect(
      engine.compute(buildCompany({ invested: -1 }), market)
    ).rejects.toThrow(/negative|invalid/i);
    expect(
      deterministicEngine.calculateOptimalReserveAllocation
    ).not.toHaveBeenCalled();
  });
});
```

If this public-path test becomes too brittle because of class dependencies,
extract only the validation logic into a narrow exported helper such as
`assertInvestedDollars()` and keep `convertToReserveInput` private. Do not make
`convertToReserveInput` public just for tests.

- [ ] **Step 3: Run test to verify it fails**

Run:
`npm test -- --project=server tests/unit/server/core/reserves/adapter-unit-guard.test.ts`
Expected: Tests for large/negative values FAIL — the adapter currently has no
guard.

- [ ] **Step 4: Add the guard**

In `server/core/reserves/adapter.ts`, locate the function body around lines
336-354. Just before the return statement that produces `totalInvested`, insert:

```typescript
// Unit guard: 'invested' contract is DOLLARS, not cents.
// 1e11 = $100B/company is implausible; values this large likely mean a
// cents-scale source crossed the boundary without conversion.
const INVESTED_MAX_DOLLARS = 1e11;
if (!Number.isFinite(company.invested) || company.invested < 0) {
  throw new Error(
    `Reserves adapter: invalid 'invested' value ${company.invested} for company ${company.id}`
  );
}
if (company.invested > INVESTED_MAX_DOLLARS) {
  throw new Error(
    `Reserves adapter: 'invested' value ${company.invested} for company ${company.id} ` +
      `exceeds plausible dollar scale (${INVESTED_MAX_DOLLARS}). ` +
      `Check whether a cents-scale source was passed without /100 conversion.`
  );
}
```

Then update the JSDoc above the function:

```typescript
/**
 * Maps a hexagonal-port PortfolioCompany to the reserves engine input shape.
 *
 * UNIT CONTRACT: 'company.invested' and 'company.checkSize' MUST be in dollars
 * (e.g., 1_000_000 for $1M). Cents-scale (1e8) sources will trip the unit guard
 * and throw. If you need to feed a *_cents column through this adapter, divide
 * by 100 at the call site.
 *
 * @throws if invested is negative, non-finite, or larger than 1e11.
 */
```

- [ ] **Step 5: Run test to verify it passes**

Run:
`npm test -- --project=server tests/unit/server/core/reserves/adapter-unit-guard.test.ts`
Expected: PASS — all three tests green.

- [ ] **Step 6: Run the full reserves test suite**

Run:
`npm test -- --project=server tests/unit/server/core/reserves/ tests/unit/contract/reserves`
Expected: PASS. If any existing test was implicitly relying on cents-scale data
flowing through (i.e., the very bug we're catching), it will now throw —
investigate the test fixture rather than weakening the guard.

- [ ] **Step 7: Commit**

```bash
git add server/core/reserves/adapter.ts tests/unit/server/core/reserves/adapter-unit-guard.test.ts
git commit -m "feat(reserves): add unit guard to port-to-engine investment adapter

The adapter at lines 336-354 maps PortfolioCompany.invested (dollars,
per the port contract) onto the reserves engine. Nothing prevented a
caller from passing a *_cents column directly, which would produce a
100x under-allocation silently.

Adds a guard that throws on negative, non-finite, or implausibly-large
(>1e11) invested values. Updates JSDoc to pin the dollar-scale contract
on the public API."
```

---

## Self-Review Checklist (run before considering plan complete)

**Spec coverage:**

- [x] H1 Fund decimal-string crossing → Task 1
- [x] H2 PeriodResult name collision → Task 4
- [x] H3 Reserves adapter unit ambiguity → Task 5
- [x] H6 PortfolioState alias shadowing → Tasks 2 and 3
- [x] Residual dead code from C2 (root `src/` tree) → Task 0
- C1, C2, C3 (starter) — completed by user before plan written, listed in
  prerequisites

**Placeholder scan:**

- Task 5 no longer contains adapter-function placeholders. It tests through the
  public `FeatureFlaggedReserveEngine.compute()` path, preserving the private
  converter boundary. If that test proves brittle during execution, extract a
  narrow exported validation helper; do not expose `convertToReserveInput`
  directly.

**Type consistency:**

- `ClientFund` interface defined in Task 1 is referenced only inside Task 1; no
  later task touches it.
- `PortfolioSnapshot` (Task 2) and `PortfolioStrategy` (Task 3) are kept
  distinct — Task 2 renames the snapshot type only; Task 3 removes both the
  shared strategy alias and the page-local alias.
- `AllocationPeriodSnapshot` (Task 4) is unique to exported capitalAllocation
  period-loop output in both shared and client mirrors.
- The legitimate fund-model `PeriodResult` in `shared/schemas/fund-model.ts`
  remains unchanged.

**Final stale-symbol checks:**

- `rg -n "PortfolioState" server shared client tests -g '!node_modules' -g '!dist'`
  should show no active type aliases/imports after Task 3, except unrelated
  helper names like `generatePortfolioState` if they remain.
- `rg -n "\bPeriodResult\b" shared/core/capitalAllocation client/src/core/capitalAllocation`
  should show zero hits after Task 4.
- `rg -n "src/core/selectors/fundKpis|@core/selectors/fundKpis" .` should show
  no active source imports after Task 0.

---

## Execution Notes

**Order matters:** Task -1 → 0 → 1 → 2 → 3 → 4 → 5. Task 3 depends on Task 2 to
avoid intermediate compile breaks (the alias and the snapshot interface would
otherwise both be named `PortfolioState` during the rename window).

**Commit cadence:** Each task ends with a commit. Do not batch.

**Verification breadth:** Tasks 2-4 touch shared/client type surfaces. Run
`npm run check` after each, and run client + server tests where runtime allows.
Server-only tests are not sufficient for those tasks.

**Out of scope (deferred to a separate plan):**

- Full Investment-type namespacing across all modules (the user shipped the
  `dbToMOICInvestment` starter; expanding to `DBInvestment` / `EngineInvestment`
  / `UIInvestment` namespaced exports is its own refactor).
- `EngineResults` JSONB validation on read/write (Tier 3 in the audit).
- `'dd'` → `'due_diligence'` pipeline status rename (Tier 3).
- Dead schema deletion (`shared/types.ts WaterfallSchema`,
  `schema/src/reserves.ts`).
- Stage legacy-format migration (`shared/schemas.ts`, `reserves/types.ts`
  no-separator variants).
