import { describe, it, expect } from 'vitest';
import { Decimal } from '../../../../shared/lib/decimal-config';
import { certifyInternalEconomicsDualLaneV2 } from '../../../../shared/lib/internal-economics/v2/derive-composite-v2';
import { INTERNAL_ECONOMICS_COMPOSITE_V2_1_VERSION } from '../../../../shared/contracts/internal-economics/internal-economics-input-v2.contract';

function money(n: number): string {
  return new Decimal(n).toFixed(6);
}

function ratio(n: number): string {
  return new Decimal(n).toFixed(12);
}

function buildWorstCaseInput(partnerCount: number, dealsPerPartner: number) {
  const partners = [];
  const investorLedgers = [];
  for (let i = 0; i < partnerCount; i++) {
    const isGp = i === 0;
    const id = isGp ? 'gp-0' : `lp-${i}`;
    const committed = isGp ? 10000 : 100000;
    const settled = committed / 2;
    partners.push({
      partnerId: id,
      name: `Partner ${i}`,
      isGp,
      ...(isGp ? {} : { lpClassId: 'class-a' }),
      committedCapital: money(committed),
      settledCash: money(settled),
      remainingCallableCommitment: money(committed - settled),
    });
    investorLedgers.push({
      partnerId: id,
      committedCapital: money(committed),
      calledCapital: money(settled),
      settledCapital: money(settled),
      paidInCapital: money(settled),
      unreturnedSettledCashCapital: money(settled),
      cumulativeDistributions: money(0),
      cumulativeFees: money(0),
      accruedPreference: money(0),
    });
  }

  const events = [];
  let eventIdx = 0;
  for (let d = 0; d < dealsPerPartner; d++) {
    const contribAmount = 10000;
    const deployAmount = 10000;
    const realAmount = 15000;

    events.push({
      eventId: `c-${eventIdx}`,
      instant: '2025-02-01T00:00:00Z',
      amountUsd: money(contribAmount),
      kind: 'settled_contribution',
      partnerId: 'lp-1',
      purpose: 'deployment',
      settlementSourceRef: `ref-${eventIdx}`,
    });

    events.push({
      eventId: `d-${eventIdx}`,
      instant: '2025-03-01T00:00:00Z',
      amountUsd: money(deployAmount),
      kind: 'deployment',
      dealId: `deal-${d}`,
      securityId: `sec-${d}`,
      cashSourceAllocations: [{ lotId: `csl:c-${eventIdx}`, amount: money(deployAmount) }],
    });

    events.push({
      eventId: `r-${eventIdx}`,
      instant: '2025-04-01T00:00:00Z',
      amountUsd: money(realAmount),
      kind: 'realization',
      dealId: `deal-${d}`,
      reliefRows: [
        {
          investmentLotId: `inv:deal-${d}:sec-${d}:d-${eventIdx}`,
          relievedCostBasis: money(deployAmount),
          allocatedProceeds: money(realAmount),
        },
      ],
      recyclingTag: 'none',
    });

    eventIdx++;
  }

  const totalSettled = partners.reduce((sum, p) => sum + parseFloat(p.settledCash), 0);
  const cashLots = partners.map((partner) => ({
    lotId: `opening-cash:${partner.partnerId}`,
    sourceRef: `opening-ledger:${partner.partnerId}`,
    owner: partner.isGp
      ? ({ kind: 'gp', partnerId: partner.partnerId } as const)
      : ({ kind: 'lp', partnerId: partner.partnerId, lpClassId: 'class-a' } as const),
    classification: 'paid_in' as const,
    originalAmount: partner.settledCash,
    remainingBalance: partner.settledCash,
  }));

  return {
    contractVersion: INTERNAL_ECONOMICS_COMPOSITE_V2_1_VERSION,
    currency: 'USD',
    calculationDate: '2025-06-30T00:00:00Z',
    cutoverInstant: '2025-01-01T00:00:00Z',
    roundingMode: 'half_up',
    fundEstablishmentDate: '2024-01-01T00:00:00Z',
    investmentPeriodEndDate: '2028-01-01T00:00:00Z',
    fundTermDate: '2034-01-01T00:00:00Z',
    lpClasses: [
      {
        lpClassId: 'class-a',
        feeProfile: {
          managementFeeSchedule: [
            {
              periodStartDate: '2024-01-01T00:00:00Z',
              periodEndDate: '2025-06-30T00:00:00Z',
              rate: { rate: ratio(0), basis: 'committed_capital' },
            },
          ],
          feeRecyclingEnabled: false,
          exitRecyclingEnabled: false,
        },
      },
    ],
    partners,
    waterfallPolicy: [
      { kind: 'return_of_capital', priority: 1 },
      { kind: 'carry', priority: 2, gpShare: ratio(0.2) },
    ],
    selectedLane: 'deal_by_deal',
    gpCashPreferredReturnTreatment: 'pari_passu',
    openingState: {
      openingCash: money(totalSettled),
      openingCashClassification: {
        paidIn: money(totalSettled),
        recycling: money(0),
        unclassified: money(0),
      },
      openingProvenance: {
        cashLots,
        investmentLots: [],
        entitlementPools: [],
      },
      openingCommitments: money(partners.reduce((s, p) => s + parseFloat(p.committedCapital), 0)),
      investorLedgers,
      accruedPreferenceTotal: money(0),
      cumulativeDistributionsTotal: money(0),
      cumulativeFeesTotal: money(0),
      consumedFeeRecyclingCapacity: money(0),
      consumedExitRecyclingCapacity: money(0),
      profitDecomposition: {
        openingCumulativePreferredPaid: money(0),
        openingCumulativeGpProfitDistributions: money(0),
        openingCumulativeLpProfitDistributions: money(0),
      },
    },
    events,
  };
}

describe('V2 benchmark at admission limits', () => {
  it('dual-lane certification refuses with UNSUPPORTED_V2_WHOLE_FUND_CERTIFICATION', () => {
    const input = {
      ...buildWorstCaseInput(100, 500),
      selectedLane: 'whole_fund' as const,
      waterfallPolicy: [
        { kind: 'return_of_capital' as const, priority: 1 },
        { kind: 'carry' as const, priority: 2, gpShare: ratio(0.2) },
      ],
    };
    const result = certifyInternalEconomicsDualLaneV2(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('UNSUPPORTED_V2_WHOLE_FUND_CERTIFICATION');
    expect(result.refusal.stage).toBe('waterfall');
  });
});
