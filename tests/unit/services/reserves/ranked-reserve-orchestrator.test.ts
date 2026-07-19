import { describe, expect, it } from 'vitest';

import {
  ReserveEnvelopeV1Schema,
  type ReserveEnvelopeV1,
} from '../../../../shared/contracts/reserve-envelope-v1.contract';
import { ReserveInputSchema } from '../../../../shared/schemas';
import { ConfidenceLevel, ReserveSummarySchema } from '../../../../shared/types';
import {
  buildRankedShadowTelemetry,
  composeRankedReserveAllocation,
  foldMarginalCandidateStatus,
  toReserveSummary,
  type ComposeRankedReserveInput,
  type RankedReserveAllocationResult,
  type RankedReserveCandidate,
} from '../../../../server/services/reserves/ranked-reserve-orchestrator';

const FUND_ID = 1;
const AS_OF = '2026-07-19';
const ENVELOPE_HASH = 'a'.repeat(64);
const FACTS_HASH = 'b'.repeat(64);
const ASSUMPTIONS_HASH = 'c'.repeat(64);

function baseEnvelope(overrides: Partial<ReserveEnvelopeV1> = {}): ReserveEnvelopeV1 {
  return ReserveEnvelopeV1Schema.parse({
    contractVersion: 'reserve-envelope-v1',
    fundId: FUND_ID,
    asOfDate: AS_OF,
    baseCurrency: 'USD',
    availableReservesCents: 100_00,
    components: {
      committedCapital: {
        amountCents: 100_00,
        status: 'observed',
        source: 'test.committed',
        reason: null,
      },
      deployedCapital: {
        amountCents: 0,
        status: 'observed',
        source: 'test.deployed',
        reason: null,
      },
      managementFees: {
        amountCents: 0,
        status: 'derived',
        source: 'test.fees',
        reason: null,
      },
      fundExpenses: {
        amountCents: 0,
        status: 'derived',
        source: 'test.expenses',
        reason: null,
      },
      exitRecycling: {
        amountCents: 0,
        status: 'derived',
        source: 'test.recycling',
        reason: null,
      },
    },
    trustedForActivation: true,
    blocked: false,
    blockReason: null,
    inputHash: ENVELOPE_HASH,
    ...overrides,
  });
}

function baseCandidate(overrides: Partial<RankedReserveCandidate> = {}): RankedReserveCandidate {
  return {
    companyId: 1,
    name: 'Alpha',
    canonicalStage: 'seed',
    invested: 10,
    ownership: 0.1,
    status: 'actionable',
    marginalMoic: '2',
    ...overrides,
  };
}

function baseComposeInput(
  overrides: Partial<ComposeRankedReserveInput> = {}
): ComposeRankedReserveInput {
  return {
    envelope: baseEnvelope(),
    candidates: [baseCandidate()],
    factsInputHash: FACTS_HASH,
    assumptionsHash: ASSUMPTIONS_HASH,
    ...overrides,
  };
}

function build(overrides: Partial<ComposeRankedReserveInput> = {}): RankedReserveAllocationResult {
  return composeRankedReserveAllocation(baseComposeInput(overrides));
}

describe('foldMarginalCandidateStatus', () => {
  it.each([
    ['actionable', 'actionable', 'actionable'],
    ['actionable', 'indicative', 'indicative'],
    ['indicative', 'actionable', 'indicative'],
    ['indicative', 'indicative', 'indicative'],
    ['unavailable', 'actionable', 'unavailable'],
    ['unavailable', 'indicative', 'unavailable'],
  ] as const)('%s + %s -> %s', (resultStatus, readinessStatus, expected) => {
    expect(foldMarginalCandidateStatus(resultStatus, readinessStatus)).toBe(expected);
  });
});

