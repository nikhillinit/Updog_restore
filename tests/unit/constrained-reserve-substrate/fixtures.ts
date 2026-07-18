/**
 * Hand-authored fixtures for the ConstrainedReserveEngine substrate adoption
 * (Tranche 5, ADR-046).
 *
 * Every golden here is HAND-DERIVED (a return to the Tranche 2/3 discipline,
 * in deliberate contrast with Tranche 4's captured-then-frozen goldens): the
 * engine draws no randomness, does no ambient read, and its money math is exact
 * BigInt cents (`shared/lib/cents.ts`), so allocations are reproducible with
 * pencil and paper. The derivation of each is spelled out inline.
 *
 * Shared derivation constants. With `graduationYears` / `graduationProb`
 * omitted from `constraints`, the engine takes its per-stage fallbacks for
 * EVERY company (Zod's `.partial()` suppresses the ConstraintsSchema field
 * defaults, so an omitted key never becomes the default map):
 *
 *   yearsToExit = 5            (ConstrainedReserveEngine.ts fallback)
 *   exitProb    = 0.5          (fallback)
 *   disc        = 0.12         (ConstraintsSchema-documented default, applied
 *                               by the engine's own `?? 0.12`)
 *   discountFactor = (1 + 0.12) ** 5 = 1.7623416832
 *   pv    = (reserveMultiple * exitProb) / discountFactor
 *   score = pv * weight
 *
 * Because every company in a default-constraint fixture shares one
 * discountFactor and one exitProb, the score ORDER reduces to descending
 * `reserveMultiple * weight`, with ties broken by name then id. Only the order
 * feeds the greedy fill; the fill amounts themselves depend solely on
 * availableReserves and the caps, so they are exact to the cent. The engine
 * exposes neither pv nor score, so those values appear here only as the
 * ordering rationale; the observable golden is the allocation set.
 */

import type { ReserveInput } from '../../../shared/schemas';

export interface EngineAllocation {
  id: string;
  name: string;
  stage: string;
  allocated: number;
}

export interface EngineOutput {
  allocations: EngineAllocation[];
  totalAllocated: number;
  remaining: number;
  conservationOk: boolean;
}

export interface ConstrainedFixture {
  readonly label: string;
  readonly input: ReserveInput;
  readonly expected: EngineOutput;
}

/**
 * A: score ordering across stages, reserve exhaustion, and the filtered-out
 * zero. Beta (series_a, rm 3) outranks Alpha (seed, rm 2): score 0.85119 vs
 * 0.56746. Beta fills first and consumes the entire $100,000; Alpha then hits
 * `remaining <= 0`, allocates 0, and is dropped from `allocations`.
 */
export const TWO_COMPANY_EXHAUST: ConstrainedFixture = {
  label: 'two-company-exhaust',
  input: {
    availableReserves: 100_000,
    companies: [
      { id: 'c1', name: 'Alpha', stage: 'seed', invested: 1_000_000, ownership: 0.1 },
      { id: 'c2', name: 'Beta', stage: 'series_a', invested: 1_000_000, ownership: 0.1 },
    ],
    stagePolicies: [
      { stage: 'seed', reserveMultiple: 2, weight: 1 },
      { stage: 'series_a', reserveMultiple: 3, weight: 1 },
    ],
  },
  expected: {
    allocations: [{ id: 'c2', name: 'Beta', stage: 'series_a', allocated: 100_000 }],
    totalAllocated: 100_000,
    remaining: 0,
    conservationOk: true,
  },
};

/**
 * B: per-company cap plus the name tie-break. Alpha and Beta share the seed
 * policy, so their scores are equal; the tie breaks on name ('Alpha' < 'Beta').
 * `maxPerCompany` caps each fill at $30,000, so both allocate $30,000 and
 * $40,000 stays unallocated.
 */
export const COMPANY_CAP: ConstrainedFixture = {
  label: 'company-cap',
  input: {
    availableReserves: 100_000,
    companies: [
      { id: 'c1', name: 'Alpha', stage: 'seed', invested: 1_000_000, ownership: 0.1 },
      { id: 'c2', name: 'Beta', stage: 'seed', invested: 1_000_000, ownership: 0.1 },
    ],
    stagePolicies: [{ stage: 'seed', reserveMultiple: 2, weight: 1 }],
    constraints: { maxPerCompany: 30_000 },
  },
  expected: {
    allocations: [
      { id: 'c1', name: 'Alpha', stage: 'seed', allocated: 30_000 },
      { id: 'c2', name: 'Beta', stage: 'seed', allocated: 30_000 },
    ],
    totalAllocated: 60_000,
    remaining: 40_000,
    conservationOk: true,
  },
};

