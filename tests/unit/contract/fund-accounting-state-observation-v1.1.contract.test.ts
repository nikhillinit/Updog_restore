import { describe, expect, it } from 'vitest';

import {
  FUND_ACCOUNTING_STATE_OBSERVATION_VERSION,
  FundAccountingStateSnapshotRefV1Schema,
  type FundAccountingStateObservationV1,
} from '../../../shared/contracts/internal-economics/fund-accounting-state-observation-v1.contract';
import {
  FUND_ACCOUNTING_STATE_OBSERVATION_VERSION_1_1_0,
  FundAccountingStateObservationV1_1Schema,
} from '../../../shared/contracts/internal-economics/fund-accounting-state-observation-v1.1.contract';

const foundingV1Observation = {
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

const { lpUnreturnedContributedCapitalUsd: _removedFromV1_1, ...foundingV1_1Payload } =
  foundingV1Observation;

const validV1_1Payload = {
  ...foundingV1_1Payload,
  contractVersion: FUND_ACCOUNTING_STATE_OBSERVATION_VERSION_1_1_0,
};

describe('FundAccountingStateObservationV1_1Schema', () => {
  it('pins the v1.1 version and derives unreturned LP capital from paid-in minus ROC', () => {
    expect(FUND_ACCOUNTING_STATE_OBSERVATION_VERSION_1_1_0).toBe(
      'fund-accounting-state-observation/1.1.0'
    );

    const parsed = FundAccountingStateObservationV1_1Schema.parse(validV1_1Payload);

    expect(parsed.lpUnreturnedContributedCapitalUsd).toBe('6500000.000000');
  });

  it.each([
    ['LP distribution sum identity', { actualLpDistributionsCumulativeUsd: '4375000.000001' }],
    ['recallable distribution bound', { recallableDistributionsOutstandingUsd: '600000.000001' }],
    [
      'accrued preferred return instant identity',
      { accruedPreferredReturnThroughInstant: '2026-06-30T23:59:58.000Z' },
    ],
  ])('carries the v1 %s', (_identity, override) => {
    expect(
      FundAccountingStateObservationV1_1Schema.safeParse({
        ...validV1_1Payload,
        ...override,
      }).success
    ).toBe(false);
  });

  it('rejects a negative derived unreturned LP capital value', () => {
    expect(
      FundAccountingStateObservationV1_1Schema.safeParse({
        ...validV1_1Payload,
        cumulativeLpPaidInUsd: '3499999.999999',
      }).success
    ).toBe(false);
  });

  it('rejects the removed human-attested unreturned LP capital field', () => {
    expect(
      FundAccountingStateObservationV1_1Schema.safeParse({
        ...validV1_1Payload,
        lpUnreturnedContributedCapitalUsd: '6500000.000000',
      }).success
    ).toBe(false);
  });

  it('pins the founding v1 fixture to the exact paid-in minus ROC identity', () => {
    const parsed = FundAccountingStateObservationV1_1Schema.parse({
      ...foundingV1_1Payload,
      contractVersion: FUND_ACCOUNTING_STATE_OBSERVATION_VERSION_1_1_0,
    });

    expect(parsed.lpUnreturnedContributedCapitalUsd).toBe('6500000.000000');
  });
});

describe('v1 compatibility', () => {
  it('continues to parse a stored v1 artifact fixture under the frozen v1 schema', () => {
    const storedV1Artifact = {
      sourceArtifactId: 42,
      sourceArtifactSha256: 'a'.repeat(64),
      sourceArtifactCreatedAt: '2026-06-30T20:15:00.000Z',
      attestedByActorId: 7,
      observation: foundingV1Observation,
    };

    expect(FundAccountingStateSnapshotRefV1Schema.parse(storedV1Artifact)).toEqual(
      storedV1Artifact
    );
  });
});