describe('composeRankedReserveAllocation', () => {
  it("enforces Program B's order when the allocator's intrinsic stage score disagrees", () => {
    const result = build({
      candidates: [
        baseCandidate({ companyId: 1, name: 'Zulu', canonicalStage: 'seed', marginalMoic: '2' }),
        baseCandidate({
          companyId: 2,
          name: 'Alpha',
          canonicalStage: 'series_d',
          marginalMoic: '1',
        }),
      ],
      constraints: { maxPerCompany: 60 },
    });
    expect(() =>
      ReserveInputSchema.parse({
        availableReserves: 100,
        companies: [
          { id: '1', name: 'Zulu', stage: 'seed', invested: 10, ownership: 0.1 },
          { id: '2', name: 'Alpha', stage: 'series_dplus', invested: 10, ownership: 0.1 },
        ],
        stagePolicies: [
          { stage: 'seed', reserveMultiple: 1, weight: 1 },
          { stage: 'series_dplus', reserveMultiple: 1, weight: 1 },
        ],
        constraints: { maxPerCompany: 60 },
        scoreOverride: { '1': 2, '2': 1 },
      })
    ).not.toThrow();
    // B ranks seed first: $100 available -> Zulu capped at $60, then Alpha receives $40.
    expect(result.allocations[0]?.companyId).toBe(1);
    expect(result.allocations[0]?.allocated).toBe(60);
    expect(result.allocations[1]?.companyId).toBe(2);
    expect(result.allocations[1]?.allocated).toBe(40);
    expect(result.totalAllocated).toBe(100);
  });

  it('preserves cent-exact conservation across allocation and remaining reserves', () => {
    const result = build({ constraints: { maxPerCompany: 33.33 } });
    // $100.00 available - $33.33 allocated = $66.67 remaining.
    expect(result.totalAllocated).toBe(33.33);
    expect(result.remaining).toBe(66.67);
    expect(result.conservationOk).toBe(true);
    expect(Math.round((result.totalAllocated + result.remaining) * 100)).toBe(100_00);
  });

  it('excludes and discloses an unavailable candidate', () => {
    const result = build({
      candidates: [
        baseCandidate({ status: 'unavailable', marginalMoic: null }),
        baseCandidate({ companyId: 2, name: 'Beta' }),
      ],
    });
    expect(result.excluded).toContainEqual({ companyId: 1, reason: 'unavailable' });
    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0]?.companyId).toBe(2);
  });

  it('excludes and discloses a result-tier indicative candidate', () => {
    const result = build({
      candidates: [
        baseCandidate({ status: 'indicative', marginalMoic: '100.1' }),
        baseCandidate({ companyId: 2, name: 'Beta' }),
      ],
    });
    expect(result.excluded).toContainEqual({ companyId: 1, reason: 'indicative' });
    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0]?.companyId).toBe(2);
  });

  it('fails safe before allocation when the envelope is blocked', () => {
    const result = build({
      envelope: baseEnvelope({ blocked: true, blockReason: 'blocked for test' }),
    });
    expect(result.failSafe).toBe(true);
    expect(result.failSafeReason).toBe('envelope_blocked');
    expect(result.allocations).toHaveLength(0);
    expect(result.totalAllocated).toBe(0);
    expect(result.conservationOk).toBe(true);
  });

  it('fails safe before allocation when the envelope is not trusted for activation', () => {
    const result = build({ envelope: baseEnvelope({ trustedForActivation: false }) });
    expect(result.failSafe).toBe(true);
    expect(result.failSafeReason).toBe('envelope_untrusted');
    expect(result.allocations).toHaveLength(0);
    expect(result.totalAllocated).toBe(0);
  });

  it('fails safe when partitioning leaves no actionable candidates', () => {
    const result = build({
      candidates: [baseCandidate({ status: 'unavailable', marginalMoic: null })],
    });
    expect(result.failSafe).toBe(true);
    expect(result.failSafeReason).toBe('no_actionable_candidates');
    expect(result.excluded).toEqual([{ companyId: 1, reason: 'unavailable' }]);
  });

  it('fails safe on a composition or engine throw without leaking a partial allocation', () => {
    const result = build({ constraints: { maxPerCompany: -1 } });
    expect(result.failSafe).toBe(true);
    expect(result.failSafeReason).toBe('engine_error');
    expect(result.allocations).toHaveLength(0);
    expect(result.totalAllocated).toBe(0);
    expect(result.conservationOk).toBe(true);
  });

  it('ranks decimal values numerically when lexicographic string order disagrees', () => {
    const result = build({
      candidates: [
        baseCandidate({ companyId: 1, name: 'Lexical Winner', marginalMoic: '9.5' }),
        baseCandidate({ companyId: 2, name: 'Numeric Winner', marginalMoic: '100.0' }),
      ],
      constraints: { maxPerCompany: 60 },
    });
    // Numeric descending order: 100.0 receives $60 first; 9.5 receives the remaining $40.
    expect(result.allocations[0]?.companyId).toBe(2);
    expect(result.allocations[0]?.rank).toBe(1);
    expect(result.allocations[0]?.allocated).toBe(60);
    expect(result.allocations[1]?.allocated).toBe(40);
  });

  it('keeps near-identical decimal MOIC values distinct beyond Number precision', () => {
    const result = build({
      candidates: [
        baseCandidate({
          companyId: 1,
          name: 'Alpha',
          marginalMoic: '1.0000000000000000000000000000001',
        }),
        baseCandidate({
          companyId: 2,
          name: 'Zulu',
          marginalMoic: '1.0000000000000000000000000000002',
        }),
      ],
      constraints: { maxPerCompany: 60 },
    });
    expect(result.allocations[0]?.companyId).toBe(2);
    expect(result.allocations[0]?.rank).toBe(1);
    expect(result.allocations[1]?.companyId).toBe(1);
    expect(result.allocations[1]?.rank).toBe(2);
  });

  it('uses one explicit string key bridge for both companies and score overrides', () => {
    const composeSource = composeRankedReserveAllocation.toString();
    expect(composeSource).toMatch(/companyKey = String\(candidate\.companyId\)/);
    expect(composeSource).toMatch(/id: companyKey/);
    expect(composeSource).toMatch(/scoreOverride\[companyKey\]/);
  });

  it('lands the score override when numeric company identity crosses the string-key boundary', () => {
    const result = build({
      candidates: [
        baseCandidate({ companyId: 41, name: 'Zulu', canonicalStage: 'seed', marginalMoic: '2' }),
        baseCandidate({
          companyId: 42,
          name: 'Alpha',
          canonicalStage: 'series_d',
          marginalMoic: '1',
        }),
      ],
      constraints: { maxPerCompany: 60 },
    });
    // Intrinsic stage scoring favors series_dplus; the landed override instead gives seed $60 first.
    expect(result.allocations[0]?.id).toBe('41');
    expect(result.allocations[0]?.allocated).toBe(60);
    expect(result.allocations[1]?.id).toBe('42');
    expect(result.allocations[1]?.allocated).toBe(40);
  });

  it('dedupes canonical late stages after all collapse into legacy series_dplus', () => {
    const result = build({
      candidates: [
        baseCandidate({ companyId: 1, canonicalStage: 'series_d', marginalMoic: '3' }),
        baseCandidate({ companyId: 2, canonicalStage: 'growth', marginalMoic: '2' }),
        baseCandidate({ companyId: 3, canonicalStage: 'late_stage', marginalMoic: '1' }),
      ],
      constraints: { maxPerCompany: 40 },
    });
    expect(result.failSafe).toBe(false);
    expect(result.neutralPolicies).toEqual([
      { stage: 'series_dplus', reserveMultiple: 1, weight: 1 },
    ]);
    expect(result.allocations[0]?.stage).toBe('series_dplus');
  });

  it('maps canonical pre_seed to legacy preseed without a missing-policy throw', () => {
    const result = build({ candidates: [baseCandidate({ canonicalStage: 'pre_seed' })] });
    expect(result.failSafe).toBe(false);
    expect(result.neutralPolicies[0]?.stage).toBe('preseed');
    expect(result.allocations[0]?.stage).toBe('preseed');
  });

  it('treats a null MOIC on an actionable candidate as unavailable', () => {
    const result = build({ candidates: [baseCandidate({ marginalMoic: null })] });
    expect(result.failSafe).toBe(true);
    expect(result.failSafeReason).toBe('no_actionable_candidates');
    expect(result.excluded).toEqual([{ companyId: 1, reason: 'unavailable' }]);
  });
});

