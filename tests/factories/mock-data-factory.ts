/**
 * Mock Data Factory for Consistent Test Data
 *
 * Provides deterministic, reusable test data for all test suites.
 * Ensures consistent data structures across unit, integration, and performance tests.
 */

import { faker } from '@faker-js/faker';

// Set deterministic seed for reproducible test data
faker.seed(12345);

export interface MockFund {
  id: number;
  name: string;
  fundSize: number;
  vintage: number;
  strategy: string;
  managementFee: number;
  carriedInterest: number;
  targetReturns: {
    irr: number;
    multiple: number;
  };
  created_at: string;
  updated_at: string;
}

export interface MockCompany {
  id: number;
  name: string;
  sector: string;
  stage: string;
  valuation: number;
  investmentAmount: number;
  ownership: number;
  investmentDate: string;
  exitDate?: string;
  exitMultiple?: number;
  status: 'active' | 'exited' | 'written_off';
}

export interface MockCashFlow {
  id: number;
  fundId: number;
  companyId?: number;
  date: string;
  amount: number;
  type: 'investment' | 'distribution' | 'management_fee' | 'other';
  description: string;
}

export interface MockSnapshot {
  id: string;
  fundId: number;
  snapshotName: string;
  snapshotType: 'quarterly' | 'annual' | 'milestone' | 'manual';
  triggerEvent: 'scheduled' | 'manual' | 'investment' | 'exit';
  capturedAt: string;
  portfolioState: {
    totalValue: number;
    deployedCapital: number;
    portfolioCount: number;
    companies: MockCompany[];
    sectorBreakdown: Record<string, number>;
  };
  fundMetrics: {
    irr: number;
    multiple: number;
    dpi: number;
    tvpi: number;
    moic: number;
    unrealizedValue: number;
    realizedValue: number;
  };
  createdBy: number;
}

export interface MockPerformanceData {
  fundId: number;
  quarter: string;
  nav: number;
  totalValue: number;
  cashFlows: MockCashFlow[];
  metrics: {
    irr: number;
    multiple: number;
    dpi: number;
    rvpi: number;
  };
}

class MockDataFactory {
  private fundIdCounter = 1;
  private companyIdCounter = 1;
  private cashFlowIdCounter = 1;

  /**
   * Generate a mock fund with realistic data
   */
  createFund(overrides: Partial<MockFund> = {}): MockFund {
    const fundSize = faker.number.int({ min: 50000000, max: 1000000000 }); // $50M - $1B

    return {
      id: this.fundIdCounter++,
      name: `${faker.company.name()} Fund ${faker.helpers.arrayElement(['I', 'II', 'III', 'IV', 'V'])}`,
      fundSize,
      vintage: faker.number.int({ min: 2015, max: 2024 }),
      strategy: faker.helpers.arrayElement(['Growth', 'Early Stage', 'Late Stage', 'Buyout', 'Venture']),
      managementFee: faker.number.float({ min: 0.015, max: 0.025, fractionDigits: 3 }),
      carriedInterest: faker.number.float({ min: 0.15, max: 0.25, fractionDigits: 2 }),
      targetReturns: {
        irr: faker.number.float({ min: 0.15, max: 0.30, fractionDigits: 3 }),
        multiple: faker.number.float({ min: 2.0, max: 5.0, fractionDigits: 1 })
      },
      created_at: faker.date.past({ years: 2 }).toISOString(),
      updated_at: faker.date.recent().toISOString(),
      ...overrides
    };
  }

  /**
   * Generate a mock portfolio company
   */
  createCompany(overrides: Partial<MockCompany> = {}): MockCompany {
    const investmentAmount = faker.number.int({ min: 500000, max: 10000000 });
    const valuation = investmentAmount * faker.number.float({ min: 3, max: 15 });
    const ownership = faker.number.float({ min: 0.05, max: 0.35, fractionDigits: 3 });

    return {
      id: this.companyIdCounter++,
      name: faker.company.name(),
      sector: faker.helpers.arrayElement([
        'Technology', 'Healthcare', 'Financial Services', 'Consumer',
        'Industrial', 'Energy', 'Real Estate', 'Media'
      ]),
      stage: faker.helpers.arrayElement(['Seed', 'Series A', 'Series B', 'Series C', 'Growth', 'Late Stage']),
      valuation,
      investmentAmount,
      ownership,
      investmentDate: faker.date.past({ years: 3 }).toISOString().split('T')[0],
      status: faker.helpers.arrayElement(['active', 'active', 'active', 'exited', 'written_off']) as MockCompany['status'],
      ...overrides
    };
  }

