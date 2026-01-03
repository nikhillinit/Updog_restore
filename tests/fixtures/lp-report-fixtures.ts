/**
 * LP Report Test Fixtures
 *
 * Mock data for testing PDF/XLSX report generation data builders.
 * Based on the structure returned by fetchLPReportData.
 *
 * @module tests/fixtures/lp-report-fixtures
 */

// Type for LP report data (matches fetchLPReportData return type)
export interface MockLPReportData {
  lp: { id: number; name: string; email: string };
  commitments: Array<{
    commitmentId: number;
    fundId: number;
    fundName: string;
    commitmentAmount: number;
    ownershipPercentage: number;
  }>;
  transactions: Array<{
    commitmentId: number;
    fundId: number | null;
    date: Date;
    type: string;
    amount: number;
    description: string | null;
  }>;
}

// ============================================================================
// STANDARD FIXTURES
// ============================================================================

/**
 * Standard LP with multiple fund commitments and transactions
 */
export const standardLPData: MockLPReportData = {
  lp: {
    id: 1,
    name: 'Acme Investments LLC',
    email: 'investments@acme.com',
  },
  commitments: [
    {
      commitmentId: 101,
      fundId: 1,
      fundName: 'Venture Fund I',
      commitmentAmount: 5_000_000,
      ownershipPercentage: 0.1,
    },
    {
      commitmentId: 102,
      fundId: 2,
      fundName: 'Venture Fund II',
      commitmentAmount: 2_500_000,
      ownershipPercentage: 0.05,
    },
  ],
  transactions: [
    // Fund I transactions
    {
      commitmentId: 101,
      fundId: 1,
      date: new Date('2024-01-15'),
      type: 'capital_call',
      amount: 1_000_000,
      description: 'Initial capital call',
    },
    {
      commitmentId: 101,
      fundId: 1,
      date: new Date('2024-04-01'),
      type: 'capital_call',
      amount: 500_000,
      description: 'Q2 capital call',
    },
    {
      commitmentId: 101,
      fundId: 1,
      date: new Date('2024-06-15'),
      type: 'distribution',
      amount: 200_000,
      description: 'TechCo exit distribution',
    },
    {
      commitmentId: 101,
      fundId: 1,
      date: new Date('2024-09-01'),
      type: 'capital_call',
      amount: 750_000,
      description: 'Q3 capital call',
    },
    {
      commitmentId: 101,
      fundId: 1,
      date: new Date('2024-10-15'),
      type: 'recallable_distribution',
      amount: 100_000,
      description: 'Recallable return of capital',
    },
    // Fund II transactions
    {
      commitmentId: 102,
      fundId: 2,
      date: new Date('2024-03-01'),
      type: 'capital_call',
      amount: 500_000,
      description: 'Initial capital call',
    },
    {
      commitmentId: 102,
      fundId: 2,
      date: new Date('2024-07-01'),
      type: 'capital_call',
      amount: 250_000,
      description: 'Follow-on capital call',
    },
  ],
};

/**
 * LP with no transactions (new investor)
 */
export const newLPData: MockLPReportData = {
  lp: {
    id: 2,
    name: 'New Investor Corp',
    email: 'new@investor.com',
  },
  commitments: [
    {
      commitmentId: 201,
      fundId: 1,
      fundName: 'Venture Fund I',
      commitmentAmount: 1_000_000,
      ownershipPercentage: 0.02,
    },
  ],
  transactions: [],
};

/**
 * LP with only capital calls (no distributions yet)
 */
export const earlyStageLP: MockLPReportData = {
  lp: {
    id: 3,
    name: 'Early Stage Partners',
    email: 'partners@earlystage.com',
  },
  commitments: [
    {
      commitmentId: 301,
      fundId: 3,
      fundName: 'Growth Fund III',
      commitmentAmount: 10_000_000,
      ownershipPercentage: 0.15,
    },
  ],
  transactions: [
    {
      commitmentId: 301,
      fundId: 3,
      date: new Date('2024-02-01'),
      type: 'capital_call',
      amount: 2_000_000,
      description: 'First capital call',
    },
    {
      commitmentId: 301,
      fundId: 3,
      date: new Date('2024-05-01'),
      type: 'capital_call',
      amount: 1_500_000,
      description: 'Second capital call',
    },
    {
      commitmentId: 301,
      fundId: 3,
      date: new Date('2024-08-01'),
      type: 'capital_call',
      amount: 1_000_000,
      description: 'Third capital call',
    },
  ],
};

/**
 * LP with high distribution activity (mature fund)
 */
