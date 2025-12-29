/**
 * MOICCalculator Tests
 *
 * Validates all 7 MOIC variants:
 * 1. Current MOIC
 * 2. Exit MOIC
 * 3. Initial MOIC
 * 4. Follow-on MOIC
 * 5. Reserves MOIC (Exit MOIC on Planned Reserves)
 * 6. Opportunity Cost MOIC
 * 7. Blended MOIC
 *
 * Tests cover:
 * - Correctness of calculations
 * - Edge cases (zero division, no follow-on, etc.)
 * - Determinism (pure functions)
 * - Portfolio-level aggregation
 */

import { describe, it, expect } from 'vitest';
import {
  MOICCalculator,
  createTestInvestment,
  createSamplePortfolio,
  type Investment,
} from '@/core/moic/MOICCalculator';

describe('MOICCalculator', () => {
  describe('1. Current MOIC', () => {
    it('calculates current MOIC correctly', () => {
      const investment = createTestInvestment({
        initialInvestment: 1_000_000,
        followOnInvestment: 500_000,
        currentValuation: 4_500_000,
      });

      const result = MOICCalculator.calculateCurrentMOIC(investment);

      // 4,500,000 / 1,500,000 = 3.0
      expect(result.value).toBe(3.0);
      expect(result.inputs['totalInvested']).toBe(1_500_000);
    });

    it('handles zero investment', () => {
      const investment = createTestInvestment({
        initialInvestment: 0,
        followOnInvestment: 0,
        currentValuation: 1_000_000,
      });

      const result = MOICCalculator.calculateCurrentMOIC(investment);

      expect(result.value).toBeNull();
    });

    it('is deterministic', () => {
      const investment = createTestInvestment();

      const result1 = MOICCalculator.calculateCurrentMOIC(investment);
      const result2 = MOICCalculator.calculateCurrentMOIC(investment);

      expect(result1.value).toBe(result2.value);
    });
  });

  describe('2. Exit MOIC', () => {
    it('calculates exit MOIC without probability weighting', () => {
      const investment = createTestInvestment({
        initialInvestment: 1_000_000,
        followOnInvestment: 0,
        projectedExitValue: 5_000_000,
        exitProbability: 0.6,
      });

      const result = MOICCalculator.calculateExitMOIC(investment, false);

      // 5,000,000 / 1,000,000 = 5.0
      expect(result.value).toBe(5.0);
    });

    it('calculates exit MOIC with probability weighting', () => {
      const investment = createTestInvestment({
        initialInvestment: 1_000_000,
        followOnInvestment: 0,
        projectedExitValue: 5_000_000,
        exitProbability: 0.6,
      });

      const result = MOICCalculator.calculateExitMOIC(investment, true);

      // (5,000,000 × 0.6) / 1,000,000 = 3.0
      expect(result.value).toBe(3.0);
    });

    it('handles zero investment', () => {
      const investment = createTestInvestment({
        initialInvestment: 0,
        followOnInvestment: 0,
      });

      const result = MOICCalculator.calculateExitMOIC(investment);

      expect(result.value).toBeNull();
    });
  });

  describe('3. Initial MOIC', () => {
    it('calculates initial MOIC correctly', () => {
      const investment = createTestInvestment({
        initialInvestment: 1_000_000,
        followOnInvestment: 1_000_000,
        currentValuation: 6_000_000,
      });

      const result = MOICCalculator.calculateInitialMOIC(investment);

      // Initial share = 1M / 2M = 0.5
      // Initial value = 6M × 0.5 = 3M
      // Initial MOIC = 3M / 1M = 3.0
      expect(result.value).toBe(3.0);
    });

    it('handles no follow-on (all initial)', () => {
      const investment = createTestInvestment({
        initialInvestment: 1_000_000,
        followOnInvestment: 0,
        currentValuation: 3_000_000,
      });

      const result = MOICCalculator.calculateInitialMOIC(investment);

      // Initial share = 100%
      // Initial MOIC = 3M / 1M = 3.0
      expect(result.value).toBe(3.0);
    });

    it('handles zero initial investment', () => {
      const investment = createTestInvestment({
        initialInvestment: 0,
        followOnInvestment: 1_000_000,
      });

      const result = MOICCalculator.calculateInitialMOIC(investment);

      expect(result.value).toBeNull();
    });
  });

  describe('4. Follow-on MOIC', () => {
    it('calculates follow-on MOIC correctly', () => {
      const investment = createTestInvestment({
        initialInvestment: 1_000_000,
        followOnInvestment: 1_000_000,
        currentValuation: 6_000_000,
      });

      const result = MOICCalculator.calculateFollowOnMOIC(investment);

      // Follow-on share = 1M / 2M = 0.5
      // Follow-on value = 6M × 0.5 = 3M
      // Follow-on MOIC = 3M / 1M = 3.0
      expect(result.value).toBe(3.0);
    });

    it('returns null when no follow-on investment', () => {
      const investment = createTestInvestment({
        initialInvestment: 1_000_000,
        followOnInvestment: 0,
      });

      const result = MOICCalculator.calculateFollowOnMOIC(investment);

      expect(result.value).toBeNull();
      expect(result.description).toContain('No follow-on');
    });
  });

  describe('5. Reserves MOIC', () => {
    it('calculates reserves MOIC with probability', () => {
      const investment = createTestInvestment({
        plannedReserves: 500_000,
        reserveExitMultiple: 4.0,
        exitProbability: 0.5,
      });

      const result = MOICCalculator.calculateReservesMOIC(investment, true);

      // Expected = 500K × 4.0 × 0.5 = 1M
      // Reserves MOIC = 1M / 500K = 2.0
      expect(result.value).toBe(2.0);
    });

    it('calculates reserves MOIC without probability', () => {
      const investment = createTestInvestment({
        plannedReserves: 500_000,
        reserveExitMultiple: 4.0,
        exitProbability: 0.5,
      });

      const result = MOICCalculator.calculateReservesMOIC(investment, false);

      // Expected = 500K × 4.0 = 2M
      // Reserves MOIC = 2M / 500K = 4.0
      expect(result.value).toBe(4.0);
    });

    it('returns null when no planned reserves', () => {
      const investment = createTestInvestment({
        plannedReserves: 0,
      });

      const result = MOICCalculator.calculateReservesMOIC(investment);

      expect(result.value).toBeNull();
      expect(result.description).toContain('No planned reserves');
    });
  });

  describe('6. Opportunity Cost MOIC', () => {
    it('calculates positive opportunity cost (outperformance)', () => {
      const investment = createTestInvestment({
        initialInvestment: 1_000_000,
        followOnInvestment: 0,
        currentValuation: 3_000_000, // 3x MOIC
      });

      // Compare against 1.5x alternative
      const result = MOICCalculator.calculateOpportunityCostMOIC(investment, 1.5);

      // Actual MOIC = 3.0, Alternative = 1.5
      // Opportunity cost = 3.0 - 1.5 = 1.5 (outperformed)
      expect(result.value).toBe(1.5);
    });

    it('calculates negative opportunity cost (underperformance)', () => {
      const investment = createTestInvestment({
        initialInvestment: 1_000_000,
        followOnInvestment: 0,
        currentValuation: 1_200_000, // 1.2x MOIC
      });

      // Compare against 2.0x alternative
      const result = MOICCalculator.calculateOpportunityCostMOIC(investment, 2.0);

      // Actual MOIC = 1.2, Alternative = 2.0
      // Opportunity cost = 1.2 - 2.0 = -0.8 (underperformed)
      expect(result.value).toBeCloseTo(-0.8);
    });

    it('defaults to 1.0 alternative (no gain/loss baseline)', () => {
      const investment = createTestInvestment({
        initialInvestment: 1_000_000,
        followOnInvestment: 0,
        currentValuation: 2_000_000,
      });

      const result = MOICCalculator.calculateOpportunityCostMOIC(investment);

      // Actual MOIC = 2.0, Alternative = 1.0 (default)
      // Opportunity cost = 2.0 - 1.0 = 1.0
      expect(result.value).toBe(1.0);
    });
  });

  describe('7. Blended MOIC', () => {
    it('calculates investment-weighted average', () => {
      const investments: Investment[] = [
        createTestInvestment({
          id: 'a',
          initialInvestment: 1_000_000,
          followOnInvestment: 0,
          currentValuation: 3_000_000, // 3x MOIC
        }),
        createTestInvestment({
          id: 'b',
          initialInvestment: 2_000_000,
          followOnInvestment: 0,
          currentValuation: 4_000_000, // 2x MOIC
        }),
      ];

      const result = MOICCalculator.calculateBlendedMOIC(investments);

      // Weighted = (1M × 3.0 + 2M × 2.0) / (1M + 2M)
      //          = (3M + 4M) / 3M = 7/3 ≈ 2.333
      expect(result.value).toBeCloseTo(2.333, 2);
    });

    it('returns null for empty portfolio', () => {
      const result = MOICCalculator.calculateBlendedMOIC([]);

      expect(result.value).toBeNull();
      expect(result.description).toContain('No investments');
    });

    it('handles single investment', () => {
      const investments = [
        createTestInvestment({
          initialInvestment: 1_000_000,
          followOnInvestment: 500_000,
          currentValuation: 4_500_000,
        }),
      ];

      const result = MOICCalculator.calculateBlendedMOIC(investments);

      // Single investment: 4.5M / 1.5M = 3.0
      expect(result.value).toBe(3.0);
    });
  });

  describe('calculateAllMOICs', () => {
    it('returns all MOIC variants', () => {
      const investment = createTestInvestment();

      const results = MOICCalculator.calculateAllMOICs(investment);

      expect(results).toHaveProperty('current');
      expect(results).toHaveProperty('exit');
      expect(results).toHaveProperty('exitProbabilityWeighted');
      expect(results).toHaveProperty('initial');
      expect(results).toHaveProperty('followOn');
      expect(results).toHaveProperty('reserves');
      expect(results).toHaveProperty('reservesRaw');
      expect(results).toHaveProperty('opportunityCost');
    });
  });

  describe('generatePortfolioSummary', () => {
    it('generates complete portfolio summary', () => {
      const portfolio = createSamplePortfolio();

      const summary = MOICCalculator.generatePortfolioSummary(portfolio);

      expect(summary.companies).toHaveLength(3);
      expect(summary.portfolio.blendedMOIC.value).not.toBeNull();
      expect(summary.portfolio.totalInvested).toBeGreaterThan(0);
      expect(summary.portfolio.totalCurrentValue).toBeGreaterThan(0);
    });

    it('handles empty portfolio', () => {
      const summary = MOICCalculator.generatePortfolioSummary([]);

      expect(summary.companies).toHaveLength(0);
      expect(summary.portfolio.blendedMOIC.value).toBeNull();
      expect(summary.portfolio.totalInvested).toBe(0);
    });
  });

  describe('rankByReservesMOIC', () => {
    it('ranks investments by reserves MOIC descending', () => {
      const investments: Investment[] = [
        createTestInvestment({
          id: 'low',
          name: 'Low Reserves MOIC',
          plannedReserves: 100_000,
          reserveExitMultiple: 2.0,
          exitProbability: 0.5, // Reserves MOIC = 1.0
        }),
        createTestInvestment({
          id: 'high',
          name: 'High Reserves MOIC',
          plannedReserves: 100_000,
          reserveExitMultiple: 6.0,
          exitProbability: 0.5, // Reserves MOIC = 3.0
        }),
        createTestInvestment({
          id: 'mid',
          name: 'Mid Reserves MOIC',
          plannedReserves: 100_000,
          reserveExitMultiple: 4.0,
          exitProbability: 0.5, // Reserves MOIC = 2.0
        }),
      ];

      const ranked = MOICCalculator.rankByReservesMOIC(investments);

      expect(ranked[0].investment.id).toBe('high');
      expect(ranked[0].rank).toBe(1);
      expect(ranked[1].investment.id).toBe('mid');
      expect(ranked[1].rank).toBe(2);
      expect(ranked[2].investment.id).toBe('low');
      expect(ranked[2].rank).toBe(3);
    });

    it('handles investments with no reserves', () => {
      const investments: Investment[] = [
        createTestInvestment({
          id: 'with-reserves',
          plannedReserves: 100_000,
          reserveExitMultiple: 4.0,
          exitProbability: 0.5,
        }),
        createTestInvestment({
          id: 'no-reserves',
          plannedReserves: 0,
        }),
      ];

      const ranked = MOICCalculator.rankByReservesMOIC(investments);

      expect(ranked[0].investment.id).toBe('with-reserves');
      expect(ranked[1].investment.id).toBe('no-reserves');
      expect(ranked[1].reservesMOIC.value).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('handles very small numbers', () => {
      const investment = createTestInvestment({
        initialInvestment: 0.001,
        followOnInvestment: 0,
        currentValuation: 0.003,
      });

      const result = MOICCalculator.calculateCurrentMOIC(investment);

      expect(result.value).toBeCloseTo(3.0, 2);
    });

    it('handles very large numbers', () => {
      const investment = createTestInvestment({
        initialInvestment: 1_000_000_000_000, // 1 trillion
        followOnInvestment: 0,
        currentValuation: 3_000_000_000_000,
      });

      const result = MOICCalculator.calculateCurrentMOIC(investment);

      expect(result.value).toBe(3.0);
    });

    it('maintains precision with Decimal.js', () => {
      const investment = createTestInvestment({
        initialInvestment: 3,
        followOnInvestment: 0,
        currentValuation: 10,
      });

      const result = MOICCalculator.calculateCurrentMOIC(investment);

      // 10/3 should maintain precision
      expect(result.value).toBeCloseTo(3.333333, 4);
    });
  });

  describe('Factory Functions', () => {
    it('createTestInvestment creates valid investment', () => {
      const investment = createTestInvestment();

      expect(investment.id).toBeDefined();
      expect(investment.initialInvestment).toBeGreaterThan(0);
      expect(investment.exitProbability).toBeGreaterThanOrEqual(0);
      expect(investment.exitProbability).toBeLessThanOrEqual(1);
    });

    it('createTestInvestment accepts overrides', () => {
      const investment = createTestInvestment({
        id: 'custom-id',
        name: 'Custom Name',
        initialInvestment: 999,
      });

      expect(investment.id).toBe('custom-id');
      expect(investment.name).toBe('Custom Name');
      expect(investment.initialInvestment).toBe(999);
    });

    it('createSamplePortfolio creates 3 investments', () => {
      const portfolio = createSamplePortfolio();

      expect(portfolio).toHaveLength(3);
      expect(portfolio[0].name).toBe('Alpha Tech');
      expect(portfolio[1].name).toBe('Beta Labs');
      expect(portfolio[2].name).toBe('Gamma Bio');
    });
  });
});
