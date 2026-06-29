# PR-D Provenance Envelope + Rounds Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a strict, hash-bound dataset provenance envelope and read-only
rounds-to-model evidence adapter over all non-superseded investment rounds.

**Architecture:** PR-D adds contracts, provenance factories, override
persistence, and a server-side read adapter. It deliberately does not add
routes, render blocking, candidate/shadow payloads, or live MOIC ranking
changes; PR-E owns those. The adapter emits strict parsed evidence with
deterministic hashes so later work can safely promote it into route/render
policy.

**Tech Stack:** TypeScript, Zod, Drizzle ORM, PostgreSQL SQL migrations,
Decimal.js via existing decimal utilities, Vitest server project, existing npm
guardrail scripts.

## Global Constraints

- Baseline commit: `e8113431`, PR #916 "H3 investment-round operational
  readiness + base currency".
- Scope statement for PR: "PR-D introduces a strict, hash-bound dataset
  provenance envelope and a read-only rounds-to-model evidence adapter over all
  non-superseded investment rounds, with override-aware currency blocking and
  amount-only non-equity handling; it does not alter live MOIC rankings, add
  routes, expose shadow/candidate responses, or enforce render blocking."
- Preserve unrelated checkout dirt. Do not reset, clean, stage, or commit
  unrelated files from the root checkout.
- Execution branch: `claude/beautiful-heisenberg-btcsmw`.
- Reuse `shared/lib/canonical-hash.ts`; do not create a new hashing module.
- Reuse `shared/contracts/financial-provenance.contract.ts`; do not redefine
  provenance core enums or fields.
- Active rounds are all non-superseded rows. Never collapse to one "latest"
  round per investment.
- Keep tests under `tests/unit/**` so `vitest.config.mjs` discovers them.
- Hand-written migrations live under
  `server/migrations/<YYYYMMDD>_..._v1.{up,down}.sql`.
- `npm run check` runs `baseline:check`; `npm run lint` already runs
  `guardrails:check`.
- Final release proof is `npm run release:check`; CI green alone is not release
  proof.

---

## File Structure

- Create `shared/contracts/provenance-envelope.contract.ts`
  - Owns `DatasetTrustStateSchema`, `WarningCodeSchema`,
    `StructuredWarningSchema`, `ProvenanceEnvelopeSchema`, and exported types.
  - Composes `FinancialProvenanceSchema` as `core`.

- Create `shared/contracts/rounds-to-model-evidence.contract.ts`
  - Owns strict evidence payload schema, per-company evidence schema, coverage
    schema, warning-code record schema, and
    `serializeRoundsToModelEvidence(value: unknown)`.
  - Reuses `SecurityTypeSchema` from
    `shared/contracts/investments/investment-round.contract.ts`.

- Create `server/lib/rounds-provenance.ts`
  - Owns provenance factory functions and canonical hash input construction.
  - Depends on `canonicalSha256()` and the new provenance contract.

- Create `shared/schema/investment-round-model-overrides.ts`
  - Owns Drizzle table for read-only model role overrides.
  - Mirrors investment-round integrity patterns.

- Create `server/migrations/20260624_investment_round_model_overrides_v1.up.sql`
  - Creates override table, composite FK target, FK, lineage indexes, and read
    indexes.

- Create
  `server/migrations/20260624_investment_round_model_overrides_v1.down.sql`
  - Drops constraints, indexes, and table in reverse order.

- Modify `shared/schema.ts`
  - Export `./schema/investment-round-model-overrides` because
    `drizzle.config.ts` reads this barrel.

- Modify `shared/schema/index.ts`
  - Export `./investment-round-model-overrides` for compatibility imports.

- Create `server/services/rounds-to-model-evidence-service.ts`
  - Owns the read-only adapter.
  - Loads fund base currency, companies, investments, active rounds, active
    overrides.
  - Aggregates per-company evidence and returns through strict serialization.

- Create `tests/unit/contract/provenance-envelope.contract.test.ts`
  - Contract tests for envelope trust-state mapping, strictness, hash binding,
    and warning collision prevention.

- Create `tests/unit/contract/rounds-to-model-evidence.contract.test.ts`
  - Contract tests for evidence shape, strict leak rejection, decimal strings,
    coverage, and warning code maps.

- Create `tests/unit/services/rounds-to-model-evidence-service.test.ts`
  - Service tests with injected/seeded database doubles.

- Modify `tests/unit/services/fund-moic-ranking-service.test.ts`
  - Adds regression around `getFundMoicRankings` so live MOIC rankings stay
    sourced from `portfolioCompanies` and ignore `investmentRounds`.

- Create `scripts/guardrails/no-client-round-derived-financial-claims.mjs`
  - Narrow ratchet for new client-side round-aware financial derivation claims.

- Modify `package.json`
  - Add `guard:round-derived-financial-claims:check`.
  - Append to `guardrails:check` only after the guardrail passes current code.

---

### Task 1: Preflight + Isolation

**Files:**

- No source files created or modified.

**Interfaces:**

- Consumes: current Git state, `origin/main`, desired branch name
  `claude/beautiful-heisenberg-btcsmw`.
- Produces: a clean implementation checkout at baseline `e8113431`.

- [ ] **Step 1: Record current git state**

Run:

```powershell
git status --short --branch
git rev-parse --short HEAD
git rev-parse --short origin/main
git branch --show-current
git branch --list claude/beautiful-heisenberg-btcsmw
git ls-remote origin refs/heads/claude/beautiful-heisenberg-btcsmw
```

Expected:

- `HEAD` and `origin/main` are `e8113431`.
- If current checkout is dirty or not already on a clean
  `claude/beautiful-heisenberg-btcsmw`, do not work in root checkout.

- [ ] **Step 2: Create isolated worktree when required**

Run only if the current checkout is dirty or not already on a clean designated
branch:

```powershell
git worktree add .worktrees\pr-d-provenance-envelope-rounds-evidence origin/main
Set-Location .worktrees\pr-d-provenance-envelope-rounds-evidence
git switch -c claude/beautiful-heisenberg-btcsmw
git rev-parse --short HEAD
git status --short --branch
```

Expected:

- `HEAD` is `e8113431`.
- Worktree branch is `claude/beautiful-heisenberg-btcsmw`.
- Worktree status is clean.

- [ ] **Step 3: Capture active-round rule evidence**

If Postgres is reachable, run a redacted count/shape/query-plan spike. Do not
print monetary values.

```sql
EXPLAIN
SELECT r.id, r.fund_id, r.investment_id, r.round_date, r.created_at
FROM investment_rounds r
WHERE r.fund_id = $1
  AND NOT EXISTS (
    SELECT 1
    FROM investment_rounds newer
    WHERE newer.supersedes_round_id = r.id
  )
ORDER BY r.investment_id ASC, r.round_date ASC, r.created_at ASC, r.id ASC;
```

If Postgres is not reachable, record that service tests will prove the same rule
with injected rows.

- [ ] **Step 4: Commit nothing**

No commit is expected for Task 1. The deliverable is a clean implementation
checkout and recorded preflight evidence.

---

### Task 2: Provenance Envelope Contract

**Files:**

- Create: `shared/contracts/provenance-envelope.contract.ts`
- Test: `tests/unit/contract/provenance-envelope.contract.test.ts`

**Interfaces:**

- Consumes: `FinancialProvenanceSchema` from
  `shared/contracts/financial-provenance.contract.ts`.
- Produces:
  - `DatasetTrustStateSchema`
  - `WarningCodeSchema`
  - `StructuredWarningSchema`
  - `ProvenanceEnvelopeSchema`
  - Types `DatasetTrustState`, `WarningCode`, `StructuredWarning`,
    `ProvenanceEnvelope`

- [ ] **Step 1: Write failing contract tests**

