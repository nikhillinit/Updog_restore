import { describe, expect, it } from 'vitest';

import * as quarterlyReviewService from '../../../../server/services/internal-analysis/quarterly-review-service';
import type { QuarterlyReviewServiceError } from '../../../../server/services/internal-analysis/quarterly-review-service';
import {
  executeQuarterlyReviewItemCommand,
  executeQuarterlyReviewWaiverCommand,
  summarizeQuarterlyReview,
} from '../../../../server/services/internal-analysis/quarterly-review-service';

const CATEGORIES = [
  'cases_probabilities',
  'kpis',
  'valuation_fmv',
  'reserve_plan',
  'qualitative_risks',
] as const;

function roster(companyCount = 1) {
  return {
    rosterId: 10,
    fundId: 7,
    draftId: 3,
    draftVersion: 2,
    financialFactsSnapshotId: 41,
    companyCount,
  };
}

function company(overrides: Record<string, unknown> = {}) {
  return {
    companyId: 20,
    portfolioCompanyId: 100,
    waivedAt: null,
    waivedBy: null,
    waiverReason: null,
    version: 1,
    ...overrides,
  };
}

function items(state: 'pending' | 'changed' | 'reviewed_no_change' = 'pending') {
  return CATEGORIES.map((category, index) => ({
    itemId: 30 + index,
    companyId: 20,
    category,
    state,
    version: 1,
  }));
}

class FakeCommandPorts {
  receipts = new Map<string, { requestHash: string; result: Record<string, unknown> }>();
  itemMutations = 0;
  waiverMutations = 0;

  async findReceipt(_fundId: number, idempotencyKey: string) {
    return this.receipts.get(idempotencyKey) ?? null;
  }

  async executeItemMutation(input: { idempotencyKey: string; requestHash: string }) {
    this.itemMutations += 1;
    const result = {
      receiptId: 81,
      operation: 'review_item_update',
      draftId: 3,
      targetId: 34,
      resultingRowVersion: 2,
    };
    this.receipts.set(input.idempotencyKey, { requestHash: input.requestHash, result });
    return result;
  }

  async executeWaiverMutation(input: { idempotencyKey: string; requestHash: string }) {
    this.waiverMutations += 1;
    const result = {
      receiptId: 82,
      operation: 'company_waive',
      draftId: 3,
      targetId: 20,
      resultingRowVersion: 2,
    };
    this.receipts.set(input.idempotencyKey, { requestHash: input.requestHash, result });
    return result;
  }
}

