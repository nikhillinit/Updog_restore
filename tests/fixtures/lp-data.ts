/**
 * LP Test Fixtures
 *
 * Comprehensive test data for LP Portal testing.
 * Includes LPs, fund commitments, capital activities, and performance data.
 *
 * @module tests/fixtures/lp-data
 */

import type {
  LPProfile,
  LPCommitment,
  CapitalAccountTransaction,
  LPPerformancePoint,
  LPPortfolioHolding,
} from '@shared/types/lp-api';

// ============================================================================
// LP PROFILES
// ============================================================================

export const testLPProfiles: LPProfile[] = [
  {
    id: 1,
    name: 'Acme Family Office',
    email: 'investments@acmefamily.com',
    entityType: 'family_office',
    fundIds: [1, 2],
  },
  {
    id: 2,
    name: 'State Pension Fund',
    email: 'pe@statepension.gov',
    entityType: 'pension',
    fundIds: [1],
  },
  {
    id: 3,
    name: 'University Endowment',
    email: 'endowment@university.edu',
    entityType: 'endowment',
    fundIds: [1, 2, 3],
  },
  {
    id: 4,
    name: 'John Smith',
    email: 'john.smith@email.com',
    entityType: 'individual',
    fundIds: [2],
  },
];

// ============================================================================
// FUND COMMITMENTS
// ============================================================================

export const testCommitments: LPCommitment[] = [
  {
    id: 1,
    lpId: 1,
    fundId: 1,
    fundName: 'Press On Ventures Fund I',
    commitmentAmount: 10_000_000,
    calledAmount: 7_500_000,
    distributedAmount: 2_000_000,
    unfundedAmount: 2_500_000,
    nav: 8_500_000,
    ownershipPercentage: 0.10,
    vintageYear: 2021,
  },
  {
    id: 2,
    lpId: 1,
    fundId: 2,
    fundName: 'Press On Ventures Fund II',
    commitmentAmount: 15_000_000,
    calledAmount: 6_000_000,
    distributedAmount: 500_000,
    unfundedAmount: 9_000_000,
    nav: 7_200_000,
    ownershipPercentage: 0.08,
    vintageYear: 2023,
  },
  {
    id: 3,
    lpId: 2,
    fundId: 1,
    fundName: 'Press On Ventures Fund I',
    commitmentAmount: 25_000_000,
    calledAmount: 18_750_000,
    distributedAmount: 5_000_000,
    unfundedAmount: 6_250_000,
    nav: 21_250_000,
    ownershipPercentage: 0.25,
    vintageYear: 2021,
  },
  {
    id: 4,
    lpId: 3,
    fundId: 1,
    fundName: 'Press On Ventures Fund I',
    commitmentAmount: 5_000_000,
    calledAmount: 3_750_000,
    distributedAmount: 1_000_000,
    unfundedAmount: 1_250_000,
    nav: 4_250_000,
    ownershipPercentage: 0.05,
    vintageYear: 2021,
  },
];

// ============================================================================
// CAPITAL ACTIVITIES
// ============================================================================

