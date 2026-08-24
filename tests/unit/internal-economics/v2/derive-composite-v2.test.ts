import { describe, expect, it } from 'vitest';
import {
  certifyInternalEconomicsDualLaneV2,
  deriveInternalEconomicsV2,
} from '../../../../shared/lib/internal-economics/v2/derive-composite-v2';
import type {
  InternalEconomicsInputV2Wire,
  V2Event,
} from '../../../../shared/contracts/internal-economics/internal-economics-input-v2.contract';
import { buildMinimalV2Input } from '../../../helpers/v2-input-builder';

function derive(input: InternalEconomicsInputV2Wire = buildMinimalV2Input()) {
  return deriveInternalEconomicsV2(input);
}

const explicitEventRefusals: ReadonlyArray<readonly [V2Event, string]> = [
  [
    {
      eventId: 'correction-1',
      instant: '2025-02-01T00:00:00Z',
      amountUsd: '100.000000',
      kind: 'contribution_correction',
      correctsEventId: 'contribution-1',
    },
    'UNSUPPORTED_V2_CONTRIBUTION_CORRECTION',
  ],
  [
    {
      eventId: 'write-off-1',
      instant: '2025-02-01T00:00:00Z',
      amountUsd: '100.000000',
      kind: 'write_off',
      dealId: 'deal-1',
      reliefRows: [
        {
          investmentLotId: 'lot-1',
          relievedCostBasis: '100.000000',
          allocatedProceeds: '0.000000',
        },
      ],
    },
    'UNSUPPORTED_V2_WRITE_OFF',
  ],
  [
    {
      eventId: 'conversion-1',
      instant: '2025-02-01T00:00:00Z',
      amountUsd: '100.000000',
      kind: 'conversion',
      dealId: 'deal-1',
      reliefRows: [
        {
          investmentLotId: 'lot-1',
          relievedCostBasis: '100.000000',
          allocatedProceeds: '0.000000',
        },
      ],
      successorLot: {
        investmentLotId: 'lot-2',
        costBasis: '100.000000',
      },
    },
    'UNSUPPORTED_V2_CONVERSION',
  ],
];

const baseEvent: V2Event = {
  eventId: 'base-1',
  instant: '2025-02-01T00:00:00Z',
  amountUsd: '1.000000',
  kind: 'settled_contribution',
  partnerId: 'lp-1',
  purpose: 'deployment',
  settlementSourceRef: 'source-1',
};
const duplicateBaseEvent: V2Event = {
  ...baseEvent,
  instant: '2025-03-01T00:00:00Z',
  settlementSourceRef: 'source-2',
};
const equalizationEvent: V2Event = {
  eventId: 'equalization-1',
  instant: '2025-02-01T00:00:00Z',
  amountUsd: '1.000000',
  kind: 'equalization_principal',
};

function invalidateTierPolicy(input: InternalEconomicsInputV2Wire): void {
  input.waterfallPolicy = [{ kind: 'return_of_capital', priority: 1 }];
}

