import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateReserveSummary } from '@shared/core/reserves/ReserveEngine';
import { generatePacingSummary } from '@shared/core/pacing/PacingEngine';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('live financial summary calculation identity', () => {
  it('keeps outputs and provenance stable when ambient algorithm flags change', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-06T00:00:00Z'));
    const portfolio = Array.from({ length: 5 }, (_, index) => ({
      id: index + 1,
      invested: 1_000_000,
      ownership: 0.1,
      stage: 'Seed',
      sector: 'SaaS',
    }));
    const input = {
      fundSize: 100_000_000,
      deploymentQuarter: 1,
      marketCondition: 'neutral' as const,
    };
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ALG_RESERVE', 'false');
    vi.stubEnv('ALG_PACING', 'false');
    const reserve = generateReserveSummary(1, portfolio);
    const pacing = generatePacingSummary(input);
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ALG_RESERVE', 'true');
    vi.stubEnv('ALG_PACING', 'true');
    expect(generateReserveSummary(1, portfolio)).toEqual(reserve);
    expect(generatePacingSummary(input)).toEqual(pacing);
    expect(reserve).toMatchObject({
      basis: { calculationKey: 'reserve', effectiveMode: 'on' },
      resultHash: expect.any(String),
    });
    expect(pacing).toMatchObject({
      basis: { calculationKey: 'pacing', effectiveMode: 'on' },
      resultHash: expect.any(String),
    });
  });
});
