import { describe, expect, it } from 'vitest';
import {
  calculateDPI,
  calculateTVPI,
  generatePortfolioNAV,
  projectNAVEnhanced,
  projectNAVSimple,
} from '@/lib/nav';

describe('nav projection utilities', () => {
  it('guards projectNAVEnhanced when exit quarters would be zero', () => {
    const result = projectNAVEnhanced(100, 20, {
      blindPoolQuarters: 8,
      appreciationQuarters: 12,
    });

    expect(result).toHaveLength(21);
    expect(result.every((point) => Number.isFinite(point.nav))).toBe(true);
    expect(result.every((point) => Number.isFinite(point.distributions))).toBe(true);
  });

  it('guards projectNAVSimple when decay period would be zero', () => {
    const result = projectNAVSimple(100, 0, 8);

    expect(result).toHaveLength(9);
    expect(result.every((value) => Number.isFinite(value))).toBe(true);
    expect(result[result.length - 1]).toBe(100);
  });

  it('precomputes portfolio NAV without changing output shape', () => {
    const portfolio = generatePortfolioNAV(
      [
        { amount: 100, startQuarter: 0, exitQuarter: 10, exitMultiple: 2 },
        { amount: 50, startQuarter: 2, exitQuarter: 9, exitMultiple: 1.5 },
      ],
      12
    );

    expect(portfolio).toHaveLength(13);
    expect(portfolio.every((point) => Number.isFinite(point.totalNAV))).toBe(true);
    expect(portfolio.every((point) => Number.isFinite(point.totalDistributions))).toBe(true);
    expect(portfolio[11]?.totalDistributions).toBeGreaterThan(0);
  });

  it('uses safe decimal division in TVPI/DPI helpers', () => {
    expect(calculateTVPI(0.1, 0.2, 0.3)).toBeCloseTo(1, 12);
    expect(calculateDPI(0.1, 0.2)).toBeCloseTo(0.5, 12);
  });
});
