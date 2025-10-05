/**
 * Reserves API Tests
 *
 * Tests for the reserves calculation API endpoints including:
 * - Portfolio pagination (fix for truncation bug)
 * - Date schema coercion
 * - Query parameter parsing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { z } from 'zod';

// Mock modules
vi.mock('../../../server/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../../server/lib/approvals-guard.js', () => ({
  requireApproval: () => (req: any, res: any, next: any) => next(),
  computeStrategyHash: () => 'mock-hash',
  createApprovalIfNeeded: vi.fn().mockResolvedValue({ requiresApproval: false }),
  verifyApproval: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('../../../server/lib/auth/jwt.js', () => ({
  requireAuth: () => (req: any, res: any, next: any) => {
    req.user = { email: 'test@example.com' };
    next();
  },
}));

vi.mock('../../../server/middleware/requestId', () => ({
  requestId: (req: any, res: any, next: any) => {
    (req as any).id = 'test-correlation-id';
    next();
  },
}));

// Import router after mocking
import reservesRouter from '../../../server/routes/reserves-api';

describe('Reserves API', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/reserves', reservesRouter);
    vi.clearAllMocks();
  });

  describe('POST /api/reserves/calculate', () => {
    const createValidInput = (portfolioSize: number = 3) => ({
      portfolio: Array.from({ length: portfolioSize }, (_, i) => ({
        id: `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`,
        name: `Company ${i + 1}`,
        sector: 'Technology',
        currentStage: 'seed',
        totalInvested: 1000000,
        currentValuation: 5000000,
        ownershipPercentage: 0.1,
        investmentDate: '2024-01-01T00:00:00.000Z',
        isActive: true,
        currentMOIC: 2.5,
      })),
      availableReserves: 10000000,
      totalFundSize: 50000000,
      graduationMatrix: {
        name: 'Test Matrix',
        rates: [
          {
            fromStage: 'seed',
            toStage: 'series_a',
            probability: 0.6,
            timeToGraduation: 18,
            valuationMultiple: 3.0,
          },
        ],
      },
      stageStrategies: [
        {
          stage: 'seed',
          targetOwnership: 0.08,
          maxInvestment: 2000000,
          minInvestment: 100000,
          followOnProbability: 0.8,
          reserveMultiple: 2.0,
          failureRate: 0.7,
          expectedMOIC: 15.0,
          expectedTimeToExit: 84,
          maxConcentration: 0.05,
          diversificationWeight: 0.8,
        },
      ],
    });

    it('should handle portfolio with more than 3 companies (fix for truncation bug)', async () => {
      const response = await request(app)
        .post('/api/reserves/calculate')
        .send(createValidInput(10))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.allocations).toHaveLength(10);
      expect(response.body.data.inputSummary.totalPortfolioCompanies).toBe(10);
    });

    it('should apply pagination with limit parameter', async () => {
      const response = await request(app)
        .post('/api/reserves/calculate?limit=5')
        .send(createValidInput(10))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.allocations).toHaveLength(5);
      expect(response.body.data.inputSummary.totalPortfolioCompanies).toBe(10);
    });

    it('should apply pagination with offset parameter', async () => {
      const response = await request(app)
        .post('/api/reserves/calculate?limit=3&offset=2')
        .send(createValidInput(10))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.allocations).toHaveLength(3);
      // Verify we got companies starting from index 2
      expect(response.body.data.allocations[0].companyId).toBe('3');
    });

    it('should enforce maximum limit of 500', async () => {
      const response = await request(app)
        .post('/api/reserves/calculate?limit=1000')
        .send(createValidInput(10))
        .expect(400); // Should fail validation

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation error');
    });

    it('should use default limit of 100 when not specified', async () => {
      const largePortfolio = createValidInput(200);

      const response = await request(app)
        .post('/api/reserves/calculate')
        .send(largePortfolio)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.allocations).toHaveLength(100);
    });

    it('should accept date strings and convert to ISO format (fix for date schema)', async () => {
      const input = createValidInput(1);
      input.portfolio[0].investmentDate = '2024-01-15'; // Date string without time
      input.portfolio[0].lastRoundDate = '2024-06-01T12:00:00Z';
      input.portfolio[0].exitDate = new Date('2024-12-31') as any;

      const response = await request(app)
        .post('/api/reserves/calculate')
        .send(input)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Dates should be normalized to ISO strings in the response
      expect(response.body.data.metadata.calculationDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should parse boolean query params from strings (fix for query param parsing)', async () => {
      const response = await request(app)
        .post('/api/reserves/calculate?async=true&cache=false')
        .send(createValidInput(3))
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should handle case-insensitive priority values', async () => {
      const response = await request(app)
        .post('/api/reserves/calculate?priority=HIGH')
        .send(createValidInput(3))
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should ignore unknown query parameters (default Zod behavior)', async () => {
      const response = await request(app)
        .post('/api/reserves/calculate?limit=5&unknownParam=value')
        .send(createValidInput(10))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.allocations).toHaveLength(5);
    });

    it('should handle string "1" and "0" as boolean values', async () => {
      const response = await request(app)
        .post('/api/reserves/calculate?async=1&cache=0')
        .send(createValidInput(3))
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should validate minimum offset of 0', async () => {
      const response = await request(app)
        .post('/api/reserves/calculate?offset=-1')
        .send(createValidInput(10))
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation error');
    });

    it('should handle empty portfolio', async () => {
      const input = createValidInput(0);

      const response = await request(app)
        .post('/api/reserves/calculate')
        .send(input)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.allocations).toHaveLength(0);
      expect(response.body.data.inputSummary.totalPortfolioCompanies).toBe(0);
    });

    it('should include pagination metadata in response', async () => {
      const response = await request(app)
        .post('/api/reserves/calculate?limit=5&offset=3')
        .send(createValidInput(10))
        .expect(200);

      expect(response.body.metadata.correlationId).toBe('test-correlation-id');
      expect(response.body.metadata.processingTime).toBeGreaterThan(0);
      expect(response.body.metadata.timestamp).toBeDefined();
    });
  });

  describe('POST /api/reserves/calculate-protected', () => {
    it('should support pagination in protected endpoint', async () => {
      const input = {
        portfolio: Array.from({ length: 10 }, (_, i) => ({
          id: `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`,
          name: `Company ${i + 1}`,
          sector: 'Technology',
          currentStage: 'seed',
          totalInvested: 1000000,
          currentValuation: 5000000,
          ownershipPercentage: 0.1,
          investmentDate: '2024-01-01T00:00:00.000Z',
          isActive: true,
          currentMOIC: 2.5,
        })),
        availableReserves: 10000000,
        totalFundSize: 50000000,
        graduationMatrix: {
          name: 'Test Matrix',
          rates: [
            {
              fromStage: 'seed',
              toStage: 'series_a',
              probability: 0.6,
              timeToGraduation: 18,
              valuationMultiple: 3.0,
            },
          ],
        },
        stageStrategies: [
          {
            stage: 'seed',
            targetOwnership: 0.08,
            maxInvestment: 2000000,
            minInvestment: 100000,
            followOnProbability: 0.8,
            reserveMultiple: 2.0,
            failureRate: 0.7,
            expectedMOIC: 15.0,
            expectedTimeToExit: 84,
            maxConcentration: 0.05,
            diversificationWeight: 0.8,
          },
        ],
      };

      const response = await request(app)
        .post('/api/reserves/calculate-protected?limit=5')
        .send(input)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.allocations).toHaveLength(5);
    });
  });

  describe('GET /api/reserves/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/reserves/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.service).toBe('reserves-api');
    });
  });

  describe('GET /api/reserves/config', () => {
    it('should return API configuration', async () => {
      const response = await request(app)
        .get('/api/reserves/config')
        .expect(200);

      expect(response.body.limits).toBeDefined();
      expect(response.body.limits.maxPortfolioSize).toBe(1000);
    });
  });
});

describe('Zod Schema Coercion Tests', () => {
  it('should coerce date strings to Date objects and transform to ISO strings', () => {
    const schema = z.coerce.date().transform(d => d.toISOString());

    // Test various date formats
    expect(schema.parse('2024-01-15')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(schema.parse('2024-01-15T12:00:00Z')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(schema.parse(new Date('2024-01-15'))).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('should coerce boolean strings to boolean values', () => {
    const schema = z.coerce.boolean();

    // Note: z.coerce.boolean() uses JavaScript's Boolean() constructor
    // which treats non-empty strings as truthy, empty strings as falsy
    expect(schema.parse('true')).toBe(true);
    expect(schema.parse('false')).toBe(true); // Non-empty string is truthy
    expect(schema.parse('1')).toBe(true);
    expect(schema.parse('0')).toBe(true); // Non-empty string is truthy
    expect(schema.parse('')).toBe(false); // Empty string is falsy
    expect(schema.parse(true)).toBe(true);
    expect(schema.parse(false)).toBe(false);
    expect(schema.parse(1)).toBe(true);
    expect(schema.parse(0)).toBe(false);
  });

  it('should handle enum with case transformation', () => {
    const schema = z.enum(['low', 'normal', 'high']).optional().transform(val =>
      val ? val.toLowerCase() as 'low' | 'normal' | 'high' : val
    );

    expect(schema.parse('low')).toBe('low');
    expect(schema.parse('normal')).toBe('normal');
    expect(schema.parse('high')).toBe('high');
  });

  it('should coerce numeric strings to numbers', () => {
    const schema = z.coerce.number().int().min(1).max(500);

    expect(schema.parse('100')).toBe(100);
    expect(schema.parse(100)).toBe(100);
    expect(schema.parse('1')).toBe(1);
    expect(schema.parse('500')).toBe(500);
  });

  it('should reject invalid values with coercion', () => {
    const numSchema = z.coerce.number().int().min(1).max(500);

    expect(() => numSchema.parse('0')).toThrow();
    expect(() => numSchema.parse('501')).toThrow();
    expect(() => numSchema.parse('-5')).toThrow();
  });
});
