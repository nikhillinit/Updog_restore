import { describe, it, expect } from 'vitest';
import { insertFundSchema } from '../shared/schema';

describe('Fund Schema Validation', () => {
  it('should accept string decimal values for size, deployedCapital, managementFee, and carryPercentage', () => {
    const validFundData = {
      name: 'Test Fund',
      size: '100000000',
      deployedCapital: '0',
      managementFee: '0.02',
      carryPercentage: '0.20',
      vintageYear: 2024,
      status: 'active',
    };

    const result = insertFundSchema.safeParse(validFundData);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.size).toBe('string');
      expect(typeof result.data.deployedCapital).toBe('string');
      expect(typeof result.data.managementFee).toBe('string');
      expect(typeof result.data.carryPercentage).toBe('string');
    }
  });

  it('should reject number values for string decimal fields', () => {
    const invalidFundData = {
      name: 'Test Fund',
      size: 100000000,
      deployedCapital: 0,
      managementFee: 0.02,
      carryPercentage: 0.2,
      vintageYear: 2024,
      status: 'active',
    };

    const result = insertFundSchema.safeParse(invalidFundData);

    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.issues;
      expect(errors.some((err) => err.path.includes('size') && err.code === 'invalid_type')).toBe(
        true
      );
      expect(
        errors.some((err) => err.path.includes('deployedCapital') && err.code === 'invalid_type')
      ).toBe(true);
      expect(
        errors.some((err) => err.path.includes('managementFee') && err.code === 'invalid_type')
      ).toBe(true);
      expect(
        errors.some((err) => err.path.includes('carryPercentage') && err.code === 'invalid_type')
      ).toBe(true);
    }
  });

  it('should validate required decimal field types', () => {
    const invalidRangeData = {
      name: 'Test Fund',
      size: 100000000,
      deployedCapital: 0,
      managementFee: 1.5,
      carryPercentage: -0.1,
      vintageYear: 2024,
      status: 'active',
    };

    const result = insertFundSchema.safeParse(invalidRangeData);

    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.issues;
      expect(errors.some((err) => err.path.includes('managementFee'))).toBe(true);
      expect(errors.some((err) => err.path.includes('carryPercentage'))).toBe(true);
    }
  });

  it('should accept valid percentage ranges as decimals', () => {
    const validPercentageData = {
      name: 'Test Fund',
      size: '100000000',
      deployedCapital: '0',
      managementFee: '0.025',
      carryPercentage: '0.20',
      vintageYear: 2024,
      status: 'active',
    };

    const result = insertFundSchema.safeParse(validPercentageData);

    expect(result.success).toBe(true);
  });
});
