import { describe, expect, it } from 'vitest';

import {
  FundMoicRankingsResponseV2Schema,
  type FundMoicRankingsResponseV2,
} from '../../../shared/contracts/fund-moic-v2.contract';

/**
 * Structural allowlist tests for the V2 read contract.
 *
 * PR-E's whole point is that the V2 surface leaks NO ranking values, monetary
 * amounts, raw diffs, or per-investment shadow comparisons. A test that only
 * checks "a valid payload parses" is vacuous against that goal. So every object
 * here is pinned to an EXACT allowed key set, and `.strict()` is proven to
 * reject an injected forbidden field on each nested object.
 */

const makeValidV2 = (): FundMoicRankingsResponseV2 => ({
  contractVersion: '2.0.0',
  fundId: 7,
  rankings: [
    {
      rank: 1,
      investmentId: 'inv-a',
      investmentName: 'Acme',
      reservesMoic: { value: 1.5, description: 'desc', formula: 'formula' },
    },
  ],
  provenance: { mode: 'legacy', warnings: [] },
  latestReconciliation: null,
  materiality: { status: 'not_run', candidateMaterial: false, epsilon: 1e-8 },
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
    payload.latestReconciliation = { runId: 'run-1', createdAt: '2026-06-24T00:00:00.000Z' };
    const parsed = FundMoicRankingsResponseV2Schema.parse(payload);
    expect(parsed.latestReconciliation).not.toBeNull();
    expect(Object.keys(parsed.latestReconciliation ?? {}).sort()).toEqual(
      ['createdAt', 'runId'].sort()
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

  it('rejects a forbidden field on latestReconciliation', () => {
    const bad = makeValidV2();
    bad.latestReconciliation = {
      runId: 'run-1',
      createdAt: '2026-06-24T00:00:00.000Z',
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
  it('rejects a contractVersion other than 2.0.0', () => {
    const bad = { ...makeValidV2(), contractVersion: '1.0.0' };
    expect(FundMoicRankingsResponseV2Schema.safeParse(bad).success).toBe(false);
  });

  it('rejects provenance.mode other than legacy', () => {
    const bad = makeValidV2();
    // @ts-expect-error narrowing literal
    bad.provenance.mode = 'on';
    expect(FundMoicRankingsResponseV2Schema.safeParse(bad).success).toBe(false);
  });

  it('rejects materiality.candidateMaterial === true (PR-E candidate is a no-op)', () => {
    const bad = makeValidV2();
    // @ts-expect-error literal false only
    bad.materiality.candidateMaterial = true;
    expect(FundMoicRankingsResponseV2Schema.safeParse(bad).success).toBe(false);
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

  it('accepts a null runId/createdAt inside a present latestReconciliation', () => {
    const ok = makeValidV2();
    ok.latestReconciliation = { runId: null, createdAt: null };
    expect(FundMoicRankingsResponseV2Schema.safeParse(ok).success).toBe(true);
  });
});
