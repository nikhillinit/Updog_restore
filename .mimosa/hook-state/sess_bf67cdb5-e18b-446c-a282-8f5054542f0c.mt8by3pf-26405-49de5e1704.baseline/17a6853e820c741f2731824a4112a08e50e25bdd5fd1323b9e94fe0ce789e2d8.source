import { describe, expect, it } from 'vitest';

import {
  TASK_EVIDENCE_LINK_CONTRACT_VERSION,
  TaskEvidenceLinkCreateRequestSchema,
  TaskEvidenceLinkListQuerySchema,
  TaskEvidenceLinkListResponseSchema,
  TaskEvidenceLinkV1Schema,
} from '../../../../shared/contracts/operating-objects/task-evidence-link.contract';

describe('task-evidence-link/1.0.0 contract', () => {
  it.each([
    { kind: 'analysis_reference', id: 11 },
    { kind: 'internal_economics_run', id: 12 },
  ] as const)('accepts typed target $kind', (target) => {
    expect(TaskEvidenceLinkCreateRequestSchema.parse({ target })).toEqual({ target });
  });

  it.each([
    {},
    { target: { kind: 'analysis_draft', id: 1 } },
    { target: { kind: 'analysis_reference', id: 0 } },
    { target: { kind: 'analysis_reference', id: 1, extra: true } },
    { target: { kind: 'internal_economics_run', id: '1' } },
    { target: { kind: 'analysis_reference', analysisReferenceId: 1 } },
    { target: { kind: 'analysis_reference', id: 1 }, creator: 7 },
  ])('rejects unsupported request %#', (request) => {
    expect(TaskEvidenceLinkCreateRequestSchema.safeParse(request).success).toBe(false);
  });

  it('publishes only strict identity, scope, target, and creation time', () => {
    const publicLink = {
      contractVersion: TASK_EVIDENCE_LINK_CONTRACT_VERSION,
      linkId: 31,
      fundId: 1,
      taskId: 2,
      target: { kind: 'analysis_reference' as const, id: 11 },
      createdAt: '2026-08-01T12:00:00.000Z',
    };

    expect(TaskEvidenceLinkV1Schema.parse(publicLink)).toEqual(publicLink);
    expect(
      TaskEvidenceLinkV1Schema.safeParse({
        ...publicLink,
        createdBy: 7,
        idempotencyKey: 'secret',
        requestHash: 'a'.repeat(64),
        persistenceRow: {},
        transaction: {},
      }).success
    ).toBe(false);
  });

  it('accepts only an empty list query', () => {
    expect(TaskEvidenceLinkListQuerySchema.parse({})).toEqual({});
    expect(TaskEvidenceLinkListQuerySchema.safeParse({ cursor: '31' }).success).toBe(false);
    expect(TaskEvidenceLinkListQuerySchema.safeParse({ limit: '10' }).success).toBe(false);
    expect(TaskEvidenceLinkListQuerySchema.safeParse({ unexpected: 'value' }).success).toBe(false);
  });

  it('publishes evidence links only inside a strict data envelope', () => {
    const evidenceLink = {
      contractVersion: TASK_EVIDENCE_LINK_CONTRACT_VERSION,
      linkId: 31,
      fundId: 1,
      taskId: 2,
      target: { kind: 'internal_economics_run' as const, id: 12 },
      createdAt: '2026-08-01T12:00:00.000Z',
    };

    expect(TaskEvidenceLinkListResponseSchema.parse({ data: [evidenceLink] })).toEqual({
      data: [evidenceLink],
    });
    expect(
      TaskEvidenceLinkListResponseSchema.safeParse({ data: [evidenceLink], cursor: '31' }).success
    ).toBe(false);
  });
});
