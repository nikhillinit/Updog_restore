---
status: ACTIVE
audience: agents
last_updated: 2026-05-29
owner: "Platform Team"
review_cadence: P90D
categories: [planning, scenarios, guardrails]
keywords: [scenario-sets, methodology-guardrails, forbidden-overrides]
---

# Scenario Methodology Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent forbidden methodology-changing scenario override payloads from bypassing route validation and being persisted through the scenario-set service boundary.

**Architecture:** Reuse the existing strict `CreateFundScenarioSetV1Schema` and keep all scenario routes, override types, hash semantics, canonicalization, migrations, and calculation flows unchanged. The public route already parses the contract before calling the service; this follow-on adds the same runtime contract guard inside `createFundScenarioSet` so server-side callers cannot smuggle forbidden payload fields past the route.

**Tech Stack:** TypeScript, Zod contracts, existing Express route validation, existing scenario-set persistence service, Vitest server unit tests, docs routing generation.

---

## Inventory Summary

- `origin/main` is at `6e63b0699eb19b75f79e65c31dc449ed85944982`, which contains the merged PR #731 and PR #732 release-gate work.
- Main release-gate checks for `6e63b0699eb19b75f79e65c31dc449ed85944982` are green: CI Unified, CI Gate Status, Security Deep Scan, and CodeQL.
- `server/routes/fund-scenario-sets.ts` parses `CreateFundScenarioSetV1Schema` for `POST /funds/:fundId/scenario-sets` before calling `createFundScenarioSet`.
- `shared/contracts/fund-scenario-sets-v1.contract.ts` already restricts supported scenario override types to `fee_profile`, `reserve_allocation`, `allocation`, and `sector_profile`.
- Current allowed payload sections are intentionally narrow:
  - `fee_profile`: `feeProfiles`
  - `allocation`: `allocations`, `capitalPlanAllocations`
  - `sector_profile`: `sectorProfiles`
  - `reserve_allocation`: `allocationVersion`, `items`
- The route contract rejects unknown top-level override payload keys, but `server/services/fund-scenario-set-create-service.ts` currently trusts its TypeScript input and does not re-parse at runtime before computing idempotency hashes or inserting `fund_scenario_variants.override_payload`.
- The narrow guardrail gap is therefore an internal service-boundary bypass, not a need for new route families, new stores, new override types, or canonical hash changes.

## Scope

In scope:

- Add regression coverage that forbidden methodology fields such as `waterfallType`, `economicsAssumptions`, `fundSize`, and `forecastMode` are not accepted as scenario override payload keys.
- Add a failing service-level test that a runtime object cast as `CreateFundScenarioSetV1` is rejected before any database query or persistence.
- Re-parse scenario-set creation input inside `createFundScenarioSet` using the existing V1 contract.
- Keep error mapping compatible with existing route/service error handling.
- Regenerate docs routing artifacts after adding this plan.

Out of scope:

- New override types, forecast modes, actuals, cohort readiness, reserve optimization changes, money utility refactors, schema-directory renames, engine dedupe, config cleanup, route mount normalization, dependency additions, Phoenix-protected docs.
- Changes to canonical hash semantics, canonicalization behavior, migrations `0016` or `0017`, scenario comparison fail-closed semantics, or landed PR #729/#730/#731/#732 behavior.
- Broad route integration harness work; unit coverage is enough for this service-boundary guardrail.

## File Structure

- Create: `docs/superpowers/plans/2026-05-29-scenario-methodology-guardrails.md`
  - Focused plan and release-scope record.
- Modify: `tests/unit/contract/fund-scenario-sets.test.ts`
  - Document contract-level rejection of forbidden methodology keys.
- Modify: `tests/unit/services/fund-scenario-set-service.test.ts`
  - Add the TDD red test proving the service rejects runtime-invalid inputs before persistence.
