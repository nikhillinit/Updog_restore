import { Decimal } from '../../shared/lib/decimal-config';
import type { InternalEconomicsInputV2Wire } from '../../shared/contracts/internal-economics/internal-economics-input-v2.contract';
import { INTERNAL_ECONOMICS_COMPOSITE_V2_1_VERSION } from '../../shared/contracts/internal-economics/internal-economics-input-v2.contract';

function money(n: number | string): string {
  return new Decimal(n).toFixed(6);
}

function ratio(n: number | string): string {
  return new Decimal(n).toFixed(12);
}

export function buildMinimalV2Input(
  overrides?: Partial<InternalEconomicsInputV2Wire>
): InternalEconomicsInputV2Wire {
  const base: InternalEconomicsInputV2Wire = {
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
              rate: {
                rate: ratio('0'),
                basis: 'committed_capital',
              },
            },
          ],
          feeRecyclingEnabled: false,
          exitRecyclingEnabled: false,
        },
      },
    ],
    partners: [
      {
        partnerId: 'lp-1',
        name: 'LP One',
        isGp: false,
        lpClassId: 'class-a',
        committedCapital: money(1_000_000),
        settledCash: money(500_000),
        remainingCallableCommitment: money(500_000),
      },
      {
        partnerId: 'gp-1',
        name: 'GP One',
        isGp: true,
        committedCapital: money(100_000),
        settledCash: money(50_000),
        remainingCallableCommitment: money(50_000),
      },
    ],
    waterfallPolicy: [
      { kind: 'return_of_capital', priority: 1 },
      {
        kind: 'preferred_return',
        priority: 2,
        basis: 'unreturned_settled_cash_capital',
        annualRate: ratio('0.08'),
        rateMode: 'simple',
      },
      { kind: 'carry', priority: 3, gpShare: ratio('0.20') },
    ],
    selectedLane: 'deal_by_deal',
    gpCashPreferredReturnTreatment: 'pari_passu',
    openingState: {
      openingCash: money(550_000),
      openingCashClassification: {
        paidIn: money(550_000),
        recycling: money(0),
        unclassified: money(0),
      },
      openingProvenance: {
        cashLots: [
          {
            lotId: 'opening-cash:gp-1',
            sourceRef: 'opening-ledger:gp-1',
            owner: { kind: 'gp', partnerId: 'gp-1' },
            classification: 'paid_in',
            originalAmount: money(50_000),
            remainingBalance: money(50_000),
          },
          {
            lotId: 'opening-cash:lp-1',
            sourceRef: 'opening-ledger:lp-1',
            owner: { kind: 'lp', partnerId: 'lp-1', lpClassId: 'class-a' },
            classification: 'paid_in',
            originalAmount: money(500_000),
            remainingBalance: money(500_000),
          },
        ],
        investmentLots: [],
        entitlementPools: [],
      },
      openingCommitments: money(1_100_000),
      investorLedgers: [
        {
          partnerId: 'lp-1',
          committedCapital: money(1_000_000),
          calledCapital: money(500_000),
          settledCapital: money(500_000),
          paidInCapital: money(500_000),
          unreturnedSettledCashCapital: money(500_000),
          cumulativeDistributions: money(0),
          cumulativeFees: money(0),
          accruedPreference: money(0),
        },
        {
          partnerId: 'gp-1',
          committedCapital: money(100_000),
          calledCapital: money(50_000),
          settledCapital: money(50_000),
          paidInCapital: money(50_000),
          unreturnedSettledCashCapital: money(50_000),
          cumulativeDistributions: money(0),
          cumulativeFees: money(0),
          accruedPreference: money(0),
        },
      ],
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
    events: [],
  };
  return { ...base, ...overrides };
}
