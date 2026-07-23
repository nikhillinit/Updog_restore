import { db } from '../db';
import { substrateShadowReconciliations } from '@shared/schema';
import type { InsertSubstrateShadowReconciliation } from '../../shared/schema/substrate-shadow-reconciliations';
import type { CurrentForecastV2 } from '../../shared/contracts/current-forecast-v2.contract';
import { canonicalSha256 } from '../../shared/lib/canonical-hash';
import {
  CURRENT_FORECAST_CALCULATION_KEY,
  type CurrentForecastModeResolution,
} from './current-forecast-calc-mode-resolver';
import {
  createCandidateCurrentForecastReference,
  currentForecastReferenceIdempotencyKey,
} from './current-forecast-reference-service';

/**
 * Shadow evaluation plane for the current-forecast calculation key (PLAN_61
 * Task 13.1-svc), modeled on `substrate-shadow-reconciliation-writer.ts`: runs
 * V2 over the committed replay corpus and persists append-only reconciliation
 * observations into `substrate_shadow_reconciliations`.
 *
 * Review pins honored here:
 * - P3: non-value-producing runs persist as `reconciliation_status='mismatch'`
 *   with a typed reason (`unavailable` -> `facts_gap`/`unavailable_expected`);
 *   `failed` persists as `mismatch` with NO typed reason — it is by definition
 *   an UNEXPLAINED divergence and blocks green.
 * - P4: the writer never emits `configured_mode`/`effective_mode` outside
 *   `off|shadow|on` ('held' is a resolver/serving state, not a ledger mode) —
 *   enforced by {@link assertLedgerMode}.
 * - D1 (divergence-by-design): legacy numeric parity is NOT a green criterion.
 *   Green = exact-basis replay reproduces the pinned `resultHash` for every
 *   base + >=90% available coverage + zero unexplained divergences.
 */

export const CURRENT_FORECAST_SHADOW_MISMATCH_REASONS = [
  'legacy_fabrication_replaced',
  'facts_gap',
  'methodology_change',
  'unavailable_expected',
] as const;

export type CurrentForecastShadowMismatchReason =
  (typeof CURRENT_FORECAST_SHADOW_MISMATCH_REASONS)[number];

type LedgerMode = 'off' | 'shadow' | 'on';

/** P4 clamp: the substrate ledger mode CHECKs were deliberately not widened. */
function assertLedgerMode(value: string): LedgerMode {
  if (value !== 'off' && value !== 'shadow' && value !== 'on') {
    throw new Error(`substrate ledger modes admit only off|shadow|on, got: ${value}`);
  }
  return value;
}

export interface CurrentForecastShadowModes {
  configuredMode: LedgerMode;
  effectiveMode: LedgerMode;
  killSwitchActive: boolean;
}

export interface CurrentForecastShadowBaseExpectation {
  status: 'available' | 'indicative' | 'unavailable' | 'failed';
  inputHash: string | null;
  resultHash: string | null;
  methodologyVersion: string;
  mismatchReasons: readonly CurrentForecastShadowMismatchReason[];
}

export interface CurrentForecastShadowBase {
  name: string;
  fundId: number;
  referenceBasis: {
    fundSnapshotId: number;
    currentPlanVersionId: number;
    financialFactsSnapshotId: number;
  };
  expected: CurrentForecastShadowBaseExpectation;
}

export interface CurrentForecastShadowOutcome {
  baseName: string;
  executed: boolean;
  substrateState: 'available' | 'indicative' | 'unavailable' | 'failed' | null;
  reconciliationStatus: 'match' | 'mismatch' | null;
  replayConsistent: boolean;
  mismatchReasons: CurrentForecastShadowMismatchReason[];
  unexplained: boolean;
}

function skippedOutcome(baseName: string): CurrentForecastShadowOutcome {
  return {
    baseName,
    executed: false,
    substrateState: null,
    reconciliationStatus: null,
    replayConsistent: true,
    mismatchReasons: [],
    unexplained: false,
  };
}

/**
 * Deterministic identity for runs that produced no engine output at all (a
 * thrown basis mismatch has no `inputHash`); keeps the NOT NULL hash columns
 * honest and dedupes replays through the 0038 null-hash partial unique.
 */