export const testCapitalActivities: CapitalAccountTransaction[] = [
  // LP 1, Fund 1 transactions
  {
    id: '1',
    fundId: 1,
    fundName: 'Press On Ventures Fund I',
    date: '2021-03-15',
    type: 'capital_call',
    amount: 2_500_000,
    description: 'Initial capital call - 25% of commitment',
    runningBalance: 2_500_000,
  },
  {
    id: '2',
    fundId: 1,
    fundName: 'Press On Ventures Fund I',
    date: '2021-09-01',
    type: 'capital_call',
    amount: 2_500_000,
    description: 'Second capital call - Series A investments',
    runningBalance: 5_000_000,
  },
  {
    id: '3',
    fundId: 1,
    fundName: 'Press On Ventures Fund I',
    date: '2022-06-15',
    type: 'capital_call',
    amount: 2_500_000,
    description: 'Third capital call - Follow-on investments',
    runningBalance: 7_500_000,
  },
  {
    id: '4',
    fundId: 1,
    fundName: 'Press On Ventures Fund I',
    date: '2023-03-01',
    type: 'distribution',
    amount: -1_000_000,
    description: 'Partial exit - TechCo acquisition',
    runningBalance: 6_500_000,
  },
  {
    id: '5',
    fundId: 1,
    fundName: 'Press On Ventures Fund I',
    date: '2024-01-15',
    type: 'distribution',
    amount: -1_000_000,
    description: 'Q4 2023 distribution - Secondary sale',
    runningBalance: 5_500_000,
  },
  // LP 1, Fund 2 transactions
  {
    id: '6',
    fundId: 2,
    fundName: 'Press On Ventures Fund II',
    date: '2023-06-01',
    type: 'capital_call',
    amount: 3_000_000,
    description: 'Initial capital call - 20% of commitment',
    runningBalance: 3_000_000,
  },
  {
    id: '7',
    fundId: 2,
    fundName: 'Press On Ventures Fund II',
    date: '2024-01-15',
    type: 'capital_call',
    amount: 3_000_000,
    description: 'Second capital call - Seed investments',
    runningBalance: 6_000_000,
  },
  {
    id: '8',
    fundId: 2,
    fundName: 'Press On Ventures Fund II',
    date: '2024-06-01',
    type: 'distribution',
    amount: -500_000,
    description: 'Early exit - AI startup acquisition',
    runningBalance: 5_500_000,
  },
];

// ============================================================================
// PERFORMANCE DATA
// ============================================================================

export const testPerformanceData: LPPerformancePoint[] = [
  // Fund 1 performance (quarterly snapshots)
  { date: '2021-06-30', fundId: 1, irr: -0.05, moic: 0.95, tvpi: 0.95, dpi: 0, rvpi: 0.95 },
  { date: '2021-12-31', fundId: 1, irr: 0.02, moic: 1.02, tvpi: 1.02, dpi: 0, rvpi: 1.02 },
  { date: '2022-06-30', fundId: 1, irr: 0.08, moic: 1.10, tvpi: 1.10, dpi: 0, rvpi: 1.10 },
  { date: '2022-12-31', fundId: 1, irr: 0.12, moic: 1.18, tvpi: 1.18, dpi: 0, rvpi: 1.18 },
  { date: '2023-06-30', fundId: 1, irr: 0.15, moic: 1.25, tvpi: 1.25, dpi: 0.13, rvpi: 1.12 },
  { date: '2023-12-31', fundId: 1, irr: 0.18, moic: 1.32, tvpi: 1.32, dpi: 0.20, rvpi: 1.12 },
  { date: '2024-06-30', fundId: 1, irr: 0.20, moic: 1.40, tvpi: 1.40, dpi: 0.27, rvpi: 1.13 },
  // Fund 2 performance
  { date: '2023-12-31', fundId: 2, irr: -0.08, moic: 0.92, tvpi: 0.92, dpi: 0, rvpi: 0.92 },
  { date: '2024-06-30', fundId: 2, irr: 0.05, moic: 1.12, tvpi: 1.12, dpi: 0.08, rvpi: 1.04 },
];

// ============================================================================
// PORTFOLIO HOLDINGS
// ============================================================================

