import { describe, expect, it } from 'vitest';
import {
  CreateReserveIcDecisionV1Schema,
  ReserveIcDecisionRecordV1Schema,
  UpdateReserveIcDecisionV1Schema,
} from '@shared/contracts/reserve-ic-decision-v1.contract';

describe('ReserveIcDecisionV1 contract', () => {
  it('accepts a valid human IC decision record', () => {
    const result = ReserveIcDecisionRecordV1Schema.safeParse({
      id: '00000000-0000-0000-0000-000000000001',
      fundId: 7,
      companyId: 42,
      decisionType: 'follow_on',
      decisionStatus: 'approved',
      rationale: 'Approve a larger reserve because the company hit Series B milestones.',
      proposedPlannedReservesCents: 250_000_000,
      finalPlannedReservesCents: 225_000_000,
      decidedByUserId: 3,
      decidedByLabel: 'ic-chair@example.com',
      decidedAt: '2026-04-06T02:00:00.000Z',
      provenance: {
        sourceScenarioId: '00000000-0000-0000-0000-000000000101',
        sourceAllocationVersion: 4,
        liveAllocationVersion: 5,
      },
      createdAt: '2026-04-06T01:00:00.000Z',
      updatedAt: '2026-04-06T02:00:00.000Z',
    });

    expect(result.success).toBe(true);
  });

  it('rejects approved/rejected records without decidedAt', () => {
    const result = ReserveIcDecisionRecordV1Schema.safeParse({
      id: '00000000-0000-0000-0000-000000000001',
      fundId: 7,
      companyId: 42,
      decisionType: 'defer',
      decisionStatus: 'approved',
      rationale: 'Defer until the next financing milestone.',
      proposedPlannedReservesCents: null,
      finalPlannedReservesCents: null,
      decidedByUserId: 3,
      decidedByLabel: 'ic-chair@example.com',
      decidedAt: null,
      provenance: {
        sourceScenarioId: null,
        sourceAllocationVersion: null,
        liveAllocationVersion: 5,
      },
      createdAt: '2026-04-06T01:00:00.000Z',
      updatedAt: '2026-04-06T02:00:00.000Z',
    });

    expect(result.success).toBe(false);
  });

  it('accepts a create payload without final decision fields yet', () => {
    const result = CreateReserveIcDecisionV1Schema.safeParse({
      fundId: 7,
      companyId: 42,
      decisionType: 'cut_reserve',
      decisionStatus: 'proposed',
      rationale: 'Reduce reserve size after a weaker than expected quarter.',
      proposedPlannedReservesCents: 75_000_000,
      provenance: {
        sourceScenarioId: '00000000-0000-0000-0000-000000000101',
        sourceAllocationVersion: 4,
        liveAllocationVersion: 5,
      },
    });

    expect(result.success).toBe(true);
  });

  it('rejects an empty update payload', () => {
    const result = UpdateReserveIcDecisionV1Schema.safeParse({});
    expect(result.success).toBe(false);
  });
});
