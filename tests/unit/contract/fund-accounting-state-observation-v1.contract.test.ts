import { describe, expect, it } from 'vitest';

import {
  FUND_ACCOUNTING_STATE_OBSERVATION_VERSION,
  FundAccountingStateObservationV1Schema,
  FundAccountingStateSnapshotRefV1Schema,
  type FundAccountingStateObservationV1,
} from '../../../shared/contracts/internal-economics/fund-accounting-state-observation-v1.contract';

const validObservation = {
  contractVersion: FUND_ACCOUNTING_STATE_OBSERVATION_VERSION,
  cutoverInstant: '2026-06-30T23:59:59.000Z',
  currency: 'USD',
  cashBalanceUsd: '1250000.000000',
  cumulativeLpPaidInUsd: '10000000.000000',
  cumulativeGpPaidInUsd: '250000.000000',
  lpUnreturnedContributedCapitalUsd: '6500000.000000',
  gpUnreturnedContributedCapitalUsd: '150000.000000',
  lpDistributionsReturnOfCapitalUsd: '3500000.000000',
  lpDistributionsProfitUsd: '875000.000000',
  actualLpDistributionsCumulativeUsd: '4375000.000000',
  gpInvestmentDistributionsPaidUsd: '125000.000000',
  gpCarryPaidUsd: '200000.000000',
  accruedPreferredReturnUsd: '325000.000000',
  accruedPreferredReturnThroughInstant: '2026-06-30T23:59:59.000Z',
  recallableDistributionsCumulativeUsd: '600000.000000',
  recallableDistributionsOutstandingUsd: '400000.000000',
  recycledProceedsCumulativeUsd: '250000.000000',
  realizedProceedsCumulativeUsd: '5000000.000000',
  methodologyVersion: 'fund-accounting-methodology/1.0.0',
} satisfies FundAccountingStateObservationV1;

describe('FundAccountingStateObservationV1Schema', () => {
  it('parses a canonical opening accounting state observation', () => {
    expect(FundAccountingStateObservationV1Schema.parse(validObservation)).toEqual(
      validObservation
    );
  });

  it.each([
    ['negative money', { cashBalanceUsd: '-0.000001' }],
    ['signed zero money', { cashBalanceUsd: '-0.000000' }],
    ['non-USD currency', { currency: 'EUR' }],
    ['non-canonical decimal', { cashBalanceUsd: '1250000.00' }],
  ])('rejects %s', (_label, override) => {
    expect(
      FundAccountingStateObservationV1Schema.safeParse({
        ...validObservation,
        ...override,
      }).success
    ).toBe(false);
  });

  it('rejects malformed money without throwing from safeParse', () => {
    expect(() =>
      FundAccountingStateObservationV1Schema.safeParse({
        ...validObservation,
        cashBalanceUsd: 'not-money',
      })
    ).not.toThrow();
    expect(
      FundAccountingStateObservationV1Schema.safeParse({
        ...validObservation,
        cashBalanceUsd: 'not-money',
      }).success
    ).toBe(false);
  });

  it('rejects an LP distribution total that differs from return of capital plus profit', () => {
    expect(
      FundAccountingStateObservationV1Schema.safeParse({
        ...validObservation,
        actualLpDistributionsCumulativeUsd: '4375000.000001',
      }).success
    ).toBe(false);
  });

  it('rejects recallable distributions outstanding above cumulative recallable distributions', () => {
    expect(
      FundAccountingStateObservationV1Schema.safeParse({
        ...validObservation,
        recallableDistributionsOutstandingUsd: '600000.000001',
      }).success
    ).toBe(false);
  });

  it('accepts equivalent RFC3339 representations of the accrued-through and cutover instant', () => {
    expect(
      FundAccountingStateObservationV1Schema.safeParse({
        ...validObservation,
        accruedPreferredReturnThroughInstant: '2026-06-30T23:59:59Z',
      }).success
    ).toBe(true);
  });

  it('rejects a genuinely different accrued-through instant from the cutover instant', () => {
    expect(
      FundAccountingStateObservationV1Schema.safeParse({
        ...validObservation,
        accruedPreferredReturnThroughInstant: '2026-06-30T23:59:58.000Z',
      }).success
    ).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(
      FundAccountingStateObservationV1Schema.safeParse({
        ...validObservation,
        undocumentedBalanceUsd: '0.000000',
      }).success
    ).toBe(false);
  });
});

describe('FundAccountingStateSnapshotRefV1Schema', () => {
  it('pins artifact identity, attestation, accrued state, and the full observation', () => {
    const snapshotRef = {
      sourceArtifactId: 42,
      sourceArtifactSha256: 'a'.repeat(64),
      sourceArtifactCreatedAt: '2026-06-30T20:15:00.000Z',
      attestedByActorId: 7,
      observation: validObservation,
    };

    expect(FundAccountingStateSnapshotRefV1Schema.parse(snapshotRef)).toEqual(snapshotRef);
    expect(snapshotRef.observation.accruedPreferredReturnUsd).toBe('325000.000000');
    expect(snapshotRef.observation.accruedPreferredReturnThroughInstant).toBe(
      snapshotRef.observation.cutoverInstant
    );
  });

  it('rejects unknown reference keys', () => {
    expect(
      FundAccountingStateSnapshotRefV1Schema.safeParse({
        sourceArtifactId: 42,
        sourceArtifactSha256: 'a'.repeat(64),
        sourceArtifactCreatedAt: '2026-06-30T20:15:00.000Z',
        attestedByActorId: 7,
        observation: validObservation,
        copiedObservation: validObservation,
      }).success
    ).toBe(false);
  });
});
