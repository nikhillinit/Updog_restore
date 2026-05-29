# Scenario Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing ADR-022 scenario surfaces release-grade by fixing
canonical input hashing, append-only retention, concurrency governance,
economics fail-closed comparison semantics, and a real Postgres/Redis release
gate before scenario UX or override expansion.

**Architecture:** Keep the lane compatibility-preserving and evidence-first. Add
shared pure canonicalization for scenario inputs, keep server-only hashing at
the server boundary, replace scenario-set overwrite persistence with append-only
snapshot reuse keyed by canonical hash, and prove the lifecycle through existing
route, queue, worker, and results surfaces. The full scenario release gate
depends on typed comparison-unavailable semantics, so economics fail-closed work
lands before the full gate.

**Tech Stack:** TypeScript, Express, Drizzle schema definitions, PostgreSQL
migrations, BullMQ/Redis, Vitest unit and integration projects, existing
`ci-unified.yml` service-container jobs.

---

## Current Main Facts

Verified against clean `main` synced to `origin/main` at
`8d9b9adcdd0fb1eba6063788d080cce76ecfb206`.

- ADR-022 lives at `docs/adr/ADR-022-fund-scenario-architecture.md` and is still
  `Proposed` in frontmatter and index.
- Fee-profile scenario hashing is raw `JSON.stringify` in
  `server/services/fund-scenario-calculation-service.ts`.
- Reserve scenario hashing is raw `JSON.stringify` and currently sorts variants
  by `id` only in
  `server/services/fund-scenario-reserve-calculation-service.ts`.
- Fee-profile and reserve scenario snapshots both upsert on
  `(fund_id, scenario_set_id)`.
- Migration `server/db/migrations/0014_fund_scenario_calculated_event.sql`
  creates `fund_snapshots_scenario_set_calculation_unique`, which prevents
  append-only scenario snapshots for the same scenario set.
- `fund_snapshots.state_hash` already exists in `shared/schema/fund.ts`; use it
  for canonical scenario input hashes while retaining `metadata.input_hash` for
  compatibility.
- Existing stable JSON behavior exists in `server/lib/stable-json.ts`, but it is
  server-local. Scenario canonicalization should reuse its sorted-key idea
  without importing server code into `shared`.
- Current comparison status is coarse in
  `shared/contracts/fund-scenario-comparison-v1.contract.ts`:
  `no_scenario_results`, `baseline_unavailable`, `unsupported_override_type`,
  `comparable`.
- Current scripts include `validate:core`, `test:integration`,
  `test:integration:routes`, `calc-gate`, and `calc-gate:full`. Do not reference
  retired `test:phase4`, `test:phase4:client`, or `test:wave4` scripts.
- Existing CI workflows already include Postgres 16 and Redis 7 service
  containers in `.github/workflows/ci-unified.yml`; prefer extending that
  workflow over creating a new scenario-only workflow unless the unified
  workflow cannot express the gate cleanly.
- Existing async scenario acceptance should remain endpoint-first: poll
  `GET /api/funds/:fundId/scenario-sets/:scenarioSetId/calculation-status` until
  terminal `succeeded` or `failed`.
- Worker-style integration setup applies ADR-022 SQL migrations through a
  hardcoded list in `tests/integration/fund-scenario-reserve-worker.test.ts`;
  any `0016` migration must be added there or copied into a shared helper before
  new integration tests can use it.
- `db:push` is `drizzle-kit push` against Drizzle schema output, not an
  automated runner for `server/db/migrations/*.sql`; the production/staging
  apply path for raw ADR-022 SQL must be documented before the retention
  migration ships.
- The old scenario snapshot upsert provides current write collapse behavior.
  Replacing it with a bare append-only insert would create unique-violation
  races, so retention work must use calculation-run serialization and
  conflict-safe snapshot insert/reselect.

## Scope

Implement only the release-hardening lane:

1. Release-lane governance and command correction.
2. Canonical scenario input hashing.
3. Hash call-site migration for existing fee-profile and reserve scenario lanes.
4. Economics fail-closed comparison reasons.
5. Append-only scenario retention with calculation runs.
6. Scenario release gate with real Postgres/Redis/worker proof.

Out of scope for this plan:

- Scenario UX workspace.
- Allocation and sector override expansion.
- Reserve optimization UI or workflow.
- Forecast modes and actuals.
- Cohort release readiness.
- Money utility refactors, schema-directory renames, engine dedupe, config
  cleanup, route mount normalization, dependency additions, Phoenix protected
  docs.

## File Structure

- Create `docs/plans/scenario-release-lane.md`
  - Durable release-lane policy and corrected command list.
- Create `shared/lib/scenarios/canonicalize.ts`
  - Pure canonical JSON normalization. No Node imports.
- Create `shared/lib/scenarios/scenario-input-envelope.ts`
  - Envelope types, constants, and variant normalization helpers.
- Create `server/lib/scenarios/scenario-input-hash.ts`
  - Server-only SHA-256 wrapper around shared canonical string.
- Create `tests/unit/scenarios/scenario-input-hash.test.ts`
  - Stable hash and canonicalization contract tests.
- Modify `server/services/fund-scenario-calculation-service.ts`
  - Replace fee-profile raw JSON hashing with `createScenarioInputHash`.
  - Store canonical hash as `state_hash` and `metadata.input_hash`.
- Modify `server/services/fund-scenario-reserve-calculation-service.ts`
  - Replace reserve raw JSON hashing with `createScenarioInputHash`.
  - Sort variants by `sortOrder`, then `id` through shared envelope helpers.
- Modify `server/services/fund-scenario-reserve-snapshot-store.ts`
  - Extend existing reserve reuse/persist helpers for canonical `state_hash` and
    conflict-safe append-only writes.
  - Store `state_hash` with canonical hash.
- Create `server/db/migrations/0016_fund_scenario_calculation_runs.sql`
  - Drop the old scenario-set overwrite unique index.
  - Add calculation-run table and append-only snapshot dedupe index.
- Modify `shared/schema/fund.ts`
  - Add `fundScenarioCalculationRuns` Drizzle surface.
  - Declare the partial unique indexes used by retention so Drizzle schema and
    raw SQL do not drift.
- Create `server/services/fund-scenario-calculation-run-service.ts`
  - Run acquisition, status transition, and completed-run lookup.
- Modify `server/services/fund-scenario-calculation-service.ts`
  - Extend existing fee-profile `findReusableScenarioSnapshot` and snapshot
    persistence code instead of creating a parallel retention mirror.
- Create `tests/unit/services/fund-scenario-retention.test.ts`
  - Unit-level retention state-machine proof around the existing helper
    entrypoints and the new run service.
- Create `tests/integration/scenarios/scenario-retention-concurrency.test.ts`
  - Postgres-backed concurrency proof for identical and changed input hashes.
- Modify `tests/integration/fund-scenario-reserve-worker.test.ts`
  - Add `0016_fund_scenario_calculation_runs.sql` to `applyScenarioMigrations()`
    or extract the migration list into a shared helper used by all scenario
    integration tests.
- Modify `shared/contracts/fund-scenario-comparison-v1.contract.ts`
  - Add typed comparison-unavailable reason codes.
- Modify `server/services/fund-scenario-comparison-service.ts`
  - Return fail-closed comparison states before full release-gate assertions.
