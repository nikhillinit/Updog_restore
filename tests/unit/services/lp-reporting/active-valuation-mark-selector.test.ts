import { describe, expect, it } from 'vitest';

import { selectActiveValuationMarks } from '../../../../server/services/lp-reporting/active-valuation-mark-selector';
import type { ParsedValuationMark } from '../../../../server/services/lp-reporting/metrics-engine';

function mark(overrides: Partial<ParsedValuationMark> & Pick<ParsedValuationMark, 'id'>) {
  return {
    fairValue: '1000000.000000',
    markDate: '2026-03-31',
    asOfDate: '2026-03-31',
    status: 'approved',
    confidenceLevel: 'medium',
    companyId: 42,
    ...overrides,
  } satisfies ParsedValuationMark;
}

describe('selectActiveValuationMarks', () => {
  it('selects one latest mark per company and tie-breaks same-day marks by higher id', () => {
    const result = selectActiveValuationMarks(
      [
        mark({ id: 10, fairValue: '1000000.000000' }),
        mark({ id: 11, fairValue: '2000000.000000' }),
        mark({ id: 12, fairValue: '3000000.000000', markDate: '2026-02-28' }),
      ],
      '2026-03-31'
    );

    expect(result.active.map((activeMark) => activeMark.id)).toEqual([11]);
  });

  it('excludes future, superseded, and reversed marks', () => {
    const result = selectActiveValuationMarks(
      [
        mark({ id: 20, status: 'superseded' }),
        mark({ id: 21, status: 'reversed' }),
        mark({ id: 22, markDate: '2026-04-01' }),
        mark({ id: 23, markDate: '2026-03-30' }),
      ],
      '2026-03-31'
    );

    expect(result.active.map((activeMark) => activeMark.id)).toEqual([23]);
    expect(result.excludedFutureMarkIds).toEqual([22]);
  });
});
