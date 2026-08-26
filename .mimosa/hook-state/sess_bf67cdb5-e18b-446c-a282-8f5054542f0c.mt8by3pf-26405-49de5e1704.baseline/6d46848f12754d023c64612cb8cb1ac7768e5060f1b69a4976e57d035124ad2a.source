/**
 * quarterly-schedule-compiler-v1.ts
 *
 * Compiles a canonical quarterly fee/expense schedule by consuming
 * the Effective Fee/Expense Bridge V1.
 *
 * Design invariants
 * -----------------
 *   - Thin consumer: delegates all validation and vector construction
 *     to `buildEffectiveFeeExpenseBridgeV1`.  Contains NO fee arithmetic
 *     of its own -- never derives fees, divides annual fees by four, or
 *     adapts calculateManagementFeeForYear / fee-drag-compiler.
 *   - Pure function, no side-effects, no I/O.
 *   - Propagates typed rejections from the bridge unchanged.
 *   - Output is JSON-serialisable; all money values are canonical
 *     decimal strings (6 dp).
 */

import type {
  EffectiveFeeExpenseBridgeInputV1,
  EffectiveFeeExpenseBridgeResultV1,
  EffectiveFeeExpenseBridgeV1,
  EffectiveFeeExpenseQuarterV1,
} from '../../contracts/internal-economics/effective-fee-expense-bridge-v1.contract';
import { buildEffectiveFeeExpenseBridgeV1 } from './effective-fee-expense-bridge-v1';

// ── constants ────────────────────────────────────────────────────────

const COMPILER_VERSION = 'quarterly-schedule-compiler/1.0.0' as const;

// ── public types ─────────────────────────────────────────────────────

/** One quarter in the compiled schedule. */
export interface QuarterlyScheduleEntryV1 {
  periodStart: string;
  periodEnd: string;
  scheduledManagementFeeUsd: string;
  scheduledFundExpenseUsd: string;
  planUpfrontFeeReserveUsd: string;
  forecastNavEmbeddedFeeUsd: string;
  economicsFeeCashDebitUsd: string;
  economicsExpenseCashDebitUsd: string;
}

/** Successful compiler output. */
export interface QuarterlyScheduleV1 {
  compilerVersion: typeof COMPILER_VERSION;
  sourceBridgeHash: string;
  capitalBaseUsd: string;
  schedule: QuarterlyScheduleEntryV1[];
}

/** Discriminated-union result. */
export type QuarterlyScheduleResultV1 =
  | { ok: true; schedule: QuarterlyScheduleV1 }
  | { ok: false; code: 'FORECAST_FEE_BASIS_INCOMPATIBLE'; reasons: string[] };

// ── builder ──────────────────────────────────────────────────────────

/**
 * Compile a canonical quarterly fee/expense schedule.
 *
 * Accepts the same input as the bridge.  Internally calls
 * `buildEffectiveFeeExpenseBridgeV1`; on success, projects the
 * bridge's quarterly vector into the schedule output.  On failure,
 * returns the bridge's typed rejection unchanged.
 *
 * @param input - Bridge-compatible input (config + plan + forecast + commitment)
 * @returns Discriminated-union result with schedule or rejection
 */
export function compileQuarterlyScheduleV1(
  input: EffectiveFeeExpenseBridgeInputV1
): QuarterlyScheduleResultV1 {
  const bridgeResult = buildEffectiveFeeExpenseBridgeV1(input) as EffectiveFeeExpenseBridgeResultV1;

  if (!bridgeResult.ok) {
    return bridgeResult;
  }

  const bridge: EffectiveFeeExpenseBridgeV1 = bridgeResult.bridge;

  const schedule: QuarterlyScheduleEntryV1[] = bridge.quarterlyVector.map(
    (quarter: EffectiveFeeExpenseQuarterV1) => ({
      periodStart: quarter.periodStart,
      periodEnd: quarter.periodEnd,
      scheduledManagementFeeUsd: quarter.scheduledManagementFeeUsd,
      scheduledFundExpenseUsd: quarter.scheduledFundExpenseUsd,
      planUpfrontFeeReserveUsd: quarter.planUpfrontFeeReserveUsd,
      forecastNavEmbeddedFeeUsd: quarter.forecastNavEmbeddedFeeUsd,
      economicsFeeCashDebitUsd: quarter.economicsFeeCashDebitUsd,
      economicsExpenseCashDebitUsd: quarter.economicsExpenseCashDebitUsd,
    })
  );

  return {
    ok: true,
    schedule: {
      compilerVersion: COMPILER_VERSION,
      sourceBridgeHash: bridge.effectiveFeeExpenseHash,
      capitalBaseUsd: bridge.capitalBaseUsd,
      schedule,
    },
  };
}