- Modify `client/src/components/fund-results/ScenarioComparisonTable.tsx`
  - Render typed scenario comparison-unavailable copy in the existing
    `statusCopy()` switch.
- Create `tests/integration/scenarios/scenario-release-gate.integration.test.ts`
  - End-to-end scenario lifecycle on real Postgres/Redis.
- Modify `package.json`
  - Add `test:scenario-release-gate`.
- Modify `.github/workflows/ci-unified.yml`
  - Add the release-gate command to an existing Postgres/Redis-backed job if
    workflow impact is acceptable.

---

### Task 1: Release-Lane Discipline Doc

**Files:**

- Create: `docs/plans/scenario-release-lane.md`

- [ ] **Step 1: Write the release-lane policy**

Create `docs/plans/scenario-release-lane.md` with this content:

````markdown
---
status: ACTIVE
last_updated: 2026-05-29
---

# Scenario Release Lane

## Purpose

ADR-022 scenarios are the next release boundary. The lane is release-hardening
work for existing scenario surfaces, not a vehicle for broad refactors,
dependency churn, route rewrites, money utility migration, schema directory
renames, or engine dedupe.

## Current Starting Point

- Fee-profile and reserve-allocation scenario calculations exist.
- Scenario set routes live in `server/routes/fund-scenario-sets.ts`.
- The async reserve lane has a worker-backed status endpoint:
  `GET /api/funds/:fundId/scenario-sets/:scenarioSetId/calculation-status`.
- Results already expose scenario availability through the fund-results read
  model.
- Scenario snapshots currently overwrite by `(fund_id, scenario_set_id)`.
- Scenario input hashes currently depend on raw JSON serialization.

## Release Gate Order

1. Canonical scenario input hashing.
2. Economics fail-closed comparison reasons.
3. Append-only scenario retention and calculation runs.
4. Postgres/Redis/worker scenario release gate.
5. Scenario UX workspace.
6. Override expansion.
7. Reserve optimization.

The full release gate asserts comparison-unavailable semantics, so economics
fail-closed work lands before the full gate. A smaller infrastructure lifecycle
gate may land first if it does not assert typed comparison reasons.

## Compatibility Rules

- Preserve public URLs, auth gates, provider order, persisted keys, request IDs,
  route contracts, and existing compatibility exports.
- Add route-contract tests before adding new route behavior.
- Use existing Pino/logger paths for diagnostics.
- Use canonical fund-store and guard facades; do not create scenario-specific
  mirrors.
- Do not collapse route mounts or split `App` as part of scenario work.
- Do not delete env, Vitest, or TypeScript configs.
- Do not add dependencies.

## Verification Commands

Use current scripts only:

```bash
npm run check
npm run lint
npm run calc-gate
npm run calc-gate:full
npm run validate:core
npm run test:integration
npm run test:integration:routes
npm run docs:routing:check
npm run docs:check-links
git diff --check
```

Do not use retired aliases such as `test:phase4`, `test:phase4:client`, or
`test:wave4`.

## CI Policy

Prefer extending existing Postgres/Redis-backed jobs in
`.github/workflows/ci-unified.yml`. Create a dedicated scenario workflow only if
the unified workflow cannot host the release gate without weakening existing
jobs.

## Migration Policy

ADR-022 SQL migrations currently live under `server/db/migrations/*.sql`.
`npm run db:push` and `scripts/run-migrations.ts` do not apply that directory.
Any PR that adds a new `server/db/migrations/*.sql` file must include:

- Local/integration application proof for that migration.
- Explicit staging/production application instructions using the repo
  `db-migration` path or direct SQL execution against the target database.
- A verification query proving the table/indexes exist after application.

For `0016_fund_scenario_calculation_runs.sql`, apply the migration before the
code path that removes `ON CONFLICT (fund_id, scenario_set_id)` is deployed. Do
not deploy a half-state where the old overwrite index is dropped but the new
conflict-safe code is not live.

````

- [ ] **Step 2: Verify docs formatting**

Run:

```bash
git diff --check
npm run docs:routing:check
````

Expected: both commands exit 0.

- [ ] **Step 3: Commit**

Use the repo Lore Commit Protocol. Suggested intent line:

```text
Constrain scenario release work to compatibility-first hardening
```

Include:

```text
Constraint: ADR-022 scenario work must not reopen unrelated refactor lanes
Rejected: Start with scenario UX | current hash and retention semantics are not release-grade
Confidence: high
Scope-risk: narrow
Tested: npm run docs:routing:check; git diff --check
```

---

### Task 2: Canonical Scenario Input Hash Contract

**Files:**

- Create: `shared/lib/scenarios/canonicalize.ts`
- Create: `shared/lib/scenarios/scenario-input-envelope.ts`
- Create: `server/lib/scenarios/scenario-input-hash.ts`
- Create: `tests/unit/scenarios/scenario-input-hash.test.ts`

- [ ] **Step 1: Write failing canonicalization tests**

Create `tests/unit/scenarios/scenario-input-hash.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  canonicalScenarioInputString,
  normalizeScenarioInputEnvelope,
} from '../../../shared/lib/scenarios/scenario-input-envelope';
import { createScenarioInputHash } from '../../../server/lib/scenarios/scenario-input-hash';

const baseEnvelope = {
  version: 'scenario-input-hash-v1',
  contractVersion: 'fund-scenarios-v1',
  scenarioSetId: '11111111-1111-4111-8111-111111111111',
  sourceConfigId: 42,
  sourceConfigVersion: 7,
  calculationMode: 'sync_fee_profile',
  overrideType: 'fee_profile',
  engineVersion: 'fund-scenarios-v1',
  variants: [
    {
      variantId: '22222222-2222-4222-8222-222222222222',
      sortOrder: 2,
      override: {
        managementFeeRateDecimal: '0.0200',
        nested: { b: 2, a: 1 },
        omitted: undefined,
      },
    },
    {
      variantId: '33333333-3333-4333-8333-333333333333',
      sortOrder: 1,
      override: {
        carryRateDecimal: '0.2000',
        amountCents: 123456n,
      },
    },
  ],
} as const;

