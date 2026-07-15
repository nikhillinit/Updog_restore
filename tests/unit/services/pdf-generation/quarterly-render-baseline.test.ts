import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  buildQuarterlyReportData,
  generateQuarterlyPDF,
  type LPReportData,
  type QuarterlyReportData,
  type ReportMetrics,
} from '../../../../server/services/pdf-generation-service';
import { standardLPData } from '../../../fixtures/lp-report-fixtures';

const BASELINE_PATH = resolve(process.cwd(), '.claude/artifacts/wave9e0-lp-report-baseline.pdf');
// A complete one-page report with metrics, capital summary, and portfolio rows is
// materially larger than an empty PDF; this floor catches truncated renders.
const MINIMUM_PDF_BYTES = 4_000;

function createFrozenQuarterlyFixture(): {
  lpData: LPReportData;
  metrics: ReportMetrics;
  period: Readonly<{
    quarter: string;
    year: number;
    cutoff: Date;
    generatedAt: string;
  }>;
  reportData: QuarterlyReportData;
} {
  const period = Object.freeze({
    quarter: 'Q3',
    year: 2024,
    cutoff: new Date('2024-09-30T23:59:59.999Z'),
    generatedAt: '2024-09-30T23:59:59.999Z',
  });

  const lpData: LPReportData = {
    lp: Object.freeze({ ...standardLPData.lp }),
    commitments: standardLPData.commitments.map((commitment) => Object.freeze({ ...commitment })),
    transactions: standardLPData.transactions
      .filter((transaction) => transaction.date <= period.cutoff)
      .map((transaction) =>
        Object.freeze({ ...transaction, date: new Date(transaction.date.getTime()) })
      ),
  };
  Object.freeze(lpData.commitments);
  Object.freeze(lpData.transactions);
  Object.freeze(lpData);

  const metrics: ReportMetrics = {
    irr: 0.15,
    tvpi: 1.15,
    dpi: 0.13,
    portfolioCompanies: [
      { name: 'AlphaAI', invested: 675_000, value: 900_000, moic: 1.33 },
      { name: 'BetaCorp', invested: 562_500, value: 787_500, moic: 1.4 },
      { name: 'GammaHealth', invested: 450_000, value: 562_500, moic: 1.25 },
    ].map((company) => Object.freeze(company)),
  };
  Object.freeze(metrics.portfolioCompanies);
  Object.freeze(metrics);

  const reportData: QuarterlyReportData = {
    ...buildQuarterlyReportData(lpData, 1, period.quarter, period.year, metrics),
    generatedAt: period.generatedAt,
  };
  Object.freeze(reportData.summary);
  Object.freeze(reportData.portfolioCompanies);
  Object.freeze(reportData.cashFlows);
  Object.freeze(reportData);

  return Object.freeze({ lpData, metrics, period, reportData });
}

describe('quarterly PDF render baseline', () => {
  it('renders byte-equal Q3 2024 output under a pinned clock through the public service', async () => {
    const fixture = createFrozenQuarterlyFixture();

    expect(fixture.lpData.transactions.every(({ date }) => date <= fixture.period.cutoff)).toBe(
      true
    );
    expect(
      fixture.lpData.transactions.some(
        ({ date }) => date.toISOString() === '2024-10-15T00:00:00.000Z'
      )
    ).toBe(false);

    // The current document does not expose metadata-date props through the service.
    // Freeze Date so React-PDF's default creation date is stable for byte comparison.
    // The server setup replaces fetch with a no-op mock; removing it makes Yoga use
    // its embedded WASM bytes instead of calling an undefined mock result.
    vi.stubGlobal('fetch', undefined);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(fixture.period.generatedAt));

    try {
      const firstBuffer = await generateQuarterlyPDF(fixture.reportData);
      const secondBuffer = await generateQuarterlyPDF(fixture.reportData);

      expect(Buffer.isBuffer(firstBuffer)).toBe(true);
      expect(firstBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      expect(firstBuffer.byteLength).toBeGreaterThan(MINIMUM_PDF_BYTES);
      expect(firstBuffer.toString('latin1')).toMatch(/%%EOF\s*$/);
      expect(secondBuffer.equals(firstBuffer)).toBe(true);

      if (process.env['WAVE9E0_CAPTURE'] === '1') {
        const realFs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
        await realFs.writeFile(BASELINE_PATH, firstBuffer);
      }
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