export const testHoldings: LPPortfolioHolding[] = [
  {
    companyId: 1,
    companyName: 'TechCo',
    sector: 'Enterprise SaaS',
    stage: 'Series B',
    initialInvestmentDate: '2021-04-15',
    totalInvested: 500_000,
    currentValue: 1_200_000,
    ownershipPercentage: 0.02,
    moic: 2.4,
    status: 'active',
  },
  {
    companyId: 2,
    companyName: 'HealthAI',
    sector: 'Healthcare',
    stage: 'Series A',
    initialInvestmentDate: '2021-08-20',
    totalInvested: 350_000,
    currentValue: 700_000,
    ownershipPercentage: 0.015,
    moic: 2.0,
    status: 'active',
  },
  {
    companyId: 3,
    companyName: 'FinanceBot',
    sector: 'FinTech',
    stage: 'Seed',
    initialInvestmentDate: '2022-02-10',
    totalInvested: 200_000,
    currentValue: 150_000,
    ownershipPercentage: 0.01,
    moic: 0.75,
    status: 'active',
  },
  {
    companyId: 4,
    companyName: 'CloudScale (Exited)',
    sector: 'Infrastructure',
    stage: 'Series C',
    initialInvestmentDate: '2021-05-01',
    totalInvested: 400_000,
    currentValue: 0,
    realizedValue: 1_600_000,
    ownershipPercentage: 0,
    moic: 4.0,
    status: 'exited',
    exitDate: '2023-11-15',
  },
];

// ============================================================================
// REPORT FIXTURES
// ============================================================================

export interface TestReportData {
  id: string;
  lpId: number;
  type: 'quarterly' | 'annual' | 'k1' | 'capital_account';
  status: 'pending' | 'generating' | 'ready' | 'error';
  dateRange: { startDate: string; endDate: string };
  fundIds: number[];
  format: 'pdf' | 'xlsx' | 'csv';
  fileUrl?: string;
  fileSize?: number;
  generatedAt?: string;
}

export const testReports: TestReportData[] = [
  {
    id: 'rpt-001',
    lpId: 1,
    type: 'quarterly',
    status: 'ready',
    dateRange: { startDate: '2024-04-01', endDate: '2024-06-30' },
    fundIds: [1, 2],
    format: 'pdf',
    fileUrl: '/reports/rpt-001.pdf',
    fileSize: 125000,
    generatedAt: '2024-07-15T10:30:00Z',
  },
  {
    id: 'rpt-002',
    lpId: 1,
    type: 'k1',
    status: 'ready',
    dateRange: { startDate: '2023-01-01', endDate: '2023-12-31' },
    fundIds: [1],
    format: 'pdf',
    fileUrl: '/reports/rpt-002.pdf',
    fileSize: 85000,
    generatedAt: '2024-03-01T14:00:00Z',
  },
  {
    id: 'rpt-003',
    lpId: 1,
    type: 'capital_account',
    status: 'generating',
    dateRange: { startDate: '2021-01-01', endDate: '2024-06-30' },
    fundIds: [1, 2],
    format: 'xlsx',
  },
];

// ============================================================================
// K-1 TAX DATA
// ============================================================================

export interface TestK1Data {
  lpId: number;
  fundId: number;
  taxYear: number;
  ordinaryIncome: number;
  longTermCapitalGains: number;
  shortTermCapitalGains: number;
  section1231Gains: number;
  qualifiedDividends: number;
  interestIncome: number;
  royaltyIncome: number;
  rentalIncome: number;
  foreignTaxesPaid: number;
  stateIncome: Record<string, number>;
}

