/**
 * Unit tests for Zod unit schemas
 *
 * Tests schema validation and transformation to ensure proper integration
 * with API endpoints and form validation.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  FractionSchema,
  PercentageSchema,
  BasisPointsSchema,
  DollarsSchema,
  OptionalFractionSchema,
  OptionalPercentageSchema,
  NullableFractionSchema,
  NullablePercentageSchema,
  OwnershipPercentageSchema,
  OwnershipFractionSchema,
  FeePercentageSchema,
  InvestmentDollarsSchema,
} from '@shared/schemas/unit-schemas';

// ============================================================================
// Basic Schema Validation
// ============================================================================

describe('FractionSchema', () => {
  it('validates and transforms valid fractions', () => {
    const result = FractionSchema.parse(0.5);
    expect(result).toBe(0.5);
  });

  it('rejects negative values', () => {
    expect(() => FractionSchema.parse(-0.1)).toThrow();
  });

  it('rejects values > 1', () => {
    expect(() => FractionSchema.parse(1.1)).toThrow();
  });

  it('rejects NaN', () => {
    expect(() => FractionSchema.parse(NaN)).toThrow();
  });

  it('rejects Infinity', () => {
    expect(() => FractionSchema.parse(Infinity)).toThrow();
  });

  it('provides clear error messages', () => {
    expect(() => FractionSchema.parse(2)).toThrow(/between 0 and 1/);
  });
});

describe('PercentageSchema', () => {
  it('validates and transforms valid percentages', () => {
    const result = PercentageSchema.parse(25);
    expect(result).toBe(25);
  });

  it('rejects negative values', () => {
    expect(() => PercentageSchema.parse(-1)).toThrow();
  });

  it('rejects values > 100', () => {
    expect(() => PercentageSchema.parse(101)).toThrow();
  });

  it('rejects NaN', () => {
    expect(() => PercentageSchema.parse(NaN)).toThrow();
  });

  it('provides clear error messages', () => {
    expect(() => PercentageSchema.parse(150)).toThrow(/between 0 and 100/);
  });
});

describe('BasisPointsSchema', () => {
  it('validates and transforms valid basis points', () => {
    const result = BasisPointsSchema.parse(250);
    expect(result).toBe(250);
  });

  it('rejects negative values', () => {
    expect(() => BasisPointsSchema.parse(-1)).toThrow();
  });

  it('rejects values > 10000', () => {
    expect(() => BasisPointsSchema.parse(10001)).toThrow();
  });

  it('provides clear error messages', () => {
    expect(() => BasisPointsSchema.parse(15000)).toThrow(/between 0 and 10000/);
  });
});

describe('DollarsSchema', () => {
  it('validates and transforms valid dollar amounts', () => {
    const result = DollarsSchema.parse(1000000);
    expect(result).toBe(1000000);
  });

  it('rejects negative values', () => {
    expect(() => DollarsSchema.parse(-100)).toThrow();
  });

  it('provides clear error messages', () => {
    expect(() => DollarsSchema.parse(-500)).toThrow(/non-negative/);
  });
});

// ============================================================================
// Optional and Nullable Variants
// ============================================================================

describe('Optional schemas', () => {
  it('accepts undefined for OptionalFractionSchema', () => {
    const result = OptionalFractionSchema.parse(undefined);
    expect(result).toBeUndefined();
  });

  it('validates defined values for OptionalPercentageSchema', () => {
    const result = OptionalPercentageSchema.parse(25);
    expect(result).toBe(25);
  });

  it('rejects invalid values even when optional', () => {
    expect(() => OptionalFractionSchema.parse(2)).toThrow();
  });
});

describe('Nullable schemas', () => {
  it('accepts null for NullableFractionSchema', () => {
    const result = NullableFractionSchema.parse(null);
    expect(result).toBeNull();
  });

  it('validates non-null values for NullablePercentageSchema', () => {
    const result = NullablePercentageSchema.parse(50);
    expect(result).toBe(50);
  });

  it('rejects invalid values even when nullable', () => {
    expect(() => NullableFractionSchema.parse(1.5)).toThrow();
  });
});

// ============================================================================
// Domain-Specific Schemas
// ============================================================================

describe('Domain-specific schemas', () => {
  it('OwnershipPercentageSchema validates ownership stakes', () => {
    expect(OwnershipPercentageSchema.parse(20)).toBe(20);
    expect(OwnershipPercentageSchema.parse(0)).toBe(0);
    expect(OwnershipPercentageSchema.parse(100)).toBe(100);
  });

  it('OwnershipFractionSchema validates ownership stakes', () => {
    expect(OwnershipFractionSchema.parse(0.2)).toBe(0.2);
    expect(OwnershipFractionSchema.parse(0)).toBe(0);
    expect(OwnershipFractionSchema.parse(1)).toBe(1);
  });

  it('FeePercentageSchema validates management fees', () => {
    expect(FeePercentageSchema.parse(2)).toBe(2);
    expect(FeePercentageSchema.parse(2.5)).toBe(2.5);
  });

  it('InvestmentDollarsSchema validates investment amounts', () => {
    expect(InvestmentDollarsSchema.parse(1000000)).toBe(1000000);
    expect(InvestmentDollarsSchema.parse(0)).toBe(0);
  });
});

// ============================================================================
// Integration with Objects
// ============================================================================

describe('Schema integration', () => {
  it('works in object schemas', () => {
    const FundSchema = z.object({
      name: z.string(),
      size: DollarsSchema,
      managementFee: PercentageSchema,
      ownership: FractionSchema,
    });

    const result = FundSchema.parse({
      name: 'Test Fund',
      size: 100000000,
      managementFee: 2,
      ownership: 0.2,
    });

    expect(result.size).toBe(100000000);
    expect(result.managementFee).toBe(2);
    expect(result.ownership).toBe(0.2);
  });

  it('validates nested objects', () => {
    const InvestmentSchema = z.object({
      company: z.string(),
      amount: DollarsSchema,
      ownership: PercentageSchema,
      expectedReturn: PercentageSchema.optional(),
    });

    const result = InvestmentSchema.parse({
      company: 'Startup Inc',
      amount: 5000000,
      ownership: 15,
      expectedReturn: 25.5,
    });

    expect(result.amount).toBe(5000000);
    expect(result.ownership).toBe(15);
    expect(result.expectedReturn).toBe(25.5);
  });

  it('catches validation errors in nested objects', () => {
    const PortfolioSchema = z.object({
      investments: z.array(
        z.object({
          amount: DollarsSchema,
          ownership: FractionSchema,
        })
      ),
    });

    expect(() =>
      PortfolioSchema.parse({
        investments: [
          { amount: 1000000, ownership: 0.2 },
          { amount: -500000, ownership: 0.1 }, // Invalid negative amount
        ],
      })
    ).toThrow();
  });
});

// ============================================================================
// API Response Validation
// ============================================================================

describe('API integration', () => {
  it('validates fund metrics response', () => {
    const FundMetricsResponseSchema = z.object({
      fundSize: DollarsSchema,
      deployed: DollarsSchema,
      reserves: DollarsSchema,
      deploymentRate: PercentageSchema,
      averageOwnership: FractionSchema,
    });

    const response = {
      fundSize: 100000000,
      deployed: 60000000,
      reserves: 40000000,
      deploymentRate: 60,
      averageOwnership: 0.18,
    };

    const validated = FundMetricsResponseSchema.parse(response);
    expect(validated.fundSize).toBe(100000000);
    expect(validated.deploymentRate).toBe(60);
    expect(validated.averageOwnership).toBe(0.18);
  });

  it('validates fee calculation input', () => {
    const FeeCalculationSchema = z.object({
      fundSize: DollarsSchema,
      managementFeeRate: PercentageSchema,
      carriedInterestRate: PercentageSchema,
      profitDistribution: FractionSchema,
    });

    const input = {
      fundSize: 250000000,
      managementFeeRate: 2,
      carriedInterestRate: 20,
      profitDistribution: 0.8,
    };

    const validated = FeeCalculationSchema.parse(input);
    expect(validated.managementFeeRate).toBe(2);
    expect(validated.carriedInterestRate).toBe(20);
  });

  it('rejects invalid API input', () => {
    const OwnershipUpdateSchema = z.object({
      companyId: z.string(),
      newOwnership: PercentageSchema,
    });

    expect(() =>
      OwnershipUpdateSchema.parse({
        companyId: 'abc123',
        newOwnership: 150, // Invalid: > 100
      })
    ).toThrow();
  });
});

// ============================================================================
// Type Inference
// ============================================================================

describe('Type inference', () => {
  it('infers correct types from schemas', () => {
    const FundConfigSchema = z.object({
      size: DollarsSchema,
      managementFee: PercentageSchema,
    });

    type FundConfig = z.infer<typeof FundConfigSchema>;

    const config: FundConfig = {
      size: 100000000 as any, // Type assertion to show branded type
      managementFee: 2 as any,
    };

    FundConfigSchema.parse(config);

    expect(config.size).toBeDefined();
    expect(config.managementFee).toBeDefined();
  });
});
