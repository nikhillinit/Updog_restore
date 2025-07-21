import { describe, it, expect } from 'vitest';
import { insertFundSchema } from '../shared/schema';

describe('Fund Schema Validation', () => {
  it('should accept numeric values for size, deployedCapital, managementFee, and carryPercentage', () => {
    const validFundData = {
      name: 'Test Fund',
      size: 100000000, // number instead of string
      deployedCapital: 0, // number instead of string  
      managementFee: 0.02, // 2% as decimal
      carryPercentage: 0.20, // 20% as decimal
      vintageYear: 2024,
      status: 'active'
    };

    const result = insertFundSchema.safeParse(validFundData);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.size).toBe('number');
      expect(typeof result.data.deployedCapital).toBe('number');
      expect(typeof result.data.managementFee).toBe('number');
      expect(typeof result.data.carryPercentage).toBe('number');
    }
  });

  it('should reject string values for numeric fields', () => {
    const invalidFundData = {
      name: 'Test Fund',
      size: '100000000', // string instead of number
      deployedCapital: '0', // string instead of number
      managementFee: '0.02', // string instead of number
      carryPercentage: '0.20', // string instead of number
      vintageYear: 2024,
      status: 'active'
    };

    const result = insertFundSchema.safeParse(invalidFundData);
    
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.issues;
      expect(errors.some(err => err.path.includes('size') && err.code === 'invalid_type')).toBe(true);
      expect(errors.some(err => err.path.includes('deployedCapital') && err.code === 'invalid_type')).toBe(true);
      expect(errors.some(err => err.path.includes('managementFee') && err.code === 'invalid_type')).toBe(true);
      expect(errors.some(err => err.path.includes('carryPercentage') && err.code === 'invalid_type')).toBe(true);
    }
  });

  it('should validate managementFee and carryPercentage ranges', () => {
    const invalidRangeData = {
      name: 'Test Fund',
      size: 100000000,
      deployedCapital: 0,
      managementFee: 1.5, // Greater than 1 (should be between 0 and 1)
      carryPercentage: -0.1, // Negative (should be between 0 and 1)
      vintageYear: 2024,
      status: 'active'
    };

    const result = insertFundSchema.safeParse(invalidRangeData);
    
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.issues;
      expect(errors.some(err => err.path.includes('managementFee'))).toBe(true);
      expect(errors.some(err => err.path.includes('carryPercentage'))).toBe(true);
    }
  });

  it('should accept valid percentage ranges as decimals', () => {
    const validPercentageData = {
      name: 'Test Fund',
      size: 100000000,
      deployedCapital: 0,
      managementFee: 0.025, // 2.5% as decimal
      carryPercentage: 0.20, // 20% as decimal
      vintageYear: 2024,
      status: 'active'
    };

    const result = insertFundSchema.safeParse(validPercentageData);
    
    expect(result.success).toBe(true);
  });
});