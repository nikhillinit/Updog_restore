/**
 * Usage examples for the type-safe unit discipline system
 *
 * This file demonstrates best practices for using branded types to prevent
 * unit mismatch bugs in VC fund modeling calculations.
 */

import {
  asFraction,
  asPercentage,
  asDollars,
  fractionToPct,
  pctToFraction,
  formatPct,
  formatDollars,
  formatFractionAsPct,
  type Fraction,
  type Percentage,
  type Dollars,
} from '../units';

import { PercentageSchema, DollarsSchema } from '../schemas/unit-schemas';

// ============================================================================
// Example 1: Type-Safe Ownership Calculation
// ============================================================================

function calculateOwnershipStake(investmentAmount: Dollars, postMoneyValuation: Dollars): Fraction {
  // TypeScript ensures both parameters are Dollars
  const ownershipFraction = investmentAmount / postMoneyValuation;

  // Must validate before returning as Fraction
  return asFraction(ownershipFraction);
}

// Usage:
const investment = asDollars(5_000_000); // $5M investment
const valuation = asDollars(25_000_000); // $25M post-money valuation
const ownership = calculateOwnershipStake(investment, valuation);

// ============================================================================
// Example 2: Management Fee Calculation
// ============================================================================

function calculateAnnualManagementFee(fundSize: Dollars, feeRate: Percentage): Dollars {
  // Convert percentage to fraction for calculation
  const feeRateFraction = pctToFraction(feeRate);

  // Calculate fee amount
  const feeAmount = fundSize * feeRateFraction;

  // Return as validated Dollars
  return asDollars(feeAmount);
}

// Usage:
const fundSize = asDollars(100_000_000); // $100M fund
const mgmtFeeRate = asPercentage(2); // 2% management fee
const annualFee = calculateAnnualManagementFee(fundSize, mgmtFeeRate);

// ============================================================================
// Example 3: Carry Calculation
// ============================================================================

function calculateCarryAmount(totalProfit: Dollars, carryPercentage: Percentage): Dollars {
  const carryFraction = pctToFraction(carryPercentage);
  const carryAmount = totalProfit * carryFraction;
  return asDollars(carryAmount);
}

// Usage:
const profit = asDollars(50_000_000); // $50M profit
const carryRate = asPercentage(20); // 20% carry
const gpCarry = calculateCarryAmount(profit, carryRate);

// ============================================================================
// Example 4: API Validation with Zod
// ============================================================================

import { z } from 'zod';

// Define API schema with unit validation
const InvestmentRequestSchema = z.object({
  companyName: z.string(),
  investmentAmount: DollarsSchema,
  targetOwnership: PercentageSchema,
  expectedReturn: PercentageSchema.optional(),
});

type InvestmentRequest = z.infer<typeof InvestmentRequestSchema>;

// API handler with validated units
function processInvestmentRequest(data: unknown): InvestmentRequest {
  // Zod validates and transforms to branded types
  return InvestmentRequestSchema.parse(data);
}

// Usage:
const requestData = {
  companyName: 'Startup Inc',
  investmentAmount: 5_000_000,
  targetOwnership: 15,
  expectedReturn: 25.5,
};

const validatedRequest = processInvestmentRequest(requestData);
// validatedRequest.investmentAmount is Dollars
// validatedRequest.targetOwnership is Percentage

// ============================================================================
// Example 5: Portfolio Calculations with Multiple Units
// ============================================================================

interface PortfolioCompany {
  name: string;
  investmentAmount: Dollars;
  ownership: Fraction;
  currentValuation: Dollars;
}

function calculatePortfolioValue(companies: PortfolioCompany[]): {
  totalInvested: Dollars;
  currentValue: Dollars;
  averageOwnership: Percentage;
} {
  const totalInvested = companies.reduce((sum, company) => sum + company.investmentAmount, 0);

  const currentValue = companies.reduce(
    (sum, company) => sum + company.currentValuation * company.ownership,
    0
  );

  const avgOwnership = companies.reduce((sum, c) => sum + c.ownership, 0) / companies.length;

  return {
    totalInvested: asDollars(totalInvested),
    currentValue: asDollars(currentValue),
    averageOwnership: fractionToPct(asFraction(avgOwnership)),
  };
}

