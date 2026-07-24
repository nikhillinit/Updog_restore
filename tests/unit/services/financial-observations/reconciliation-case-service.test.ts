import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

import {
  assertDecisionShape,
  caseEtag,
  caseToDto,
  normalizeDecision,
  resolveCase,
  resolutionSemanticKey,
} from '../../../../server/services/financial-observations/reconciliation-case-service';
import type { ResolveCaseRequest } from '../../../../shared/contracts/financial-observations/reconciliation-api.contract';
import {
  reconciliationCases,
  sourceObservations,
  type ReconciliationCase,
  type SourceObservation,
} from '../../../../shared/schema/financial-observations';

function thenableBuilder(rows: readonly unknown[], onMethod?: (method: string) => void): unknown {
  const chain: unknown = new Proxy(() => undefined, {
    get(_target, property) {
      if (property === 'then') {
        return (resolve: (value: readonly unknown[]) => void, reject: (reason: unknown) => void) =>
          Promise.resolve(rows).then(resolve, reject);
      }
      return (..._args: unknown[]) => {
        if (typeof property === 'string') onMethod?.(property);
        return chain;
      };
    },
  });
  return chain;
}

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

describe('resolution decision matrix', () => {
  const targetCanonicalRecordRef = { kind: 'cash_flow_event' as const, id: 40 };
  const invalidDecisions: Array<{
    name: string;
    caseType: ReconciliationCase['caseType'];
    decision: ResolveCaseRequest;
  }> = [
    {
      name: 'identity confirm requires target identity',
      caseType: 'identity_resolution',
      decision: { action: 'confirm_match', targetCompanyIdentityId: null, memo: 'm' },
    },
    {
      name: 'identity confirm rejects source identity',
      caseType: 'identity_resolution',
      decision: {
        action: 'confirm_match',
        targetCompanyIdentityId: 5,
        sourceCompanyIdentityId: 6,
        memo: 'm',
      },
    },
    {
      name: 'identity confirm rejects canonical name',
      caseType: 'identity_resolution',
      decision: {
        action: 'confirm_match',
        targetCompanyIdentityId: 5,
        canonicalName: 'acme',
        memo: 'm',
      },
    },
    {
      name: 'identity confirm rejects canonical record',
      caseType: 'identity_resolution',
      decision: {
        action: 'confirm_match',
        targetCompanyIdentityId: 5,
        targetCanonicalRecordRef,
        memo: 'm',
      },
    },
    {
      name: 'identity create requires canonical name',
      caseType: 'identity_resolution',
      decision: { action: 'create_identity', targetCompanyIdentityId: null, memo: 'm' },
    },
    {
      name: 'identity create rejects target identity',
      caseType: 'identity_resolution',
      decision: {
        action: 'create_identity',
        targetCompanyIdentityId: 5,
        canonicalName: 'acme',
        memo: 'm',
      },
    },
    {
      name: 'identity create rejects source identity',
      caseType: 'identity_resolution',
      decision: {
        action: 'create_identity',
        targetCompanyIdentityId: null,
        sourceCompanyIdentityId: 6,
        canonicalName: 'acme',
        memo: 'm',
      },
    },
    {
      name: 'identity create rejects canonical record',
      caseType: 'identity_resolution',
      decision: {
        action: 'create_identity',
        targetCompanyIdentityId: null,
        canonicalName: 'acme',
        targetCanonicalRecordRef,
        memo: 'm',
      },
    },
    {
      name: 'identity merge requires source identity',
      caseType: 'identity_resolution',
      decision: { action: 'merge_identities', targetCompanyIdentityId: 5, memo: 'm' },
    },
    {
      name: 'identity merge requires target identity',
      caseType: 'identity_resolution',
      decision: {
        action: 'merge_identities',
        targetCompanyIdentityId: null,
        sourceCompanyIdentityId: 6,
        memo: 'm',
      },
    },
    {
      name: 'identity merge rejects canonical name',
      caseType: 'identity_resolution',
      decision: {
        action: 'merge_identities',
        targetCompanyIdentityId: 5,
        sourceCompanyIdentityId: 6,
        canonicalName: 'acme',
        memo: 'm',
      },
    },
    {
      name: 'identity merge rejects canonical record',
      caseType: 'identity_resolution',
      decision: {
        action: 'merge_identities',
        targetCompanyIdentityId: 5,
        sourceCompanyIdentityId: 6,
        targetCanonicalRecordRef,
        memo: 'm',
      },
    },
    {
      name: 'identity rejects observation-only reject action',
      caseType: 'identity_resolution',
      decision: { action: 'reject', targetCompanyIdentityId: null, memo: 'm' },
    },
    {
      name: 'observation confirm requires canonical record',
      caseType: 'observation_match',
      decision: { action: 'confirm_match', targetCompanyIdentityId: null, memo: 'm' },
    },
    {
      name: 'observation confirm rejects target identity',
      caseType: 'observation_match',
      decision: {
        action: 'confirm_match',
        targetCompanyIdentityId: 5,
        targetCanonicalRecordRef,
        memo: 'm',
      },
    },
    {
      name: 'observation confirm rejects source identity',
      caseType: 'observation_match',
      decision: {
        action: 'confirm_match',
        targetCompanyIdentityId: null,
        sourceCompanyIdentityId: 6,
        targetCanonicalRecordRef,
        memo: 'm',
      },
    },
    {
      name: 'observation confirm rejects canonical name',
      caseType: 'observation_match',
      decision: {
        action: 'confirm_match',
        targetCompanyIdentityId: null,
        canonicalName: 'acme',
        targetCanonicalRecordRef,
        memo: 'm',
      },
    },
    {
      name: 'observation reject rejects target identity',
      caseType: 'observation_match',
      decision: { action: 'reject', targetCompanyIdentityId: 5, memo: 'm' },
    },
    {
      name: 'observation reject rejects source identity',
      caseType: 'observation_match',
      decision: {
        action: 'reject',
        targetCompanyIdentityId: null,
        sourceCompanyIdentityId: 6,
        memo: 'm',
      },
    },
    {
      name: 'observation reject rejects canonical name',
      caseType: 'observation_match',
      decision: {
        action: 'reject',
        targetCompanyIdentityId: null,
        canonicalName: 'acme',
        memo: 'm',
      },
    },
    {
      name: 'observation reject rejects canonical record',
      caseType: 'observation_match',
      decision: {
        action: 'reject',
        targetCompanyIdentityId: null,
        targetCanonicalRecordRef,
        memo: 'm',
      },
    },
    {
      name: 'observation rejects identity create action',
      caseType: 'observation_match',
      decision: {
        action: 'create_identity',
        targetCompanyIdentityId: null,
        canonicalName: 'acme',
        memo: 'm',
      },
    },
    {
      name: 'observation rejects identity merge action',
      caseType: 'observation_match',
      decision: {
        action: 'merge_identities',
        targetCompanyIdentityId: 5,
        sourceCompanyIdentityId: 6,
        memo: 'm',
      },
    },
  ];

  it.each(invalidDecisions)('$name', ({ caseType, decision }) => {
    expect(() => assertDecisionShape(caseType, decision)).toThrowError(
      expect.objectContaining({ status: 422, code: 'RESOLUTION_ACTION_INVALID' })
    );
  });

  it.each([
    {
      name: 'identity confirm',
      caseType: 'identity_resolution',
      decision: { action: 'confirm_match', targetCompanyIdentityId: 5, memo: 'confirm' },
    },
    {
      name: 'identity create',
      caseType: 'identity_resolution',
      decision: {
        action: 'create_identity',
        targetCompanyIdentityId: null,
        canonicalName: 'acme',
        memo: 'create',
      },
    },
    {
      name: 'identity merge',
      caseType: 'identity_resolution',
      decision: {
        action: 'merge_identities',
        targetCompanyIdentityId: 5,
        sourceCompanyIdentityId: 6,
        memo: 'merge',
      },
    },
    {
      name: 'observation confirm',
      caseType: 'observation_match',
      decision: {
        action: 'confirm_match',
        targetCompanyIdentityId: null,
        targetCanonicalRecordRef,
        memo: 'duplicate',
      },
    },
    {
      name: 'observation reject',
      caseType: 'observation_match',
      decision: { action: 'reject', targetCompanyIdentityId: null, memo: 'distinct' },
    },
  ] as const)('persists only valid fields for $name', ({ caseType, decision }) => {
    expect(() => assertDecisionShape(caseType, decision)).not.toThrow();
    expect(normalizeDecision(caseType, decision)).toEqual(decision);
  });
});