export const testK1Data: TestK1Data[] = [
  {
    lpId: 1,
    fundId: 1,
    taxYear: 2023,
    ordinaryIncome: 15000,
    longTermCapitalGains: 125000,
    shortTermCapitalGains: 8000,
    section1231Gains: 0,
    qualifiedDividends: 2500,
    interestIncome: 1200,
    royaltyIncome: 0,
    rentalIncome: 0,
    foreignTaxesPaid: 500,
    stateIncome: {
      CA: 12000,
      NY: 8000,
      DE: 5000,
    },
  },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get LP profile by ID
 */
export function getLPProfile(lpId: number): LPProfile | undefined {
  return testLPProfiles.find((lp) => lp.id === lpId);
}

/**
 * Get commitments for an LP
 */
export function getLPCommitments(lpId: number): LPCommitment[] {
  return testCommitments.filter((c) => c.lpId === lpId);
}

/**
 * Get capital activities for an LP
 */
export function getLPCapitalActivities(
  lpId: number,
  fundId?: number
): CapitalAccountTransaction[] {
  const lpFundIds = testCommitments
    .filter((c) => c.lpId === lpId)
    .map((c) => c.fundId);

  return testCapitalActivities.filter((a) => {
    const inLPFunds = lpFundIds.includes(a.fundId);
    const matchesFund = fundId === undefined || a.fundId === fundId;
    return inLPFunds && matchesFund;
  });
}

/**
 * Get performance data for an LP's funds
 */
export function getLPPerformance(lpId: number, fundId?: number): LPPerformancePoint[] {
  const lpFundIds = testCommitments
    .filter((c) => c.lpId === lpId)
    .map((c) => c.fundId);

  return testPerformanceData.filter((p) => {
    const inLPFunds = lpFundIds.includes(p.fundId);
    const matchesFund = fundId === undefined || p.fundId === fundId;
    return inLPFunds && matchesFund;
  });
}

/**
 * Calculate LP summary metrics
 */
export function calculateLPSummary(lpId: number) {
  const commitments = getLPCommitments(lpId);

  const totalCommitted = commitments.reduce((sum, c) => sum + c.commitmentAmount, 0);
  const totalCalled = commitments.reduce((sum, c) => sum + c.calledAmount, 0);
  const totalDistributed = commitments.reduce((sum, c) => sum + c.distributedAmount, 0);
  const totalNAV = commitments.reduce((sum, c) => sum + c.nav, 0);
  const totalUnfunded = commitments.reduce((sum, c) => sum + c.unfundedAmount, 0);

  // Calculate weighted average IRR and MOIC
  const latestPerformance = testPerformanceData
    .filter((p) => commitments.some((c) => c.fundId === p.fundId))
    .reduce(
      (acc, p) => {
        const commitment = commitments.find((c) => c.fundId === p.fundId);
        if (commitment) {
          acc.weightedIRR += p.irr * commitment.commitmentAmount;
          acc.weightedMOIC += p.moic * commitment.commitmentAmount;
          acc.totalWeight += commitment.commitmentAmount;
        }
        return acc;
      },
      { weightedIRR: 0, weightedMOIC: 0, totalWeight: 0 }
    );

  return {
    totalCommitted,
    totalCalled,
    totalDistributed,
    totalNAV,
    totalUnfunded,
    irr: latestPerformance.totalWeight > 0 ? latestPerformance.weightedIRR / latestPerformance.totalWeight : 0,
    moic: latestPerformance.totalWeight > 0 ? latestPerformance.weightedMOIC / latestPerformance.totalWeight : 1,
    fundCount: commitments.length,
  };
}

// ============================================================================
// DATABASE SEED HELPERS
// ============================================================================

/**
 * Generate SQL INSERT statements for seeding test data
 */
export function generateSeedSQL(): string {
  const statements: string[] = [];

  // LPs
  testLPProfiles.forEach((lp) => {
    statements.push(`
      INSERT INTO limited_partners (id, name, email, entity_type)
      VALUES (${lp.id}, '${lp.name}', '${lp.email}', '${lp.entityType}')
      ON CONFLICT (id) DO NOTHING;
    `);
  });

  // Commitments
  testCommitments.forEach((c) => {
    statements.push(`
      INSERT INTO lp_fund_commitments (id, lp_id, fund_id, commitment_amount, called_amount, distributed_amount, unfunded_amount, nav, ownership_percentage, vintage_year)
      VALUES (${c.id}, ${c.lpId}, ${c.fundId}, ${c.commitmentAmount}, ${c.calledAmount}, ${c.distributedAmount}, ${c.unfundedAmount}, ${c.nav}, ${c.ownershipPercentage}, ${c.vintageYear})
      ON CONFLICT (id) DO NOTHING;
    `);
  });

  return statements.join('\n');
}