- Modify: `server/services/fund-scenario-set-create-service.ts`
  - Add service-level runtime validation by parsing with `CreateFundScenarioSetV1Schema` before opening the transaction.
- Possibly modify generated docs routing artifacts after `npm run docs:routing:generate`.

---

### Task 1: Lock Forbidden Methodology Payloads With Tests

**Files:**

- Modify: `tests/unit/contract/fund-scenario-sets.test.ts`
- Modify: `tests/unit/services/fund-scenario-set-service.test.ts`

- [ ] **Step 1: Add contract regression coverage**

In `tests/unit/contract/fund-scenario-sets.test.ts`, add a test in the `FundScenarioSetsV1 contract` describe block:

```ts
  it('rejects methodology-changing fields in scenario override payloads', () => {
    const forbiddenPayloads = [
      {
        label: 'fee-profile waterfall override',
        override: {
          overrideType: 'fee_profile',
          payload: {
            ...feeProfileOverride.payload,
            waterfallType: 'hybrid',
          },
        },
      },
      {
        label: 'allocation economics assumptions override',
        override: {
          overrideType: 'allocation',
          payload: {
            allocations: [{ id: 'seed-stage', category: 'Seed', percentage: 60 }],
            economicsAssumptions: {
              feeModel: { source: 'inline_methodology' },
            },
          },
        },
      },
      {
        label: 'sector profile fund size override',
        override: {
          overrideType: 'sector_profile',
          payload: {
            sectorProfiles: [
              {
                id: 'ai-infra',
                name: 'AI Infrastructure',
                targetPercentage: 35,
              },
            ],
            fundSize: 100_000_000,
          },
        },
      },
      {
        label: 'reserve forecast mode override',
        override: {
          overrideType: 'reserve_allocation',
          payload: {
            allocationVersion: 1,
            items: [{ companyId: 101, plannedReservesCents: 10_000_000 }],
            forecastMode: 'actuals',
          },
        },
      },
    ];

    for (const { label, override } of forbiddenPayloads) {
      const result = FundScenarioVariantOverrideV1Schema.safeParse(override);

      expect(result.success, label).toBe(false);
      expect(result.error?.issues[0]?.message).toContain('Unrecognized key');
    }
  });
```

- [ ] **Step 2: Add the service-boundary red test**

In `tests/unit/services/fund-scenario-set-service.test.ts`, add this test before the create-success test:

```ts
  it('rejects runtime-invalid methodology override payloads before persistence', async () => {
    const invalidInput = {
      name: 'Unsafe methodology scenario',
      variants: [
        {
          name: 'Waterfall method change',
          override: {
            overrideType: 'fee_profile',
            payload: {
              ...feeProfileOverride.payload,
              waterfallType: 'hybrid',
            },
          },
        },
      ],
    };

    await expect(
      createFundScenarioSet(
        1,
        invalidInput as never,
        { userId: 17, label: 'analyst@example.com' }
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'invalid_scenario_set_payload',
    });

    expect(transactionMock).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
  });
```

- [ ] **Step 3: Run focused tests and observe RED**

Run:

```bash
npx vitest run --config vitest.config.mjs --configLoader native tests/unit/contract/fund-scenario-sets.test.ts tests/unit/services/fund-scenario-set-service.test.ts --project=server
```

Expected: the contract regression may already pass, but the service-boundary test fails because `createFundScenarioSet` currently opens a transaction and does not emit `invalid_scenario_set_payload` before database work.

---

### Task 2: Add Service-Level Contract Revalidation

**Files:**

- Modify: `server/services/fund-scenario-set-create-service.ts`

- [ ] **Step 1: Import the runtime schema**

Change the import from `@shared/contracts/fund-scenario-sets-v1.contract` to include `CreateFundScenarioSetV1Schema`:

```ts
import type {
  CreateFundScenarioSetV1,
  FundScenarioSetDetailV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';
import { CreateFundScenarioSetV1Schema } from '@shared/contracts/fund-scenario-sets-v1.contract';
```

