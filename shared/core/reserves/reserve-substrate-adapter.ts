/**
 * Reserve substrate adapter (Tranche 3, ADR-044).
 *
 * Runs the rule/ML reserve calculation against an injected CalculationContext
 * and returns a CalcResult with a validated basis and result hash. The legacy
 * ReserveEngine entry points are untouched: this adapter is an additive,
 * context-receiving form of the same kernel.
 *
 * Behavior preservation contract:
 * - The legacy engine resets its module-global LCG (shared/utils/prng.ts,
 *   Numerical Recipes parameters) to a hardcoded seed of 42 on every call.
 *   Exact-value parity is therefore only achievable by replaying the same
 *   generator, so the ML stream here is a locally constructed PRNG seeded
 *   from the context's immutable root seed. A context seeded with 42
 *   reproduces the legacy engine's output exactly (proven by the parity tests
 *   in tests/unit/reserve-substrate/). Migrating onto ctx.rng.fork('reserve')
 *   would change every ML-path value and is deferred to a methodology-version
 *   bump; the fork label 'reserve' is reserved for that migration in the
 *   ADR-044 fork-label registry. The rule-based path draws no randomness at
 *   all, so its value (and result hash) is seed-invariant by construction.
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
 * - Confidence is emitted as a decimal string rounded legacy-style to 2dp
 *   (Math.round(c * 100) / 100). Hash admission normalizes decimal strings
 *   ("0.50" -> "0.5"), so identities never rely on padded spellings. Summary
 *   aggregation runs on the unrounded legacy confidence values first, exactly
 *   as generateReserveSummary does, and only the rendered strings are rounded.
 * - The ML-vs-rule-based choice is an explicit typed option; the adapter
 *   never reads process.env.
 * - Portfolio array order is part of input identity: outputs are positional
 *   and the ML draw stream interleaves with gate outcomes in portfolio order.
 * - Two deliberate deviations from the legacy boundary (ADR-044): non-array
 *   input is failed + INPUT_INVALID instead of a silent [], and an empty
 *   portfolio is available with empty allocations and zero totals (a faithful
 *   empty result, not fabrication).
 */

import { z } from 'zod';
import { canonicalSha256 } from '../../lib/canonical-hash';
import { ReserveCompanyInputSchema, type ReserveCompanyInput } from '../../types';
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

export const RESERVE_CALCULATION_KEY = 'reserve';
export const RESERVE_ENGINE_VERSION = 'reserve-engine/1.0.0';
export const RESERVE_METHODOLOGY_VERSION = 'reserve-methodology/1.0.0';
export const RESERVE_INPUT_HASH_DOMAIN = 'updog.reserve.input-hash';
export const RESERVE_ASSUMPTIONS_HASH_DOMAIN = 'updog.reserve.assumptions-hash';

export const ReserveAlgorithmSchema = z.enum(['rule-based', 'ml']);
export type ReserveAlgorithm = z.infer<typeof ReserveAlgorithmSchema>;

const WHOLE_DOLLAR_DECIMAL_RE = /^(0|[1-9]\d*)$/;
// String(Math.round(c * 100) / 100) for c in [0, 1]: at most two decimals.
const CONFIDENCE_DECIMAL_RE = /^(0|1|0\.\d{1,2})$/;

export const ReserveAllocationEntrySchema = z
  .object({
    allocation: z.string().regex(WHOLE_DOLLAR_DECIMAL_RE, 'whole-dollar decimal string'),
    confidence: z.string().regex(CONFIDENCE_DECIMAL_RE, '2dp confidence decimal string'),
    rationale: z.string().min(1),
  })
  .strict();

export const ReserveCalcValueSchema = z
  .object({
    allocations: z.array(ReserveAllocationEntrySchema),
    totalAllocation: z.string().regex(WHOLE_DOLLAR_DECIMAL_RE, 'whole-dollar decimal string'),
    avgConfidence: z.string().regex(CONFIDENCE_DECIMAL_RE, '2dp confidence decimal string'),
    highConfidenceCount: z.number().int().min(0),
    asOfUtc: z.string().min(1),
  })
  .strict();

export type ReserveCalcValue = z.infer<typeof ReserveCalcValueSchema>;

export const ReserveCalcResultSchema = createCalcResultSchema(ReserveCalcValueSchema);
export type ReserveCalcResult = z.infer<typeof ReserveCalcResultSchema>;

export interface ReserveSubstrateOptions {
  configuredMode: CalcMode;
  killSwitchActive: boolean;
  /** Explicit replacement for the legacy ALG_RESERVE env read. Default: rule-based. */
  algorithm?: ReserveAlgorithm;
}

/**
 * Methodology constants, hashed into every basis. Restating them here (rather
 * than referencing the legacy module or shared/types ConfidenceLevel) keeps
 * the assumptions hash independent of incidental code layout; the parity
 * suite guarantees they stay true.
 */
