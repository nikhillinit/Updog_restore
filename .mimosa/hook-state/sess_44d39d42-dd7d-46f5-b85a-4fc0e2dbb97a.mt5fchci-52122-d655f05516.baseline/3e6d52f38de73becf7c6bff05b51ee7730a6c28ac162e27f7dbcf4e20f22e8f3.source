import { describe, expect, it } from 'vitest';

import {
  POSTGRES_INT_MAX,
  QUARTERLY_REVIEW_CATEGORIES,
  QUARTERLY_REVIEW_ITEM_STATES,
  QuarterlyReviewChangeReferenceSchema,
  QuarterlyReviewCommandResultSchema,
  QuarterlyReviewCorruptErrorSchema,
  QuarterlyReviewItemSchema,
  QuarterlyReviewItemMutationSchema,
  QuarterlyReviewWaiverMutationSchema,
} from '../../../../shared/contracts/internal-analysis/quarterly-review-v1.contract';

describe('quarterly-review-v1 contract', () => {
  it('freezes category and state literals', () => {
    expect(QUARTERLY_REVIEW_CATEGORIES).toEqual([
      'cases_probabilities',
      'kpis',
      'valuation_fmv',
      'reserve_plan',
      'qualitative_risks',
    ]);
    expect(QUARTERLY_REVIEW_ITEM_STATES).toEqual(['pending', 'changed', 'reviewed_no_change']);
  });

  it('keeps changed provenance separate from optional follow-up', () => {
    expect(
      QuarterlyReviewItemMutationSchema.parse({
        state: 'changed',
        note: '  Updated after board meeting.  ',
        changeReference: {
          kind: 'internal_route',
          path: '/fund-model-results/7/scenarios',
          label: '  Scenario   workspace ',
        },
        followUpTaskId: 19,
      })
    ).toEqual({
      state: 'changed',
      note: 'Updated after board meeting.',
      changeReference: {
        kind: 'internal_route',
        path: '/fund-model-results/7/scenarios',
        label: 'Scenario workspace',
      },
      followUpTaskId: 19,
    });

    expect(() =>
      QuarterlyReviewItemMutationSchema.parse({
        state: 'reviewed_no_change',
        note: 'Reviewed.',
        followUpTaskId: 19,
      })
    ).toThrow();

    expect(() =>
      QuarterlyReviewChangeReferenceSchema.parse({
        kind: 'internal_route',
        path: '/fund-model-results/7/scenarios',
        label: 'Scenario workspace',
        taskId: 19,
      })
    ).toThrow();
  });

  it('bounds every persisted quarterly-review identifier to PostgreSQL integer range', () => {
    expect(POSTGRES_INT_MAX).toBe(2_147_483_647);
    expect(() =>
      QuarterlyReviewItemMutationSchema.parse({
        state: 'changed',
        note: 'Updated assumptions.',
        changeReference: {
          kind: 'internal_route',
          path: '/portfolio/company/100',
          label: 'Company detail',
        },
        followUpTaskId: POSTGRES_INT_MAX + 1,
      })
    ).toThrow();
  });

  it.each(['https://example.com/x', '//example.com/x', '/../admin', '/x\u0000y'])(
    'rejects unsafe internal route %s',
    (path) => {
      expect(() =>
        QuarterlyReviewChangeReferenceSchema.parse({ kind: 'internal_route', path, label: 'Link' })
      ).toThrow();
    }
  );

  it('rejects blank mutation prose and unknown keys', () => {
    expect(() => QuarterlyReviewWaiverMutationSchema.parse({ reason: '   ' })).toThrow();
    expect(() =>
      QuarterlyReviewCommandResultSchema.parse({
        receiptId: 1,
        operation: 'review_item_update',
        draftId: 2,
        targetId: 3,
        resultingRowVersion: 2,
        leaked: 'no',
      })
    ).toThrow();
  });

  it('accepts only safe corruption details', () => {
    expect(
      QuarterlyReviewCorruptErrorSchema.parse({
        error: 'QUARTERLY_REVIEW_ROSTER_CORRUPT',
        details: {
          draftId: 1,
          draftVersion: 2,
          financialFactsSnapshotId: 3,
          expectedCompanyCount: 4,
          actualCompanyCount: 5,
        },
      })
    ).toBeTruthy();
    expect(() =>
      QuarterlyReviewCorruptErrorSchema.parse({
        error: 'QUARTERLY_REVIEW_ROSTER_CORRUPT',
        details: {
          draftId: 1,
          draftVersion: 2,
          financialFactsSnapshotId: 3,
          expectedCompanyCount: 4,
          actualCompanyCount: 5,
          companyNames: ['secret'],
        },
      })
    ).toThrow();
  });

  it('rejects persisted reviewed-no-change rows carrying change provenance', () => {
    expect(() =>
      QuarterlyReviewItemSchema.parse({
        id: 1,
        category: 'kpis',
        state: 'reviewed_no_change',
        note: 'Reviewed.',
        reviewedBy: 2,
        reviewedAt: '2026-08-03T12:00:00.000Z',
        changeReference: {
          kind: 'internal_route',
          path: '/portfolio/company/3',
          label: 'Company',
        },
        followUp: null,
        version: 1,
        etag: '"item-1-v1"',
      })
    ).toThrow();
  });
});
