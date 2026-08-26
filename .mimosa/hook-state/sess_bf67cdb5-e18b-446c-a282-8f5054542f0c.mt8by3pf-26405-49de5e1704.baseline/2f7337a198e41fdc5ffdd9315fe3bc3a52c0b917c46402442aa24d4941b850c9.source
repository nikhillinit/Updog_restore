import { describe, expect, it } from 'vitest';

import {
  KPI_CSV_TEMPLATE_HEADER,
  KPI_CSV_MAX_ROWS,
} from '../../../../shared/contracts/kpi/kpi-observation-v1.contract';
import {
  KpiCsvBatchError,
  parseKpiObservationCsv,
} from '../../../../server/services/kpi/kpi-observation-csv';

const HEADER = KPI_CSV_TEMPLATE_HEADER.join(',');

function csv(...rows: string[]): Buffer {
  return Buffer.from([HEADER, ...rows].join('\n'), 'utf8');
}

const ARR_ROW = '4,revenue_arr,2026-04-01,2026-06-30,actual,"$2,100,000",,Q2 deck,,2026-07-05';

describe('KPI observation CSV template', () => {
  it('parses a spreadsheet-shaped money row into a fixed decimal string', () => {
    const parsed = parseKpiObservationCsv(csv(ARR_ROW));

    expect(parsed.rejected).toEqual([]);
    expect(parsed.accepted).toHaveLength(1);
    expect(parsed.accepted[0]).toMatchObject({
      row: 1,
      request: {
        portfolioCompanyId: 4,
        metric: 'revenue_arr',
        basis: 'actual',
        value: { valueKind: 'money', amountUsd: '2100000.000000' },
        sourceLabel: 'Q2 deck',
        companyKpiLabel: null,
        comment: null,
        submittedAt: '2026-07-05T00:00:00.000Z',
      },
    });
  });

  it('rejects the whole batch when the fixed header does not match', () => {
    const wrongHeader = Buffer.from('company,metric,value\n4,revenue_arr,10\n', 'utf8');
    expect(() => parseKpiObservationCsv(wrongHeader)).toThrow(KpiCsvBatchError);
    try {
      parseKpiObservationCsv(wrongHeader);
    } catch (error) {
      expect((error as KpiCsvBatchError).code).toBe('TEMPLATE_HEADER_MISMATCH');
    }
  });

  it('rejects the whole batch on an embedded newline or row overflow', () => {
    const embedded = Buffer.from(
      `${HEADER}\n4,qualitative_update,2026-04-01,2026-06-30,actual,"a\nb",,,,2026-07-05\n`,
      'utf8'
    );
    expect(() => parseKpiObservationCsv(embedded)).toThrow(/newline/i);

    const overflow = csv(...Array.from({ length: KPI_CSV_MAX_ROWS + 1 }, () => ARR_ROW));
    expect(() => parseKpiObservationCsv(overflow)).toThrow(/exceeds the limit/);
  });

  it('rejects only the offending rows and keeps the rest of the batch', () => {
    const parsed = parseKpiObservationCsv(
      csv(
        ARR_ROW,
        '0,revenue_arr,2026-04-01,2026-06-30,actual,10,,,,2026-07-05',
        '4,made_up_metric,2026-04-01,2026-06-30,actual,10,,,,2026-07-05',
        '4,headcount,2026-04-01,2026-06-30,actual,twelve,,,,2026-07-05',
        '4,revenue_arr,2026-04-01,2026-06-30,actual,10,,,,not-a-date',
        '4,cash_balance,2026-06-30,2026-04-01,actual,10,,,,2026-07-05'
      )
    );

    expect(parsed.accepted).toHaveLength(1);
    expect(parsed.rejected.map((rejection) => [rejection.row, rejection.code])).toEqual([
      [2, 'INVALID_PORTFOLIO_COMPANY_ID'],
      [3, 'UNKNOWN_METRIC'],
      [4, 'INVALID_VALUE'],
      [5, 'INVALID_SUBMITTED_AT'],
      [6, 'INVALID_ROW'],
    ]);
  });

  it('refuses to truncate money below the six-decimal boundary', () => {
    const parsed = parseKpiObservationCsv(
      csv('4,revenue_arr,2026-04-01,2026-06-30,actual,10.1234567,,,,2026-07-05')
    );
    expect(parsed.accepted).toEqual([]);
    expect(parsed.rejected[0]?.code).toBe('INVALID_VALUE');
  });

  it('reads a parenthesised negative as a signed company KPI', () => {
    const parsed = parseKpiObservationCsv(
      csv('4,company_specific,2026-04-01,2026-06-30,actual,(4.5),NRR delta,,,2026-07-05')
    );
    expect(parsed.accepted[0]?.request.value).toEqual({
      valueKind: 'number',
      number: '-4.500000',
    });
    expect(parsed.accepted[0]?.request.companyKpiLabel).toBe('NRR delta');
  });

  it('rejects a negative magnitude metric through the contract refinement', () => {
    const parsed = parseKpiObservationCsv(
      csv('4,monthly_burn,2026-04-01,2026-06-30,actual,(500000),,,,2026-07-05')
    );
    expect(parsed.accepted).toEqual([]);
    expect(parsed.rejected[0]).toMatchObject({ row: 1, code: 'INVALID_ROW' });
  });
});
