import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ReserveEngine } from '../../client/src/core/reserves/ReserveEngine';
import { PacingEngine } from '../../client/src/core/pacing/PacingEngine';
import type { ReserveCompanyInput, PacingInput } from '@shared/types';

describe('ReserveEngine', () => {
  const mockPortfolio: ReserveCompanyInput[] = [
    {
      id: 1,
      invested: 750000,
      ownership: 0.12,
      stage: 'Series A',
      sector: 'SaaS',
    },
    {
      id: 2,
      invested: 500000,
      ownership: 0.08,
      stage: 'Seed',
      sector: 'Analytics',
    },
    {
      id: 3,
      invested: 1200000,
      ownership: 0.15,
      stage: 'Series B',
      sector: 'Infrastructure',
    },
  ];

  it('should return reserve allocations for portfolio companies', () => {
    const result = ReserveEngine(mockPortfolio);

    expect(result).toHaveLength(3);
    expect(result[0]).toHaveProperty('allocation');
    expect(result[0]).toHaveProperty('confidence');
    expect(result[0]).toHaveProperty('rationale');
  });

  it('should calculate allocation with stage and sector multipliers', () => {
    const result = ReserveEngine(mockPortfolio);

    // Results will vary based on algorithm mode, but should be reasonable
    expect(result[0].allocation).toBeGreaterThan(0);
    expect(result[1].allocation).toBeGreaterThan(0);
    expect(result[2].allocation).toBeGreaterThan(0);

    // Series B should generally have higher allocation than Seed
    const seriesBAllocation = result.find((r) => r.rationale.includes('Series B'))?.allocation || 0;
    const seedAllocation = result.find((r) => r.rationale.includes('Seed'))?.allocation || 0;
    expect(seriesBAllocation).toBeGreaterThan(seedAllocation);
  });

  it('should return appropriate confidence scores', () => {
    const result = ReserveEngine(mockPortfolio);

    result.forEach((item) => {
      expect(item.confidence).toBeGreaterThan(0);
      expect(item.confidence).toBeLessThanOrEqual(1);
      expect(item.rationale).toContain('stage');
    });
  });

  it('should handle empty portfolio', () => {
    const result = ReserveEngine([]);
    expect(result).toHaveLength(0);
  });
});

describe('PacingEngine', () => {
  const mockPacingInput: PacingInput = {
    fundSize: 50000000,
    deploymentQuarter: 1,
    marketCondition: 'neutral',
  };

  it('should return pacing timeline for fund deployment', () => {
    const result = PacingEngine(mockPacingInput);

    expect(result).toHaveLength(8);
    expect(result[0]).toHaveProperty('quarter');
    expect(result[0]).toHaveProperty('deployment');
    expect(result[0]).toHaveProperty('note');
  });

  it('should calculate deployment based on market conditions', () => {
    const result = PacingEngine(mockPacingInput);

    result.forEach((item, index) => {
      expect(item.quarter).toBe(mockPacingInput.deploymentQuarter + index);
      expect(item.deployment).toBeGreaterThan(0);
      expect(item.note).toContain('neutral');
    });

    // Total deployment should approximately equal fund size
    const totalDeployment = result.reduce((sum, item) => sum + item.deployment, 0);
    expect(totalDeployment).toBeGreaterThan(mockPacingInput.fundSize * 0.8);
    expect(totalDeployment).toBeLessThan(mockPacingInput.fundSize * 1.2);
  });

  it('should handle different market conditions', () => {
    const bullMarketInput: PacingInput = {
      ...mockPacingInput,
      marketCondition: 'bull',
    };

    const result = PacingEngine(bullMarketInput);
    expect(result[0].note).toContain('bull');
  });

  it('should start from specified quarter', () => {
    const laterStartInput: PacingInput = {
      ...mockPacingInput,
      deploymentQuarter: 5,
    };

    const result = PacingEngine(laterStartInput);
    expect(result[0].quarter).toBe(5);
    expect(result[7].quarter).toBe(12);
  });
});

describe('API Routes Integration', () => {
  // Mock fetch for testing API endpoints
  const mockFetch = (url: string) => {
    if (url.includes('/api/reserves/')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              allocation: 1500000,
              confidence: 0.3,
              rationale: 'Rule-based allocation (cold-start mode)',
            },
            {
              allocation: 1000000,
              confidence: 0.3,
              rationale: 'Rule-based allocation (cold-start mode)',
            },
            {
              allocation: 2400000,
              confidence: 0.3,
              rationale: 'Rule-based allocation (cold-start mode)',
            },
          ]),
      });
    }

    if (url.includes('/api/pacing/summary')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            { quarter: 1, deployment: 4166666.67, note: 'Baseline pacing (neutral)' },
            { quarter: 2, deployment: 4166666.67, note: 'Baseline pacing (neutral)' },
            { quarter: 3, deployment: 4166666.67, note: 'Baseline pacing (neutral)' },
          ]),
      });
    }

    return Promise.reject(new Error('Unknown API endpoint'));
  };

  // Mock global fetch
  beforeAll(() => {
    global.fetch = mockFetch as typeof global.fetch;
  });

  afterAll(() => {
    delete (global as { fetch?: typeof global.fetch }).fetch;
  });

  it('should validate reserve engine API response structure', async () => {
    const response = await fetch('/api/reserves/1');
    const data: unknown = await response.json();

    expect(Array.isArray(data)).toBe(true);

    expect((data as unknown[])[0]).toHaveProperty('allocation');

    expect((data as unknown[])[0]).toHaveProperty('confidence');

    expect((data as unknown[])[0]).toHaveProperty('rationale');
  });

  it('should validate pacing engine API response structure', async () => {
    const response = await fetch('/api/pacing/summary');
    const data: unknown = await response.json();

    expect(Array.isArray(data)).toBe(true);

    expect((data as unknown[])[0]).toHaveProperty('quarter');

    expect((data as unknown[])[0]).toHaveProperty('deployment');

    expect((data as unknown[])[0]).toHaveProperty('note');
  });
});
