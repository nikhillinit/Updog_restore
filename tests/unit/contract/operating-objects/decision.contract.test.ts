import { describe, expect, it } from 'vitest';

import {
  DECISION_CONTRACT_VERSION,
  DECISION_EVIDENCE_LINK_CONTRACT_VERSION,
  DecisionCreateSchema,
  DecisionEvidenceLinkCreateRequestSchema,
  DecisionEvidenceLinkListQuerySchema,
  DecisionEvidenceLinkListResponseSchema,
  DecisionListResponseSchema,
  DecisionOutcomeSchema,
  DecisionStatusSchema,
  DecisionTransitionSchema,
  DecisionV1Schema,
} from '@shared/contracts/operating-objects/decision.contract';

const decision = {
  contractVersion: DECISION_CONTRACT_VERSION,
  decisionId: 7,
  fundId: 1,
  title: 'Extend runway',
  recommendation: 'Reduce deployment pace for one quarter.',
  status: 'accepted',
  supersedesDecisionId: null,
  outcome: null,
  outcomeRecordedAt: null,
  outcomeRecordedBy: null,
  followUpOwnerId: null,
  followUpDate: null,
  createdAt: '2026-09-01T12:00:00.000Z',
  updatedAt: '2026-09-01T12:00:00.000Z',
  etag: '"decision-7-v1"',
};

describe('operating decision contracts', () => {
  it('pins the decision contract version', () => {
    expect(DECISION_CONTRACT_VERSION).toBe('decision/1.0.0');
  });

  it('pins the decision evidence-link contract version', () => {
    expect(DECISION_EVIDENCE_LINK_CONTRACT_VERSION).toBe('decision-evidence-link/1.0.0');
  });

  it('accepts every decision lifecycle status', () => {
    expect(DecisionStatusSchema.options).toEqual(['proposed', 'accepted', 'rejected', 'deferred']);
  });

  it('accepts a minimal decision create command', () => {
    expect(
      DecisionCreateSchema.safeParse({
        fundId: 1,
        title: 'Extend runway',
        recommendation: 'Reduce deployment pace.',
      }).success
    ).toBe(true);
  });

  it('rejects server-controlled fields in decision create commands', () => {
    expect(
      DecisionCreateSchema.safeParse({
        fundId: 1,
        title: 'Extend runway',
        recommendation: 'Reduce deployment pace.',
        status: 'accepted',
      }).success
    ).toBe(false);
  });

  it('requires follow-up owner and date for deferred transitions', () => {
    expect(DecisionTransitionSchema.safeParse({ status: 'deferred' }).success).toBe(false);
  });

  it('accepts deferred transitions with complete follow-up fields', () => {
    expect(
      DecisionTransitionSchema.safeParse({
        status: 'deferred',
        followUpOwnerId: 9,
        followUpDate: '2026-09-15',
      }).success
    ).toBe(true);
  });

  it('trims non-empty outcome text', () => {
    expect(DecisionOutcomeSchema.parse({ outcome: '  validated  ' })).toEqual({
      outcome: 'validated',
    });
  });

  it('accepts the decision wire schema', () => {
    expect(DecisionV1Schema.safeParse(decision).success).toBe(true);
  });

  it('rejects raw xmin on the decision wire schema', () => {
    expect(DecisionV1Schema.safeParse({ ...decision, xmin: '123' }).success).toBe(false);
  });

  it('accepts the decision list wire envelope', () => {
    expect(DecisionListResponseSchema.safeParse({ data: [decision] }).success).toBe(true);
  });

  it('accepts an analysis-reference decision evidence target', () => {
    expect(
      DecisionEvidenceLinkCreateRequestSchema.safeParse({
        target: { kind: 'analysis_reference', id: 4 },
      }).success
    ).toBe(true);
  });

  it('accepts an internal-economics-run decision evidence target', () => {
    expect(
      DecisionEvidenceLinkCreateRequestSchema.safeParse({
        target: { kind: 'internal_economics_run', id: 5 },
      }).success
    ).toBe(true);
  });

  it('rejects parameters in the decision evidence-link list query', () => {
    expect(DecisionEvidenceLinkListQuerySchema.safeParse({ cursor: 'next' }).success).toBe(false);
  });

  it('accepts the decision evidence-link list wire envelope', () => {
    expect(
      DecisionEvidenceLinkListResponseSchema.safeParse({
        data: [
          {
            contractVersion: DECISION_EVIDENCE_LINK_CONTRACT_VERSION,
            linkId: 3,
            fundId: 1,
            decisionId: 7,
            target: { kind: 'analysis_reference', id: 4 },
            createdAt: '2026-09-01T12:00:00.000Z',
          },
        ],
      }).success
    ).toBe(true);
  });
});