function corpusRunIdentityHash(base: CurrentForecastShadowBase): string {
  return canonicalSha256({
    calculationKey: CURRENT_FORECAST_CALCULATION_KEY,
    corpusBase: base.name,
    fundId: base.fundId,
  });
}

export interface BuildCurrentForecastShadowRecordParams {
  base: CurrentForecastShadowBase;
  result: CurrentForecastV2 | null;
  error?: unknown;
  modes: CurrentForecastShadowModes;
}

export function buildCurrentForecastShadowRecord(params: BuildCurrentForecastShadowRecordParams): {
  record: InsertSubstrateShadowReconciliation;
  outcome: CurrentForecastShadowOutcome;
} {
  const { base, result, error, modes } = params;
  const configuredMode = assertLedgerMode(modes.configuredMode);
  const effectiveMode = assertLedgerMode(modes.effectiveMode);

  let substrateState: 'available' | 'indicative' | 'unavailable' | 'failed';
  let resultHash: string | null;
  let replayConsistent: boolean;
  let mismatchReasons: CurrentForecastShadowMismatchReason[];

  if (error !== undefined || result === null || result.status === 'failed') {
    // P3: failed is by definition an UNEXPLAINED divergence — no typed reason.
    substrateState = 'failed';
    resultHash = null;
    replayConsistent = false;
    mismatchReasons = [];
  } else if (result.status === 'unavailable') {
    substrateState = 'unavailable';
    // The engine still hashes the unavailable result envelope; persist it so
    // replays dedupe through the result-bearing unique (null only when the
    // engine truly produced nothing -- the 'failed' branch).
    resultHash = result.resultHash;
    replayConsistent = result.resultHash === base.expected.resultHash;
    mismatchReasons = result.unavailableReasons.some(
      (reason) => reason.code === 'FACTS_UNAVAILABLE'
    )
      ? ['facts_gap']
      : ['unavailable_expected'];
  } else if (result.status === 'available' || result.status === 'indicative') {
    substrateState = result.status;
    resultHash = result.resultHash;
    replayConsistent = result.resultHash !== null && result.resultHash === base.expected.resultHash;
    mismatchReasons = replayConsistent
      ? []
      : result.methodologyVersion !== base.expected.methodologyVersion
        ? ['methodology_change']
        : [];
  } else {
    // 'held' is a serving state; a shadow evaluation can never produce it.
    throw new Error(`current-forecast shadow cannot record engine status: ${result.status}`);
  }

  const reconciliationStatus: 'match' | 'mismatch' =
    substrateState === 'available' || substrateState === 'indicative'
      ? replayConsistent
        ? 'match'
        : 'mismatch'
      : 'mismatch';

  const unexplained =
    substrateState === 'failed' ||
    (reconciliationStatus === 'mismatch' && mismatchReasons.length === 0);

  const record: InsertSubstrateShadowReconciliation = {
    fundId: base.fundId,
    calculationKey: CURRENT_FORECAST_CALCULATION_KEY,
    configuredMode,
    effectiveMode,
    killSwitchActive: modes.killSwitchActive,
    substrateState,
    reconciliationStatus,
    inputHash: result?.inputHash ?? corpusRunIdentityHash(base),
    resultHash,
    assumptionsHash: result?.assumptionsHash ?? corpusRunIdentityHash(base),
    mismatches: [...mismatchReasons],
  };

  return {
    record,
    outcome: {
      baseName: base.name,
      executed: true,
      substrateState,
      reconciliationStatus,
      replayConsistent,
      mismatchReasons,
      unexplained,
    },
  };
}

/** Default append-only writer (substrate-writer shape: idempotent, no rethrow filtering). */
export async function persistCurrentForecastShadowReconciliation(
  record: InsertSubstrateShadowReconciliation
): Promise<void> {
  await db.insert(substrateShadowReconciliations).values(record).onConflictDoNothing();
}

export type PersistCurrentForecastShadowReconciliationFn = (
  record: InsertSubstrateShadowReconciliation
) => Promise<void>;

