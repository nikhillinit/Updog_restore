import { z } from 'zod';

import { Decimal } from '../../lib/decimal-config';
import { MoneyDecimalStringSchema } from '../../lib/decimal-string';

export const INTERNAL_ECONOMICS_TERMINAL_RESOLUTION_VERSION =
  'internal-economics-terminal-resolution/1.0.0' as const;

export const TerminalModeV1Schema = z.enum(['liquidate_at_horizon', 'hold_unrealized']);
export type TerminalModeV1 = z.infer<typeof TerminalModeV1Schema>;

export const PostTermSourceClassV1Schema = z.enum([
  'lp_capital_call',
  'projected_contributions',
  'portfolio_investment',
  'projected_deployment_delta',
  'compiled_management_fee',
  'compiled_fund_expense',
  'actual_fund_expense',
  'actual_lp_distribution',
  'actual_realized_proceeds',
  'actual_recallable_distribution',
  'projected_forecast_quarterly_distribution',
  'actual_nav_mark',
  'actual_period_nav',
  'projected_nav',
]);
export type PostTermSourceClassV1 = z.infer<typeof PostTermSourceClassV1Schema>;

export type TerminalPolicyV1ErrorCode =
  | 'FUND_LIFE_GRID_UNREPRESENTABLE'
  | 'FORECAST_HORIZON_SHORT'
  | 'FORECAST_TERMINAL_PERIOD_UNREPRESENTABLE'
  | 'FORECAST_DEPLOYMENT_CUMULATIVE_DECREASE'
  | 'NEGATIVE_SOURCE_MONEY'
  | 'TERMINAL_BEFORE_CUTOVER'
  | 'TERMINAL_RESOLUTION_METHODOLOGY_UNSUPPORTED'
  | 'TERMINAL_RESOLUTION_MISMATCH';

export class TerminalPolicyV1Error extends Error {
  constructor(
    readonly code: TerminalPolicyV1ErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'TerminalPolicyV1Error';
  }
}

const CalendarDateSchema = z.string().date();
const CanonicalUtcInstantSchema = z.string().datetime({ offset: false });
const DecimalStringSchema = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/);

const TerminalResolutionPolicyInputV1Schema = z
  .object({
    termStartDate: CalendarDateSchema,
    fundLifeYears: DecimalStringSchema,
  })
  .strict();

export const PersistedTerminalResolutionV1Schema = z
  .object({
    terminalPeriodEnd: CalendarDateSchema,
    terminalResolutionMethodologyVersion: z.literal(INTERNAL_ECONOMICS_TERMINAL_RESOLUTION_VERSION),
  })
  .strict();
export type PersistedTerminalResolutionV1 = z.infer<typeof PersistedTerminalResolutionV1Schema>;

const PersistedTerminalResolutionCandidateV1Schema = z
  .object({
    terminalPeriodEnd: CalendarDateSchema,
    terminalResolutionMethodologyVersion: z.string(),
  })
  .strict();

const PersistedTerminalRuntimeInputV1Schema = z
  .object({
    persisted: PersistedTerminalResolutionCandidateV1Schema,
    forecastPeriodEnds: z.array(CalendarDateSchema),
    openingCutoverInstant: CanonicalUtcInstantSchema.optional(),
  })
  .strict();

export interface TerminalResolutionV1 {
  legalTermEndDate: string;
  terminalPeriodEnd: string;
  terminalInstant: string;
  terminalResolutionMethodologyVersion: typeof INTERNAL_ECONOMICS_TERMINAL_RESOLUTION_VERSION;
}

export interface ValidatedPersistedTerminalResolutionV1 extends PersistedTerminalResolutionV1 {
  terminalInstant: string;
}

export type PostTermDispositionV1 =
  | {
      action: 'reject';
      reasonCode: 'POST_TERM_ACTIVITY' | 'FORECAST_FEE_BASIS_INCOMPATIBLE';
    }
  | {
      action: 'exclude' | 'ignore_zero';
      reasonCode: null;
    };

interface PostTermMatrixCellV1 {
  liquidate_at_horizon: Exclude<PostTermDispositionV1, { action: 'ignore_zero' }>;
  hold_unrealized: Exclude<PostTermDispositionV1, { action: 'ignore_zero' }>;
  zeroAmountIsNoOp: boolean;
}

