import { describe, it, expect } from 'vitest';
import {
  deriveInternalEconomicsV2,
  certifyInternalEconomicsDualLaneV2,
} from '../../../../shared/lib/internal-economics/v2/derive-composite-v2';
import { buildMinimalV2Input } from '../../../helpers/v2-input-builder';

function inputWithEvents(selectedLane: 'deal_by_deal' | 'whole_fund' = 'deal_by_deal') {
  return buildMinimalV2Input({
    selectedLane,
    cutoverInstant: '2024-01-01T00:00:00Z',
    calculationDate: '2025-06-30T00:00:00Z',
    events: [
      {
        eventId: 'contrib-1',
        instant: '2024-02-01T00:00:00Z',
        amountUsd: '200000.000000',
        kind: 'settled_contribution',
        partnerId: 'lp-1',
        purpose: 'deployment',
        settlementSourceRef: 'ref-1',
      },
      {
        eventId: 'dep-1',
        instant: '2024-03-01T00:00:00Z',
        amountUsd: '200000.000000',
        kind: 'deployment',
        dealId: 'd-1',
        securityId: 's-1',
        cashSourceAllocations: [{ lotId: 'csl:contrib-1', amount: '200000.000000' }],
      },
      {
        eventId: 'real-1',
        instant: '2025-03-01T00:00:00Z',
        amountUsd: '300000.000000',
        kind: 'realization',
        dealId: 'd-1',
        reliefRows: [
          {
            investmentLotId: 'inv:d-1:s-1:dep-1',
            relievedCostBasis: '200000.000000',
            allocatedProceeds: '300000.000000',
          },
        ],
        recyclingTag: 'none',
      },
    ],
  });
}

describe('deriveInternalEconomicsV2', () => {
  it('refuses deal_by_deal lane with UNSUPPORTED_V2_BASE_EVENT', () => {
    const result = deriveInternalEconomicsV2(inputWithEvents('deal_by_deal'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('UNSUPPORTED_V2_BASE_EVENT');
    expect(result.refusal.stage).toBe('admission');
  });

  it('refuses whole_fund lane with UNSUPPORTED_V2_BASE_EVENT', () => {
    const result = deriveInternalEconomicsV2(inputWithEvents('whole_fund'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('UNSUPPORTED_V2_BASE_EVENT');
    expect(result.refusal.stage).toBe('admission');
  });

  it('refuses with no receipt or partial result', () => {
    const result = deriveInternalEconomicsV2(inputWithEvents());
    expect(result.ok).toBe(false);
    expect('receipt' in result).toBe(false);
  });

  it('refuses empty events with UNSUPPORTED_V2_BASE_EVENT', () => {
    const wire = buildMinimalV2Input({ events: [] });
    const result = deriveInternalEconomicsV2(wire);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('UNSUPPORTED_V2_BASE_EVENT');
    expect(result.refusal.stage).toBe('admission');
  });

  it('refuses invalid input with SCHEMA_VALIDATION_FAILED', () => {
    const result = deriveInternalEconomicsV2({ not: 'valid' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('SCHEMA_VALIDATION_FAILED');
  });

  it('refuses wrong contract version with UNSUPPORTED_INTERNAL_ECONOMICS_CONTRACT_VERSION', () => {
    const wire = buildMinimalV2Input();
    (wire as Record<string, unknown>).contractVersion = 'internal-economics-composite/1.0.0';
    const result = deriveInternalEconomicsV2(wire);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('UNSUPPORTED_INTERNAL_ECONOMICS_CONTRACT_VERSION');
    expect(result.refusal.stage).toBe('normalization');
  });
});

describe('certifyInternalEconomicsDualLaneV2', () => {
  it('refuses with UNSUPPORTED_V2_WHOLE_FUND_CERTIFICATION', () => {
    const result = certifyInternalEconomicsDualLaneV2(inputWithEvents());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('UNSUPPORTED_V2_WHOLE_FUND_CERTIFICATION');
    expect(result.refusal.stage).toBe('waterfall');
  });

  it('refuses with no certification or partial result', () => {
    const result = certifyInternalEconomicsDualLaneV2(inputWithEvents());
    expect(result.ok).toBe(false);
    expect('certification' in result).toBe(false);
  });

  it('refuses invalid input', () => {
    const result = certifyInternalEconomicsDualLaneV2(null);
    expect(result.ok).toBe(false);
  });
});

describe('refusal precedence', () => {
  it('refuses missing carry tier at normalization (level 3 beats level 6)', () => {
    const wire = buildMinimalV2Input({
      waterfallPolicy: [{ kind: 'return_of_capital', priority: 1 }],
    });
    const result = deriveInternalEconomicsV2(wire);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('INVALID_TIER_POLICY');
    expect(result.refusal.stage).toBe('normalization');
  });

  it('contribution_correction triggers specific refusal (level 5 beats level 6)', () => {
    const wire = buildMinimalV2Input({
      cutoverInstant: '2024-01-01T00:00:00Z',
      events: [
        {
          eventId: 'cc-1',
          instant: '2024-06-01T00:00:00Z',
          amountUsd: '10000.000000',
          kind: 'contribution_correction',
          correctsEventId: 'contrib-1',
        },
      ],
    });
    const result = deriveInternalEconomicsV2(wire);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('UNSUPPORTED_V2_CONTRIBUTION_CORRECTION');
    expect(result.refusal.stage).toBe('admission');
  });

  it('version error beats all other defects (level 1 beats levels 2-6)', () => {
    const wire = buildMinimalV2Input({
      waterfallPolicy: [{ kind: 'return_of_capital', priority: 1 }],
    });
    (wire as Record<string, unknown>).contractVersion = 'internal-economics-composite/2.0.0';
    const result = deriveInternalEconomicsV2(wire);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('UNSUPPORTED_INTERNAL_ECONOMICS_CONTRACT_VERSION');
    expect(result.refusal.stage).toBe('normalization');
  });
});
