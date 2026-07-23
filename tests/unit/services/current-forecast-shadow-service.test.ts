import { beforeEach, describe, expect, it, vi } from 'vitest';

const { insert, values, onConflictDoNothing } = vi.hoisted(() => {
  const onConflictDoNothing = vi.fn(() => Promise.resolve({ rowsAffected: 0 }));
  const values = vi.fn(() => ({ onConflictDoNothing }));
  const insert = vi.fn(() => ({ values }));
  return { insert, values, onConflictDoNothing };
});

vi.mock('../../../server/db', () => ({ db: { insert } }));

import { runCohortProjectionV2 } from '@shared/core/cohorts/CohortProjectionV2';
import { substrateShadowReconciliations } from '../../../shared/schema';
import {
  buildCurrentForecastShadowRecord,
  evaluateCurrentForecastShadowGreen,
  persistCurrentForecastShadowReconciliation,
  runCurrentForecastShadowBase,
  type CurrentForecastShadowBase,
  type CurrentForecastShadowModes,
  type CurrentForecastShadowOutcome,
} from '../../../server/services/current-forecast-shadow-service';
import {
  CURRENT_FORECAST_REPLAY_CORPUS,
  type CurrentForecastReplayCorpusEntry,
} from '../../fixtures/current-forecast-replay-corpus';

const SHADOW_MODES: CurrentForecastShadowModes = {
  configuredMode: 'shadow',
  effectiveMode: 'shadow',
  killSwitchActive: false,
};

function corpusEntry(name: string): CurrentForecastReplayCorpusEntry {
  const entry = CURRENT_FORECAST_REPLAY_CORPUS.find((candidate) => candidate.name === name);
  if (!entry) throw new Error(`Missing corpus entry ${name}`);
  return entry;
}

function toShadowBase(entry: CurrentForecastReplayCorpusEntry): CurrentForecastShadowBase {
  return {
    name: entry.name,
    fundId: entry.input.fundId,
    referenceBasis: entry.referenceBasis,
    expected: entry.expected,
  };
}

function runEngine(entry: CurrentForecastReplayCorpusEntry) {
  return runCohortProjectionV2(entry.input, entry.plan, entry.facts);
}

const shadowResolution = async () => ({ mode: 'shadow' as const, cutoverReferenceId: null });
const heldResolution = async () => ({ mode: 'held' as const, cutoverReferenceId: 41 });

function outcomeFixture(
  overrides: Partial<CurrentForecastShadowOutcome> = {}
): CurrentForecastShadowOutcome {
  return {
    baseName: 'fixture',
    executed: true,
    substrateState: 'available',
    reconciliationStatus: 'match',
    replayConsistent: true,
    mismatchReasons: [],
    unexplained: false,
    ...overrides,
  };
}

describe('current-forecast replay corpus', () => {
  it('loads six schema-validated bases with exactly one held base', () => {
    expect(CURRENT_FORECAST_REPLAY_CORPUS).toHaveLength(6);
    expect(
      CURRENT_FORECAST_REPLAY_CORPUS.filter((entry) => entry.kind === 'held').map((e) => e.name)
    ).toEqual(['held']);
    expect(CURRENT_FORECAST_REPLAY_CORPUS.map((entry) => entry.name).sort()).toEqual([
      'case-blocked',
      'empty-facts',
      'full-facts',
      'held',
      'indicative',
      'partial-facts',
    ]);
  });

  it('exact-basis replay reproduces the pinned hashes for every value-bearing base', () => {
    for (const entry of CURRENT_FORECAST_REPLAY_CORPUS) {
      if (entry.kind !== 'evaluate' || entry.name === 'case-blocked') continue;
      const result = runEngine(entry);
      expect({
        name: entry.name,
        status: result.status,
        inputHash: result.inputHash,
        resultHash: result.resultHash,
      }).toEqual({
        name: entry.name,
        status: entry.expected.status,
        inputHash: entry.expected.inputHash,
        resultHash: entry.expected.resultHash,
      });
    }
  });

  it('the case-blocked base fails with a basis mismatch', () => {
    expect(() => runEngine(corpusEntry('case-blocked'))).toThrowError(
      /currentPlanVersionId must identify the supplied plan/
    );
  });
});