describe('quarterly review service', () => {
  it('exposes receipt-backed item and waiver commands', () => {
    expect(quarterlyReviewService.executeQuarterlyReviewItemCommand).toBeTypeOf('function');
    expect(quarterlyReviewService.executeQuarterlyReviewWaiverCommand).toBeTypeOf('function');
  });

  it('distinguishes a missing marker from an explicit empty roster', () => {
    expect(summarizeQuarterlyReview(null, [], [])).toEqual({
      requiresRefresh: true,
      companyCount: 0,
      completedCompanyCount: 0,
      pending: [],
      canFinalize: false,
    });
    expect(summarizeQuarterlyReview(roster(0), [], [])).toEqual({
      requiresRefresh: false,
      companyCount: 0,
      completedCompanyCount: 0,
      pending: [],
      canFinalize: true,
    });
  });

  it('reports pending categories in deterministic five-category order', () => {
    const result = summarizeQuarterlyReview(roster(), [company()], items());

    expect(result.pending).toEqual([
      { companyId: 20, portfolioCompanyId: 100, categories: [...CATEGORIES] },
    ]);
    expect(result.canFinalize).toBe(false);
  });

  it('treats a terminal waiver as company-complete', () => {
    const result = summarizeQuarterlyReview(
      roster(),
      [company({ waivedAt: new Date('2026-08-03T00:00:00.000Z'), waivedBy: 9 })],
      items()
    );

    expect(result.completedCompanyCount).toBe(1);
    expect(result.pending).toEqual([]);
    expect(result.canFinalize).toBe(true);
  });

  it('fails closed when marker count and membership differ', () => {
    expect(() => summarizeQuarterlyReview(roster(2), [company()], items())).toThrowError(
      expect.objectContaining({
        statusCode: 409,
        code: 'QUARTERLY_REVIEW_ROSTER_CORRUPT',
        details: {
          draftId: 3,
          draftVersion: 2,
          financialFactsSnapshotId: 41,
          expectedCompanyCount: 2,
          actualCompanyCount: 1,
        },
      })
    );
  });

  it('replays an exact item receipt before attempting current-state mutation', async () => {
    const ports = new FakeCommandPorts();
    const input = {
      fundId: 7,
      draftId: 3,
      companyId: 20,
      category: 'kpis' as const,
      expectedDraftVersion: 2,
      expectedRowVersion: 1,
      actorId: 9,
      idempotencyKey: 'item-key',
      rawIfMatch: 'W/"draft-2"',
      body: {
        state: 'changed' as const,
        note: 'Updated KPI assumptions',
        changeReference: {
          kind: 'internal_route' as const,
          path: '/portfolio/company/100',
          label: 'Company detail',
        },
      },
    };

    const first = await executeQuarterlyReviewItemCommand(ports, input);
    const replay = await executeQuarterlyReviewItemCommand(ports, input);

    expect(replay).toEqual(first);
    expect(ports.itemMutations).toBe(1);
  });

  it('rejects item receipt key reuse with a different normalized request', async () => {
    const ports = new FakeCommandPorts();
    const input = {
      fundId: 7,
      draftId: 3,
      companyId: 20,
      category: 'kpis' as const,
      expectedDraftVersion: 2,
      expectedRowVersion: 1,
      actorId: 9,
      idempotencyKey: 'item-key',
      rawIfMatch: 'W/"draft-2"',
      body: { state: 'reviewed_no_change' as const, note: 'Reviewed' },
    };
    await executeQuarterlyReviewItemCommand(ports, input);

    await expect(
      executeQuarterlyReviewItemCommand(ports, {
        ...input,
        body: { state: 'reviewed_no_change', note: 'Different note' },
      })
    ).rejects.toMatchObject<Partial<QuarterlyReviewServiceError>>({
      statusCode: 409,
      code: 'IDEMPOTENCY_KEY_REUSE',
    });
    expect(ports.itemMutations).toBe(1);
  });

  it('rejects oversized followUpTaskId before receipt lookup or mutation', async () => {
    const ports = new FakeCommandPorts();

    await expect(
      executeQuarterlyReviewItemCommand(ports, {
        fundId: 7,
        draftId: 3,
        companyId: 20,
        category: 'kpis',
        actorId: 9,
        idempotencyKey: 'follow-up-overflow',
        rawIfMatch: 'W/"item"',
        body: {
          state: 'changed',
          note: 'Updated assumptions.',
          changeReference: {
            kind: 'internal_route',
            path: '/portfolio/company/100',
            label: 'Company detail',
          },
          followUpTaskId: 2_147_483_648,
        },
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_QUARTERLY_REVIEW_ITEM_MUTATION',
    });
    expect(ports.itemMutations).toBe(0);
    expect(ports.receipts.size).toBe(0);
  });

  it('replays an exact waiver receipt without editing a now-terminal company', async () => {
    const ports = new FakeCommandPorts();
    const input = {
      fundId: 7,
      draftId: 3,
      companyId: 20,
      expectedDraftVersion: 2,
      expectedRowVersion: 1,
      actorId: 9,
      idempotencyKey: 'waiver-key',
      rawIfMatch: 'W/"draft-2"',
      body: { reason: 'Company exited after period end' },
    };

    const first = await executeQuarterlyReviewWaiverCommand(ports, input);
    const replay = await executeQuarterlyReviewWaiverCommand(ports, input);

    expect(replay).toEqual(first);
    expect(ports.waiverMutations).toBe(1);
  });
});