/**
 * C: per-stage cap. Both companies are seed; `maxPerStage.seed` caps the
 * combined seed fill at $50,000. Alpha (name tie-break winner) takes the full
 * $50,000 of stage room; Beta then sees stage room 0 and is skipped even
 * though $50,000 remains overall.
 */
export const STAGE_CAP: ConstrainedFixture = {
  label: 'stage-cap',
  input: {
    availableReserves: 100_000,
    companies: [
      { id: 'c1', name: 'Alpha', stage: 'seed', invested: 1_000_000, ownership: 0.1 },
      { id: 'c2', name: 'Beta', stage: 'seed', invested: 1_000_000, ownership: 0.1 },
    ],
    stagePolicies: [{ stage: 'seed', reserveMultiple: 2, weight: 1 }],
    constraints: { maxPerStage: { seed: 50_000 } },
  },
  expected: {
    allocations: [{ id: 'c1', name: 'Alpha', stage: 'seed', allocated: 50_000 }],
    totalAllocated: 50_000,
    remaining: 50_000,
    conservationOk: true,
  },
};

/**
 * D: minCheck skip combined with a per-company cap. Alpha (seed, rm 5) outranks
 * Beta (series_a, rm 2). `maxPerCompany` caps Alpha at $70,000, leaving
 * $30,000. Beta's remaining room ($30,000) is below `minCheck` ($60,000), so
 * Beta is skipped rather than under-funded.
 */
export const MIN_CHECK_SKIP: ConstrainedFixture = {
  label: 'min-check-skip',
  input: {
    availableReserves: 100_000,
    companies: [
      { id: 'c1', name: 'Alpha', stage: 'seed', invested: 1_000_000, ownership: 0.1 },
      { id: 'c2', name: 'Beta', stage: 'series_a', invested: 1_000_000, ownership: 0.1 },
    ],
    stagePolicies: [
      { stage: 'seed', reserveMultiple: 5, weight: 1 },
      { stage: 'series_a', reserveMultiple: 2, weight: 1 },
    ],
    constraints: { minCheck: 60_000, maxPerCompany: 70_000 },
  },
  expected: {
    allocations: [{ id: 'c1', name: 'Alpha', stage: 'seed', allocated: 70_000 }],
    totalAllocated: 70_000,
    remaining: 30_000,
    conservationOk: true,
  },
};

/**
 * E: empty companies. A schema-valid input (companies may be empty; stagePolicies
 * must be non-empty) yields a faithful empty result, not an unavailable one:
 * no allocations, zero allocated, and the full reserves left over.
 */
export const EMPTY_COMPANIES: ConstrainedFixture = {
  label: 'empty-companies',
  input: {
    availableReserves: 50_000,
    companies: [],
    stagePolicies: [{ stage: 'seed', reserveMultiple: 2, weight: 1 }],
  },
  expected: {
    allocations: [],
    totalAllocated: 0,
    remaining: 50_000,
    conservationOk: true,
  },
};

/**
 * F: the "No policy for {stage}" throw. The company is series_b but the only
 * policy is seed. This is schema-VALID (the stage/policy cross-check lives in
 * validateReserveInput, not ReserveInputSchema), so the engine is reached and
 * throws `Error({ status: 400 })`. The adapter maps it to failed + ENGINE_ERROR.
 */
export const NO_POLICY_THROW: ConstrainedFixture = {
  label: 'no-policy-throw',
  input: {
    availableReserves: 50_000,
    companies: [
      { id: 'c1', name: 'Alpha', stage: 'series_b', invested: 1_000_000, ownership: 0.1 },
    ],
    stagePolicies: [{ stage: 'seed', reserveMultiple: 2, weight: 1 }],
  },
  // No `expected` output: this fixture throws. The message is pinned in tests.
  expected: { allocations: [], totalAllocated: 0, remaining: 0, conservationOk: true },
};

export const NO_POLICY_THROW_MESSAGE = 'No policy for series_b';

/**
 * G: the invalid-discount throw. discountRateAnnual 1 with graduationYears
 * 5000 makes discountFactor = 2 ** 5000 = Infinity, so the engine throws
 * `Invalid discount calculation for stage seed`. Schema-valid (bounded01 caps
 * disc at 1; graduationYears has no upper bound). Maps to failed + ENGINE_ERROR.
 */
