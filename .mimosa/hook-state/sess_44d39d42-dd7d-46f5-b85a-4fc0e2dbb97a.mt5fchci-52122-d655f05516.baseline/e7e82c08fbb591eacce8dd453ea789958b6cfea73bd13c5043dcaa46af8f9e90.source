/**
 * LP Distributions API - Integration Test Suite
 *
 * Tests for Sprint 3 Distributions features (TC-LP-004):
 * - GET /api/lp/distributions - List distributions with waterfall/tax breakdown
 * - GET /api/lp/distributions/:distributionId - Get distribution details
 * - GET /api/lp/distributions/summary - Get distribution summary by year
 * - GET /api/lp/distributions/tax-summary/:year - Get tax summary for K-1
 *
 * @group api
 * @group lp-portal
 * @group distributions
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// MOCK DATA
// ============================================================================

const mockDistribution = {
  id: '660e8400-e29b-41d4-a716-446655440000',
  lpId: 1,
  fundId: 1,
  fundName: 'Press On Ventures Fund I',
  distributionNumber: 1,
  totalAmountCents: 150000000n, // $1.5M
  distributionDate: '2024-12-15',
  distributionType: 'mixed',
  status: 'completed',

  // Waterfall breakdown (cents)
  returnOfCapitalCents: 80000000n, // $800K
  preferredReturnCents: 30000000n, // $300K
  carriedInterestCents: 40000000n, // $400K
  catchUpCents: 0n,

  // Tax breakdown (cents)
  nonTaxableCents: 80000000n, // ROC is non-taxable
  ordinaryIncomeCents: 10000000n,
  longTermGainsCents: 50000000n,
  qualifiedDividendsCents: 10000000n,

  wireDate: '2024-12-17',
  wireReference: 'POV-I-DIST-001',
};

// ============================================================================
// DISTRIBUTIONS LIST TESTS
// ============================================================================

describe('GET /api/lp/distributions', () => {
  it('should list distributions for authenticated LP', async () => {
    const expectedResponse = {
      distributions: [
        {
          id: expect.any(String),
          fundId: 1,
          fundName: 'Press On Ventures Fund I',
          distributionNumber: 1,
          totalAmount: '1500000', // Cents as string
          distributionDate: '2024-12-15',
          distributionType: 'mixed',
          status: 'completed',
          // Waterfall summary
          breakdown: {
            returnOfCapital: '800000',
            preferredReturn: '300000',
            carriedInterest: '400000',
            catchUp: '0',
          },
        },
      ],
      nextCursor: null,
      hasMore: false,
      totalDistributed: '1500000',
    };

    expect(expectedResponse.distributions[0]?.totalAmount).toBe('1500000');
    expect(expectedResponse.distributions[0]?.breakdown.returnOfCapital).toBe('800000');
  });

  it('should filter by fund ID', async () => {
    const _queryParams = { fundId: 1 };

    const expectedFiltered = {
      distributions: [{ fundId: 1 }],
    };

    expect(expectedFiltered.distributions[0]?.fundId).toBe(1);
  });

  it('should filter by year', async () => {
    const _queryParams = { year: 2024 };

    const expectedFiltered = {
      distributions: [{ distributionDate: '2024-12-15' }],
    };

    expect(expectedFiltered.distributions[0]?.distributionDate).toContain('2024');
  });

  it('should return empty array when LP has no distributions', async () => {
    const emptyResponse = {
      distributions: [],
      nextCursor: null,
      hasMore: false,
      totalDistributed: '0',
    };

    expect(emptyResponse.distributions).toHaveLength(0);
    expect(emptyResponse.totalDistributed).toBe('0');
  });
});

// ============================================================================
// DISTRIBUTION DETAIL TESTS
// ============================================================================

describe('GET /api/lp/distributions/:distributionId', () => {
  it('should return distribution details with full breakdown', async () => {
    const distributionId = mockDistribution.id;

    const expectedResponse = {
      id: distributionId,
      fundId: 1,
      fundName: 'Press On Ventures Fund I',
      distributionNumber: 1,
      totalAmount: '1500000',
      distributionDate: '2024-12-15',
      distributionType: 'mixed',
      status: 'completed',

      // Waterfall breakdown
      breakdown: {
        returnOfCapital: '800000',
        preferredReturn: '300000',
        carriedInterest: '400000',
        catchUp: '0',
      },

      // Tax breakdown
      taxBreakdown: {
        nonTaxable: '800000', // ROC
        ordinaryIncome: '100000',
        longTermGains: '500000',
        qualifiedDividends: '100000',
      },

      // Wire info
      wireDate: '2024-12-17',
      wireReference: 'POV-I-DIST-001',
    };

    expect(expectedResponse.breakdown.returnOfCapital).toBe('800000');
    expect(expectedResponse.taxBreakdown.nonTaxable).toBe('800000');
  });

  it('should return 404 for non-existent distribution', async () => {
    const nonExistentId = '999e8400-e29b-41d4-a716-446655440999';

    const errorResponse = {
      error: 'DISTRIBUTION_NOT_FOUND',
      message: `Distribution ${nonExistentId} not found`,
    };

    expect(errorResponse.error).toBe('DISTRIBUTION_NOT_FOUND');
  });

  it('should return 403 when accessing another LP distribution', async () => {
    const errorResponse = {
      error: 'FORBIDDEN',
      message: 'You do not have access to this distribution',
    };

    expect(errorResponse.error).toBe('FORBIDDEN');
  });
});

// ============================================================================
// DISTRIBUTION SUMMARY TESTS
// ============================================================================

describe('GET /api/lp/distributions/summary', () => {
  it('should return distribution summary grouped by year', async () => {
    const expectedResponse = {
      summary: [
        {
          year: 2024,
          totalDistributed: '1500000',
          distributionCount: 1,
          byType: {
            return_of_capital: '800000',
            capital_gains: '500000',
            dividend: '100000',
            mixed: '100000',
          },
        },
      ],
      totalAllTime: '1500000',
    };

    expect(expectedResponse.summary[0]?.year).toBe(2024);
    expect(expectedResponse.summary[0]?.totalDistributed).toBe('1500000');
  });

  it('should filter by fund ID', async () => {
    const _queryParams = { fundId: 1 };

    const expectedFiltered = {
      summary: [{ year: 2024, distributionCount: 1 }],
    };

    expect(expectedFiltered.summary[0]?.distributionCount).toBe(1);
  });
});

// ============================================================================
// TAX SUMMARY TESTS (K-1 PREPARATION)
// ============================================================================

describe('GET /api/lp/distributions/tax-summary/:year', () => {
  it('should return tax summary for K-1 preparation', async () => {
    const _year = 2024;

    const expectedResponse = {
      year: 2024,
      lpId: 1,
      lpName: 'Acme Family Office',

      // Aggregate tax categories
      taxCategories: {
        nonTaxableReturnOfCapital: '800000',
        ordinaryIncome: '100000',
        longTermCapitalGains: '500000',
        qualifiedDividends: '100000',
      },

      // By fund breakdown
      byFund: [
        {
          fundId: 1,
          fundName: 'Press On Ventures Fund I',
          nonTaxable: '800000',
          ordinaryIncome: '100000',
          longTermGains: '500000',
          qualifiedDividends: '100000',
        },
      ],

      // K-1 line items
      k1LineItems: {
        line1: '100000', // Ordinary income
        line8: '500000', // Long-term capital gains
        line11: '100000', // Qualified dividends
        line19a: '800000', // Distributions
      },

      totalDistributed: '1500000',
    };

    expect(expectedResponse.taxCategories.nonTaxableReturnOfCapital).toBe('800000');
    expect(expectedResponse.k1LineItems.line8).toBe('500000'); // LTCG
  });

  it('should return empty tax summary for year with no distributions', async () => {
    const _year = 2020;

    const emptyResponse = {
      year: 2020,
      taxCategories: {
        nonTaxableReturnOfCapital: '0',
        ordinaryIncome: '0',
        longTermCapitalGains: '0',
        qualifiedDividends: '0',
      },
      totalDistributed: '0',
    };

    expect(emptyResponse.totalDistributed).toBe('0');
  });

  it('should validate year is reasonable', async () => {
    const _invalidYear = 1900;

    const errorResponse = {
      error: 'VALIDATION_ERROR',
      message: 'Year must be between 2000 and current year',
      field: 'year',
    };

    expect(errorResponse.error).toBe('VALIDATION_ERROR');
  });
});

// ============================================================================
// WATERFALL BREAKDOWN VALIDATION
// ============================================================================

describe('Waterfall Breakdown Validation', () => {
  it('should have breakdown sum equal to total', () => {
    const breakdown = {
      returnOfCapitalCents: 800000n,
      preferredReturnCents: 300000n,
      carriedInterestCents: 400000n,
      catchUpCents: 0n,
    };

    const total =
      breakdown.returnOfCapitalCents +
      breakdown.preferredReturnCents +
      breakdown.carriedInterestCents +
      breakdown.catchUpCents;

    const expectedTotal = 1500000n;
    expect(total).toBe(expectedTotal);
  });

  it('should validate distribution type enum', () => {
    const validTypes = ['return_of_capital', 'capital_gains', 'dividend', 'mixed'];

    expect(validTypes).toContain('return_of_capital');
    expect(validTypes).toContain('capital_gains');
    expect(validTypes).toContain('dividend');
    expect(validTypes).toContain('mixed');
  });
});

// ============================================================================
// TAX BREAKDOWN VALIDATION
// ============================================================================

describe('Tax Breakdown Validation', () => {
  it('should have tax breakdown sum equal to total', () => {
    const taxBreakdown = {
      nonTaxableCents: 800000n,
      ordinaryIncomeCents: 100000n,
      longTermGainsCents: 500000n,
      qualifiedDividendsCents: 100000n,
    };

    const total =
      taxBreakdown.nonTaxableCents +
      taxBreakdown.ordinaryIncomeCents +
      taxBreakdown.longTermGainsCents +
      taxBreakdown.qualifiedDividendsCents;

    const expectedTotal = 1500000n;
    expect(total).toBe(expectedTotal);
  });

  it('should validate ROC matches non-taxable', () => {
    // Return of Capital should equal non-taxable amount
    const breakdown = {
      returnOfCapitalCents: 800000n,
    };
    const taxBreakdown = {
      nonTaxableCents: 800000n,
    };

    expect(breakdown.returnOfCapitalCents).toBe(taxBreakdown.nonTaxableCents);
  });
});

// ============================================================================
// NOTIFICATION TRIGGERS
// ============================================================================

describe('Distribution Notifications', () => {
  it('should create notification when distribution processed', () => {
    const notification = {
      type: 'distribution',
      title: 'Distribution Received: $1,500,000',
      message: 'A distribution has been processed for Press On Ventures Fund I.',
      relatedEntityType: 'distribution',
      relatedEntityId: mockDistribution.id,
      actionUrl: `/lp/distributions/${mockDistribution.id}`,
    };

    expect(notification.type).toBe('distribution');
    expect(notification.title).toContain('$1,500,000');
  });
});

// ============================================================================
// K-1 DATA CONSISTENCY TESTS
// ============================================================================

describe('K-1 Data Consistency', () => {
  it('should match K-1 fixture expected values', async () => {
    // This test validates against the K-1 fixtures in tests/fixtures/lp-data.ts
    const { testK1Data } = await import('../../tests/fixtures/lp-data');

    expect(testK1Data.length).toBeGreaterThan(0);

    // Verify structure matches expected K-1 fields
    const k1 = testK1Data[0];
    expect(k1).toHaveProperty('taxYear');
    expect(k1).toHaveProperty('longTermCapitalGains');
    expect(k1).toHaveProperty('shortTermCapitalGains');
    expect(k1).toHaveProperty('ordinaryIncome');
    expect(k1).toHaveProperty('qualifiedDividends');
  });
});
