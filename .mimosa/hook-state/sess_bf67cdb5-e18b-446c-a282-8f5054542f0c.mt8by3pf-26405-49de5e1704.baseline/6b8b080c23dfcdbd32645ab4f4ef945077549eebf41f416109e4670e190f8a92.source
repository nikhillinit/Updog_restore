import { describe, expect, it } from 'vitest';

import { buildQuarterlyReviewWorkflowAction } from '@/features/analytics-parity/quarterly-review-trace';

describe('quarterly review trace navigation', () => {
  it('links to internal analysis without loading or embedding review workflow state', () => {
    expect(buildQuarterlyReviewWorkflowAction('fund / 7')).toEqual({
      label: 'Open quarterly review',
      href: '/fund-model-results/fund%20%2F%207/internal-analysis',
    });
  });
});
