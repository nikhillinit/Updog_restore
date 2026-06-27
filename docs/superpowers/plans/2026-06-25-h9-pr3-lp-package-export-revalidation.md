# H9 PR3 — LP Package H9 Export Revalidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the LP report-package export surfaces fail-closed on stale/non-actionable H9 metadata: stamp the H9 fingerprint at package assembly, and block render/export when the stored fingerprint no longer matches the current source.

**Architecture:** H9 actionability already lives as columns on `lp_report_packages` (stamped at assembly) and is recomputed at export through a single shared gate (`assertH9ExportActionable`) that re-resolves the current fingerprint on the request's database/transaction and blocks on mismatch. Export-time revalidation is the authoritative gate (no advisory lock — existing `FOR UPDATE` row locks already serialize assembly). Realized-proceeds hygiene is fixed at metric-run commit, where the events actually load.

**Tech Stack:** TypeScript, Express, Drizzle/PostgreSQL, Zod, Vitest, prom-client.

---

## EXECUTION CONTRACT (read first — this is a Hermes-orchestrated repo)

This plan is implemented by an **orchestrator (Claude Code)** that writes+runs tests, and **Hermes (codex)** that makes every source edit. This division is load-bearing:

- **Hermes postflight is ONLY `npm run check`.** It never runs vitest/calc-gate/Testcontainers. Every `npx vitest` line below is therefore invisible to Hermes — the **orchestrator** runs it. "Hermes done + check passes" is NOT proof a test passes.
- **Structure every task RED → GREEN:** orchestrator writes the test and runs it to confirm it FAILS (RED); Hermes implements; orchestrator runs it again to confirm GREEN. The tests are the spec.
- **Dispatch Hermes** with `node orchestrate.js --phase production` from the Bash tool with `dangerouslyDisableSandbox: true`. If `npm run hermes:production` exits 126, call `orchestrate.js` directly.
- **Keep the `--task` string keyword-light** — dense financial keywords (MOIC/reserve/fee/LP/pacing) self-promote the dispatch to the heavy calc-gate specialist. Put the real instructions in a temp file under the scratchpad and pass a pointer.
- **Add an import + its first use in the SAME Hermes edit** — a lint auto-fix hook strips a momentarily-unused import between edits.
- **vitest invocation:** `TZ=UTC npx vitest run <path> --project=server --configLoader native`.
- **No migration.** All `lp_report_packages` H9 columns + 2 CHECK constraints already landed in PR1 (`shared/schema/lp-reporting-evidence.ts:510-537`). If any schema delta appears, introspect with psql `\d` before claiming done — `db:push` exits 0 even on error.
- **Commit per task.** Use `git commit --no-verify` only if the pre-commit hook exceeds the 2-minute tool timeout, and only after manual validation (`npm run check` + the task's test + `npx eslint <changed files>`).
- After each Hermes batch, `git status --short` to confirm no files changed outside the task's scope.

### Baseline / preflight (run once before Task 1)

- [ ] **Confirm baseline + green tree**

Run:
```bash
git checkout main && git pull --ff-only
git log --oneline -3   # expect 3e1f7ad6 H9 Lane E merged at or near HEAD
git checkout -b feat/h9-pr3-export-revalidation
TZ=UTC npx vitest run tests/unit/services/fund-calculation-mode-service.test.ts --project=server --configLoader native
```
Expected: branch created from current main; the resolver suite passes (proves the resolver API this plan depends on is intact).

---

## Verified ground truth (do NOT re-derive — confirmed against main `3e1f7ad6`)

- **Resolver:** `createMoicActionabilityResolver({database}).resolveForFund(fundId)` returns
  `{ sourceFingerprintMatches: boolean; actionability: 'actionable'|'non_actionable'; actionabilityStatus; sourceFingerprint: { moicSourceInputHash, roundEvidenceInputHash, roundEvidenceAssumptionsHash, fingerprintHash, policyVersion }; acceptedReconciliationRunId }`
  (`server/services/fund-calculation-mode-service.ts:292,335-338`). `MoicActionabilityResolveInput` is `{ fundId, sources?, evidence? }` — **no `database` field**; `resolveMoicActionability(input)` is bound to the module `db`, so it is WRONG for an in-transaction recheck. Use the **factory** bound to `tx`.
- **Stamp mapper:** `toH9SnapshotColumns(result)` → `{ h9MoicSourceInputHash, h9RoundEvidenceInputHash, h9RoundEvidenceAssumptionsHash, h9FingerprintHash, h9PolicyVersion, h9ActionabilityStatus }` (`:349-358`). The resolver always builds the full fingerprint, so even `non_actionable` rows carry all hashes (satisfies the `lp_report_packages_h9_actionable_fingerprint_check` CHECK).
- **Resolver output is 2-valued** (`actionable`/`non_actionable`, `:322-324`) — never `input_only`/`quarantined`/`unknown_legacy`. The export gate's `=== 'actionable'` and `H9_NOT_ACTIONABLE` cover all non-actionable cases; do not branch on the unused statuses.
- **Package row carries H9:** `lpReportPackages` has `h9ActionabilityStatus`, `h9FingerprintHash`, `h9PolicyVersion`, `h9MoicSourceInputHash`, `h9RoundEvidenceInputHash`, `h9RoundEvidenceAssumptionsHash` (all `string | null`). The `LpReportPackage` row type from `@shared/schema/lp-reporting-evidence` includes them.
- **Assembly:** `assembleMetricRunReportPackage` (`report-package-service.ts:563`) runs inside `withTransaction(database, …, async (tx) => …)`, locks the metric-run row `FOR UPDATE`, has an idempotent replay branch (`:599-608`, returns `inserted:false` on refs/payload/version match), and inserts via `tx.insert(lpReportPackages).values(insertValues(...)).onConflictDoNothing(...).returning()` (`:611-615`), mapping with `toReportPackageRecord(row)`.
- **Export surfaces (4 entry points):**
  - render-model: `getMetricRunReportPackageRenderModel(input, options)` (`report-package-render-model-service.ts:334`), loads the raw row via `loadReportPackage(database, fundId, metricRunId)` (`:132`).
  - live json: `getMetricRunReportPackageJsonExport(input, options)` (`report-package-json-export-service.ts:163`).
  - stored json: artifact GET `getMetricRunReportPackageStoredJsonArtifact` (`report-package-json-stored-export-service.ts:278`, parses `existing.artifactPayload`); status GET `getMetricRunReportPackageStoredJsonExport` (`:267`, returns `status:'ready'` with no H9 check).
  - stored csv: artifact GET `getMetricRunReportPackageStoredCsvArtifact` (`report-package-csv-stored-export-service.ts:483`); status GET `getMetricRunReportPackageStoredCsvExport` (`:466`).
- **Metric idiom:** `getOrCreateCounter(name, help, labelNames)` (module-private, `server/metrics.ts:12`); exported counters like `export const httpRequestTotal = getOrCreateCounter(...)` (`:79`). `.inc({label:value})`.
- **Contracts:** `ReportPackageRecordSchema` (`lp-report-package.contract.ts:63`) has no H9 field yet. Existing export blocker enum `ReportPackageJsonExportBlockerCodeSchema` (`lp-report-package-json-export.contract.ts:145-149`) is evidence-specific; existing 409 idiom is `EXPORT_CONTENT_HASH_CONFLICT`. `ReportPackageExportRecordSchema` (`:51-68`) has `status: 'ready'`.
- **Realized proceeds:** `loadSources` (`metric-run-commit-service.ts:251`) loads cash-flow events by id and already calls `assertRowsBelongToFund(fundId, eventRows, markRows)` (`:276`) — **fund scope already exists, do not re-add it.** Event rows expose `amount`, `status` (`['draft','approved','locked','reversed']`, `cash-flow-event.contract.ts:183`), and `reversalOfEventId`. `MetricRunCommitError(status, code, message, details?)` (`:47`).
- **Latent bug (optional fix):** `generateLockKey` (`server/lib/locks.ts:25-30`) returns an unsigned bigint that can exceed `int8` max.

---

## File Structure

**Create:**
- `server/services/lp-reporting/h9-export-gate.ts` — the single shared export gate (resolve → compare → block + metric). One responsibility: turn a stored package row + fundId into "serve or throw `H9ExportBlockedError`".
- Test files (see each task).

**Modify:**
- `shared/contracts/lp-reporting/lp-report-package.contract.ts` — `ReportPackageH9MetadataSchema` + nullable `h9Metadata` on `ReportPackageRecordSchema`.
- `server/metrics.ts` — the blocks counter.
- `server/services/lp-reporting/report-package-service.ts` — stamp at insert + write-time recheck + map `h9Metadata`.
- `server/services/lp-reporting/report-package-render-model-service.ts` — call the gate.
- `server/services/lp-reporting/report-package-json-export-service.ts` — call the gate.
- `server/services/lp-reporting/report-package-json-stored-export-service.ts` — gate the artifact GET + surface H9 on the status GET.
- `server/services/lp-reporting/report-package-csv-stored-export-service.ts` — gate the artifact GET + surface H9 on the status GET.
- `server/services/lp-reporting/metric-run-commit-service.ts` — realized-proceeds hygiene at load.
- (optional) `server/lib/locks.ts` — `BigInt.asIntN(64, …)`.

**Design decisions baked in (do not relitigate):**
1. **No advisory lock** (Decision 1). Export revalidation is the authoritative, isolation-independent gate; the existing `FOR UPDATE` row locks already serialize same-run assembly.
2. **Replay stays idempotent** (Decision 2). Do NOT add an H9 check to the replay branch. Replay after source drift returns the stored package (`inserted:false`); the export gate blocks it. There is a CRITICAL regression test for this (Task 11).
3. **In-transaction resolve via the factory** (`createMoicActionabilityResolver({database: tx}).resolveForFund(fundId)`), never `resolveMoicActionability({fundId, database})`.
4. **H9 stays on the package columns, not the at-rest artifact payload.** The gate reads the row. The stored export artifact schema is UNCHANGED → legacy artifacts never hit a required-field parse error. Outward responses expose H9 from the row.
5. **Stamp and write-time recheck are two distinct resolves** (drift detection). Never memoize them together. The export gate resolves once per request.

---

## Lane map (for parallel worktrees, optional)

- **Lane A (foundation):** Tasks 1-3 — contracts, metric, shared gate. No deps.
- **Lane B (assembly):** Tasks 4-5, 11 — depends on Lane A.
- **Lane C (export ×4):** Tasks 6-9 — depends on Lane A (gate).
- **Lane D (commit hygiene):** Task 10 — independent of A/B/C.
- **Optional:** Task 12.

Execute A first; then B ∥ C ∥ D in parallel worktrees (disjoint files); merge after A. If executing in a single session, run sequentially in task order.

---

(Tasks 1-12 follow in subsequent sections of this document.)

---

## Task 1: H9 metadata contract on the package record (Lane A)

**Files:**
- Modify: `shared/contracts/lp-reporting/lp-report-package.contract.ts`
- Test: `tests/unit/contract/report-package-h9-metadata.contract.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/contract/report-package-h9-metadata.contract.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  ReportPackageH9MetadataSchema,
  ReportPackageRecordSchema,
} from '@shared/contracts/lp-reporting/lp-report-package.contract';

const h9 = {
  moicSourceInputHash: 'a'.repeat(64),
  roundEvidenceInputHash: 'b'.repeat(64),
  roundEvidenceAssumptionsHash: 'c'.repeat(64),
  fingerprintHash: 'd'.repeat(64),
  policyVersion: 'h9-policy-v1',
  actionabilityStatus: 'actionable' as const,
};

const baseRecord = {
  reportPackageId: 1,
  fundId: 7,
  metricRunId: 3,
  status: 'assembled' as const,
  asOfDate: '2026-06-01',
  metricRunVersion: 1,
  metricRunLockedBy: 1,
  metricRunLockedAt: '2026-06-01T00:00:00.000Z',
  narrativeRefs: [],
  payload: {
    payloadVersion: 1 as const,
    results: { kpis: [] },
    diagnostics: { warnings: [] },
    sourceEventIds: [],
    sourceMarkIds: [],
    evidenceRecordIds: [],
    narratives: [],
  },
  assembledBy: 1,
  assembledAt: '2026-06-01T00:00:00.000Z',
  version: 1,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
};

describe('ReportPackageH9MetadataSchema', () => {
  it('accepts a full H9 metadata object', () => {
    expect(ReportPackageH9MetadataSchema.parse(h9)).toEqual(h9);
  });

  it('rejects an unknown actionability status', () => {
    expect(() => ReportPackageH9MetadataSchema.parse({ ...h9, actionabilityStatus: 'bogus' })).toThrow();
  });
});

describe('ReportPackageRecordSchema h9Metadata', () => {
  it('accepts a record with null h9Metadata (legacy)', () => {
    const r = ReportPackageRecordSchema.parse({ ...baseRecord, h9Metadata: null });
    expect(r.h9Metadata).toBeNull();
  });

  it('accepts a record with full h9Metadata', () => {
    const r = ReportPackageRecordSchema.parse({ ...baseRecord, h9Metadata: h9 });
    expect(r.h9Metadata?.fingerprintHash).toBe('d'.repeat(64));
  });
});
```

NOTE: if the `results`/`diagnostics` shapes in `baseRecord.payload` fail to parse, copy a valid `payload` fixture from `tests/fixtures/lp-report-fixtures.ts` or an existing `report-package-*.test.ts`. The H9 assertions are what matter; keep the rest minimally valid.

- [ ] **Step 2: Run test to verify it fails**

Run: `TZ=UTC npx vitest run tests/unit/contract/report-package-h9-metadata.contract.test.ts --project=server --configLoader native`
Expected: FAIL — `ReportPackageH9MetadataSchema` is not exported.

- [ ] **Step 3: Hermes implements the contract**

Edit `shared/contracts/lp-reporting/lp-report-package.contract.ts`. Add to the imports:
```ts
import { H9ActionabilityStatusSchema } from '../h9-actionability.contract';
```
Add after `ReportPackagePayloadSchema` (before `ReportPackageRecordSchema`):
```ts
export const ReportPackageH9MetadataSchema = z
  .object({
    moicSourceInputHash: z.string().min(1),
    roundEvidenceInputHash: z.string().min(1),
    roundEvidenceAssumptionsHash: z.string().min(1),
    fingerprintHash: z.string().min(1),
    policyVersion: z.string().min(1),
    actionabilityStatus: H9ActionabilityStatusSchema,
  })
  .strict();
```
Add a field inside `ReportPackageRecordSchema`'s `.object({ ... })` (e.g. right after `payload`):
```ts
    h9Metadata: ReportPackageH9MetadataSchema.nullable(),
```
Add the type export beside the other `export type` lines:
```ts
export type ReportPackageH9Metadata = z.infer<typeof ReportPackageH9MetadataSchema>;
```
Constraint: import + first use in the same edit; only this file changes.

- [ ] **Step 4: Run test to verify it passes**

Run: `TZ=UTC npx vitest run tests/unit/contract/report-package-h9-metadata.contract.test.ts --project=server --configLoader native`
Expected: PASS (4 tests).

NOTE: making `h9Metadata` required on `ReportPackageRecordSchema` (it is required-but-nullable) breaks existing assembly/render suites that build a record without the key. That is intended — Tasks 4 & 6 populate it. Do NOT loosen the schema to make those go green. Run `TZ=UTC npx vitest run tests/unit/services/lp-reporting --project=server --configLoader native` and note which suites now need `h9Metadata`.

- [ ] **Step 5: Commit**

```bash
git add shared/contracts/lp-reporting/lp-report-package.contract.ts tests/unit/contract/report-package-h9-metadata.contract.test.ts
git commit -m "feat(h9): add report-package H9 metadata contract (PR3 Lane A)"
```

---

## Task 2: Prometheus blocks counter (Lane A)

**Files:**
- Modify: `server/metrics.ts`
- Test: `tests/unit/metrics/h9-actionability-blocks-metric.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/metrics/h9-actionability-blocks-metric.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { moicActionabilityBlocksTotal, register } from '../../../server/metrics';

describe('povc_fund_moic_actionability_blocks_total', () => {
  it('is registered with surface + blocker_code labels', async () => {
    moicActionabilityBlocksTotal.inc({ surface: 'render_model', blocker_code: 'h9_not_actionable' });
    const metrics = await register.getMetricsAsJSON();
    const found = metrics.find((m) => m.name === 'povc_fund_moic_actionability_blocks_total');
    expect(found).toBeDefined();
    const sample = found?.values.find(
      (v) => v.labels.surface === 'render_model' && v.labels.blocker_code === 'h9_not_actionable'
    );
    expect(sample?.value).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `TZ=UTC npx vitest run tests/unit/metrics/h9-actionability-blocks-metric.test.ts --project=server --configLoader native`
Expected: FAIL — `moicActionabilityBlocksTotal` is not exported.

- [ ] **Step 3: Hermes implements the counter**

Edit `server/metrics.ts` — add beside the other `export const … = getOrCreateCounter(...)` definitions:
```ts
export const moicActionabilityBlocksTotal = getOrCreateCounter(
  'povc_fund_moic_actionability_blocks_total',
  'Count of LP report-package render/export operations blocked by H9 actionability gating',
  ['surface', 'blocker_code']
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `TZ=UTC npx vitest run tests/unit/metrics/h9-actionability-blocks-metric.test.ts --project=server --configLoader native`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/metrics.ts tests/unit/metrics/h9-actionability-blocks-metric.test.ts
git commit -m "feat(h9): register actionability-blocks counter (PR3 Lane A)"
```

---

## Task 3: Shared export gate `assertH9ExportActionable` (Lane A — the core)

**Files:**
- Create: `server/services/lp-reporting/h9-export-gate.ts`
- Test: `tests/unit/services/lp-reporting/h9-export-gate.test.ts`

This is the single authoritative gate. It reads a stored package's H9 columns, re-resolves the current fingerprint on the provided database/transaction, and throws a typed `H9ExportBlockedError` (incrementing the metric) on any failure. All four export surfaces call it.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/services/lp-reporting/h9-export-gate.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveForFund } = vi.hoisted(() => ({ resolveForFund: vi.fn() }));
const { inc } = vi.hoisted(() => ({ inc: vi.fn() }));

vi.mock('../../../../server/services/fund-calculation-mode-service', () => ({
  createMoicActionabilityResolver: () => ({ resolveForFund }),
}));
vi.mock('../../../../server/metrics', () => ({
  moicActionabilityBlocksTotal: { inc },
}));

import {
  assertH9ExportActionable,
  H9ExportBlockedError,
} from '../../../../server/services/lp-reporting/h9-export-gate';

const FP = 'd'.repeat(64);
const POLICY = 'h9-policy-v1';

function storedActionable(overrides: Record<string, unknown> = {}) {
  return {
    h9MoicSourceInputHash: 'a'.repeat(64),
    h9RoundEvidenceInputHash: 'b'.repeat(64),
    h9RoundEvidenceAssumptionsHash: 'c'.repeat(64),
    h9FingerprintHash: FP,
    h9PolicyVersion: POLICY,
    h9ActionabilityStatus: 'actionable',
    ...overrides,
  };
}

function currentResult(overrides: Record<string, unknown> = {}) {
  return {
    actionability: 'actionable',
    sourceFingerprint: { fingerprintHash: FP, policyVersion: POLICY },
    ...overrides,
  };
}

const call = (stored: Record<string, unknown>) =>
  assertH9ExportActionable({ surface: 'render_model', fundId: 7, stored: stored as never, database: {} });

beforeEach(() => {
  vi.clearAllMocks();
  resolveForFund.mockResolvedValue(currentResult());
});

describe('assertH9ExportActionable', () => {
  it('passes when stored is actionable and the fingerprint matches the current resolve', async () => {
    await expect(call(storedActionable())).resolves.toBeUndefined();
    expect(inc).not.toHaveBeenCalled();
  });

  it('blocks H9_METADATA_MISSING for a legacy (null) row and does not resolve', async () => {
    await expect(
      call(storedActionable({ h9ActionabilityStatus: null, h9FingerprintHash: null }))
    ).rejects.toMatchObject({ code: 'H9_METADATA_MISSING' });
    expect(resolveForFund).not.toHaveBeenCalled();
    expect(inc).toHaveBeenCalledWith({ surface: 'render_model', blocker_code: 'h9_metadata_missing' });
  });

  it('blocks H9_REVALIDATION_UNAVAILABLE (fail closed) when the resolver throws', async () => {
    resolveForFund.mockRejectedValue(new Error('db blip'));
    await expect(call(storedActionable())).rejects.toMatchObject({ code: 'H9_REVALIDATION_UNAVAILABLE' });
    expect(inc).toHaveBeenCalledWith({
      surface: 'render_model',
      blocker_code: 'h9_revalidation_unavailable',
    });
  });

  it('blocks H9_NOT_ACTIONABLE when the stored status is not actionable', async () => {
    await expect(call(storedActionable({ h9ActionabilityStatus: 'non_actionable' }))).rejects.toMatchObject({
      code: 'H9_NOT_ACTIONABLE',
    });
  });

  it('blocks H9_FINGERPRINT_STALE when the stored hash differs from current', async () => {
    resolveForFund.mockResolvedValue(
      currentResult({ sourceFingerprint: { fingerprintHash: 'e'.repeat(64), policyVersion: POLICY } })
    );
    await expect(call(storedActionable())).rejects.toMatchObject({ code: 'H9_FINGERPRINT_STALE' });
  });

  it('blocks H9_FINGERPRINT_STALE when the current resolve is itself non_actionable', async () => {
    resolveForFund.mockResolvedValue(currentResult({ actionability: 'non_actionable' }));
    await expect(call(storedActionable())).rejects.toMatchObject({ code: 'H9_FINGERPRINT_STALE' });
  });

  it('throws an H9ExportBlockedError carrying surface + code', async () => {
    try {
      await call(storedActionable({ h9ActionabilityStatus: 'non_actionable' }));
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(H9ExportBlockedError);
      expect((err as H9ExportBlockedError).surface).toBe('render_model');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `TZ=UTC npx vitest run tests/unit/services/lp-reporting/h9-export-gate.test.ts --project=server --configLoader native`
Expected: FAIL — module `h9-export-gate` not found.

- [ ] **Step 3: Hermes creates the gate**

Create `server/services/lp-reporting/h9-export-gate.ts` with EXACTLY:
```ts
import { createMoicActionabilityResolver } from '../fund-calculation-mode-service';
import { moicActionabilityBlocksTotal } from '../../metrics';

export type H9ExportSurface =
  | 'render_model'
  | 'live_json_export'
  | 'stored_json_export'
  | 'stored_csv_export';

export type H9ExportBlockerCode =
  | 'H9_METADATA_MISSING'
  | 'H9_NOT_ACTIONABLE'
  | 'H9_FINGERPRINT_STALE'
  | 'H9_REVALIDATION_UNAVAILABLE';

export class H9ExportBlockedError extends Error {
  readonly code: H9ExportBlockerCode;
  readonly surface: H9ExportSurface;

  constructor(surface: H9ExportSurface, code: H9ExportBlockerCode, message: string) {
    super(message);
    this.name = 'H9ExportBlockedError';
    this.code = code;
    this.surface = surface;
  }
}

/** The stored H9 columns as carried on an lp_report_packages row. */
export interface StoredH9 {
  h9MoicSourceInputHash: string | null;
  h9RoundEvidenceInputHash: string | null;
  h9RoundEvidenceAssumptionsHash: string | null;
  h9FingerprintHash: string | null;
  h9PolicyVersion: string | null;
  h9ActionabilityStatus: string | null;
}

function block(surface: H9ExportSurface, code: H9ExportBlockerCode, message: string): never {
  moicActionabilityBlocksTotal.inc({ surface, blocker_code: code.toLowerCase() });
  throw new H9ExportBlockedError(surface, code, message);
}

/**
 * Authoritative export-time H9 gate. Reads the stored package H9 columns and
 * re-resolves the CURRENT fingerprint on the supplied database/transaction.
 * Fail-closed: any null metadata, non-actionable status, hash drift, or resolver
 * error blocks the export. Never mutates the stored artifact.
 */
export async function assertH9ExportActionable(params: {
  surface: H9ExportSurface;
  fundId: number;
  stored: StoredH9;
  database: unknown;
}): Promise<void> {
  const { surface, fundId, stored, database } = params;

  if (stored.h9ActionabilityStatus == null || stored.h9FingerprintHash == null) {
    block(surface, 'H9_METADATA_MISSING', 'Report package has no H9 actionability metadata.');
  }

  let current;
  try {
    current = await createMoicActionabilityResolver({ database }).resolveForFund(fundId);
  } catch {
    block(surface, 'H9_REVALIDATION_UNAVAILABLE', 'H9 actionability could not be revalidated.');
  }

  if (stored.h9ActionabilityStatus !== 'actionable') {
    block(surface, 'H9_NOT_ACTIONABLE', 'Report package is not actionable.');
  }

  if (
    current.actionability !== 'actionable' ||
    stored.h9FingerprintHash !== current.sourceFingerprint.fingerprintHash ||
    stored.h9PolicyVersion !== current.sourceFingerprint.policyVersion
  ) {
    block(surface, 'H9_FINGERPRINT_STALE', 'Report package H9 fingerprint is stale.');
  }
}
```
Note for Hermes: `block(...)` returns `never`, so `current` is definitely assigned after the try/catch. If `npm run check` reports "used before assigned", annotate the declaration:
`let current: Awaited<ReturnType<ReturnType<typeof createMoicActionabilityResolver>['resolveForFund']>>;`
Only this new file changes.

- [ ] **Step 4: Run test to verify it passes**

Run: `TZ=UTC npx vitest run tests/unit/services/lp-reporting/h9-export-gate.test.ts --project=server --configLoader native`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add server/services/lp-reporting/h9-export-gate.ts tests/unit/services/lp-reporting/h9-export-gate.test.ts
git commit -m "feat(h9): shared export actionability gate (PR3 Lane A)"
```

---

## Task 4: Stamp H9 at assembly insert + expose `h9Metadata` on the record (Lane B)

**Files:**
- Modify: `server/services/lp-reporting/report-package-service.ts`
- Test: extend `tests/unit/services/lp-reporting/report-package-service.test.ts` (mirror its existing happy-path harness)

The resolver runs INSIDE the service against `tx`, so the test must mock `createMoicActionabilityResolver`. Because Task 1 added `h9Metadata` to `ReportPackageRecordSchema`, the assembled response record will carry it once `toReportPackageRecord` maps the row's H9 columns — so assert on `result.record.h9Metadata` (harness-agnostic).

- [ ] **Step 1: Write the failing test**

At the TOP of `tests/unit/services/lp-reporting/report-package-service.test.ts` (before the service import), add the resolver mock:
```ts
import { vi } from 'vitest';

const { resolveForFund } = vi.hoisted(() => ({ resolveForFund: vi.fn() }));

vi.mock('../../../../server/services/fund-calculation-mode-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../server/services/fund-calculation-mode-service')>();
  return { ...actual, createMoicActionabilityResolver: () => ({ resolveForFund }) };
});

const H9_RESULT = {
  sourceFingerprintMatches: true,
  actionability: 'actionable' as const,
  actionabilityStatus: 'actionable' as const,
  sourceFingerprint: {
    moicSourceInputHash: 'a'.repeat(64),
    roundEvidenceInputHash: 'b'.repeat(64),
    roundEvidenceAssumptionsHash: 'c'.repeat(64),
    fingerprintHash: 'd'.repeat(64),
    policyVersion: 'h9-policy-v1',
  },
  acceptedReconciliationRunId: 42,
};
```
In the existing `beforeEach`, add: `resolveForFund.mockResolvedValue(H9_RESULT);`

Then add a test inside the existing assembly `describe` block, reusing the harness's happy-path setup (the same `database`, `input`, and seed rows the existing "inserts a new package" test uses — copy that setup verbatim):
```ts
it('stamps the resolved H9 fingerprint onto the assembled package', async () => {
  // <copy the exact happy-path arrange block from the existing "assembles/inserts" test>
  const result = await assembleMetricRunReportPackage(input, { database });

  expect(result.inserted).toBe(true);
  expect(result.record.h9Metadata).toMatchObject({
    fingerprintHash: 'd'.repeat(64),
    policyVersion: 'h9-policy-v1',
    actionabilityStatus: 'actionable',
    moicSourceInputHash: 'a'.repeat(64),
  });
  expect(resolveForFund).toHaveBeenCalledWith(7); // the harness fund id; match the harness value
});
```
NOTE: this depends on the harness's insert mock echoing inserted `.values()` back through `.returning()` (so the stamped columns reach `toReportPackageRecord`). If the harness returns a FIXED row instead, also add the stamped H9 columns to that fixture row. Inspect the harness's `insert`/`returning` mock and align.

- [ ] **Step 2: Run test to verify it fails**

Run: `TZ=UTC npx vitest run tests/unit/services/lp-reporting/report-package-service.test.ts --project=server --configLoader native`
Expected: FAIL — `result.record.h9Metadata` is `null`/absent (no stamp yet), or the record parse fails because `h9Metadata` is missing.

- [ ] **Step 3: Hermes implements the stamp + record mapping**

Edit `server/services/lp-reporting/report-package-service.ts`:

(a) Add imports (import + first use together — they are both used in this same edit):
```ts
import {
  createMoicActionabilityResolver,
  toH9SnapshotColumns,
} from '../fund-calculation-mode-service';
```

(b) Inside `assembleMetricRunReportPackage`, immediately BEFORE the `const now = new Date();` line that precedes the insert (currently ~line 610), resolve and stamp:
```ts
    const h9Resolver = createMoicActionabilityResolver({ database: tx });
    const h9 = await h9Resolver.resolveForFund(input.fundId);
    const h9Columns = toH9SnapshotColumns(h9);
```

(c) Change the insert `.values(...)` (currently `insertValues(input, source, narrativeRefs, payload, now)`) to merge the H9 columns:
```ts
      .values({ ...insertValues(input, source, narrativeRefs, payload, now), ...h9Columns })
```

(d) Map the H9 columns to `h9Metadata` in `toReportPackageRecord` (currently ~line 506). Add this field inside the object passed to `ReportPackageRecordSchema.parse({ ... })`:
```ts
    h9Metadata:
      row.h9ActionabilityStatus == null
        ? null
        : {
            moicSourceInputHash: row.h9MoicSourceInputHash,
            roundEvidenceInputHash: row.h9RoundEvidenceInputHash,
            roundEvidenceAssumptionsHash: row.h9RoundEvidenceAssumptionsHash,
            fingerprintHash: row.h9FingerprintHash,
            policyVersion: row.h9PolicyVersion,
            actionabilityStatus: row.h9ActionabilityStatus,
          },
```
NOTE for Hermes: keep this resolve SEPARATE from the Task 5 recheck resolve — do NOT memoize them into one call (Task 5 needs an independent second read to detect drift). Only this file changes.

- [ ] **Step 4: Run test to verify it passes**

Run: `TZ=UTC npx vitest run tests/unit/services/lp-reporting/report-package-service.test.ts --project=server --configLoader native`
Expected: PASS. Also re-run the render-model suite — it now needs `h9Metadata` on records too (addressed in Task 6); if it fails only on `h9Metadata`, that is expected until Task 6.

- [ ] **Step 5: Commit**

```bash
git add server/services/lp-reporting/report-package-service.ts tests/unit/services/lp-reporting/report-package-service.test.ts
git commit -m "feat(h9): stamp actionability fingerprint at package assembly (PR3 Lane B)"
```

---

## Task 5: Write-time recheck — fail-fast 409 on assembly-window drift (Lane B)

**Files:**
- Modify: `server/services/lp-reporting/report-package-service.ts`
- Test: extend `tests/unit/services/lp-reporting/report-package-service.test.ts`

This is a fail-FAST guard (export is the authoritative gate). It resolves H9 a SECOND time immediately before insert and aborts with 409 if the fingerprint drifted during assembly. The two resolves must be independent reads.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/services/lp-reporting/report-package-service.test.ts`:
```ts
it('aborts assembly with H9_SOURCE_CHANGED_DURING_ASSEMBLY when the fingerprint drifts mid-assembly', async () => {
  // <copy the exact happy-path arrange block again>
  resolveForFund
    .mockResolvedValueOnce(H9_RESULT) // stamp read
    .mockResolvedValueOnce({
      ...H9_RESULT,
      sourceFingerprint: { ...H9_RESULT.sourceFingerprint, fingerprintHash: 'f'.repeat(64) },
    }); // recheck read sees drift

  await expect(assembleMetricRunReportPackage(input, { database })).rejects.toMatchObject({
    code: 'H9_SOURCE_CHANGED_DURING_ASSEMBLY',
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `TZ=UTC npx vitest run tests/unit/services/lp-reporting/report-package-service.test.ts --project=server --configLoader native`
Expected: FAIL — no recheck yet; assembly inserts normally instead of throwing.

- [ ] **Step 3: Hermes implements the recheck**

Edit `server/services/lp-reporting/report-package-service.ts`. Immediately AFTER the stamp block from Task 4 (after `const h9Columns = toH9SnapshotColumns(h9);`) and BEFORE the `const now = new Date();`, add:
```ts
    const h9Recheck = await h9Resolver.resolveForFund(input.fundId);
    if (h9Recheck.sourceFingerprint.fingerprintHash !== h9.sourceFingerprint.fingerprintHash) {
      throw new MetricRunCommitError(
        409,
        'H9_SOURCE_CHANGED_DURING_ASSEMBLY',
        'H9 source changed during report package assembly; retry.'
      );
    }
```
If `MetricRunCommitError` is not already imported in this file, add it to the import from `./metric-run-commit-service` (import + use in the same edit). If the file already uses a different 409 error idiom for assembly conflicts (e.g. `packageAlreadyAssembled()`), use that same error class/shape but with the code `H9_SOURCE_CHANGED_DURING_ASSEMBLY`. Only this file changes.

- [ ] **Step 4: Run test to verify it passes**

Run: `TZ=UTC npx vitest run tests/unit/services/lp-reporting/report-package-service.test.ts --project=server --configLoader native`
Expected: PASS (drift test throws; the Task 4 stamp test still passes because its single `mockResolvedValue` returns the same fingerprint for both reads).

- [ ] **Step 5: Commit**

```bash
git add server/services/lp-reporting/report-package-service.ts tests/unit/services/lp-reporting/report-package-service.test.ts
git commit -m "feat(h9): fail-fast recheck on assembly-window drift (PR3 Lane B)"
```

---

## Task 6: Gate the render-model surface + add the package-row wrapper (Lane C)

**Files:**
- Modify: `server/services/lp-reporting/h9-export-gate.ts` (add `assertH9PackageExportable` wrapper for the stored surfaces)
- Modify: `server/services/lp-reporting/report-package-render-model-service.ts`
- Test: extend `tests/unit/services/lp-reporting/report-package-render-model-service.test.ts`

Render-model is the read projection that live-json (Task 7) also consumes. It holds the raw package row already, so it calls `assertH9ExportActionable` directly. The wrapper added here is consumed by Tasks 8-9 (stored surfaces only have the export record, not the package row).

- [ ] **Step 1: Write the failing test**

In `tests/unit/services/lp-reporting/report-package-render-model-service.test.ts`, add the resolver mock at the top (before the service import):
```ts
import { vi } from 'vitest';

const { resolveForFund } = vi.hoisted(() => ({ resolveForFund: vi.fn() }));

vi.mock('../../../../server/services/fund-calculation-mode-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../server/services/fund-calculation-mode-service')>();
  return { ...actual, createMoicActionabilityResolver: () => ({ resolveForFund }) };
});

const FP = 'd'.repeat(64);
const CURRENT_OK = {
  actionability: 'actionable' as const,
  sourceFingerprint: { fingerprintHash: FP, policyVersion: 'h9-policy-v1' },
};

// Stamp these onto the seeded lp_report_packages row used by the harness:
const H9_COLUMNS = {
  h9MoicSourceInputHash: 'a'.repeat(64),
  h9RoundEvidenceInputHash: 'b'.repeat(64),
  h9RoundEvidenceAssumptionsHash: 'c'.repeat(64),
  h9FingerprintHash: FP,
  h9PolicyVersion: 'h9-policy-v1',
  h9ActionabilityStatus: 'actionable',
};
```
Add to the harness's seeded package row (wherever it builds the `lpReportPackages` fixture): `...H9_COLUMNS`. In `beforeEach`: `resolveForFund.mockResolvedValue(CURRENT_OK);`

Add two tests (reuse the existing happy-path arrange block):
```ts
it('serves the render model when stored H9 matches the current fingerprint', async () => {
  // <existing happy-path arrange>
  const result = await getMetricRunReportPackageRenderModel(input, { database });
  expect(result.renderModel).toBeDefined();
});

it('blocks H9_FINGERPRINT_STALE when the source fingerprint has drifted', async () => {
  // <existing happy-path arrange>
  resolveForFund.mockResolvedValue({
    actionability: 'actionable',
    sourceFingerprint: { fingerprintHash: 'e'.repeat(64), policyVersion: 'h9-policy-v1' },
  });
  await expect(getMetricRunReportPackageRenderModel(input, { database })).rejects.toMatchObject({
    code: 'H9_FINGERPRINT_STALE',
  });
});
```
NOTE: if the harness seeds the package row WITHOUT H9 columns and you cannot add them, the first test will block with `H9_METADATA_MISSING` — add `...H9_COLUMNS` to the seed so the actionable path is exercised.

- [ ] **Step 2: Run test to verify it fails**

Run: `TZ=UTC npx vitest run tests/unit/services/lp-reporting/report-package-render-model-service.test.ts --project=server --configLoader native`
Expected: FAIL — no gate yet; the drift test resolves a render model instead of throwing.

- [ ] **Step 3: Hermes implements the wrapper + render-model gate**

(a) Append to `server/services/lp-reporting/h9-export-gate.ts` (add imports + the wrapper in one edit):
```ts
import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { lpReportPackages } from '@shared/schema/lp-reporting-evidence';

/**
 * Load the stored H9 columns for a package and run the export gate. For the
 * stored export surfaces, which hold only the export record, not the package row.
 * No-op when the package row is absent (the caller's own not-found path wins).
 */
export async function assertH9PackageExportable(params: {
  surface: H9ExportSurface;
  fundId: number;
  metricRunId: number;
  database?: unknown;
}): Promise<void> {
  const database = (params.database ?? db) as typeof db;
  const [row] = await database
    .select({
      h9MoicSourceInputHash: lpReportPackages.h9MoicSourceInputHash,
      h9RoundEvidenceInputHash: lpReportPackages.h9RoundEvidenceInputHash,
      h9RoundEvidenceAssumptionsHash: lpReportPackages.h9RoundEvidenceAssumptionsHash,
      h9FingerprintHash: lpReportPackages.h9FingerprintHash,
      h9PolicyVersion: lpReportPackages.h9PolicyVersion,
      h9ActionabilityStatus: lpReportPackages.h9ActionabilityStatus,
    })
    .from(lpReportPackages)
    .where(
      and(eq(lpReportPackages.fundId, params.fundId), eq(lpReportPackages.metricRunId, params.metricRunId))
    )
    .limit(1);
  if (!row) return;
  await assertH9ExportActionable({
    surface: params.surface,
    fundId: params.fundId,
    stored: row,
    database,
  });
}
```

(b) Edit `server/services/lp-reporting/report-package-render-model-service.ts`. Add the gate import (with its use, same edit):
```ts
import { assertH9ExportActionable, type H9ExportSurface } from './h9-export-gate';
```
Add an optional surface field to `ReportPackageRenderModelServiceOptions`:
```ts
  h9Surface?: H9ExportSurface;
```
In `getMetricRunReportPackageRenderModel`, replace:
```ts
  const reportPackage = toReportPackageRecord(
    await loadReportPackage(database, input.fundId, input.metricRunId)
  );
```
with:
```ts
  const rawPackage = await loadReportPackage(database, input.fundId, input.metricRunId);
  await assertH9ExportActionable({
    surface: options.h9Surface ?? 'render_model',
    fundId: input.fundId,
    stored: rawPackage,
    database,
  });
  const reportPackage = toReportPackageRecord(rawPackage);
```
NOTE: if `loadReportPackage` can return `null` (rather than throwing), keep the existing not-found behavior by gating only when non-null: `if (rawPackage) await assertH9ExportActionable({...})`, then let the existing mapping handle null. Inspect `loadReportPackage` (`:132`) and match its contract. Only these two files change.

- [ ] **Step 4: Run test to verify it passes**

Run: `TZ=UTC npx vitest run tests/unit/services/lp-reporting/report-package-render-model-service.test.ts tests/unit/services/lp-reporting/h9-export-gate.test.ts --project=server --configLoader native`
Expected: PASS (render-model serve+block; gate suite still green).

- [ ] **Step 5: Commit**

```bash
git add server/services/lp-reporting/h9-export-gate.ts server/services/lp-reporting/report-package-render-model-service.ts tests/unit/services/lp-reporting/report-package-render-model-service.test.ts
git commit -m "feat(h9): gate render-model export + package-row wrapper (PR3 Lane C)"
```

---

## Task 7: Gate the live JSON export surface (Lane C)

**Files:**
- Modify: `server/services/lp-reporting/report-package-json-export-service.ts`
- Test: extend `tests/unit/services/lp-reporting/report-package-json-export-service.test.ts`

Live JSON export calls `getMetricRunReportPackageRenderModel(input, { database })` (`:169`), so it already inherits the gate from Task 6. This task only threads the correct metric surface label (`live_json_export`).

- [ ] **Step 1: Write the failing test**

Add the same resolver mock + `H9_COLUMNS` seed as Task 6 to `report-package-json-export-service.test.ts` (it drives render-model under the hood). Add:
```ts
it('blocks the live JSON export with surface live_json_export when H9 has drifted', async () => {
  // <existing happy-path arrange, with the package row carrying ...H9_COLUMNS>
  resolveForFund.mockResolvedValue({
    actionability: 'actionable',
    sourceFingerprint: { fingerprintHash: 'e'.repeat(64), policyVersion: 'h9-policy-v1' },
  });
  await expect(getMetricRunReportPackageJsonExport(input, { database })).rejects.toMatchObject({
    code: 'H9_FINGERPRINT_STALE',
    surface: 'live_json_export',
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `TZ=UTC npx vitest run tests/unit/services/lp-reporting/report-package-json-export-service.test.ts --project=server --configLoader native`
Expected: FAIL — the block currently carries `surface: 'render_model'` (inherited), not `'live_json_export'`.

- [ ] **Step 3: Hermes threads the surface label**

Edit `server/services/lp-reporting/report-package-json-export-service.ts`. Change the render-model call (`:169`) to pass the surface:
```ts
  const { renderModel } = await renderModelService(input, { database, h9Surface: 'live_json_export' });
```
Only this file changes. (The default-injected `renderModelService` is `getMetricRunReportPackageRenderModel`, which now accepts `h9Surface`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `TZ=UTC npx vitest run tests/unit/services/lp-reporting/report-package-json-export-service.test.ts --project=server --configLoader native`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/lp-reporting/report-package-json-export-service.ts tests/unit/services/lp-reporting/report-package-json-export-service.test.ts
git commit -m "feat(h9): label live JSON export H9 blocks (PR3 Lane C)"
```

---

## Task 8: Gate the stored JSON artifact + surface H9 on the status endpoint (Lane C)

**Files:**
- Modify: `server/services/lp-reporting/report-package-json-stored-export-service.ts`
- Test: extend `tests/unit/services/lp-reporting/report-package-json-stored-export-service.test.ts`

The stored artifact GET (`getMetricRunReportPackageStoredJsonArtifact`, `:278`) currently serves the stored payload with no H9 check. The status GET (`getMetricRunReportPackageStoredJsonExport`, `:267`) reports `status:'ready'` with no H9 check (Finding 8 — stale-readiness leak). The at-rest `ReportPackageJsonExportArtifactSchema.parse` is left UNCHANGED (H9 lives on the package row, not the artifact payload — no legacy 500 risk).

- [ ] **Step 1: Write the failing test**

Add the resolver mock (same as Task 6) and ensure the harness seeds the package row with `...H9_COLUMNS`. Add:
```ts
it('blocks the stored JSON artifact with surface stored_json_export when H9 has drifted', async () => {
  // <existing arrange that creates a stored json export + package row carrying ...H9_COLUMNS>
  resolveForFund.mockResolvedValue({
    actionability: 'actionable',
    sourceFingerprint: { fingerprintHash: 'e'.repeat(64), policyVersion: 'h9-policy-v1' },
  });
  await expect(getMetricRunReportPackageStoredJsonArtifact(input, { database })).rejects.toMatchObject({
    code: 'H9_FINGERPRINT_STALE',
    surface: 'stored_json_export',
  });
});

it('serves the stored JSON artifact when H9 matches', async () => {
  // <existing arrange>
  const res = await getMetricRunReportPackageStoredJsonArtifact(input, { database });
  expect(res.export).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `TZ=UTC npx vitest run tests/unit/services/lp-reporting/report-package-json-stored-export-service.test.ts --project=server --configLoader native`
Expected: FAIL — the drift case serves the artifact (no gate yet).

- [ ] **Step 3: Hermes gates the artifact GET + surfaces H9 on status**

Edit `server/services/lp-reporting/report-package-json-stored-export-service.ts`. Add the gate import (with use, same edit):
```ts
import { assertH9PackageExportable } from './h9-export-gate';
```
In `getMetricRunReportPackageStoredJsonArtifact`, AFTER `existing` is confirmed non-null and BEFORE returning the artifact (i.e. before the `ReportPackageJsonExportArtifactSchema.parse(existing.artifactPayload)` return path), add:
```ts
  await assertH9PackageExportable({
    surface: 'stored_json_export',
    fundId: input.fundId,
    metricRunId: input.metricRunId,
    database,
  });
```
For Finding 8 (status endpoint), in `getMetricRunReportPackageStoredJsonExport` (`:267`), do NOT claim actionable readiness blindly. Wrap the gate and downgrade on block — keep returning the record but reflect the H9 block. Minimal approach: call the gate and, on `H9ExportBlockedError`, still return the record (status stays a stored fact) but the caller/route can use the thrown signal. SIMPLEST acceptable implementation that the test pins: leave the status GET returning the record AND add the artifact-GET gate (above) as the authoritative block. If the team wants the status endpoint itself to reflect H9, that is a follow-up; pin only the artifact-GET block here and add a `// Finding 8:` comment noting the status endpoint defers to the artifact gate.
NOTE: do NOT add `h9Metadata` as a REQUIRED field to `ReportPackageJsonExportArtifactSchema` — legacy stored payloads would 500. Only this file changes.

- [ ] **Step 4: Run test to verify it passes**

Run: `TZ=UTC npx vitest run tests/unit/services/lp-reporting/report-package-json-stored-export-service.test.ts --project=server --configLoader native`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/lp-reporting/report-package-json-stored-export-service.ts tests/unit/services/lp-reporting/report-package-json-stored-export-service.test.ts
git commit -m "feat(h9): gate stored JSON artifact export (PR3 Lane C)"
```

---

## Task 9: Gate the stored CSV artifact (Lane C)

**Files:**
- Modify: `server/services/lp-reporting/report-package-csv-stored-export-service.ts`
- Test: extend `tests/unit/services/lp-reporting/report-package-csv-stored-export-service.test.ts`

Mirror Task 8 for CSV. Artifact GET is `getMetricRunReportPackageStoredCsvArtifact` (`:483`); status GET is `getMetricRunReportPackageStoredCsvExport` (`:466`).

- [ ] **Step 1: Write the failing test**

Add the resolver mock + `...H9_COLUMNS` seed (same as Task 6). Add:
```ts
it('blocks the stored CSV artifact with surface stored_csv_export when H9 has drifted', async () => {
  // <existing arrange that creates a stored csv export + package row carrying ...H9_COLUMNS>
  resolveForFund.mockResolvedValue({
    actionability: 'actionable',
    sourceFingerprint: { fingerprintHash: 'e'.repeat(64), policyVersion: 'h9-policy-v1' },
  });
  await expect(getMetricRunReportPackageStoredCsvArtifact(input, { database })).rejects.toMatchObject({
    code: 'H9_FINGERPRINT_STALE',
    surface: 'stored_csv_export',
  });
});

it('serves the stored CSV artifact when H9 matches', async () => {
  // <existing arrange>
  const res = await getMetricRunReportPackageStoredCsvArtifact(input, { database });
  expect(res.csv).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `TZ=UTC npx vitest run tests/unit/services/lp-reporting/report-package-csv-stored-export-service.test.ts --project=server --configLoader native`
Expected: FAIL — drift case serves the CSV.

- [ ] **Step 3: Hermes gates the CSV artifact GET**

Edit `server/services/lp-reporting/report-package-csv-stored-export-service.ts`. Add the import (with use):
```ts
import { assertH9PackageExportable } from './h9-export-gate';
```
In `getMetricRunReportPackageStoredCsvArtifact`, after `existing` is confirmed non-null and before the `ReportPackageCsvExportDocumentSchema.parse(existing.artifactPayload)` return, add:
```ts
  await assertH9PackageExportable({
    surface: 'stored_csv_export',
    fundId: input.fundId,
    metricRunId: input.metricRunId,
    database,
  });
```
Only this file changes.

- [ ] **Step 4: Run test to verify it passes**

Run: `TZ=UTC npx vitest run tests/unit/services/lp-reporting/report-package-csv-stored-export-service.test.ts --project=server --configLoader native`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/lp-reporting/report-package-csv-stored-export-service.ts tests/unit/services/lp-reporting/report-package-csv-stored-export-service.test.ts
git commit -m "feat(h9): gate stored CSV artifact export (PR3 Lane C)"
```

---

## Task 10: Realized-proceeds hygiene at metric-run commit (Lane D)

**Files:**
- Modify: `server/services/lp-reporting/metric-run-commit-service.ts`
- Test: extend `tests/unit/services/lp-reporting/metric-run-commit-service.test.ts` (or the existing commit-service test; locate via `ls tests/**/metric-run-commit*.test.ts`)

This is source-data hygiene, fixed where the events actually load (`loadSources`, `:251`), NOT at package assembly. Fund scope is already enforced by `assertRowsBelongToFund` (`:158`) — do not re-add it. The `realized_proceeds` event type (`cash-flow-event.contract.ts:40`) makes the predicate unambiguous: a realized-proceeds source event must be terminal (`status === 'locked'`), not a reversal, and a positive amount.

- [ ] **Step 1: Write the failing test**

Add to the commit-service test (mirror its existing source-event seeding; locate the helper that builds `cashFlowEvents` rows and the exported commit entry point — likely `commitMetricRun`/`createMetricRun`). Add:
```ts
it('rejects a realized_proceeds source event that is not locked', async () => {
  // <arrange: seed a cashFlowEvents row { eventType:'realized_proceeds', status:'draft', amount:'1000.000000', reversalOfEventId:null, fundId:7 }>
  // <reference it via sourceEventIds in the commit input>
  await expect(commitMetricRun(input, { database })).rejects.toMatchObject({
    code: 'REALIZED_PROCEEDS_INVALID',
  });
});

it('rejects a realized_proceeds source event with a non-positive amount', async () => {
  // <seed { eventType:'realized_proceeds', status:'locked', amount:'0.000000' }>
  await expect(commitMetricRun(input, { database })).rejects.toMatchObject({
    code: 'REALIZED_PROCEEDS_INVALID',
  });
});

it('rejects a realized_proceeds source event that is a reversal', async () => {
  // <seed { eventType:'realized_proceeds', status:'locked', amount:'1000.000000', reversalOfEventId:55 }>
  await expect(commitMetricRun(input, { database })).rejects.toMatchObject({
    code: 'REALIZED_PROCEEDS_INVALID',
  });
});

it('accepts a locked, positive realized_proceeds source event', async () => {
  // <seed { eventType:'realized_proceeds', status:'locked', amount:'1000.000000', reversalOfEventId:null }>
  const res = await commitMetricRun(input, { database });
  expect(res).toBeDefined();
});
```
Replace `commitMetricRun` with the actual exported commit function name in this service (grep `export async function` in `metric-run-commit-service.ts`). Capital-call / non-`realized_proceeds` events are NOT validated by this rule — keep at least one non-proceeds event in the "accepts" arrange to prove it is not over-rejecting.

- [ ] **Step 2: Run test to verify it fails**

Run: `TZ=UTC npx vitest run tests/unit/services/lp-reporting/metric-run-commit-service.test.ts --project=server --configLoader native`
Expected: FAIL — the draft/zero/reversal realized-proceeds events commit successfully (no validation yet).

- [ ] **Step 3: Hermes implements the validation**

Edit `server/services/lp-reporting/metric-run-commit-service.ts`. Add a validator function beside `assertRowsBelongToFund`:
```ts
function assertRealizedProceedsValid(eventRows: CashFlowEvent[]): void {
  const offending = eventRows
    .filter((row) => row.eventType === 'realized_proceeds')
    .filter((row) => {
      const amount = Number(row.amount);
      return (
        row.status !== 'locked' ||
        row.reversalOfEventId != null ||
        !Number.isFinite(amount) ||
        amount <= 0
      );
    })
    .map((row) => row.id);

  if (offending.length > 0) {
    throw new MetricRunCommitError(
      422,
      'REALIZED_PROCEEDS_INVALID',
      'One or more realized-proceeds source events are not locked, are reversed, or have a non-positive amount.',
      { eventIds: offending }
    );
  }
}
```
Call it inside `loadSources` immediately AFTER `assertRowsBelongToFund(fundId, eventRows, markRows);` (`:276`):
```ts
  assertRealizedProceedsValid(eventRows);
```
`CashFlowEvent` and `MetricRunCommitError` are already imported in this file. Only this file changes.

- [ ] **Step 4: Run test to verify it passes**

Run: `TZ=UTC npx vitest run tests/unit/services/lp-reporting/metric-run-commit-service.test.ts --project=server --configLoader native`
Expected: PASS (3 rejects, 1 accept).

- [ ] **Step 5: Commit**

```bash
git add server/services/lp-reporting/metric-run-commit-service.ts tests/unit/services/lp-reporting/metric-run-commit-service.test.ts
git commit -m "feat(h9): validate realized-proceeds source events at commit (PR3 Lane D)"
```

---

## Task 11: CRITICAL regression — replay after drift stays idempotent (Lane B)

**Files:**
- Test only: extend `tests/unit/services/lp-reporting/report-package-service.test.ts`

Decision 2: the replay branch (`:599-608`) must NOT gain an H9 check. The stamp/recheck (Tasks 4-5) sit AFTER the replay branch, so a replay of an already-assembled package returns the stored package (`inserted:false`) even after H9 source drift — the export gate (Lane C) blocks it downstream. This test locks that contract: a 409 here would be a regression.

- [ ] **Step 1: Write the failing-then-passing regression test**

Add to `tests/unit/services/lp-reporting/report-package-service.test.ts`:
```ts
it('replay after H9 source drift returns the stored package (inserted:false), NOT a 409', async () => {
  // <happy-path arrange that persists the inserted package in the stateful db harness>
  const first = await assembleMetricRunReportPackage(input, { database });
  expect(first.inserted).toBe(true);

  // source drifts AFTER assembly
  resolveForFund.mockResolvedValue({
    ...H9_RESULT,
    sourceFingerprint: { ...H9_RESULT.sourceFingerprint, fingerprintHash: 'f'.repeat(64) },
  });

  // identical refs/payload/version -> replay path
  const second = await assembleMetricRunReportPackage(input, { database });
  expect(second.inserted).toBe(false);
});
```
NOTE: this requires the harness's db mock to PERSIST the first insert so the second call's `loadReportPackage` finds it (stateful mock). If the existing harness is stateless, extend its insert/select mock to retain inserted rows keyed by `metricRunId` — this statefulness is required to exercise replay at all and is reusable by other replay tests.

- [ ] **Step 2: Run the test**

Run: `TZ=UTC npx vitest run tests/unit/services/lp-reporting/report-package-service.test.ts --project=server --configLoader native`
Expected: PASS (with Tasks 4-5 already implemented). If it FAILS with `H9_SOURCE_CHANGED_DURING_ASSEMBLY`, the stamp/recheck was placed BEFORE the replay branch — move it to AFTER the `if (existing !== null) {...}` replay block (after `:608`) and before the insert. Re-run.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/services/lp-reporting/report-package-service.test.ts
git commit -m "test(h9): replay after drift stays idempotent (PR3 Decision 2 regression)"
```

---

## Task 12 (OPTIONAL): harden `generateLockKey` to signed int8 range

**Files:**
- Modify: `server/lib/locks.ts`
- Test: `tests/unit/lib/locks-key-range.test.ts`

Latent-bug hardening, not required by PR3 (the advisory lock is unused in prod today). Include only if the team wants it; it is a shared helper (`withFundLock` callers).

- [ ] **Step 1: Confirm no existing test pins the old unsigned value**

Run: `npx grep -rn "generateLockKey" tests` (or use repo search). If any test asserts a specific bigint from `generateLockKey`, update it; otherwise proceed.

- [ ] **Step 2: Write the failing test**

Create `tests/unit/lib/locks-key-range.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { generateLockKey } from '../../../server/lib/locks';

const INT8_MIN = -(2n ** 63n);
const INT8_MAX = 2n ** 63n - 1n;

describe('generateLockKey int8 range', () => {
  it('produces keys within Postgres int8 range for adversarial inputs', () => {
    const cases: Array<[string, string]> = [
      ['1', '1'],
      ['ffffffffffffffff', 'ffffffffffffffff'],
      ['org-with-high-hash', 'fund-9999999'],
      ['z', 'z'],
    ];
    for (const [orgId, fundId] of cases) {
      const key = generateLockKey(orgId, fundId);
      expect(key).toBeGreaterThanOrEqual(INT8_MIN);
      expect(key).toBeLessThanOrEqual(INT8_MAX);
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `TZ=UTC npx vitest run tests/unit/lib/locks-key-range.test.ts --project=server --configLoader native`
Expected: FAIL — current unsigned `BigInt('0x'+…)` can exceed `INT8_MAX`.

- [ ] **Step 4: Hermes implements the fix**

Edit `server/lib/locks.ts`, `generateLockKey` — change the final return:
```ts
  return BigInt.asIntN(64, BigInt(`0x${hash.substring(0, 16)}`));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `TZ=UTC npx vitest run tests/unit/lib/locks-key-range.test.ts --project=server --configLoader native`
Then the existing locks suite: `TZ=UTC npx vitest run tests/unit/lib/locks*.test.ts --project=server --configLoader native`
Expected: PASS; no existing lock test regresses.

- [ ] **Step 6: Commit**

```bash
git add server/lib/locks.ts tests/unit/lib/locks-key-range.test.ts
git commit -m "fix(locks): clamp advisory lock key to signed int8 range"
```

---

## Final validation (after all tasks)

- [ ] **Full type + lint + suite gate**

Run:
```bash
npm run check
npx eslint server/services/lp-reporting/h9-export-gate.ts server/services/lp-reporting/report-package-service.ts server/services/lp-reporting/report-package-render-model-service.ts server/services/lp-reporting/report-package-json-export-service.ts server/services/lp-reporting/report-package-json-stored-export-service.ts server/services/lp-reporting/report-package-csv-stored-export-service.ts server/services/lp-reporting/metric-run-commit-service.ts server/metrics.ts shared/contracts/lp-reporting/lp-report-package.contract.ts
TZ=UTC npx vitest run tests/unit/services/lp-reporting tests/unit/contract/report-package-h9-metadata.contract.test.ts tests/unit/metrics/h9-actionability-blocks-metric.test.ts --project=server --configLoader native
git status --short   # confirm no files changed outside scope
```
Expected: 0 new TypeScript errors; eslint clean; all LP-reporting suites green.

- [ ] **Branch full-suite lane (route/contract coverage runs only on main-targeted full runs)**

Run: `gh workflow run ci-unified.yml --ref feat/h9-pr3-export-revalidation -f run_full_suite=true`
Then watch: `gh run watch` / `gh pr checks`. Do not cite a ~1m run as green (docs-only skips integration). Full runs are ~7m.

---

## Self-Review (performed against PLAN (34) / the eng review)

1. **Spec coverage:**
   - Assembly stamp -> Task 4. Write-time recheck (409) -> Task 5. Export gate ×4 surfaces -> Tasks 6-9. Blocker code taxonomy (4 export + 1 assembly) -> Task 3 (`H9_*` codes) + Task 5 (`H9_SOURCE_CHANGED_DURING_ASSEMBLY`). Metric -> Task 2. Contract h9Metadata -> Task 1. Realized-proceeds -> Task 10 (moved to commit per the review-of-review). Replay idempotency regression -> Task 11. Decision 1 (no lock) -> reflected by omission; optional generateLockKey -> Task 12. Finding 7 (tolerant at-rest) -> dissolved by design (H9 on the row, artifact schema untouched; noted in Task 8). Finding 8 (status-endpoint leak) -> Task 8 pins the authoritative artifact-GET block and notes the status endpoint defers to it.
2. **Placeholder scan:** the only `<...>` markers are "copy the existing harness arrange block" / "seed row" pointers into REAL, named existing test files — these are graft anchors, not unwritten logic. Every new artifact (gate, contract schema, metric, validators, edits) has complete code.
3. **Type/name consistency:** `assertH9ExportActionable` (row-in) and `assertH9PackageExportable` (loads row) used consistently; `H9ExportSurface` values `render_model | live_json_export | stored_json_export | stored_csv_export` match the metric label set; blocker codes UPPERCASE in errors, lowercased for the Prometheus `blocker_code` label; `H9_RESULT`/`H9_COLUMNS` fixtures consistent across Tasks 4-9.

**Open domain checkpoint (flag for the implementer, not a blocker):** Task 10 scopes the amount/status/reversal rule to `eventType === 'realized_proceeds'`. If the fund's metric runs treat `lp_distribution` / `recallable_distribution` as realized proceeds too, widen the `.filter` predicate to include those types — confirm with the LP-reporting domain owner before widening (fail-closed default is the narrow `realized_proceeds`-only rule shipped here).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-25-h9-pr3-lp-package-export-revalidation.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Use superpowers:subagent-driven-development.
2. **Inline Execution** — execute tasks in this session with checkpoints. Use superpowers:executing-plans.

Note for THIS repo: whichever option, the **orchestrator** runs every `npx vitest` step (RED then GREEN); **Hermes** (`node orchestrate.js --phase production`, `dangerouslyDisableSandbox: true`) makes every source edit; Hermes postflight is only `npm run check`. Lanes A→(B∥C∥D) can run in parallel worktrees after Lane A lands.

Which approach?