describe('scenario input hash canonicalization', () => {
  it('hashes object key order and nested key order identically', () => {
    const reordered = {
      ...baseEnvelope,
      variants: [
        {
          variantId: '22222222-2222-4222-8222-222222222222',
          sortOrder: 2,
          override: {
            nested: { a: 1, b: 2 },
            omitted: undefined,
            managementFeeRateDecimal: '0.0200',
          },
        },
        baseEnvelope.variants[1],
      ],
    };

    expect(createScenarioInputHash(baseEnvelope)).toBe(
      createScenarioInputHash(reordered)
    );
  });

  it('sorts variants by sortOrder then variantId', () => {
    const reversed = {
      ...baseEnvelope,
      variants: [...baseEnvelope.variants].reverse(),
    };

    expect(canonicalScenarioInputString(reversed)).toBe(
      canonicalScenarioInputString(baseEnvelope)
    );
  });

  it('normalizes undefined object properties as omitted while preserving null', () => {
    const omitted = {
      ...baseEnvelope,
      variants: [
        {
          ...baseEnvelope.variants[0],
          override: {
            managementFeeRateDecimal: '0.0200',
            nested: { b: 2, a: 1 },
          },
        },
        baseEnvelope.variants[1],
      ],
    };
    const withNull = {
      ...baseEnvelope,
      variants: [
        {
          ...baseEnvelope.variants[0],
          override: {
            managementFeeRateDecimal: '0.0200',
            nested: { b: 2, a: 1 },
            omitted: null,
          },
        },
        baseEnvelope.variants[1],
      ],
    };

    expect(createScenarioInputHash(baseEnvelope)).toBe(
      createScenarioInputHash(omitted)
    );
    expect(createScenarioInputHash(baseEnvelope)).not.toBe(
      createScenarioInputHash(withNull)
    );
  });

  it('normalizes bigint cents and decimal strings deterministically', () => {
    const normalized = normalizeScenarioInputEnvelope(baseEnvelope);

    expect(normalized.variants[1]?.override).toMatchObject({
      amountCents: '123456',
      carryRateDecimal: '0.2000',
    });
  });

  it('changes hash when governance fields change', () => {
    expect(createScenarioInputHash(baseEnvelope)).not.toBe(
      createScenarioInputHash({ ...baseEnvelope, sourceConfigVersion: 8 })
    );
    expect(createScenarioInputHash(baseEnvelope)).not.toBe(
      createScenarioInputHash({
        ...baseEnvelope,
        engineVersion: 'fund-scenarios-v2',
      })
    );
    expect(createScenarioInputHash(baseEnvelope)).not.toBe(
      createScenarioInputHash({
        ...baseEnvelope,
        calculationMode: 'async_reserve_allocation',
        overrideType: 'reserve_allocation',
      })
    );
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npx vitest run --config vitest.config.mjs --configLoader native tests/unit/scenarios/scenario-input-hash.test.ts --project=server
```

Expected: FAIL because the new modules do not exist.

- [ ] **Step 3: Add pure canonicalization**

Create `shared/lib/scenarios/canonicalize.ts`:

```ts
type CanonicalPrimitive = string | number | boolean | null;
type CanonicalValue =
  | CanonicalPrimitive
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

function normalizeNumber(value: number): number {
  if (!Number.isFinite(value)) {
    throw new TypeError(
      'Scenario input hash cannot canonicalize non-finite numbers'
    );
  }
  return Object.is(value, -0) ? 0 : value;
}

export function canonicalizeScenarioValue(
  value: unknown
): CanonicalValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return normalizeNumber(value);

  if (Array.isArray(value)) {
    return value.map((item) => {
      const normalized = canonicalizeScenarioValue(item);
      return normalized === undefined ? null : normalized;
    });
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const normalized: Record<string, CanonicalValue> = {};
    for (const key of Object.keys(record).sort()) {
      const child = canonicalizeScenarioValue(record[key]);
      if (child !== undefined) {
        normalized[key] = child;
      }
    }
    return normalized;
  }

  throw new TypeError(
    `Scenario input hash cannot canonicalize ${typeof value}`
  );
}

export function canonicalJson(value: unknown): string {
  const normalized = canonicalizeScenarioValue(value);
  return JSON.stringify(normalized === undefined ? null : normalized);
}
```

- [ ] **Step 4: Add scenario envelope helpers**

Create `shared/lib/scenarios/scenario-input-envelope.ts`:

```ts
import { canonicalJson, canonicalizeScenarioValue } from './canonicalize';

export const SCENARIO_INPUT_HASH_VERSION = 'scenario-input-hash-v1' as const;
export const FUND_SCENARIOS_CONTRACT_VERSION = 'fund-scenarios-v1' as const;

export type ScenarioInputCalculationMode =
  | 'sync_fee_profile'
  | 'async_reserve_allocation';
export type ScenarioInputOverrideType = 'fee_profile' | 'reserve_allocation';

export interface ScenarioInputHashEnvelopeV1 {
  version: typeof SCENARIO_INPUT_HASH_VERSION;
  contractVersion: typeof FUND_SCENARIOS_CONTRACT_VERSION;
  scenarioSetId: string;
  sourceConfigId: number;
  sourceConfigVersion: number;
  calculationMode: ScenarioInputCalculationMode;
  overrideType: ScenarioInputOverrideType;
  engineVersion: string;
  variants: Array<{
    variantId: string;
    sortOrder: number;
    override: unknown;
  }>;
}

export function normalizeScenarioInputEnvelope(
  envelope: ScenarioInputHashEnvelopeV1
) {
  return {
    version: envelope.version,
    contractVersion: envelope.contractVersion,
    scenarioSetId: envelope.scenarioSetId,
    sourceConfigId: envelope.sourceConfigId,
    sourceConfigVersion: envelope.sourceConfigVersion,
    calculationMode: envelope.calculationMode,
    overrideType: envelope.overrideType,
    engineVersion: envelope.engineVersion,
    variants: [...envelope.variants]
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.variantId.localeCompare(b.variantId)
      )
      .map((variant) => ({
        variantId: variant.variantId,
        sortOrder: variant.sortOrder,
        override: canonicalizeScenarioValue(variant.override) ?? null,
      })),
  };
}

export function canonicalScenarioInputString(
  envelope: ScenarioInputHashEnvelopeV1
): string {
  return canonicalJson(normalizeScenarioInputEnvelope(envelope));
}
```

- [ ] **Step 5: Add server-only hash wrapper**

Create `server/lib/scenarios/scenario-input-hash.ts`:

```ts
import { createHash } from 'node:crypto';
import {
  canonicalScenarioInputString,
  type ScenarioInputHashEnvelopeV1,
} from '@shared/lib/scenarios/scenario-input-envelope';

export function createScenarioInputHash(
  envelope: ScenarioInputHashEnvelopeV1
): string {
  return createHash('sha256')
    .update(canonicalScenarioInputString(envelope))
    .digest('hex');
}
```

- [ ] **Step 6: Run the canonicalization tests**

Run:

```bash
npx vitest run --config vitest.config.mjs --configLoader native tests/unit/scenarios/scenario-input-hash.test.ts --project=server
```

Expected: PASS.

- [ ] **Step 7: Commit**

Use Lore Commit Protocol. Suggested intent line:

```text
Make scenario input identity independent of JSON insertion order
```

Include:

```text
Constraint: Hashing must be stable across fee-profile and reserve scenario lanes
Rejected: Put node:crypto in shared/lib | shared code is also reachable from browser bundles
Confidence: high
Scope-risk: moderate
Tested: npx vitest run --config vitest.config.mjs --configLoader native tests/unit/scenarios/scenario-input-hash.test.ts --project=server
```

---

### Task 3: Migrate Existing Hash Call Sites

**Files:**

- Modify: `server/services/fund-scenario-calculation-service.ts`
- Modify: `server/services/fund-scenario-reserve-calculation-service.ts`
- Modify: `tests/unit/services/fund-scenario-calculation-service.test.ts`
- Modify:
  `tests/unit/services/fund-scenario-reserve-calculation-service.test.ts`

- [ ] **Step 1: Extend fee-profile tests to assert stable hash fields**

In `tests/unit/services/fund-scenario-calculation-service.test.ts`, replace
expectations that only assert `JSON.stringify` input shape with assertions that
the stored metadata contains:

```ts
expect(snapshotMetadata).toMatchObject({
  input_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
  calculation_mode: 'sync_fee_profile',
  override_type: 'fee_profile',
});
```

Also assert the insert SQL includes `state_hash`:

```ts
const snapshotInsertSql = queryMock.mock.calls
  .map((call) => String(call[0]))
  .find((sql) => sql.includes('INSERT INTO fund_snapshots'));
expect(snapshotInsertSql).toContain('state_hash');
```

- [ ] **Step 2: Extend reserve hash test to cover sortOrder then id**

In `tests/unit/services/fund-scenario-reserve-calculation-service.test.ts`, use
variants with IDs in reverse lexical order and `sortOrder` in business order:

```ts
const first = createReserveScenarioInputHash({
  fundId: 1,
  scenarioSetId: '11111111-1111-4111-8111-111111111111',
  sourceConfigId: 2,
  sourceConfigVersion: 3,
  calcVersion: 'fund-scenarios-v1',
  calculationMode: 'async_reserve_allocation',
  variants: [
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      sortOrder: 1,
      override: { b: 2, a: 1 },
    },
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sortOrder: 2,
      override: { amountCents: 1000 },
    },
  ],
});
const second = createReserveScenarioInputHash({
  fundId: 1,
  scenarioSetId: '11111111-1111-4111-8111-111111111111',
  sourceConfigId: 2,
  sourceConfigVersion: 3,
  calcVersion: 'fund-scenarios-v1',
  calculationMode: 'async_reserve_allocation',
  variants: [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sortOrder: 2,
      override: { amountCents: 1000 },
    },
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      sortOrder: 1,
      override: { a: 1, b: 2 },
    },
  ],
});

