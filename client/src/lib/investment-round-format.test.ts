import { describe, it, expect } from 'vitest';
import { formatRoundMoney, formatRoundDate } from './investment-round-format';

describe('investment-round-format', () => {
  it('formats ISO-currency decimal strings as whole money', () => {
    expect(formatRoundMoney('25000', 'USD')).toBe('$25,000');
    expect(formatRoundMoney(null, 'USD')).toBe('—');
    expect(formatRoundMoney('not-a-number', 'USD')).toBe('—');
  });

  it('formats YYYY-MM-DD in UTC (no off-by-one)', () => {
    expect(formatRoundDate('2024-06-01')).toBe('Jun 1, 2024');
    expect(formatRoundDate('')).toBe('Unknown');
  });
});
