import { describe, expect, it } from 'vitest';

import { Decimal } from '@shared/lib/decimal-config';
import { MULTI_EVENT_INDEPENDENCE_FIXTURES } from '../../helpers/multi-event-independence-fixtures';

describe('multi-event-independence-fixtures', () => {
  it('contains at least one fixture', () => {
    expect(MULTI_EVENT_INDEPENDENCE_FIXTURES.length).toBeGreaterThan(0);
  });

  describe.each(MULTI_EVENT_INDEPENDENCE_FIXTURES)('$description', (fixture) => {
    it('preserves conservation of capital in expected totals', () => {
      const { proceeds, roc, lpProfit, gpCarry } = fixture.expectedTotals;
      const totalDistributed = new Decimal(roc).plus(lpProfit).plus(gpCarry);
      expect(totalDistributed.toFixed(6)).toBe(new Decimal(proceeds).toFixed(6));
    });

    it('correctly aggregates proceeds and capital calls to expected totals', () => {
      let totalProceeds = new Decimal(0);
      let totalCalls = new Decimal(0);

      // In this simple fixture validation we assume opening unreturned capital is 0
      // unless there are capital calls
      for (const event of fixture.events) {
        if (event.type === 'proceeds') {
          totalProceeds = totalProceeds.plus(event.amount);
        } else if (event.type === 'capitalCall') {
          totalCalls = totalCalls.plus(event.amount);
        }
      }

      expect(totalProceeds.toFixed(6)).toBe(
        new Decimal(fixture.expectedTotals.proceeds).toFixed(6)
      );

      // Final unreturned capital should be total calls minus return of capital (roc)
      const expectedEndingUnreturned = totalCalls.minus(fixture.expectedTotals.roc);
      expect(expectedEndingUnreturned.toFixed(6)).toBe(
        new Decimal(fixture.expectedTotals.endingUnreturnedCapital).toFixed(6)
      );
    });
  });
});