expect(first).toBe(second);
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
npx vitest run --config vitest.config.mjs --configLoader native tests/unit/services/fund-scenario-calculation-service.test.ts tests/unit/services/fund-scenario-reserve-calculation-service.test.ts --project=server
```

Expected: FAIL because current services use raw JSON hashing and do not include
`state_hash` in scenario inserts.

- [ ] **Step 4: Replace fee-profile hash implementation**

In `server/services/fund-scenario-calculation-service.ts`:

```ts
import {
  FUND_SCENARIOS_CONTRACT_VERSION,
  SCENARIO_INPUT_HASH_VERSION,
} from '@shared/lib/scenarios/scenario-input-envelope';
import { createScenarioInputHash } from '../lib/scenarios/scenario-input-hash';
```

Delete the local `createInputHash` helper. Build the hash as:

```ts
const inputHash = createScenarioInputHash({
  version: SCENARIO_INPUT_HASH_VERSION,
  contractVersion: FUND_SCENARIOS_CONTRACT_VERSION,
  scenarioSetId,
  sourceConfigId: sourceConfig.id,
  sourceConfigVersion: sourceConfig.version,
  calculationMode: 'sync_fee_profile',
  overrideType: 'fee_profile',
  engineVersion: FUND_SCENARIO_CALC_VERSION,
  variants: scenarioSet.variants.map((variant) => ({
    variantId: variant.id,
    sortOrder: variant.sortOrder,
    override: variant.override,
  })),
});
```

Update the snapshot insert to include `state_hash`:

```sql
state_hash,
scenario_set_id
```

and pass `inputHash` into the value list before `scenario_set_id`.

- [ ] **Step 5: Replace reserve hash implementation**

In `server/services/fund-scenario-reserve-calculation-service.ts`, import the
shared constants and server hash wrapper. Change the exported input type to
include `sortOrder`:

```ts
variants: Array<{
  id: string;
  sortOrder: number;
  override: unknown;
}>;
```

Replace the raw JSON body with:

```ts
return createScenarioInputHash({
  version: SCENARIO_INPUT_HASH_VERSION,
  contractVersion: FUND_SCENARIOS_CONTRACT_VERSION,
  scenarioSetId: input.scenarioSetId,
  sourceConfigId: input.sourceConfigId,
  sourceConfigVersion: input.sourceConfigVersion,
  calculationMode: input.calculationMode,
  overrideType: 'reserve_allocation',
  engineVersion: input.calcVersion,
  variants: input.variants.map((variant) => ({
    variantId: variant.id,
    sortOrder: variant.sortOrder,
    override: variant.override,
  })),
});
```

At the call site, pass `sortOrder` from each loaded scenario variant.

- [ ] **Step 6: Run migrated call-site tests**

Run:

```bash
npx vitest run --config vitest.config.mjs --configLoader native tests/unit/services/fund-scenario-calculation-service.test.ts tests/unit/services/fund-scenario-reserve-calculation-service.test.ts tests/unit/scenarios/scenario-input-hash.test.ts --project=server
```

Expected: PASS.

- [ ] **Step 7: Commit**

Suggested intent line:

```text
Route existing scenario lanes through canonical input identity
```

Include:

```text
Constraint: Existing fee-profile and reserve behavior must stay compatible while hash semantics stabilize
Rejected: Keep reserve sorting by id only | schema already models variant order explicitly
Confidence: high
Scope-risk: moderate
Tested: targeted scenario hash and service tests
```

---

### Task 4: Economics Fail-Closed Comparison Reasons

**Files:**

- Modify: `shared/contracts/fund-scenario-comparison-v1.contract.ts`
- Modify: `server/services/fund-scenario-comparison-service.ts`
- Modify: `client/src/components/fund-results/ScenarioComparisonTable.tsx`
- Modify: `tests/unit/contract/fund-scenario-comparison-v1.contract.test.ts`
- Modify: `tests/unit/services/fund-scenario-comparison-service.test.ts`
- Modify: `tests/unit/components/fund-results/ScenarioComparisonTable.test.tsx`

- [ ] **Step 1: Write contract test for typed unavailable reasons**

Add this assertion to
`tests/unit/contract/fund-scenario-comparison-v1.contract.test.ts`:

```ts
expect(
  FundScenarioComparisonV1Schema.parse({
    fundId: 1,
    comparisonStatus: 'baseline_unavailable',
    unavailableReason: 'BASELINE_ECONOMICS_SNAPSHOT_MISSING',
    scenarioSet: {
      scenarioSetId: '11111111-1111-4111-8111-111111111111',
      name: 'Fee profile scenario',
      sourceConfigId: 10,
      sourceConfigVersion: 3,
    },
    baseline: null,
    variants: [],
    staleness: null,
  }).unavailableReason
).toBe('BASELINE_ECONOMICS_SNAPSHOT_MISSING');
```

- [ ] **Step 2: Add contract field**

In `shared/contracts/fund-scenario-comparison-v1.contract.ts`, add:

```ts
export const ScenarioComparisonUnavailableReasonV1Schema = z.enum([
  'ECONOMICS_DISABLED',
  'ECONOMICS_ASSUMPTIONS_MISSING',
  'BASELINE_ECONOMICS_SNAPSHOT_MISSING',
  'BASELINE_ECONOMICS_SNAPSHOT_STALE',
  'VARIANT_ECONOMICS_FAILED',
  'SOURCE_CONFIG_STALE_UNPINNED',
  'UNSUPPORTED_OVERRIDE_TYPE',
]);
```

Add to `FundScenarioComparisonV1Schema`:

```ts
unavailableReason: ScenarioComparisonUnavailableReasonV1Schema.nullable().optional(),
```

Export the inferred type:

```ts
export type ScenarioComparisonUnavailableReasonV1 = z.infer<
  typeof ScenarioComparisonUnavailableReasonV1Schema