Create `tests/unit/contract/provenance-envelope.contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ProvenanceEnvelopeSchema,
  type ProvenanceEnvelope,
} from '../../../shared/contracts/provenance-envelope.contract';

const computedCore = {
  sourceKind: 'computed',
  actionability: 'actionable',
  sourceEngine: 'rounds-to-model',
  engineVersion: 'rounds-to-model-v1',
  inputHash: 'input-hash',
  assumptionsHash: 'assumptions-hash',
  generatedAt: '2026-06-24T00:00:00.000Z',
  isFinanciallyActionable: true,
  warnings: [],
} as const;

describe('ProvenanceEnvelopeSchema', () => {
  it('accepts hash-bound LIVE computed provenance', () => {
    const value: ProvenanceEnvelope = {
      trustState: 'LIVE',
      core: computedCore,
      structuredWarnings: [],
      sourceAsOf: '2026-06-24T00:00:00.000Z',
      staleAfterSeconds: 3600,
    };

    expect(ProvenanceEnvelopeSchema.parse(value)).toEqual(value);
  });

  it('accepts empty-fund LIVE provenance with hashes and EMPTY_FUND info warning', () => {
    const value = {
      trustState: 'LIVE',
      core: computedCore,
      structuredWarnings: [
        {
          code: 'EMPTY_FUND',
          severity: 'info',
          message: 'No active investment rounds were found for this fund.',
        },
      ],
    };

    expect(ProvenanceEnvelopeSchema.parse(value)).toEqual(value);
  });

  it('requires hash-bound PARTIAL computed provenance at the envelope layer', () => {
    const result = ProvenanceEnvelopeSchema.safeParse({
      trustState: 'PARTIAL',
      core: {
        sourceKind: 'computed',
        actionability: 'input_only',
        generatedAt: '2026-06-24T00:00:00.000Z',
        isFinanciallyActionable: false,
        warnings: [],
      },
      structuredWarnings: [
        {
          code: 'ROLE_CLASSIFICATION_AMBIGUOUS',
          severity: 'warning',
          message: 'Initial versus follow-on role could not be determined.',
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.map((issue) => issue.path.join('.'))
      ).toContain('core.inputHash');
      expect(
        result.error.issues.map((issue) => issue.path.join('.'))
      ).toContain('core.assumptionsHash');
    }
  });

  it('accepts hash-bound UNAVAILABLE currency block provenance', () => {
    const value = {
      trustState: 'UNAVAILABLE',
      core: {
        sourceKind: 'computed',
        actionability: 'quarantined',
        sourceEngine: 'rounds-to-model',
        engineVersion: 'rounds-to-model-v1',
        inputHash: 'input-hash',
        assumptionsHash: 'assumptions-hash',
        generatedAt: '2026-06-24T00:00:00.000Z',
        isFinanciallyActionable: false,
        quarantineReason: 'currency_mismatch',
        warnings: [],
      },
      structuredWarnings: [
        {
          code: 'CURRENCY_MISMATCH_BLOCK',
          severity: 'blocking',
          message:
            'Round currency does not match fund base currency after overrides.',
        },
      ],
    };

    expect(ProvenanceEnvelopeSchema.parse(value)).toEqual(value);
  });

  it('accepts FAILED adapter provenance without dataset hashes', () => {
    const value = {
      trustState: 'FAILED',
      core: {
        sourceKind: 'prototype_blocked',
        actionability: 'non_actionable',
        generatedAt: '2026-06-24T00:00:00.000Z',
        isFinanciallyActionable: false,
        quarantineReason: 'round_adapter_failed',
        warnings: [
          'Rounds-to-model adapter failed before evidence could be emitted.',
        ],
      },
      structuredWarnings: [
        {
          code: 'ROUND_ADAPTER_FAILED',
          severity: 'blocking',
          message:
            'Rounds-to-model adapter failed before evidence could be emitted.',
        },
      ],
    };

    expect(ProvenanceEnvelopeSchema.parse(value)).toEqual(value);
  });

  it('keeps core warnings separate from structured warnings', () => {
    const value = {
      trustState: 'PARTIAL',
      core: {
        sourceKind: 'computed',
        actionability: 'input_only',
        sourceEngine: 'rounds-to-model',
        engineVersion: 'rounds-to-model-v1',
        inputHash: 'input-hash',
        assumptionsHash: 'assumptions-hash',
        generatedAt: '2026-06-24T00:00:00.000Z',
        isFinanciallyActionable: false,
        warnings: ['legacy string warning'],
      },
      structuredWarnings: [
        {
          code: 'NON_EQUITY_AMOUNT_ONLY',
          severity: 'warning',
          message: 'A non-equity round can only contribute amount evidence.',
        },
      ],
    };

    const parsed = ProvenanceEnvelopeSchema.parse(value);

    expect(parsed.core.warnings).toEqual(['legacy string warning']);
    expect(parsed.structuredWarnings[0]?.code).toBe('NON_EQUITY_AMOUNT_ONLY');
  });

  it('rejects shadow or candidate leak fields', () => {
    const result = ProvenanceEnvelopeSchema.safeParse({
      trustState: 'LIVE',
      core: computedCore,
      structuredWarnings: [],
      shadowDiff: {},
    });

    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
cross-env TZ=UTC vitest run tests/unit/contract/provenance-envelope.contract.test.ts --project=server
```

Expected:

- FAIL because `shared/contracts/provenance-envelope.contract.ts` does not
  exist.

- [ ] **Step 3: Implement contract**

Create `shared/contracts/provenance-envelope.contract.ts`:

```ts
import { z } from 'zod';

import { FinancialProvenanceSchema } from './financial-provenance.contract';

export const DatasetTrustStateSchema = z.enum([
  'LIVE',
  'PARTIAL',
  'UNAVAILABLE',
  'FAILED',
]);

export const WarningCodeSchema = z.enum([
  'ROUND_ADAPTER_FAILED',
  'CURRENCY_MISMATCH_BLOCK',
  'DATA_STALE',
  'ROLE_CLASSIFICATION_AMBIGUOUS',
  'ROLE_TOLERANCE_OVERRIDDEN',
  'ROUND_MODEL_OVERRIDE_APPLIED',
  'INVALID_ROUND_AMOUNT',
  'NON_EQUITY_AMOUNT_ONLY',
  'EMPTY_FUND',
]);

export const StructuredWarningSchema = z
  .object({
    code: WarningCodeSchema,
    severity: z.enum(['info', 'warning', 'blocking']),
    message: z.string().min(1),
    source: z.string().min(1).optional(),
  })
  .strict();

function hasWarningCode(
  warnings: Array<z.infer<typeof StructuredWarningSchema>>,
  code: z.infer<typeof WarningCodeSchema>
): boolean {
  return warnings.some((warning) => warning.code === code);
}

function requireHashBoundComputed(
  value: z.infer<typeof FinancialProvenanceSchema>,
  ctx: z.RefinementCtx
): void {
  for (const field of ['inputHash', 'assumptionsHash'] as const) {
    if (!value[field]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['core', field],
        message: `${field} is required for non-FAILED computed provenance envelopes`,
      });
    }
  }
}

export const ProvenanceEnvelopeSchema = z
  .object({
    trustState: DatasetTrustStateSchema,
    core: FinancialProvenanceSchema,
    structuredWarnings: z.array(StructuredWarningSchema),
    sourceAsOf: z.string().datetime().optional(),
    staleAfterSeconds: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.trustState !== 'FAILED' && value.core.sourceKind === 'computed') {
      requireHashBoundComputed(value.core, ctx);
    }

    if (value.trustState === 'LIVE') {
      if (value.core.sourceKind !== 'computed') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['core', 'sourceKind'],
          message:
            'PR-D LIVE provenance must be computed; imported_actual LIVE is deferred to PR-E',
        });
      }
      if (
        !value.core.isFinanciallyActionable ||
        value.core.actionability !== 'actionable'
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['core', 'actionability'],
          message: 'LIVE provenance must be financially actionable',
        });
      }
      if (value.core.quarantineReason) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['core', 'quarantineReason'],
          message: 'LIVE provenance cannot include quarantineReason',
        });
      }
    }

    if (value.trustState === 'PARTIAL') {
      if (value.core.sourceKind !== 'computed') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['core', 'sourceKind'],
          message: 'PARTIAL provenance must be computed',
        });
      }
      if (
        value.core.isFinanciallyActionable ||
        value.core.actionability !== 'input_only'
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['core', 'actionability'],
          message:
            'PARTIAL provenance must be non-actionable input_only computed evidence',
        });
      }
      if (value.core.quarantineReason) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['core', 'quarantineReason'],
          message: 'PARTIAL provenance cannot include quarantineReason',
        });
      }
      if (value.structuredWarnings.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['structuredWarnings'],
          message:
            'PARTIAL provenance requires at least one structured warning',
        });
      }
    }

    if (value.trustState === 'UNAVAILABLE') {
      if (
        value.core.sourceKind !== 'computed' ||
        value.core.actionability !== 'quarantined' ||
        value.core.quarantineReason !== 'currency_mismatch' ||
        !hasWarningCode(value.structuredWarnings, 'CURRENCY_MISMATCH_BLOCK')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['trustState'],
          message:
            'UNAVAILABLE PR-D provenance is reserved for computed currency_mismatch quarantine',
        });
      }
    }

    if (value.trustState === 'FAILED') {
      if (
        value.core.sourceKind !== 'prototype_blocked' ||
        value.core.actionability !== 'non_actionable' ||
        value.core.quarantineReason !== 'round_adapter_failed' ||
        !hasWarningCode(value.structuredWarnings, 'ROUND_ADAPTER_FAILED')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['trustState'],
          message:
            'FAILED provenance must be prototype_blocked round_adapter_failed provenance',
        });
      }
    }
  });

export type DatasetTrustState = z.infer<typeof DatasetTrustStateSchema>;
export type WarningCode = z.infer<typeof WarningCodeSchema>;
export type StructuredWarning = z.infer<typeof StructuredWarningSchema>;
export type ProvenanceEnvelope = z.infer<typeof ProvenanceEnvelopeSchema>;
```

- [ ] **Step 4: Run tests and verify pass**

Run:

```powershell
cross-env TZ=UTC vitest run tests/unit/contract/provenance-envelope.contract.test.ts --project=server
```

Expected:

- PASS.

- [ ] **Step 5: Commit**

Use a Lore-style commit message:

```powershell
git add shared/contracts/provenance-envelope.contract.ts tests/unit/contract/provenance-envelope.contract.test.ts
git commit -m @"
Define strict dataset provenance envelopes

PR-D needs a reusable trust envelope around existing financial provenance
without redefining the core provenance schema. The envelope composes the
existing strict schema and adds PR-D-specific trust-state consistency.

Constraint: PR-D must not expose routes or shadow/candidate payloads
Rejected: Redefine provenance core enums | existing FinancialProvenanceSchema already owns them
Confidence: high
Scope-risk: narrow
Tested: cross-env TZ=UTC vitest run tests/unit/contract/provenance-envelope.contract.test.ts --project=server
Not-tested: Full release gate
Co-authored-by: OmX <omx@oh-my-codex.dev>
"@
```

---

### Task 3: Rounds-to-Model Evidence Contract

**Files:**

- Create: `shared/contracts/rounds-to-model-evidence.contract.ts`
- Test: `tests/unit/contract/rounds-to-model-evidence.contract.test.ts`

**Interfaces:**

- Consumes:
  - `ProvenanceEnvelopeSchema`
  - `WarningCodeSchema`
  - `SecurityTypeSchema`
  - `DecimalStringSchema`
- Produces:
  - `RoundsToModelEvidenceSchema`
  - `serializeRoundsToModelEvidence(value: unknown): RoundsToModelEvidence`

- [ ] **Step 1: Write failing contract tests**

Create `tests/unit/contract/rounds-to-model-evidence.contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  RoundsToModelEvidenceSchema,
  serializeRoundsToModelEvidence,
} from '../../../shared/contracts/rounds-to-model-evidence.contract';

const provenance = {
  trustState: 'LIVE',
  core: {
    sourceKind: 'computed',
    actionability: 'actionable',
    sourceEngine: 'rounds-to-model',
    engineVersion: 'rounds-to-model-v1',
    inputHash: 'input-hash',
    assumptionsHash: 'assumptions-hash',
    generatedAt: '2026-06-24T00:00:00.000Z',
    isFinanciallyActionable: true,
    warnings: [],
  },
  structuredWarnings: [],
};

const validEvidence = {
  fundId: 10,
  baseCurrency: 'USD',
  generatedAt: '2026-06-24T00:00:00.000Z',
  companies: [
    {
      companyId: 101,
      companyName: 'Acme',
      investmentIds: [201],
      initialAmount: '500000.000000',
      followOnAmount: '125000.000000',
      amountOnlyNonEquityAmount: '0.000000',
      roundCount: 2,
      rounds: [
        {
          roundId: 1,
          investmentId: 201,
          companyId: 101,
          roundDate: '2024-01-15',
          securityType: 'equity',
          role: 'initial',
          currency: 'USD',
          investmentAmount: '500000.000000',
          amountOnly: false,
          overrideApplied: false,
        },
        {
          roundId: 2,
          investmentId: 201,
          companyId: 101,
          roundDate: '2025-02-01',
          securityType: 'safe',
          role: 'follow_on',
          currency: 'USD',
          investmentAmount: '125000.000000',
          amountOnly: true,
          overrideApplied: false,
        },
      ],
      warnings: [],
    },
  ],
  coverage: {
    companyCount: 1,
    investmentCount: 1,
    activeRoundCount: 2,
    activeOverrideCount: 0,
    warningsByCode: {},
  },
  provenance,
};

describe('RoundsToModelEvidenceSchema', () => {
  it('accepts strict evidence with decimal strings and provenance', () => {
    expect(RoundsToModelEvidenceSchema.parse(validEvidence)).toEqual(
      validEvidence
    );
  });

  it('rejects numeric money fields', () => {
    const result = RoundsToModelEvidenceSchema.safeParse({
      ...validEvidence,
      companies: [{ ...validEvidence.companies[0], initialAmount: 500000 }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects shadow and candidate leaks at serialization boundary', () => {
    expect(() =>
      serializeRoundsToModelEvidence({
        ...validEvidence,
        shadowDiff: {},
        candidateResponse: {},
        exportEligibility: { enabled: true },
      })
    ).toThrow();
  });

  it('requires warningsByCode keys to be warning codes', () => {
    const result = RoundsToModelEvidenceSchema.safeParse({
      ...validEvidence,
      coverage: {
        ...validEvidence.coverage,
        warningsByCode: {
          NOT_A_WARNING: 1,
        },
      },
    });

    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
cross-env TZ=UTC vitest run tests/unit/contract/rounds-to-model-evidence.contract.test.ts --project=server
```

Expected:

- FAIL because contract does not exist.

- [ ] **Step 3: Implement evidence contract**

Create `shared/contracts/rounds-to-model-evidence.contract.ts`:

```ts
import { z } from 'zod';

import { DecimalStringSchema } from './lp-reporting/cash-flow-event.contract';
import { SecurityTypeSchema } from './investments/investment-round.contract';
import {
  ProvenanceEnvelopeSchema,
  WarningCodeSchema,
  StructuredWarningSchema,
} from './provenance-envelope.contract';

const CurrencySchema = z.string().regex(/^[A-Z]{3}$/);

export const RoundModelRoleSchema = z.enum([
  'initial',
  'follow_on',
  'ambiguous',
  'amount_only',
]);

export const RoundEvidenceSchema = z
  .object({
    roundId: z.number().int().positive(),
    investmentId: z.number().int().positive(),
    companyId: z.number().int().positive(),
    roundDate: z.string().date(),
    securityType: SecurityTypeSchema,
    role: RoundModelRoleSchema,
    currency: CurrencySchema,
    investmentAmount: DecimalStringSchema,
    amountOnly: z.boolean(),
    overrideApplied: z.boolean(),
  })
  .strict();

export const CompanyRoundsEvidenceSchema = z
  .object({
    companyId: z.number().int().positive(),
    companyName: z.string().min(1),
    investmentIds: z.array(z.number().int().positive()),
    initialAmount: DecimalStringSchema,
    followOnAmount: DecimalStringSchema,
    amountOnlyNonEquityAmount: DecimalStringSchema,
    roundCount: z.number().int().nonnegative(),
    rounds: z.array(RoundEvidenceSchema),
    warnings: z.array(StructuredWarningSchema),
  })
  .strict();

export const RoundsEvidenceCoverageSchema = z
  .object({
    companyCount: z.number().int().nonnegative(),
    investmentCount: z.number().int().nonnegative(),
    activeRoundCount: z.number().int().nonnegative(),
    activeOverrideCount: z.number().int().nonnegative(),
    warningsByCode: z.record(WarningCodeSchema, z.number().int().nonnegative()),
  })
  .strict();

export const RoundsToModelEvidenceSchema = z
  .object({
    fundId: z.number().int().positive(),
    baseCurrency: CurrencySchema,
    generatedAt: z.string().datetime(),
    companies: z.array(CompanyRoundsEvidenceSchema),
    coverage: RoundsEvidenceCoverageSchema,
    provenance: ProvenanceEnvelopeSchema,
  })
  .strict();

export type RoundModelRole = z.infer<typeof RoundModelRoleSchema>;
export type RoundEvidence = z.infer<typeof RoundEvidenceSchema>;
export type CompanyRoundsEvidence = z.infer<typeof CompanyRoundsEvidenceSchema>;
export type RoundsEvidenceCoverage = z.infer<
  typeof RoundsEvidenceCoverageSchema
>;
export type RoundsToModelEvidence = z.infer<typeof RoundsToModelEvidenceSchema>;

export function serializeRoundsToModelEvidence(
  value: unknown
): RoundsToModelEvidence {
  return RoundsToModelEvidenceSchema.parse(value);
}
```

- [ ] **Step 4: Run tests and verify pass**

Run:

```powershell
cross-env TZ=UTC vitest run tests/unit/contract/rounds-to-model-evidence.contract.test.ts --project=server
```

Expected:

- PASS.

- [ ] **Step 5: Commit**

```powershell
git add shared/contracts/rounds-to-model-evidence.contract.ts tests/unit/contract/rounds-to-model-evidence.contract.test.ts
git commit -m @"
Constrain rounds-to-model evidence before routing

PR-D needs a strict read-only evidence payload that can be trusted before PR-E
adds routes or render policy. The contract rejects shadow and candidate fields
at the serialization boundary.

Constraint: PR-D has no HTTP route or export surface
Rejected: Add shared/contracts/modeling namespace | no such namespace exists in repo today
Confidence: high
Scope-risk: narrow
Tested: cross-env TZ=UTC vitest run tests/unit/contract/rounds-to-model-evidence.contract.test.ts --project=server
Not-tested: Adapter integration
Co-authored-by: OmX <omx@oh-my-codex.dev>
"@
```

---

### Task 4: Provenance Factories

**Files:**

- Create: `server/lib/rounds-provenance.ts`
- Test: extend `tests/unit/contract/provenance-envelope.contract.test.ts`

**Interfaces:**

- Consumes:
  - `canonicalSha256(value: unknown): string`
  - `ProvenanceEnvelopeSchema`
- Produces:
  - `buildRoundsInputHashInput(params): object`
  - `buildRoundsAssumptionsHashInput(): object`
  - `makeLiveRoundsProvenance(params): ProvenanceEnvelope`
  - `makePartialRoundsProvenance(params): ProvenanceEnvelope`
  - `makeCurrencyBlockedProvenance(params): ProvenanceEnvelope`
  - `makeAdapterFailedProvenance(params): ProvenanceEnvelope`

- [ ] **Step 1: Add failing factory tests**