describe('deriveInternalEconomicsV2', () => {
  it.each(['deal_by_deal', 'whole_fund'] as const)(
    'returns base admission for fee-free %s input',
    (selectedLane) => {
      const result = derive(buildMinimalV2Input({ selectedLane }));

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.refusal.code).toBe('UNSUPPORTED_V2_BASE_EVENT');
      expect(result.refusal.stage).toBe('admission');
      expect('receipt' in result).toBe(false);
    }
  );

  it.each(explicitEventRefusals)('preserves explicit event refusal %#', (event, code) => {
    const result = derive(buildMinimalV2Input({ events: [event] }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe(code);
    expect(result.refusal.stage).toBe('admission');
  });

  it('lets exit-tagged realization reach base admission', () => {
    const result = derive(
      buildMinimalV2Input({
        events: [
          {
            eventId: 'realization-1',
            instant: '2025-02-01T00:00:00Z',
            amountUsd: '100.000000',
            kind: 'realization',
            dealId: 'deal-1',
            reliefRows: [
              {
                investmentLotId: 'lot-1',
                relievedCostBasis: '100.000000',
                allocatedProceeds: '100.000000',
              },
            ],
            recyclingTag: 'exit',
          },
        ],
      })
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('UNSUPPORTED_V2_BASE_EVENT');
    expect(result.refusal.stage).toBe('admission');
  });

  it('refuses any future nonzero management-fee entry before event admission', () => {
    const input = buildMinimalV2Input({ events: [explicitEventRefusals[0]![0]] });
    input.lpClasses[0]!.feeProfile.managementFeeSchedule = [
      {
        periodStartDate: '2027-01-01T00:00:00Z',
        periodEndDate: '2028-01-01T00:00:00Z',
        rate: { rate: '0.020000000000', basis: 'committed_capital' },
      },
    ];

    const result = derive(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('UNSUPPORTED_V2_MANAGEMENT_FEE');
    expect(result.refusal.stage).toBe('accrual');
    expect('receipt' in result).toBe(false);
  });

  it('finds a nonzero management fee in any LP class', () => {
    const input = buildMinimalV2Input();
    input.lpClasses.push({
      lpClassId: 'class-b',
      feeProfile: {
        managementFeeSchedule: [
          {
            periodStartDate: '2027-01-01T00:00:00Z',
            periodEndDate: '2028-01-01T00:00:00Z',
            rate: { rate: '0.010000000000', basis: 'invested_capital' },
          },
        ],
        feeRecyclingEnabled: true,
        exitRecyclingEnabled: true,
      },
    });

    const result = derive(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('UNSUPPORTED_V2_MANAGEMENT_FEE');
    expect(result.refusal.stage).toBe('accrual');
  });

  it('lets empty and all-zero management fees reach base admission', () => {
    for (const schedule of [
      [],
      [
        {
          periodStartDate: '2027-01-01T00:00:00Z',
          periodEndDate: '2028-01-01T00:00:00Z',
          rate: { rate: '0.000000000000', basis: 'committed_capital' as const },
        },
      ],
    ]) {
      const input = buildMinimalV2Input();
      input.lpClasses[0]!.feeProfile.managementFeeSchedule = schedule;

      const result = derive(input);

      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.refusal.code).toBe('UNSUPPORTED_V2_BASE_EVENT');
      expect(result.refusal.stage).toBe('admission');
    }
  });

  it('refuses invalid input and wrong contract versions during normalization', () => {
    const invalid = deriveInternalEconomicsV2({ not: 'valid' });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.refusal.code).toBe('SCHEMA_VALIDATION_FAILED');

    const wrongVersion = buildMinimalV2Input();
    (wrongVersion as Record<string, unknown>).contractVersion =
      'internal-economics-composite/1.0.0';
    const versionResult = derive(wrongVersion);
    expect(versionResult.ok).toBe(false);
    if (!versionResult.ok) {
      expect(versionResult.refusal.code).toBe('UNSUPPORTED_INTERNAL_ECONOMICS_CONTRACT_VERSION');
    }
  });

  it.each([
    {
      name: 'contract version before admission identity',
      mutate(input: InternalEconomicsInputV2Wire) {
        input.events = [baseEvent, duplicateBaseEvent];
        (input as Record<string, unknown>).contractVersion = 'internal-economics-composite/2.0.0';
      },
      code: 'UNSUPPORTED_INTERNAL_ECONOMICS_CONTRACT_VERSION',
      stage: 'normalization',
    },
    {
      name: 'admission identity before tier policy',
      mutate(input: InternalEconomicsInputV2Wire) {
        input.events = [baseEvent, duplicateBaseEvent];
        invalidateTierPolicy(input);
      },
      code: 'DUPLICATE_EVENT_IDENTITY',
      stage: 'normalization',
    },
    {
      name: 'tier policy before equalization',
      mutate(input: InternalEconomicsInputV2Wire) {
        input.events = [equalizationEvent];
        invalidateTierPolicy(input);
      },
      code: 'INVALID_TIER_POLICY',
      stage: 'normalization',
    },
    {
      name: 'equalization before specific capability',
      mutate(input: InternalEconomicsInputV2Wire) {
        input.events = [equalizationEvent, explicitEventRefusals[0]![0]];
      },
      code: 'UNSUPPORTED_V2_EQUALIZATION',
      stage: 'equalization',
    },
    {
      name: 'specific capability before base admission',
      mutate(input: InternalEconomicsInputV2Wire) {
        input.events = [baseEvent, explicitEventRefusals[0]![0]];
      },
      code: 'UNSUPPORTED_V2_CONTRIBUTION_CORRECTION',
      stage: 'admission',
    },
  ])('enforces $name', ({ mutate, code, stage }) => {
    const input = buildMinimalV2Input();
    mutate(input);

    const result = derive(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe(code);
    expect(result.refusal.stage).toBe(stage);
  });

  it('lets contract version beat tier, equalization, and base-event defects together', () => {
    const input = buildMinimalV2Input({
      events: [equalizationEvent, baseEvent],
    });
    invalidateTierPolicy(input);
    (input as Record<string, unknown>).contractVersion = 'internal-economics-composite/2.0.0';

    const result = derive(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('UNSUPPORTED_INTERNAL_ECONOMICS_CONTRACT_VERSION');
    expect(result.refusal.stage).toBe('normalization');
  });
});

describe('certifyInternalEconomicsDualLaneV2', () => {
  it('keeps the exact whole-fund certification refusal without partial output', () => {
    const result = certifyInternalEconomicsDualLaneV2(buildMinimalV2Input());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('UNSUPPORTED_V2_WHOLE_FUND_CERTIFICATION');
    expect(result.refusal.stage).toBe('waterfall');
    expect('certification' in result).toBe(false);
  });

  it('applies the management-fee fence before certification', () => {
    const input = buildMinimalV2Input();
    input.lpClasses[0]!.feeProfile.managementFeeSchedule[0]!.rate.rate = '0.020000000000';

    const result = certifyInternalEconomicsDualLaneV2(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('UNSUPPORTED_V2_MANAGEMENT_FEE');
    expect(result.refusal.stage).toBe('accrual');
    expect('certification' in result).toBe(false);
  });
});
