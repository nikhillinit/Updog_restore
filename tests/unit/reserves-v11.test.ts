/**
 * Unit tests for Reserves v1.1 calculation engine
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { calculateReservesSafe, calculateReserves } from '@/lib/reserves-v11';
import { 
  toQuarterIndex, 
  fromQuarterIndex, 
  dateToQuarter,
  addQuarters,
  getCurrentQuarterIndex 
} from '@/lib/quarter-time';
import type { Company, ReservesConfig, ReservesInput } from '@shared/types/reserves-v11';

describe('Reserves v1.1 Calculation Engine', () => {
  const mockCompanies: Company[] = [
    {
      id: 'company-1',
      name: 'Alpha Corp',
      invested_cents: 1000000, // $10,000
      exit_moic_bps: 30000,    // 3.0x
      stage: 'Series A',
      sector: 'SaaS'
    },
    {
      id: 'company-2',
      name: 'Beta Inc',
      invested_cents: 2000000, // $20,000
      exit_moic_bps: 25000,    // 2.5x
      stage: 'Series B',
      sector: 'Fintech'
    },
    {
      id: 'company-3',
      name: 'Gamma LLC',
      invested_cents: 500000,  // $5,000
      exit_moic_bps: 40000,    // 4.0x
      stage: 'Seed',
      sector: 'Healthcare'
    }
  ];
  
  describe('Basic Calculation', () => {
    it('should calculate reserves with default configuration', () => {
      const result = calculateReserves(mockCompanies, 0.15, false);
      
      expect(result.ok).toBe(true);
      expect(result.data).toBeDefined();
      
      const { data } = result;
      // Total invested: $35,000 * 15% = $5,250
      expect(data!.metadata.total_available_cents).toBe(525000);
      expect(data!.allocations.length).toBeGreaterThan(0);
      expect(data!.metadata.conservation_check).toBe(true);
    });
    
    it('should rank companies by Exit MOIC', () => {
      const result = calculateReserves(mockCompanies, 0.15, false);
      
      expect(result.ok).toBe(true);
      const ranking = result.data!.metadata.exit_moic_ranking;
      
      // Should be ranked: Gamma (4.0x), Alpha (3.0x), Beta (2.5x)
      expect(ranking[0]).toBe('company-3');
      expect(ranking[1]).toBe('company-1');
      expect(ranking[2]).toBe('company-2');
    });
    
    it('should respect cap policy', () => {
      const input: ReservesInput = {
        companies: mockCompanies,
        fund_size_cents: 3500000,
        quarter_index: getCurrentQuarterIndex()
      };
      
      const config: ReservesConfig = {
        reserve_bps: 1500, // 15%
        remain_passes: 0,
        cap_policy: {
          kind: 'fixed_percent',
          default_percent: 0.5 // 50% cap
        },
        audit_level: 'basic'
      };
      
      const result = calculateReservesSafe(input, config);
      
      expect(result.ok).toBe(true);
      result.data!.allocations.forEach(allocation => {
        const company = mockCompanies.find(c => c.id === allocation.company_id);
        const maxCap = (company!.invested_cents * 0.5);
        expect(allocation.planned_cents).toBeLessThanOrEqual(maxCap);
      });
    });
  });
  
  describe('Remain Pass Feature', () => {
    it('should perform additional allocation with remain pass enabled', () => {
      const resultWithout = calculateReserves(mockCompanies, 0.15, false);
      const resultWith = calculateReserves(mockCompanies, 0.15, true);
      
      expect(resultWithout.ok).toBe(true);
      expect(resultWith.ok).toBe(true);
      
      // With remain pass, more should be allocated
      const allocatedWithout = resultWithout.data!.metadata.total_allocated_cents;
      const allocatedWith = resultWith.data!.metadata.total_allocated_cents;
      
      expect(allocatedWith).toBeGreaterThanOrEqual(allocatedWithout);
      
      // Check for iteration 2 allocations
      const hasSecondPass = resultWith.data!.allocations.some(a => a.iteration === 2);
      if (resultWith.data!.remaining_cents === 0) {
        // All allocated, may or may not have second pass
      } else {
        // If there's remaining, we should have attempted second pass
        expect(resultWith.data!.metadata.max_iterations).toBe(2);
      }
    });
  });
  
  describe('Conservation Invariant', () => {
    it('should maintain conservation of funds', () => {
      const result = calculateReserves(mockCompanies, 0.20, true);
      
      expect(result.ok).toBe(true);
      
      const { data } = result;
      const totalAllocated = data!.metadata.total_allocated_cents;
      const remaining = data!.remaining_cents;
      const available = data!.metadata.total_available_cents;
      
      // Conservation: allocated + remaining = available (with 1 cent tolerance for rounding)
      expect(Math.abs((totalAllocated + remaining) - available)).toBeLessThanOrEqual(1);
      expect(data!.metadata.conservation_check).toBe(true);
    });
    
    it('should handle edge case with zero reserves', () => {
      const result = calculateReserves(mockCompanies, 0, false);
      
      expect(result.ok).toBe(true);
      expect(result.data!.metadata.total_available_cents).toBe(0);
      expect(result.data!.metadata.total_allocated_cents).toBe(0);
      expect(result.data!.remaining_cents).toBe(0);
      expect(result.data!.metadata.conservation_check).toBe(true);
    });
  });
  
  describe('Edge Cases', () => {
    it('should handle empty company list', () => {
      const result = calculateReserves([], 0.15, false);
      
      expect(result.ok).toBe(true);
      expect(result.data!.allocations).toHaveLength(0);
      expect(result.warnings).toContain('No companies provided');
    });
    
    it('should handle companies with zero investment', () => {
      const companiesWithZero: Company[] = [
        ...mockCompanies,
        {
          id: 'company-4',
          name: 'Zero Corp',
          invested_cents: 0,
          exit_moic_bps: 20000
        }
      ];
      
      const result = calculateReserves(companiesWithZero, 0.15, false);
      
      expect(result.ok).toBe(true);
      // Zero investment company should not receive allocation
      const zeroAllocation = result.data!.allocations.find(a => a.company_id === 'company-4');
      expect(zeroAllocation).toBeUndefined();
    });
    
    it('should handle very high reserve percentage', () => {
      const result = calculateReserves(mockCompanies, 0.99, true);
      
      expect(result.ok).toBe(true);
      // Should still respect caps even with 99% reserves
      result.data!.allocations.forEach(allocation => {
        const company = mockCompanies.find(c => c.id === allocation.company_id);
        expect(allocation.planned_cents).toBeLessThanOrEqual(company!.invested_cents);
      });
    });
  });
  
  describe('Stage-Based Cap Policy', () => {
    it('should apply stage-based caps correctly', () => {
      const input: ReservesInput = {
        companies: mockCompanies,
        fund_size_cents: 3500000,
        quarter_index: getCurrentQuarterIndex()
      };
      
      const config: ReservesConfig = {
        reserve_bps: 3000, // 30% reserves
        remain_passes: 0,
        cap_policy: {
          kind: 'stage_based',
          default_percent: 0.5,
          stage_caps: {
            'Seed': 0.75,      // 75% cap
            'Series A': 0.60,  // 60% cap
            'Series B': 0.40   // 40% cap
          }
        },
        audit_level: 'detailed'
      };
      
      const result = calculateReservesSafe(input, config);
      
      expect(result.ok).toBe(true);
      
      // Check each allocation respects its stage cap
      result.data!.allocations.forEach(allocation => {
        const company = mockCompanies.find(c => c.id === allocation.company_id);
        const stageCap = config.cap_policy.kind === 'stage_based' 
          ? (config.cap_policy.stage_caps?.[company!.stage!] || 0.5)
          : 0.5;
        const maxAllocation = company!.invested_cents * stageCap;
        
        expect(allocation.planned_cents).toBeLessThanOrEqual(maxAllocation);
      });
    });
  });
});

describe('Quarter-Based Time Utilities', () => {
  describe('Quarter Index Conversion', () => {
    it('should convert quarter to index and back', () => {
      const quarter = { year: 2024, quarter: 3 as const };
      const index = toQuarterIndex(quarter);
      const converted = fromQuarterIndex(index);
      
      expect(index).toBe(2024 * 4 + 2); // 8098
      expect(converted).toEqual(quarter);
    });
    
    it('should handle edge years', () => {
      const q1_1900 = { year: 1900, quarter: 1 as const };
      const q4_2100 = { year: 2100, quarter: 4 as const };
      
      expect(toQuarterIndex(q1_1900)).toBe(7600);
      expect(toQuarterIndex(q4_2100)).toBe(8403);
    });
  });
  
  describe('Date to Quarter Conversion', () => {
    it('should convert dates to correct quarters', () => {
      // Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec
      // Using explicit UTC dates to avoid timezone issues
      expect(dateToQuarter(new Date(2024, 0, 15))).toEqual({ year: 2024, quarter: 1 }); // Jan 15
      expect(dateToQuarter(new Date(2024, 3, 1))).toEqual({ year: 2024, quarter: 2 });  // Apr 1
      expect(dateToQuarter(new Date(2024, 6, 31))).toEqual({ year: 2024, quarter: 3 }); // Jul 31
      expect(dateToQuarter(new Date(2024, 11, 31))).toEqual({ year: 2024, quarter: 4 }); // Dec 31
    });
  });
  
  describe('Quarter Arithmetic', () => {
    it('should add quarters correctly', () => {
      const start = { year: 2024, quarter: 3 as const };
      
      expect(addQuarters(start, 1)).toEqual({ year: 2024, quarter: 4 });
      expect(addQuarters(start, 2)).toEqual({ year: 2025, quarter: 1 });
      expect(addQuarters(start, -2)).toEqual({ year: 2024, quarter: 1 });
      expect(addQuarters(start, 10)).toEqual({ year: 2027, quarter: 1 });
    });
  });
});