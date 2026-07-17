/**
 * Pacing substrate adapter (Tranche 2, ADR-043).
 *
 * Runs the pacing calculation against an injected CalculationContext and
 * returns a CalcResult with a validated basis and result hash. The legacy
 * PacingEngine entry points are untouched: this adapter is an additive,
 * context-receiving form of the same kernel.
 *
 * Behavior preservation contract:
 * - The legacy engine resets its LCG (shared/utils/prng.ts, Numerical Recipes
 *   parameters) to a hardcoded seed of 123 on every call. Exact-value parity
 *   is therefore only achievable by replaying the same generator, so the
 *   variability stream here is a locally constructed PRNG seeded from the
 *   context's immutable root seed. A context seeded with 123 reproduces the
 *   legacy engine's output exactly (proven by the parity tests in
 *   tests/unit/pacing-substrate/). Migrating the variability stream onto
 *   ctx.rng.fork('pacing') would change every emitted value and is deferred
 *   to a methodology-version bump; the fork label 'pacing' is reserved for
 *   that migration in the ADR-043 fork-label registry.
 * - The kernel math is deliberately restated here rather than imported,
 *   because the legacy entry point reads process.env internally and its seed
 *   is not injectable. The characterization and parity suites pin both sides
 *   to the same hand-authored fixtures, so any drift between the two copies
 *   fails loudly.
 *
 * Boundary conventions:
 * - Money at the adapter boundary is emitted as whole-dollar decimal strings.
 *   Rounding rule (legacy-identical): Math.round applied to the non-negative
 *   float amount, i.e. half-away-from-zero to a whole dollar.
 * - The ML-vs-rule-based choice is an explicit typed option; the adapter
 *   never reads process.env.
 */

import { z } from 'zod';
import { canonicalSha256 } from '../../lib/canonical-hash';
import { PacingInputSchema, type PacingInput } from '../../types';
import { PRNG } from '../../utils/prng';
import {
  CALC_SUBSTRATE_CONTRACT_VERSION,
  CalcBasisSchema,
  admitForHashing,
  computeResultHash,
  createCalcResultSchema,
  type CalcBasis,
  type CalcMode,
  type CalcReasonCode,
  type CalculationContext,
} from '../calc-substrate';

export const PACING_CALCULATION_KEY = 'pacing';
export const PACING_ENGINE_VERSION = 'pacing-engine/1.0.0';
export const PACING_METHODOLOGY_VERSION = 'pacing-methodology/1.0.0';
export const PACING_INPUT_HASH_DOMAIN = 'updog.pacing.input-hash';
export const PACING_ASSUMPTIONS_HASH_DOMAIN = 'updog.pacing.assumptions-hash';

export const PacingAlgorithmSchema = z.enum(['rule-based', 'ml']);
export type PacingAlgorithm = z.infer<typeof PacingAlgorithmSchema>;

const WHOLE_DOLLAR_DECIMAL_RE = /^(0|[1-9]\d*)$/;

export const PacingScheduleEntrySchema = z
  .object({
    quarter: z.number().int().positive(),
    deployment: z.string().regex(WHOLE_DOLLAR_DECIMAL_RE, 'whole-dollar decimal string'),
    note: z.string().min(1),
  })
  .strict();

export const PacingCalcValueSchema = z
  .object({
    schedule: z.array(PacingScheduleEntrySchema).length(8),
    totalQuarters: z.literal(8),
    totalDeployment: z.string().regex(WHOLE_DOLLAR_DECIMAL_RE, 'whole-dollar decimal string'),
    avgQuarterlyDeployment: z
      .string()
      .regex(WHOLE_DOLLAR_DECIMAL_RE, 'whole-dollar decimal string'),
    asOfUtc: z.string().min(1),
  })
  .strict();

export type PacingCalcValue = z.infer<typeof PacingCalcValueSchema>;

export const PacingCalcResultSchema = createCalcResultSchema(PacingCalcValueSchema);
export type PacingCalcResult = z.infer<typeof PacingCalcResultSchema>;