>;
```

- [ ] **Step 3: Update service fail-closed mapping**

In `server/services/fund-scenario-comparison-service.ts`, return:

```ts
{
  comparisonStatus: 'baseline_unavailable',
  unavailableReason: 'BASELINE_ECONOMICS_SNAPSHOT_MISSING',
  baseline: null,
  variants: [],
}
```

when baseline economics cannot be found, and:

```ts
{
  comparisonStatus: 'unsupported_override_type',
  unavailableReason: 'UNSUPPORTED_OVERRIDE_TYPE',
  baseline: null,
  variants: [],
}
```

for non-fee-profile override types until reserve comparison is explicitly
supported.

- [ ] **Step 4: Update client copy**

In `client/src/components/fund-results/ScenarioComparisonTable.tsx`, extend the
existing `statusCopy()` switch. Do not put this mapping in
`client/src/pages/fund-model-results.tsx`; that page delegates scenario
comparison rendering to `ScenarioComparisonTable`, and its other comparison
states are for the publish-version comparison contract.

```ts
const SCENARIO_COMPARISON_UNAVAILABLE_COPY = {
  ECONOMICS_DISABLED:
    'Scenario comparison unavailable because economics is disabled.',
  ECONOMICS_ASSUMPTIONS_MISSING:
    'Scenario comparison unavailable because economics assumptions are missing.',
  BASELINE_ECONOMICS_SNAPSHOT_MISSING:
    'Scenario calculated; comparison unavailable because baseline economics is missing.',
  BASELINE_ECONOMICS_SNAPSHOT_STALE:
    'Scenario calculated; comparison stale because baseline economics belongs to an older config.',
  VARIANT_ECONOMICS_FAILED:
    'Scenario calculated; comparison unavailable because variant economics failed.',
  SOURCE_CONFIG_STALE_UNPINNED:
    'Scenario comparison unavailable because the source config is stale.',
  UNSUPPORTED_OVERRIDE_TYPE:
    'Scenario comparison unavailable for this override type.',
} as const;

function statusCopy(comparison: FundScenarioComparisonV1) {
  if (comparison.unavailableReason) {
    return SCENARIO_COMPARISON_UNAVAILABLE_COPY[comparison.unavailableReason];
  }
  if (comparison.comparisonStatus === 'no_scenario_results') {
    return 'Calculate this scenario set to compare it with the authoritative economics baseline.';
  }
  if (comparison.comparisonStatus === 'baseline_unavailable') {
    return `Authoritative economics baseline is unavailable for source config v${comparison.scenarioSet.sourceConfigVersion}.`;
  }
  if (comparison.comparisonStatus === 'unsupported_override_type') {
    return 'Scenario comparison is not supported for reserve-allocation scenario sets yet.';
  }
  return 'Scenario comparison is unavailable.';
}
```

Add or update a component test in
`tests/unit/components/fund-results/ScenarioComparisonTable.test.tsx`:

```ts
it('renders typed baseline economics unavailable copy', () => {
  render(
    <ScenarioComparisonTable
      comparison={{
        ...baselineUnavailableComparison(),
        unavailableReason: 'BASELINE_ECONOMICS_SNAPSHOT_MISSING',
      }}
    />
  );

  expect(
    screen.getByText('Scenario calculated; comparison unavailable because baseline economics is missing.')
  ).toBeInTheDocument();
});
```

- [ ] **Step 5: Run comparison tests**

Run:

```bash
npx vitest run --config vitest.config.mjs --configLoader native tests/unit/contract/fund-scenario-comparison-v1.contract.test.ts tests/unit/services/fund-scenario-comparison-service.test.ts tests/unit/components/fund-results/ScenarioComparisonTable.test.tsx --project=server --project=client
```

Expected: PASS.

- [ ] **Step 6: Commit**

Suggested intent line:

```text
Make scenario comparison failures explicit before release gating
```

Include:

```text
Constraint: The full scenario release gate asserts typed comparison-unavailable states
Rejected: Keep only baseline_unavailable | users and tests cannot distinguish disabled, missing, stale, and unsupported states
Confidence: high
Scope-risk: moderate
Tested: contract, service, and ScenarioComparisonTable component tests
```

---

### Task 5: Append-Only Scenario Retention And Calculation Runs

**Files:**

- Create: `server/db/migrations/0016_fund_scenario_calculation_runs.sql`
- Modify: `shared/schema/fund.ts`
- Create: `server/services/fund-scenario-calculation-run-service.ts`
- Modify: `server/services/fund-scenario-calculation-service.ts`
- Modify: `server/services/fund-scenario-reserve-snapshot-store.ts`
- Create: `tests/unit/services/fund-scenario-retention.test.ts`
- Create: `tests/integration/scenarios/scenario-retention-concurrency.test.ts`
- Modify: `tests/integration/fund-scenario-reserve-worker.test.ts`
- Modify: `tests/unit/phase3/fund-scenario-sets-schema.test.ts`
- Modify: `docs/plans/scenario-release-lane.md`

- [ ] **Step 1: Write schema and migration tests first**

In `tests/unit/phase3/fund-scenario-sets-schema.test.ts`, keep the existing
`0014` audit-visible calculated-event test as-is and add a new test that reads
`server/db/migrations/0016_fund_scenario_calculation_runs.sql`:

```ts
it('calculation-run migration replaces scenario-set overwrite with append-only dedupe', async () => {
  const migration = await readRepoFile(
    'server/db/migrations/0016_fund_scenario_calculation_runs.sql'
  );

  expect(migration).toContain(
    'DROP INDEX IF EXISTS fund_snapshots_scenario_set_calculation_unique'
  );
  expect(migration).toContain(
    'CREATE TABLE IF NOT EXISTS fund_scenario_calculation_runs'
  );
  expect(migration).toContain('fund_scenario_calc_runs_active_dedup_idx');
  expect(migration).toContain('fund_snapshots_scenarios_dedup_idx');
});
```

- [ ] **Step 2: Add migration**

Create `server/db/migrations/0016_fund_scenario_calculation_runs.sql`:

```sql
-- 0016_fund_scenario_calculation_runs.sql
-- ADR-022: append-only scenario retention and calculation-run governance.

BEGIN;

DROP INDEX IF EXISTS fund_snapshots_scenario_set_calculation_unique;

CREATE TABLE IF NOT EXISTS fund_scenario_calculation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id integer NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  scenario_set_id uuid NOT NULL REFERENCES fund_scenario_sets(id) ON DELETE CASCADE,
  source_config_id integer NOT NULL REFERENCES fundconfigs(id),
  source_config_version integer NOT NULL,
  calculation_mode varchar(48) NOT NULL,
  override_type varchar(48) NOT NULL,
  input_hash varchar(64) NOT NULL,
  job_id text,
  correlation_id varchar(36) NOT NULL,
  status varchar(24) NOT NULL,
  snapshot_id integer REFERENCES fund_snapshots(id),
  failure_code varchar(80),
  failure_message text,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS fund_scenario_calc_runs_active_dedup_idx
  ON fund_scenario_calculation_runs (
    scenario_set_id,
    source_config_id,
    source_config_version,
    input_hash
  )
  WHERE status IN ('queued', 'running', 'completed');