describe('buildCurrentForecastShadowRecord', () => {
  it('maps an available replay match to match with no reasons', () => {
    const entry = corpusEntry('full-facts');
    const { record, outcome } = buildCurrentForecastShadowRecord({
      base: toShadowBase(entry),
      result: runEngine(entry),
      modes: SHADOW_MODES,
    });

    expect(record).toMatchObject({
      fundId: entry.input.fundId,
      calculationKey: 'current_forecast',
      configuredMode: 'shadow',
      effectiveMode: 'shadow',
      substrateState: 'available',
      reconciliationStatus: 'match',
      inputHash: entry.expected.inputHash,
      resultHash: entry.expected.resultHash,
      mismatches: [],
    });
    expect(outcome).toMatchObject({
      executed: true,
      replayConsistent: true,
      unexplained: false,
    });
  });

  it('maps an indicative replay match to match', () => {
    const entry = corpusEntry('indicative');
    const { record, outcome } = buildCurrentForecastShadowRecord({
      base: toShadowBase(entry),
      result: runEngine(entry),
      modes: SHADOW_MODES,
    });

    expect(record.substrateState).toBe('indicative');
    expect(record.reconciliationStatus).toBe('match');
    expect(outcome.unexplained).toBe(false);
  });

  it('flags an unexplained divergence when the hash drifts under the same methodology', () => {
    const entry = corpusEntry('full-facts');
    const base = toShadowBase(entry);
    const { record, outcome } = buildCurrentForecastShadowRecord({
      base: {
        ...base,
        expected: { ...base.expected, resultHash: 'f'.repeat(64) },
      },
      result: runEngine(entry),
      modes: SHADOW_MODES,
    });

    expect(record.reconciliationStatus).toBe('mismatch');
    expect(record.mismatches).toEqual([]);
    expect(outcome).toMatchObject({ replayConsistent: false, unexplained: true });
  });

  it('types a hash drift under a different pinned methodology as methodology_change', () => {
    const entry = corpusEntry('full-facts');
    const base = toShadowBase(entry);
    const { record, outcome } = buildCurrentForecastShadowRecord({
      base: {
        ...base,
        expected: {
          ...base.expected,
          resultHash: 'f'.repeat(64),
          methodologyVersion: 'cohort-projection-v1/9.9.9',
        },
      },
      result: runEngine(entry),
      modes: SHADOW_MODES,
    });

    expect(record.reconciliationStatus).toBe('mismatch');
    expect(record.mismatches).toEqual(['methodology_change']);
    expect(outcome).toMatchObject({ replayConsistent: false, unexplained: false });
  });

  it('persists a facts-driven unavailable run as mismatch + facts_gap (P3)', () => {
    const entry = corpusEntry('empty-facts');
    const { record, outcome } = buildCurrentForecastShadowRecord({
      base: toShadowBase(entry),
      result: runEngine(entry),
      modes: SHADOW_MODES,
    });

    expect(record).toMatchObject({
      substrateState: 'unavailable',
      reconciliationStatus: 'mismatch',
      mismatches: ['facts_gap'],
      resultHash: entry.expected.resultHash,
    });
    expect(outcome).toMatchObject({ replayConsistent: true, unexplained: false });
  });

  it('persists an expected non-facts unavailable run as mismatch + unavailable_expected (P3)', () => {
    const entry = corpusEntry('partial-facts');
    const { record, outcome } = buildCurrentForecastShadowRecord({
      base: toShadowBase(entry),
      result: runEngine(entry),
      modes: SHADOW_MODES,
    });

    expect(record.substrateState).toBe('unavailable');
    expect(record.mismatches).toEqual(['unavailable_expected']);
    expect(outcome.unexplained).toBe(false);
  });

  it('persists a thrown run as failed + mismatch with NO typed reason (unexplained, P3)', () => {
    const entry = corpusEntry('case-blocked');
    const { record, outcome } = buildCurrentForecastShadowRecord({
      base: toShadowBase(entry),
      result: null,
      error: new Error('basis mismatch'),
      modes: SHADOW_MODES,
    });

    expect(record).toMatchObject({
      substrateState: 'failed',
      reconciliationStatus: 'mismatch',
      resultHash: null,
      mismatches: [],
    });
    expect(record.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(outcome).toMatchObject({ replayConsistent: false, unexplained: true });
  });

  it('never emits a ledger mode outside off|shadow|on (P4)', () => {
    const entry = corpusEntry('full-facts');

    expect(() =>
      buildCurrentForecastShadowRecord({
        base: toShadowBase(entry),
        result: runEngine(entry),
        modes: { ...SHADOW_MODES, effectiveMode: 'held' as never },
      })
    ).toThrowError(/off\|shadow\|on/);
  });
});

describe('runCurrentForecastShadowBase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips without persisting when the resolution is held', async () => {
    const entry = corpusEntry('held');
    const persist = vi.fn();
    const createReference = vi.fn();

    const outcome = await runCurrentForecastShadowBase({
      base: toShadowBase(entry),
      resolveMode: heldResolution,
      runV2: async () => runEngine(entry),
      persist,
      createReference,
    });

    expect(outcome).toMatchObject({ executed: false, substrateState: null });
    expect(persist).not.toHaveBeenCalled();
    expect(createReference).not.toHaveBeenCalled();
  });

  it('persists one record and creates the candidate reference on an available match', async () => {
    const entry = corpusEntry('full-facts');
    const persist = vi.fn();
    const createReference = vi.fn();

    const outcome = await runCurrentForecastShadowBase({
      base: toShadowBase(entry),
      resolveMode: shadowResolution,
      runV2: async () => runEngine(entry),
      persist,
      createReference,
    });

    expect(outcome).toMatchObject({ executed: true, reconciliationStatus: 'match' });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(createReference).toHaveBeenCalledTimes(1);
    expect(createReference).toHaveBeenCalledWith({
      fundId: entry.input.fundId,
      basis: {
        ...entry.referenceBasis,
        inputHash: entry.expected.inputHash,
        resultHash: entry.expected.resultHash,
        assumptionsHash: expect.stringMatching(/^[a-f0-9]{64}$/) as unknown as string,
        engineVersion: 'current-forecast-v2-engine/1.0.0',
        methodologyVersion: 'cohort-projection-v2/1.0.0',
      },
      idempotencyKey: `cfref:${entry.input.fundId}:${entry.expected.inputHash}:${entry.expected.resultHash}`,
    });
  });

  it('persists but does not create a reference for unavailable and failed runs', async () => {
    const persist = vi.fn();
    const createReference = vi.fn();

    for (const name of ['empty-facts', 'case-blocked'] as const) {
      const entry = corpusEntry(name);
      await runCurrentForecastShadowBase({
        base: toShadowBase(entry),
        resolveMode: shadowResolution,
        runV2: async () => runEngine(entry),
        persist,
        createReference,
      });
    }

    expect(persist).toHaveBeenCalledTimes(2);
    expect(createReference).not.toHaveBeenCalled();
  });

  it('evaluates the full corpus with zero unexplained divergences outside case-blocked', async () => {
    const outcomes: CurrentForecastShadowOutcome[] = [];
    for (const entry of CURRENT_FORECAST_REPLAY_CORPUS) {
      outcomes.push(
        await runCurrentForecastShadowBase({
          base: toShadowBase(entry),
          resolveMode: entry.kind === 'held' ? heldResolution : shadowResolution,
          runV2: async () => runEngine(entry),
          persist: vi.fn(),
          createReference: vi.fn(),
        })
      );
    }

    const executed = outcomes.filter((outcome) => outcome.executed);
    expect(executed).toHaveLength(5);
    expect(executed.filter((outcome) => outcome.unexplained).map((o) => o.baseName)).toEqual([
      'case-blocked',
    ]);
    expect(
      executed
        .filter((outcome) => outcome.baseName !== 'case-blocked')
        .every((outcome) => outcome.replayConsistent)
    ).toBe(true);
  });
});