describe('resolveCase lock order', () => {
  it('locks artifact dependencies before case, then serializes identity head resolution', async () => {
    const events: string[] = [];
    const observation: SourceObservation = {
      id: 3,
      fundId: 1,
      importBatchId: 2,
      sourceArtifactId: 4,
      mappingProfileId: 5,
      companyIdentityId: null,
      domain: 'ledger_event',
      sourceType: 'csv',
      effectiveDate: '2026-01-01',
      normalizedPayload: {
        companyIdentity: { kind: 'external', system: 'carta', externalId: 'C-1' },
      },
      observationHash: 'a'.repeat(64),
      candidateFingerprint: 'b'.repeat(64),
      sourceLocator: 'csv:row:1',
      dependencyGroupKey: 'source-observation:3',
      status: 'staged',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const openCase: ReconciliationCase = {
      id: 4,
      fundId: 1,
      importBatchId: 2,
      sourceObservationId: 3,
      caseType: 'identity_resolution',
      status: 'open',
      observationHash: observation.observationHash,
      candidateFingerprint: observation.candidateFingerprint,
      resolution: null,
      resolvedBy: null,
      resolvedAt: null,
      history: [{ at: '2026-01-01T00:00:00.000Z', event: 'opened' }],
      version: 1,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const decision = {
      action: 'confirm_match' as const,
      targetCompanyIdentityId: 5,
      memo: 'confirmed',
    };
    const resolvedCase: ReconciliationCase = {
      ...openCase,
      status: 'resolved',
      resolution: decision,
      resolvedBy: 7,
      resolvedAt: new Date('2026-01-02T00:00:00.000Z'),
      history: [
        ...openCase.history,
        { at: '2026-01-02T00:00:00.000Z', event: 'resolved' as const },
      ],
      version: 2,
    };
    const selectPlans = [
      { rows: [{ importBatchId: 2, sourceObservationId: 3 }], label: 'case-reference' },
      { rows: [{ sourceArtifactId: 4 }], label: 'batch-reference' },
      { rows: [{ id: 4 }], label: 'artifact' },
      { rows: [{ sourceArtifactId: 4 }], label: 'batch' },
      { rows: [observation], label: 'observation' },
      { rows: [openCase], label: 'case' },
    ];
    let selectIndex = 0;
    const select = vi.fn(() => {
      const plan = selectPlans[selectIndex++];
      if (!plan) throw new Error('Unexpected select');
      return thenableBuilder(plan.rows, (method) => {
        if (method === 'for') events.push(`${plan.label}-lock`);
      });
    });
    const dialect = new PgDialect();
    const execute = vi.fn(async (statement: SQL) => {
      const query = dialect.sqlToQuery(statement);
      if (query.sql.includes(' AS expired')) return [{ expired: false }];
      if (query.sql.includes('pg_advisory_xact_lock')) {
        events.push('identity-lock');
        expect(query.params).toEqual(['fund-identity:1']);
        return [];
      }
      if (query.sql.includes('WITH RECURSIVE chain')) {
        events.push('identity-head-read');
        return [{ id: 5, merged_into_identity_id: null }];
      }
      throw new Error(`Unexpected execute: ${query.sql}`);
    });
    const update = vi.fn((table: unknown) => {
      if (table === sourceObservations) {
        events.push('observation-update');
        return thenableBuilder([{ id: observation.id }]);
      }
      if (table === reconciliationCases) {
        events.push('case-update');
        return thenableBuilder([resolvedCase]);
      }
      throw new Error('Unexpected update table');
    });
    const transaction = vi.fn(
      async (
        callback: (tx: {
          select: typeof select;
          execute: typeof execute;
          update: typeof update;
        }) => unknown
      ) => callback({ select, execute, update })
    );

    const result = await resolveCase({
      fundId: 1,
      caseId: openCase.id,
      ifMatch: caseEtag(openCase.version),
      decision,
      actorId: 7,
      database: { transaction } as never,
    });

    expect(result.httpStatus).toBe(200);
    expect(events).toEqual([
      'artifact-lock',
      'batch-lock',
      'observation-lock',
      'case-lock',
      'identity-lock',
      'identity-head-read',
      'observation-update',
      'case-update',
    ]);
  });
});
