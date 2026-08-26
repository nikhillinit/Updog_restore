import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  generatePerformanceSummaryXLSX,
  generateQuarterlyXLSX,
} from '../../../server/services/xlsx-generation-service';

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

function buildPerformanceData(
  irrValues: Array<number | null>,
  commitments = irrValues.map((_, index) => (index === 0 ? 5_000_000 : 3_000_000))
) {
  return {
    lpName: 'Test LP',
    asOfDate: '2024-06-30',
    funds: irrValues.map((irr, index) => {
      const commitment = commitments[index] ?? 1_000_000;

      return {
        fundName: `Fund ${index + 1}`,
        commitment,
        called: Math.max(commitment * 0.8, 0),
        distributed: Math.max(commitment * 0.2, 0),
        nav: Math.max(commitment * 0.6, 0),
        tvpi: 1.25 + index * 0.1,
        dpi: 0.2 + index * 0.05,
        irr,
      };
    }),
  };
}

async function readWorksheet(buffer: Buffer, worksheetName: string) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook.getWorksheet(worksheetName);
}

function findRowByLabel(
  worksheet: ExcelJS.Worksheet | undefined,
  label: string
): ExcelJS.Row | undefined {
  if (!worksheet) {
    return undefined;
  }

  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    if (row.getCell(1).text === label) {
      return row;
    }
  }

  return undefined;
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

describe('generatePerformanceSummaryXLSX IRR parity', () => {
  it.each([null, Number.NaN, Number.POSITIVE_INFINITY])(
    'renders an invalid row IRR (%p) as N/A and poisons the total-row IRR',
    async (irr) => {
      const buffer = await generatePerformanceSummaryXLSX(buildPerformanceData([irr, 0.18]));
      const performanceSheet = await readWorksheet(buffer, 'Performance');
      const fundRow = findRowByLabel(performanceSheet, 'Fund 1');
      const totalRow = findRowByLabel(performanceSheet, 'Total / Weighted Average');

      expect(performanceSheet).toBeDefined();
      expect(fundRow).toBeDefined();
      expect(totalRow).toBeDefined();
      expect(fundRow?.getCell(8).text).toBe('N/A');
      expect(totalRow?.getCell(8).text).toBe('N/A');
    }
  );

  it('renders the total-row IRR as N/A when the positive-commitment denominator is invalid', async () => {
    const buffer = await generatePerformanceSummaryXLSX(buildPerformanceData([0.15, 0.12], [0, 0]));
    const performanceSheet = await readWorksheet(buffer, 'Performance');
    const totalRow = findRowByLabel(performanceSheet, 'Total / Weighted Average');

    expect(performanceSheet).toBeDefined();
    expect(totalRow).toBeDefined();
    expect(totalRow?.getCell(8).text).toBe('N/A');
  });

  it('renders the total-row IRR as N/A when the positive-commitment denominator is non-finite', async () => {
    const buffer = await generatePerformanceSummaryXLSX({
      lpName: 'Test LP',
      asOfDate: '2024-06-30',
      funds: [
        {
          fundName: 'Fund 1',
          commitment: Number.POSITIVE_INFINITY,
          called: 1_000_000,
          distributed: 250_000,
          nav: 750_000,
          tvpi: 1.25,
          dpi: 0.25,
          irr: 0.15,
        },
        {
          fundName: 'Fund 2',
          commitment: 1_000_000,
          called: 800_000,
          distributed: 200_000,
          nav: 600_000,
          tvpi: 1.1,
          dpi: 0.2,
          irr: 0.12,
        },
      ],
    });
    const performanceSheet = await readWorksheet(buffer, 'Performance');
    const totalRow = findRowByLabel(performanceSheet, 'Total / Weighted Average');

    expect(performanceSheet).toBeDefined();
    expect(totalRow).toBeDefined();
    expect(totalRow?.getCell(8).text).toBe('N/A');
  });

  it('keeps valid IRR cells numeric and percent-formatted', async () => {
    const buffer = await generatePerformanceSummaryXLSX(buildPerformanceData([0.15, 0.12]));
    const performanceSheet = await readWorksheet(buffer, 'Performance');
    const fundRow = findRowByLabel(performanceSheet, 'Fund 1');
    const irrCell = fundRow?.getCell(8);

    expect(performanceSheet).toBeDefined();
    expect(fundRow).toBeDefined();
    expect(irrCell?.type).toBe(ExcelJS.ValueType.Number);
    expect(typeof irrCell?.value).toBe('number');
    if (typeof irrCell?.value === 'number') {
      expect(irrCell.value).toBeCloseTo(0.15);
    }
    expect(irrCell?.numFmt).toBe('0.00%');
  });
});
