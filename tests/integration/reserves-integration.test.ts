/**
 * Integration tests for Reserves v1.1 end-to-end scenarios
 * Tests real-world fund scenarios with production-like data volumes
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { calculateReservesSafe } from '@/lib/reserves-v11';
import { shadowIntelligence } from '@/lib/shadow-intelligence';
import { predictiveCache } from '@/lib/predictive-cache';
import type { Company, ReservesConfig, ReservesInput } from '@shared/types/reserves-v11';

describe('Reserves v1.1 Integration Tests', () => {
  let largeDataset: Company[];
  
  beforeAll(async () => {
    // Generate realistic dataset with 100+ companies
    largeDataset = generateRealisticCompanies(150);
  });
  
  afterAll(() => {
    predictiveCache.clearCache();
  });

  describe('Production-Scale Scenarios', () => {
    it('should handle large fund with 150+ companies within performance budget', async () => {
      const input: ReservesInput = {
        companies: largeDataset,
        fund_size_cents: 10000000000, // $100M fund
        quarter_index: 8100 // Q1 2025
      };
      
      const config: ReservesConfig = {
        reserve_bps: 2000, // 20%
        remain_passes: 1,
        cap_policy: {
          kind: 'stage_based',
          default_percent: 0.5,
          stage_caps: {
            'Pre-Seed': 0.8,
            'Seed': 0.7,
            'Series A': 0.6,
            'Series B': 0.5,
            'Series C': 0.4
          }
        },
        audit_level: 'detailed'
      };
      
      const startTime = performance.now();
      const result = calculateReservesSafe(input, config);
      const duration = performance.now() - startTime;
      
      // Performance assertions
      expect(duration).toBeLessThan(500); // Sub-500ms for 150 companies
      expect(result.ok).toBe(true);
      expect(result.data!.allocations.length).toBeGreaterThan(0);
      expect(result.data!.metadata.conservation_check).toBe(true);
      
      // Business logic assertions
      const totalAllocated = result.data!.metadata.total_allocated_cents;
      expect(totalAllocated).toBeGreaterThan(0);
      expect(totalAllocated).toBeLessThanOrEqual(result.data!.metadata.total_available_cents);
    });
    
    it('should maintain consistency across multiple calculation runs', async () => {
      const input: ReservesInput = {
        companies: largeDataset.slice(0, 50),
        fund_size_cents: 5000000000, // $50M
        quarter_index: 8100
      };
      
      const config: ReservesConfig = {
        reserve_bps: 1500,
        remain_passes: 1,
        cap_policy: { kind: 'fixed_percent', default_percent: 0.6 },
        audit_level: 'basic'
      };
      
      // Run same calculation 5 times
      const results = await Promise.all(
        Array(5).fill(null).map(() => calculateReservesSafe(input, config))
      );
      
      // All results should be identical
      const firstResult = results[0];
      for (let i = 1; i < results.length; i++) {
        expect(results[i].data!.remaining_cents).toBe(firstResult.data!.remaining_cents);
        expect(results[i].data!.metadata.total_allocated_cents).toBe(firstResult.data!.metadata.total_allocated_cents);
        expect(results[i].data!.allocations).toEqual(firstResult.data!.allocations);
      }
    });
    
    it('should handle edge cases gracefully', async () => {
      const edgeCases = [
        // Very small fund
        { fundSize: 100000, companies: 3, description: 'micro fund' },
        // Very large fund
        { fundSize: 100000000000, companies: 200, description: 'mega fund' },
        // Zero reserves
        { fundSize: 10000000, companies: 10, description: 'zero reserves', reserveBps: 0 },
        // Max reserves
        { fundSize: 10000000, companies: 10, description: 'max reserves', reserveBps: 10000 }
      ];
      
      for (const testCase of edgeCases) {
        const companies = generateRealisticCompanies(testCase.companies);
        const input: ReservesInput = {
          companies,
          fund_size_cents: testCase.fundSize,
          quarter_index: 8100
        };
        
        const config: ReservesConfig = {
          reserve_bps: testCase.reserveBps || 1500,
          remain_passes: 0,
          cap_policy: { kind: 'fixed_percent', default_percent: 0.5 },
          audit_level: 'basic'
        };
        
        const result = calculateReservesSafe(input, config);
        
        expect(result.ok).toBe(true);
        expect(result.data!.metadata.conservation_check).toBe(true);
        
        console.log(`✓ ${testCase.description}: ${result.data!.allocations.length} allocations`);
      }
    });
  });
  
  describe('Shadow Intelligence Integration', () => {
    it('should detect and categorize divergences correctly', async () => {
      const companies = generateRealisticCompanies(20);
      const input: ReservesInput = {
        companies,
        fund_size_cents: 10000000,
        quarter_index: 8100
      };
      
      const configA: ReservesConfig = {
        reserve_bps: 1500,
        remain_passes: 0,
        cap_policy: { kind: 'fixed_percent', default_percent: 0.5 },
        audit_level: 'basic'
      };
      
      const configB: ReservesConfig = {
        reserve_bps: 1600, // Slight difference
        remain_passes: 1,   // Different remain passes
        cap_policy: { kind: 'fixed_percent', default_percent: 0.5 },
        audit_level: 'basic'
      };
      
      const resultA = calculateReservesSafe(input, configA);
      const resultB = calculateReservesSafe(input, configB);
      
      const analysis = await shadowIntelligence.analyzeDivergence(resultA, resultB);
      
      expect(analysis.match).toBe(false); // Should detect difference
      expect(analysis.businessImpact).toBeGreaterThan(0);
      expect(analysis.severity).toBeOneOf(['info', 'warning', 'critical']);
      expect(analysis.divergenceType).toBeOneOf(['logic', 'improvement', 'rounding', 'data', 'error']);
    });
  });
  
  describe('Cache Performance Integration', () => {
    it('should demonstrate cache effectiveness with repeated calculations', async () => {
      const companies = generateRealisticCompanies(30);
      const baseInput: ReservesInput = {
        companies,
        fund_size_cents: 10000000,
        quarter_index: 8100
      };
      
      const config: ReservesConfig = {
        reserve_bps: 1500,
        remain_passes: 1,
        cap_policy: { kind: 'fixed_percent', default_percent: 0.5 },
        audit_level: 'basic'
      };
      
      const calculator = (input: ReservesInput, config: ReservesConfig) => 
        Promise.resolve(calculateReservesSafe(input, config));
      
      const cacheKey = 'integration-test-cache';
      
      // First call - cache miss
      const start1 = performance.now();
      const result1 = await predictiveCache.get(cacheKey, calculator, baseInput, config);
      const duration1 = performance.now() - start1;
      
      // Second call - cache hit
      const start2 = performance.now();
      const result2 = await predictiveCache.get(cacheKey, calculator, baseInput, config);
      const duration2 = performance.now() - start2;
      
      // Cache hit should be significantly faster
      expect(duration2).toBeLessThan(duration1 * 0.5);
      expect(result1).toEqual(result2);
      
      const stats = predictiveCache.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);
    });
  });
});

function generateRealisticCompanies(count: number): Company[] {
  const stages = ['Pre-Seed', 'Seed', 'Series A', 'Series B', 'Series C'];
  const sectors = ['SaaS', 'Fintech', 'Healthcare', 'AI/ML', 'E-commerce', 'Climate', 'Biotech'];
  
  return Array.from({ length: count }, (_, i) => ({
    id: `company-${i + 1}`,
    name: `Company ${i + 1}`,
    invested_cents: Math.floor(Math.random() * 5000000) + 100000, // $1K - $50K
    exit_moic_bps: Math.floor(Math.random() * 40000) + 10000, // 1x - 5x
    stage: stages[Math.floor(Math.random() * stages.length)],
    sector: sectors[Math.floor(Math.random() * sectors.length)]
  }));
}