import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { Decimal } from '../../../../shared/lib/decimal-config';
import {
  deriveInternalEconomicsV2,
  certifyInternalEconomicsDualLaneV2,
} from '../../../../shared/lib/internal-economics/v2/derive-composite-v2';
import { buildMinimalV2Input } from '../../../helpers/v2-input-builder';

function money(n: number): string {
  return new Decimal(n).toFixed(6);
}

function makeContribution(index: number, amount: number) {
  return {
    eventId: `contrib-${index}`,
    instant: '2025-02-01T00:00:00Z',
    amountUsd: money(amount),
    kind: 'settled_contribution' as const,
    partnerId: 'lp-1',
    purpose: 'deployment' as const,
    settlementSourceRef: `ref-${index}`,
  };
}

function makeDeployment(index: number, amount: number) {
  return {
    eventId: `dep-${index}`,
    instant: '2025-03-01T00:00:00Z',
    amountUsd: money(amount),
    kind: 'deployment' as const,
    dealId: `deal-${index}`,
    securityId: `sec-${index}`,
    cashSourceAllocations: [{ lotId: `csl:contrib-${index}`, amount: money(amount) }],
  };
}

function makeRealization(index: number, costBasis: number, proceeds: number) {
  return {
    eventId: `real-${index}`,
    instant: '2025-04-01T00:00:00Z',
    amountUsd: money(proceeds),
    kind: 'realization' as const,
    dealId: `deal-${index}`,
    reliefRows: [
      {
        investmentLotId: `inv:deal-${index}:sec-${index}:dep-${index}`,
        relievedCostBasis: money(costBasis),
        allocatedProceeds: money(proceeds),
      },
    ],
    recyclingTag: 'none' as const,
  };
}

describe('V2 property tests', () => {
  it('result is always ok-receipt or ok-false-refusal, never partial', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5 }), (n) => {
        const events = [];
        for (let i = 0; i < n; i++) {
          const amount = 10000 + i * 1000;
          events.push(makeContribution(i, amount));
          events.push(makeDeployment(i, amount));
          events.push(makeRealization(i, amount, amount * 1.5));
        }
        const input = buildMinimalV2Input({ events });
        const result = deriveInternalEconomicsV2(input);
        if (result.ok) {
          expect(result.receipt).toBeDefined();
          expect(result.receipt.receiptVersion).toBe('internal-economics-receipt/2.0.0');
        } else {
          expect(result.refusal).toBeDefined();
        }
      }),
      { numRuns: 20 }
    );
  });

  it('hash determinism: same input always produces same hashes', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 3 }), (n) => {
        const events = [];
        for (let i = 0; i < n; i++) {
          events.push(makeContribution(i, 50000));
          events.push(makeDeployment(i, 50000));
          events.push(makeRealization(i, 50000, 75000));
        }
        const input = buildMinimalV2Input({ events });
        const r1 = deriveInternalEconomicsV2(input);
        const r2 = deriveInternalEconomicsV2(input);
        if (r1.ok && r2.ok) {
          expect(r1.receipt.normalizedInputHash).toBe(r2.receipt.normalizedInputHash);
          expect(r1.receipt.resultHash).toBe(r2.receipt.resultHash);
        }
      }),
      { numRuns: 10 }
    );
  });

  it('fund cash equation conservation: opening + contributions + realizations - deployments - fees - expenses = ending', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), (n) => {
        const events = [];
        for (let i = 0; i < n; i++) {
          const amount = 20000 + i * 5000;
          events.push(makeContribution(i, amount));
          events.push(makeDeployment(i, amount));
          events.push(makeRealization(i, amount, amount + 10000));
        }
        const input = buildMinimalV2Input({ events });
        const result = deriveInternalEconomicsV2(input);
        if (!result.ok) return;
        const eq = result.receipt.fundCashEquation;
        const expected = new Decimal(eq.openingCash)
          .plus(eq.contributions)
          .plus(eq.realizations)
          .minus(eq.deployments)
          .minus(eq.fees)
          .minus(eq.expenses)
          .minus(eq.distributions);
        expect(expected.toFixed(6)).toBe(eq.endingCash);
      }),
      { numRuns: 15 }
    );
  });

  it('dual-lane certification: both receipts share normalizedInputHash', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 3 }), (n) => {
        const events = [];
        for (let i = 0; i < n; i++) {
          events.push(makeContribution(i, 30000));
          events.push(makeDeployment(i, 30000));
          events.push(makeRealization(i, 30000, 45000));
        }
        const input = buildMinimalV2Input({ events });
        const result = certifyInternalEconomicsDualLaneV2(input);
        if (!result.ok) return;
        expect(result.certification.dealByDeal.normalizedInputHash).toBe(
          result.certification.wholeFund.normalizedInputHash
        );
      }),
      { numRuns: 10 }
    );
  });

  it('tier allocations are non-negative', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), (n) => {
        const events = [];
        for (let i = 0; i < n; i++) {
          events.push(makeContribution(i, 40000));
          events.push(makeDeployment(i, 40000));
          events.push(makeRealization(i, 40000, 60000));
        }
        const input = buildMinimalV2Input({ events });
        const result = deriveInternalEconomicsV2(input);
        if (!result.ok) return;
        for (const tier of result.receipt.tierAllocations) {
          expect(new Decimal(tier.gpShare).gte(0)).toBe(true);
          expect(new Decimal(tier.lpShare).gte(0)).toBe(true);
          expect(new Decimal(tier.totalAllocated).gte(0)).toBe(true);
        }
      }),
      { numRuns: 15 }
    );
  });

  it('selected lane matches input', () => {
    fc.assert(
      fc.property(fc.constantFrom('deal_by_deal' as const, 'whole_fund' as const), (lane) => {
        const input = buildMinimalV2Input({
          selectedLane: lane,
          events: [
            makeContribution(0, 50000),
            makeDeployment(0, 50000),
            makeRealization(0, 50000, 80000),
          ],
        });
        const result = deriveInternalEconomicsV2(input);
        if (!result.ok) return;
        expect(result.receipt.selectedLane).toBe(lane);
      }),
      { numRuns: 10 }
    );
  });
});
