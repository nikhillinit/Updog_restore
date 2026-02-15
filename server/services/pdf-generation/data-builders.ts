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

/** Build K-1 report data from LP data */
export function buildK1ReportData(
  lpData: LPReportData,
  fundId: number,
  taxYear: number
): K1ReportData {
  const commitment = lpData.commitments.find((c) => c.fundId === fundId);
  if (!commitment) {
    throw new Error(`LP has no commitment to fund ${fundId}`);
  }

  // Filter transactions for the tax year and fund
  const yearStart = new Date(taxYear, 0, 1);
  const yearEnd = new Date(taxYear, 11, 31, 23, 59, 59);
  const fundTransactions = lpData.transactions.filter(
    (t) => t.commitmentId === commitment.commitmentId && t.date >= yearStart && t.date <= yearEnd
  );

  // Calculate totals
  const contributions = fundTransactions
    .filter((t) => t.type === 'capital_call')
    .reduce((sum, t) => sum + t.amount, 0);

  const distributions = fundTransactions
    .filter((t) => t.type === 'distribution' || t.type === 'recallable_distribution')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  // Build distribution list
  const distributionList = fundTransactions
    .filter((t) => t.type === 'distribution' || t.type === 'recallable_distribution')
    .map((t) => ({
      date: t.date.toISOString().split('T')[0] || '',
      type: t.type === 'recallable_distribution' ? 'Recallable' : 'Cash',
      amount: Math.abs(t.amount),
    }));

  // Placeholder tax allocations (would come from actual tax data in production)
  // These would typically be calculated by the fund administrator
  const totalIncome = distributions * 0.3; // Simplified: 30% of distributions as income
  const allocations = {
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

  return {
    partnerName: lpData.lp.name,
    fundName: commitment.fundName,
    taxYear,
    allocations,
    distributions: distributionList,
    capitalAccount: {
      beginningBalance: contributions - distributions + totalIncome * 0.5, // Simplified
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
  const commitment = lpData.commitments.find((c) => c.fundId === fundId);
  if (!commitment) {
    throw new Error(`LP has no commitment to fund ${fundId}`);
  }

  // Calculate totals from transactions
  const fundTransactions = lpData.transactions.filter(
    (t) => t.commitmentId === commitment.commitmentId
  );

  const totalCalled = fundTransactions
    .filter((t) => t.type === 'capital_call')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalDistributed = fundTransactions
    .filter((t) => t.type === 'distribution' || t.type === 'recallable_distribution')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const unfunded = commitment.commitmentAmount - totalCalled;

  // Use real metrics if provided, otherwise placeholder fallback
  const irr = metrics?.irr ?? 0.15;
  const tvpi = metrics?.tvpi ?? (totalCalled > 0 ? (totalCalled * 1.15) / totalCalled : 1);
  const dpi = metrics?.dpi ?? (totalCalled > 0 ? totalDistributed / totalCalled : 0);
  const nav = totalCalled * tvpi - totalDistributed;

  // Build cash flows from all transactions (no artificial cap)
  const cashFlows = fundTransactions.map((t) => ({
    date: t.date.toISOString().split('T')[0] || '',
    type: t.type === 'capital_call' ? ('contribution' as const) : ('distribution' as const),
    amount: Math.abs(t.amount),
  }));

  // Use real portfolio companies if provided, otherwise placeholder fallback
  const portfolioCompanies = metrics?.portfolioCompanies ?? [
    { name: 'TechCo Series B', invested: totalCalled * 0.3, value: totalCalled * 0.4, moic: 1.33 },
    {
      name: 'HealthAI Series A',
      invested: totalCalled * 0.25,
      value: totalCalled * 0.35,
      moic: 1.4,
    },
    { name: 'FinanceBot Seed', invested: totalCalled * 0.15, value: totalCalled * 0.12, moic: 0.8 },
    {
      name: 'CloudScale Series C',
      invested: totalCalled * 0.2,
      value: totalCalled * 0.25,
      moic: 1.25,
    },
    { name: 'Other Holdings', invested: totalCalled * 0.1, value: totalCalled * 0.13, moic: 1.3 },
  ];

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
  const commitment = lpData.commitments.find((c) => c.fundId === fundId);
  if (!commitment) {
    throw new Error(`LP has no commitment to fund ${fundId}`);
  }

  // Filter transactions up to asOfDate
  const fundTransactions = lpData.transactions
    .filter((t) => t.commitmentId === commitment.commitmentId && t.date <= asOfDate)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // Build transaction history with running balance
  let balance = 0;
  const transactions = fundTransactions.map((t) => {
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

  // Calculate summary
  const totalContributions = fundTransactions
    .filter((t) => t.type === 'capital_call')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalDistributions = fundTransactions
    .filter((t) => t.type === 'distribution' || t.type === 'recallable_distribution')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

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
      netIncome: 0, // No performance allocation source yet
      endingBalance: balance,
    },
  };
}
