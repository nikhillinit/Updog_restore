import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    query: {
      fundConfigs: {
        findFirst: vi.fn(),
      },
      funds: {
        findFirst: vi.fn(),
      },
    },
  },
}));

vi.mock('../../../server/db', () => ({
  db: mockDb,
}));

import {
  extractFundSizeFromConfig,
  resolvePacingFundSize,
} from '../../../workers/pacing-worker-support';

describe('pacing worker support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts fund size from top-level or nested config payloads', () => {
    expect(extractFundSizeFromConfig({ fundSize: 125_000_000 })).toBe(125_000_000);
    expect(extractFundSizeFromConfig({ generalInfo: { fundSize: 95_000_000 } })).toBe(95_000_000);
    expect(extractFundSizeFromConfig({ fundFinancials: { fundSize: '87000000' } })).toBe(
      87_000_000
    );
  });

  it('prefers the published config value over the legacy funds.size column', async () => {
    mockDb.query.fundConfigs.findFirst.mockResolvedValue({
      id: 5,
      fundId: 1,
      version: 3,
      config: { fundSize: 140_000_000 },
    });
    mockDb.query.funds.findFirst.mockResolvedValue({
      id: 1,
      size: '100000000',
    });

    const result = await resolvePacingFundSize({ fundId: 1, configId: 5, configVersion: 3 });

    expect(result).toBe(140_000_000);
    expect(mockDb.query.funds.findFirst).not.toHaveBeenCalled();
  });

  it('falls back to funds.size when the config does not carry fundSize', async () => {
    mockDb.query.fundConfigs.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 7,
      fundId: 1,
      version: 4,
      config: {},
    });
    mockDb.query.funds.findFirst.mockResolvedValue({
      id: 1,
      size: '155000000',
    });

    const result = await resolvePacingFundSize({ fundId: 1, configVersion: 4 });

    expect(result).toBe(155_000_000);
    expect(mockDb.query.funds.findFirst).toHaveBeenCalledTimes(1);
  });
});