const RESERVE_ASSUMPTIONS = {
  stageMultipliers: {
    Seed: 1.5,
    'Series A': 2.0,
    'Series B': 2.5,
    'Series C': 1.8,
    Growth: 1.2,
  },
  stageMultiplierDefault: 2.0,
  sectorMultipliers: {
    SaaS: 1.1,
    Fintech: 1.2,
    Healthcare: 1.3,
    Analytics: 1.0,
    Infrastructure: 0.9,
    Enterprise: 0.8,
  },
  sectorMultiplierDefault: 1.0,
  ownership: {
    boostThreshold: 0.1,
    boostFactor: 1.2,
    penaltyThreshold: 0.05,
    penaltyFactor: 0.8,
  },
  confidenceLadder: {
    base: 0.3,
    stageAndSectorBonus: 0.2,
    ownershipPositiveBonus: 0.15,
    investedBonus: 0.1,
    investedBonusThresholdDollars: 1_000_000,
    cap: 0.7,
    coldStartRationaleThreshold: 0.5,
  },
  ml: {
    gateThreshold: 0.3,
    adjustmentMin: 0.8,
    adjustmentRange: 0.4,
    confidenceBoost: 0.3,
    confidenceCap: 0.95,
  },
  highConfidenceThreshold: 0.7,
  rounding: {
    allocation: 'half-away-from-zero-to-whole-dollar',
    confidence: 'half-away-from-zero-to-2dp',
  },
  rng: {
    family: 'lcg-numerical-recipes',
    multiplier: 1664525,
    increment: 1013904223,
    modulus: 4294967296,
    seedSource: 'calculation-context-root-seed',
  },
} as const;

export function computeReserveInputHash(input: unknown): string {
  let admitted: unknown;
  try {
    admitted = admitForHashing(input);
  } catch {
    // The raw input cannot be canonically hashed (undefined, NaN, class
    // instances, ...). The basis still needs a deterministic input identity,
    // and the accompanying result discloses the rejection via INPUT_INVALID.
    admitted = { inadmissibleInput: true };
  }
  return canonicalSha256({ domain: RESERVE_INPUT_HASH_DOMAIN, input: admitted });
}

export function computeReserveAssumptionsHash(algorithm: ReserveAlgorithm): string {
  return canonicalSha256({
    domain: RESERVE_ASSUMPTIONS_HASH_DOMAIN,
    methodologyVersion: RESERVE_METHODOLOGY_VERSION,
    algorithm,
    assumptions: admitForHashing(RESERVE_ASSUMPTIONS),
  });
}

interface AllocationEntry {
  allocation: number;
  /** Unrounded legacy confidence; rounded only at the rendering boundary. */
  confidence: number;
  rationale: string;
}

/** Legacy-identical rule-based kernel; draws nothing from the ML stream. */
function ruleBasedAllocation(company: ReserveCompanyInput): AllocationEntry {
  const { stageMultipliers, sectorMultipliers, ownership, confidenceLadder } = RESERVE_ASSUMPTIONS;
  const stageMultiplier =
    stageMultipliers[company.stage as keyof typeof stageMultipliers] ||
    RESERVE_ASSUMPTIONS.stageMultiplierDefault;
  const sectorMultiplier =
    sectorMultipliers[company.sector as keyof typeof sectorMultipliers] ||
    RESERVE_ASSUMPTIONS.sectorMultiplierDefault;

  let allocation = company.invested * stageMultiplier * sectorMultiplier;
  if (company.ownership > ownership.boostThreshold) {
    allocation *= ownership.boostFactor;
  } else if (company.ownership < ownership.penaltyThreshold) {
    allocation *= ownership.penaltyFactor;
  }

  let confidence: number = confidenceLadder.base;
  if (company.stage && company.sector) confidence += confidenceLadder.stageAndSectorBonus;
  if (company.ownership > 0) confidence += confidenceLadder.ownershipPositiveBonus;
  if (company.invested > confidenceLadder.investedBonusThresholdDollars) {
    confidence += confidenceLadder.investedBonus;
  }
  confidence = Math.min(confidence, confidenceLadder.cap);

  let rationale = `${company.stage} stage, ${company.sector} sector`;
  rationale +=
    confidence <= confidenceLadder.coldStartRationaleThreshold
      ? ' (cold-start mode)'
      : ' (enhanced rules)';

  return {
    allocation: Math.round(allocation),
    confidence: Math.round(confidence * 100) / 100,
    rationale,
  };
}

/** Legacy-identical ML overlay; draws one adjustment value from the stream. */
function mlAllocation(company: ReserveCompanyInput, stream: PRNG): AllocationEntry {
  const { ml } = RESERVE_ASSUMPTIONS;
  const base = ruleBasedAllocation(company);
  const mlAdjustment = ml.adjustmentMin + stream.next() * ml.adjustmentRange;
  return {
    allocation: Math.round(base.allocation * mlAdjustment),
    confidence: Math.min(ml.confidenceCap, base.confidence + ml.confidenceBoost),
    rationale: `ML-enhanced allocation (${base.rationale
      .replace('(cold-start mode)', '')
      .replace('(enhanced rules)', '')
      .trim()})`,
  };
}

