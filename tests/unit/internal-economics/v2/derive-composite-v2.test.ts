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
  it('returns receipt for deal_by_deal lane', () => {
    const result = deriveInternalEconomicsV2(inputWithEvents('deal_by_deal'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.receipt.selectedLane).toBe('deal_by_deal');
    expect(result.receipt.receiptVersion).toBe('internal-economics-receipt/2.0.0');
  });

  it('returns receipt for whole_fund lane', () => {
    const result = deriveInternalEconomicsV2(inputWithEvents('whole_fund'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.receipt.selectedLane).toBe('whole_fund');
  });

  it('populates fund cash equation', () => {
    const result = deriveInternalEconomicsV2(inputWithEvents());
    if (!result.ok) return;
    expect(result.receipt.fundCashEquation.contributions).toBe('200000.000000');
    expect(result.receipt.fundCashEquation.deployments).toBe('200000.000000');
    expect(result.receipt.fundCashEquation.realizations).toBe('300000.000000');
  });

  it('includes partner ledgers', () => {
    const result = deriveInternalEconomicsV2(inputWithEvents());
    if (!result.ok) return;
    expect(result.receipt.partnerLedgers.length).toBe(2);
    const lp = result.receipt.partnerLedgers.find((l) => l.partnerId === 'lp-1');
    expect(lp).toBeDefined();
    expect(lp!.committedCapital).toBe('1000000.000000');
  });

  it('includes hashes', () => {
    const result = deriveInternalEconomicsV2(inputWithEvents());
    if (!result.ok) return;
    expect(result.receipt.normalizedInputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.receipt.resultHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('refuses invalid input', () => {
    const result = deriveInternalEconomicsV2({ not: 'valid' });
    expect(result.ok).toBe(false);
  });

  it('uses selected lane only, not both', () => {
    const result = deriveInternalEconomicsV2(inputWithEvents('deal_by_deal'));
    if (!result.ok) return;
    expect(result.receipt.selectedLane).toBe('deal_by_deal');
  });
});

describe('certifyInternalEconomicsDualLaneV2', () => {
  it('returns both lanes', () => {
    const result = certifyInternalEconomicsDualLaneV2(inputWithEvents());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.certification.dealByDeal.selectedLane).toBe('deal_by_deal');
    expect(result.certification.wholeFund.selectedLane).toBe('whole_fund');
  });

  it('both lanes have same input hash', () => {
    const result = certifyInternalEconomicsDualLaneV2(inputWithEvents());
    if (!result.ok) return;
    expect(result.certification.dealByDeal.normalizedInputHash).toBe(
      result.certification.wholeFund.normalizedInputHash
    );
  });

  it('lanes have different result hashes', () => {
    const result = certifyInternalEconomicsDualLaneV2(inputWithEvents());
    if (!result.ok) return;
    expect(result.certification.dealByDeal.resultHash).not.toBe(
      result.certification.wholeFund.resultHash
    );
  });

  it('refuses invalid input', () => {
    const result = certifyInternalEconomicsDualLaneV2(null);
    expect(result.ok).toBe(false);
  });
});

describe('refusal matrix', () => {
  it('refuses missing carry tier', () => {
    const wire = buildMinimalV2Input({
      waterfallPolicy: [{ kind: 'return_of_capital', priority: 1 }],
    });
    const result = deriveInternalEconomicsV2(wire);
    expect(result.ok).toBe(false);
  });

  it('refuses empty events gracefully (returns zero receipt)', () => {
    const wire = buildMinimalV2Input({ events: [] });
    const result = deriveInternalEconomicsV2(wire);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.receipt.fundCashEquation.contributions).toBe('0.000000');
  });
});
