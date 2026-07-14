import { describe, expect, it } from 'vitest';

import {
  FundMoicRankingsResponseV2Schema,
  type FundMoicRankingsResponseV2,
} from '../../../shared/contracts/fund-moic-v2.contract';

/**
 * Structural allowlist tests for the V2 read contract.
 *
 * The V2 surface permits only the declared ranking values and decimal-string
 * facts basis; it still rejects raw diffs and shadow comparisons. A test that only
 * checks "a valid payload parses" is vacuous against that goal. So every object
 * here is pinned to an EXACT allowed key set, and `.strict()` is proven to
 * reject an injected forbidden field on each nested object.
 */

const makeValidV2 = (): FundMoicRankingsResponseV2 => ({
  contractVersion: '2.1.0',
  fundId: 7,
  rankings: [
    {
      rank: 1,
      investmentId: 'inv-a',
      investmentName: 'Acme',
      reservesMoic: { value: 1.5, description: 'desc', formula: 'formula' },
      factsBasis: null,
    },
  ],
  provenance: { mode: 'legacy', warnings: [] },
  latestReconciliation: null,
  materiality: { status: 'not_run', candidateMaterial: false, epsilon: 1e-8 },
  modePreview: {
    calculationKey: 'fund_moic_rankings_exit_probability',
    configuredMode: 'off',
    effectiveMode: 'off',
    killSwitchActive: false,
    shadowStartedAt: null,
    eligibleAt: null,
    residencyDaysRequired: 7,
    residencyStatus: 'not_applicable',
    currentSourceMatchesAccepted: false,
    unreconciledEditsPresent: false,
    blockers: [],
    version: 0,
  },
  moicInputSummary: {
    sourceVersion: 'moic-round-fmv-facts-v2',
    explicitExitProbabilityCount: 1,
    defaultedExitProbabilityCount: 0,
    activationBlockingDefaultedExitProbabilityCount: 0,
    explicitReserveExitMultipleCount: 1,
    defaultedReserveExitMultipleCount: 0,
    activationBlockingDefaultedReserveExitMultipleCount: 0,
  },
  actualsProvenanceSummary: {
    factsStatus: 'available',
    factsInputHash: 'facts-hash',
    companyCount: 1,
    trustStateCounts: { LIVE: 1, PARTIAL: 0, UNAVAILABLE: 0, FAILED: 0 },
    defaultedEconomicInputCount: 1,
    warnings: [],
  },
  roundEvidenceSummary: { activeRoundCount: 0, activeOverrideCount: 0, warningCodes: [] },
  generatedAt: '2026-06-24T00:00:00.000Z',
});

describe('FundMoicRankingsResponseV2 contract — allowlist', () => {
  it('accepts a fully valid V2 payload', () => {
    expect(FundMoicRankingsResponseV2Schema.safeParse(makeValidV2()).success).toBe(true);
  });

  it('pins the EXACT top-level key set', () => {
    const parsed = FundMoicRankingsResponseV2Schema.parse(makeValidV2());
    expect(Object.keys(parsed).sort()).toEqual(
      [
        'contractVersion',
        'fundId',
        'generatedAt',
        'latestReconciliation',
        'materiality',
        'modePreview',
        'moicInputSummary',
        'actualsProvenanceSummary',
        'provenance',
        'rankings',
        'roundEvidenceSummary',
      ].sort()
    );
  });

  it('pins the EXACT provenance key set', () => {
    const parsed = FundMoicRankingsResponseV2Schema.parse(makeValidV2());
    expect(Object.keys(parsed.provenance).sort()).toEqual(['mode', 'warnings'].sort());
  });

  it('pins the EXACT materiality key set', () => {
    const parsed = FundMoicRankingsResponseV2Schema.parse(makeValidV2());
    expect(Object.keys(parsed.materiality).sort()).toEqual(
      ['candidateMaterial', 'epsilon', 'status'].sort()
    );
  });

  it('pins the EXACT latestReconciliation key set (when present)', () => {
    const payload = makeValidV2();
    payload.latestReconciliation = {
      runId: 'run-1',
      createdAt: '2026-06-24T00:00:00.000Z',
      currentInputMatches: true,
      sourceFingerprintMatches: true,
    };
    const parsed = FundMoicRankingsResponseV2Schema.parse(payload);
    expect(parsed.latestReconciliation).not.toBeNull();
    expect(Object.keys(parsed.latestReconciliation ?? {}).sort()).toEqual(
      ['createdAt', 'currentInputMatches', 'runId', 'sourceFingerprintMatches'].sort()
    );
  });

  it('pins the EXACT modePreview key set', () => {
    const parsed = FundMoicRankingsResponseV2Schema.parse(makeValidV2());
    expect(Object.keys(parsed.modePreview).sort()).toEqual(
      [
        'blockers',
        'calculationKey',
        'configuredMode',
        'currentSourceMatchesAccepted',
        'effectiveMode',
        'eligibleAt',
        'killSwitchActive',
        'residencyDaysRequired',
        'residencyStatus',
        'shadowStartedAt',
        'unreconciledEditsPresent',
        'version',
      ].sort()
    );
  });

  it('pins the EXACT moicInputSummary key set', () => {
    const parsed = FundMoicRankingsResponseV2Schema.parse(makeValidV2());
    expect(Object.keys(parsed.moicInputSummary).sort()).toEqual(
      [
        'activationBlockingDefaultedExitProbabilityCount',
        'activationBlockingDefaultedReserveExitMultipleCount',
        'defaultedExitProbabilityCount',
        'defaultedReserveExitMultipleCount',
        'explicitExitProbabilityCount',
        'explicitReserveExitMultipleCount',
        'sourceVersion',
      ].sort()
    );
  });

  it('pins the EXACT actualsProvenanceSummary key set', () => {
    const parsed = FundMoicRankingsResponseV2Schema.parse(makeValidV2());
    expect(Object.keys(parsed.actualsProvenanceSummary).sort()).toEqual(
      [
        'companyCount',
        'defaultedEconomicInputCount',
        'factsInputHash',
        'factsStatus',
        'trustStateCounts',
        'warnings',
      ].sort()
    );
    expect(Object.keys(parsed.actualsProvenanceSummary.trustStateCounts).sort()).toEqual(
      ['FAILED', 'LIVE', 'PARTIAL', 'UNAVAILABLE'].sort()
    );
  });

  it('pins the EXACT roundEvidenceSummary key set', () => {
    const parsed = FundMoicRankingsResponseV2Schema.parse(makeValidV2());
    expect(Object.keys(parsed.roundEvidenceSummary).sort()).toEqual(
      ['activeOverrideCount', 'activeRoundCount', 'warningCodes'].sort()
    );
  });
});

