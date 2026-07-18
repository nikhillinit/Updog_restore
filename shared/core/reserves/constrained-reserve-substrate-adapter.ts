/**
 * ConstrainedReserveEngine substrate adapter (Tranche 5, ADR-046).
 *
 * Runs the legacy ConstrainedReserveEngine against an injected
 * CalculationContext and returns a CalcResult with a validated basis and result
 * hash. Like Tranche 4 this adapter WRAPS the legacy class rather than
 * restating its kernel; unlike Tranche 4 it touches the adopted engine's source
 * ZERO times. The engine needs no capability seam and no cache-identity fix:
 *
 * - It draws NO randomness (no Math.random, no PRNG, no seed) - the greedy fill
 *   runs in a deterministic score sort with a stable name/id tie-break. The
 *   adapter value is therefore seed-invariant (disclosed and pinned, as
 *   ADR-044/045 did); no fork label is consumed or reserved.
 * - It performs NO ambient read (zero Date.now / new Date / process.env /
 *   Math.random occurrences) and emits no wall-clock-derived value, so there is
 *   nothing to inject and no seam to add.
 * - It has NO calculation cache and NO global mutation (no Decimal config); it
 *   works in exact BigInt cents via shared/lib/cents.ts, so there is no
 *   cache-identity defect to repair.
 *
 * The adapter constructs a fresh (stateless) engine per call and invokes its
 * single synchronous `calculate(input)` method. The entry point is SYNCHRONOUS,
 * mirroring the Tranche 3 reserve adapter rather than Tranche 4's async one.
 *
 * Boundary conventions and disclosed deviations (ADR-046):
 * - The three money fields (per-allocation `allocated`, `totalAllocated`,
 *   `remaining`) are emitted as fixed 2-decimal strings. This differs from
 *   Tranche 4's plain-numbers choice precisely because these outputs are exact
 *   cents (`fromCents` of a BigInt), not irrational Decimal amounts: a 2dp
 *   string fabricates no precision and restores the Tranche 2/3 money-as-string
 *   discipline. Hash admission normalizes "30000.00" -> "30000", so identities
 *   never depend on the padded spelling. Plain finite numbers (the Tranche 4
 *   choice) were the considered alternative.
 * - inputHash covers the RAW input under `admitForHashing` with an
 *   inadmissible-sentinel fallback (the Tranche 3 pattern), NOT the schema-
 *   parsed input as in Tranche 4. The raw input carries no Date instances, and
 *   for the common omitted-constraints case no non-finite number either, so it
 *   is directly admissible. The one schema-valid-but-inadmissible case is an
 *   explicit non-finite `maxPerCompany` (nonNegative() admits Infinity); such
 *   an input collapses onto the sentinel, so two inputs differing only
 *   elsewhere while both pinning `maxPerCompany: Infinity` share one input
 *   identity - a disclosed consequence of raw hashing (as equivalent spellings
 *   were in Tranche 3). Hashing the parsed input would not help: Zod's
 *   `.partial()` suppresses the ConstraintsSchema `maxPerCompany` default, so
 *   the parsed input reintroduces no Infinity of its own.
 *
 * Result semantics (identical to ADR-043/044/045): on -> available; shadow ->
 * indicative + SHADOW_ONLY; configured off -> unavailable + MODE_OFF; kill
 * switch -> unavailable + KILL_SWITCH_ACTIVE (both codes when both apply);
 * schema-invalid input -> failed + INPUT_INVALID with a diagnostic; engine
 * throw (e.g. "No policy for {stage}", "Invalid discount calculation") ->
 * failed + ENGINE_ERROR. Every non-available path carries at least one
 * registered reason code; there is no silent fallback.
 */

import { z } from 'zod';
import { canonicalSha256 } from '../../lib/canonical-hash';
import { ReserveInputSchema } from '../../schemas';
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
import { ConstrainedReserveEngine } from './ConstrainedReserveEngine';

export const CONSTRAINED_RESERVE_CALCULATION_KEY = 'reserve-constrained';
export const CONSTRAINED_RESERVE_ENGINE_VERSION = 'constrained-reserve-engine/1.0.0';
export const CONSTRAINED_RESERVE_METHODOLOGY_VERSION = 'constrained-reserve-methodology/1.0.0';
export const CONSTRAINED_RESERVE_INPUT_HASH_DOMAIN = 'updog.reserve-constrained.input-hash';
export const CONSTRAINED_RESERVE_ASSUMPTIONS_HASH_DOMAIN =
  'updog.reserve-constrained.assumptions-hash';