CREATE UNIQUE INDEX IF NOT EXISTS fund_snapshots_scenarios_dedup_idx
  ON fund_snapshots (
    fund_id,
    scenario_set_id,
    config_id,
    config_version,
    state_hash
  )
  WHERE type = 'SCENARIOS'
    AND scenario_set_id IS NOT NULL
    AND config_id IS NOT NULL
    AND config_version IS NOT NULL
    AND state_hash IS NOT NULL;

COMMIT;
```

- [ ] **Step 3: Wire the migration into test setup and delivery docs**

In `tests/integration/fund-scenario-reserve-worker.test.ts`, add
`0016_fund_scenario_calculation_runs.sql` to `applyScenarioMigrations()` before
any new retention or release-gate integration test reuses that setup:

```ts
for (const file of [
  '0012_scenario_set_id.sql',
  '0013_fund_scenario_sets.sql',
  '0014_fund_scenario_calculated_event.sql',
  '0015_fund_scenario_reserve_allocation.sql',
  '0016_fund_scenario_calculation_runs.sql',
]) {
  const sql = await fs.readFile(
    path.join(process.cwd(), 'server/db/migrations', file),
    'utf8'
  );
  await pool.query(sql);
}
```

If the new tests move migration setup into a shared helper, the shared helper
must still include `0016`.

Update `docs/plans/scenario-release-lane.md` with the production/staging
migration instruction:

````markdown
`0016_fund_scenario_calculation_runs.sql` is a raw ADR-022 migration under
`server/db/migrations/`. It is not applied by `npm run db:push` or
`scripts/run-migrations.ts`. Apply it through the repo `db-migration` release
lane or by executing the SQL file directly against the target database before
deploying the code that removes the old scenario-set upsert.

Verification query:

```sql
SELECT to_regclass('public.fund_scenario_calculation_runs') AS runs_table,
       to_regclass('public.fund_scenario_calc_runs_active_dedup_idx') AS runs_idx,
       to_regclass('public.fund_snapshots_scenarios_dedup_idx') AS snapshots_idx;
```
````
````

- [ ] **Step 4: Add Drizzle schema surface and index parity**

In `shared/schema/fund.ts`, first extend the existing `fundSnapshots` table
callback with the same append-only dedupe index as the raw SQL migration:

```ts
scenarioDedupeIdx: uniqueIndex('fund_snapshots_scenarios_dedup_idx')
  .on(table.fundId, table.scenarioSetId, table.configId, table.configVersion, table.stateHash)
  .where(sql`
    ${table.type} = 'SCENARIOS'
    AND ${table.scenarioSetId} IS NOT NULL
    AND ${table.configId} IS NOT NULL
    AND ${table.configVersion} IS NOT NULL
    AND ${table.stateHash} IS NOT NULL
  `),
```

Then add after `fundScenarioSetEvents`:

```ts
export const fundScenarioCalculationRuns = pgTable(
  'fund_scenario_calculation_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    scenarioSetId: uuid('scenario_set_id')
      .notNull()
      .references(() => fundScenarioSets.id, { onDelete: 'cascade' }),
    sourceConfigId: integer('source_config_id')
      .notNull()
      .references(() => fundConfigs.id),
    sourceConfigVersion: integer('source_config_version').notNull(),
    calculationMode: varchar('calculation_mode', { length: 48 }).notNull(),
    overrideType: varchar('override_type', { length: 48 }).notNull(),
    inputHash: varchar('input_hash', { length: 64 }).notNull(),
    jobId: text('job_id'),
    correlationId: varchar('correlation_id', { length: 36 }).notNull(),
    status: varchar('status', { length: 24 }).notNull(),
    snapshotId: integer('snapshot_id').references(() => fundSnapshots.id),
    failureCode: varchar('failure_code', { length: 80 }),
    failureMessage: text('failure_message'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    runLookupIdx: index('fund_scenario_calc_runs_lookup_idx').on(
      table.fundId,
      table.scenarioSetId,
      table.createdAt.desc()
    ),
    activeDedupeIdx: uniqueIndex('fund_scenario_calc_runs_active_dedup_idx')
      .on(
        table.scenarioSetId,
        table.sourceConfigId,
        table.sourceConfigVersion,
        table.inputHash
      )
      .where(sql`${table.status} IN ('queued', 'running', 'completed')`),
  })
);
```

Run `npm run validate:schema-drift` after this task. If Drizzle cannot represent
one of the partial indexes exactly, leave the raw SQL migration authoritative
and add a narrow schema-drift test that asserts the raw migration contains the
required partial index predicate.

- [ ] **Step 5: Write retention unit tests**

Create `tests/unit/services/fund-scenario-retention.test.ts` with tests for the
existing helper entrypoints. The purpose is to force the implementation to
extend `fund-scenario-calculation-service.ts` and
`fund-scenario-reserve-snapshot-store.ts`, not create a third parallel lookup
module.

```ts
it('fee-profile snapshot insert is conflict-safe on canonical state_hash', async () => {
  const queryMock = vi.fn().mockResolvedValue({
    rows: [
      {
        id: 101,
        payload: scenarioPayload,
        correlation_id: 'rid-1',
        created_at: new Date(),
        snapshot_time: new Date(),
      },
    ],
  });

  await persistFeeProfileScenarioSnapshotForTest(
    { query: queryMock } as never,
    snapshotInput
  );

  const insertSql = queryMock.mock.calls
    .map((call) => String(call[0]))
    .find((sql) => sql.includes('INSERT INTO fund_snapshots'));
  expect(insertSql).toContain('state_hash');
  expect(insertSql).toContain('ON CONFLICT');
  expect(insertSql).toContain('fund_snapshots_scenarios_dedup_idx');
});

it('reserve snapshot insert is conflict-safe on canonical state_hash', async () => {
  const queryMock = vi.fn().mockResolvedValue({
    rows: [
      {
        id: 202,
        payload: reservePayload,
        correlation_id: 'rid-2',
        created_at: new Date(),
        snapshot_time: new Date(),
      },
    ],
  });

  await persistReserveScenarioSnapshot(
    { query: queryMock } as never,
    reserveSnapshotInput
  );

  const insertSql = queryMock.mock.calls
    .map((call) => String(call[0]))
    .find((sql) => sql.includes('INSERT INTO fund_snapshots'));
  expect(insertSql).toContain('state_hash');
  expect(insertSql).toContain('ON CONFLICT');
});

it('allows retry after failed run because failed is excluded from active dedupe', async () => {
  const queryMock = vi
    .fn()
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({
      rows: [{ id: 'run-2', status: 'queued', snapshot_id: null }],
    });

  const run = await acquireScenarioCalculationRun(
    { query: queryMock } as never,
    calculationIdentity
  );

  expect(run.status).toBe('queued');
});
```

If `persistFeeProfileScenarioSnapshotForTest` does not exist yet, extract the
existing fee-profile snapshot insert into an exported testable helper from
`server/services/fund-scenario-calculation-service.ts`. Keep the production
entrypoint unchanged.

- [ ] **Step 6: Add calculation-run service API**

Create `server/services/fund-scenario-calculation-run-service.ts` with these
exported functions:

```ts
export interface ScenarioCalculationRunIdentity {
  fundId: number;
  scenarioSetId: string;
  sourceConfigId: number;
  sourceConfigVersion: number;
  calculationMode: 'sync_fee_profile' | 'async_reserve_allocation';
  overrideType: 'fee_profile' | 'reserve_allocation';
  inputHash: string;
  correlationId: string;
  jobId?: string | null;
}

