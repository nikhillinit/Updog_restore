import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ReserveEngineClient,
  ValidationError,
  type ReserveCalculationRequest,
} from '@/api/reserve-engine-client';

describe('Wave 2 reserve-engine client boundary', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses the health-check response through the typed client boundary', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'healthy',
          timestamp: '2026-03-25T00:00:00.000Z',
          version: '1.0.0',
          service: 'reserve-engine',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const client = new ReserveEngineClient({
      baseUrl: 'https://example.test',
      retryAttempts: 0,
      retryDelay: 0,
    });

    await expect(client.healthCheck()).resolves.toMatchObject({
      status: 'healthy',
      service: 'reserve-engine',
    });
  });

  it('raises a validation error when the API returns a validation payload', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_FAILED',
          correlationId: 'corr-1',
          timestamp: '2026-03-25T00:00:00.000Z',
          validationErrors: [
            {
              field: 'initialCheckSize',
              constraint: 'min',
              value: '0',
              message: 'must be positive',
            },
          ],
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const client = new ReserveEngineClient({
      baseUrl: 'https://example.test',
      retryAttempts: 0,
      retryDelay: 0,
    });
    const request: ReserveCalculationRequest = {
      fundId: 'fund-1',
      totalAllocatedCapital: 1_000_000,
      initialCheckSize: 10_000,
      entryStage: 'Seed',
      stages: [{ name: 'Seed', roundSize: 100_000, graduationRate: 0.5 }],
      followOnStrategy: [{ stage: 'Seed', checkSize: 50_000, participationRate: 0.5 }],
    };

    await expect(client.calculateReserveAllocation(request)).rejects.toBeInstanceOf(ValidationError);
  });
});
