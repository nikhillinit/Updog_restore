/**
 * DeterministicReserveEngine substrate adapter (Tranche 4, ADR-045).
 *
 * Runs the legacy DeterministicReserveEngine against an injected
 * CalculationContext and returns a CalcResult with a validated basis and
 * result hash. Unlike the Tranche 2/3 adapters this one WRAPS the legacy
 * class instead of restating it: the 924-line Decimal.js kernel stays the
 * single implementation, and the ADR-045 capability seam
 * (`{ now, debugMode }`) lets the adapter pin the engine's wall clock to
 * `ctx.clock` - necessary because the clock sits INSIDE calculation math
 * (the age-based risk multiplier), not just in timing metadata.
 *
 * Behavior preservation contract:
 * - A fresh engine instance is constructed per run with
 *   `now: () => ctx.clock.now().getTime()` and `debugMode: false`, so no
 *   calculation cache survives across calls and no ambient state leaks in.
 *   With a fixed clock, `metadata.calculationDuration` is deterministically 0.
 * - The engine draws NO randomness: its only nondeterminism was the wall
 *   clock. The adapter value is therefore seed-invariant (pinned as a
 *   disclosed property, as ADR-044 did for the rule-based path); different
 *   hashes come from inputs, asOf instants, and feature flags, never seeds.
 *   No fork label is consumed and none is reserved - there is nothing to
 *   migrate onto ctx.rng.
 * - Feature flags are methodology: the resolved flags enter the
 *   assumptions-hash preimage together with the calculation version, the
 *   engine's global Decimal configuration, and the cache-key domain. The
 *   default flag set restates the ENGINE constructor defaults (not the
 *   FeatureFlagSchema defaults, which differ on enableNewReserveEngine);
 *   the parity suite keeps the restatement honest.
 *
 * Boundary conventions and disclosed deviations (ADR-045):
 * - Value numbers stay plain finite JSON numbers. This deviates from the
 *   Tranche 2/3 whole-dollar-decimal-string convention because this engine
 *   emits fractional Decimal-derived amounts; inventing a rounding policy at
 *   the boundary would fabricate precision the engine does not produce.
 * - The value is the engine result projected JSON-safe (every Date becomes an
 *   ISO-8601 UTC string, undefined properties are stripped) plus `asOfUtc`
 *   from the injected clock. The value schema is a strict JSON-safe mirror of
 *   the legacy result shape, NOT the legacy ReserveCalculationResultSchema:
 *   that schema requires a positive calculationDuration (a fixed clock yields
 *   exactly 0) and strictly positive money fields the engine itself does not
 *   guarantee (a fully-filtered portfolio legitimately allocates 0), and the
 *   engine never parses its own output. Structure and JSON-safety are
 *   enforced here; business bounds remain the kernel's own.
 * - inputHash covers the CANONICAL SERIALIZATION of the schema-PARSED input
 *   (dates as ISO strings, defaults filled), not the raw input as in
 *   Tranches 2/3: valid inputs always contain Date instances, which hash
 *   admission rejects, so raw-input hashing would collapse every valid input
 *   onto the inadmissible sentinel. Two spellings of the same instant (Date
 *   vs ISO string) therefore share one input identity, as do inputs relying
 *   on schema defaults vs spelling them out. The inadmissible-sentinel
 *   fallback remains for unparseable garbage.
 *
 * Result semantics (identical to ADR-043/044): on -> available; shadow ->
 * indicative + SHADOW_ONLY; configured off -> unavailable + MODE_OFF; kill
 * switch -> unavailable + KILL_SWITCH_ACTIVE (both codes when both apply);
 * schema-invalid input -> failed + INPUT_INVALID with a diagnostic; engine
 * throw/rejection (including ReserveCalculationError) -> failed +
 * ENGINE_ERROR. Every non-available path carries at least one registered
 * reason code; there is no silent fallback.
 */

