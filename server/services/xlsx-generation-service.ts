/**
 * Server-Side Excel Generation Service
 *
 * Generates LP reports in Excel format using the xlsx library.
 * Supports capital account statements, transaction history, and performance reports.
 *
 * @module server/services/xlsx-generation-service
 */

import XLSX from 'xlsx';
import type {
  QuarterlyReportData,
  CapitalAccountReportData,
} from './pdf-generation-service.js';

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
export function generateCapitalAccountXLSX(data: CapitalAccountReportData): Buffer {
  const workbook = XLSX.utils.book_new();

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

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);

  // Set column widths
  summarySheet['!cols'] = [{ wch: 25 }, { wch: 20 }];

  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  // Transactions Sheet
  const transactionHeaders = ['Date', 'Type', 'Description', 'Amount', 'Balance'];
  const transactionRows = data.transactions.map((t) => [
    t.date,
    t.type,
    t.description,
    t.amount,
    t.balance,
  ]);

  const transactionData = [transactionHeaders, ...transactionRows];
  const transactionSheet = XLSX.utils.aoa_to_sheet(transactionData);

  // Set column widths
  transactionSheet['!cols'] = [
    { wch: 12 },
    { wch: 15 },
    { wch: 35 },
    { wch: 15 },
    { wch: 15 },
  ];

  // Format number columns
  const range = XLSX.utils.decode_range(transactionSheet['!ref'] || 'A1:E1');
  for (let row = 1; row <= range.e.r; row++) {
    const amountCell = transactionSheet[XLSX.utils.encode_cell({ r: row, c: 3 })];
    const balanceCell = transactionSheet[XLSX.utils.encode_cell({ r: row, c: 4 })];
    if (amountCell) amountCell.z = '$#,##0';
    if (balanceCell) balanceCell.z = '$#,##0';
  }

  XLSX.utils.book_append_sheet(workbook, transactionSheet, 'Transactions');

  // Generate buffer
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return buffer;
}

/**
 * Generate Quarterly Report Excel
 */
export function generateQuarterlyXLSX(data: QuarterlyReportData): Buffer {
  const workbook = XLSX.utils.book_new();

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

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  summarySheet['!cols'] = [{ wch: 25 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

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

  const portfolioData = [portfolioHeaders, ...portfolioRows];
  const portfolioSheet = XLSX.utils.aoa_to_sheet(portfolioData);
  portfolioSheet['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 10 }];

  // Format number columns
  const range = XLSX.utils.decode_range(portfolioSheet['!ref'] || 'A1:D1');
  for (let row = 1; row <= range.e.r; row++) {
    const investedCell = portfolioSheet[XLSX.utils.encode_cell({ r: row, c: 1 })];
    const valueCell = portfolioSheet[XLSX.utils.encode_cell({ r: row, c: 2 })];
    const moicCell = portfolioSheet[XLSX.utils.encode_cell({ r: row, c: 3 })];
    if (investedCell) investedCell.z = '$#,##0';
    if (valueCell) valueCell.z = '$#,##0';
    if (moicCell) moicCell.z = '0.00x';
  }

  XLSX.utils.book_append_sheet(workbook, portfolioSheet, 'Portfolio');

  // Cash Flows Sheet (if available)
  if (data.cashFlows && data.cashFlows.length > 0) {
    const cashFlowHeaders = ['Date', 'Type', 'Amount'];
    const cashFlowRows = data.cashFlows.map((cf) => [
      cf.date,
      cf.type === 'contribution' ? 'Capital Call' : 'Distribution',
      cf.type === 'contribution' ? -cf.amount : cf.amount,
    ]);

    const cashFlowData = [cashFlowHeaders, ...cashFlowRows];
    const cashFlowSheet = XLSX.utils.aoa_to_sheet(cashFlowData);
    cashFlowSheet['!cols'] = [{ wch: 12 }, { wch: 15 }, { wch: 15 }];

    // Format amount column
    const cfRange = XLSX.utils.decode_range(cashFlowSheet['!ref'] || 'A1:C1');
    for (let row = 1; row <= cfRange.e.r; row++) {
      const amountCell = cashFlowSheet[XLSX.utils.encode_cell({ r: row, c: 2 })];
      if (amountCell) amountCell.z = '$#,##0';
    }

    XLSX.utils.book_append_sheet(workbook, cashFlowSheet, 'Cash Flows');
  }

  // Generate buffer
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return buffer;
}

/**
 * Generate Transaction History Excel
 */
export function generateTransactionHistoryXLSX(data: TransactionExportData): Buffer {
  const workbook = XLSX.utils.book_new();

  // Header
  const headerData = [
    ['Transaction History'],
    [''],
    ['Limited Partner', data.lpName],
    [''],
  ];

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
  const sheet = XLSX.utils.aoa_to_sheet(fullData);

  // Set column widths
  sheet['!cols'] = [
    { wch: 12 },
    { wch: 25 },
    { wch: 15 },
    { wch: 35 },
    { wch: 15 },
    { wch: 15 },
  ];

  // Format number columns (starting from row 5 which is index 4 after header rows)
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:F1');
  for (let row = 5; row <= range.e.r; row++) {
    const amountCell = sheet[XLSX.utils.encode_cell({ r: row, c: 4 })];
    const balanceCell = sheet[XLSX.utils.encode_cell({ r: row, c: 5 })];
    if (amountCell) amountCell.z = '$#,##0';
    if (balanceCell) balanceCell.z = '$#,##0';
  }

  XLSX.utils.book_append_sheet(workbook, sheet, 'Transactions');

  // Generate buffer
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return buffer;
}

/**
 * Generate Performance Summary Excel
 */
export function generatePerformanceSummaryXLSX(data: PerformanceExportData): Buffer {
  const workbook = XLSX.utils.book_new();

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
  const sheet = XLSX.utils.aoa_to_sheet(fullData);

  // Set column widths
  sheet['!cols'] = [
    { wch: 25 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
  ];

  // Format number columns (starting from row 6 which is index 5)
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:H1');
  for (let row = 6; row <= range.e.r; row++) {
    for (let col = 1; col <= 4; col++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
      if (cell) cell.z = '$#,##0';
    }
    const tvpiCell = sheet[XLSX.utils.encode_cell({ r: row, c: 5 })];
    const dpiCell = sheet[XLSX.utils.encode_cell({ r: row, c: 6 })];
    const irrCell = sheet[XLSX.utils.encode_cell({ r: row, c: 7 })];
    if (tvpiCell) tvpiCell.z = '0.00x';
    if (dpiCell) dpiCell.z = '0.00x';
    if (irrCell) irrCell.z = '0.00%';
  }

  XLSX.utils.book_append_sheet(workbook, sheet, 'Performance');

  // Generate buffer
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return buffer;
}
