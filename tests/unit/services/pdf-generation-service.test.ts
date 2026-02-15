/**
 * PDF Generation Service - Data Builder Unit Tests
 *
 * Tests the data transformation logic in report generation:
 * - buildK1ReportData: Tax allocation calculations
 * - buildQuarterlyReportData: NAV, TVPI, DPI calculations
 * - buildCapitalAccountReportData: Transaction history and running balance
 *
 * @group unit
 * @group lp-portal
 * @group reports
 */

import { describe, it, expect } from 'vitest';
import {
  buildK1ReportData,
  buildQuarterlyReportData,
  buildCapitalAccountReportData,
} from '../../../server/services/pdf-generation-service';
import {
  standardLPData,
  newLPData,
  earlyStageLP,
  matureFundLP,
  multiYearTransactionsLP,
  calculateExpectedTotals,
} from '../../fixtures/lp-report-fixtures';

// ============================================================================
// K-1 REPORT DATA BUILDER TESTS
// ============================================================================

describe('buildK1ReportData', () => {
  describe('basic functionality', () => {
    it('should build K-1 data with correct partner information', () => {
      const result = buildK1ReportData(standardLPData, 1, 2024);

      expect(result.partnerName).toBe('Acme Investments LLC');
      expect(result.fundName).toBe('Venture Fund I');
      expect(result.taxYear).toBe(2024);
    });

    it('should throw error for non-existent fund commitment', () => {
      expect(() => {
        buildK1ReportData(standardLPData, 999, 2024);
      }).toThrow('LP has no commitment to fund 999');
    });

    it('should filter transactions by tax year', () => {
      // 2024 has transactions, 2023 should have none for this fund
      const result2024 = buildK1ReportData(multiYearTransactionsLP, 6, 2024);
      const result2023 = buildK1ReportData(multiYearTransactionsLP, 6, 2023);

      // 2024 has 3 transactions (2 calls + 1 distribution)
      expect(result2024.capitalAccount.contributions).toBeGreaterThan(0);

      // 2023 has 2 transactions (1 call + 1 distribution)
      expect(result2023.capitalAccount.contributions).toBeGreaterThan(0);
    });
  });

  describe('capital account calculations', () => {
    it('should calculate contributions from capital calls', () => {
      const result = buildK1ReportData(standardLPData, 1, 2024);
      const expected = calculateExpectedTotals(standardLPData, 1, 2024);

      expect(result.capitalAccount.contributions).toBe(expected.contributions);
    });

    it('should calculate distributions correctly', () => {
      const result = buildK1ReportData(standardLPData, 1, 2024);
      const expected = calculateExpectedTotals(standardLPData, 1, 2024);

      expect(result.capitalAccount.distributions).toBe(expected.distributions);
    });

    it('should handle LP with no transactions', () => {
      const result = buildK1ReportData(newLPData, 1, 2024);

      expect(result.capitalAccount.contributions).toBe(0);
      expect(result.capitalAccount.distributions).toBe(0);
      expect(result.distributions).toHaveLength(0);
    });

    it('should handle LP with only capital calls (no distributions)', () => {
      const result = buildK1ReportData(earlyStageLP, 3, 2024);

      expect(result.capitalAccount.contributions).toBeGreaterThan(0);
      expect(result.capitalAccount.distributions).toBe(0);
      expect(result.distributions).toHaveLength(0);
    });
  });

  describe('tax allocations', () => {
    it('should calculate tax allocations based on distributions', () => {
      const result = buildK1ReportData(standardLPData, 1, 2024);

      // Allocations should be calculated (based on 30% of distributions as income)
      expect(result.allocations.ordinaryIncome).toBeGreaterThanOrEqual(0);
      expect(result.allocations.capitalGainsLongTerm).toBeGreaterThanOrEqual(0);
      expect(result.allocations.capitalGainsShortTerm).toBeGreaterThanOrEqual(0);
    });

    it('should have zero allocations when no distributions', () => {
      const result = buildK1ReportData(newLPData, 1, 2024);

      expect(result.allocations.ordinaryIncome).toBe(0);
      expect(result.allocations.capitalGainsLongTerm).toBe(0);
      expect(result.allocations.capitalGainsShortTerm).toBe(0);
    });

    it('should allocate majority to long-term capital gains', () => {
      const result = buildK1ReportData(matureFundLP, 4, 2024);
      // Sum all non-zero allocations
      const totalAllocations =
        result.allocations.ordinaryIncome +
        result.allocations.capitalGainsShortTerm +
        result.allocations.capitalGainsLongTerm +
        result.allocations.interestIncome +
        result.allocations.dividendIncome;

      // Long-term gains should be 75% of total income per the algorithm
      if (totalAllocations > 0) {
        expect(result.allocations.capitalGainsLongTerm / totalAllocations).toBeCloseTo(0.75, 1);
      }
    });
  });

  describe('distribution list', () => {
    it('should include all distribution types', () => {
      const result = buildK1ReportData(standardLPData, 1, 2024);

      // Should have both regular and recallable distributions
      const distributionTypes = result.distributions.map((d) => d.type);
      expect(distributionTypes).toContain('Cash');
      expect(distributionTypes).toContain('Recallable');
    });

    it('should format dates correctly', () => {
      const result = buildK1ReportData(standardLPData, 1, 2024);

      result.distributions.forEach((d) => {
        expect(d.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    });

    it('should use absolute values for distribution amounts', () => {
      const result = buildK1ReportData(standardLPData, 1, 2024);

      result.distributions.forEach((d) => {
        expect(d.amount).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('footnotes', () => {
    it('should include standard footnotes', () => {
      const result = buildK1ReportData(standardLPData, 1, 2024);

      expect(result.footnotes).toBeDefined();
      expect(result.footnotes?.length).toBeGreaterThan(0);
      expect(result.footnotes?.some((f) => f.toLowerCase().includes('preliminary'))).toBe(true);
    });
  });
});

// ============================================================================
// QUARTERLY REPORT DATA BUILDER TESTS
// ============================================================================

describe('buildQuarterlyReportData', () => {
  describe('basic functionality', () => {
    it('should build quarterly data with correct fund and LP info', () => {
      const result = buildQuarterlyReportData(standardLPData, 1, 'Q3', 2024);

      expect(result.fundName).toBe('Venture Fund I');
      expect(result.lpName).toBe('Acme Investments LLC');
      expect(result.quarter).toBe('Q3');
      expect(result.year).toBe(2024);
    });

    it('should throw error for non-existent fund commitment', () => {
      expect(() => {
        buildQuarterlyReportData(standardLPData, 999, 'Q3', 2024);
      }).toThrow('LP has no commitment to fund 999');
    });
  });

  describe('summary calculations', () => {
    it('should calculate totalCommitted from commitment', () => {
      const result = buildQuarterlyReportData(standardLPData, 1, 'Q3', 2024);

      expect(result.summary.totalCommitted).toBe(5_000_000);
    });

    it('should calculate totalCalled from capital calls', () => {
      const result = buildQuarterlyReportData(standardLPData, 1, 'Q3', 2024);
      const expected = calculateExpectedTotals(standardLPData, 1);

      expect(result.summary.totalCalled).toBe(expected.contributions);
    });

    it('should calculate totalDistributed from distributions', () => {
      const result = buildQuarterlyReportData(standardLPData, 1, 'Q3', 2024);
      const expected = calculateExpectedTotals(standardLPData, 1);

      expect(result.summary.totalDistributed).toBe(expected.distributions);
    });

    it('should calculate unfunded commitment correctly', () => {
      const result = buildQuarterlyReportData(standardLPData, 1, 'Q3', 2024);
      const expectedUnfunded = result.summary.totalCommitted - result.summary.totalCalled;

      expect(result.summary.unfunded).toBe(expectedUnfunded);
    });
  });

  describe('performance metrics', () => {
    it('should calculate positive NAV for LP with net contributions', () => {
      const result = buildQuarterlyReportData(earlyStageLP, 3, 'Q3', 2024);

      // NAV should be positive when called > distributed
      expect(result.summary.nav).toBeGreaterThan(0);
    });

    it('should calculate TVPI greater than or equal to DPI', () => {
      const result = buildQuarterlyReportData(standardLPData, 1, 'Q3', 2024);

      // TVPI includes unrealized value, so should be >= DPI
      expect(result.summary.tvpi).toBeGreaterThanOrEqual(result.summary.dpi);
    });

    it('should have DPI of 0 when no distributions', () => {
      const result = buildQuarterlyReportData(earlyStageLP, 3, 'Q3', 2024);

      expect(result.summary.dpi).toBe(0);
    });

    it('should have TVPI of 1 when no capital called', () => {
      const result = buildQuarterlyReportData(newLPData, 1, 'Q3', 2024);

      expect(result.summary.tvpi).toBe(1);
    });

    it('should calculate DPI > 1 for mature fund with distributions exceeding calls', () => {
      const result = buildQuarterlyReportData(matureFundLP, 4, 'Q3', 2024);

      // Mature fund: 3M called, 3.1M distributed -> DPI > 1
      expect(result.summary.dpi).toBeGreaterThan(1);
    });
  });

  describe('portfolio companies', () => {
    it('should include portfolio companies list', () => {
      const result = buildQuarterlyReportData(standardLPData, 1, 'Q3', 2024);

      expect(result.portfolioCompanies).toBeDefined();
      expect(result.portfolioCompanies.length).toBeGreaterThan(0);
    });

    it('should have valid MOIC for each company', () => {
      const result = buildQuarterlyReportData(standardLPData, 1, 'Q3', 2024);

      result.portfolioCompanies.forEach((company) => {
        expect(company.moic).toBeGreaterThan(0);
        expect(company.invested).toBeGreaterThanOrEqual(0);
        expect(company.value).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('cash flows', () => {
    it('should include recent cash flows', () => {
      const result = buildQuarterlyReportData(standardLPData, 1, 'Q3', 2024);

      expect(result.cashFlows).toBeDefined();
      expect(result.cashFlows?.length).toBeGreaterThan(0);
    });

    it('should format cash flow dates correctly', () => {
      const result = buildQuarterlyReportData(standardLPData, 1, 'Q3', 2024);

      result.cashFlows?.forEach((cf) => {
        expect(cf.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(['contribution', 'distribution']).toContain(cf.type);
        expect(cf.amount).toBeGreaterThanOrEqual(0);
      });
    });

    it('should have empty cash flows for new LP', () => {
      const result = buildQuarterlyReportData(newLPData, 1, 'Q3', 2024);

      expect(result.cashFlows).toHaveLength(0);
    });
  });

  describe('commentary', () => {
    it('should include fund commentary', () => {
      const result = buildQuarterlyReportData(standardLPData, 1, 'Q3', 2024);

      expect(result.commentary).toBeDefined();
      expect(result.commentary?.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// CAPITAL ACCOUNT REPORT DATA BUILDER TESTS
// ============================================================================

describe('buildCapitalAccountReportData', () => {
  const asOfDate = new Date('2024-12-31');

  describe('basic functionality', () => {
    it('should build capital account data with correct LP and fund info', () => {
      const result = buildCapitalAccountReportData(standardLPData, 1, asOfDate);

      expect(result.lpName).toBe('Acme Investments LLC');
      expect(result.fundName).toBe('Venture Fund I');
      expect(result.commitment).toBe(5_000_000);
    });

    it('should format as-of date correctly', () => {
      const result = buildCapitalAccountReportData(standardLPData, 1, asOfDate);

      expect(result.asOfDate).toBe('2024-12-31');
    });

    it('should throw error for non-existent fund commitment', () => {
      expect(() => {
        buildCapitalAccountReportData(standardLPData, 999, asOfDate);
      }).toThrow('LP has no commitment to fund 999');
    });
  });

  describe('transaction history', () => {
    it('should list transactions in chronological order', () => {
      const result = buildCapitalAccountReportData(standardLPData, 1, asOfDate);

      for (let i = 1; i < result.transactions.length; i++) {
        const prevDate = new Date(result.transactions[i - 1].date);
        const currDate = new Date(result.transactions[i].date);
        expect(currDate.getTime()).toBeGreaterThanOrEqual(prevDate.getTime());
      }
    });

    it('should filter transactions by as-of date', () => {
      const earlyDate = new Date('2024-06-01');
      const result = buildCapitalAccountReportData(standardLPData, 1, earlyDate);

      result.transactions.forEach((t) => {
        expect(new Date(t.date).getTime()).toBeLessThanOrEqual(earlyDate.getTime());
      });
    });

    it('should have empty transactions for new LP', () => {
      const result = buildCapitalAccountReportData(newLPData, 1, asOfDate);

      expect(result.transactions).toHaveLength(0);
    });

    it('should format transaction types correctly', () => {
      const result = buildCapitalAccountReportData(standardLPData, 1, asOfDate);

      result.transactions.forEach((t) => {
        expect(['Capital Call', 'Distribution']).toContain(t.type);
      });
    });
  });

  describe('running balance calculation', () => {
    it('should calculate running balance correctly', () => {
      const result = buildCapitalAccountReportData(standardLPData, 1, asOfDate);

      let expectedBalance = 0;
      result.transactions.forEach((t) => {
        expectedBalance += t.amount; // amount is already signed (+/-)
        expect(t.balance).toBe(expectedBalance);
      });
    });

    it('should have positive balance after capital calls only', () => {
      const result = buildCapitalAccountReportData(earlyStageLP, 3, asOfDate);

      expect(result.transactions.length).toBeGreaterThan(0);
      result.transactions.forEach((t) => {
        expect(t.balance).toBeGreaterThanOrEqual(0);
      });
    });

    it('should reflect balance decrease after distributions', () => {
      const result = buildCapitalAccountReportData(standardLPData, 1, asOfDate);

      // Find a distribution and verify balance decreased
      for (let i = 1; i < result.transactions.length; i++) {
        if (result.transactions[i].type === 'Distribution') {
          expect(result.transactions[i].balance).toBeLessThan(result.transactions[i - 1].balance);
        }
      }
    });
  });

  describe('summary calculations', () => {
    it('should calculate totalContributions correctly', () => {
      const result = buildCapitalAccountReportData(standardLPData, 1, asOfDate);
      const expected = calculateExpectedTotals(standardLPData, 1);

      expect(result.summary.totalContributions).toBe(expected.contributions);
    });

    it('should calculate totalDistributions correctly', () => {
      const result = buildCapitalAccountReportData(standardLPData, 1, asOfDate);
      const expected = calculateExpectedTotals(standardLPData, 1);

      expect(result.summary.totalDistributions).toBe(expected.distributions);
    });

    it('should have endingBalance equal to last transaction balance', () => {
      const result = buildCapitalAccountReportData(standardLPData, 1, asOfDate);

      if (result.transactions.length > 0) {
        const lastTransaction = result.transactions[result.transactions.length - 1];
        expect(result.summary.endingBalance).toBe(lastTransaction.balance);
      } else {
        expect(result.summary.endingBalance).toBe(0);
      }
    });

    it('should have zero balances for new LP', () => {
      const result = buildCapitalAccountReportData(newLPData, 1, asOfDate);

      expect(result.summary.totalContributions).toBe(0);
      expect(result.summary.totalDistributions).toBe(0);
      expect(result.summary.endingBalance).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle transactions on same date', () => {
      // Add same-day transactions to test ordering
      const sameDayData = {
        ...standardLPData,
        transactions: [
          ...standardLPData.transactions,
          {
            commitmentId: 101,
            fundId: 1,
            date: new Date('2024-06-15'), // Same as existing distribution
            type: 'capital_call',
            amount: 50_000,
            description: 'Same-day call',
          },
        ],
      };

      const result = buildCapitalAccountReportData(sameDayData, 1, asOfDate);

      // Should not throw and should include all transactions
      expect(result.transactions.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle large number of transactions', () => {
      // Use multi-year data which has more transactions
      const result = buildCapitalAccountReportData(multiYearTransactionsLP, 6, asOfDate);

      expect(result.transactions.length).toBeGreaterThan(5);
      expect(result.summary.endingBalance).toBeDefined();
    });
  });
});

// ============================================================================
// CROSS-CUTTING TESTS
// ============================================================================

describe('Data Builder Cross-Cutting Concerns', () => {
  it('should handle same LP data for different report types', () => {
    const k1 = buildK1ReportData(standardLPData, 1, 2024);
    const quarterly = buildQuarterlyReportData(standardLPData, 1, 'Q3', 2024);
    const capitalAccount = buildCapitalAccountReportData(standardLPData, 1, new Date('2024-12-31'));

    // All should have consistent LP/fund names
    expect(k1.partnerName).toBe(quarterly.lpName);
    expect(quarterly.lpName).toBe(capitalAccount.lpName);
    expect(k1.fundName).toBe(quarterly.fundName);
    expect(quarterly.fundName).toBe(capitalAccount.fundName);
  });

  it('should produce consistent contribution totals across report types', () => {
    const quarterly = buildQuarterlyReportData(standardLPData, 1, 'Q3', 2024);
    const capitalAccount = buildCapitalAccountReportData(standardLPData, 1, new Date('2024-12-31'));

    // Total contributions should match
    expect(quarterly.summary.totalCalled).toBe(capitalAccount.summary.totalContributions);
  });

  it('should produce consistent distribution totals across report types', () => {
    const quarterly = buildQuarterlyReportData(standardLPData, 1, 'Q3', 2024);
    const capitalAccount = buildCapitalAccountReportData(standardLPData, 1, new Date('2024-12-31'));

    // Total distributions should match
    expect(quarterly.summary.totalDistributed).toBe(capitalAccount.summary.totalDistributions);
  });
});

// ============================================================================
// REPORT METRICS DI TESTS
// ============================================================================

describe('buildQuarterlyReportData with ReportMetrics', () => {
  const realMetrics = {
    irr: 0.22,
    tvpi: 1.45,
    dpi: 0.38,
    portfolioCompanies: [
      { name: 'AlphaAI', invested: 500_000, value: 750_000, moic: 1.5 },
      { name: 'BetaCloud', invested: 300_000, value: 420_000, moic: 1.4 },
    ],
  };

  it('should use real IRR/TVPI/DPI when metrics provided', () => {
    const result = buildQuarterlyReportData(standardLPData, 1, 'Q3', 2024, realMetrics);

    expect(result.summary.irr).toBe(0.22);
    expect(result.summary.tvpi).toBe(1.45);
    expect(result.summary.dpi).toBe(0.38);
  });

  it('should derive NAV from real TVPI', () => {
    const result = buildQuarterlyReportData(standardLPData, 1, 'Q3', 2024, realMetrics);

    // NAV = totalCalled * tvpi - totalDistributed
    const expected = result.summary.totalCalled * 1.45 - result.summary.totalDistributed;
    expect(result.summary.nav).toBeCloseTo(expected, 2);
  });

  it('should use real portfolio companies when metrics provided', () => {
    const result = buildQuarterlyReportData(standardLPData, 1, 'Q3', 2024, realMetrics);

    expect(result.portfolioCompanies).toHaveLength(2);
    expect(result.portfolioCompanies[0].name).toBe('AlphaAI');
    expect(result.portfolioCompanies[1].name).toBe('BetaCloud');
  });

  it('should use empty portfolio companies array when metrics has empty array', () => {
    const emptyMetrics = { ...realMetrics, portfolioCompanies: [] };
    const result = buildQuarterlyReportData(standardLPData, 1, 'Q3', 2024, emptyMetrics);

    expect(result.portfolioCompanies).toHaveLength(0);
  });

  it('should fall back to placeholder IRR when metrics undefined', () => {
    const result = buildQuarterlyReportData(standardLPData, 1, 'Q3', 2024, undefined);

    // Placeholder IRR is 0.15
    expect(result.summary.irr).toBe(0.15);
  });

  it('should fall back to placeholder portfolio companies when metrics undefined', () => {
    const result = buildQuarterlyReportData(standardLPData, 1, 'Q3', 2024, undefined);

    // Placeholder has 5 fictional companies
    expect(result.portfolioCompanies).toHaveLength(5);
    expect(result.portfolioCompanies[0].name).toBe('TechCo Series B');
  });

  it('should include all cash flows without artificial cap', () => {
    const result = buildQuarterlyReportData(standardLPData, 1, 'Q3', 2024);
    const txCount = standardLPData.transactions.filter((t) => t.commitmentId === 101).length;

    expect(result.cashFlows?.length).toBe(txCount);
  });
});

// ============================================================================
// K-1 PRELIMINARY FLAG TESTS
// ============================================================================

describe('buildK1ReportData preliminary marking', () => {
  it('should set preliminary flag to true', () => {
    const result = buildK1ReportData(standardLPData, 1, 2024);

    expect(result.preliminary).toBe(true);
  });

  it('should include PRELIMINARY footnote', () => {
    const result = buildK1ReportData(standardLPData, 1, 2024);

    expect(result.footnotes).toBeDefined();
    expect(result.footnotes!.some((f) => f.startsWith('PRELIMINARY:'))).toBe(true);
  });

  it('should include fund administrator reference in footnote', () => {
    const result = buildK1ReportData(standardLPData, 1, 2024);

    expect(result.footnotes!.some((f) => f.includes('fund administrator'))).toBe(true);
  });
});

// ============================================================================
// CAPITAL ACCOUNT BEGINNING BALANCE TESTS
// ============================================================================

describe('buildCapitalAccountReportData beginning balance', () => {
  it('should be 0 when transactions start from the beginning', () => {
    // For LP with transactions starting from scratch, beginning balance is 0
    // since first tx balance - first tx amount = 0
    const result = buildCapitalAccountReportData(earlyStageLP, 3, new Date('2024-12-31'));

    // First transaction is a capital call, balance = amount, so beginning = balance - amount = 0
    expect(result.summary.beginningBalance).toBe(0);
  });

  it('should be 0 for LP with no transactions', () => {
    const result = buildCapitalAccountReportData(newLPData, 1, new Date('2024-12-31'));

    expect(result.summary.beginningBalance).toBe(0);
  });

  it('should derive from first transaction when mid-history asOfDate', () => {
    // Use a date that excludes early transactions
    const lateDate = new Date('2024-12-31');
    const result = buildCapitalAccountReportData(standardLPData, 1, lateDate);

    if (result.transactions.length > 0) {
      const firstTx = result.transactions[0];
      expect(result.summary.beginningBalance).toBe(firstTx.balance - firstTx.amount);
    }
  });
});
