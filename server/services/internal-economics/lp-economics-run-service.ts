/**
 * lp-economics-run-service.ts
 *
 * WP-L3 Phase C: the internal LP economics run service. This module is an
 * assembler/persister around the frozen `executeCashAssemblyPeriodLoopV1`
 * seam (G10) — it converts pinned basis rows (policy, envelope, facts,
 * plan, forecast) into the loop's exact input shape, invokes it exactly
 * once, and persists the outcome atomically. It never re-implements any
 * financial calculation and never re-derives loop output values (section 6:
 * decimal strings pass through verbatim, with the single named exception of
 * the section 6(c) totals aggregation implemented in this file).
 *
 * Atomicity protocol (P-D7, normative source for this file's transaction
 * shape — implemented in this exact order):
 *
 *  1. `pg_advisory_xact_lock(hashtext('internal-economics-run:<fundId>'))`
 *     (G4 namespace convention).
 *  2. Early idempotent replay via `replayIdempotentCommandIfPresent` on the
 *     stable client-authoritative preimage (fundId + contractVersion +
 *     basis IDs + terminalMode + clock + engineVersion + methodologyVersion
 *     — P-D8 R1 amendment), before any basis read (G16 fail-closed lesson).
 *  3. Basis reads by explicit IDs only (ADR-065 item 1: no latest-resolution
 *     anywhere) with ownership asserts via `fund-scoped-ownership.ts`
 *     (P-D9). The run-supplied `terminalMode` is validated against the
 *     pinned policy's terminal mode immediately after the policy read.
 *  4. Two pre-invocation admission-control guards (period count / total
 *     event count, D8's synchronous-execution-controls requirement). A
 *     violation persists a `failed` run row (P-D7 R7 disposition): no
 *     snapshot, COMMIT, idempotency key consumed.
 *  5. Section 8's nine eligibility gates, in registry order. A gate hit is
 *     a COMPLETED run: the D9 `unavailable` result envelope, persisted
 *     snapshot + run row, commit.
 *  6. `unfundedEnvelopeRemainingUsd` derivation (P-D7 step 4b).
 *  7. Assemble `ExecuteCashAssemblyPeriodLoopV1Input` and invoke the frozen
 *     loop exactly once.
 *  8. Success: event enrichment + totals assembly (section 6) + reason
 *     sort/dedupe, persist result snapshot + run row (`completed`), commit.
 *  9. Typed engine failure: P-D7 step 6's per-class-per-code dispatch table
 *     (reproduced verbatim below `LOOP_ERROR_DISPATCH_TABLE`).
 * 10. Unexpected exception: full rollback, nothing persisted, key not
 *     consumed.
 *
 * The whole protocol runs inside a single Drizzle transaction
 * (`isolationLevel: 'repeatable read'`, `accessMode: 'read write'`),
 * wrapped in a bounded 3-attempt retry on SQLSTATE 40001/40P01 — the exact
 * pattern already proven by
 * `buildFinancialFactsSnapshot` (`server/services/financial-facts-snapshot-service.ts`),
 * confirmed via 3 independent specialist gate rounds (P-D7 R3/R4). Neither
 * `server/db.ts` nor `server/db/pg-circuit.ts` provide retry-on-
 * serialization-failure (P-D7 R4 finding); this bounded loop is the sole
 * retry mechanism.
 *
 * Frozen and untouched by this file: `shared/lib/internal-economics/*`,
 * both observation contracts, `terminal-policy-v1.contract.ts`,
 * `event-ordering-v1.contract.ts`, `shared/schema/internal-economics.ts`,
 * migration 0045, the three internal-economics contract files (Lane B's),
 * `server/lib/fund-scoped-ownership.ts`,
 * `financial-facts-snapshot-v1.contract.ts`,
 * `financial-facts-snapshot-service.ts`,
 * `opening-accounting-state-artifact.ts`. This file consumes them read-only.
 *
 * Governing plan: docs/superpowers/plans/
 * 2026-07-31-task163-wp-l3-service-persistence-plan.md (P-D7, section 8,
 * section 11 Phase C).
 *
 * @module server/services/internal-economics/lp-economics-run-service
 */

import { randomUUID } from 'node:crypto';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '../../db';
import {
  assertOwnedByFund,
  FundScopeError,
  type FundScopedOwnershipDatabase,
} from '../../lib/fund-scoped-ownership';
import {
  replayIdempotentCommandIfPresent,
  runIdempotentCommand,
} from '../../lib/idempotent-command';
import { canonicalSha256 } from '../../../shared/lib/canonical-hash';
import { Decimal } from '../../../shared/lib/decimal-config';
import { buildEffectiveFeeExpenseBridgeV1 } from '../../../shared/lib/internal-economics/effective-fee-expense-bridge-v1';
import {
  CashAssemblyCallSizingV1Error,
  type CallSizingQuarterNeedInputV1,
} from '../../../shared/lib/internal-economics/cash-assembly-call-sizing-v1';
import {
  CashAssemblyEventStreamInvariantError,
  CashAssemblyEventStreamV1Error,
  type FactsCashAssemblyEventV1,
  type FactsCashAssemblyNavMarkV1,
  type FactsCashAssemblyPeriodNavV1,
} from '../../../shared/lib/internal-economics/cash-assembly-event-stream-v1';
import {
  CashAssemblyPeriodLoopV1Error,
  executeCashAssemblyPeriodLoopV1,
  type CashAssemblyWaterfallEventV1,
  type ExecuteCashAssemblyPeriodLoopV1Input,
} from '../../../shared/lib/internal-economics/cash-assembly-period-loop-v1';
import {
  buildCashAssemblyPeriodGridV1,
  type CashAssemblyQuarterRowV1,
} from '../../../shared/lib/internal-economics/cash-assembly-types-v1';
import { DecimalWaterfallCoreV1Error } from '../../../shared/lib/internal-economics/decimal-waterfall-core-v1';
import { PresentationRoundingError } from '../../../shared/lib/internal-economics/presentation-rounding-v1';
import {
  TerminalPolicyV1Error,
  assertPersistedTerminalResolutionMatchesPolicyV1,
  terminalResolutionHashPreimageV1,
  validatePersistedTerminalResolutionV1,
  type PersistedTerminalResolutionV1,
} from '../../../shared/contracts/internal-economics/terminal-policy-v1.contract';
import {
  EconomicsPolicyBodyV1Schema,
  type EconomicsPolicyBodyV1,
} from '../../../shared/contracts/internal-economics/economics-policy-v1.contract';
import {
  LP_ECONOMICS_RUN_CONTRACT_VERSION,
  LpEconomicsResultV1Schema,
  OPENING_STATE_CONTRACT_V1_INELIGIBLE_DETAIL,
  OPENING_STATE_INELIGIBLE_FIELDS_V1,
  buildLpEconomicsEventIdV1,
  buildLpEconomicsRunIdempotencyPreimageV1,
  sortAndDedupeLpEconomicsReasonsV1,
  type LpEconomicsIndicativeReasonV1,
  type LpEconomicsIrrBasisV1,
  type LpEconomicsResultV1,
  type LpEconomicsRunRequestV1,
  type LpEconomicsRunUnavailabilityReasonV1,
  type LpEconomicsTotalsV1,
  type LpEconomicsWaterfallEventV1,
} from '../../../shared/contracts/internal-economics/lp-economics-run-v1.contract';
import {
  PersistedFinancialFactsSnapshotV1Schema,
  type PersistedFinancialFactsSnapshotV1,
} from '../../../shared/contracts/financial-facts-snapshot-v1.contract';
import { FundDraftWriteV1Schema } from '../../../shared/contracts/fund-draft-write-v1.contract';
import {
  CurrentForecastV2Schema,
  type CurrentForecastSeriesPointV1,
  type CurrentForecastV2,
} from '../../../shared/contracts/current-forecast-v2.contract';
import { CurrentPlanVersionV1Schema } from '../../../shared/contracts/current-plan-version-v1.contract';
import type { FundAccountingStateObservationV1_1 } from '../../../shared/contracts/internal-economics/fund-accounting-state-observation-v1.1.contract';
import {
  internalCapitalEnvelopeVersions,
  internalEconomicsPolicyVersions,
  internalLpEconomicsRuns,
  type InternalLpEconomicsRunRow,
} from '../../../shared/schema/internal-economics';
import { financialFactsSnapshots } from '../../../shared/schema/financial-facts-snapshots';
import { currentPlanVersions } from '../../../shared/schema/current-plans';
import { fundConfigs, fundSnapshots } from '../../../shared/schema/fund';

type RunDatabase = typeof db;

// ---------------------------------------------------------------------------
// Service constants (P-D7 R5/R6 amendments — firm, not examples).
// ---------------------------------------------------------------------------

/** The engine identity stamped on every run row and fed to the frozen loop. */
export const LP_ECONOMICS_RUN_ENGINE_VERSION = 'cash-assembly-period-loop-v1/1.0.0' as const;
export const LP_ECONOMICS_RUN_METHODOLOGY_VERSION =
  'cash-assembly-period-loop-methodology/1.0.0' as const;