export interface PacingSubstrateOptions {
  configuredMode: CalcMode;
  killSwitchActive: boolean;
  /** Explicit replacement for the legacy ALG_PACING env read. Default: rule-based. */
  algorithm?: PacingAlgorithm;
}

/**
 * Methodology constants, hashed into every basis. Restating them here (rather
 * than referencing the legacy module) keeps the assumptions hash independent
 * of incidental code layout; the parity suite guarantees they stay true.
 */
const PACING_ASSUMPTIONS = {
  horizonQuarters: 8,
  baseAmountDivisor: 8,
  marketAdjustments: {
    bull: { early: 1.3, mid: 1.1, late: 0.8 },
    bear: { early: 0.7, mid: 0.9, late: 1.2 },
    neutral: { early: 1.0, mid: 1.0, late: 1.0 },
  },
  variability: { min: 0.9, range: 0.2 },
  mlTrend: { min: 0.85, range: 0.3 },
  rounding: 'half-away-from-zero-to-whole-dollar',
  rng: {
    family: 'lcg-numerical-recipes',
    multiplier: 1664525,
    increment: 1013904223,
    modulus: 4294967296,
    seedSource: 'calculation-context-root-seed',
  },
} as const;

export function computePacingInputHash(input: unknown): string {
  let admitted: unknown;
  try {
    admitted = admitForHashing(input);
  } catch {
    // The raw input cannot be canonically hashed (undefined, NaN, class
    // instances, ...). The basis still needs a deterministic input identity,
    // and the accompanying result discloses the rejection via INPUT_INVALID.
    admitted = { inadmissibleInput: true };
  }
  return canonicalSha256({ domain: PACING_INPUT_HASH_DOMAIN, input: admitted });
}

export function computePacingAssumptionsHash(algorithm: PacingAlgorithm): string {
  return canonicalSha256({
    domain: PACING_ASSUMPTIONS_HASH_DOMAIN,
    methodologyVersion: PACING_METHODOLOGY_VERSION,
    algorithm,
    assumptions: admitForHashing(PACING_ASSUMPTIONS),
  });
}

interface ScheduleEntry {
  quarter: number;
  deployment: number;
  note: string;
}

/** Legacy-identical rule-based kernel; draws 8 variability values in order. */
function ruleBasedSchedule(input: PacingInput, variability: PRNG): ScheduleEntry[] {
  const { fundSize, deploymentQuarter, marketCondition } = input;
  const adjustment = PACING_ASSUMPTIONS.marketAdjustments[marketCondition];
  const baseAmount = fundSize / PACING_ASSUMPTIONS.baseAmountDivisor;

  return Array.from({ length: PACING_ASSUMPTIONS.horizonQuarters }, (_, index) => {
    const multiplier = index < 3 ? adjustment.early : index < 6 ? adjustment.mid : adjustment.late;
    const factor =
      PACING_ASSUMPTIONS.variability.min +
      variability.next() * PACING_ASSUMPTIONS.variability.range;
    const phaseNote =
      index < 3
        ? 'early-stage focus'
        : index < 6
          ? 'mid-stage deployment'
          : 'late-stage optimization';
    return {
      quarter: deploymentQuarter + index,
      deployment: Math.round(baseAmount * multiplier * factor),
      note: `${marketCondition} market pacing (${phaseNote})`,
    };
  });
}

/** Legacy-identical ML overlay; draws 8 further values from the same stream. */
function applyMlTrend(
  schedule: ScheduleEntry[],
  input: PacingInput,
  variability: PRNG
): ScheduleEntry[] {
  return schedule.map((entry) => {
    const trend =
      PACING_ASSUMPTIONS.mlTrend.min + variability.next() * PACING_ASSUMPTIONS.mlTrend.range;
    return {
      quarter: entry.quarter,
      deployment: Math.round(entry.deployment * trend),
      note: `ML-optimized pacing (${input.marketCondition} trend analysis)`,
    };
  });
}