describe('toReserveSummary', () => {
  it('maps the rich allocation into the validated summary provenance-confidence convention', () => {
    const envelope = baseEnvelope();
    const composed = build({
      candidates: [
        baseCandidate({ companyId: 1, marginalMoic: '2' }),
        baseCandidate({ companyId: 2, name: 'Beta', marginalMoic: '1' }),
      ],
      constraints: { maxPerCompany: 60 },
    });
    const summary = toReserveSummary(envelope, composed);
    expect(() => ReserveSummarySchema.parse(summary)).not.toThrow();
    expect(summary.fundId).toBe(FUND_ID);
    expect(summary.totalAllocation).toBe(100);
    expect(summary.allocations[0]?.allocation).toBe(60);
    expect(summary.allocations[0]?.confidence).toBe(ConfidenceLevel.MEDIUM);
    expect(summary.allocations[0]?.rationale).toContain('marginal-MOIC rank 1 of 2');
    expect(summary.avgConfidence).toBe(ConfidenceLevel.MEDIUM);
    expect(summary.highConfidenceCount).toBe(2);
    expect(summary.generatedAt).toBeInstanceOf(Date);

    const untrustedSummary = toReserveSummary(
      baseEnvelope({ trustedForActivation: false }),
      composed
    );
    expect(untrustedSummary.allocations[0]?.confidence).toBe(0.65);
    expect(untrustedSummary.highConfidenceCount).toBe(0);
  });
});