export interface ScenarioCalculationRunRecord extends ScenarioCalculationRunIdentity {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  snapshotId: number | null;
}

export async function findCompletedScenarioRun(
  client: { query: Function },
  identity: Omit<ScenarioCalculationRunIdentity, 'correlationId' | 'jobId'>
): Promise<ScenarioCalculationRunRecord | null> {
  const result = await client.query(
    `SELECT *
       FROM fund_scenario_calculation_runs
      WHERE scenario_set_id = $1
        AND source_config_id = $2
        AND source_config_version = $3
        AND input_hash = $4
        AND status = 'completed'
        AND snapshot_id IS NOT NULL
      ORDER BY completed_at DESC, created_at DESC
      LIMIT 1`,
    [
      identity.scenarioSetId,
      identity.sourceConfigId,
      identity.sourceConfigVersion,
      identity.inputHash,
    ]
  );
  return result.rows[0] ?? null;
}
```

Then add acquisition and completion helpers. Because the active dedupe is a
partial unique index, do not use `ON CONFLICT ON CONSTRAINT` unless the
implementation changes to a named constraint. Use
`INSERT ... ON CONFLICT (...) WHERE status IN (...) DO NOTHING RETURNING *`,
then re-select the active row when the insert returns no rows:

```ts
export async function acquireScenarioCalculationRun(
  client: { query: Function },
  identity: ScenarioCalculationRunIdentity
): Promise<ScenarioCalculationRunRecord> {
  const insert = await client.query(
    `INSERT INTO fund_scenario_calculation_runs (
       fund_id,
       scenario_set_id,
       source_config_id,
       source_config_version,
       calculation_mode,
       override_type,
       input_hash,
       job_id,
       correlation_id,
       status,
       created_at,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'queued', NOW(), NOW())
     ON CONFLICT (scenario_set_id, source_config_id, source_config_version, input_hash)
       WHERE status IN ('queued', 'running', 'completed')
     DO NOTHING
     RETURNING *`,
    [
      identity.fundId,
      identity.scenarioSetId,
      identity.sourceConfigId,
      identity.sourceConfigVersion,
      identity.calculationMode,
      identity.overrideType,
      identity.inputHash,
      identity.jobId ?? null,
      identity.correlationId,
    ]
  );
  if (insert.rows[0]) return insert.rows[0];

  const existing = await client.query(
    `SELECT *
       FROM fund_scenario_calculation_runs
      WHERE scenario_set_id = $1
        AND source_config_id = $2
        AND source_config_version = $3
        AND input_hash = $4
        AND status IN ('queued', 'running', 'completed')
      ORDER BY created_at DESC
      LIMIT 1`,
    [
      identity.scenarioSetId,
      identity.sourceConfigId,
      identity.sourceConfigVersion,
      identity.inputHash,
    ]
  );
  return existing.rows[0];
}
```

- [ ] **Step 7: Refactor existing scenario snapshot helpers**

Do not create `server/services/fund-scenario-retention-service.ts` with another
`findReusableScenarioSnapshot` export. Extend the existing helpers instead:

- `server/services/fund-scenario-calculation-service.ts`
  - Keep the existing fee-profile `findReusableScenarioSnapshot` name.
  - Change its lookup from `metadata ->> 'input_hash' = $6` to `state_hash = $6`
    while leaving `metadata.input_hash` populated for compatibility.
  - Extract the current fee-profile snapshot insert into a helper such as
    `persistFeeProfileScenarioSnapshot`.
- `server/services/fund-scenario-reserve-snapshot-store.ts`
  - Keep `findReusableReserveScenarioSnapshot`.
  - Change its lookup to `state_hash = $6`.
  - Update `persistReserveScenarioSnapshot` in place.

Both persist helpers must use conflict-safe insert/reselect on
`fund_snapshots_scenarios_dedup_idx` semantics:

```ts
export interface ScenarioSnapshotInsertInput {
  fundId: number;
  scenarioSetId: string;
  sourceConfigId: number;
  sourceConfigVersion: number;
  inputHash: string;
  calcVersion: string;
  correlationId: string;
  payload: unknown;
  metadata: Record<string, unknown>;
}

export async function persistScenarioSnapshotWithDedupe(
  client: { query: Function },
  input: ScenarioSnapshotInsertInput
) {
  const result = await client.query(
    `WITH inserted AS (
       INSERT INTO fund_snapshots (
       fund_id,
       type,
       payload,
       calc_version,
       correlation_id,
       metadata,
       snapshot_time,
       config_id,
       config_version,
       state_hash,
       scenario_set_id
     )
     VALUES ($1, 'SCENARIOS', $2, $3, $4, $5, NOW(), $6, $7, $8, $9)
     ON CONFLICT (fund_id, scenario_set_id, config_id, config_version, state_hash)
       WHERE type = 'SCENARIOS'
         AND scenario_set_id IS NOT NULL
         AND config_id IS NOT NULL
         AND config_version IS NOT NULL
         AND state_hash IS NOT NULL
     DO NOTHING
     RETURNING id, payload, correlation_id, created_at, snapshot_time
     )
     SELECT id, payload, correlation_id, created_at, snapshot_time FROM inserted
     UNION ALL
     SELECT id, payload, correlation_id, created_at, snapshot_time
       FROM fund_snapshots
      WHERE fund_id = $1
        AND scenario_set_id = $9
        AND config_id = $6
        AND config_version = $7
        AND state_hash = $8
        AND type = 'SCENARIOS'
      ORDER BY created_at DESC
      LIMIT 1`,
    [
      input.fundId,
      input.payload,
      input.calcVersion,
      input.correlationId,
      { ...input.metadata, input_hash: input.inputHash },
      input.sourceConfigId,
      input.sourceConfigVersion,
      input.inputHash,
      input.scenarioSetId,
    ]
  );
  return result.rows[0];
}
```

- [ ] **Step 8: Replace service overwrite writes**

In both scenario calculation services:

- Check the existing fee-profile or reserve reusable-snapshot helper before
  calculation when inputs are identical and a completed snapshot exists.
- Acquire or attach to a calculation run before expensive calculation.
- Persist scenario snapshots only through the extended conflict-safe
  fee-profile/reserve persist helpers.
- Link the completed run to `snapshot_id`.
- Remove `ON CONFLICT (fund_id, scenario_set_id)` from scenario snapshot writes.
- Do not remove conflict handling entirely; the replacement conflict target must
  be canonical `state_hash` plus fund, scenario set, config id, and config
  version.

- [ ] **Step 9: Add Postgres concurrency test**

Create `tests/integration/scenarios/scenario-retention-concurrency.test.ts`
with:

```ts
it('collapses concurrent identical fee-profile requests to one completed run and one snapshot', async () => {
  const requests = Array.from({ length: 50 }, () =>
    request(app)
      .post(`/api/funds/${fundId}/scenario-sets/${scenarioSetId}/calculate`)
      .send({})
  );
  const responses = await Promise.all(requests);
  expect(
    new Set(responses.map((response) => response.body.snapshotId)).size
  ).toBe(1);
});

