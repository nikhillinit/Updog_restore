import { describe, expect, it } from 'vitest';
import { canonicalSha256 } from '@shared/lib/canonical-hash';
import { fundWorkflowRequestHash } from '../../../server/services/fund-workflow-service';

describe('published revision workflow identity', () => {
  const ordinary = {
    operation: 'save_draft' as const,
    targetFundId: 42,
    expectedRevision: '"0000000000000001"',
    body: { fundName: 'Ordinary save' },
  };

  it('keeps existing command hashes unchanged when source is absent', () => {
    expect(fundWorkflowRequestHash(ordinary)).toBe(
      canonicalSha256({
        operation: ordinary.operation,
        target: ordinary.targetFundId,
        expectedRevision: ordinary.expectedRevision,
        body: ordinary.body,
      })
    );
  });

  it('separates published revision creation from ordinary draft saves', () => {
    expect(fundWorkflowRequestHash({ ...ordinary, source: 'published' })).not.toBe(
      fundWorkflowRequestHash(ordinary)
    );
  });
});