describe('FundMoicRankingsResponseV2 contract — forbidden-field rejection', () => {
  it('rejects a forbidden top-level leakage field', () => {
    const bad = { ...makeValidV2(), rawDiff: [{ a: 1 }] };
    expect(FundMoicRankingsResponseV2Schema.safeParse(bad).success).toBe(false);
  });

  it('rejects monetary leakage smuggled at top level', () => {
    const bad = { ...makeValidV2(), totalReservesUsd: 1_000_000 };
    expect(FundMoicRankingsResponseV2Schema.safeParse(bad).success).toBe(false);
  });

  it('rejects raw actuals facts rows smuggled at top level', () => {
    const bad = { ...makeValidV2(), actualsFacts: [{ companyId: 1, trustState: 'LIVE' }] };
    expect(FundMoicRankingsResponseV2Schema.safeParse(bad).success).toBe(false);
  });

  it('rejects a forbidden field on provenance', () => {
    const bad = makeValidV2();
    // @ts-expect-error injecting a forbidden key
    bad.provenance.candidateValues = [1, 2, 3];
    expect(FundMoicRankingsResponseV2Schema.safeParse(bad).success).toBe(false);
  });

  it('rejects a forbidden field on materiality', () => {
    const bad = makeValidV2();
    // @ts-expect-error injecting a forbidden key
    bad.materiality.rawDelta = 0.42;
    expect(FundMoicRankingsResponseV2Schema.safeParse(bad).success).toBe(false);
  });

  it('rejects a forbidden field on roundEvidenceSummary (no round IDs)', () => {
    const bad = makeValidV2();
    // @ts-expect-error injecting a forbidden key
    bad.roundEvidenceSummary.roundIds = ['r1', 'r2'];
    expect(FundMoicRankingsResponseV2Schema.safeParse(bad).success).toBe(false);
  });

  it('rejects raw monetary values on actualsProvenanceSummary', () => {
    const bad = makeValidV2();
    // @ts-expect-error injecting a forbidden key
    bad.actualsProvenanceSummary.totalCurrentValuationCents = 1_000_000_00;
    expect(FundMoicRankingsResponseV2Schema.safeParse(bad).success).toBe(false);
  });

  it('rejects per-company actuals leakage on actualsProvenanceSummary', () => {
    const bad = makeValidV2();
    // @ts-expect-error injecting a forbidden key
    bad.actualsProvenanceSummary.companies = [{ companyId: 1, trustState: 'LIVE' }];
    expect(FundMoicRankingsResponseV2Schema.safeParse(bad).success).toBe(false);
  });

  it('rejects a forbidden field on latestReconciliation', () => {
    const bad = makeValidV2();
    bad.latestReconciliation = {
      runId: 'run-1',
      createdAt: '2026-06-24T00:00:00.000Z',
      currentInputMatches: true,
      sourceFingerprintMatches: true,
      // @ts-expect-error injecting a forbidden key
      legacyOutputHash: 'deadbeef',
    };
    expect(FundMoicRankingsResponseV2Schema.safeParse(bad).success).toBe(false);
  });

  it('rejects per-investment leakage on a ranking item', () => {
    const bad = makeValidV2();
    // @ts-expect-error injecting a forbidden per-investment field
    bad.rankings[0].shadowComparison = { legacy: 0, candidate: 1 };
    expect(FundMoicRankingsResponseV2Schema.safeParse(bad).success).toBe(false);
  });
});