Append to `tests/unit/contract/provenance-envelope.contract.test.ts`:

```ts
import {
  buildRoundsAssumptionsHashInput,
  buildRoundsInputHashInput,
  makeCurrencyBlockedProvenance,
  makeLiveRoundsProvenance,
  makePartialRoundsProvenance,
} from '../../../server/lib/rounds-provenance';

describe('rounds provenance factories', () => {
  const now = new Date('2026-06-24T00:00:00.000Z');
  const hashParams = {
    fundId: 10,
    baseCurrency: 'USD',
    activeRounds: [{ id: 2 }, { id: 1 }],
    activeOverrides: [],
    parentInvestments: [{ id: 20 }],
    companies: [{ id: 30 }],
  };

  it('uses explicit stable input hash membership', () => {
    expect(buildRoundsInputHashInput(hashParams)).toEqual({
      fundId: 10,
      baseCurrency: 'USD',
      activeRounds: [{ id: 2 }, { id: 1 }],
      activeOverrides: [],
      parentInvestments: [{ id: 20 }],
      companies: [{ id: 30 }],
    });
  });

  it('uses explicit assumptions hash membership', () => {
    expect(buildRoundsAssumptionsHashInput()).toEqual({
      rulesVersion: 'rounds-to-model-v1',
      amountTolerancePct: '0.01',
      minRoundReconciliationToleranceUsd: '25000',
      dateToleranceDays: 14,
      unsupportedSecurityTypePolicy: 'amount_only_or_unavailable',
      currencyPolicy: 'post_override_fund_base_currency',
      roleClassificationPolicy:
        'override_before_currency_decimal_initial_vs_followon',
    });
  });

  it('creates LIVE provenance with hashes', () => {
    const provenance = makeLiveRoundsProvenance({
      now,
      hashParams,
      structuredWarnings: [],
    });

    expect(provenance.trustState).toBe('LIVE');
    expect(provenance.core.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(provenance.core.assumptionsHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('creates hash-bound PARTIAL provenance', () => {
    const provenance = makePartialRoundsProvenance({
      now,
      hashParams,
      structuredWarnings: [
        {
          code: 'ROLE_CLASSIFICATION_AMBIGUOUS',
          severity: 'warning',
          message: 'Role classification is ambiguous.',
        },
      ],
    });

    expect(provenance.trustState).toBe('PARTIAL');
    expect(provenance.core.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(provenance.core.assumptionsHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('creates hash-bound currency block provenance', () => {
    const provenance = makeCurrencyBlockedProvenance({
      now,
      hashParams,
      structuredWarnings: [
        {
          code: 'CURRENCY_MISMATCH_BLOCK',
          severity: 'blocking',
          message: 'Round currency does not match fund base currency.',
        },
      ],
    });

    expect(provenance.trustState).toBe('UNAVAILABLE');
    expect(provenance.core.quarantineReason).toBe('currency_mismatch');
    expect(provenance.core.inputHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
cross-env TZ=UTC vitest run tests/unit/contract/provenance-envelope.contract.test.ts --project=server
```

Expected:

- FAIL because `server/lib/rounds-provenance.ts` does not exist.

- [ ] **Step 3: Implement factories**

Create `server/lib/rounds-provenance.ts`:

```ts
import { canonicalSha256 } from '../../shared/lib/canonical-hash';
import type {
  ProvenanceEnvelope,
  StructuredWarning,
} from '../../shared/contracts/provenance-envelope.contract';
import { ProvenanceEnvelopeSchema } from '../../shared/contracts/provenance-envelope.contract';

type HashParams = {
  fundId: number;
  baseCurrency: string;
  activeRounds: unknown[];
  activeOverrides: unknown[];
  parentInvestments: unknown[];
  companies: unknown[];
};

type FactoryParams = {
  now: Date;
  hashParams: HashParams;
  structuredWarnings: StructuredWarning[];
  sourceAsOf?: string;
  staleAfterSeconds?: number;
};

export function buildRoundsInputHashInput(params: HashParams): HashParams {
  return {
    fundId: params.fundId,
    baseCurrency: params.baseCurrency,
    activeRounds: params.activeRounds,
    activeOverrides: params.activeOverrides,
    parentInvestments: params.parentInvestments,
    companies: params.companies,
  };
}

export function buildRoundsAssumptionsHashInput(): Record<
  string,
  string | number
> {
  return {
    rulesVersion: 'rounds-to-model-v1',
    amountTolerancePct: '0.01',
    minRoundReconciliationToleranceUsd: '25000',
    dateToleranceDays: 14,
    unsupportedSecurityTypePolicy: 'amount_only_or_unavailable',
    currencyPolicy: 'post_override_fund_base_currency',
    roleClassificationPolicy:
      'override_before_currency_decimal_initial_vs_followon',
  };
}

function hashes(
  hashParams: HashParams
): Pick<ProvenanceEnvelope['core'], 'inputHash' | 'assumptionsHash'> {
  return {
    inputHash: canonicalSha256(buildRoundsInputHashInput(hashParams)),
    assumptionsHash: canonicalSha256(buildRoundsAssumptionsHashInput()),
  };
}

export function makeLiveRoundsProvenance(
  params: FactoryParams
): ProvenanceEnvelope {
  return ProvenanceEnvelopeSchema.parse({
    trustState: 'LIVE',
    core: {
      sourceKind: 'computed',
      actionability: 'actionable',
      sourceEngine: 'rounds-to-model',
      engineVersion: 'rounds-to-model-v1',
      ...hashes(params.hashParams),
      generatedAt: params.now.toISOString(),
      isFinanciallyActionable: true,
      warnings: [],
    },
    structuredWarnings: params.structuredWarnings,
    sourceAsOf: params.sourceAsOf,
    staleAfterSeconds: params.staleAfterSeconds,
  });
}

export function makePartialRoundsProvenance(
  params: FactoryParams
): ProvenanceEnvelope {
  return ProvenanceEnvelopeSchema.parse({
    trustState: 'PARTIAL',
    core: {
      sourceKind: 'computed',
      actionability: 'input_only',
      sourceEngine: 'rounds-to-model',
      engineVersion: 'rounds-to-model-v1',
      ...hashes(params.hashParams),
      generatedAt: params.now.toISOString(),
      isFinanciallyActionable: false,
      warnings: [],
    },
    structuredWarnings: params.structuredWarnings,
    sourceAsOf: params.sourceAsOf,
    staleAfterSeconds: params.staleAfterSeconds,
  });
}

export function makeCurrencyBlockedProvenance(
  params: FactoryParams
): ProvenanceEnvelope {
  return ProvenanceEnvelopeSchema.parse({
    trustState: 'UNAVAILABLE',
    core: {
      sourceKind: 'computed',
      actionability: 'quarantined',
      sourceEngine: 'rounds-to-model',
      engineVersion: 'rounds-to-model-v1',
      ...hashes(params.hashParams),
      generatedAt: params.now.toISOString(),
      isFinanciallyActionable: false,
      quarantineReason: 'currency_mismatch',
      warnings: [],
    },
    structuredWarnings: params.structuredWarnings,
    sourceAsOf: params.sourceAsOf,
    staleAfterSeconds: params.staleAfterSeconds,
  });
}

export function makeAdapterFailedProvenance(params: {
  now: Date;
  message: string;
}): ProvenanceEnvelope {
  return ProvenanceEnvelopeSchema.parse({
    trustState: 'FAILED',
    core: {
      sourceKind: 'prototype_blocked',
      actionability: 'non_actionable',
      generatedAt: params.now.toISOString(),
      isFinanciallyActionable: false,
      quarantineReason: 'round_adapter_failed',
      warnings: [params.message],
    },
    structuredWarnings: [
      {
        code: 'ROUND_ADAPTER_FAILED',
        severity: 'blocking',
        message: params.message,
      },
    ],
  });
}
```

- [ ] **Step 4: Run tests and verify pass**

Run:

```powershell
cross-env TZ=UTC vitest run tests/unit/contract/provenance-envelope.contract.test.ts tests/unit/contract/rounds-to-model-evidence.contract.test.ts --project=server
```

Expected:

- PASS.

- [ ] **Step 5: Commit**

```powershell
git add server/lib/rounds-provenance.ts tests/unit/contract/provenance-envelope.contract.test.ts
git commit -m @"
Bind rounds provenance to explicit dataset hashes

The rounds evidence adapter needs hashes that describe real input and
assumption membership. Factory tests pin the exact objects so future changes
cannot silently make hashes decorative.

Constraint: PARTIAL and UNAVAILABLE computed envelopes must be hash-bound in PR-D
Rejected: Rely only on FinancialProvenanceSchema hash requirements | core only requires hashes for actionable computed results
Confidence: high
Scope-risk: narrow
Tested: cross-env TZ=UTC vitest run tests/unit/contract/provenance-envelope.contract.test.ts tests/unit/contract/rounds-to-model-evidence.contract.test.ts --project=server
Not-tested: Adapter integration
Co-authored-by: OmX <omx@oh-my-codex.dev>
"@
```

---

### Task 5: Override Schema + Migration

**Files:**

- Create: `shared/schema/investment-round-model-overrides.ts`
- Create:
  `server/migrations/20260624_investment_round_model_overrides_v1.up.sql`
