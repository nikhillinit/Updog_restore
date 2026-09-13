import { describe, expect, it } from 'vitest';
import {
  emptyCorrectedCapitalAllocation,
  emptyCorrectedCapitalRound,
  correctedCapitalInput,
} from '@/components/scenarios/capital-plan-draft';
import { CapitalPlanningInputV2Schema } from '@shared/contracts/capital-planning-v2.contract';

describe('corrected capital scenario draft', () => {
  it('starts required assumptions blank without installing market defaults', () => {
    const allocation = emptyCorrectedCapitalAllocation();
    const round = emptyCorrectedCapitalRound();
    expect(allocation.initialPoolShareRatio).toBe('');
    expect(allocation.scheduleAnchor).toBe('');
    expect(allocation.deploymentCadence).toBe('');
    expect(allocation.entryFinancing.primaryCapital.basis).toBe('');
    expect(round.participationPolicy.type).toBe('');
    expect(round.eligibility.type).toBe('');
    expect(round.graduationRatio).toBe('');
    expect(round.poolBasis).toBe('');
    expect(round.timingBasis).toBe('');
    expect(round.financing.primaryCapital.primary_only_excludes_secondary).toBe(false);
  });
  it('requires review after explicit corrected opt-in', () => {
    const input = correctedCapitalInput();
    expect(input.contractVersion).toBe('capital-planning/2.0.0');
    expect(input.roundingPolicy).toContain('half-up-money-6-ratio-12');
    expect(input.solve.mode).toBe('');
    expect(CapitalPlanningInputV2Schema.safeParse(input).success).toBe(false);
    expect(input.allocations[0]).not.toHaveProperty('budgetShareRatio');
  });
});