const POST_TERM_REJECT = {
  action: 'reject',
  reasonCode: 'POST_TERM_ACTIVITY',
} as const;
const FEE_BASIS_REJECT = {
  action: 'reject',
  reasonCode: 'FORECAST_FEE_BASIS_INCOMPATIBLE',
} as const;
const EXCLUDE = {
  action: 'exclude',
  reasonCode: null,
} as const;

export const POST_TERM_ACTIVITY_MATRIX_V1 = {
  lp_capital_call: {
    liquidate_at_horizon: POST_TERM_REJECT,
    hold_unrealized: POST_TERM_REJECT,
    zeroAmountIsNoOp: true,
  },
  projected_contributions: {
    liquidate_at_horizon: POST_TERM_REJECT,
    hold_unrealized: POST_TERM_REJECT,
    zeroAmountIsNoOp: true,
  },
  portfolio_investment: {
    liquidate_at_horizon: POST_TERM_REJECT,
    hold_unrealized: POST_TERM_REJECT,
    zeroAmountIsNoOp: true,
  },
  projected_deployment_delta: {
    liquidate_at_horizon: POST_TERM_REJECT,
    hold_unrealized: POST_TERM_REJECT,
    zeroAmountIsNoOp: true,
  },
  compiled_management_fee: {
    liquidate_at_horizon: FEE_BASIS_REJECT,
    hold_unrealized: FEE_BASIS_REJECT,
    zeroAmountIsNoOp: true,
  },
  compiled_fund_expense: {
    liquidate_at_horizon: FEE_BASIS_REJECT,
    hold_unrealized: FEE_BASIS_REJECT,
    zeroAmountIsNoOp: true,
  },
  actual_fund_expense: {
    liquidate_at_horizon: POST_TERM_REJECT,
    hold_unrealized: POST_TERM_REJECT,
    zeroAmountIsNoOp: true,
  },
  actual_lp_distribution: {
    liquidate_at_horizon: POST_TERM_REJECT,
    hold_unrealized: POST_TERM_REJECT,
    zeroAmountIsNoOp: true,
  },
  actual_realized_proceeds: {
    liquidate_at_horizon: POST_TERM_REJECT,
    hold_unrealized: POST_TERM_REJECT,
    zeroAmountIsNoOp: true,
  },
  actual_recallable_distribution: {
    liquidate_at_horizon: POST_TERM_REJECT,
    hold_unrealized: POST_TERM_REJECT,
    zeroAmountIsNoOp: true,
  },
  projected_forecast_quarterly_distribution: {
    liquidate_at_horizon: EXCLUDE,
    hold_unrealized: EXCLUDE,
    zeroAmountIsNoOp: true,
  },
  actual_nav_mark: {
    liquidate_at_horizon: POST_TERM_REJECT,
    hold_unrealized: POST_TERM_REJECT,
    zeroAmountIsNoOp: false,
  },
  actual_period_nav: {
    liquidate_at_horizon: POST_TERM_REJECT,
    hold_unrealized: POST_TERM_REJECT,
    zeroAmountIsNoOp: false,
  },
  projected_nav: {
    liquidate_at_horizon: EXCLUDE,
    hold_unrealized: EXCLUDE,
    zeroAmountIsNoOp: false,
  },
} as const satisfies Record<PostTermSourceClassV1, PostTermMatrixCellV1>;