// Usage:
const portfolio: PortfolioCompany[] = [
  {
    name: 'Company A',
    investmentAmount: asDollars(5_000_000),
    ownership: asFraction(0.2),
    currentValuation: asDollars(50_000_000),
  },
  {
    name: 'Company B',
    investmentAmount: asDollars(3_000_000),
    ownership: asFraction(0.15),
    currentValuation: asDollars(30_000_000),
  },
];

const portfolioMetrics = calculatePortfolioValue(portfolio);

// ============================================================================
// Example 6: Preventing Common Bugs
// ============================================================================

// ❌ INCORRECT: Mixing units causes runtime errors
function buggyCalculation(): string | null {
  try {
    const ownership = asPercentage(20); // 20%
    const fundSize = asDollars(100_000_000);

    // This would be WRONG - multiplying dollars by percentage directly
    // const result = fundSize * ownership; // Would give wrong answer!

    // ✅ CORRECT: Convert percentage to fraction first
    const ownershipFraction = pctToFraction(ownership);
    const result = asDollars(fundSize * ownershipFraction);
    return formatDollars(result);
  } catch (error) {
    console.error('Caught unit mismatch:', error);
    return null;
  }
}

// ❌ INCORRECT: Invalid values are caught
function catchInvalidValues(): {
  invalidPercentage: string | null;
  negativeDollars: string | null;
} {
  let invalidPercentage: string | null = null;
  try {
    // This will throw - ownership > 100%
    void asPercentage(150);
  } catch (error) {
    invalidPercentage = error instanceof Error ? error.message : String(error);
  }

  let negativeDollars: string | null = null;
  try {
    // This will throw - negative dollars
    void asDollars(-1000);
  } catch (error) {
    negativeDollars = error instanceof Error ? error.message : String(error);
  }

  return { invalidPercentage, negativeDollars };
}

// ============================================================================
// Example 7: Database/API Response Transformation
// ============================================================================

// Raw API response
interface RawFundMetrics {
  fundSize: number; // Could be any number
  deploymentRate: number; // Could be fraction or percentage
  averageOwnership: number; // Could be fraction or percentage
}

// Type-safe transformed metrics
interface SafeFundMetrics {
  fundSize: Dollars;
  deploymentRate: Percentage;
  averageOwnership: Fraction;
}

function transformApiResponse(raw: RawFundMetrics): SafeFundMetrics {
  // Validate and transform to branded types
  return {
    fundSize: asDollars(raw.fundSize),
    deploymentRate: asPercentage(raw.deploymentRate), // Assumes API returns 0-100
    averageOwnership: asFraction(raw.averageOwnership), // Assumes API returns 0-1
  };
}

// Usage:
const apiResponse: RawFundMetrics = {
  fundSize: 100_000_000,
  deploymentRate: 65.5,
  averageOwnership: 0.18,
};

const safeMetrics = transformApiResponse(apiResponse);
const usageExampleSummaries = {
  ownership: formatFractionAsPct(ownership),
  annualFee: formatDollars(annualFee),
  gpCarry: formatDollars(gpCarry),
  validatedRequest: {
    investmentAmount: formatDollars(validatedRequest.investmentAmount),
    targetOwnership: formatPct(validatedRequest.targetOwnership),
  },
  portfolioMetrics: {
    totalInvested: formatDollars(portfolioMetrics.totalInvested),
    currentValue: formatDollars(portfolioMetrics.currentValue),
    averageOwnership: formatPct(portfolioMetrics.averageOwnership),
  },
  bugPrevention: {
    correctedCarryExample: buggyCalculation(),
    invalidValueErrors: catchInvalidValues(),
  },
  safeMetrics: {
    fundSize: formatDollars(safeMetrics.fundSize),
    deploymentRate: formatPct(safeMetrics.deploymentRate),
    averageOwnership: formatFractionAsPct(safeMetrics.averageOwnership),
  },
};

// ============================================================================
// Export examples for testing
// ============================================================================

export {
  calculateOwnershipStake,
  calculateAnnualManagementFee,
  calculateCarryAmount,
  processInvestmentRequest,
  calculatePortfolioValue,
  transformApiResponse,
  buggyCalculation,
  catchInvalidValues,
  usageExampleSummaries,
};
