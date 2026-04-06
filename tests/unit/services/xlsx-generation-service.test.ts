import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { generateQuarterlyXLSX } from '../../../server/services/xlsx-generation-service';

function buildQuarterlyData(irr: number | null) {
  return {
    fundName: 'Test Fund I',
    quarter: 'Q2',
    year: 2024,
    lpName: 'Test LP',
    summary: {
      nav: 12_000_000,
      tvpi: 1.25,
      dpi: 0.2,
      irr,
      totalCommitted: 10_000_000,
      totalCalled: 8_000_000,
      totalDistributed: 2_000_000,
      unfunded: 2_000_000,
    },
    portfolioCompanies: [
      { name: 'TechCo', invested: 3_000_000, value: 4_000_000, moic: 1.33 },
      { name: 'HealthAI', invested: 2_000_000, value: 2_500_000, moic: 1.25 },
    ],
    cashFlows: [
      { date: '2024-03-01', type: 'contribution' as const, amount: 1_000_000 },
      { date: '2024-05-15', type: 'distribution' as const, amount: 500_000 },
    ],
  };
}

async function readSummarySheet(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook.getWorksheet('Summary');
}

describe('generateQuarterlyXLSX IRR parity', () => {
  it('renders a null IRR as N/A in the Summary sheet', async () => {
    const buffer = await generateQuarterlyXLSX(buildQuarterlyData(null));
    const summarySheet = await readSummarySheet(buffer);

    expect(summarySheet).toBeDefined();
    expect(summarySheet?.getCell('A10').text).toBe('Net IRR');
    expect(summarySheet?.getCell('B10').text).toBe('N/A');
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])(
    'renders a non-finite IRR (%p) as N/A in the Summary sheet',
    async (irr) => {
      const buffer = await generateQuarterlyXLSX(buildQuarterlyData(irr));
      const summarySheet = await readSummarySheet(buffer);

      expect(summarySheet).toBeDefined();
      expect(summarySheet?.getCell('A10').text).toBe('Net IRR');
      expect(summarySheet?.getCell('B10').text).toBe('N/A');
    }
  );
});