/**
 * Frozen methodology, hashed into every basis as the assumptions preimage.
 *
 * `engineFallbacks` are the flat values the engine substitutes when a
 * constraint field is absent (ConstrainedReserveEngine.ts: `yearsToExit ?? 5`,
 * `exitProb ?? 0.5`, `disc ?? 0.12`); the characterization goldens keep them
 * honest (change one and the hand-derived allocations move). `constraintDefaults`
 * are the ConstraintsSchema-ADVERTISED defaults - restated as documented and
 * pinned by an introspection parity test. Note the honest subtlety: because
 * ConstraintsSchema is `.partial()`, its `graduationYears`/`graduationProb`
 * per-stage default maps never materialize on parse, so the engine's flat
 * fallbacks (5, 0.5), not those maps, govern an omitted-constraints run. Both
 * are recorded here for completeness. `maxCompanyCapCents` mirrors the engine's
 * `MAX_COMPANY_CAP_CENTS = BigInt(Number.MAX_SAFE_INTEGER)` as an admissible
 * finite number (bigint is not hash-admissible).
 */
const CONSTRAINED_RESERVE_ASSUMPTIONS = {
  formula: {
    discountFactor: '(1 + discountRateAnnual) ** yearsToExit',
    presentValue: '(reserveMultiple * exitProb) / discountFactor',
    score: 'presentValue * weight',
  },
  engineFallbacks: {
    yearsToExit: 5,
    exitProb: 0.5,
    discountRateAnnual: 0.12,
  },
  constraintDefaults: {
    minCheck: 0,
    discountRateAnnual: 0.12,
    maxPerStage: {},
    maxPerCompany: 'unbounded',
    graduationYears: {
      preseed: 8,
      seed: 7,
      series_a: 6,
      series_b: 5,
      series_c: 4,
      series_dplus: 3,
    },
    graduationProb: {
      preseed: 0.1,
      seed: 0.2,
      series_a: 0.35,
      series_b: 0.5,
      series_c: 0.65,
      series_dplus: 0.8,
    },
  },
  centsRounding: 'half-away-from-zero-to-whole-cents',
  maxCompanyCapCents: Number.MAX_SAFE_INTEGER,
  ranking: 'score desc, then name asc (localeCompare), then id asc (localeCompare)',
  greedyFill:
    'single pass in ranked order; each company fills min(remaining, stageRoom, companyCap); skip when room <= 0 or (minCheck > 0 and room < minCheck)',
  moneyBoundary: 'engine BigInt cents rendered as fixed 2-decimal strings',
} as const;

const MONEY_DECIMAL_RE = /^(0|[1-9]\d*)\.\d{2}$/;
const MoneyDecimalSchema = z
  .string()
  .regex(MONEY_DECIMAL_RE, 'non-negative fixed 2-decimal dollar string');

const ISO_UTC_MS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const IsoUtcStringSchema = z.string().regex(ISO_UTC_MS_RE, 'ISO-8601 UTC string (ms precision)');

const ConstrainedReserveAllocationValueSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    stage: z.string().min(1),
    allocated: MoneyDecimalSchema,
  })
  .strict();

export const ConstrainedReserveCalcValueSchema = z
  .object({
    allocations: z.array(ConstrainedReserveAllocationValueSchema),
    totalAllocated: MoneyDecimalSchema,
    remaining: MoneyDecimalSchema,
    conservationOk: z.boolean(),
    asOfUtc: IsoUtcStringSchema,
  })
  .strict();

export type ConstrainedReserveCalcValue = z.infer<typeof ConstrainedReserveCalcValueSchema>;

export const ConstrainedReserveCalcResultSchema = createCalcResultSchema(
  ConstrainedReserveCalcValueSchema
);
export type ConstrainedReserveCalcResult = z.infer<typeof ConstrainedReserveCalcResultSchema>;

export interface ConstrainedReserveSubstrateOptions {
  configuredMode: CalcMode;
  killSwitchActive: boolean;
}

/**
 * Renders an engine money amount (an exact 2-decimal cents value produced by
 * `fromCents`) as a fixed 2dp decimal string. Recovering the integer cents with
 * Math.round before formatting avoids both a toFixed half-cent artifact and any
 * exponential notation for large magnitudes; the amounts are non-negative by
 * construction, but the sign is handled defensively.
 */
function toMoneyDecimalString(amount: number): string {
  if (!Number.isFinite(amount)) {
    throw new TypeError(`constrained reserve amount must be finite, received ${String(amount)}`);
  }
  const cents = Math.round(amount * 100);
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.trunc(abs / 100);
  const frac = abs % 100;
  return `${sign}${whole}.${frac.toString().padStart(2, '0')}`;
}

