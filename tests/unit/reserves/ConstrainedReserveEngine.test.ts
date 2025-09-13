import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { ConstrainedReserveEngine } from '../../../client/src/core/reserves/ConstrainedReserveEngine.js';
import type { ReserveInput } from '../../../shared/schemas.js';

describe('ConstrainedReserveEngine', () => {
  const engine = new ConstrainedReserveEngine();

  const stageArb = fc.constantFrom('preseed', 'seed', 'series_a', 'series_b', 'series_c', 'series_dplus');
  
  const companyArb = fc.record({
    id: fc.string({ minLength: 1, maxLength: 20 }),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    stage: stageArb,
    invested: fc.float({ min: Math.fround(0), max: Math.fround(50_000_000), noNaN: true }),
    ownership: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
  });

  const stagePolicyArb = fc.record({
    stage: stageArb,
    reserveMultiple: fc.float({ min: Math.fround(0.1), max: Math.fround(10), noNaN: true }),
    weight: fc.float({ min: Math.fround(0.1), max: Math.fround(5), noNaN: true }),
  });

  const inputArb = fc.record({
    availableReserves: fc.float({ min: Math.fround(0), max: Math.fround(100_000_000), noNaN: true }),
    companies: fc.array(companyArb, { minLength: 0, maxLength: 20 }),
    stagePolicies: fc.array(stagePolicyArb, { minLength: 1, maxLength: 6 })
      .filter(policies => new Set(policies.map(p => p.stage)).size === policies.length), // unique stages
    constraints: fc.record({
      minCheck: fc.float({ min: Math.fround(0), max: Math.fround(1_000_000), noNaN: true }),
      maxPerCompany: fc.float({ min: Math.fround(1), max: Math.fround(50_000_000), noNaN: true }),
      discountRateAnnual: fc.float({ min: Math.fround(0), max: Math.fround(0.5), noNaN: true }),
    }, { requiredKeys: [] })
  }).filter(input => {
    // Ensure all companies have corresponding stage policies
    const stageSet = new Set(input.stagePolicies.map(p => p.stage));
    return input.companies.every(c => stageSet.has(c.stage));
  });

  it('conservation: money in equals money out', () => {
    fc.assert(fc.property(inputArb, (input: ReserveInput) => {
      const result = engine.calculate(input);
      
      expect(result.conservationOk).toBe(true);
      
      const totalIn = input.availableReserves;
      const totalOut = result.totalAllocated + result.remaining;
      
      // Allow for small floating point differences (within 1 cent)
      expect(Math.abs(totalIn - totalOut)).toBeLessThan(0.01);
    }), { numRuns: 100 });
  });

  it('allocations are non-negative', () => {
    fc.assert(fc.property(inputArb, (input: ReserveInput) => {
      const result = engine.calculate(input);
      
      expect(result.totalAllocated).toBeGreaterThanOrEqual(0);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
      
      result.allocations.forEach(alloc => {
        expect(alloc.allocated).toBeGreaterThanOrEqual(0);
      });
    }), { numRuns: 100 });
  });

  it('respects minCheck constraint', () => {
    fc.assert(fc.property(inputArb, (input: ReserveInput) => {
      if (!input.constraints?.minCheck) return true;
      
      const result = engine.calculate(input);
      const minCheck = input.constraints.minCheck;
      
      result.allocations.forEach(alloc => {
        expect(alloc.allocated).toBeGreaterThanOrEqual(minCheck - 0.01); // allow floating point precision
      });
    }), { numRuns: 100 });
  });

  it('does not exceed available reserves', () => {
    fc.assert(fc.property(inputArb, (input: ReserveInput) => {
      const result = engine.calculate(input);
      
      expect(result.totalAllocated).toBeLessThanOrEqual(input.availableReserves + 0.01); // allow floating point precision
    }), { numRuns: 100 });
  });

  it('deterministic: same input produces same output', () => {
    fc.assert(fc.property(inputArb, (input: ReserveInput) => {
      const result1 = engine.calculate(input);
      const result2 = engine.calculate(input);
      
      expect(result1.totalAllocated).toBeCloseTo(result2.totalAllocated, 10);
      expect(result1.remaining).toBeCloseTo(result2.remaining, 10);
      expect(result1.allocations).toEqual(result2.allocations);
    }), { numRuns: 50 });
  });

  it('empty companies returns zero allocations', () => {
    const input: ReserveInput = {
      availableReserves: 1000000,
      companies: [],
      stagePolicies: [{ stage: 'seed', reserveMultiple: 2, weight: 1 }]
    };
    
    const result = engine.calculate(input);
    
    expect(result.allocations).toEqual([]);
    expect(result.totalAllocated).toBe(0);
    expect(result.remaining).toBe(1000000);
  });

  it('zero reserves returns zero allocations', () => {
    const input: ReserveInput = {
      availableReserves: 0,
      companies: [{ id: 'c1', name: 'Company 1', stage: 'seed', invested: 100000, ownership: 0.1 }],
      stagePolicies: [{ stage: 'seed', reserveMultiple: 2, weight: 1 }]
    };
    
    const result = engine.calculate(input);
    
    expect(result.allocations).toEqual([]);
    expect(result.totalAllocated).toBe(0);
    expect(result.remaining).toBe(0);
  });
});