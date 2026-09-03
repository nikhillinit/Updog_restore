import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dbMock, selectChain } = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  selectChain.from.mockReturnValue(selectChain);
  selectChain.where.mockReturnValue(selectChain);

  return {
    dbMock: {
      select: vi.fn(() => selectChain),
      execute: vi.fn(),
    },
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