export function computeConstrainedReserveInputHash(input: unknown): string {
  let admitted: unknown;
  try {
    admitted = admitForHashing(input);
  } catch {
    // The raw input cannot be canonically hashed (an explicit non-finite
    // maxPerCompany, undefined, NaN, ...). The basis still needs a
    // deterministic input identity, and any accompanying failure discloses the
    // rejection via INPUT_INVALID (schema-invalid) or ENGINE_ERROR.
    admitted = { inadmissibleInput: true };
  }
  return canonicalSha256({ domain: CONSTRAINED_RESERVE_INPUT_HASH_DOMAIN, input: admitted });
}

export function computeConstrainedReserveAssumptionsHash(): string {
  return canonicalSha256({
    domain: CONSTRAINED_RESERVE_ASSUMPTIONS_HASH_DOMAIN,
    methodologyVersion: CONSTRAINED_RESERVE_METHODOLOGY_VERSION,
    assumptions: admitForHashing(CONSTRAINED_RESERVE_ASSUMPTIONS),
  });
}

/** Test-only view of the frozen methodology, for the restatement parity test. */
export const CONSTRAINED_RESERVE_ASSUMPTIONS_VIEW = CONSTRAINED_RESERVE_ASSUMPTIONS;

export function runConstrainedReserveWithSubstrate(
  ctx: CalculationContext,
  input: unknown,
  options: ConstrainedReserveSubstrateOptions
): ConstrainedReserveCalcResult {
  if (ctx.contractVersion !== CALC_SUBSTRATE_CONTRACT_VERSION) {
    throw new TypeError(
      `constrained reserve adapter requires contract ${CALC_SUBSTRATE_CONTRACT_VERSION}, received ${String(
        ctx.contractVersion
      )}`
    );
  }
  if (ctx.calculationKey !== CONSTRAINED_RESERVE_CALCULATION_KEY) {
    throw new TypeError(
      `constrained reserve adapter requires calculationKey '${CONSTRAINED_RESERVE_CALCULATION_KEY}', received '${ctx.calculationKey}'`
    );
  }

  const effectiveMode: CalcMode = options.killSwitchActive ? 'off' : options.configuredMode;

  const basis: CalcBasis = CalcBasisSchema.parse({
    contractVersion: CALC_SUBSTRATE_CONTRACT_VERSION,
    calculationKey: CONSTRAINED_RESERVE_CALCULATION_KEY,
    configuredMode: options.configuredMode,
    effectiveMode,
    killSwitchActive: options.killSwitchActive,
    engineVersion: CONSTRAINED_RESERVE_ENGINE_VERSION,
    methodologyVersion: CONSTRAINED_RESERVE_METHODOLOGY_VERSION,
    inputHash: computeConstrainedReserveInputHash(input),
    assumptionsHash: computeConstrainedReserveAssumptionsHash(),
  });

  if (effectiveMode === 'off') {
    const reasonCodes: CalcReasonCode[] = [];
    if (options.killSwitchActive) {
      reasonCodes.push('KILL_SWITCH_ACTIVE');
    }
    if (options.configuredMode === 'off') {
      reasonCodes.push('MODE_OFF');
    }
    return ConstrainedReserveCalcResultSchema.parse({ state: 'unavailable', basis, reasonCodes });
  }

  const parsed = ReserveInputSchema.safeParse(input);
  if (!parsed.success) {
    return ConstrainedReserveCalcResultSchema.parse({
      state: 'failed',
      basis,
      reasonCodes: ['INPUT_INVALID'],
      diagnostic: `constrained reserve input rejected: ${parsed.error.message}`,
    });
  }

  try {
    // Fresh instance per run; the engine is stateless so this is trivial and
    // guarantees no cross-call state can leak in.
    const engine = new ConstrainedReserveEngine();
    const engineResult = engine.calculate(parsed.data);
    const value = ConstrainedReserveCalcValueSchema.parse({
      allocations: engineResult.allocations.map((allocation) => ({
        id: allocation.id,
        name: allocation.name,
        stage: allocation.stage,
        allocated: toMoneyDecimalString(allocation.allocated),
      })),
      totalAllocated: toMoneyDecimalString(engineResult.totalAllocated),
      remaining: toMoneyDecimalString(engineResult.remaining),
      conservationOk: engineResult.conservationOk,
      asOfUtc: ctx.clock.isoNow(),
    });
    const resultHash = computeResultHash(basis, value);
    if (effectiveMode === 'shadow') {
      return ConstrainedReserveCalcResultSchema.parse({
        state: 'indicative',
        basis,
        value,
        resultHash,
        reasonCodes: ['SHADOW_ONLY'],
      });
    }
    return ConstrainedReserveCalcResultSchema.parse({
      state: 'available',
      basis,
      value,
      resultHash,
      reasonCodes: [],
    });
  } catch (error) {
    return ConstrainedReserveCalcResultSchema.parse({
      state: 'failed',
      basis,
      reasonCodes: ['ENGINE_ERROR'],
      diagnostic: error instanceof Error ? error.message : String(error),
    });
  }
}