  /**
   * Generate cash flow data
   */
  createCashFlow(fundId: number, overrides: Partial<MockCashFlow> = {}): MockCashFlow {
    const type = faker.helpers.arrayElement(['investment', 'distribution', 'management_fee', 'other']) as MockCashFlow['type'];

    let amount: number;
    switch (type) {
      case 'investment':
        amount = -faker.number.int({ min: 500000, max: 10000000 }); // Negative for outflows
        break;
      case 'distribution':
        amount = faker.number.int({ min: 1000000, max: 50000000 }); // Positive for inflows
        break;
      case 'management_fee':
        amount = -faker.number.int({ min: 100000, max: 2000000 }); // Negative for fees
        break;
      default:
        amount = faker.number.int({ min: -1000000, max: 1000000 });
    }

    return {
      id: this.cashFlowIdCounter++,
      fundId,
      companyId: type === 'investment' || type === 'distribution' ? this.companyIdCounter - 1 : undefined,
      date: faker.date.past({ years: 2 }).toISOString().split('T')[0],
      amount,
      type,
      description: this.generateCashFlowDescription(type),
      ...overrides
    };
  }

  /**
   * Generate cash flow series for a fund
   */
  createCashFlowSeries(fundId: number, count: number = 20): MockCashFlow[] {
    const cashFlows: MockCashFlow[] = [];
    const startDate = new Date('2020-01-01');

    for (let i = 0; i < count; i++) {
      const date = new Date(startDate.getTime() + i * 30 * 24 * 60 * 60 * 1000); // Monthly intervals

      cashFlows.push(this.createCashFlow(fundId, {
        date: date.toISOString().split('T')[0]
      }));
    }

    return cashFlows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  /**
   * Generate a fund state snapshot
   */
  createSnapshot(fundId: number, overrides: Partial<MockSnapshot> = {}): MockSnapshot {
    const companies = Array.from({ length: faker.number.int({ min: 5, max: 25 }) }, () => this.createCompany());
    const totalValue = companies.reduce((sum, company) => sum + company.valuation, 0);
    const deployedCapital = companies.reduce((sum, company) => sum + company.investmentAmount, 0);

    // Calculate sector breakdown
    const sectorBreakdown: Record<string, number> = {};
    companies.forEach(company => {
      sectorBreakdown[company.sector] = (sectorBreakdown[company.sector] || 0) + company.valuation;
    });

    // Normalize to percentages
    Object.keys(sectorBreakdown).forEach(sector => {
      sectorBreakdown[sector] = sectorBreakdown[sector] / totalValue;
    });

    const unrealizedValue = companies
      .filter(c => c.status === 'active')
      .reduce((sum, c) => sum + c.valuation, 0);

    const realizedValue = companies
      .filter(c => c.status === 'exited')
      .reduce((sum, c) => sum + (c.valuation * (c.exitMultiple || 1)), 0);

    const dpi = realizedValue / deployedCapital;
    const tvpi = (unrealizedValue + realizedValue) / deployedCapital;
    const multiple = tvpi;
    const irr = faker.number.float({ min: 0.05, max: 0.35, fractionDigits: 3 });

    return {
      id: faker.string.uuid(),
      fundId,
      snapshotName: `${faker.helpers.arrayElement(['Q1', 'Q2', 'Q3', 'Q4'])} ${faker.number.int({ min: 2020, max: 2024 })} Snapshot`,
      snapshotType: faker.helpers.arrayElement(['quarterly', 'annual', 'milestone', 'manual']),
      triggerEvent: faker.helpers.arrayElement(['scheduled', 'manual', 'investment', 'exit']),
      capturedAt: faker.date.recent().toISOString(),
      portfolioState: {
        totalValue,
        deployedCapital,
        portfolioCount: companies.length,
        companies,
        sectorBreakdown
      },
      fundMetrics: {
        irr,
        multiple,
        dpi,
        tvpi,
        moic: multiple,
        unrealizedValue,
        realizedValue
      },
      createdBy: 1,
      ...overrides
    };
  }

  /**
   * Generate performance data series
   */
  createPerformanceData(fundId: number, quarters: number = 16): MockPerformanceData[] {
    const data: MockPerformanceData[] = [];
    const startDate = new Date('2020-01-01');

    for (let i = 0; i < quarters; i++) {
      const quarterDate = new Date(startDate.getTime() + i * 3 * 30 * 24 * 60 * 60 * 1000);
      const quarter = `${quarterDate.getFullYear()}-Q${Math.floor(quarterDate.getMonth() / 3) + 1}`;

      const cashFlows = this.createCashFlowSeries(fundId, 3); // 3 cash flows per quarter
      const totalValue = faker.number.int({ min: 10000000, max: 100000000 });
      const nav = totalValue * faker.number.float({ min: 0.8, max: 1.2 });

      data.push({
        fundId,
        quarter,
        nav,
        totalValue,
        cashFlows,
        metrics: {
          irr: faker.number.float({ min: 0.05, max: 0.30, fractionDigits: 3 }),
          multiple: faker.number.float({ min: 1.0, max: 4.0, fractionDigits: 2 }),
          dpi: faker.number.float({ min: 0.0, max: 2.0, fractionDigits: 2 }),
          rvpi: faker.number.float({ min: 0.5, max: 3.0, fractionDigits: 2 })
        }
      });
    }

    return data;
  }

  /**
   * Generate Monte Carlo simulation input data
   */
  createMonteCarloInputs(scenarios: number = 1000) {
    return {
      scenarios,
      assumptions: {
        exitMultipleRange: { min: 0.5, max: 8.0 },
        timeToExitRange: { min: 3, max: 10 },
        successRate: 0.7,
        totalLossRate: 0.1,
        correlationMatrix: this.generateCorrelationMatrix(5),
        marketVolatility: faker.number.float({ min: 0.15, max: 0.35 })
      },
      portfolioCompanies: Array.from({ length: 20 }, () => ({
        id: faker.number.int({ min: 1, max: 1000 }),
        investmentAmount: faker.number.int({ min: 500000, max: 5000000 }),
        currentValuation: faker.number.int({ min: 1000000, max: 25000000 }),
        sector: faker.helpers.arrayElement(['Technology', 'Healthcare', 'Financial Services']),
        stage: faker.helpers.arrayElement(['Series A', 'Series B', 'Growth']),
        riskProfile: faker.helpers.arrayElement(['low', 'medium', 'high'])
      }))
    };
  }

  /**
   * Generate XIRR test data
   */
  createXIRRTestData(complexity: 'simple' | 'medium' | 'complex' = 'medium') {
    const flowCounts = { simple: 6, medium: 24, complex: 60 };
    const count = flowCounts[complexity];

    const startDate = new Date('2020-01-01');
    const cashFlows = [];

    // Initial investment (negative)
    cashFlows.push({
      date: startDate,
      amount: -faker.number.int({ min: 1000000, max: 10000000 })
    });

    // Subsequent investments and distributions
    for (let i = 1; i < count; i++) {
      const date = new Date(startDate.getTime() + i * 30 * 24 * 60 * 60 * 1000);
      const isDistribution = faker.datatype.boolean(0.3); // 30% chance of distribution

      cashFlows.push({
        date,
        amount: isDistribution
          ? faker.number.int({ min: 500000, max: 5000000 }) // Positive distribution
          : -faker.number.int({ min: 100000, max: 2000000 }) // Negative investment
      });
    }

    return cashFlows;
  }

  /**
   * Create test data for database schema tests
   */
  createDatabaseTestData() {
    return {
      fund: this.createFund(),
      companies: Array.from({ length: 5 }, () => this.createCompany()),
      cashFlows: this.createCashFlowSeries(1, 10),
      snapshot: this.createSnapshot(1),
      user: {
        id: 1,
        email: faker.internet.email(),
        name: faker.person.fullName(),
        role: 'admin'
      }
    };
  }

  /**
   * Create consistent test datasets for different test scenarios
   */
  createTestDataset(scenario: 'small' | 'medium' | 'large' | 'stress') {
    const configs = {
      small: { funds: 1, companiesPerFund: 5, cashFlowsPerFund: 10 },
      medium: { funds: 3, companiesPerFund: 15, cashFlowsPerFund: 30 },
      large: { funds: 10, companiesPerFund: 50, cashFlowsPerFund: 100 },
      stress: { funds: 25, companiesPerFund: 200, cashFlowsPerFund: 500 }
    };

    const config = configs[scenario];
    const dataset = {
      funds: [] as MockFund[],
      companies: [] as MockCompany[],
      cashFlows: [] as MockCashFlow[],
      snapshots: [] as MockSnapshot[],
      performanceData: [] as MockPerformanceData[]
    };

    // Generate funds
    for (let i = 0; i < config.funds; i++) {
      const fund = this.createFund();
      dataset.funds.push(fund);

      // Generate companies for this fund
      const companies = Array.from({ length: config.companiesPerFund }, () => this.createCompany());
      dataset.companies.push(...companies);

      // Generate cash flows for this fund
      const cashFlows = this.createCashFlowSeries(fund.id, config.cashFlowsPerFund);
      dataset.cashFlows.push(...cashFlows);

      // Generate snapshots
      const snapshot = this.createSnapshot(fund.id);
      dataset.snapshots.push(snapshot);

      // Generate performance data
      const performanceData = this.createPerformanceData(fund.id);
      dataset.performanceData.push(...performanceData);
    }

    return dataset;
  }

  /**
   * Reset all counters for deterministic testing
   */
  reset(): void {
    this.fundIdCounter = 1;
    this.companyIdCounter = 1;
    this.cashFlowIdCounter = 1;
    faker.seed(12345); // Reset faker seed
  }

  /**
   * Generate cash flow description based on type
   */
  private generateCashFlowDescription(type: MockCashFlow['type']): string {
    switch (type) {
      case 'investment':
        return `Investment in ${faker.company.name()}`;
      case 'distribution':
        return `Distribution from ${faker.company.name()} exit`;
      case 'management_fee':
        return `Management fee - ${faker.helpers.arrayElement(['Q1', 'Q2', 'Q3', 'Q4'])} payment`;
      default:
        return `Other transaction - ${faker.lorem.words(3)}`;
    }
  }

  /**
   * Generate correlation matrix for Monte Carlo simulations
   */
  private generateCorrelationMatrix(size: number): number[][] {
    const matrix: number[][] = [];

    for (let i = 0; i < size; i++) {
      matrix[i] = [];
      for (let j = 0; j < size; j++) {
        if (i === j) {
          matrix[i][j] = 1.0; // Perfect correlation with itself
        } else {
          matrix[i][j] = faker.number.float({ min: -0.3, max: 0.7, fractionDigits: 2 });
        }
      }
    }

    return matrix;
  }
}

// Export singleton instance
export const mockDataFactory = new MockDataFactory();

// Export utility functions for common test data patterns
export const testDataUtils = {
  /**
   * Create minimal fund for quick tests
   */
  createMinimalFund(): MockFund {
    return mockDataFactory.createFund({
      name: 'Test Fund',
      fundSize: 100000000,
      vintage: 2022
    });
  },

  /**
   * Create fund with portfolio for calculation tests
   */
  createFundWithPortfolio() {
    const fund = mockDataFactory.createFund();
    const companies = Array.from({ length: 10 }, () => mockDataFactory.createCompany());
    const cashFlows = mockDataFactory.createCashFlowSeries(fund.id, 20);

    return { fund, companies, cashFlows };
  },

  /**
   * Create XIRR test scenarios
   */
  createXIRRScenarios() {
    return {
      simple: mockDataFactory.createXIRRTestData('simple'),
      medium: mockDataFactory.createXIRRTestData('medium'),
      complex: mockDataFactory.createXIRRTestData('complex')
    };
  },

  /**
   * Create database test fixtures
   */
  createDatabaseFixtures() {
    return mockDataFactory.createDatabaseTestData();
  }
};

export default mockDataFactory;