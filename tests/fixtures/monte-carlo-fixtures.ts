/**
 * Monte Carlo Test Fixtures
 *
 * Database-free test fixtures for Monte Carlo simulations.
 * Provides realistic VC fund data for unit testing without database dependencies.
 */

/**
 * Options for creating a mock fund baseline
 */
export interface MockFundBaselineOptions {
  id?: number;
  fundId?: number;
  version?: number;
  projectedIrr?: number;
  projectedMultiple?: number;
  vintageYear?: number;
  fundSize?: number;
}

/**
 * Options for creating mock variance reports
 */
export interface MockVarianceReportOptions {
  count?: number;
  fundId?: number;
  baselineId?: number;
}

/**
 * Options for creating a mock fund
 */
export interface MockFundOptions {
  id?: number;
  name?: string;
  status?: 'active' | 'closed' | 'raising';
  vintage?: number;
  targetSize?: number;
}

/**
 * Fund baseline data structure
 */
export interface FundBaselineData {
  id: number;
  fundId: number;
  version: number;
  projectedIrr: number;
  projectedMultiple: number;
  vintageYear: number;
  fundSize: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Variance report data structure
 */
export interface VarianceReportData {
  id: number;
  fundId: number;
  baselineId: number;
  reportYear: number;
  irrVariance: number;
  multipleVariance: number;
  createdAt: Date;
}

/**
 * Fund data structure
 */
export interface FundData {
  id: number;
  name: string;
  status: 'active' | 'closed' | 'raising';
  vintage: number;
  targetSize: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Complete Monte Carlo dataset
 */
export interface MonteCarloDataset {
  fund: FundData;
  baseline: FundBaselineData;
  varianceReports: VarianceReportData[];
}

let idCounter = 1;

export function resetIdCounter(): void {
  idCounter = 1;
}

function generateId(): number {
  return idCounter++;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Creates a mock fund baseline with realistic VC fund data.
 */
export function createMockFundBaseline(options: MockFundBaselineOptions = {}): FundBaselineData {
  const id = options.id ?? generateId();
  const fundId = options.fundId ?? generateId();
  const now = new Date();

  const projectedIrr = clamp(options.projectedIrr ?? randomInRange(0.12, 0.28), -0.5, 1.0);

  const projectedMultiple = Math.max(0.1, options.projectedMultiple ?? randomInRange(1.8, 3.2));

  return {
    id,
    fundId,
    version: options.version ?? 1,
    projectedIrr,
    projectedMultiple,
    vintageYear: options.vintageYear ?? new Date().getFullYear() - 2,
    fundSize: options.fundSize ?? randomInRange(100_000_000, 500_000_000),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Creates an array of mock variance reports.
 */
export function createMockVarianceReports(
  options: MockVarianceReportOptions = {}
): VarianceReportData[] {
  const count = options.count ?? 5;
  const fundId = options.fundId ?? generateId();
  const baselineId = options.baselineId ?? generateId();

  const reports: VarianceReportData[] = [];

  for (let i = 0; i < count; i++) {
    reports.push({
      id: generateId(),
      fundId,
      baselineId,
      reportYear: 2019 + i,
      irrVariance: clamp(randomInRange(-0.05, 0.05), -0.5, 0.5),
      multipleVariance: clamp(randomInRange(-0.3, 0.3), -1.0, 1.0),
      createdAt: new Date(2019 + i, 11, 31),
    });
  }

  return reports.sort((a, b) => a.reportYear - b.reportYear);
}

/**
 * Creates a mock fund with realistic VC fund characteristics.
 */
export function createMockFund(options: MockFundOptions = {}): FundData {
  const id = options.id ?? generateId();
  const now = new Date();

  return {
    id,
    name: options.name ?? `Test Fund ${id}`,
    status: options.status ?? 'active',
    vintage: options.vintage ?? new Date().getFullYear() - 2,
    targetSize: options.targetSize ?? randomInRange(100_000_000, 500_000_000),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Creates a complete Monte Carlo dataset.
 */
export function createMockMonteCarloDataset(): MonteCarloDataset {
  const fund = createMockFund();
  const baseline = createMockFundBaseline({ fundId: fund.id });
  const varianceReports = createMockVarianceReports({
    fundId: fund.id,
    baselineId: baseline.id,
  });

  return { fund, baseline, varianceReports };
}