import { z } from 'zod';
import { canonicalSha256 } from '../../lib/canonical-hash';
import {
  FeatureFlagSchema,
  ReserveAllocationInputSchema,
  type FeatureFlags,
} from '../../schemas/reserves-schemas';
import {
  CALC_SUBSTRATE_CONTRACT_VERSION,
  CalcBasisSchema,
  Sha256HexSchema,
  admitForHashing,
  computeResultHash,
  createCalcResultSchema,
  type CalcBasis,
  type CalcMode,
  type CalcReasonCode,
  type CalculationContext,
} from '../calc-substrate';
import { DeterministicReserveEngine } from './DeterministicReserveEngine';
import {
  DETERMINISTIC_RESERVE_CACHE_KEY_DOMAIN,
  serializeDeterministicReserveInput,
} from './deterministic-reserve-canonical';

export {
  DETERMINISTIC_RESERVE_CACHE_KEY_DOMAIN,
  computeDeterministicReserveCacheKey,
  serializeDeterministicReserveInput,
} from './deterministic-reserve-canonical';

export const DETERMINISTIC_RESERVE_CALCULATION_KEY = 'reserve-deterministic';
export const DETERMINISTIC_RESERVE_ENGINE_VERSION = 'deterministic-reserve-engine/1.0.0';
export const DETERMINISTIC_RESERVE_METHODOLOGY_VERSION = 'deterministic-reserve-methodology/1.0.0';
export const DETERMINISTIC_RESERVE_INPUT_HASH_DOMAIN = 'updog.reserve-deterministic.input-hash';
export const DETERMINISTIC_RESERVE_ASSUMPTIONS_HASH_DOMAIN =
  'updog.reserve-deterministic.assumptions-hash';

/**
 * Restates the engine's private CALCULATION_VERSION ('1.0.0', stamped into
 * metadata.modelVersion). The parity suite pins the two against each other.
 */
export const DETERMINISTIC_RESERVE_CALCULATION_VERSION = '1.0.0';

/**
 * Restates the engine's global Decimal.js configuration (set in its
 * constructor), hashed as methodology. Changing the engine's precision or
 * rounding mode is a methodology-version bump.
 */
const DETERMINISTIC_RESERVE_DECIMAL_CONFIG = {
  precision: 28,
  rounding: 'ROUND_HALF_UP',
} as const;

/**
 * The ENGINE constructor's default flags, restated. Deliberately NOT
 * FeatureFlagSchema.parse({}) - the schema defaults differ (e.g.
 * enableNewReserveEngine defaults false there, true here).
 */
export const DEFAULT_DETERMINISTIC_RESERVE_FEATURE_FLAGS: FeatureFlags = {
  enableNewReserveEngine: true,
  enableParityTesting: true,
  enableRiskAdjustments: true,
  enableScenarioAnalysis: true,
  enableAdvancedDiversification: false,
  enableLiquidationPreferences: true,
  enablePerformanceLogging: true,
  maxCalculationTimeMs: 5000,
};

const ISO_UTC_MS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const IsoUtcStringSchema = z.string().regex(ISO_UTC_MS_RE, 'ISO-8601 UTC string (ms precision)');
const FiniteNumberSchema = z.number().finite();
const RiskBandSchema = z.enum(['low', 'medium', 'high']);

const DeterministicReserveAllocationValueSchema = z
  .object({
    companyId: z.string().uuid(),
    companyName: z.string(),
    recommendedAllocation: FiniteNumberSchema,
    allocationRationale: z.string(),
    priority: z.number().int().min(1),
    expectedMOIC: FiniteNumberSchema,
    expectedValue: FiniteNumberSchema,
    riskAdjustedReturn: FiniteNumberSchema,
    newOwnership: FiniteNumberSchema,
    portfolioWeight: FiniteNumberSchema,
    concentrationRisk: RiskBandSchema,
    recommendedStage: z.string(),
    timeToDeployment: FiniteNumberSchema,
    followOnPotential: FiniteNumberSchema,
    riskFactors: z.array(z.string()),
    mitigationStrategies: z.array(z.string()),
    calculationMetadata: z
      .object({
        graduationProbability: FiniteNumberSchema,
        expectedExitMultiple: FiniteNumberSchema,
        timeToExit: FiniteNumberSchema,
        diversificationBonus: FiniteNumberSchema,
        liquidationPrefImpact: FiniteNumberSchema.optional(),
      })
      .strict(),
  })
  .strict();

