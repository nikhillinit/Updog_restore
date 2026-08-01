/**
 * cash-assembly-call-sizing-v1.ts
 *
 * WP-2b-3: call sizing and buffer roll-down (spec D6, the "hard core").
 *
 * Dedicated, separately-tested function that turns a quarterly schedule of
 * deployment/fee/expense needs into a capital-call schedule: how much must
 * be called from LPs each quarter, and when it lands (periodStart vs
 * periodEnd slot).
 *
 * The coverage-target formula and the periodStart/periodEnd call-timing
 * split below are PROPOSED / DECISION per the governing plan, not settled
 * spec fact -- see the accompanying design note
 * (.superpowers/sdd/2026-07-30-task163-wp-l2b-cash-assembly-and-nonzero-fees-plan/wp2b3-design-note.md)
 * for the full rationale. That note is the approval-gate (A1) artifact.
 *
 * Design invariants
 * -----------------
 *  - Pure, no I/O, no ambient clock (D4 boundary).
 *  - Full-precision Decimal internally; canonical decimal strings (6 dp)
 *    only at the output boundary.
 *  - Envelope enforcement is reject-never-clamp: the first quarter whose
 *    requested call would exceed the remaining unfunded envelope throws
 *    COMMITTED_CAPITAL_EXCEEDED, never silently caps the call.
 *  - Opening cash must be a pinned fact; missing throws
 *    OPENING_CASH_UNAVAILABLE. Never assumed zero.
 *  - Every `scheduledDeploymentUsd` / `scheduledFeeUsd` / `scheduledExpenseUsd`
 *    input must be non-negative -- the coverage-target monotonicity,
 *    timing-only/never-total, and roll-to-zero-with-no-residual proofs in
 *    the design note all depend on it. A negative value throws
 *    NEGATIVE_SCHEDULED_AMOUNT (first violating quarter/field) instead of
 *    silently making the recurrence non-monotonic.
 *  - V1 supports zero-fee/zero-expense schedules only. The
 *    periodStart/periodEnd two-slot split subtracts the fee/expense
 *    true-up from the total call; that subtraction is only proven
 *    non-negative when the true-up is zero. A nonzero `scheduledFeeUsd` /
 *    `scheduledExpenseUsd` throws NONZERO_FEE_EXPENSE_UNSUPPORTED_V1
 *    instead of letting the subtraction run and potentially emit a
 *    negative call slot.
 *  - All money inputs (scheduled amounts, opening cash, unfunded envelope)
 *    are assumed to already be at canonical 6dp precision, as produced by
 *    D2/pinned facts. This function does not itself round inputs to 6dp
 *    before doing Decimal arithmetic; a sub-6dp input is out of contract
 *    and could in principle produce per-row outputs that don't sum
 *    exactly to `totalCalledUsd` after independent 6dp formatting of each
 *    row.
 *  - Does not model deployments/fees/proceeds/distributions consuming cash
 *    over time -- that full recurrence is WP-2b-4's period loop. In
 *    particular, calls are sized net of the horizon-*starting*
 *    `openingCashUsd` only, never net of interim realized/recallable
 *    proceeds landing in earlier quarters -- see the design note's
 *    review-ask #4.
 */

import { Decimal } from '../decimal-config';
import { MoneyDecimalStringSchema, toFixedDecimalString } from '../decimal-string';
import type { CashAssemblyPeriodV1 } from './cash-assembly-types-v1';

export const INTERNAL_ECONOMICS_CALL_SIZING_VERSION =
  'internal-economics-cash-assembly-call-sizing/1.0.0' as const;

export type CashAssemblyCallSizingV1ErrorCode =
  | 'OPENING_CASH_UNAVAILABLE'
  | 'COMMITTED_CAPITAL_EXCEEDED'
  | 'NEGATIVE_SCHEDULED_AMOUNT'
  | 'NONZERO_FEE_EXPENSE_UNSUPPORTED_V1';

export interface CommittedCapitalExceededContextV1 {
  readonly period: CashAssemblyPeriodV1;
  readonly requestedCallUsd: string;
  readonly remainingCapacityUsd: string;
  readonly cumulativeCalledUsd: string;
}

export type NegativeScheduledAmountFieldV1 =
  'scheduledDeploymentUsd' | 'scheduledFeeUsd' | 'scheduledExpenseUsd';

export interface NegativeScheduledAmountContextV1 {
  readonly period: CashAssemblyPeriodV1;
  readonly field: NegativeScheduledAmountFieldV1;
  readonly valueUsd: string;
}

export type FeeExpenseFieldV1 = 'scheduledFeeUsd' | 'scheduledExpenseUsd';