export const INVALID_DISCOUNT_THROW: ConstrainedFixture = {
  label: 'invalid-discount-throw',
  input: {
    availableReserves: 50_000,
    companies: [{ id: 'c1', name: 'Alpha', stage: 'seed', invested: 1_000_000, ownership: 0.1 }],
    stagePolicies: [{ stage: 'seed', reserveMultiple: 2, weight: 1 }],
    constraints: { discountRateAnnual: 1, graduationYears: { seed: 5000 } },
  },
  expected: { allocations: [], totalAllocated: 0, remaining: 0, conservationOk: true },
};

export const INVALID_DISCOUNT_THROW_MESSAGE = 'Invalid discount calculation for stage seed';

/**
 * H: the full tie-break ladder (score desc, then name asc, then id asc). All
 * three companies share the seed policy (equal score). 'Aardvark' sorts before
 * 'Same' on name; the two 'Same' companies break on id ('a1' < 'z9'). With a
 * $30,000 per-company cap and $90,000 available, all three fill equally, so the
 * allocation ORDER is the observable proof of the sort: [m5, a1, z9].
 */
export const TIE_BREAK: ConstrainedFixture = {
  label: 'tie-break',
  input: {
    availableReserves: 90_000,
    companies: [
      { id: 'z9', name: 'Same', stage: 'seed', invested: 1_000_000, ownership: 0.1 },
      { id: 'a1', name: 'Same', stage: 'seed', invested: 1_000_000, ownership: 0.1 },
      { id: 'm5', name: 'Aardvark', stage: 'seed', invested: 1_000_000, ownership: 0.1 },
    ],
    stagePolicies: [{ stage: 'seed', reserveMultiple: 2, weight: 1 }],
    constraints: { maxPerCompany: 30_000 },
  },
  expected: {
    allocations: [
      { id: 'm5', name: 'Aardvark', stage: 'seed', allocated: 30_000 },
      { id: 'a1', name: 'Same', stage: 'seed', allocated: 30_000 },
      { id: 'z9', name: 'Same', stage: 'seed', allocated: 30_000 },
    ],
    totalAllocated: 90_000,
    remaining: 0,
    conservationOk: true,
  },
};

/**
 * I: cent-level precision. availableReserves $100.55 fully funds the single
 * company. toCents(100.55) = 10055 cents exactly (Math.round absorbs the
 * 100.55 * 100 = 10054.999... float artifact), so the allocation is $100.55 to
 * the cent - the case that proves the adapter's 2dp decimal strings carry the
 * cents faithfully rather than rounding to whole dollars.
 */
export const CENTS_PRECISION: ConstrainedFixture = {
  label: 'cents-precision',
  input: {
    availableReserves: 100.55,
    companies: [{ id: 'c1', name: 'Alpha', stage: 'seed', invested: 1_000, ownership: 0.1 }],
    stagePolicies: [{ stage: 'seed', reserveMultiple: 2, weight: 1 }],
  },
  expected: {
    allocations: [{ id: 'c1', name: 'Alpha', stage: 'seed', allocated: 100.55 }],
    totalAllocated: 100.55,
    remaining: 0,
    conservationOk: true,
  },
};

/** Schema-invalid: stagePolicies must have min length 1. Drives INPUT_INVALID. */
export const INVALID_EMPTY_STAGE_POLICIES = {
  availableReserves: 1_000,
  companies: [],
  stagePolicies: [],
} as const;

/**
 * Schema-valid but hash-inadmissible RAW input: an explicit non-finite
 * maxPerCompany. admitForHashing rejects Infinity, so the input hash falls back
 * to the deterministic sentinel; the engine still runs (Infinity -> the max
 * company cap) and returns an available result. Two such inputs that differ
 * only elsewhere collide on inputHash - a disclosed consequence of raw hashing.
 */
export const EXPLICIT_INFINITY_CAP: ReserveInput = {
  availableReserves: 100_000,
  companies: [{ id: 'c1', name: 'Alpha', stage: 'seed', invested: 1_000_000, ownership: 0.1 }],
  stagePolicies: [{ stage: 'seed', reserveMultiple: 2, weight: 1 }],
  constraints: { maxPerCompany: Number.POSITIVE_INFINITY },
};

/** Fixtures whose engine call returns a value (excludes the two throwers). */
export const VALUE_FIXTURES: readonly ConstrainedFixture[] = [
  TWO_COMPANY_EXHAUST,
  COMPANY_CAP,
  STAGE_CAP,
  MIN_CHECK_SKIP,
  EMPTY_COMPANIES,
  TIE_BREAK,
  CENTS_PRECISION,
];
