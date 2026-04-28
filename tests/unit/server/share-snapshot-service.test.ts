import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Share } from '../../../shared/schema/shares';
import { buildPublicShareSnapshotPayload } from '../../../server/services/share-snapshot-service';

const readModelState = vi.hoisted(() => ({
  value: undefined as
    | {
        fund: { name: string; size: string; deployedCapital: string };
        portfolioCompanies: Array<{
          name: string;
          stage: string;
          status: string;
          investmentAmount?: string;
          currentValuation?: string | null;
          exitMoicBps?: number | null;
        }>;
        recentActivities: unknown[];
        metrics: {
          asOfDate: Date;
          metricDate?: Date;
          totalValue: string;
          multiple: string;
          dpi: string;
          tvpi: string;
          runId: number;
        };
        summary: { totalCompanies: number; deploymentRate: number; currentIRR: number };
      }
    | undefined,
}));

vi.mock('../../../server/storage', () => ({ storage: {} }));
vi.mock('../../../server/services/dashboard-summary-read-service', () => ({
  getDashboardSummaryReadModel: vi.fn(async () => readModelState.value),
}));

function createShare(overrides: Partial<Share> = {}): Share {
  const now = new Date('2026-04-27T12:00:00.000Z');
  return {
    id: 'share-1',
    fundId: 'missing-fund',
    createdBy: 'user-1',
    accessLevel: 'view_only',
    requirePasskey: false,
    passkeyHash: null,
    expiresAt: null,
    hiddenMetrics: [],
    customTitle: 'Investor snapshot',
    customMessage: null,
    viewCount: 0,
    lastViewedAt: null,
    isActive: true,
    version: 1,
    idempotencyKey: null,
    idempotencyRequestHash: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function expectNoKey(value: unknown, forbiddenKey: string): void {
  if (Array.isArray(value)) {
    value.forEach((item) => expectNoKey(item, forbiddenKey));
    return;
  }

  if (value !== null && typeof value === 'object') {
    Object.entries(value).forEach(([key, child]) => {
      expect(key).not.toBe(forbiddenKey);
      expectNoKey(child, forbiddenKey);
    });
  }
}

describe('public share snapshot service', () => {
  beforeEach(() => {
    readModelState.value = undefined;
  });

  it('redacts hidden metrics server-side', async () => {
    const { payload } = await buildPublicShareSnapshotPayload(
      createShare({ hiddenMetrics: ['irr'] }),
      'user-1',
      'snapshot-1'
    );

    expect(payload.metrics.map((metric) => metric.id)).not.toContain('irr');
    expect(payload.hiddenMetricPolicy).toEqual({
      requested: ['irr'],
      applied: ['irr'],
    });
  });

  it('redacts portfolio company MOIC when the metric is hidden', async () => {
    readModelState.value = {
      fund: { name: 'Fund I', size: '100000000', deployedCapital: '25000000' },
      portfolioCompanies: [
        {
          name: 'Company A',
          stage: 'Series A',
          status: 'active',
          investmentAmount: '1000000',
          currentValuation: '4000000',
          exitMoicBps: 35000,
        },
      ],
      recentActivities: [],
      metrics: {
        asOfDate: new Date('2026-04-01T00:00:00.000Z'),
        totalValue: '4000000',
        multiple: '4',
        dpi: '0.5',
        tvpi: '4.5',
        runId: 42,
      },
      summary: { totalCompanies: 1, deploymentRate: 25, currentIRR: 18.2 },
    };

    const visible = await buildPublicShareSnapshotPayload(
      createShare({ fundId: '1', hiddenMetrics: [] }),
      'user-1',
      'snapshot-1'
    );
    const hidden = await buildPublicShareSnapshotPayload(
      createShare({ fundId: '1', hiddenMetrics: ['moic'] }),
      'user-1',
      'snapshot-2'
    );

    expect(visible.payload.portfolioCompanies[0]?.moic).toBe(3.5);
    expect(hidden.payload.metrics.map((metric) => metric.id)).not.toContain('moic');
    expect(hidden.payload.portfolioCompanies[0]?.moic).toBeNull();
  });

  it('hashes content deterministically without snapshot audit fields', async () => {
    readModelState.value = {
      fund: { name: 'Fund I', size: '100000000', deployedCapital: '25000000' },
      portfolioCompanies: [],
      recentActivities: [],
      metrics: {
        asOfDate: new Date('2026-04-01T00:00:00.000Z'),
        totalValue: '4000000',
        multiple: '4',
        dpi: '0.5',
        tvpi: '4.5',
        runId: 42,
      },
      summary: { totalCompanies: 0, deploymentRate: 25, currentIRR: 18.2 },
    };

    const first = await buildPublicShareSnapshotPayload(
      createShare({ fundId: '1' }),
      'user-1',
      'snapshot-1'
    );
    const second = await buildPublicShareSnapshotPayload(
      createShare({ fundId: '1' }),
      'user-1',
      'snapshot-2'
    );

    expect(first.payload.snapshotId).not.toBe(second.payload.snapshotId);
    expect(first.payloadHash).toBe(second.payloadHash);
  });

  it('marks unsupported source data unavailable instead of fabricating values', async () => {
    const { payload } = await buildPublicShareSnapshotPayload(
      createShare(),
      'user-1',
      'snapshot-1'
    );

    const capitalCalled = payload.metrics.find((metric) => metric.id === 'capital_called');
    const totalCommitments = payload.metrics.find((metric) => metric.id === 'total_commitments');

    expect(capitalCalled).toMatchObject({
      availability: 'unavailable',
      value: null,
      unavailableReason: 'capital_call_source_not_yet_persisted',
    });
    expect(totalCommitments).toMatchObject({
      availability: 'unavailable',
      value: null,
    });
    expectNoKey(payload, 'fundId');
  });
});