function formatDate(year: number, monthIndex: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(monthIndex + 1).padStart(2, '0')}-${String(
    day
  ).padStart(2, '0')}`;
}

function daysInMonth(year: number, monthIndex: number): number {
  if (monthIndex === 1) {
    const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return isLeapYear ? 29 : 28;
  }
  return [3, 5, 8, 10].includes(monthIndex) ? 30 : 31;
}

function dateParts(value: string): { year: number; monthIndex: number; day: number } {
  return {
    year: Number(value.slice(0, 4)),
    monthIndex: Number(value.slice(5, 7)) - 1,
    day: Number(value.slice(8, 10)),
  };
}

function addCalendarMonthsClamped(value: string, months: number): string {
  const start = dateParts(value);
  const monthOrdinal = start.year * 12 + start.monthIndex + months;
  const year = Math.floor(monthOrdinal / 12);
  const monthIndex = monthOrdinal - year * 12;
  if (year < 1 || year > 9999) {
    throw new TerminalPolicyV1Error(
      'FUND_LIFE_GRID_UNREPRESENTABLE',
      'Fund life resolves outside the supported Gregorian date range.'
    );
  }
  return formatDate(year, monthIndex, Math.min(start.day, daysInMonth(year, monthIndex)));
}

function containingQuarterEnd(value: string): string {
  const date = dateParts(value);
  const quarterEndMonth = Math.floor(date.monthIndex / 3) * 3 + 2;
  return formatDate(date.year, quarterEndMonth, daysInMonth(date.year, quarterEndMonth));
}

export function compareCanonicalUtcInstants(left: string, right: string): number {
  const pattern = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?Z$/;
  const leftMatch = pattern.exec(left);
  const rightMatch = pattern.exec(right);
  if (!leftMatch || !rightMatch) {
    throw new Error('Terminal chronology requires canonical RFC3339 UTC instants.');
  }
  if (leftMatch[1]! < rightMatch[1]!) return -1;
  if (leftMatch[1]! > rightMatch[1]!) return 1;

  const leftFraction = (leftMatch[2] ?? '').replace(/0+$/, '');
  const rightFraction = (rightMatch[2] ?? '').replace(/0+$/, '');
  const precision = Math.max(leftFraction.length, rightFraction.length);
  const normalizedLeft = leftFraction.padEnd(precision, '0');
  const normalizedRight = rightFraction.padEnd(precision, '0');
  if (normalizedLeft < normalizedRight) return -1;
  if (normalizedLeft > normalizedRight) return 1;
  return 0;
}

function termQuarterCount(fundLifeYears: string): number {
  const quarterCount = new Decimal(fundLifeYears).mul(4);
  if (!quarterCount.isInteger() || !quarterCount.gt(0) || quarterCount.gt('9007199254740991')) {
    throw new TerminalPolicyV1Error(
      'FUND_LIFE_GRID_UNREPRESENTABLE',
      'Fund life must resolve to a positive whole number of calendar quarters.'
    );
  }
  return quarterCount.toNumber();
}

export function resolveTerminalPeriodEndV1(input: {
  termStartDate: string;
  fundLifeYears: string;
}): TerminalResolutionV1 {
  const parsed = TerminalResolutionPolicyInputV1Schema.parse(input);
  const legalTermEndDate = addCalendarMonthsClamped(
    parsed.termStartDate,
    termQuarterCount(parsed.fundLifeYears) * 3
  );
  const terminalPeriodEnd = containingQuarterEnd(legalTermEndDate);
  const terminalInstant = `${terminalPeriodEnd}T23:59:59.999Z`;

  return {
    legalTermEndDate,
    terminalPeriodEnd,
    terminalInstant,
    terminalResolutionMethodologyVersion: INTERNAL_ECONOMICS_TERMINAL_RESOLUTION_VERSION,
  };
}

function parsePersistedTerminalResolutionV1(persisted: unknown): PersistedTerminalResolutionV1 {
  const candidate = PersistedTerminalResolutionCandidateV1Schema.parse(persisted);
  if (
    candidate.terminalResolutionMethodologyVersion !==
    INTERNAL_ECONOMICS_TERMINAL_RESOLUTION_VERSION
  ) {
    throw new TerminalPolicyV1Error(
      'TERMINAL_RESOLUTION_METHODOLOGY_UNSUPPORTED',
      `Unsupported terminal-resolution methodology: ${candidate.terminalResolutionMethodologyVersion}.`
    );
  }
  return PersistedTerminalResolutionV1Schema.parse(candidate);
}

export function persistedTerminalResolutionFromPolicyV1(
  resolution: TerminalResolutionV1
): PersistedTerminalResolutionV1 {
  return parsePersistedTerminalResolutionV1({
    terminalPeriodEnd: resolution.terminalPeriodEnd,
    terminalResolutionMethodologyVersion: resolution.terminalResolutionMethodologyVersion,
  });
}

export function assertPersistedTerminalResolutionMatchesPolicyV1(input: {
  termStartDate: string;
  fundLifeYears: string;
  persisted: unknown;
}): PersistedTerminalResolutionV1 {
  const persisted = parsePersistedTerminalResolutionV1(input.persisted);
  const expected = persistedTerminalResolutionFromPolicyV1(
    resolveTerminalPeriodEndV1({
      termStartDate: input.termStartDate,
      fundLifeYears: input.fundLifeYears,
    })
  );
  if (persisted.terminalPeriodEnd !== expected.terminalPeriodEnd) {
    throw new TerminalPolicyV1Error(
      'TERMINAL_RESOLUTION_MISMATCH',
      `Persisted terminal period ${persisted.terminalPeriodEnd} does not match policy-time resolution ${expected.terminalPeriodEnd}.`
    );
  }
  return persisted;
}

export function validatePersistedTerminalResolutionV1(input: {
  persisted: unknown;
  forecastPeriodEnds: string[];
  openingCutoverInstant?: string;
}): ValidatedPersistedTerminalResolutionV1 {
  const parsed = PersistedTerminalRuntimeInputV1Schema.parse(input);
  const persisted = parsePersistedTerminalResolutionV1(parsed.persisted);
  const terminalInstant = `${persisted.terminalPeriodEnd}T23:59:59.999Z`;

  // Frozen precedence: persisted pair/version, cutover chronology, short horizon,
  // then exact-point representability.
  if (
    parsed.openingCutoverInstant !== undefined &&
    compareCanonicalUtcInstants(parsed.openingCutoverInstant, terminalInstant) > 0
  ) {
    throw new TerminalPolicyV1Error(
      'TERMINAL_BEFORE_CUTOVER',
      'Opening accounting state cannot be later than the terminal instant.'
    );
  }

  const maximumPeriodEnd = [...parsed.forecastPeriodEnds].sort().at(-1);
  if (maximumPeriodEnd === undefined || maximumPeriodEnd < persisted.terminalPeriodEnd) {
    throw new TerminalPolicyV1Error(
      'FORECAST_HORIZON_SHORT',
      'Forecast does not reach the persisted terminal period.'
    );
  }
  const exactPointCount = parsed.forecastPeriodEnds.filter(
    (periodEnd) => periodEnd === persisted.terminalPeriodEnd
  ).length;
  if (exactPointCount !== 1) {
    throw new TerminalPolicyV1Error(
      'FORECAST_TERMINAL_PERIOD_UNREPRESENTABLE',
      'Forecast must contain exactly one point at the persisted terminal period.'
    );
  }

  return { ...persisted, terminalInstant };
}

export function terminalResolutionHashPreimageV1(
  persisted: unknown
): PersistedTerminalResolutionV1 {
  return parsePersistedTerminalResolutionV1(persisted);
}

export function resolvePostTermDispositionV1(input: {
  sourceClass: PostTermSourceClassV1;
  terminalMode: TerminalModeV1;
  amountUsd?: string;
}): PostTermDispositionV1 {
  const sourceClass = PostTermSourceClassV1Schema.parse(input.sourceClass);
  const terminalMode = TerminalModeV1Schema.parse(input.terminalMode);
  const cell = POST_TERM_ACTIVITY_MATRIX_V1[sourceClass];
  if (input.amountUsd !== undefined) {
    const amount = new Decimal(MoneyDecimalStringSchema.parse(input.amountUsd));
    if (amount.lt(0)) {
      throw new TerminalPolicyV1Error(
        'NEGATIVE_SOURCE_MONEY',
        `Post-term ${sourceClass} amount cannot be negative.`
      );
    }
    if (cell.zeroAmountIsNoOp && amount.eq(0)) {
      return { action: 'ignore_zero', reasonCode: null };
    }
  }
  return cell[terminalMode];
}

export function hasPositivePostTermDeploymentDeltaV1(
  previousCumulativeDeployedUsd: string,
  currentCumulativeDeployedUsd: string
): boolean {
  const previous = new Decimal(MoneyDecimalStringSchema.parse(previousCumulativeDeployedUsd));
  const current = new Decimal(MoneyDecimalStringSchema.parse(currentCumulativeDeployedUsd));
  if (previous.lt(0) || current.lt(0)) {
    throw new TerminalPolicyV1Error(
      'NEGATIVE_SOURCE_MONEY',
      'Forecast cumulative deployment cannot be negative.'
    );
  }
  if (current.lt(previous)) {
    throw new TerminalPolicyV1Error(
      'FORECAST_DEPLOYMENT_CUMULATIVE_DECREASE',
      'Forecast cumulative deployment cannot decrease between periods.'
    );
  }
  return current.gt(previous);
}
