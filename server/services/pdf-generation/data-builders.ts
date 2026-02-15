/**
 * Sync/pure data builder functions for LP reports.
 * All signatures are stable and tested (63+ tests).
 *
 * @module server/services/pdf-generation/data-builders
 */

import type {
  LPReportData,
  K1ReportData,
  QuarterlyReportData,
  ReportMetrics,
  CapitalAccountReportData,
} from './types.js';

// ============================================================================
// SHARED HELPERS (reduce per-builder cyclomatic complexity)
// ============================================================================

function resolveCommitmentOrThrow(
  lpData: LPReportData,
  fundId: number
): LPReportData['commitments'][number] {
  const commitment = lpData.commitments.find((c) => c.fundId === fundId);
  if (!commitment) {
    throw new Error(`LP has no commitment to fund ${fundId}`);
  }
  return commitment;
}

function sumTransactionsByType(
  transactions: LPReportData['transactions'],
  ...types: string[]
): number {
  return transactions
    .filter((t) => types.includes(t.type))
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
}

function getTransactionsForCommitment(
  transactions: LPReportData['transactions'],
  commitmentId: number
): LPReportData['transactions'] {
  return transactions.filter((t) => t.commitmentId === commitmentId);
}

function filterTransactionsInYear(
  transactions: LPReportData['transactions'],
  commitmentId: number,
  taxYear: number
): LPReportData['transactions'] {
  const yearStart = new Date(taxYear, 0, 1);
  const yearEnd = new Date(taxYear, 11, 31, 23, 59, 59);

  return transactions.filter(
    (t) => t.commitmentId === commitmentId && t.date >= yearStart && t.date <= yearEnd
  );
}

function buildK1DistributionRows(
  transactions: LPReportData['transactions']
): K1ReportData['distributions'] {
  return transactions
    .filter((t) => t.type === 'distribution' || t.type === 'recallable_distribution')
    .map((t) => ({
      date: t.date.toISOString().split('T')[0] || '',
      type: t.type === 'recallable_distribution' ? 'Recallable' : 'Cash',
      amount: Math.abs(t.amount),
    }));
}

function estimateK1Allocations(distributions: number): K1ReportData['allocations'] {
  const totalIncome = distributions * 0.3;

  return {
    ordinaryIncome: totalIncome * 0.1,
    capitalGainsShortTerm: totalIncome * 0.05,
    capitalGainsLongTerm: totalIncome * 0.75,
    section1231Gains: 0,
    interestIncome: totalIncome * 0.05,
    dividendIncome: totalIncome * 0.05,
    royalties: 0,
    netRentalIncome: 0,
    otherIncome: 0,
  };
}

function resolvePortfolioCompanies(
  metrics: ReportMetrics | undefined,
  totalCalled: number
): QuarterlyReportData['portfolioCompanies'] {
  if (metrics?.portfolioCompanies) {
    return metrics.portfolioCompanies;
  }

  return [
    { name: 'TechCo Series B', invested: totalCalled * 0.3, value: totalCalled * 0.4, moic: 1.33 },
    {
      name: 'HealthAI Series A',
      invested: totalCalled * 0.25,
      value: totalCalled * 0.35,
      moic: 1.4,
    },
    {
      name: 'FinanceBot Seed',
      invested: totalCalled * 0.15,
      value: totalCalled * 0.12,
      moic: 0.8,
    },
    {
      name: 'CloudScale Series C',
      invested: totalCalled * 0.2,
      value: totalCalled * 0.25,
      moic: 1.25,
    },
    {
      name: 'Other Holdings',
      invested: totalCalled * 0.1,
      value: totalCalled * 0.13,
      moic: 1.3,
    },
  ];
}

function buildRunningBalanceRows(fundTransactions: LPReportData['transactions']): {
  rows: CapitalAccountReportData['transactions'];
  endingBalance: number;
} {
  let balance = 0;

  const rows = fundTransactions.map((t) => {
    const amount = t.type === 'capital_call' ? t.amount : -Math.abs(t.amount);
    balance += amount;

    return {
      date: t.date.toISOString().split('T')[0] || '',
      type: t.type === 'capital_call' ? 'Capital Call' : 'Distribution',
      description:
        t.description ||
        `${t.type === 'capital_call' ? 'Capital contribution' : 'Cash distribution'}`,
      amount,
      balance,
    };
  });

  return { rows, endingBalance: balance };
}

// ============================================================================
// EXPORTED BUILDERS
// ============================================================================