/** P-D4: 18 chars, fits the journaled `fund_snapshots.calc_version varchar(20)`. */
export const LP_ECONOMICS_RESULT_CALC_VERSION = 'lp-economics/1.0.0' as const;

/** P-D7 R5: firm service constant, not an example — pre-invocation guard. */
export const MAX_CASH_ASSEMBLY_PERIOD_COUNT = 200;
/** P-D7 R6: firm service constant — counts facts events + NAV marks +
 * period-NAV observations + forecast series points across the assembled
 * input. */
export const MAX_CASH_ASSEMBLY_TOTAL_EVENT_COUNT = 10000;

const RUN_TRANSACTION_MAX_ATTEMPTS = 3;
const RETRYABLE_TRANSACTION_SQLSTATES = new Set(['40001', '40P01']);

// ---------------------------------------------------------------------------
// Service error (typed request-validation rejection — distinct from the
// section 8 unavailability registry per section 5's terminal-mode-mismatch
// amendment).
// ---------------------------------------------------------------------------

export type LpEconomicsRunServiceErrorCode =
  | 'TERMINAL_MODE_MISMATCH'
  | 'POLICY_VERSION_NOT_FOUND'
  | 'FACTS_SNAPSHOT_NOT_FOUND'
  | 'PLAN_VERSION_NOT_FOUND'
  | 'FORECAST_SNAPSHOT_NOT_FOUND'
  | 'RUN_NOT_FOUND'
  | 'RUN_RESULT_SNAPSHOT_MISSING'
  | 'SOURCE_CONFIG_VERSION_DRIFTED';

export class LpEconomicsRunServiceError extends Error {
  readonly statusCode: number;

  constructor(
    readonly status: number,
    readonly code: LpEconomicsRunServiceErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = 'LpEconomicsRunServiceError';
    this.statusCode = status;
  }
}

// ---------------------------------------------------------------------------
// P-D7 step 6 (T-C3/T-C2 normative source): the seven-class dispatch table.
// Every code below is independently re-verified against the live frozen
// modules (see this module's docstring). `unavailable` = completed run,
// persisted D9 envelope; `failed` = persisted run row with failure_code/
// failure_context, no snapshot.
// ---------------------------------------------------------------------------

type LoopErrorDisposition = 'unavailable' | 'failed';

/**
 * `CashAssemblyPeriodLoopV1Error`: mixed dispatch. `OPENING_STATE_INELIGIBLE`
 * -> unavailable (P-D7 R10: a deterministic pinned-basis outcome, not an
 * engine defect — the service's own pre-invocation gate 5 check makes this
 * a defensive catch only, on an already-covered code). Every other code ->
 * failed (defect guards: FACT_AFTER_CUTOVER, PARTIAL_PROJECTED_PERIOD,
 * SCHEDULE_GRID_MISMATCH, HISTORICAL_RECONCILIATION_MISMATCH,
 * CORE_ROW_MAPPING_MISMATCH, TERMINAL_RECONCILIATION_FAILED,
 * MONOTONICITY_VIOLATION, CARRY_PCT_INVALID).
 */
const PERIOD_LOOP_UNAVAILABLE_CODES: ReadonlySet<string> = new Set(['OPENING_STATE_INELIGIBLE']);

/**
 * `TerminalPolicyV1Error`: every code is a registry code -> unavailable.
 * `NEGATIVE_SOURCE_MONEY`'s raw throw site is proven unreachable on the loop
 * path (P-D7 R5 note); this table maps it identically as a defensive,
 * untestable belt-and-braces branch (R5).
 */
const TERMINAL_POLICY_UNAVAILABLE_CODES: ReadonlySet<string> = new Set([
  'TERMINAL_RESOLUTION_METHODOLOGY_UNSUPPORTED',
  'TERMINAL_RESOLUTION_MISMATCH',
  'TERMINAL_BEFORE_CUTOVER',
  'FORECAST_HORIZON_SHORT',
  'FORECAST_TERMINAL_PERIOD_UNREPRESENTABLE',
  'NEGATIVE_SOURCE_MONEY',
]);

/** `CashAssemblyEventStreamV1Error`: all 3 codes are registry codes -> unavailable. */
const EVENT_STREAM_UNAVAILABLE_CODES: ReadonlySet<string> = new Set([
  'POST_TERM_ACTIVITY',
  'NEGATIVE_SOURCE_MONEY',
  'FORECAST_DEPLOYMENT_CUMULATIVE_DECREASE',
]);

/**
 * `CashAssemblyCallSizingV1Error`: mixed dispatch.
 * `OPENING_CASH_UNAVAILABLE`/`COMMITTED_CAPITAL_EXCEEDED` -> unavailable;
 * `NEGATIVE_SCHEDULED_AMOUNT`/`NONZERO_FEE_EXPENSE_UNSUPPORTED_V1` -> failed.
 */
const CALL_SIZING_UNAVAILABLE_CODES: ReadonlySet<string> = new Set([
  'OPENING_CASH_UNAVAILABLE',
  'COMMITTED_CAPITAL_EXCEEDED',
]);

interface EngineFailureDisposition {
  readonly disposition: LoopErrorDisposition;
  readonly errorClass: string;
  readonly code: string;
  readonly message: string;
  readonly context: Readonly<Record<string, unknown>>;
}

/**
 * P-D7 step 6's per-class-per-code table, implemented verbatim. Returns
 * `null` for anything that is not one of the seven frozen error classes —
 * the caller re-throws in that case (step 10: unexpected exception, full
 * rollback).
 */
function classifyLoopError(error: unknown): EngineFailureDisposition | null {
  if (error instanceof CashAssemblyPeriodLoopV1Error) {
    return {
      disposition: PERIOD_LOOP_UNAVAILABLE_CODES.has(error.code) ? 'unavailable' : 'failed',
      errorClass: 'CashAssemblyPeriodLoopV1Error',
      code: error.code,
      message: error.message,
      context: error.context,
    };
  }
  if (error instanceof DecimalWaterfallCoreV1Error) {
    // No registry code on this class -- always failed.
    return {
      disposition: 'failed',
      errorClass: 'DecimalWaterfallCoreV1Error',
      code: error.code,
      message: error.message,
      context: error.context,
    };
  }
  if (error instanceof TerminalPolicyV1Error) {
    return {
      disposition: TERMINAL_POLICY_UNAVAILABLE_CODES.has(error.code) ? 'unavailable' : 'failed',
      errorClass: 'TerminalPolicyV1Error',
      code: error.code,
      message: error.message,
      context: {},
    };
  }
  if (error instanceof CashAssemblyEventStreamV1Error) {
    return {
      disposition: EVENT_STREAM_UNAVAILABLE_CODES.has(error.code) ? 'unavailable' : 'failed',
      errorClass: 'CashAssemblyEventStreamV1Error',
      code: error.code,
      message: error.message,
      context: {},
    };
  }
  if (error instanceof CashAssemblyEventStreamInvariantError) {
    // Message-only, no code -- always failed.
    return {
      disposition: 'failed',
      errorClass: 'CashAssemblyEventStreamInvariantError',
      code: 'INVARIANT_VIOLATION',
      message: error.message,
      context: {},
    };
  }
  if (error instanceof CashAssemblyCallSizingV1Error) {
    return {
      disposition: CALL_SIZING_UNAVAILABLE_CODES.has(error.code) ? 'unavailable' : 'failed',
      errorClass: 'CashAssemblyCallSizingV1Error',
      code: error.code,
      message: error.message,
      context: (error.context ?? {}) as Readonly<Record<string, unknown>>,
    };
  }
  if (error instanceof PresentationRoundingError) {
    // D9: "violation at either precision -> failed run, no result".
    return {
      disposition: 'failed',
      errorClass: 'PresentationRoundingError',
      code: error.code,
      message: error.message,
      context: {},
    };
  }
  return null;
}

/** Maps a loop-error's registry code onto the D9 unavailability reason shape. */
function unavailabilityReasonFromLoopError(
  disposition: EngineFailureDisposition
): LpEconomicsRunUnavailabilityReasonV1 {
  if (disposition.code === 'OPENING_STATE_INELIGIBLE') {
    // Defensive mapping only (P-D7 R10): the service's own pre-invocation
    // gate 5 check makes this loop-seam path unreachable in practice.
    logStructuredWarning('lp_economics_run_defensive_opening_state_ineligible_loop_hit', {
      errorClass: disposition.errorClass,
      code: disposition.code,
    });
    const field = disposition.context['field'];
    const valueUsd = disposition.context['valueUsd'];
    return {
      code: 'OPENING_STATE_INELIGIBLE',
      detail: disposition.message,
      context: {
        field: typeof field === 'string' ? field : 'unknown',
        valueUsd: typeof valueUsd === 'string' ? valueUsd : '0.000000',
      },
    };
  }
  return {
    code: disposition.code as LpEconomicsRunUnavailabilityReasonV1['code'],
    detail: disposition.message,
  };
}

function logStructuredWarning(event: string, fields: Readonly<Record<string, unknown>>): void {
  // for an untestable defensive branch (P-D7 R6 phoenix observability note).
  console.warn(JSON.stringify({ event, ...fields, module: 'lp-economics-run-service' }));
}

