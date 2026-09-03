import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dbMock, insertChain, selectChain } = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  const insertChain = {
    values: vi.fn(),
    returning: vi.fn(),
  };
  selectChain.from.mockReturnValue(selectChain);
  selectChain.where.mockReturnValue(selectChain);
  insertChain.values.mockReturnValue(insertChain);

  return {
    dbMock: {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
      execute: vi.fn(),
    },
    insertChain,
    selectChain,
  };
});

vi.mock('../../../server/db.js', () => ({ db: dbMock }));

vi.mock('../../../server/observability/production-metrics.js', () => ({
  approvalMetrics: {
    denied: { inc: vi.fn() },
    verifyDuration: { startTimer: vi.fn(() => vi.fn()) },
  },
}));

import {
  createApprovalIfNeeded,
  DEFAULT_MIN_APPROVALS,
  computeStrategyHash,
  requiresApproval,
  verifyApproval,
} from '../../../server/lib/approvals-guard';

const approvalRow = (calculationHash: string) => ({
  id: 'approval-1',
  strategyId: 'strategy-1',
  calculationHash,
  status: 'approved',
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
});

const signature = (partnerId: string, partnerEmail: string) => ({
  partner_id: partnerId,
  partner_email: partnerEmail,
  approved_at: new Date(),
});

describe('approvals guard defaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectChain.limit.mockReset();
    insertChain.returning.mockReset();
    dbMock.execute.mockReset();
  });

  it('hashes canonical strategy inputs deterministically', () => {
    const hash = computeStrategyHash({
      fund: { id: '123', name: 'Test Fund' },
      companies: [{ id: 'c1', invested: 100_000 }],
    });

    expect(hash).toBe(
      computeStrategyHash({
        companies: [{ invested: 100_000, id: 'c1' }],
        fund: { name: 'Test Fund', id: '123' },
      })
    );
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('requires approval at the amount and fund-count thresholds', () => {
    expect(requiresApproval('create', 999_999, 2)).toBe(false);
    expect(requiresApproval('create', 1_000_000, 1)).toBe(true);
    expect(requiresApproval('create', 1, 3)).toBe(true);
    expect(requiresApproval('delete', 0, 0)).toBe(true);
    expect(requiresApproval('update', 1, 1)).toBe(true);
  });

  it('skips approval creation and database access for low-impact creates', async () => {
    await expect(
      createApprovalIfNeeded(
        'test-strategy',
        'create',
        { reserves: 100_000 },
        'Small allocation test',
        'admin@test.com',
        {
          affectedFunds: ['fund1'],
          estimatedAmount: 100_000,
          riskLevel: 'low',
        }
      )
    ).resolves.toEqual({ requiresApproval: false });
    expect(dbMock.select).not.toHaveBeenCalled();
    expect(dbMock.execute).not.toHaveBeenCalled();
  });

  it('reuses an existing approval for matching strategy inputs', async () => {
    selectChain.limit.mockResolvedValue([{ id: 'existing-approval' }]);

    await expect(
      createApprovalIfNeeded(
        'existing-approval-strategy',
        'update',
        { reserves: 1_000_000 },
        'Existing approval test',
        'admin@test.com',
        {
          affectedFunds: ['fund1'],
          estimatedAmount: 1_000_000,
          riskLevel: 'high',
        }
      )
    ).resolves.toEqual({ requiresApproval: true, approvalId: 'existing-approval' });

    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it('persists a new approval with the estimated amount converted to cents', async () => {
    selectChain.limit.mockResolvedValue([]);
    insertChain.returning.mockResolvedValue([{ id: 'new-approval' }]);

    await expect(
      createApprovalIfNeeded(
        'new-approval-strategy',
        'create',
        { reserves: 12_345.67 },
        'New approval test',
        'admin@test.com',
        {
          affectedFunds: ['fund1', 'fund2', 'fund3'],
          estimatedAmount: 12_345.67,
          riskLevel: 'medium',
        }
      )
    ).resolves.toEqual({ requiresApproval: true, approvalId: 'new-approval' });

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        strategyId: 'new-approval-strategy',
        estimatedAmount: 1_234_567,
      })
    );
  });

  it('fails when approval insertion returns no row', async () => {
    selectChain.limit.mockResolvedValue([]);
    insertChain.returning.mockResolvedValue([]);

    await expect(
      createApprovalIfNeeded(
        'empty-insert-strategy',
        'delete',
        { reserves: 1_000_001 },
        'Empty insert test',
        'admin@test.com',
        {
          affectedFunds: ['fund1'],
          estimatedAmount: 1_000_001,
          riskLevel: 'high',
        }
      )
    ).rejects.toThrow('Failed to create approval request');
  });

  it('rate limits the fourth matching approval request', async () => {
    selectChain.limit.mockResolvedValue([{ id: 'rate-limit-approval' }]);
    const request = () =>
      createApprovalIfNeeded(
        'rate-limit-strategy-unit-3926712007',
        'update',
        { reserves: 2_000_000 },
        'Rate limit test',
        'admin@test.com',
        {
          affectedFunds: ['fund1'],
          estimatedAmount: 2_000_000,
          riskLevel: 'high',
        }
      );

    await expect(request()).resolves.toEqual({
      requiresApproval: true,
      approvalId: 'rate-limit-approval',
    });
    await expect(request()).resolves.toEqual({
      requiresApproval: true,
      approvalId: 'rate-limit-approval',
    });
    await expect(request()).resolves.toEqual({
      requiresApproval: true,
      approvalId: 'rate-limit-approval',
    });
    await expect(request()).resolves.toEqual({ requiresApproval: true, rateLimited: true });

    expect(dbMock.select).toHaveBeenCalledTimes(3);
  });

  // Uses the REAL validateDistinctSigners: it requires two unique signers, so
  // this test proves the guard skips it at the single-signature threshold.
  it('accepts one distinct signature, including requester self-signing', async () => {
    const calculationHash = computeStrategyHash({ reserves: 1_000_000 });
    selectChain.limit.mockResolvedValue([approvalRow(calculationHash)]);
    dbMock.execute.mockResolvedValue({
      rows: [signature('requester-partner', 'requester@example.com')],
    });

    const result = await verifyApproval({
      strategyId: 'strategy-1',
      inputsHash: calculationHash,
    });

    expect(DEFAULT_MIN_APPROVALS).toBe(1);
    expect(result.ok).toBe(true);
    expect(result.signatures).toHaveLength(1);
    expect(result.signatures?.[0]).toMatchObject({ partner_email: 'requester@example.com' });
  });

  it('still requires distinct signers when a caller raises the threshold', async () => {
    const calculationHash = computeStrategyHash({ reserves: 2_000_000 });
    selectChain.limit.mockResolvedValue([approvalRow(calculationHash)]);
    dbMock.execute.mockResolvedValue({
      rows: [
        signature('partner-1', 'partner@example.com'),
        signature('partner-1', 'partner@example.com'),
      ],
    });

    const result = await verifyApproval({
      strategyId: 'strategy-1',
      inputsHash: calculationHash,
      minApprovals: 2,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/distinct partners/);
  });
});