function computePacingValue(
  input: PacingInput,
  ctx: CalculationContext,
  algorithm: PacingAlgorithm
): PacingCalcValue {
  const variability = new PRNG(ctx.rng.rootSeed);
  const ruleBased = ruleBasedSchedule(input, variability);
  const schedule = algorithm === 'ml' ? applyMlTrend(ruleBased, input, variability) : ruleBased;
  const totalDeployment = schedule.reduce((sum, entry) => sum + entry.deployment, 0);

  return {
    schedule: schedule.map((entry) => ({
      quarter: entry.quarter,
      deployment: String(entry.deployment),
      note: entry.note,
    })),
    totalQuarters: PACING_ASSUMPTIONS.horizonQuarters,
    totalDeployment: String(totalDeployment),
    avgQuarterlyDeployment: String(
      Math.round(totalDeployment / PACING_ASSUMPTIONS.horizonQuarters)
    ),
    asOfUtc: ctx.clock.isoNow(),
  };
}

export function runPacingWithSubstrate(
  ctx: CalculationContext,
  input: unknown,
  options: PacingSubstrateOptions
): PacingCalcResult {
  if (ctx.contractVersion !== CALC_SUBSTRATE_CONTRACT_VERSION) {
    throw new TypeError(
      `pacing adapter requires contract ${CALC_SUBSTRATE_CONTRACT_VERSION}, received ${String(
        ctx.contractVersion
      )}`
    );
  }
  if (ctx.calculationKey !== PACING_CALCULATION_KEY) {
    throw new TypeError(
      `pacing adapter requires calculationKey '${PACING_CALCULATION_KEY}', received '${ctx.calculationKey}'`
    );
  }
  const algorithm = PacingAlgorithmSchema.parse(options.algorithm ?? 'rule-based');
  const effectiveMode: CalcMode = options.killSwitchActive ? 'off' : options.configuredMode;

  const basis: CalcBasis = CalcBasisSchema.parse({
    contractVersion: CALC_SUBSTRATE_CONTRACT_VERSION,
    calculationKey: PACING_CALCULATION_KEY,
    configuredMode: options.configuredMode,
    effectiveMode,
    killSwitchActive: options.killSwitchActive,
    engineVersion: PACING_ENGINE_VERSION,
    methodologyVersion: PACING_METHODOLOGY_VERSION,
    inputHash: computePacingInputHash(input),
    assumptionsHash: computePacingAssumptionsHash(algorithm),
  });

  if (effectiveMode === 'off') {
    const reasonCodes: CalcReasonCode[] = [];
    if (options.killSwitchActive) {
      reasonCodes.push('KILL_SWITCH_ACTIVE');
    }
    if (options.configuredMode === 'off') {
      reasonCodes.push('MODE_OFF');
    }
    return PacingCalcResultSchema.parse({ state: 'unavailable', basis, reasonCodes });
  }

  const parsed = PacingInputSchema.safeParse(input);
  if (!parsed.success) {
    return PacingCalcResultSchema.parse({
      state: 'failed',
      basis,
      reasonCodes: ['INPUT_INVALID'],
      diagnostic: `pacing input rejected: ${parsed.error.message}`,
    });
  }

  try {
    const value = computePacingValue(parsed.data, ctx, algorithm);
    const resultHash = computeResultHash(basis, value);
    if (effectiveMode === 'shadow') {
      return PacingCalcResultSchema.parse({
        state: 'indicative',
        basis,
        value,
        resultHash,
        reasonCodes: ['SHADOW_ONLY'],
      });
    }
    return PacingCalcResultSchema.parse({
      state: 'available',
      basis,
      value,
      resultHash,
      reasonCodes: [],
    });
  } catch (error) {
    return PacingCalcResultSchema.parse({
      state: 'failed',
      basis,
      reasonCodes: ['ENGINE_ERROR'],
      diagnostic: error instanceof Error ? error.message : String(error),
    });
  }
}