it('appends a new snapshot when canonical input hash changes', async () => {
  const first = await calculateFeeProfileScenario({
    managementFeeRateDecimal: '0.0200',
  });
  const second = await calculateFeeProfileScenario({
    managementFeeRateDecimal: '0.0210',
  });
  expect(second.snapshotId).not.toBe(first.snapshotId);
});
```

Use existing integration helpers from
`tests/integration/fund-scenario-reserve-worker.test.ts` for database setup and
route registration.

- [ ] **Step 10: Run retention verification**

Run:

```bash
npx vitest run --config vitest.config.mjs --configLoader native tests/unit/phase3/fund-scenario-sets-schema.test.ts tests/unit/services/fund-scenario-retention.test.ts --project=server
npx vitest run -c vitest.config.int.ts tests/integration/scenarios/scenario-retention-concurrency.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit**

Suggested intent line:

```text
Preserve scenario history while deduping identical calculations
```

Include:

```text
Constraint: Existing scenario snapshots overwrite by scenario set and must become append-only by canonical input hash
Rejected: Keep ON CONFLICT (fund_id, scenario_set_id) | changed inputs would keep replacing prior scenario evidence
Confidence: medium
Scope-risk: broad
Tested: schema, retention unit, and Postgres concurrency tests
```

---

### Task 6: Scenario Release Gate

**Files:**

- Create:
  `tests/integration/scenarios/scenario-release-gate.integration.test.ts`
- Modify: `package.json`
- Modify: `.github/workflows/ci-unified.yml`

- [ ] **Step 1: Add package script**

In `package.json`, add:

```json
"test:scenario-release-gate": "cross-env TZ=UTC vitest run -c vitest.config.int.ts tests/integration/scenarios/scenario-release-gate.integration.test.ts"
```

- [ ] **Step 2: Write lifecycle gate test**

Create `tests/integration/scenarios/scenario-release-gate.integration.test.ts`
with one top-level test that performs this sequence:

```ts
it('proves the ADR-022 scenario lifecycle with Postgres, Redis, worker, results, and archive behavior', async () => {
  const active = await seedPublishedFundConfig();

  const feeScenarioSet = await createScenarioSet(active.fundId, {
    name: 'Fee profile hardening gate',
    variants: [
      {
        name: 'Higher management fee',
        sortOrder: 1,
        overrideType: 'fee_profile',
        overridePayload: { managementFeeRateDecimal: '0.0210' },
      },
    ],
  });

  const feeResult = await calculateFeeProfileScenario(
    active.fundId,
    feeScenarioSet.id
  );
  expect(feeResult.snapshotId).toEqual(expect.any(Number));

  const comparison = await readScenarioComparison(
    active.fundId,
    feeScenarioSet.id
  );
  expect(['comparable', 'baseline_unavailable']).toContain(
    comparison.comparisonStatus
  );
  if (comparison.comparisonStatus === 'baseline_unavailable') {
    expect(comparison.unavailableReason).toEqual(expect.any(String));
  }

  const reserveScenarioSet = await createScenarioSet(active.fundId, {
    name: 'Reserve allocation hardening gate',
    variants: [
      {
        name: 'Reserve adjustment',
        sortOrder: 1,
        overrideType: 'reserve_allocation',
        overridePayload: { allocations: [] },
      },
    ],
  });

  await enqueueReserveScenarioCalculation(active.fundId, reserveScenarioSet.id);
  const terminalStatus = await pollScenarioCalculationStatus(
    active.fundId,
    reserveScenarioSet.id
  );
  expect(terminalStatus.status).toBe('succeeded');

  const results = await readFundResults(active.fundId);
  expect(results.sections.scenarios.status).not.toBe('unavailable');

  await archiveScenarioSet(active.fundId, feeScenarioSet.id);
  const archivedRecalculate = await request(app)
    .post(
      `/api/funds/${active.fundId}/scenario-sets/${feeScenarioSet.id}/calculate`
    )
    .send({});
  expect(archivedRecalculate.status).toBe(409);
  expect(archivedRecalculate.body.code).toBe('scenario_set_archived');

  const authoritativeRows = await db.query(
    `SELECT id
       FROM fund_snapshots
      WHERE fund_id = $1
        AND type IN ('RESERVE', 'PACING', 'ECONOMICS')
        AND scenario_set_id IS NOT NULL`,
    [active.fundId]
  );
  expect(authoritativeRows.rows).toHaveLength(0);
});
```

Use helper functions in the same file with complete route calls. Poll status
via:

```ts
async function pollScenarioCalculationStatus(
  fundId: number,
  scenarioSetId: string
) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await request(app)
      .get(
        `/api/funds/${fundId}/scenario-sets/${scenarioSetId}/calculation-status`
      )
      .expect(200);
    if (
      response.body.status === 'succeeded' ||
      response.body.status === 'failed'
    ) {
      return response.body;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for scenario calculation status');
}
```

- [ ] **Step 3: Run release gate locally**

Run:

```bash
npm run test:scenario-release-gate
```

Expected:

- PASS when local Postgres and Redis integration services are available.
- Local skip is acceptable only when existing integration setup explicitly
  detects unavailable containers.
- CI must not silently skip missing Postgres or Redis.

- [ ] **Step 4: Wire CI**

In `.github/workflows/ci-unified.yml`, add `npm run test:scenario-release-gate`
to an existing job that already has Postgres and Redis service containers. Do
not create a new workflow unless the unified job cannot host the gate without
materially slowing unrelated checks.

- [ ] **Step 5: Run final hardening verification**

Run:

```bash
npm run check
npm run lint
npm run calc-gate
npm run calc-gate:full
npm run validate:core
npm run test:integration:routes
npm run test:scenario-release-gate
npm run build:prod
git diff --check
git status --short --branch
```

Expected: all commands pass; final status shows only intended tracked files
before commit.

- [ ] **Step 6: Commit**

Suggested intent line:

```text
Gate scenario release on real infrastructure lifecycle proof
```

Include:

```text
Constraint: Scenario release crosses auth, config, queue, worker, snapshots, results, comparison, and archive behavior
Rejected: Unit-only release gate | unit tests cannot prove the full Postgres Redis worker lifecycle
Confidence: medium
Scope-risk: broad
Tested: check; lint; calc-gate; calc-gate:full; validate:core; route integration; scenario release gate; build:prod; git diff --check
```

---

## Follow-On Plans

Write separate plans after this one is merged and green:

1. Scenario UX workspace at `/fund-model-results/:fundId/scenarios`.
2. Allocation and sector override expansion.
3. Reserve optimization workflow.
4. Methodology guardrails for forbidden overrides.
5. Forecast modes and actuals.
6. Cohort release readiness.

Do not start any follow-on plan until the scenario release gate is green on
`main`.

## Self-Review

- Spec coverage: This plan incorporates the requested corrections: existing
  unique-index blocker, 0016 migration application path, production raw-SQL
  migration caveat, Drizzle/index parity, release-gate/economics ordering, stale
  script replacement, existing Postgres/Redis CI surfaces, endpoint-first
  reserve worker polling, current comparison contract shape, conflict-safe
  append-only writes, extension of existing retention helpers, scenario
  comparison copy in `ScenarioComparisonTable`, lowercase archived-set error
  code, and variant sorting by `sortOrder` then `id`.
- Placeholder scan: The plan uses exact files, commands, and code snippets and
  avoids deferred-fill wording.
- Type consistency: Scenario hash envelope fields are defined once in
  `shared/lib/scenarios/scenario-input-envelope.ts`; both service migrations
  consume the same shape.