export const matureFundLP: MockLPReportData = {
  lp: {
    id: 4,
    name: 'Harvest Capital',
    email: 'harvest@capital.com',
  },
  commitments: [
    {
      commitmentId: 401,
      fundId: 4,
      fundName: 'Legacy Fund IV',
      commitmentAmount: 3_000_000,
      ownershipPercentage: 0.08,
    },
  ],
  transactions: [
    // All capital called early
    {
      commitmentId: 401,
      fundId: 4,
      date: new Date('2020-01-15'),
      type: 'capital_call',
      amount: 1_500_000,
      description: 'Initial call',
    },
    {
      commitmentId: 401,
      fundId: 4,
      date: new Date('2020-06-01'),
      type: 'capital_call',
      amount: 1_500_000,
      description: 'Final call',
    },
    // Multiple distributions over time
    {
      commitmentId: 401,
      fundId: 4,
      date: new Date('2021-03-15'),
      type: 'distribution',
      amount: 500_000,
      description: 'First exit distribution',
    },
    {
      commitmentId: 401,
      fundId: 4,
      date: new Date('2022-06-01'),
      type: 'distribution',
      amount: 800_000,
      description: 'Second exit distribution',
    },
    {
      commitmentId: 401,
      fundId: 4,
      date: new Date('2023-09-15'),
      type: 'distribution',
      amount: 1_200_000,
      description: 'Major exit distribution',
    },
    {
      commitmentId: 401,
      fundId: 4,
      date: new Date('2024-02-01'),
      type: 'distribution',
      amount: 600_000,
      description: 'Final distribution',
    },
  ],
};

// ============================================================================
// EDGE CASE FIXTURES
// ============================================================================

/**
 * LP with zero-value transactions (edge case)
 */
export const zeroValueTransactionsLP: MockLPReportData = {
  lp: {
    id: 5,
    name: 'Zero Value Test',
    email: 'test@zero.com',
  },
  commitments: [
    {
      commitmentId: 501,
      fundId: 5,
      fundName: 'Test Fund V',
      commitmentAmount: 1_000_000,
      ownershipPercentage: 0.01,
    },
  ],
  transactions: [
    {
      commitmentId: 501,
      fundId: 5,
      date: new Date('2024-01-01'),
      type: 'capital_call',
      amount: 100_000,
      description: 'Normal call',
    },
    {
      commitmentId: 501,
      fundId: 5,
      date: new Date('2024-02-01'),
      type: 'capital_call',
      amount: 0, // Edge case: zero amount
      description: 'Zero amount call (waived)',
    },
  ],
};

/**
 * LP with transactions spanning multiple years
 */
export const multiYearTransactionsLP: MockLPReportData = {
  lp: {
    id: 6,
    name: 'Long Term Holdings',
    email: 'holdings@longterm.com',
  },
  commitments: [
    {
      commitmentId: 601,
      fundId: 6,
      fundName: 'Evergreen Fund VI',
      commitmentAmount: 5_000_000,
      ownershipPercentage: 0.12,
    },
  ],
  transactions: [
    // 2022 transactions
    {
      commitmentId: 601,
      fundId: 6,
      date: new Date('2022-03-15'),
      type: 'capital_call',
      amount: 1_000_000,
      description: '2022 Q1 call',
    },
    {
      commitmentId: 601,
      fundId: 6,
      date: new Date('2022-09-01'),
      type: 'capital_call',
      amount: 500_000,
      description: '2022 Q3 call',
    },
    // 2023 transactions
    {
      commitmentId: 601,
      fundId: 6,
      date: new Date('2023-02-01'),
      type: 'capital_call',
      amount: 750_000,
      description: '2023 Q1 call',
    },
    {
      commitmentId: 601,
      fundId: 6,
      date: new Date('2023-06-15'),
      type: 'distribution',
      amount: 300_000,
      description: '2023 interim distribution',
    },
    // 2024 transactions
    {
      commitmentId: 601,
      fundId: 6,
      date: new Date('2024-01-15'),
      type: 'capital_call',
      amount: 500_000,
      description: '2024 Q1 call',
    },
    {
      commitmentId: 601,
      fundId: 6,
      date: new Date('2024-04-01'),
      type: 'distribution',
      amount: 400_000,
      description: '2024 Q2 distribution',
    },
    {
      commitmentId: 601,
      fundId: 6,
      date: new Date('2024-08-15'),
      type: 'capital_call',
      amount: 250_000,
      description: '2024 Q3 call',
    },
  ],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a copy of mock data with custom overrides
 */
export function createMockLPData(overrides: Partial<MockLPReportData> = {}): MockLPReportData {
  return {
    lp: overrides.lp ?? { ...standardLPData.lp },
    commitments: overrides.commitments ?? [...standardLPData.commitments],
    transactions: overrides.transactions ?? [...standardLPData.transactions],
  };
}

/**
 * Filter transactions by fund and date range
 */
export function filterTransactionsByYear(
  data: MockLPReportData,
  fundId: number,
  year: number
): MockLPReportData['transactions'] {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59);

  const commitment = data.commitments.find((c) => c.fundId === fundId);
  if (!commitment) return [];

  return data.transactions.filter(
    (t) => t.commitmentId === commitment.commitmentId && t.date >= yearStart && t.date <= yearEnd
  );
}

/**
 * Calculate expected totals for validation
 */
export function calculateExpectedTotals(
  data: MockLPReportData,
  fundId: number,
  year?: number
): { contributions: number; distributions: number } {
  const commitment = data.commitments.find((c) => c.fundId === fundId);
  if (!commitment) return { contributions: 0, distributions: 0 };

  let transactions = data.transactions.filter((t) => t.commitmentId === commitment.commitmentId);

  if (year) {
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59);
    transactions = transactions.filter((t) => t.date >= yearStart && t.date <= yearEnd);
  }

  const contributions = transactions
    .filter((t) => t.type === 'capital_call')
    .reduce((sum, t) => sum + t.amount, 0);

  const distributions = transactions
    .filter((t) => t.type === 'distribution' || t.type === 'recallable_distribution')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  return { contributions, distributions };
}