describe('evaluateCurrentForecastShadowGreen (D1: legacy parity is not a criterion)', () => {
  it('is green for fully available replay-consistent outcomes', () => {
    const outcomes = Array.from({ length: 10 }, (_unused, index) =>
      outcomeFixture({ baseName: `base-${index}` })
    );

    expect(evaluateCurrentForecastShadowGreen(outcomes)).toMatchObject({
      green: true,
      evaluatedCount: 10,
      availableCount: 10,
      availableCoverage: 1,
    });
  });

  it('blocks green on a single unexplained divergence', () => {
    const outcomes = [
      ...Array.from({ length: 9 }, (_unused, index) => outcomeFixture({ baseName: `ok-${index}` })),
      outcomeFixture({
        baseName: 'broken',
        substrateState: 'failed',
        reconciliationStatus: 'mismatch',
        replayConsistent: false,
        unexplained: true,
      }),
    ];

    const evaluation = evaluateCurrentForecastShadowGreen(outcomes);
    expect(evaluation.green).toBe(false);
    expect(evaluation.unexplainedDivergences).toEqual(['broken']);
  });

  it('holds the >=90% available coverage boundary', () => {
    const explainedUnavailable = (name: string) =>
      outcomeFixture({
        baseName: name,
        substrateState: 'unavailable',
        reconciliationStatus: 'mismatch',
        mismatchReasons: ['unavailable_expected'],
      });

    const nineOfTen = [
      ...Array.from({ length: 9 }, (_unused, index) => outcomeFixture({ baseName: `ok-${index}` })),
      explainedUnavailable('gap-0'),
    ];
    expect(evaluateCurrentForecastShadowGreen(nineOfTen)).toMatchObject({
      green: true,
      availableCoverage: 0.9,
    });

    const eightOfTen = [
      ...Array.from({ length: 8 }, (_unused, index) => outcomeFixture({ baseName: `ok-${index}` })),
      explainedUnavailable('gap-0'),
      explainedUnavailable('gap-1'),
    ];
    expect(evaluateCurrentForecastShadowGreen(eightOfTen).green).toBe(false);
  });

  it('blocks green on any replay-inconsistent value-bearing base even when explained', () => {
    const outcomes = [
      ...Array.from({ length: 19 }, (_unused, index) =>
        outcomeFixture({ baseName: `ok-${index}` })
      ),
      outcomeFixture({
        baseName: 'drifted',
        reconciliationStatus: 'mismatch',
        replayConsistent: false,
        mismatchReasons: ['methodology_change'],
      }),
    ];

    const evaluation = evaluateCurrentForecastShadowGreen(outcomes);
    expect(evaluation.green).toBe(false);
    expect(evaluation.replayInconsistent).toEqual(['drifted']);
    expect(evaluation.unexplainedDivergences).toEqual([]);
  });

  it('is never green over zero evaluated outcomes', () => {
    expect(evaluateCurrentForecastShadowGreen([]).green).toBe(false);
    expect(evaluateCurrentForecastShadowGreen([outcomeFixture({ executed: false })]).green).toBe(
      false
    );
  });
});

describe('persistCurrentForecastShadowReconciliation (default writer)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('issues insert(table).values(record).onConflictDoNothing() exactly once', async () => {
    const entry = corpusEntry('full-facts');
    const { record } = buildCurrentForecastShadowRecord({
      base: toShadowBase(entry),
      result: runEngine(entry),
      modes: SHADOW_MODES,
    });

    await persistCurrentForecastShadowReconciliation(record);

    expect(insert).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledWith(substrateShadowReconciliations);
    expect(values).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledWith(record);
    expect(onConflictDoNothing).toHaveBeenCalledOnce();
  });
});