/** Build K-1 report data from LP data */
export function buildK1ReportData(
  lpData: LPReportData,
  fundId: number,
  taxYear: number
): K1ReportData {
  const commitment = resolveCommitmentOrThrow(lpData, fundId);
  const fundTransactions = filterTransactionsInYear(
    lpData.transactions,
    commitment.commitmentId,
    taxYear
  );

  const contributions = sumTransactionsByType(fundTransactions, 'capital_call');
  const distributions = sumTransactionsByType(
    fundTransactions,
    'distribution',
    'recallable_distribution'
  );

  const distributionList = buildK1DistributionRows(fundTransactions);
  const allocations = estimateK1Allocations(distributions);
  const totalIncome = distributions * 0.3;

  return {
    partnerName: lpData.lp.name,
    fundName: commitment.fundName,
    taxYear,
    allocations,
    distributions: distributionList,
    capitalAccount: {
      beginningBalance: contributions - distributions + totalIncome * 0.5,
      contributions,
      distributions,
      allocatedIncome: totalIncome,
      endingBalance: contributions - distributions + totalIncome,
    },
    preliminary: true,
    footnotes: [
      'PRELIMINARY: Tax allocations are estimated from distribution data. Final K-1 will be prepared by the fund administrator.',
      'Consult your tax advisor for reporting requirements.',
    ],
  };
}

/** Build quarterly report data from LP data */
export function buildQuarterlyReportData(
  lpData: LPReportData,
  fundId: number,
  quarter: string,
  year: number,
  metrics?: ReportMetrics
): QuarterlyReportData {
  const commitment = resolveCommitmentOrThrow(lpData, fundId);
  const fundTransactions = getTransactionsForCommitment(
    lpData.transactions,
    commitment.commitmentId
  );

  const totalCalled = sumTransactionsByType(fundTransactions, 'capital_call');
  const totalDistributed = sumTransactionsByType(
    fundTransactions,
    'distribution',
    'recallable_distribution'
  );

  const unfunded = commitment.commitmentAmount - totalCalled;

  const irr = metrics?.irr ?? 0.15;
  const tvpi = metrics?.tvpi ?? (totalCalled > 0 ? (totalCalled * 1.15) / totalCalled : 1);
  const dpi = metrics?.dpi ?? (totalCalled > 0 ? totalDistributed / totalCalled : 0);
  const nav = totalCalled * tvpi - totalDistributed;

  const cashFlows = fundTransactions.map((t) => ({
    date: t.date.toISOString().split('T')[0] || '',
    type: t.type === 'capital_call' ? ('contribution' as const) : ('distribution' as const),
    amount: Math.abs(t.amount),
  }));

  const portfolioCompanies = resolvePortfolioCompanies(metrics, totalCalled);

  return {
    fundName: commitment.fundName,
    quarter,
    year,
    lpName: lpData.lp.name,
    summary: {
      nav,
      tvpi,
      dpi,
      irr,
      totalCommitted: commitment.commitmentAmount,
      totalCalled,
      totalDistributed,
      unfunded,
    },
    portfolioCompanies,
    cashFlows,
    commentary: `${commitment.fundName} continues to execute on its investment thesis, focusing on high-growth technology companies. The portfolio is well-diversified across sectors and stages.`,
  };
}

/** Build capital account report data from LP data */
export function buildCapitalAccountReportData(
  lpData: LPReportData,
  fundId: number,
  asOfDate: Date
): CapitalAccountReportData {
  const commitment = resolveCommitmentOrThrow(lpData, fundId);

  const fundTransactions = getTransactionsForCommitment(
    lpData.transactions,
    commitment.commitmentId
  )
    .filter((t) => t.date <= asOfDate)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const { rows: transactions, endingBalance } = buildRunningBalanceRows(fundTransactions);

  const totalContributions = sumTransactionsByType(fundTransactions, 'capital_call');
  const totalDistributions = sumTransactionsByType(
    fundTransactions,
    'distribution',
    'recallable_distribution'
  );

  return {
    lpName: lpData.lp.name,
    fundName: commitment.fundName,
    asOfDate: asOfDate.toISOString().split('T')[0] || '',
    commitment: commitment.commitmentAmount,
    transactions,
    summary: {
      beginningBalance: (transactions[0]?.balance ?? 0) - (transactions[0]?.amount ?? 0),
      totalContributions,
      totalDistributions,
      netIncome: 0,
      endingBalance,
    },
  };
}