export type CreateCurrentForecastReferenceFn = (params: {
  fundId: number;
  basis: {
    fundSnapshotId: number;
    currentPlanVersionId: number;
    financialFactsSnapshotId: number;
    inputHash: string;
    resultHash: string;
    assumptionsHash: string;
    engineVersion: string;
    methodologyVersion: string;
  };
  idempotencyKey: string;
}) => Promise<unknown>;

const defaultCreateReference: CreateCurrentForecastReferenceFn = (params) =>
  createCandidateCurrentForecastReference(params);

export interface RunCurrentForecastShadowBaseParams {
  base: CurrentForecastShadowBase;
  resolveMode: () => Promise<CurrentForecastModeResolution>;
  runV2: () => Promise<CurrentForecastV2>;
  persist?: PersistCurrentForecastShadowReconciliationFn;
  createReference?: CreateCurrentForecastReferenceFn;
}

/**
 * Evaluate one replay base under the shadow plane. Only a `shadow` resolution
 * executes; `off`/`on`/`held` skip without persisting (P4: nothing outside the
 * shadow lane ever reaches the ledger from here). A green (available + replay
 * match) run creates the candidate reference under the deterministic
 * `cfref:<fundId>:<inputHash>:<resultHash>` key.
 */
export async function runCurrentForecastShadowBase(
  params: RunCurrentForecastShadowBaseParams
): Promise<CurrentForecastShadowOutcome> {
  const persist = params.persist ?? persistCurrentForecastShadowReconciliation;
  const createReference = params.createReference ?? defaultCreateReference;

  const resolution = await params.resolveMode();
  if (resolution.mode !== 'shadow') {
    return skippedOutcome(params.base.name);
  }

  let result: CurrentForecastV2 | null = null;
  let caught: { error: unknown } | undefined;
  try {
    result = await params.runV2();
  } catch (error) {
    caught = { error };
  }

  const { record, outcome } = buildCurrentForecastShadowRecord({
    base: params.base,
    result,
    ...(caught === undefined ? {} : { error: caught.error }),
    modes: { configuredMode: 'shadow', effectiveMode: 'shadow', killSwitchActive: false },
  });

  await persist(record);

  if (
    outcome.substrateState === 'available' &&
    outcome.reconciliationStatus === 'match' &&
    result !== null &&
    result.resultHash !== null
  ) {
    await createReference({
      fundId: params.base.fundId,
      basis: {
        ...params.base.referenceBasis,
        inputHash: result.inputHash,
        resultHash: result.resultHash,
        assumptionsHash: result.assumptionsHash,
        engineVersion: result.engineVersion,
        methodologyVersion: result.methodologyVersion,
      },
      idempotencyKey: currentForecastReferenceIdempotencyKey({
        fundId: params.base.fundId,
        inputHash: result.inputHash,
        resultHash: result.resultHash,
      }),
    });
  }

  return outcome;
}

export interface CurrentForecastShadowGreenEvaluation {
  green: boolean;
  evaluatedCount: number;
  availableCount: number;
  availableCoverage: number;
  replayInconsistent: string[];
  unexplainedDivergences: string[];
}

/**
 * D1 green criteria (legacy numeric parity deliberately absent): every
 * evaluated base replays consistently, zero unexplained divergences, and
 * >=90% of evaluated bases produced an `available` value.
 */
export function evaluateCurrentForecastShadowGreen(
  outcomes: readonly CurrentForecastShadowOutcome[]
): CurrentForecastShadowGreenEvaluation {
  const evaluated = outcomes.filter((outcome) => outcome.executed);
  const availableCount = evaluated.filter(
    (outcome) => outcome.substrateState === 'available'
  ).length;
  const availableCoverage = evaluated.length === 0 ? 0 : availableCount / evaluated.length;
  const replayInconsistent = evaluated
    .filter((outcome) => !outcome.replayConsistent)
    .map((outcome) => outcome.baseName);
  const unexplainedDivergences = evaluated
    .filter((outcome) => outcome.unexplained)
    .map((outcome) => outcome.baseName);

  return {
    green:
      evaluated.length > 0 &&
      replayInconsistent.length === 0 &&
      unexplainedDivergences.length === 0 &&
      availableCoverage >= 0.9,
    evaluatedCount: evaluated.length,
    availableCount,
    availableCoverage,
    replayInconsistent,
    unexplainedDivergences,
  };
}