- Create:
  `server/migrations/20260624_investment_round_model_overrides_v1.down.sql`
- Modify: `shared/schema.ts`
- Modify: `shared/schema/index.ts`

**Interfaces:**

- Consumes: `investmentRounds`, `funds`, `users`.
- Produces: `investmentRoundModelOverrides`, `InvestmentRoundModelOverride`,
  `InsertInvestmentRoundModelOverride`.

- [ ] **Step 1: Create migration up SQL**

Create `server/migrations/20260624_investment_round_model_overrides_v1.up.sql`:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS investment_rounds_id_fund_uq
  ON investment_rounds(id, fund_id);

CREATE TABLE IF NOT EXISTS investment_round_model_overrides (
  id SERIAL PRIMARY KEY,
  fund_id INTEGER NOT NULL REFERENCES funds(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  round_id INTEGER NOT NULL,
  override_role VARCHAR(32) NOT NULL,
  reason TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  supersedes_override_id INTEGER REFERENCES investment_round_model_overrides(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  idempotency_key VARCHAR(255),
  request_hash VARCHAR(64),
  CONSTRAINT investment_round_model_overrides_role_check
    CHECK (override_role IN ('initial', 'follow_on', 'amount_only'))
);

ALTER TABLE investment_round_model_overrides
  ADD CONSTRAINT investment_round_model_overrides_round_fund_fk
  FOREIGN KEY (round_id, fund_id) REFERENCES investment_rounds(id, fund_id)
  ON UPDATE RESTRICT ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS investment_round_model_overrides_supersedes_uq
  ON investment_round_model_overrides(supersedes_override_id)
  WHERE supersedes_override_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS investment_round_model_overrides_root_lineage_uq
  ON investment_round_model_overrides(fund_id, round_id)
  WHERE supersedes_override_id IS NULL;

CREATE INDEX IF NOT EXISTS investment_round_model_overrides_fund_round_idx
  ON investment_round_model_overrides(fund_id, round_id, created_at, id);
```

- [ ] **Step 2: Create migration down SQL**

Create
`server/migrations/20260624_investment_round_model_overrides_v1.down.sql`:

```sql
ALTER TABLE IF EXISTS investment_round_model_overrides
  DROP CONSTRAINT IF EXISTS investment_round_model_overrides_round_fund_fk;

DROP INDEX IF EXISTS investment_round_model_overrides_fund_round_idx;
DROP INDEX IF EXISTS investment_round_model_overrides_root_lineage_uq;
DROP INDEX IF EXISTS investment_round_model_overrides_supersedes_uq;

DROP TABLE IF EXISTS investment_round_model_overrides;

DROP INDEX IF EXISTS investment_rounds_id_fund_uq;
```

- [ ] **Step 3: Create Drizzle schema**

Create `shared/schema/investment-round-model-overrides.ts`:

```ts
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { funds } from './fund';
import { investmentRounds } from './investment-rounds';
import { users } from './user';

export const investmentRoundModelOverrides = pgTable(
  'investment_round_model_overrides',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),
    roundId: integer('round_id').notNull(),
    overrideRole: varchar('override_role', { length: 32 }).notNull(),
    reason: text('reason').notNull(),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    supersedesOverrideId: integer('supersedes_override_id').references(
      (): AnyPgColumn => investmentRoundModelOverrides.id,
      { onDelete: 'restrict', onUpdate: 'restrict' }
    ),
    idempotencyKey: varchar('idempotency_key', { length: 255 }),
    requestHash: varchar('request_hash', { length: 64 }),
  },
  (table) => ({
    overrideRoleCheck: check(
      'investment_round_model_overrides_role_check',
      sql`${table.overrideRole} IN ('initial', 'follow_on', 'amount_only')`
    ),
    roundFundFk: foreignKey({
      name: 'investment_round_model_overrides_round_fund_fk',
      columns: [table.roundId, table.fundId],
      foreignColumns: [investmentRounds.id, investmentRounds.fundId],
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    supersedesUniqueIdx: uniqueIndex(
      'investment_round_model_overrides_supersedes_uq'
    )
      .on(table.supersedesOverrideId)
      .where(sql`supersedes_override_id IS NOT NULL`),
    rootLineageUniqueIdx: uniqueIndex(
      'investment_round_model_overrides_root_lineage_uq'
    )
      .on(table.fundId, table.roundId)
      .where(sql`supersedes_override_id IS NULL`),
    fundRoundIdx: index('investment_round_model_overrides_fund_round_idx').on(
      table.fundId,
      table.roundId,
      table.createdAt,
      table.id
    ),
  })
);

export type InvestmentRoundModelOverride =
  typeof investmentRoundModelOverrides.$inferSelect;
export type InsertInvestmentRoundModelOverride =
  typeof investmentRoundModelOverrides.$inferInsert;
```

- [ ] **Step 4: Export schema**

Modify `shared/schema.ts` by adding:

```ts
export * from './schema/investment-round-model-overrides';
```

Modify `shared/schema/index.ts` by adding:

```ts
export * from './investment-round-model-overrides';
```

- [ ] **Step 5: Run focused checks**

Run:

```powershell
npm run check
```

Expected:

- PASS, or fail only on unrelated pre-existing baseline debt. If it fails,
  record exact output and do not widen the task without a direct schema-related
  cause.

- [ ] **Step 6: Commit**

```powershell
git add shared/schema/investment-round-model-overrides.ts shared/schema.ts shared/schema/index.ts server/migrations/20260624_investment_round_model_overrides_v1.up.sql server/migrations/20260624_investment_round_model_overrides_v1.down.sql
git commit -m @"
Persist round model override lineage for evidence reads

PR-D reads seeded override rows to classify round roles without adding admin
write routes. The schema constrains overrides to a single supersession lineage
per fund round so the adapter can fail closed on corrupt chains.

Constraint: PR-E owns override write routes and idempotency enforcement
Rejected: Defer idempotency columns | adding nullable columns now avoids a future table rewrite
Confidence: medium
Scope-risk: moderate
Tested: npm run check
Not-tested: Real database migration application
Co-authored-by: OmX <omx@oh-my-codex.dev>
"@
```

---

### Task 6: Rounds-to-Model Adapter

**Files:**

- Create: `server/services/rounds-to-model-evidence-service.ts`
- Test: `tests/unit/services/rounds-to-model-evidence-service.test.ts`

**Interfaces:**

- Consumes:
  - `db` by default, injectable database for tests.
  - `investmentRounds`, `investmentRoundModelOverrides`, `funds`, `investments`,
    `portfolioCompanies`.
  - `serializeRoundsToModelEvidence`.
  - `makeLiveRoundsProvenance`, `makePartialRoundsProvenance`,
    `makeCurrencyBlockedProvenance`, `makeAdapterFailedProvenance`.
- Produces:
  - `buildRoundsToModelEvidence(params): Promise<RoundsToModelEvidence>`

- [ ] **Step 1: Write failing adapter tests**

Create `tests/unit/services/rounds-to-model-evidence-service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildRoundsToModelEvidenceFromRows,
  type RoundsEvidenceRows,
} from '../../../server/services/rounds-to-model-evidence-service';

const now = new Date('2026-06-24T00:00:00.000Z');

const baseRows: RoundsEvidenceRows = {
  fund: { id: 10, baseCurrency: 'USD' },
  companies: [{ id: 101, name: 'Acme' }],
  investments: [{ id: 201, fundId: 10, companyId: 101 }],
  activeRounds: [
    {
      id: 1,
      fundId: 10,
      investmentId: 201,
      roundDate: '2024-01-15',
      createdAt: new Date('2024-01-16T00:00:00.000Z'),
      securityType: 'equity',
      currency: 'USD',
      investmentAmount: '500000.000000',
    },
    {
      id: 2,
      fundId: 10,
      investmentId: 201,
      roundDate: '2025-02-01',
      createdAt: new Date('2025-02-02T00:00:00.000Z'),
      securityType: 'safe',
      currency: 'USD',
      investmentAmount: '125000.000000',
    },
  ],
  activeOverrides: [],
};

describe('buildRoundsToModelEvidenceFromRows', () => {
  it('aggregates all active rounds without latest-only collapse', () => {
    const evidence = buildRoundsToModelEvidenceFromRows({
      fundId: 10,
      now,
      rows: baseRows,
    });

    expect(evidence.companies).toHaveLength(1);
    expect(evidence.companies[0]?.roundCount).toBe(2);
    expect(evidence.companies[0]?.initialAmount).toBe('500000.000000');
    expect(evidence.companies[0]?.followOnAmount).toBe('125000.000000');
    expect(evidence.coverage.activeRoundCount).toBe(2);
  });

  it('treats non-equity rounds as amount-only evidence', () => {
    const evidence = buildRoundsToModelEvidenceFromRows({
      fundId: 10,
      now,
      rows: baseRows,
    });

    const safeRound = evidence.companies[0]?.rounds.find(
      (round) => round.securityType === 'safe'
    );
    expect(safeRound?.amountOnly).toBe(true);
    expect(evidence.companies[0]?.amountOnlyNonEquityAmount).toBe(
      '125000.000000'
    );
    expect(evidence.coverage.warningsByCode.NON_EQUITY_AMOUNT_ONLY).toBe(1);
  });

  it('blocks mismatched currency after override classification', () => {
    const evidence = buildRoundsToModelEvidenceFromRows({
      fundId: 10,
      now,
      rows: {
        ...baseRows,
        activeRounds: [
          {
            ...baseRows.activeRounds[0],
            currency: 'EUR',
          },
        ],
      },
    });

    expect(evidence.provenance.trustState).toBe('UNAVAILABLE');
    expect(evidence.provenance.core.quarantineReason).toBe('currency_mismatch');
  });

  it('fails closed on override lineage crossing fund-round boundaries', () => {
    expect(() =>
      buildRoundsToModelEvidenceFromRows({
        fundId: 10,
        now,
        rows: {
          ...baseRows,
          activeOverrides: [
            {
              id: 1,
              fundId: 10,
              roundId: 1,
              overrideRole: 'initial',
              supersedesOverrideId: null,
              createdAt: new Date('2024-01-16T00:00:00.000Z'),
            },
            {
              id: 2,
              fundId: 10,
              roundId: 2,
              overrideRole: 'follow_on',
              supersedesOverrideId: 1,
              createdAt: new Date('2024-01-17T00:00:00.000Z'),
            },
          ],
        },
      })
    ).toThrow('Override lineage crosses fund-round boundaries');
  });

  it('serializes through the strict evidence boundary', () => {
    const evidence = buildRoundsToModelEvidenceFromRows({
      fundId: 10,
      now,
      rows: baseRows,
    });

    expect(evidence).not.toHaveProperty('shadowDiff');
    expect(evidence).not.toHaveProperty('candidateResponse');
    expect(evidence).not.toHaveProperty('exportEligibility');
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
cross-env TZ=UTC vitest run tests/unit/services/rounds-to-model-evidence-service.test.ts --project=server
```

Expected:

- FAIL because service does not exist.

- [ ] **Step 3: Implement row adapter and service boundary**

Create `server/services/rounds-to-model-evidence-service.ts`:

```ts
import { and, asc, eq, notExists } from 'drizzle-orm';

import { db } from '../db';
import { funds } from '../../shared/schema/fund';
import { investments, portfolioCompanies } from '../../shared/schema/portfolio';
import { investmentRounds } from '../../shared/schema/investment-rounds';
import { investmentRoundModelOverrides } from '../../shared/schema/investment-round-model-overrides';
import {
  serializeRoundsToModelEvidence,
  type RoundsToModelEvidence,
  type RoundModelRole,
} from '../../shared/contracts/rounds-to-model-evidence.contract';
import type { StructuredWarning } from '../../shared/contracts/provenance-envelope.contract';
import {
  makeCurrencyBlockedProvenance,
  makeLiveRoundsProvenance,
  makePartialRoundsProvenance,
} from '../lib/rounds-provenance';

type FundRow = { id: number; baseCurrency: string };
type CompanyRow = { id: number; name: string };
type InvestmentRow = { id: number; fundId: number; companyId: number | null };
type ActiveRoundRow = {
  id: number;
  fundId: number;
  investmentId: number;
  roundDate: string;
  createdAt: Date | null;
  securityType: 'equity' | 'convertible_note' | 'safe' | 'warrant' | 'other';
  currency: string;
  investmentAmount: string;
};
type ActiveOverrideRow = {
  id: number;
  fundId: number;
  roundId: number;
  overrideRole: 'initial' | 'follow_on' | 'amount_only';
  supersedesOverrideId: number | null;
  createdAt: Date;
};

export type RoundsEvidenceRows = {
  fund: FundRow;
  companies: CompanyRow[];
  investments: InvestmentRow[];
  activeRounds: ActiveRoundRow[];
  activeOverrides: ActiveOverrideRow[];
};

type BuildParams = {
  fundId: number;
  now: Date;
  rows: RoundsEvidenceRows;
};

function decimalAdd(left: string, right: string): string {
  const [leftWhole, leftFraction = ''] = left.split('.');
  const [rightWhole, rightFraction = ''] = right.split('.');
  const scale = 6;
  const leftUnits =
    BigInt(leftWhole) * 1_000_000n + BigInt(leftFraction.padEnd(scale, '0'));
  const rightUnits =
    BigInt(rightWhole) * 1_000_000n + BigInt(rightFraction.padEnd(scale, '0'));
  const sum = leftUnits + rightUnits;
  return `${sum / 1_000_000n}.${(sum % 1_000_000n).toString().padStart(scale, '0')}`;
}

function zeroDecimal(): string {
  return '0.000000';
}

function validateOverrideLineage(overrides: ActiveOverrideRow[]): void {
  const byId = new Map(overrides.map((override) => [override.id, override]));
  for (const override of overrides) {
    if (override.supersedesOverrideId === null) {
      continue;
    }
    const parent = byId.get(override.supersedesOverrideId);
    if (!parent) {
      continue;
    }
    if (
      parent.fundId !== override.fundId ||
      parent.roundId !== override.roundId
    ) {
      throw new Error('Override lineage crosses fund-round boundaries');
    }
  }
}

function latestOverrideByRound(
  overrides: ActiveOverrideRow[]
): Map<number, ActiveOverrideRow> {
  validateOverrideLineage(overrides);
  const superseded = new Set(
    overrides
      .map((override) => override.supersedesOverrideId)
      .filter((id): id is number => id !== null)
  );
  const active = overrides.filter((override) => !superseded.has(override.id));
  const byRound = new Map<number, ActiveOverrideRow>();
  for (const override of active) {
    if (byRound.has(override.roundId)) {
      throw new Error(
        `Multiple active overrides for round ${override.roundId}`
      );
    }
    byRound.set(override.roundId, override);
  }
  return byRound;
}

function roleForRound(params: {
  round: ActiveRoundRow;
  indexWithinInvestment: number;
  override?: ActiveOverrideRow;
}): RoundModelRole {
  if (params.override) {
    return params.override.overrideRole;
  }
  if (params.round.securityType !== 'equity') {
    return 'amount_only';
  }
  return params.indexWithinInvestment === 0 ? 'initial' : 'follow_on';
}

function addWarning(
  warnings: StructuredWarning[],
  code: StructuredWarning['code'],
  severity: StructuredWarning['severity'],
  message: string,
  source?: string
): void {
  warnings.push(
    source ? { code, severity, message, source } : { code, severity, message }
  );
}

export function buildRoundsToModelEvidenceFromRows(
  params: BuildParams
): RoundsToModelEvidence {
  const warnings: StructuredWarning[] = [];
  const byCompany = new Map(
    params.rows.companies.map((company) => [company.id, company])
  );
  const byInvestment = new Map(
    params.rows.investments.map((investment) => [investment.id, investment])
  );
  const overridesByRound = latestOverrideByRound(params.rows.activeOverrides);
  const roundsByInvestment = new Map<number, ActiveRoundRow[]>();

  for (const round of params.rows.activeRounds) {
    const rounds = roundsByInvestment.get(round.investmentId) ?? [];
    rounds.push(round);
    roundsByInvestment.set(round.investmentId, rounds);
  }

  const companyEvidence = new Map<
    number,
    {
      companyId: number;
      companyName: string;
      investmentIds: Set<number>;
      initialAmount: string;
      followOnAmount: string;
      amountOnlyNonEquityAmount: string;
      rounds: RoundsToModelEvidence['companies'][number]['rounds'];
      warnings: StructuredWarning[];
    }
  >();
  let currencyBlocked = false;

  for (const [
    investmentId,
    investmentRoundsForInvestment,
  ] of roundsByInvestment) {
    investmentRoundsForInvestment.sort((left, right) => {
      const byDate = left.roundDate.localeCompare(right.roundDate);
      if (byDate !== 0) return byDate;
      const byCreated = String(left.createdAt ?? '').localeCompare(
        String(right.createdAt ?? '')
      );
      if (byCreated !== 0) return byCreated;
      return left.id - right.id;
    });

    const investment = byInvestment.get(investmentId);
    if (!investment?.companyId) {
      addWarning(
        warnings,
        'ROLE_CLASSIFICATION_AMBIGUOUS',
        'warning',
        `Investment ${investmentId} has no parent company.`,
        `investment:${investmentId}`
      );
      continue;
    }
    const company = byCompany.get(investment.companyId);
    if (!company) {
      addWarning(
        warnings,
        'ROLE_CLASSIFICATION_AMBIGUOUS',
        'warning',
        `Company ${investment.companyId} was not loaded for investment ${investmentId}.`,
        `investment:${investmentId}`
      );
      continue;
    }

    const evidence = companyEvidence.get(company.id) ?? {
      companyId: company.id,
      companyName: company.name,
      investmentIds: new Set<number>(),
      initialAmount: zeroDecimal(),
      followOnAmount: zeroDecimal(),
      amountOnlyNonEquityAmount: zeroDecimal(),
      rounds: [],
      warnings: [],
    };
    evidence.investmentIds.add(investmentId);

    investmentRoundsForInvestment.forEach((round, indexWithinInvestment) => {
      const override = overridesByRound.get(round.id);
      const role = roleForRound({ round, indexWithinInvestment, override });
      const amountOnly =
        role === 'amount_only' || round.securityType !== 'equity';
      const roundWarnings: StructuredWarning[] = [];

      if (round.currency !== params.rows.fund.baseCurrency) {
        currencyBlocked = true;
        addWarning(
          warnings,
          'CURRENCY_MISMATCH_BLOCK',
          'blocking',
          `Round ${round.id} currency ${round.currency} does not match fund base currency ${params.rows.fund.baseCurrency}.`,
          `round:${round.id}`
        );
      }

      if (override) {
        addWarning(
          warnings,
          'ROUND_MODEL_OVERRIDE_APPLIED',
          'info',
          `Override ${override.id} applied to round ${round.id}.`,
          `round:${round.id}`
        );
      }

      if (amountOnly) {
        const warning = {
          code: 'NON_EQUITY_AMOUNT_ONLY' as const,
          severity: 'warning' as const,
          message: `Round ${round.id} is ${round.securityType} and contributes amount-only evidence.`,
          source: `round:${round.id}`,
        };
        warnings.push(warning);
        roundWarnings.push(warning);
        evidence.amountOnlyNonEquityAmount = decimalAdd(
          evidence.amountOnlyNonEquityAmount,
          round.investmentAmount
        );
      } else if (role === 'initial') {
        evidence.initialAmount = decimalAdd(
          evidence.initialAmount,
          round.investmentAmount
        );
      } else if (role === 'follow_on') {
        evidence.followOnAmount = decimalAdd(
          evidence.followOnAmount,
          round.investmentAmount
        );
      }

      evidence.rounds.push({
        roundId: round.id,
        investmentId: round.investmentId,
        companyId: company.id,
        roundDate: round.roundDate,
        securityType: round.securityType,
        role,
        currency: round.currency,
        investmentAmount: round.investmentAmount,
        amountOnly,
        overrideApplied: Boolean(override),
      });
      evidence.warnings.push(...roundWarnings);
    });

    companyEvidence.set(company.id, evidence);
  }

  if (params.rows.activeRounds.length === 0) {
    addWarning(
      warnings,
      'EMPTY_FUND',
      'info',
      'No active investment rounds were found.'
    );
  }

  const warningsByCode = warnings.reduce<Record<string, number>>(
    (record, warning) => {
      record[warning.code] = (record[warning.code] ?? 0) + 1;
      return record;
    },
    {}
  );
  const hashParams = {
    fundId: params.fundId,
    baseCurrency: params.rows.fund.baseCurrency,
    activeRounds: params.rows.activeRounds,
    activeOverrides: params.rows.activeOverrides,
    parentInvestments: params.rows.investments,
    companies: params.rows.companies,
  };
  const provenance = currencyBlocked
    ? makeCurrencyBlockedProvenance({
        now: params.now,
        hashParams,
        structuredWarnings: warnings,
      })
    : warnings.some(
          (warning) =>
            warning.severity === 'warning' || warning.severity === 'blocking'
        )
      ? makePartialRoundsProvenance({
          now: params.now,
          hashParams,
          structuredWarnings: warnings,
        })
      : makeLiveRoundsProvenance({
          now: params.now,
          hashParams,
          structuredWarnings: warnings,
        });

  return serializeRoundsToModelEvidence({
    fundId: params.fundId,
    baseCurrency: params.rows.fund.baseCurrency,
    generatedAt: params.now.toISOString(),
    companies: Array.from(companyEvidence.values()).map((company) => ({
      ...company,
      investmentIds: Array.from(company.investmentIds).sort(
        (left, right) => left - right
      ),
      roundCount: company.rounds.length,
    })),
    coverage: {
      companyCount: companyEvidence.size,
      investmentCount: params.rows.investments.length,
      activeRoundCount: params.rows.activeRounds.length,
      activeOverrideCount: params.rows.activeOverrides.length,
      warningsByCode,
    },
    provenance,
  });
}

export async function buildRoundsToModelEvidence(params: {
  fundId: number;
  now?: Date;
  database?: typeof db;
}): Promise<RoundsToModelEvidence> {
  const database = params.database ?? db;
  const now = params.now ?? new Date();
  const [fund] = await database
    .select({ id: funds.id, baseCurrency: funds.baseCurrency })
    .from(funds)
    .where(eq(funds.id, params.fundId))
    .limit(1);
  if (!fund) {
    throw new Error(`Fund ${params.fundId} was not found`);
  }

  const companies = await database
    .select({ id: portfolioCompanies.id, name: portfolioCompanies.name })
    .from(portfolioCompanies)
    .where(eq(portfolioCompanies.fundId, params.fundId))
    .orderBy(asc(portfolioCompanies.id));
  const parentInvestments = await database
    .select({
      id: investments.id,
      fundId: investments.fundId,
      companyId: investments.companyId,
    })
    .from(investments)
    .where(eq(investments.fundId, params.fundId))
    .orderBy(asc(investments.id));
  const supersedingRounds = investmentRounds;
  const activeRounds = await database
    .select({
      id: investmentRounds.id,
      fundId: investmentRounds.fundId,
      investmentId: investmentRounds.investmentId,
      roundDate: investmentRounds.roundDate,
      createdAt: investmentRounds.createdAt,
      securityType: investmentRounds.securityType,
      currency: investmentRounds.currency,
      investmentAmount: investmentRounds.investmentAmount,
    })
    .from(investmentRounds)
    .where(
      and(
        eq(investmentRounds.fundId, params.fundId),
        notExists(
          database
            .select({ id: supersedingRounds.id })
            .from(supersedingRounds)
            .where(eq(supersedingRounds.supersedesRoundId, investmentRounds.id))
        )
      )
    )
    .orderBy(
      asc(investmentRounds.investmentId),
      asc(investmentRounds.roundDate),
      asc(investmentRounds.createdAt),
      asc(investmentRounds.id)
    );
  const activeOverrides = await database
    .select({
      id: investmentRoundModelOverrides.id,
      fundId: investmentRoundModelOverrides.fundId,
      roundId: investmentRoundModelOverrides.roundId,
      overrideRole: investmentRoundModelOverrides.overrideRole,
      supersedesOverrideId: investmentRoundModelOverrides.supersedesOverrideId,
      createdAt: investmentRoundModelOverrides.createdAt,
    })
    .from(investmentRoundModelOverrides)
    .where(eq(investmentRoundModelOverrides.fundId, params.fundId))
    .orderBy(
      asc(investmentRoundModelOverrides.roundId),
      asc(investmentRoundModelOverrides.createdAt),
      asc(investmentRoundModelOverrides.id)
    );

  return buildRoundsToModelEvidenceFromRows({
    fundId: params.fundId,
    now,
    rows: {
      fund,
      companies,
      investments: parentInvestments,
      activeRounds: activeRounds as ActiveRoundRow[],
      activeOverrides: activeOverrides as ActiveOverrideRow[],
    },
  });
}
```

- [ ] **Step 4: Run adapter tests**

Run:

```powershell
cross-env TZ=UTC vitest run tests/unit/services/rounds-to-model-evidence-service.test.ts --project=server
```

Expected:

- PASS.

- [ ] **Step 5: Commit**

```powershell
git add server/services/rounds-to-model-evidence-service.ts tests/unit/services/rounds-to-model-evidence-service.test.ts
git commit -m @"
Adapt active rounds into strict model evidence

The adapter reads every non-superseded round and emits strict evidence without
changing live ranking behavior. Currency and override corruption fail closed
through provenance instead of leaking ambiguous model inputs.

Constraint: PR-D must remain read-only and route-free
Rejected: Latest-only round selection | follow-on rounds are active evidence, not superseded history
Confidence: medium
Scope-risk: moderate
Tested: cross-env TZ=UTC vitest run tests/unit/services/rounds-to-model-evidence-service.test.ts --project=server
Not-tested: Full server test project
Co-authored-by: OmX <omx@oh-my-codex.dev>
"@
```

---

### Task 7: Live MOIC Freeze Regression

**Files:**

- Modify: `tests/unit/services/fund-moic-ranking-service.test.ts`

**Interfaces:**

- Consumes: `getFundMoicRankings(fundId: number)`.
- Produces: a regression proving the service reads `portfolioCompanies`, not
  `investmentRounds`, and passes `followOnAmount: null`.

- [ ] **Step 1: Add DB-path regression test**

Modify `tests/unit/services/fund-moic-ranking-service.test.ts` by adding a
module mock before importing the service:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();
const investmentRoundsFindMany = vi.fn();

vi.mock('../../../server/db', () => ({
  db: {
    query: {
      portfolioCompanies: { findMany },
      investmentRounds: { findMany: investmentRoundsFindMany },
    },
  },
}));
```

Add this test:

```ts
it('keeps live rankings sourced from portfolioCompanies and ignores investment_rounds', async () => {
  findMany.mockResolvedValue([
    {
      id: 101,
      name: 'Acme',
      investmentAmount: 500_000,
      currentValuation: 1_500_000,
      plannedReservesCents: 300_000_00,
      exitMoicBps: 35000,
      investmentDate: new Date('2022-01-01T00:00:00.000Z'),
    },
  ]);

  const { getFundMoicRankings } =
    await import('../../../server/services/fund-moic-ranking-service');
  const result = await getFundMoicRankings(10);

  expect(findMany).toHaveBeenCalledOnce();
  expect(investmentRoundsFindMany).not.toHaveBeenCalled();
  expect(result.provenance.source).toBe('portfolio_companies');
  expect(result.provenance.metricBasis).toBe('planned_reserves');
  expect(result.rankings).toHaveLength(1);
});
```

- [ ] **Step 2: Run focused test**

Run:

```powershell
cross-env TZ=UTC vitest run tests/unit/services/fund-moic-ranking-service.test.ts --project=server
```

Expected:

- PASS.

- [ ] **Step 3: Commit**

```powershell
git add tests/unit/services/fund-moic-ranking-service.test.ts
git commit -m @"
Freeze live MOIC rankings away from rounds evidence

PR-D adds a read-only evidence adapter but live MOIC rankings must continue to
use portfolio company planned reserves until a later explicit promotion PR.

Constraint: PR-D must not alter live MOIC ranking behavior
Rejected: Wire rounds evidence into getFundMoicRankings | route/render promotion is PR-E scope
Confidence: high
Scope-risk: narrow
Tested: cross-env TZ=UTC vitest run tests/unit/services/fund-moic-ranking-service.test.ts --project=server
Not-tested: Full server test project
Co-authored-by: OmX <omx@oh-my-codex.dev>
"@
```

---

### Task 8: Client Financial-Claim Guardrail

**Files:**

- Create: `scripts/guardrails/no-client-round-derived-financial-claims.mjs`
- Modify: `package.json`

**Interfaces:**

- Consumes: client files under `client/src`.
- Produces: npm script `guard:round-derived-financial-claims:check`.

- [ ] **Step 1: Create guardrail script**

Create `scripts/guardrails/no-client-round-derived-financial-claims.mjs`:

```js
#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const tracked = execFileSync('git', ['ls-files', 'client/src'], {
  cwd: root,
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean);

const bannedPatterns = [
  /investmentRounds.*(moic|irr|tvpi|dpi|valuation|reserve)/i,
  /(moic|irr|tvpi|dpi|valuation|reserve).*investmentRounds/i,
  /roundsToModel.*(ranking|financial|metric|moic)/i,
];

const allowlist = new Set([
  'client/src/components/investments/InvestmentRoundsSection.tsx',
  'client/src/hooks/useInvestmentRounds.ts',
]);

const violations = [];

for (const file of tracked) {
  if (allowlist.has(file)) {
    continue;
  }
  const absolute = resolve(root, file);
  const content = readFileSync(absolute, 'utf8');
  for (const pattern of bannedPatterns) {
    if (pattern.test(content)) {
      violations.push(relative(root, absolute));
      break;
    }
  }
}

if (violations.length > 0) {
  console.error('Client round-derived financial claim guardrail failed:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('Client round-derived financial claim guardrail passed.');
```

- [ ] **Step 2: Run guardrail before wiring**

Run:

```powershell
node scripts/guardrails/no-client-round-derived-financial-claims.mjs
```

Expected:

- PASS. If it fails on existing legitimate display files, add those exact files
  to the allowlist and rerun.

- [ ] **Step 3: Wire guardrail only after it passes**

Modify `package.json` scripts:

```json
"guard:round-derived-financial-claims:check": "node scripts/guardrails/no-client-round-derived-financial-claims.mjs",
"guardrails:check": "npm run guard:console:check && npm run guard:eslint-disable:check && npm run guard:scripts:check && npm run guard:route-imports:check && npm run guard:financial-placeholders:check && npm run guard:round-derived-financial-claims:check"
```

- [ ] **Step 4: Run lint**

Run:

```powershell
npm run lint
```

Expected:

- PASS.

- [ ] **Step 5: Commit**

```powershell
git add scripts/guardrails/no-client-round-derived-financial-claims.mjs package.json
git commit -m @"
Guard against premature client round-derived metrics

PR-D keeps rounds evidence read-only and server-side. A narrow guardrail blocks
new client claims that derive financial metrics directly from investment rounds
before PR-E promotes the evidence surface.

Constraint: Existing client round display remains allowed
Rejected: Ban all investmentRounds client usage | current UI legitimately displays rounds
Confidence: medium
Scope-risk: narrow
Tested: npm run lint
Not-tested: Full release gate
Co-authored-by: OmX <omx@oh-my-codex.dev>
"@
```

---

### Task 9: Final Verification + PR Description

**Files:**

- No required source changes.
- Optional create: `.claude/artifacts/pr-d-provenance-envelope-pr-body.md` only
  if the implementation lane uses `.claude/artifacts` for PR bodies and keeps it
  out of commit unless explicitly requested.

**Interfaces:**

- Consumes all prior task commits.
- Produces verified branch and PR-ready evidence.

- [ ] **Step 1: Run contract tests**

Run:

```powershell
cross-env TZ=UTC vitest run tests/unit/contract/provenance-envelope.contract.test.ts tests/unit/contract/rounds-to-model-evidence.contract.test.ts --project=server
```

Expected:

- PASS.

- [ ] **Step 2: Run service tests**

Run:

```powershell
cross-env TZ=UTC vitest run tests/unit/services/rounds-to-model-evidence-service.test.ts tests/unit/services/fund-moic-ranking-service.test.ts --project=server
```

Expected:

- PASS.

- [ ] **Step 3: Run final gates**

Run:

```powershell
npm run policy:verify
npm run lint
npm run check
npm run test -- --project=server
npm run release:check
```

Expected:

- PASS for each command.
- If Windows local proof is unreliable, rerun `npm run release:check` in a
  supported native WSL Node 20 environment and report the environment boundary
  explicitly.

- [ ] **Step 4: Verify migration path wording**

Do not claim `npm run db:push` ran the hand-written migration. Use this wording
in PR notes:

```md
Hand-written SQL lives under
`server/migrations/20260624_investment_round_model_overrides_v1.{up,down}.sql`.
Drizzle schema exports are kept in sync. `npm run db:push` is only a
disposable-database schema compatibility check, not proof that the hand-written
migration path ran.
```

- [ ] **Step 5: Draft PR body**

Use this PR body structure:

```md
## Scope

PR-D introduces a strict, hash-bound dataset provenance envelope and a read-only
rounds-to-model evidence adapter over all non-superseded investment rounds, with
override-aware currency blocking and amount-only non-equity handling; it does
not alter live MOIC rankings, add routes, expose shadow/candidate responses, or
enforce render blocking.

## Baseline

- Baseline: `e8113431`
- Branch: `claude/beautiful-heisenberg-btcsmw`
- Checkout isolation: [state whether direct clean branch or isolated worktree
  was used]

## What Changed

- Added strict provenance envelope contract around existing
  `FinancialProvenanceSchema`.
- Added strict rounds-to-model evidence contract and serialization boundary.
- Added read-only override persistence schema and SQL migration.
- Added read-only rounds evidence adapter over all non-superseded rounds.
- Added MOIC regression proving live rankings still ignore `investment_rounds`.
- Added narrow guardrail against premature client financial derivation from
  rounds.

## Out of Scope

- Routes and render enforcement.
- `DATA_STALE` route-policy promotion.
- Shadow controller.
- Reconciliation persistence.
- Canonical MOIC route.
- `fund_calculation_modes`.
- Override write/admin routes and write-path idempotency.

## Verification

- [paste exact commands and pass/fail results]

## Migration Notes

[paste Task 9 Step 4 wording]
```

- [ ] **Step 6: Final status check**

Run:

```powershell
git status --short
git log --oneline --max-count=8
```

Expected:

- Only intentional PR-D files are modified or committed.
- Unrelated root checkout dirt remains untouched if execution used a worktree.

---

## Migration Proof Boundary

The implementation must distinguish three different checks:

1. `server/migrations/20260624_investment_round_model_overrides_v1.up.sql` and
   `.down.sql` exist and are internally reversible.
2. Drizzle schema exports compile and stay aligned with SQL intent.
3. `npm run db:push`, if run, proves disposable-database schema compatibility
   only. It does not prove the hand-written migration runner applied the SQL
   file.

Do not collapse these into one generic "migration applied" claim.

## Out of Scope for PR-E

- HTTP route for rounds-to-model evidence.
- Render blocking via `staleBlocksRender`.
- `DATA_STALE` promotion into route policy.
- Shadow/candidate response controller.
- Reconciliation persistence.
- Canonical MOIC route.
- `fund_calculation_modes`.
- `LIVE imported_actual` promotion.
- Override write/admin routes.
- Override write-path idempotency enforcement.

## Self-Review Checklist

- Spec coverage:
  - Provenance envelope: Task 2 and Task 4.
  - Evidence contract: Task 3.
  - Override persistence: Task 5.
  - Active all-round adapter: Task 6.
  - MOIC unchanged: Task 7.
  - Guardrail: Task 8.
  - Verification and PR body: Task 9.
- Placeholder scan:
  - No placeholder markers or unconstrained generic edge-case instructions
    remain.
- Type consistency:
  - `ProvenanceEnvelope` is produced by Task 2 and consumed by Tasks 3 and 4.
  - `RoundsToModelEvidence` is produced by Task 3 and returned by Task 6.
  - `RoundModelRole` values match override roles: `initial`, `follow_on`,
    `amount_only`.
- Execution safety:
  - Dirty checkout handling is explicit.
  - Migration proof boundary is explicit.
  - Live MOIC remains frozen.