function renderConfidence(confidence: number): string {
  return String(Math.round(confidence * 100) / 100);
}

function computeReserveValue(
  portfolio: ReserveCompanyInput[],
  ctx: CalculationContext,
  algorithm: ReserveAlgorithm
): ReserveCalcValue {
  const stream = new PRNG(ctx.rng.rootSeed);
  const entries = portfolio.map((company) => {
    if (algorithm === 'ml' && stream.next() > RESERVE_ASSUMPTIONS.ml.gateThreshold) {
      return mlAllocation(company, stream);
    }
    return ruleBasedAllocation(company);
  });

  const totalAllocation = entries.reduce((sum, entry) => sum + entry.allocation, 0);
  const avgConfidence =
    entries.length > 0
      ? entries.reduce((sum, entry) => sum + entry.confidence, 0) / entries.length
      : 0;
  const highConfidenceCount = entries.filter(
    (entry) => entry.confidence >= RESERVE_ASSUMPTIONS.highConfidenceThreshold
  ).length;

  return {
    allocations: entries.map((entry) => ({
      allocation: String(entry.allocation),
      confidence: renderConfidence(entry.confidence),
      rationale: entry.rationale,
    })),
    totalAllocation: String(totalAllocation),
    avgConfidence: renderConfidence(avgConfidence),
    highConfidenceCount,
    asOfUtc: ctx.clock.isoNow(),
  };
}

export function runReserveWithSubstrate(
  ctx: CalculationContext,
  input: unknown,
  options: ReserveSubstrateOptions
): ReserveCalcResult {
  if (ctx.contractVersion !== CALC_SUBSTRATE_CONTRACT_VERSION) {
    throw new TypeError(
      `reserve adapter requires contract ${CALC_SUBSTRATE_CONTRACT_VERSION}, received ${String(
        ctx.contractVersion
      )}`
    );
  }
  if (ctx.calculationKey !== RESERVE_CALCULATION_KEY) {
    throw new TypeError(
      `reserve adapter requires calculationKey '${RESERVE_CALCULATION_KEY}', received '${ctx.calculationKey}'`
    );
  }
  const algorithm = ReserveAlgorithmSchema.parse(options.algorithm ?? 'rule-based');
  const effectiveMode: CalcMode = options.killSwitchActive ? 'off' : options.configuredMode;

  const basis: CalcBasis = CalcBasisSchema.parse({
    contractVersion: CALC_SUBSTRATE_CONTRACT_VERSION,
    calculationKey: RESERVE_CALCULATION_KEY,
    configuredMode: options.configuredMode,
    effectiveMode,
    killSwitchActive: options.killSwitchActive,
    engineVersion: RESERVE_ENGINE_VERSION,
    methodologyVersion: RESERVE_METHODOLOGY_VERSION,
    inputHash: computeReserveInputHash(input),
    assumptionsHash: computeReserveAssumptionsHash(algorithm),
  });

  if (effectiveMode === 'off') {
    const reasonCodes: CalcReasonCode[] = [];
    if (options.killSwitchActive) {
      reasonCodes.push('KILL_SWITCH_ACTIVE');
    }
    if (options.configuredMode === 'off') {
      reasonCodes.push('MODE_OFF');
    }
    return ReserveCalcResultSchema.parse({ state: 'unavailable', basis, reasonCodes });
  }

  // Boundary deviation (ADR-044): the legacy engine silently returns [] for
  // non-array input; here the rejection is disclosed instead of swallowed.
  const parsed = z.array(ReserveCompanyInputSchema).safeParse(input);
  if (!parsed.success) {
    return ReserveCalcResultSchema.parse({
      state: 'failed',
      basis,
      reasonCodes: ['INPUT_INVALID'],
      diagnostic: `reserve input rejected: ${parsed.error.message}`,
    });
  }

  try {
    const value = computeReserveValue(parsed.data, ctx, algorithm);
    const resultHash = computeResultHash(basis, value);
    if (effectiveMode === 'shadow') {
      return ReserveCalcResultSchema.parse({
        state: 'indicative',
        basis,
        value,
        resultHash,
        reasonCodes: ['SHADOW_ONLY'],
      });
    }
    return ReserveCalcResultSchema.parse({
      state: 'available',
      basis,
      value,
      resultHash,
      reasonCodes: [],
    });
  } catch (error) {
    return ReserveCalcResultSchema.parse({
      state: 'failed',
      basis,
      reasonCodes: ['ENGINE_ERROR'],
      diagnostic: error instanceof Error ? error.message : String(error),
    });
  }
}