- [ ] **Step 2: Add a parser helper**

Add this helper near `createFundScenarioSet`:

```ts
function parseCreateFundScenarioSetInput(input: CreateFundScenarioSetV1): CreateFundScenarioSetV1 {
  const parsed = CreateFundScenarioSetV1Schema.safeParse(input);
  if (parsed.success) {
    return parsed.data;
  }

  throw createHttpError(400, 'Invalid fund scenario set payload', {
    code: 'invalid_scenario_set_payload',
    details: {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      })),
    },
  });
}
```

- [ ] **Step 3: Parse before transaction work**

Update `createFundScenarioSet` so invalid runtime payloads cannot compute idempotency hashes or touch the database:

```ts
export async function createFundScenarioSet(
  fundId: number,
  input: CreateFundScenarioSetV1,
  actorInput: FundScenarioMutationActor = {},
  options: CreateFundScenarioSetOptions = {}
): Promise<FundScenarioSetDetailV1> {
  const parsedInput = parseCreateFundScenarioSetInput(input);
  return transaction((client) =>
    createFundScenarioSetInTransaction(client, fundId, parsedInput, actorInput, options)
  );
}
```

- [ ] **Step 4: Run focused tests and observe GREEN**

Run:

```bash
npx vitest run --config vitest.config.mjs --configLoader native tests/unit/contract/fund-scenario-sets.test.ts tests/unit/services/fund-scenario-set-service.test.ts --project=server
```

Expected: both test files pass.

---

### Task 3: Regenerate Docs Routing And Verify

**Files:**

- Possibly modify: `docs/_generated/router-index.json`
- Possibly modify: `docs/_generated/staleness-report.md`

- [ ] **Step 1: Regenerate docs routing**

Run:

```bash
npm run docs:routing:generate
```

Expected: exits 0. If generated artifacts change because the new plan entered the inventory, keep those generated changes with the source plan.

- [ ] **Step 2: Run required verification**

Run:

```bash
npm run check
npm run lint
npm run test:scenario-release-gate
git diff --check
git status --short --branch
```

Expected: all commands pass. If local Testcontainers are unavailable, record the explicit local skip from `npm run test:scenario-release-gate` and rely on CI for container-backed proof.

- [ ] **Step 3: Broaden only if touched surfaces require it**

Run additional gates only if the implementation touches their surfaces:

```bash
npm run test:integration:routes
npm run calc-gate
npm run calc-gate:full
```

Expected: not required for the planned service-contract-only change unless code edits widen beyond `fund-scenario-set-create-service.ts`, contract tests, service tests, and generated docs.

- [ ] **Step 4: Commit, push, and open PR**

Use the repo Lore Commit Protocol. Suggested intent line:

```text
Reject scenario methodology overrides at the service boundary
```

Include:

```text
Constraint: Scenario set routes already parse the strict V1 contract, but server-side callers can bypass route parsing at runtime
Rejected: Add a new guardrail schema | the existing V1 contract is already the canonical allowlist
Confidence: high
Scope-risk: narrow
Directive: Keep methodology guardrails in the V1 contract and service boundary; do not add parallel scenario stores or route families
Tested: focused scenario contract and service tests; check; lint; scenario release gate; git diff --check
```

Add:

```text
Co-authored-by: OmX <omx@oh-my-codex.dev>
```

PR body must include scope, non-goals, verification results, and any local Testcontainers caveat.

## Self-Review

- Spec coverage: The plan targets methodology guardrails only and uses live inventory to avoid changing canonical hash, canonicalization, migrations, calculation services, route families, reserve optimization behavior, or UI.
- Placeholder scan: No deferred TODOs or unspecified code steps; all test and implementation snippets are concrete.
- Type consistency: The implementation reuses `CreateFundScenarioSetV1Schema` and `CreateFundScenarioSetV1`; no new payload type or dependency is introduced.
