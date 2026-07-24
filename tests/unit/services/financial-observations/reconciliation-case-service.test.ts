import { describe, expect, it } from 'vitest';

import {
  caseToDto,
  resolutionSemanticKey,
} from '../../../../server/services/financial-observations/reconciliation-case-service';
import type { ReconciliationCase } from '../../../../shared/schema/financial-observations';

describe('resolutionSemanticKey', () => {
  const base = { action: 'confirm_match' as const, targetCompanyIdentityId: 5, memo: 'ok' };

  it('is equal for identical decisions', () => {
    expect(resolutionSemanticKey(base)).toBe(resolutionSemanticKey({ ...base }));
  });

  it('differs when a semantic field changes', () => {
    expect(resolutionSemanticKey(base)).not.toBe(
      resolutionSemanticKey({ ...base, targetCompanyIdentityId: 6 })
    );
    expect(resolutionSemanticKey(base)).not.toBe(
      resolutionSemanticKey({ ...base, memo: 'different' })
    );
  });

  it('accounts for the additive optional fields', () => {
    expect(resolutionSemanticKey(base)).not.toBe(
      resolutionSemanticKey({ ...base, canonicalName: 'acme' })
    );
    expect(
      resolutionSemanticKey({
        action: 'merge_identities',
        targetCompanyIdentityId: 5,
        memo: 'm',
        sourceCompanyIdentityId: 9,
      })
    ).not.toBe(
      resolutionSemanticKey({
        action: 'merge_identities',
        targetCompanyIdentityId: 5,
        memo: 'm',
        sourceCompanyIdentityId: 10,
      })
    );
  });
});

describe('caseToDto', () => {
  const row: ReconciliationCase = {
    id: 4,
    fundId: 1,
    importBatchId: 2,
    sourceObservationId: 3,
    caseType: 'identity_resolution',
    status: 'open',
    observationHash: 'a'.repeat(64),
    candidateFingerprint: 'b'.repeat(64),
    resolution: null,
    resolvedBy: null,
    resolvedAt: null,
    history: [{ at: '2026-01-01T00:00:00.000Z', event: 'opened' }],
    version: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  it('omits observationHash and candidateFingerprint and exposes an etag', () => {
    const dto = caseToDto(row);
    expect(dto).not.toHaveProperty('observationHash');
    expect(dto).not.toHaveProperty('candidateFingerprint');
    expect(dto.etag).toMatch(/^W\//);
    expect(JSON.stringify(dto)).not.toContain('a'.repeat(64));
  });
});
