/**
 * Server-Side Excel Generation Service
 *
 * Generates LP reports in Excel format using the ExcelJS library.
 * Supports capital account statements, transaction history, and performance reports.
 *
 * @module server/services/xlsx-generation-service
 */

import ExcelJS from 'exceljs';
import type { QuarterlyReportData, CapitalAccountReportData } from './pdf-generation-service.js';

// ============================================================================
// TYPES
// ============================================================================

export interface TransactionExportData {
  lpName: string;
  transactions: Array<{
    date: string;
    fundName: string;
    type: string;
    description: string;
    amount: number;
    balance: number;
  }>;
}

export interface PerformanceExportData {
  lpName: string;
  asOfDate: string;
  funds: Array<{
    fundName: string;
    commitment: number;
    called: number;
    distributed: number;
    nav: number;
    tvpi: number;
    dpi: number;
    irr: number;
  }>;
}

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatMultiple(value: number): string {
  return `${value.toFixed(2)}x`;
}

// ============================================================================
// EXCEL GENERATION FUNCTIONS
// ============================================================================

/**
 * Generate Capital Account Statement Excel
 */
export async function generateCapitalAccountXLSX(data: CapitalAccountReportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  // Summary Sheet
  const summaryData = [
    ['Capital Account Statement'],
    [''],
    ['Limited Partner', data.lpName],
    ['Fund', data.fundName],
    ['As of Date', data.asOfDate],
    [''],
    ['Account Summary'],
    ['Beginning Balance', formatCurrency(data.summary.beginningBalance)],
    ['Total Contributions', formatCurrency(data.summary.totalContributions)],
    ['Total Distributions', formatCurrency(data.summary.totalDistributions)],
    ['Net Income / (Loss)', formatCurrency(data.summary.netIncome)],
    ['Ending Balance', formatCurrency(data.summary.endingBalance)],
    [''],
    ['Total Commitment', formatCurrency(data.commitment)],
    ['Unfunded Commitment', formatCurrency(data.commitment - data.summary.endingBalance)],
  ];

  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.addRows(summaryData);
  summarySheet.getColumn(1).width = 25;
  summarySheet.getColumn(2).width = 20;

  // Transactions Sheet
  const transactionHeaders = ['Date', 'Type', 'Description', 'Amount', 'Balance'];
  const transactionRows = data.transactions.map((t) => [
    t.date,
    t.type,
    t.description,
    t.amount,
    t.balance,
  ]);

  const transactionSheet = workbook.addWorksheet('Transactions');
  transactionSheet.addRows([transactionHeaders, ...transactionRows]);
  transactionSheet.getColumn(1).width = 12;
  transactionSheet.getColumn(2).width = 15;
  transactionSheet.getColumn(3).width = 35;
  transactionSheet.getColumn(4).width = 15;
  transactionSheet.getColumn(5).width = 15;

  // Format number columns (starting from row 2, which is the first data row after header)
  for (let rowIndex = 2; rowIndex <= transactionSheet.rowCount; rowIndex++) {
    const row = transactionSheet.getRow(rowIndex);
    row.getCell(4).numFmt = '$#,##0';
    row.getCell(5).numFmt = '$#,##0';
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Generate Quarterly Report Excel
 */
export async function generateQuarterlyXLSX(data: QuarterlyReportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  // Summary Sheet
  const summaryData = [
    [`${data.fundName} - Quarterly Report`],
    [''],
    ['Period', `${data.quarter} ${data.year}`],
    ['Limited Partner', data.lpName],
    [''],
    ['Fund Performance'],
    ['Net Asset Value', formatCurrency(data.summary.nav)],
    ['TVPI', formatMultiple(data.summary.tvpi)],
    ['DPI', formatMultiple(data.summary.dpi)],
    ['Net IRR', formatPercent(data.summary.irr)],
    [''],
    ['Your Capital Summary'],
    ['Total Commitment', formatCurrency(data.summary.totalCommitted)],
    ['Capital Called', formatCurrency(data.summary.totalCalled)],
    ['Distributions Received', formatCurrency(data.summary.totalDistributed)],
    ['Unfunded Commitment', formatCurrency(data.summary.unfunded)],
  ];

  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.addRows(summaryData);
  summarySheet.getColumn(1).width = 25;
  summarySheet.getColumn(2).width = 20;

  // Portfolio Companies Sheet
  const portfolioHeaders = ['Company', 'Invested', 'Current Value', 'MOIC'];
  const portfolioRows = data.portfolioCompanies.map((co) => [
    co.name,
    co.invested,
    co.value,
    co.moic,
  ]);

  // Add totals row
  const totalInvested = data.portfolioCompanies.reduce((sum, co) => sum + co.invested, 0);
  const totalValue = data.portfolioCompanies.reduce((sum, co) => sum + co.value, 0);
  portfolioRows.push(['Total', totalInvested, totalValue, totalValue / totalInvested]);

  const portfolioSheet = workbook.addWorksheet('Portfolio');
  portfolioSheet.addRows([portfolioHeaders, ...portfolioRows]);
  portfolioSheet.getColumn(1).width = 25;
  portfolioSheet.getColumn(2).width = 15;
  portfolioSheet.getColumn(3).width = 15;
  portfolioSheet.getColumn(4).width = 10;

  // Format number columns (starting from row 2)
  for (let rowIndex = 2; rowIndex <= portfolioSheet.rowCount; rowIndex++) {
    const row = portfolioSheet.getRow(rowIndex);
    row.getCell(2).numFmt = '$#,##0';
    row.getCell(3).numFmt = '$#,##0';
    row.getCell(4).numFmt = '0.00x';
  }

  // Cash Flows Sheet (if available)
  if (data.cashFlows && data.cashFlows.length > 0) {
    const cashFlowHeaders = ['Date', 'Type', 'Amount'];
    const cashFlowRows = data.cashFlows.map((cf) => [
      cf.date,
      cf.type === 'contribution' ? 'Capital Call' : 'Distribution',
      cf.type === 'contribution' ? -cf.amount : cf.amount,
    ]);

    const cashFlowSheet = workbook.addWorksheet('Cash Flows');
    cashFlowSheet.addRows([cashFlowHeaders, ...cashFlowRows]);
    cashFlowSheet.getColumn(1).width = 12;
    cashFlowSheet.getColumn(2).width = 15;
    cashFlowSheet.getColumn(3).width = 15;

    // Format number column (starting from row 2)
    for (let rowIndex = 2; rowIndex <= cashFlowSheet.rowCount; rowIndex++) {
      const row = cashFlowSheet.getRow(rowIndex);
      row.getCell(3).numFmt = '$#,##0';
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Generate Transaction History Excel
 */
export async function generateTransactionHistoryXLSX(data: TransactionExportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  // Header
  const headerData = [['Transaction History'], [''], ['Limited Partner', data.lpName], ['']];

  // Transaction data
  const transactionHeaders = ['Date', 'Fund', 'Type', 'Description', 'Amount', 'Balance'];
  const transactionRows = data.transactions.map((t) => [
    t.date,
    t.fundName,
    t.type,
    t.description,
    t.amount,
    t.balance,
  ]);

  const fullData = [...headerData, transactionHeaders, ...transactionRows];
  const sheet = workbook.addWorksheet('Transactions');
  sheet.addRows(fullData);

  // Set column widths
  sheet.getColumn(1).width = 12;
  sheet.getColumn(2).width = 25;
  sheet.getColumn(3).width = 15;
  sheet.getColumn(4).width = 35;
  sheet.getColumn(5).width = 15;
  sheet.getColumn(6).width = 15;

  // Format number columns (starting from row 6, which is the first data row after 4 header rows + 1 column header)
  const dataStartRow = headerData.length + 2;
  for (let rowIndex = dataStartRow; rowIndex <= sheet.rowCount; rowIndex++) {
    const row = sheet.getRow(rowIndex);
    row.getCell(5).numFmt = '$#,##0';
    row.getCell(6).numFmt = '$#,##0';
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Generate Performance Summary Excel
 */
export async function generatePerformanceSummaryXLSX(data: PerformanceExportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  // Header
  const headerData = [
    ['Performance Summary'],
    [''],
    ['Limited Partner', data.lpName],
    ['As of Date', data.asOfDate],
    [''],
  ];

  // Performance data
  const perfHeaders = ['Fund', 'Commitment', 'Called', 'Distributed', 'NAV', 'TVPI', 'DPI', 'IRR'];
  const perfRows = data.funds.map((f) => [
    f.fundName,
    f.commitment,
    f.called,
    f.distributed,
    f.nav,
    f.tvpi,
    f.dpi,
    f.irr,
  ]);

  // Totals
  const totals = data.funds.reduce(
    (acc, f) => ({
      commitment: acc.commitment + f.commitment,
      called: acc.called + f.called,
      distributed: acc.distributed + f.distributed,
      nav: acc.nav + f.nav,
    }),
    { commitment: 0, called: 0, distributed: 0, nav: 0 }
  );

  const avgTVPI = totals.called > 0 ? (totals.nav + totals.distributed) / totals.called : 1;
  const avgDPI = totals.called > 0 ? totals.distributed / totals.called : 0;
  const avgIRR = data.funds.reduce((sum, f) => sum + f.irr * f.commitment, 0) / totals.commitment;

  perfRows.push([
    'Total / Weighted Average',
    totals.commitment,
    totals.called,
    totals.distributed,
    totals.nav,
    avgTVPI,
    avgDPI,
    avgIRR,
  ]);

  const fullData = [...headerData, perfHeaders, ...perfRows];
  const sheet = workbook.addWorksheet('Performance');
  sheet.addRows(fullData);

  // Set column widths
  sheet.getColumn(1).width = 25;
  sheet.getColumn(2).width = 15;
  sheet.getColumn(3).width = 15;
  sheet.getColumn(4).width = 15;
  sheet.getColumn(5).width = 15;
  sheet.getColumn(6).width = 10;
  sheet.getColumn(7).width = 10;
  sheet.getColumn(8).width = 10;

  // Format number columns (starting from row 7, which is the first data row after 5 header rows + 1 column header)
  const dataStartRow = headerData.length + 2;
  for (let rowIndex = dataStartRow; rowIndex <= sheet.rowCount; rowIndex++) {
    const row = sheet.getRow(rowIndex);
    for (let col = 2; col <= 5; col++) {
      row.getCell(col).numFmt = '$#,##0';
    }
    row.getCell(6).numFmt = '0.00x';
    row.getCell(7).numFmt = '0.00x';
    row.getCell(8).numFmt = '0.00%';
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