const ScenarioBandValueSchema = z
  .object({
    totalValue: FiniteNumberSchema,
    portfolioMOIC: FiniteNumberSchema,
    probability: FiniteNumberSchema,
  })
  .strict();

export const DeterministicReserveCalcValueSchema = z
  .object({
    inputSummary: z
      .object({
        totalPortfolioCompanies: z.number().int().min(0),
        availableReserves: FiniteNumberSchema,
        totalAllocated: FiniteNumberSchema,
        allocationEfficiency: FiniteNumberSchema,
      })
      .strict(),
    allocations: z.array(DeterministicReserveAllocationValueSchema),
    unallocatedReserves: FiniteNumberSchema,
    portfolioMetrics: z
      .object({
        expectedPortfolioMOIC: FiniteNumberSchema,
        expectedPortfolioValue: FiniteNumberSchema,
        portfolioDiversification: FiniteNumberSchema,
        concentrationRisk: RiskBandSchema,
        averageTimeToExit: FiniteNumberSchema,
      })
      .strict(),
    riskAnalysis: z
      .object({
        portfolioRisk: RiskBandSchema,
        keyRiskFactors: z.array(z.string()),
        riskMitigationActions: z.array(z.string()),
        stressTestResults: z
          .object({
            downside10: FiniteNumberSchema,
            upside90: FiniteNumberSchema,
            expectedValue: FiniteNumberSchema,
          })
          .strict(),
      })
      .strict(),
    scenarioResults: z
      .object({
        conservative: ScenarioBandValueSchema,
        base: ScenarioBandValueSchema,
        optimistic: ScenarioBandValueSchema,
      })
      .strict(),
    metadata: z
      .object({
        calculationDate: IsoUtcStringSchema,
        /** Deterministically 0 under the injected fixed clock. */
        calculationDuration: z.number().int().min(0),
        modelVersion: z.string().min(1),
        deterministicHash: Sha256HexSchema,
        assumptions: z.array(z.string()),
        limitations: z.array(z.string()),
      })
      .strict(),
    asOfUtc: IsoUtcStringSchema,
  })
  .strict();

export type DeterministicReserveCalcValue = z.infer<typeof DeterministicReserveCalcValueSchema>;

export const DeterministicReserveCalcResultSchema = createCalcResultSchema(
  DeterministicReserveCalcValueSchema
);
export type DeterministicReserveCalcResult = z.infer<typeof DeterministicReserveCalcResultSchema>;

export interface DeterministicReserveSubstrateOptions {
  configuredMode: CalcMode;
  killSwitchActive: boolean;
  /** Engine feature flags (methodology). Default: the engine's own defaults. */
  featureFlags?: FeatureFlags;
}

export function computeDeterministicReserveInputHash(input: unknown): string {
  const parsed = ReserveAllocationInputSchema.safeParse(input);
  if (parsed.success) {
    // Canonical parsed-input identity (disclosed deviation from the ADR-043/
    // 044 raw-input precedent): dates serialize to ISO UTC strings and schema
    // defaults are filled, so equivalent spellings share one identity.
    return canonicalSha256({
      domain: DETERMINISTIC_RESERVE_INPUT_HASH_DOMAIN,
      input: admitForHashing(serializeDeterministicReserveInput(parsed.data)),
    });
  }
  let admitted: unknown;
  try {
    admitted = admitForHashing(input);
  } catch {
    // Unparseable garbage that also cannot be canonically hashed. The basis
    // still needs a deterministic input identity, and the accompanying
    // result discloses the rejection via INPUT_INVALID.
    admitted = { inadmissibleInput: true };
  }
  return canonicalSha256({ domain: DETERMINISTIC_RESERVE_INPUT_HASH_DOMAIN, input: admitted });
}

export function computeDeterministicReserveAssumptionsHash(featureFlags: FeatureFlags): string {
  return canonicalSha256({
    domain: DETERMINISTIC_RESERVE_ASSUMPTIONS_HASH_DOMAIN,
    methodologyVersion: DETERMINISTIC_RESERVE_METHODOLOGY_VERSION,
    calculationVersion: DETERMINISTIC_RESERVE_CALCULATION_VERSION,
    decimalConfig: DETERMINISTIC_RESERVE_DECIMAL_CONFIG,
    cacheKeyDomain: DETERMINISTIC_RESERVE_CACHE_KEY_DOMAIN,
    featureFlags: admitForHashing(featureFlags),
  });
}