export interface NonzeroFeeExpenseContextV1 {
  readonly period: CashAssemblyPeriodV1;
  readonly field: FeeExpenseFieldV1;
  readonly valueUsd: string;
}

export class CashAssemblyCallSizingV1Error extends Error {
  constructor(
    readonly code: CashAssemblyCallSizingV1ErrorCode,
    message: string,
    readonly context?:
      | CommittedCapitalExceededContextV1
      | NegativeScheduledAmountContextV1
      | NonzeroFeeExpenseContextV1
  ) {
    super(message);
    this.name = 'CashAssemblyCallSizingV1Error';
  }
}

export interface CallSizingQuarterNeedInputV1 {
  readonly period: CashAssemblyPeriodV1;
  readonly scheduledDeploymentUsd: Decimal;
  readonly scheduledFeeUsd: Decimal;
  readonly scheduledExpenseUsd: Decimal;
}

export interface SizeCashAssemblyCallsV1Input {
  readonly quarters: readonly CallSizingQuarterNeedInputV1[];
  readonly cashBufferQuarters: number;
  readonly openingCashUsd: Decimal | null;
  readonly unfundedEnvelopeRemainingUsd: Decimal;
}

export interface CashAssemblyCallSizingQuarterV1 {
  readonly period: CashAssemblyPeriodV1;
  readonly deploymentFundingCallUsd: string;
  readonly feeExpenseTrueUpUsd: string;
  readonly totalCallUsd: string;
  readonly cumulativeCalledUsd: string;
  readonly remainingEnvelopeCapacityUsd: string;
}

export interface SizeCashAssemblyCallsV1Result {
  readonly quarters: CashAssemblyCallSizingQuarterV1[];
  readonly totalCalledUsd: string;
}

function formatMoney(value: Decimal): string {
  return MoneyDecimalStringSchema.parse(toFixedDecimalString(value, 6));
}

function assertValidCashBufferQuarters(cashBufferQuarters: number): void {
  if (!Number.isInteger(cashBufferQuarters) || cashBufferQuarters < 0) {
    throw new Error(
      `cashBufferQuarters must be a non-negative integer, received ${cashBufferQuarters}.`
    );
  }
}

const NEGATIVE_SCHEDULED_AMOUNT_FIELDS: readonly NegativeScheduledAmountFieldV1[] = [
  'scheduledDeploymentUsd',
  'scheduledFeeUsd',
  'scheduledExpenseUsd',
];

/**
 * Every downstream invariant this module proves (coverage-target
 * monotonicity, timing-only/never-total, roll-to-zero-with-no-residual)
 * depends on every scheduled need being non-negative -- see the design
 * note. Enforce that precondition here rather than leaving it as prose:
 * reject the first violating (quarter, field) pair found, in quarter
 * order, never silently letting a negative value make the recurrence
 * non-monotonic.
 */
function assertNonNegativeScheduledAmounts(
  quarters: readonly CallSizingQuarterNeedInputV1[]
): void {
  for (const quarterInput of quarters) {
    for (const field of NEGATIVE_SCHEDULED_AMOUNT_FIELDS) {
      const value = quarterInput[field];
      if (value.lt(0)) {
        throw new CashAssemblyCallSizingV1Error(
          'NEGATIVE_SCHEDULED_AMOUNT',
          `${field} at quarter ending ${quarterInput.period.periodEnd} is negative ` +
            `(${formatMoney(value)}); scheduled deployment/fee/expense amounts must be ` +
            'non-negative for the coverage-target recurrence to stay monotonic.',
          {
            period: quarterInput.period,
            field,
            valueUsd: formatMoney(value),
          }
        );
      }
    }
  }
}

const FEE_EXPENSE_FIELDS: readonly FeeExpenseFieldV1[] = ['scheduledFeeUsd', 'scheduledExpenseUsd'];

/**
 * V1 doctrine is zero-fee/zero-expense only (frozen D2 contract: "zero
 * vector in V1"). The periodStart/periodEnd two-slot split
 * (`deploymentFundingCallUsd = totalCallUsd - feeExpenseTrueUpUsd`) is only
 * proven to stay non-negative when `feeExpenseTrueUpUsd` is zero -- see the
 * design note's flagged simplification. Reject nonzero fee/expense inputs
 * outright, in quarter order, rather than letting that subtraction run and
 * potentially emit a negative call slot for a case V1 doesn't support
 * anyway.
 */