describe('buildRankedShadowTelemetry', () => {
  it('reports a cent delta and detects a known cap-driven realized-order reshuffle', () => {
    const composed = build({
      candidates: [
        baseCandidate({ companyId: 1, marginalMoic: '2' }),
        baseCandidate({ companyId: 2, name: 'Beta', marginalMoic: '1' }),
      ],
      constraints: { maxPerCompany: 60 },
    });
    const reshuffled: RankedReserveAllocationResult = {
      ...composed,
      allocations: [
        { ...composed.allocations[0]!, allocated: 30 },
        { ...composed.allocations[1]!, allocated: 70 },
      ],
      totalAllocated: 100,
      excluded: [
        { companyId: 3, reason: 'unavailable' },
        { companyId: 4, reason: 'indicative' },
      ],
    };
    const legacy = ReserveSummarySchema.parse({
      fundId: FUND_ID,
      totalAllocation: 90,
      avgConfidence: 0,
      highConfidenceCount: 0,
      allocations: [],
      generatedAt: new Date('2026-07-19T00:00:00.000Z'),
    });
    const telemetry = buildRankedShadowTelemetry(legacy, reshuffled);
    // $100 composed - $90 legacy = $10 = 1,000 cents; realized $70/$30 reverses B rank.
    expect(telemetry.totalAllocationDeltaCents).toBe(10_00);
    expect(telemetry.rankAgreement).toBe(false);
    expect(telemetry.excludedCountsByReason.unavailable).toBe(1);
    expect(telemetry.excludedCountsByReason.indicative).toBe(1);
    expect(telemetry.envelopeInputHash).toBe(ENVELOPE_HASH);
    expect(telemetry.factsInputHash).toBe(FACTS_HASH);
    expect(telemetry.assumptionsHash).toBe(ASSUMPTIONS_HASH);
  });
});