export async function runDeterministicReserveWithSubstrate(
  ctx: CalculationContext,
  input: unknown,
  options: DeterministicReserveSubstrateOptions
): Promise<DeterministicReserveCalcResult> {
  if (ctx.contractVersion !== CALC_SUBSTRATE_CONTRACT_VERSION) {
    throw new TypeError(
      `deterministic reserve adapter requires contract ${CALC_SUBSTRATE_CONTRACT_VERSION}, received ${String(
        ctx.contractVersion
      )}`
    );
  }
  if (ctx.calculationKey !== DETERMINISTIC_RESERVE_CALCULATION_KEY) {
    throw new TypeError(
      `deterministic reserve adapter requires calculationKey '${DETERMINISTIC_RESERVE_CALCULATION_KEY}', received '${ctx.calculationKey}'`
    );
  }

  const featureFlags = FeatureFlagSchema.parse({
    ...DEFAULT_DETERMINISTIC_RESERVE_FEATURE_FLAGS,
    ...(options.featureFlags ?? {}),
  });
  const effectiveMode: CalcMode = options.killSwitchActive ? 'off' : options.configuredMode;

  const basis: CalcBasis = CalcBasisSchema.parse({
    contractVersion: CALC_SUBSTRATE_CONTRACT_VERSION,
    calculationKey: DETERMINISTIC_RESERVE_CALCULATION_KEY,
    configuredMode: options.configuredMode,
    effectiveMode,
    killSwitchActive: options.killSwitchActive,
    engineVersion: DETERMINISTIC_RESERVE_ENGINE_VERSION,
    methodologyVersion: DETERMINISTIC_RESERVE_METHODOLOGY_VERSION,
    inputHash: computeDeterministicReserveInputHash(input),
    assumptionsHash: computeDeterministicReserveAssumptionsHash(featureFlags),
  });

  if (effectiveMode === 'off') {
    const reasonCodes: CalcReasonCode[] = [];
    if (options.killSwitchActive) {
      reasonCodes.push('KILL_SWITCH_ACTIVE');
    }
    if (options.configuredMode === 'off') {
      reasonCodes.push('MODE_OFF');
    }
    return DeterministicReserveCalcResultSchema.parse({ state: 'unavailable', basis, reasonCodes });
  }

  const parsed = ReserveAllocationInputSchema.safeParse(input);
  if (!parsed.success) {
    return DeterministicReserveCalcResultSchema.parse({
      state: 'failed',
      basis,
      reasonCodes: ['INPUT_INVALID'],
      diagnostic: `deterministic reserve input rejected: ${parsed.error.message}`,
    });
  }

  try {
    // Fresh instance per run: no cross-call cache reuse, clock pinned to ctx.
    const engine = new DeterministicReserveEngine(featureFlags, {
      now: () => ctx.clock.now().getTime(),
      debugMode: false,
    });
    const engineResult = await engine.calculateOptimalReserveAllocation(parsed.data);
    const value = DeterministicReserveCalcValueSchema.parse({
      ...(serializeDeterministicReserveInput(engineResult) as Record<string, unknown>),
      asOfUtc: ctx.clock.isoNow(),
    });
    const resultHash = computeResultHash(basis, value);
    if (effectiveMode === 'shadow') {
      return DeterministicReserveCalcResultSchema.parse({
        state: 'indicative',
        basis,
        value,
        resultHash,
        reasonCodes: ['SHADOW_ONLY'],
      });
    }
    return DeterministicReserveCalcResultSchema.parse({
      state: 'available',
      basis,
      value,
      resultHash,
      reasonCodes: [],
    });
  } catch (error) {
    return DeterministicReserveCalcResultSchema.parse({
      state: 'failed',
      basis,
      reasonCodes: ['ENGINE_ERROR'],
      diagnostic: error instanceof Error ? error.message : String(error),
    });
  }
}