function assertZeroFeeExpense(quarters: readonly CallSizingQuarterNeedInputV1[]): void {
  for (const quarterInput of quarters) {
    for (const field of FEE_EXPENSE_FIELDS) {
      const value = quarterInput[field];
      if (!value.isZero()) {
        throw new CashAssemblyCallSizingV1Error(
          'NONZERO_FEE_EXPENSE_UNSUPPORTED_V1',
          `${field} at quarter ending ${quarterInput.period.periodEnd} is nonzero ` +
            `(${formatMoney(value)}); V1 supports zero-fee/zero-expense schedules only -- ` +
            'the periodStart/periodEnd two-slot split is not proven safe for nonzero fees.',
          {
            period: quarterInput.period,
            field,
            valueUsd: formatMoney(value),
          }
        );
      }
    }
  }
}

/**
 * Prefix sums of combined scheduled need (deployment + fee + expense), one
 * entry per quarter index, cumulative through that index inclusive.
 */
function buildCumulativeNeed(quarters: readonly CallSizingQuarterNeedInputV1[]): Decimal[] {
  const cumulativeNeed: Decimal[] = [];
  let runningNeed = new Decimal(0);
  for (const quarterInput of quarters) {
    runningNeed = runningNeed
      .plus(quarterInput.scheduledDeploymentUsd)
      .plus(quarterInput.scheduledFeeUsd)
      .plus(quarterInput.scheduledExpenseUsd);
    cumulativeNeed.push(runningNeed);
  }
  return cumulativeNeed;
}

export function sizeCashAssemblyCallsV1(
  input: SizeCashAssemblyCallsV1Input
): SizeCashAssemblyCallsV1Result {
  const { quarters, cashBufferQuarters, openingCashUsd, unfundedEnvelopeRemainingUsd } = input;

  assertValidCashBufferQuarters(cashBufferQuarters);
  if (quarters.length === 0) {
    throw new Error('sizeCashAssemblyCallsV1 requires at least one quarter.');
  }
  assertNonNegativeScheduledAmounts(quarters);
  assertZeroFeeExpense(quarters);
  if (openingCashUsd === null) {
    throw new CashAssemblyCallSizingV1Error(
      'OPENING_CASH_UNAVAILABLE',
      'Opening cash is unavailable from pinned facts; call sizing cannot assume zero.'
    );
  }

  const terminalIndex = quarters.length - 1;
  const cumulativeNeed = buildCumulativeNeed(quarters);

  const results: CashAssemblyCallSizingQuarterV1[] = [];
  let cumulativeCallTarget = new Decimal(0);

  for (let index = 0; index <= terminalIndex; index += 1) {
    const quarterInput = quarters[index]!;
    const windowEndIndex = Math.min(index + cashBufferQuarters, terminalIndex);
    const coverageTargetUsd = cumulativeNeed[windowEndIndex]!;
    const nextCumulativeCallTarget = Decimal.max(
      new Decimal(0),
      coverageTargetUsd.minus(openingCashUsd)
    );
    const totalCallUsd = nextCumulativeCallTarget.minus(cumulativeCallTarget);

    const remainingCapacityUsd = unfundedEnvelopeRemainingUsd.minus(cumulativeCallTarget);
    if (totalCallUsd.gt(remainingCapacityUsd)) {
      throw new CashAssemblyCallSizingV1Error(
        'COMMITTED_CAPITAL_EXCEEDED',
        `Requested call of ${formatMoney(totalCallUsd)} at quarter ending ` +
          `${quarterInput.period.periodEnd} exceeds the remaining unfunded envelope of ` +
          `${formatMoney(remainingCapacityUsd)}.`,
        {
          period: quarterInput.period,
          requestedCallUsd: formatMoney(totalCallUsd),
          remainingCapacityUsd: formatMoney(remainingCapacityUsd),
          cumulativeCalledUsd: formatMoney(cumulativeCallTarget),
        }
      );
    }

    const feeExpenseTrueUpUsd = quarterInput.scheduledFeeUsd.plus(quarterInput.scheduledExpenseUsd);
    const deploymentFundingCallUsd = totalCallUsd.minus(feeExpenseTrueUpUsd);

    results.push({
      period: quarterInput.period,
      deploymentFundingCallUsd: formatMoney(deploymentFundingCallUsd),
      feeExpenseTrueUpUsd: formatMoney(feeExpenseTrueUpUsd),
      totalCallUsd: formatMoney(totalCallUsd),
      cumulativeCalledUsd: formatMoney(nextCumulativeCallTarget),
      remainingEnvelopeCapacityUsd: formatMoney(
        unfundedEnvelopeRemainingUsd.minus(nextCumulativeCallTarget)
      ),
    });

    cumulativeCallTarget = nextCumulativeCallTarget;
  }

  return {
    quarters: results,
    totalCalledUsd: formatMoney(cumulativeCallTarget),
  };
}