describe('FundMoicRankingsResponseV2 contract — literal/enum pins', () => {
  it('rejects a contractVersion other than 2.1.0', () => {
    const bad = { ...makeValidV2(), contractVersion: '1.0.0' };
    expect(FundMoicRankingsResponseV2Schema.safeParse(bad).success).toBe(false);
  });

  it('rejects provenance.mode outside the effective-source enum', () => {
    const bad = makeValidV2();
    // @ts-expect-error narrowing enum
    bad.provenance.mode = 'shadow';
    expect(FundMoicRankingsResponseV2Schema.safeParse(bad).success).toBe(false);
  });

  it('accepts materiality.candidateMaterial true when candidate differs', () => {
    const ok = makeValidV2();
    ok.materiality.candidateMaterial = true;
    expect(FundMoicRankingsResponseV2Schema.safeParse(ok).success).toBe(true);
  });

  it('rejects a materiality.epsilon other than 1e-8', () => {
    const bad = makeValidV2();
    // @ts-expect-error literal epsilon only
    bad.materiality.epsilon = 1e-6;
    expect(FundMoicRankingsResponseV2Schema.safeParse(bad).success).toBe(false);
  });

  it('rejects a materiality.status outside the enum', () => {
    const bad = makeValidV2();
    // @ts-expect-error enum only
    bad.materiality.status = 'on';
    expect(FundMoicRankingsResponseV2Schema.safeParse(bad).success).toBe(false);
  });

  it('accepts materiality.status === recorded', () => {
    const ok = makeValidV2();
    ok.materiality.status = 'recorded';
    expect(FundMoicRankingsResponseV2Schema.safeParse(ok).success).toBe(true);
  });

  it('accepts materiality.status === stale', () => {
    const ok = makeValidV2();
    ok.materiality.status = 'stale';
    expect(FundMoicRankingsResponseV2Schema.safeParse(ok).success).toBe(true);
  });

  it('accepts a null runId/createdAt inside a present latestReconciliation', () => {
    const ok = makeValidV2();
    ok.latestReconciliation = {
      runId: null,
      createdAt: null,
      currentInputMatches: false,
      sourceFingerprintMatches: false,
    };
    expect(FundMoicRankingsResponseV2Schema.safeParse(ok).success).toBe(true);
  });

  it('rejects unknown mode enums and accepts known activation blockers', () => {
    const ok = makeValidV2();
    ok.modePreview.configuredMode = 'shadow';
    ok.modePreview.effectiveMode = 'shadow';
    ok.modePreview.residencyStatus = 'pending';
    ok.modePreview.blockers = ['shadow_residency_pending', 'exit_probability_source_incomplete'];
    expect(FundMoicRankingsResponseV2Schema.safeParse(ok).success).toBe(true);

    const bad = makeValidV2();
    // @ts-expect-error enum only
    bad.modePreview.effectiveMode = 'candidate';
    expect(FundMoicRankingsResponseV2Schema.safeParse(bad).success).toBe(false);
  });
});

describe('FundMoicRankingsResponseV2 contract - latest reconciliation freshness', () => {
  it('accepts currentInputMatches and sourceFingerprintMatches together', () => {
    const payload = makeValidV2();
    payload.latestReconciliation = {
      runId: 'run-1',
      createdAt: '2026-06-24T00:00:00.000Z',
      currentInputMatches: true,
      sourceFingerprintMatches: true,
    };

    expect(FundMoicRankingsResponseV2Schema.safeParse(payload).success).toBe(true);
  });

  it('requires sourceFingerprintMatches on a present latestReconciliation', () => {
    const payload = makeValidV2();
    payload.latestReconciliation = {
      runId: 'run-1',
      createdAt: '2026-06-24T00:00:00.000Z',
      currentInputMatches: true,
    };

    expect(FundMoicRankingsResponseV2Schema.safeParse(payload).success).toBe(false);
  });

  it('still requires currentInputMatches on a present latestReconciliation', () => {
    const payload = makeValidV2();
    payload.latestReconciliation = {
      runId: 'run-1',
      createdAt: '2026-06-24T00:00:00.000Z',
      sourceFingerprintMatches: true,
    };

    expect(FundMoicRankingsResponseV2Schema.safeParse(payload).success).toBe(false);
  });
});