// ---------------------------------------------------------------------------
// Transaction plumbing (mirrors financial-facts-snapshot-service.ts exactly
// — the proven precedent for this atomicity shape, P-D7).
// ---------------------------------------------------------------------------

function transactionSqlState(error: unknown): string | undefined {
  const seen = new Set<object>();
  let current: unknown = error;
  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    seen.add(current);
    const record = current as Record<string, unknown>;
    if (typeof record['code'] === 'string') return record['code'];
    current = record['cause'];
  }
  return undefined;
}

async function lockRunGeneration(database: RunDatabase, fundId: number): Promise<void> {
  await database.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`internal-economics-run:${fundId}`}))`
  );
}

// ---------------------------------------------------------------------------
// Public surface.
// ---------------------------------------------------------------------------

export interface ExecuteLpEconomicsRunOptions {
  readonly fundId: number;
  readonly actorId: number | null;
  readonly idempotencyKey: string;
  readonly request: LpEconomicsRunRequestV1;
  readonly database?: RunDatabase;
}

export interface LpEconomicsRunReceipt {
  readonly run: InternalLpEconomicsRunRow;
  readonly result: LpEconomicsResultV1 | null;
}

export async function executeLpEconomicsRun(
  opts: ExecuteLpEconomicsRunOptions
): Promise<LpEconomicsRunReceipt> {
  const database = opts.database ?? db;

  for (let attempt = 1; attempt <= RUN_TRANSACTION_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await database.transaction(
        async (transaction) =>
          executeLpEconomicsRunInTransaction({
            opts,
            database: transaction as unknown as RunDatabase,
          }),
        { isolationLevel: 'repeatable read', accessMode: 'read write' }
      );
    } catch (error) {
      const retryable = RETRYABLE_TRANSACTION_SQLSTATES.has(transactionSqlState(error) ?? '');
      if (!retryable || attempt === RUN_TRANSACTION_MAX_ATTEMPTS) throw error;
    }
  }

  throw new Error('Internal LP economics run transaction retry bound was exhausted.');
}

export interface GetRunWithResultOptions {
  readonly fundId: number;
  readonly runId: number;
  readonly database?: RunDatabase;
}

/** Read surface (section 5's closing paragraph): joins the result snapshot,
 * validates type/ownership (T-C9). */
export async function getRunWithResult(
  opts: GetRunWithResultOptions
): Promise<LpEconomicsRunReceipt> {
  const database = opts.database ?? db;

  await assertOwnedByFund({
    db: database as unknown as FundScopedOwnershipDatabase,
    fundId: opts.fundId,
    ref: { kind: 'lp_economics_run', id: opts.runId },
  });

  const [run] = await database
    .select()
    .from(internalLpEconomicsRuns)
    .where(
      and(
        eq(internalLpEconomicsRuns.id, opts.runId),
        eq(internalLpEconomicsRuns.fundId, opts.fundId)
      )
    )
    .limit(1);

  if (run === undefined) {
    throw new LpEconomicsRunServiceError(
      404,
      'RUN_NOT_FOUND',
      'The internal LP economics run was not found.'
    );
  }

  return buildReceiptFromRunRow(run, database);
}

// ---------------------------------------------------------------------------
// Basis row types and readers (P-D7 step 3: explicit IDs only, ownership
// asserted via fund-scoped-ownership.ts per P-D9).
// ---------------------------------------------------------------------------

type PolicyRow = typeof internalEconomicsPolicyVersions.$inferSelect;
type EnvelopeRow = typeof internalCapitalEnvelopeVersions.$inferSelect;
type FactsRow = typeof financialFactsSnapshots.$inferSelect;
type PlanRow = typeof currentPlanVersions.$inferSelect;
type ForecastSnapshotRow = typeof fundSnapshots.$inferSelect;
type FundConfigRow = typeof fundConfigs.$inferSelect;

interface LoadedBasis {
  readonly policy: PolicyRow;
  readonly policyBody: EconomicsPolicyBodyV1;
  readonly persistedTerminalResolution: PersistedTerminalResolutionV1;
  readonly envelope: EnvelopeRow;
  readonly facts: PersistedFinancialFactsSnapshotV1 & { readonly id: number };
  readonly plan: PlanRow;
  readonly forecast: CurrentForecastV2;
}

async function loadPolicyRow(
  database: RunDatabase,
  fundId: number,
  policyVersionId: number
): Promise<PolicyRow> {
  await assertOwnedByFund({
    db: database as unknown as FundScopedOwnershipDatabase,
    fundId,
    ref: { kind: 'economics_policy_version', id: policyVersionId },
  });
  const [row] = await database
    .select()
    .from(internalEconomicsPolicyVersions)
    .where(
      and(
        eq(internalEconomicsPolicyVersions.id, policyVersionId),
        eq(internalEconomicsPolicyVersions.fundId, fundId)
      )
    )
    .limit(1);
  if (row === undefined) {
    throw new LpEconomicsRunServiceError(
      404,
      'POLICY_VERSION_NOT_FOUND',
      'The pinned economics policy version was not found.'
    );
  }
  return row;
}

async function loadEnvelopeRow(
  database: RunDatabase,
  fundId: number,
  envelopeVersionId: number
): Promise<EnvelopeRow> {
  await assertOwnedByFund({
    db: database as unknown as FundScopedOwnershipDatabase,
    fundId,
    ref: { kind: 'capital_envelope_version', id: envelopeVersionId },
  });
  const [row] = await database
    .select()
    .from(internalCapitalEnvelopeVersions)
    .where(
      and(
        eq(internalCapitalEnvelopeVersions.id, envelopeVersionId),
        eq(internalCapitalEnvelopeVersions.fundId, fundId)
      )
    )
    .limit(1);
  if (row === undefined) {
    // The policy's envelope FK is DB-enforced RESTRICT; reaching here without
    // a row means fund-scoped ownership already failed, but keep a typed
    // fallback in case a future caller re-scopes this function.
    throw new FundScopeError({ kind: 'capital_envelope_version', id: envelopeVersionId });
  }
  return row;
}

function parseFactsSnapshotRow(
  row: FactsRow
): PersistedFinancialFactsSnapshotV1 & { readonly id: number } {
  const parsed = PersistedFinancialFactsSnapshotV1Schema.parse({
    policyVersion: row.policyVersion,
    payloadSchemaId: row.payloadSchemaId,
    fundId: row.fundId,
    asOfDate: row.asOfDate,
    knowledgeCutoff: row.knowledgeCutoff.toISOString(),
    vehicleScope: row.vehicleScope,
    vehicleIds: row.vehicleIds,
    selectionSetHash: row.selectionSetHash,
    sourceFactsInputHash: row.sourceFactsInputHash,
    snapshotInputHash: row.snapshotInputHash,
    consumerEvaluations: row.consumerEvaluations,
    payload: row.payload,
    actorId: row.actorId,
    createdAt: row.createdAt.toISOString(),
  });
  return { ...parsed, id: row.id };
}

async function loadFactsRow(
  database: RunDatabase,
  fundId: number,
  factsSnapshotId: number
): Promise<PersistedFinancialFactsSnapshotV1 & { readonly id: number }> {
  await assertOwnedByFund({
    db: database as unknown as FundScopedOwnershipDatabase,
    fundId,
    ref: { kind: 'facts_snapshot', id: factsSnapshotId },
  });
  const [row] = await database
    .select()
    .from(financialFactsSnapshots)
    .where(
      and(
        eq(financialFactsSnapshots.id, factsSnapshotId),
        eq(financialFactsSnapshots.fundId, fundId)
      )
    )
    .limit(1);
  if (row === undefined) {
    throw new LpEconomicsRunServiceError(
      404,
      'FACTS_SNAPSHOT_NOT_FOUND',
      'The pinned financial-facts snapshot was not found.'
    );
  }
  return parseFactsSnapshotRow(row);
}

async function loadPlanRow(
  database: RunDatabase,
  fundId: number,
  planVersionId: number
): Promise<PlanRow> {
  await assertOwnedByFund({
    db: database as unknown as FundScopedOwnershipDatabase,
    fundId,
    ref: { kind: 'current_plan_version', id: planVersionId },
  });
  const [row] = await database
    .select()
    .from(currentPlanVersions)
    .where(and(eq(currentPlanVersions.id, planVersionId), eq(currentPlanVersions.fundId, fundId)))
    .limit(1);
  if (row === undefined) {
    throw new LpEconomicsRunServiceError(
      404,
      'PLAN_VERSION_NOT_FOUND',
      'The pinned current plan version was not found.'
    );
  }
  return row;
}

/**
 * Forecast basis read: the `fund_snapshot` ownership kind is type-blind
 * (G15), so the type filter is baked directly into the WHERE clause — a
 * type mismatch is indistinguishable from "not found" for this typed
 * reference, exactly like every other basis-ID lookup in this file.
 */
async function loadForecastRow(
  database: RunDatabase,
  fundId: number,
  forecastSnapshotId: number
): Promise<{ readonly row: ForecastSnapshotRow; readonly forecast: CurrentForecastV2 }> {
  await assertOwnedByFund({
    db: database as unknown as FundScopedOwnershipDatabase,
    fundId,
    ref: { kind: 'fund_snapshot', id: forecastSnapshotId },
  });
  const [row] = await database
    .select()
    .from(fundSnapshots)
    .where(
      and(
        eq(fundSnapshots.id, forecastSnapshotId),
        eq(fundSnapshots.fundId, fundId),
        eq(fundSnapshots.type, 'CURRENT_FORECAST_V2')
      )
    )
    .limit(1);
  if (row === undefined) {
    throw new LpEconomicsRunServiceError(
      404,
      'FORECAST_SNAPSHOT_NOT_FOUND',
      'The pinned Current Forecast V2 snapshot was not found.'
    );
  }
  return { row, forecast: CurrentForecastV2Schema.parse(row.payload) };
}

async function loadFundConfigRow(
  database: RunDatabase,
  fundId: number,
  sourceConfigId: number
): Promise<FundConfigRow | undefined> {
  const [row] = await database
    .select()
    .from(fundConfigs)
    .where(and(eq(fundConfigs.id, sourceConfigId), eq(fundConfigs.fundId, fundId)))
    .limit(1);
  return row;
}

function planV1FromRow(row: PlanRow) {
  return CurrentPlanVersionV1Schema.parse({
    contractVersion: 'current-plan-version-v1',
    id: String(row.id),
    fundId: row.fundId,
    version: row.version,
    sourceConfigId: row.sourceConfigId,
    sourceConfigVersion: row.sourceConfigVersion,
    sourceFactsSnapshotId: String(row.sourceFactsSnapshotId),
    deployableCapitalUsd: row.deployableCapitalUsd,
    planTransformationVersion: row.planTransformationVersion,
    allocations: row.allocations,
    pacingAssumptions: row.pacingAssumptions,
    cohortAssumptions: row.cohortAssumptions,
    reservePolicyVersion: row.reservePolicyVersion,
    assumptionsHash: row.assumptionsHash,
    supersedesVersionId: row.supersedesVersionId === null ? null : String(row.supersedesVersionId),
    supersededByVersionId:
      row.supersededByVersionId === null ? null : String(row.supersededByVersionId),
    createdAt: row.createdAt.toISOString(),
  });
}

// ---------------------------------------------------------------------------
// P-D10: opening-state eligibility maps facts payload contract versions to
// registry reasons. The service reads `openingAccountingState.observation`
// directly off the already-persisted facts snapshot payload row — it never
// touches `source_artifacts` and never re-parses raw artifact bytes (P-D10
// R1 amendment; the producer-boundary purity rule is absolute).
// ---------------------------------------------------------------------------

type OpeningStateOutcome =
  | { readonly kind: 'eligible'; readonly observation: FundAccountingStateObservationV1_1 }
  | { readonly kind: 'absent' }
  | { readonly kind: 'contract_ineligible' };

function readOpeningStateFromFacts(
  facts: PersistedFinancialFactsSnapshotV1 & { readonly id: number }
): OpeningStateOutcome {
  if (!('openingAccountingState' in facts.payload)) {
    // Pre-V3 payload: the opening-state concept does not exist yet, treated
    // identically to a V3 payload with a null ref.
    return { kind: 'absent' };
  }
  if (facts.payload.openingAccountingState === null) {
    return { kind: 'absent' };
  }
  if (facts.policyVersion === 'financial-facts-policy/1.3.0') {
    // Re-accessed (not hoisted to a pre-narrowing local) so TypeScript
    // narrows `facts.payload` to the V4 member here: the already-resolved
    // v1.1 ref (validated by the V4 embedded-ref adapter at parse time).
    return { kind: 'eligible', observation: facts.payload.openingAccountingState.observation };
  }
  // Any other policy version carrying a non-null ref (V3's v1-only ref) is
  // contract-ineligible (L3-Q6/P-D10 R5): a v1 attested
  // `lpUnreturnedContributedCapitalUsd` is never trusted by the core path.
  return { kind: 'contract_ineligible' };
}

/**
 * R10: the frozen loop's own fixed-order ineligibility check
 * (`cash-assembly-period-loop-v1.ts:161-178`), replicated pre-invocation so
 * gate 5 can persist a completed-`unavailable` outcome instead of ever
 * invoking the loop on a doomed input. `OPENING_STATE_INELIGIBLE_FIELDS_V1`
 * (the contract's read-only mirror of the loop's own list) pins the order.
 */
function firstNonzeroOpeningBalanceField(
  observation: FundAccountingStateObservationV1_1
): {
  readonly field: (typeof OPENING_STATE_INELIGIBLE_FIELDS_V1)[number];
  readonly valueUsd: string;
} | null {
  for (const field of OPENING_STATE_INELIGIBLE_FIELDS_V1) {
    const value = observation[field];
    if (!new Decimal(value).isZero()) {
      return { field, valueUsd: value };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Section 8 eligibility gates (registry order). Each gate returns a reason
// on a hit, or `null` to continue. Gate 5 (opening state) is handled by its
// own dedicated step in the transaction body because a hit there can come
// from two independent sources (contract ineligibility vs value
// ineligibility) and a miss produces the resolved observation the loop
// needs.
// ---------------------------------------------------------------------------

/** Gate 1: vehicle roster (G6/R3 amendment — re-checked against the PINNED
 * facts snapshot roster, never a live `vehicles` read). */
function gateVehicleRoster(
  envelope: EnvelopeRow,
  facts: PersistedFinancialFactsSnapshotV1 & { readonly id: number }
): LpEconomicsRunUnavailabilityReasonV1 | null {
  const roster = facts.payload.vehicleRoster;
  const pinned = roster.find((entry) => entry.vehicleId === envelope.mainFundVehicleId);
  if (pinned === undefined || pinned.vehicleType !== 'main_fund') {
    return {
      code: 'MAIN_FUND_VEHICLE_ABSENT',
      detail: `Pinned main_fund_vehicle_id ${envelope.mainFundVehicleId} is absent or reclassified on the facts snapshot roster.`,
    };
  }
  if (pinned.currency !== 'USD') {
    return {
      code: 'MAIN_FUND_CURRENCY_UNSUPPORTED',
      detail: `Main fund vehicle currency ${pinned.currency} is not supported.`,
    };
  }
  const otherEntries = roster.filter((entry) => entry.vehicleId !== envelope.mainFundVehicleId);
  if (otherEntries.length > 0) {
    // D7: "V1 runs ONLY when the roster contains EXACTLY ONE VEHICLE TOTAL
    // (the main fund)." Any spv/co_invest roster entry disqualifies the run.
    return {
      code: 'MAIN_FUND_SCOPED_FORECAST_UNAVAILABLE',
      detail: 'The facts snapshot roster carries vehicles beyond the main fund (Brief 4 vNext).',
    };
  }
  // MAIN_FUND_COMMITMENT_ABSENT (D8: "main_fund committedCapital null") is
  // structurally unreachable via this run service: the envelope's
  // `total_commitment_usd`/`lp_commitment_usd` columns are migration-0045
  // NOT NULL with a `total_commitment_usd > 0` CHECK, and this service never
  // reads the live, mutable `vehicles.committedCapital` field (that would
  // reintroduce the exact mutable-basis dependency the R3 gate-1 amendment
  // forbids). No trigger condition exists for this code on this path.
  return null;
}

/** Gate 2: config lineage — policy and plan must descend from the same
 * source config version. */
function gateConfigLineage(
  policy: PolicyRow,
  plan: PlanRow
): LpEconomicsRunUnavailabilityReasonV1 | null {
  if (
    policy.sourceConfigId !== plan.sourceConfigId ||
    policy.sourceConfigVersion !== plan.sourceConfigVersion
  ) {
    return {
      code: 'CONFIG_LINEAGE_MISMATCH',
      detail: `Policy config (${policy.sourceConfigId}/${policy.sourceConfigVersion}) and plan config (${plan.sourceConfigId}/${plan.sourceConfigVersion}) diverge.`,
    };
  }
  return null;
}

/** Gate 3: forecast basis state. */
function gateForecastBasisState(
  forecast: CurrentForecastV2
): LpEconomicsRunUnavailabilityReasonV1 | null {
  if (forecast.status === 'unavailable') {
    return { code: 'FORECAST_UNAVAILABLE', detail: 'The pinned forecast is unavailable.' };
  }
  if (forecast.status === 'failed') {
    return { code: 'FORECAST_FAILED', detail: 'The pinned forecast failed.' };
  }
  if (forecast.status === 'held') {
    return {
      code: 'FORECAST_HELD_UNSUPPORTED',
      detail: 'The pinned forecast is serving-plane held.',
    };
  }
  return null;
}

/** Gate 4: facts consumer evaluation for the 'economics' consumer
 * (EXTERNAL-REVIEW AMENDED / L3-Q7 — missing or duplicate entries fail
 * closed under the same code). */
function gateFactsConsumerEvaluation(
  facts: PersistedFinancialFactsSnapshotV1 & { readonly id: number }
): LpEconomicsRunUnavailabilityReasonV1 | null {
  const economicsEvaluations = facts.consumerEvaluations.filter(
    (evaluation) => evaluation.consumer === 'economics'
  );
  if (economicsEvaluations.length !== 1 || economicsEvaluations[0]?.status === 'blocked') {
    return {
      code: 'FACTS_ECONOMICS_EVALUATION_BLOCKED',
      detail: 'The financial-facts snapshot blocks internal LP economics.',
    };
  }
  return null;
}

/** Gate 6: GP commitment must be zero (D9: structural zeros by refusal). */
function gateGpCommitment(envelope: EnvelopeRow): LpEconomicsRunUnavailabilityReasonV1 | null {
  if (!new Decimal(envelope.gpCommitmentUsd).isZero()) {
    return {
      code: 'GP_COMMITMENT_UNSUPPORTED',
      detail: `Envelope GP commitment ${envelope.gpCommitmentUsd} is nonzero.`,
    };
  }
  return null;
}

/** Gate 7: zero-fee bridge (Brief 2), via the frozen
 * `buildEffectiveFeeExpenseBridgeV1` helper. */
function gateZeroFeeBridge(input: {
  readonly config: unknown;
  readonly plan: PlanRow;
  readonly forecast: CurrentForecastV2;
  readonly envelope: EnvelopeRow;
}): LpEconomicsRunUnavailabilityReasonV1 | null {
  const parsedConfig = FundDraftWriteV1Schema.safeParse(input.config);
  if (!parsedConfig.success) {
    return {
      code: 'FORECAST_FEE_BASIS_INCOMPATIBLE',
      detail: 'The source fund config does not parse as a valid draft-write shape.',
    };
  }
  const bridge = buildEffectiveFeeExpenseBridgeV1({
    config: parsedConfig.data,
    currentPlan: planV1FromRow(input.plan),
    forecast: input.forecast,
    totalCommitmentUsd: input.envelope.totalCommitmentUsd,
  });
  if (!bridge.ok) {
    return {
      code: 'FORECAST_FEE_BASIS_INCOMPATIBLE',
      detail: `Zero-fee bridge incompatible: ${bridge.reasons.join(', ')}`,
    };
  }
  return null;
}

/** Gate 8: terminal pair readback via the G11 validators (ADR-065 item 8 —
 * no raw date arithmetic anywhere in this file). `persistedTerminalResolution`
 * is the raw candidate (unvalidated methodology-version literal) — the
 * validator itself performs the candidate-schema parse and the literal
 * check, converting a mismatch into a typed `TerminalPolicyV1Error` this
 * gate maps to `TERMINAL_RESOLUTION_METHODOLOGY_UNSUPPORTED` rather than an
 * uncaught crash. */
function gateTerminalResolution(input: {
  readonly persistedTerminalResolution: unknown;
  readonly termStartDate: string;
  readonly fundLifeYears: string;
  readonly forecast: CurrentForecastV2;
  readonly openingCutoverInstant: string;
}): LpEconomicsRunUnavailabilityReasonV1 | null {
  try {
    // Frozen precedence order (this gate's registry code list, methodology
    // -> mismatch -> cutover -> horizon -> representability): the match
    // assert re-parses the candidate first (methodology-unsupported surfaces
    // here too) then compares it against a policy-time recomputation from
    // the policy body's OWN term anchor inputs (integrity check on the
    // dedicated columns, never used to compute the value fed to the loop --
    // that stays `policy.terminalPeriodEnd`/`terminalResolutionMethodologyVersion`
    // read verbatim, per ADR-065 item 8's "never re-resolve at run time").
    assertPersistedTerminalResolutionMatchesPolicyV1({
      termStartDate: input.termStartDate,
      fundLifeYears: input.fundLifeYears,
      persisted: input.persistedTerminalResolution,
    });
    validatePersistedTerminalResolutionV1({
      persisted: input.persistedTerminalResolution,
      forecastPeriodEnds: input.forecast.series.map((point) => point.periodEnd),
      openingCutoverInstant: input.openingCutoverInstant,
    });
  } catch (error) {
    if (error instanceof TerminalPolicyV1Error) {
      return {
        code: error.code as LpEconomicsRunUnavailabilityReasonV1['code'],
        detail: error.message,
      };
    }
    throw error;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Admission control (P-D7 R5/R6/R7 amendments), evaluated after all nine
// eligibility gates (section 8) have passed. Period count and the
// forecast-point term of the event count both measure the ASSEMBLED,
// terminal-truncated grid (via the frozen module's own exported
// `buildCashAssemblyPeriodGridV1` filter, computed by the caller) rather
// than the raw pre-truncation forecast series, so a legitimately small
// post-truncation workload is never falsely rejected; event count sums the
// four named categories across that same assembled input.
// ---------------------------------------------------------------------------

interface AdmissionCounts {
  readonly periodCount: number;
  readonly totalEventCount: number;
}

function countAdmission(input: {
  readonly periodCount: number;
  readonly factsEvents: readonly FactsCashAssemblyEventV1[];
  readonly factsNavMarks: readonly FactsCashAssemblyNavMarkV1[];
  readonly factsPeriodNav: readonly FactsCashAssemblyPeriodNavV1[];
}): AdmissionCounts {
  return {
    periodCount: input.periodCount,
    totalEventCount:
      input.factsEvents.length +
      input.factsNavMarks.length +
      input.factsPeriodNav.length +
      input.periodCount,
  };
}

// ---------------------------------------------------------------------------
// Loop-input assembly: converts pinned basis rows into the frozen loop's
// exact input shape (G10). No re-derivation of financial results anywhere
// in this section.
// ---------------------------------------------------------------------------

function buildFactsEventsFromPayload(
  facts: PersistedFinancialFactsSnapshotV1 & { readonly id: number }
): FactsCashAssemblyEventV1[] {
  return facts.payload.cashFlowSeries.series.flatMap((series) =>
    series.points.map((point): FactsCashAssemblyEventV1 => ({
      eventId: point.eventId,
      eventType: series.eventType,
      effectiveAt: point.effectiveAt,
      amountUsd: point.amount,
    }))
  );
}

function buildFactsNavMarksFromPayload(
  facts: PersistedFinancialFactsSnapshotV1 & { readonly id: number }
): FactsCashAssemblyNavMarkV1[] {
  return facts.payload.marksSeries.marks.map((mark) => ({
    markId: mark.markId,
    effectiveAt: mark.effectiveAt,
    fairValueUsd: mark.fairValue,
  }));
}

function buildFactsPeriodNavFromPayload(
  facts: PersistedFinancialFactsSnapshotV1 & { readonly id: number }
): FactsCashAssemblyPeriodNavV1[] {
  return facts.payload.marksSeries.periodNav.map((entry) => ({
    periodEnd: entry.periodEnd,
    navUsd: entry.nav,
  }));
}

function compareForecastPointsForAssembly(
  left: CurrentForecastSeriesPointV1,
  right: CurrentForecastSeriesPointV1
): number {
  return (
    left.periodEnd.localeCompare(right.periodEnd) ||
    left.periodStart.localeCompare(right.periodStart) ||
    left.source.localeCompare(right.source)
  );
}

/**
 * Mirrors the frozen loop's own `buildDeploymentDeltaMap`
 * (`cash-assembly-period-loop-v1.ts:389-407`) exactly: this is basis-to-
 * input ASSEMBLY (constructing one of the loop's required inputs from the
 * pinned forecast basis), not a re-derivation of a financial RESULT — the
 * loop re-validates this exact match via `assertScheduledDeploymentsMatchForecast`
 * and throws `SCHEDULE_GRID_MISMATCH` if this service ever drifts from it.
 * Fees/expenses are fixed at zero (Brief 2 zero-fee bridge; gate 7 already
 * proved the pinned basis is zero-fee-compatible before this is called).
 */
function buildScheduledNeedsFromForecast(
  forecastSeries: readonly CurrentForecastSeriesPointV1[]
): CallSizingQuarterNeedInputV1[] {
  const sorted = [...forecastSeries].sort(compareForecastPointsForAssembly);
  const needs: CallSizingQuarterNeedInputV1[] = [];
  let previousCumulativeDeployment = new Decimal(0);

  for (const point of sorted) {
    const cumulativeDeployment = new Decimal(point.deployedUsd);
    if (point.source === 'projected') {
      needs.push({
        period: {
          periodStart: point.periodStart,
          periodEnd: point.periodEnd,
          source: point.source,
        },
        scheduledDeploymentUsd: cumulativeDeployment.minus(previousCumulativeDeployment),
        scheduledFeeUsd: new Decimal(0),
        scheduledExpenseUsd: new Decimal(0),
      });
    }
    previousCumulativeDeployment = cumulativeDeployment;
  }
  return needs;
}

function deriveIrrBasis(
  terminalMode: LoadedBasis['policyBody']['terminalMode']
): LpEconomicsIrrBasisV1 {
  // The loop injects the terminal NAV as a synthetic XIRR flow only on the
  // hold_unrealized path (`cash-assembly-period-loop-v1.ts:956-965`); on
  // liquidate_at_horizon every flow, including the terminal liquidation, is
  // an actual distribution event. terminalMode is pinned basis, so this
  // derivation is purity-preserving, not a re-derivation of a result.
  return terminalMode === 'hold_unrealized' ? 'cash_plus_terminal_nav' : 'cash_only';
}

// ---------------------------------------------------------------------------
// Section 6: event enrichment + totals assembly (the one named exception to
// the no-arithmetic pass-through rule — Decimal-safe aggregation only).
// ---------------------------------------------------------------------------

function enrichWaterfallEvents(
  loopEvents: readonly CashAssemblyWaterfallEventV1[]
): LpEconomicsWaterfallEventV1[] {
  return loopEvents.map((event, index): LpEconomicsWaterfallEventV1 => {
    // The terminal-liquidation allocation, if present, is always the last
    // element the loop emits (`cash-assembly-period-loop-v1.ts:763,770-773`
    // appends it after every ordinary core distribution). Position alone is
    // not sufficient, though: a run with no terminal event still has an
    // ordinary distribution at the last index, so eventKind is a two-part
    // discriminant — last position AND the frozen loop's own literal
    // `:terminal_liquidation` sourceId suffix (`cash-assembly-period-loop-v1.ts:445`)
    // — never derived by parsing any OTHER part of the opaque sourceId
    // string (section 6 R3(b); the suffix check is a structural read of a
    // literal the frozen module itself appends, not string interpretation).
    const isTerminal =
      index === loopEvents.length - 1 && event.sourceId.endsWith(':terminal_liquidation');
    return {
      ...event,
      eventSequence: index,
      eventId: buildLpEconomicsEventIdV1({
        sourceId: event.sourceId,
        periodEnd: event.periodEnd,
        eventSequence: index,
      }),
      sourceRefs: [{ sourceId: event.sourceId }],
      eventKind: isTerminal ? 'terminal_realization' : 'forecast_quarterly_distribution',
    };
  });
}

function sumMoney(values: readonly string[]): string {
  return values.reduce((total, value) => total.plus(value), new Decimal(0)).toFixed(6);
}

/**
 * Section 6(c) three-way split: (i) Decimal-safe summation over QUARTER rows
 * for flow fields beyond the LP capital/profit split; (ii) Decimal-safe
 * summation over EVENT rows for the LP-capital-return/profit split
 * specifically (quarter rows only carry the aggregate `lpDistributionUsd`);
 * (iii) verbatim terminal-quarter-row pass-through for stock/ratio fields —
 * never re-derived, never a reimplementation of `calculateGuardedRatios`.
 */
function assembleTotals(
  quarters: readonly CashAssemblyQuarterRowV1[],
  enrichedEvents: readonly LpEconomicsWaterfallEventV1[]
): LpEconomicsTotalsV1 {
  const terminalQuarter = quarters.at(-1);
  if (terminalQuarter === undefined) {
    throw new Error('assembleTotals requires at least one quarter row.');
  }
  return {
    lpCapitalCallUsd: sumMoney(quarters.map((quarter) => quarter.lpCapitalCallUsd)),
    gpCommitmentCallUsd: sumMoney(quarters.map((quarter) => quarter.gpCommitmentCallUsd)),
    portfolioDeploymentUsd: sumMoney(quarters.map((quarter) => quarter.portfolioDeploymentUsd)),
    managementFeesUsd: sumMoney(quarters.map((quarter) => quarter.managementFeesUsd)),
    fundExpensesUsd: sumMoney(quarters.map((quarter) => quarter.fundExpensesUsd)),
    grossRealizedProceedsUsd: sumMoney(quarters.map((quarter) => quarter.grossRealizedProceedsUsd)),
    lpCapitalReturnUsd: sumMoney(enrichedEvents.map((event) => event.lpCapitalReturnUsd)),
    lpProfitUsd: sumMoney(enrichedEvents.map((event) => event.lpProfitUsd)),
    lpDistributionUsd: sumMoney(quarters.map((quarter) => quarter.lpDistributionUsd)),
    gpInvestmentDistributionUsd: sumMoney(
      quarters.map((quarter) => quarter.gpInvestmentDistributionUsd)
    ),
    gpCarryDistributedUsd: sumMoney(quarters.map((quarter) => quarter.gpCarryDistributedUsd)),
    endingCashUsd: terminalQuarter.endingCashUsd,
    grossNavUsd: terminalQuarter.grossNavUsd,
    lpNetNavUsd: terminalQuarter.lpNetNavUsd,
    dpi: terminalQuarter.dpi,
    rvpi: terminalQuarter.rvpi,
    tvpi: terminalQuarter.tvpi,
  };
}

function buildIndicativeReasons(
  resultStatusReasons: readonly string[]
): LpEconomicsIndicativeReasonV1[] {
  const reasons = resultStatusReasons.map((code) => ({
    code: code as LpEconomicsIndicativeReasonV1['code'],
  }));
  return [...sortAndDedupeLpEconomicsReasonsV1(reasons)];
}

// ---------------------------------------------------------------------------
// Persistence (P-D4/P-D5 mapping). Common lineage fields are identical
// across all three outcomes; only the state-coupled fields differ.
// ---------------------------------------------------------------------------

interface CommonRunFields {
  readonly fundId: number;
  readonly policyVersionId: number;
  readonly factsSnapshotId: number;
  readonly planVersionId: number;
  readonly forecastSnapshotId: number;
  readonly evaluationClock: Date;
  readonly terminalMode: LpEconomicsRunRequestV1['terminalMode'];
  readonly engineVersion: string;
  readonly methodologyVersion: string;
  readonly inputHash: string;
  readonly createdBy: number | null;
  readonly idempotencyKey: string;
  readonly preimagePlain: Record<string, unknown>;
}

/**
 * `input_hash`: a content-identity hash of the resolved basis-pin set
 * (request basis IDs plus the envelope ID transitively pinned by policy,
 * plus the deployed-code engine/methodology identity) — distinct from
 * `request_hash` (the client-authoritative idempotency preimage, which
 * intentionally excludes the envelope ID since it is resolved, not
 * client-supplied). Computable immediately after basis reads complete,
 * before any gate or admission-control check.
 */
function buildInputHash(input: {
  readonly fundId: number;
  readonly policyVersionId: number;
  readonly envelopeVersionId: number;
  readonly factsSnapshotId: number;
  readonly planVersionId: number;
  readonly forecastSnapshotId: number;
  readonly terminalMode: string;
  readonly clock: string;
  readonly engineVersion: string;
  readonly methodologyVersion: string;
}): string {
  return canonicalSha256(input);
}

async function insertRunRow(
  database: RunDatabase,
  common: CommonRunFields,
  stateFields: {
    readonly runState: 'completed' | 'failed';
    readonly resultSnapshotId: number | null;
    readonly resultSnapshotType: 'INTERNAL_LP_ECONOMICS' | null;
    readonly resultStatus: 'indicative' | 'unavailable' | null;
    readonly resultHash: string | null;
    readonly failureCode: string | null;
    readonly failureContext: Record<string, unknown> | null;
  }
): Promise<InternalLpEconomicsRunRow> {
  const loadExistingRun = async (): Promise<{
    row: InternalLpEconomicsRunRow;
    requestHash: string;
  } | null> => {
    const [existing] = await database
      .select()
      .from(internalLpEconomicsRuns)
      .where(
        and(
          eq(internalLpEconomicsRuns.fundId, common.fundId),
          eq(internalLpEconomicsRuns.idempotencyKey, common.idempotencyKey)
        )
      )
      .limit(1);
    return existing ? { row: existing, requestHash: existing.requestHash } : null;
  };

  const result = await runIdempotentCommand<InternalLpEconomicsRunRow>({
    db: database,
    fundId: common.fundId,
    idempotencyKey: common.idempotencyKey,
    contractVersion: LP_ECONOMICS_RUN_CONTRACT_VERSION,
    request: common.preimagePlain,
    loadExisting: loadExistingRun,
    insert: async (requestHash) => {
      const [inserted] = await database
        .insert(internalLpEconomicsRuns)
        .values({
          fundId: common.fundId,
          policyVersionId: common.policyVersionId,
          factsSnapshotId: common.factsSnapshotId,
          planVersionId: common.planVersionId,
          forecastSnapshotId: common.forecastSnapshotId,
          forecastSnapshotType: 'CURRENT_FORECAST_V2',
          resultSnapshotId: stateFields.resultSnapshotId,
          resultSnapshotType: stateFields.resultSnapshotType,
          runState: stateFields.runState,
          resultStatus: stateFields.resultStatus,
          failureCode: stateFields.failureCode,
          failureContext: stateFields.failureContext,
          evaluationClock: common.evaluationClock,
          terminalMode: common.terminalMode,
          engineVersion: common.engineVersion,
          methodologyVersion: common.methodologyVersion,
          inputHash: common.inputHash,
          resultHash: stateFields.resultHash,
          createdBy: common.createdBy,
          idempotencyKey: common.idempotencyKey,
          requestHash,
        })
        .onConflictDoNothing({
          target: [internalLpEconomicsRuns.fundId, internalLpEconomicsRuns.idempotencyKey],
        })
        .returning();
      return inserted ?? null;
    },
  });
  return result.row;
}

async function insertResultSnapshot(
  database: RunDatabase,
  input: {
    readonly fundId: number;
    readonly clock: string;
    readonly payload: LpEconomicsResultV1;
  }
): Promise<number> {
  const [inserted] = await database
    .insert(fundSnapshots)
    .values({
      fundId: input.fundId,
      type: 'INTERNAL_LP_ECONOMICS',
      payload: input.payload,
      state: null,
      scenarioSetId: null,
      snapshotTime: new Date(input.clock),
      calcVersion: LP_ECONOMICS_RESULT_CALC_VERSION,
      correlationId: randomUUID(),
    })
    .returning({ id: fundSnapshots.id });
  if (inserted === undefined || !Number.isSafeInteger(inserted.id) || inserted.id <= 0) {
    throw new Error('Internal LP economics result snapshot insert did not return a persisted id.');
  }
  return inserted.id;
}

async function persistFailedRun(
  database: RunDatabase,
  common: CommonRunFields,
  failureCode: string,
  failureContext: Record<string, unknown>
): Promise<LpEconomicsRunReceipt> {
  const run = await insertRunRow(database, common, {
    runState: 'failed',
    resultSnapshotId: null,
    resultSnapshotType: null,
    resultStatus: null,
    resultHash: null,
    failureCode,
    failureContext,
  });
  return { run, result: null };
}

// `resultHash` (below and in `persistCompletedRun`) hashes the persisted
// value payload only (value + reasons); it deliberately excludes basis IDs.
// Basis-identity coverage for the row lives in `common.inputHash` (built by
// `buildInputHash` from the pinned policy/envelope/facts/plan/forecast IDs
// + terminalMode + clock + engine/methodology version), a separate column
// on the same run row (section 4). Together the two columns satisfy section
// 6's "covers basis, value, provenance, exclusions, and reasons" clause
// without duplicating basis identity into the value hash.
async function persistUnavailableRun(
  database: RunDatabase,
  common: CommonRunFields,
  clock: string,
  reasons: readonly LpEconomicsRunUnavailabilityReasonV1[]
): Promise<LpEconomicsRunReceipt> {
  const sortedReasons = sortAndDedupeLpEconomicsReasonsV1(reasons);
  const payload = LpEconomicsResultV1Schema.parse({
    waterfallTemplate: 'deal_by_deal',
    resultStatus: 'unavailable',
    clock,
    currency: 'USD',
    perspective: 'lp_net',
    precisionMode: 'decimal_native_with_float64_xirr',
    reasons: sortedReasons,
  });
  const resultSnapshotId = await insertResultSnapshot(database, {
    fundId: common.fundId,
    clock,
    payload,
  });
  const run = await insertRunRow(database, common, {
    runState: 'completed',
    resultSnapshotId,
    resultSnapshotType: 'INTERNAL_LP_ECONOMICS',
    resultStatus: 'unavailable',
    resultHash: canonicalSha256(payload),
    failureCode: null,
    failureContext: null,
  });
  return { run, result: payload };
}

async function persistCompletedRun(
  database: RunDatabase,
  common: CommonRunFields,
  clock: string,
  payload: LpEconomicsResultV1
): Promise<LpEconomicsRunReceipt> {
  const resultSnapshotId = await insertResultSnapshot(database, {
    fundId: common.fundId,
    clock,
    payload,
  });
  const run = await insertRunRow(database, common, {
    runState: 'completed',
    resultSnapshotId,
    resultSnapshotType: 'INTERNAL_LP_ECONOMICS',
    resultStatus: 'indicative',
    resultHash: canonicalSha256(payload),
    failureCode: null,
    failureContext: null,
  });
  return { run, result: payload };
}

async function buildReceiptFromRunRow(
  run: InternalLpEconomicsRunRow,
  database: RunDatabase
): Promise<LpEconomicsRunReceipt> {
  if (run.runState === 'failed' || run.resultSnapshotId === null) {
    return { run, result: null };
  }
  const [snapshotRow] = await database
    .select()
    .from(fundSnapshots)
    .where(
      and(
        eq(fundSnapshots.id, run.resultSnapshotId),
        eq(fundSnapshots.fundId, run.fundId),
        eq(fundSnapshots.type, 'INTERNAL_LP_ECONOMICS')
      )
    )
    .limit(1);
  if (snapshotRow === undefined) {
    throw new LpEconomicsRunServiceError(
      500,
      'RUN_RESULT_SNAPSHOT_MISSING',
      'The run result snapshot could not be read back by (id, fund, type).'
    );
  }
  return { run, result: LpEconomicsResultV1Schema.parse(snapshotRow.payload) };
}

// ---------------------------------------------------------------------------
// Main orchestrator: P-D7 steps 1-10, executed once per transaction attempt.
// ---------------------------------------------------------------------------

async function executeLpEconomicsRunInTransaction(params: {
  readonly opts: ExecuteLpEconomicsRunOptions;
  readonly database: RunDatabase;
}): Promise<LpEconomicsRunReceipt> {
  const { opts, database } = params;
  const { fundId, request } = opts;

  // Step 1: fund-scoped advisory lock (G4 namespace convention).
  await lockRunGeneration(database, fundId);

  // Step 2: early idempotent replay, before ANY basis read (G16 fail-closed
  // lesson). The preimage already carries fundId + contractVersion at its
  // top level (P-D8), so it doubles directly as the replay request.
  const preimage = buildLpEconomicsRunIdempotencyPreimageV1({
    fundId,
    request,
    engineVersion: LP_ECONOMICS_RUN_ENGINE_VERSION,
    methodologyVersion: LP_ECONOMICS_RUN_METHODOLOGY_VERSION,
  });
  const preimagePlain: Record<string, unknown> = { ...preimage };

  const replay = await replayIdempotentCommandIfPresent<InternalLpEconomicsRunRow>({
    db: database,
    fundId,
    idempotencyKey: opts.idempotencyKey,
    contractVersion: LP_ECONOMICS_RUN_CONTRACT_VERSION,
    request: preimagePlain,
    loadExisting: async () => {
      const [existing] = await database
        .select()
        .from(internalLpEconomicsRuns)
        .where(
          and(
            eq(internalLpEconomicsRuns.fundId, fundId),
            eq(internalLpEconomicsRuns.idempotencyKey, opts.idempotencyKey)
          )
        )
        .limit(1);
      return existing ? { row: existing, requestHash: existing.requestHash } : null;
    },
  });
  if (replay !== null) {
    return buildReceiptFromRunRow(replay.row, database);
  }

  // Step 3: basis reads by explicit IDs only (ADR-065 item 1) with
  // ownership asserts (P-D9). Terminal-mode match is validated immediately
  // after the policy read.
  const policy = await loadPolicyRow(database, fundId, request.policyVersionId);
  const policyBody = EconomicsPolicyBodyV1Schema.parse(policy.policyBody);
  if (request.terminalMode !== policyBody.terminalMode) {
    throw new LpEconomicsRunServiceError(
      422,
      'TERMINAL_MODE_MISMATCH',
      `Request terminalMode "${request.terminalMode}" does not match the pinned policy's terminalMode "${policyBody.terminalMode}".`
    );
  }
  const envelope = await loadEnvelopeRow(database, fundId, policy.capitalEnvelopeVersionId);
  const facts = await loadFactsRow(database, fundId, request.factsSnapshotId);
  const plan = await loadPlanRow(database, fundId, request.planVersionId);
  const { forecast } = await loadForecastRow(database, fundId, request.forecastSnapshotId);

  // Raw candidate (unvalidated methodology-version literal) — gate 8 is the
  // sole validation point (G11); the branded `PersistedTerminalResolutionV1`
  // is derived via `terminalResolutionHashPreimageV1` only after gate 8
  // passes, immediately before loop-input assembly.
  const persistedTerminalResolutionCandidate: unknown = {
    terminalPeriodEnd: policy.terminalPeriodEnd,
    terminalResolutionMethodologyVersion: policy.terminalResolutionMethodologyVersion,
  };

  const common: CommonRunFields = {
    fundId,
    policyVersionId: policy.id,
    factsSnapshotId: facts.id,
    planVersionId: plan.id,
    forecastSnapshotId: request.forecastSnapshotId,
    evaluationClock: new Date(request.clock),
    terminalMode: request.terminalMode,
    engineVersion: LP_ECONOMICS_RUN_ENGINE_VERSION,
    methodologyVersion: LP_ECONOMICS_RUN_METHODOLOGY_VERSION,
    inputHash: buildInputHash({
      fundId,
      policyVersionId: policy.id,
      envelopeVersionId: envelope.id,
      factsSnapshotId: facts.id,
      planVersionId: plan.id,
      forecastSnapshotId: request.forecastSnapshotId,
      terminalMode: request.terminalMode,
      clock: request.clock,
      engineVersion: LP_ECONOMICS_RUN_ENGINE_VERSION,
      methodologyVersion: LP_ECONOMICS_RUN_METHODOLOGY_VERSION,
    }),
    createdBy: opts.actorId,
    idempotencyKey: opts.idempotencyKey,
    preimagePlain,
  };

  // Step 4: section 8's nine eligibility gates, in registry order, BEFORE
  // the admission-control guards below — a basis that is both
  // gate-ineligible and operationally oversized must resolve as the
  // ratified completed-`unavailable` gate outcome, never a `failed` guard
  // rejection (P-D7 step ordering: gates are step 4, guards are folded
  // into step 5's pre-invocation preparation). A hit is a COMPLETED run
  // (D9 unavailable envelope).
  const gate1 = gateVehicleRoster(envelope, facts);
  if (gate1 !== null) return persistUnavailableRun(database, common, request.clock, [gate1]);

  const gate2 = gateConfigLineage(policy, plan);
  if (gate2 !== null) return persistUnavailableRun(database, common, request.clock, [gate2]);

  const gate3 = gateForecastBasisState(forecast);
  if (gate3 !== null) return persistUnavailableRun(database, common, request.clock, [gate3]);

  const gate4 = gateFactsConsumerEvaluation(facts);
  if (gate4 !== null) return persistUnavailableRun(database, common, request.clock, [gate4]);

  // Gate 5: opening state (P-D10). Distinct from gate 6's envelope check.
  const openingStateOutcome = readOpeningStateFromFacts(facts);
  if (openingStateOutcome.kind === 'absent') {
    return persistUnavailableRun(database, common, request.clock, [
      { code: 'OPENING_CASH_UNAVAILABLE', detail: 'No authoritative opening cash in facts.' },
    ]);
  }
  if (openingStateOutcome.kind === 'contract_ineligible') {
    return persistUnavailableRun(database, common, request.clock, [
      {
        code: 'OPENING_STATE_CONTRACT_INELIGIBLE',
        context: { detail: OPENING_STATE_CONTRACT_V1_INELIGIBLE_DETAIL },
      },
    ]);
  }
  const openingState = openingStateOutcome.observation;
  const nonzeroField = firstNonzeroOpeningBalanceField(openingState);
  if (nonzeroField !== null) {
    return persistUnavailableRun(database, common, request.clock, [
      {
        code: 'OPENING_STATE_INELIGIBLE',
        detail: `${nonzeroField.field} must be zero for the V1 period loop.`,
        context: { field: nonzeroField.field, valueUsd: nonzeroField.valueUsd },
      },
    ]);
  }

  const gate6 = gateGpCommitment(envelope);
  if (gate6 !== null) return persistUnavailableRun(database, common, request.clock, [gate6]);

  const fundConfigRow = await loadFundConfigRow(database, fundId, policy.sourceConfigId);
  // fundConfigs rows are mutable in place (fund-persistence-service.ts's
  // draft-sync path updates `config` without bumping `version`); a stale
  // read here would silently break ADR-065 item 1's basis-purity contract
  // for gate 7. Fail closed on drift, mirroring the version-match check
  // economics-policy-service.ts already performs at policy-seed time.
  if (fundConfigRow !== undefined && fundConfigRow.version !== policy.sourceConfigVersion) {
    throw new LpEconomicsRunServiceError(
      409,
      'SOURCE_CONFIG_VERSION_DRIFTED',
      `fundConfigs row ${policy.sourceConfigId} is at version ${fundConfigRow.version}, but the pinned policy expects version ${policy.sourceConfigVersion}.`
    );
  }
  const gate7 = gateZeroFeeBridge({
    config: fundConfigRow?.config,
    plan,
    forecast,
    envelope,
  });
  if (gate7 !== null) return persistUnavailableRun(database, common, request.clock, [gate7]);

  const gate8 = gateTerminalResolution({
    persistedTerminalResolution: persistedTerminalResolutionCandidate,
    termStartDate: policyBody.termStartDate,
    fundLifeYears: policyBody.fundLifeYears,
    forecast,
    openingCutoverInstant: openingState.cutoverInstant,
  });
  if (gate8 !== null) return persistUnavailableRun(database, common, request.clock, [gate8]);

  // Gate 8 already proved the candidate's methodology-version literal
  // matches; this call is now guaranteed not to throw.
  const persistedTerminalResolution: PersistedTerminalResolutionV1 =
    terminalResolutionHashPreimageV1(persistedTerminalResolutionCandidate);

  // Step 5: two pre-invocation admission-control guards (P-D7 R5/R6/R7),
  // now that every gate has passed. Period count measures the ASSEMBLED
  // grid via the frozen module's own exported filter (never the raw,
  // pre-terminal-truncation forecast series length), so a legitimately
  // small post-truncation workload is never falsely rejected. A violation
  // persists a FAILED run row: no snapshot, key consumed.
  const factsEvents = buildFactsEventsFromPayload(facts);
  const factsNavMarks = buildFactsNavMarksFromPayload(facts);
  const factsPeriodNav = buildFactsPeriodNavFromPayload(facts);
  const assembledGrid = buildCashAssemblyPeriodGridV1({
    forecastSeries: forecast.series,
    persistedTerminalResolution,
  });
  const admission = countAdmission({
    periodCount: assembledGrid.length,
    factsEvents,
    factsNavMarks,
    factsPeriodNav,
  });
  if (admission.periodCount > MAX_CASH_ASSEMBLY_PERIOD_COUNT) {
    return persistFailedRun(database, common, 'CASH_ASSEMBLY_PERIOD_COUNT_EXCEEDED', {
      bound: MAX_CASH_ASSEMBLY_PERIOD_COUNT,
      observed: admission.periodCount,
    });
  }
  if (admission.totalEventCount > MAX_CASH_ASSEMBLY_TOTAL_EVENT_COUNT) {
    return persistFailedRun(database, common, 'CASH_ASSEMBLY_TOTAL_EVENT_COUNT_EXCEEDED', {
      bound: MAX_CASH_ASSEMBLY_TOTAL_EVENT_COUNT,
      observed: admission.totalEventCount,
    });
  }

  // Step 6 (P-D7 4b): valid only because gate 6 already proved zero GP
  // commitment.
  const unfundedEnvelopeRemainingUsd = new Decimal(envelope.lpCommitmentUsd).minus(
    openingState.cumulativeLpPaidInUsd
  );

  // Step 7: assemble the frozen loop's exact input shape and invoke it
  // exactly once.
  const loopInput: ExecuteCashAssemblyPeriodLoopV1Input = {
    factsSnapshotId: facts.id,
    forecastSnapshotId: request.forecastSnapshotId,
    economicsPolicyVersion: policy.policySchemaVersion,
    engineVersion: LP_ECONOMICS_RUN_ENGINE_VERSION,
    methodologyVersion: LP_ECONOMICS_RUN_METHODOLOGY_VERSION,
    factsEvents,
    factsNavMarks,
    factsPeriodNav,
    openingState,
    forecastSeries: forecast.series,
    scheduledNeeds: buildScheduledNeedsFromForecast(forecast.series),
    cashBufferQuarters: policyBody.cashBufferQuarters,
    unfundedEnvelopeRemainingUsd,
    persistedTerminalResolution,
    terminalMode: request.terminalMode,
    carryPct: policyBody.carryPct,
  };

  const loopStartedAtMs = Date.now();
  let loopResult;
  try {
    loopResult = executeCashAssemblyPeriodLoopV1(loopInput);
  } catch (error) {
    logStructuredWarning('lp_economics_run_loop_duration_ms', {
      durationMs: Date.now() - loopStartedAtMs,
      outcome: 'error',
    });
    // Step 9: typed engine failure -> P-D7 step 6's table dispatch.
    const classified = classifyLoopError(error);
    if (classified === null) {
      // Step 10: unexpected exception -> full rollback (rethrow out of the
      // transaction), nothing persisted, key not consumed.
      throw error;
    }
    if (classified.disposition === 'unavailable') {
      return persistUnavailableRun(database, common, request.clock, [
        unavailabilityReasonFromLoopError(classified),
      ]);
    }
    return persistFailedRun(database, common, classified.code, {
      errorClass: classified.errorClass,
      message: classified.message,
      ...classified.context,
    });
  }
  logStructuredWarning('lp_economics_run_loop_duration_ms', {
    durationMs: Date.now() - loopStartedAtMs,
    outcome: 'success',
  });

  // Step 8: success -- event enrichment, totals assembly, reason
  // sort/dedupe (exactly once), persist result snapshot + run row.
  const enrichedEvents = enrichWaterfallEvents(loopResult.waterfallEvents);
  const totals = assembleTotals(loopResult.quarters, enrichedEvents);
  const reasons = buildIndicativeReasons(loopResult.resultStatusReasons);
  const resultEnvelope = LpEconomicsResultV1Schema.parse({
    waterfallTemplate: 'deal_by_deal',
    resultStatus: 'indicative',
    clock: request.clock,
    currency: 'USD',
    perspective: 'lp_net',
    precisionMode: 'decimal_native_with_float64_xirr',
    quarters: loopResult.quarters,
    waterfallEvents: enrichedEvents,
    totals,
    terminalNavBeforeRealizationUsd: loopResult.terminalNavBeforeRealizationUsd,
    lpNetIrr: loopResult.lpNetIrr,
    lpNetIrrBasis: deriveIrrBasis(request.terminalMode),
    lpNetIrrDiagnostic: loopResult.xirrDiagnostic,
    reasons,
  });

  return persistCompletedRun(database, common, request.clock, resultEnvelope);
}
