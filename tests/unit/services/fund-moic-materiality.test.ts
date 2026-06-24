import { describe, expect, it } from 'vitest';

import {
  assessMoicMateriality,
  MOIC_MATERIALITY_EPSILON,
} from '../../../server/services/fund-moic-materiality';
import type { FundMoicRankingItemV1 } from '../../../shared/contracts/fund-moic-v1.contract';

const item = (
  investmentId: string,
  rank: number,
  value: number | null
): FundMoicRankingItemV1 => ({
  rank,
  investmentId,
  investmentName: investmentId,
  reservesMoic: { value, description: 'd', formula: 'f' },
});

describe('assessMoicMateriality', () => {
  it('exposes the fixed epsilon', () => {
    expect(MOIC_MATERIALITY_EPSILON).toBe(1e-8);
  });

  it('treats identical legacy/candidate as immaterial', () => {
    const legacy = [item('1', 1, 3.5), item('2', 2, 2.0)];
    const candidate = [item('1', 1, 3.5), item('2', 2, 2.0)];
    const result = assessMoicMateriality(legacy, candidate);
    expect(result).toEqual({
      candidateMaterial: false,
      comparedInvestmentCount: 2,
      rankChangeCount: 0,
      reservesMoicValueChangeCount: 0,
      materialChangeCount: 0,
    });
  });

  it('treats a value delta strictly within epsilon as immaterial', () => {
    const legacy = [item('1', 1, 1.0)];
    const candidate = [item('1', 1, 1.0 + MOIC_MATERIALITY_EPSILON)];
    const result = assessMoicMateriality(legacy, candidate);
    // delta === epsilon is NOT > epsilon
    expect(result.candidateMaterial).toBe(false);
    expect(result.reservesMoicValueChangeCount).toBe(0);
  });

  it('treats a value delta exceeding epsilon as material', () => {
    const legacy = [item('1', 1, 1.0)];
    const candidate = [item('1', 1, 1.0 + 2 * MOIC_MATERIALITY_EPSILON)];
    const result = assessMoicMateriality(legacy, candidate);
    expect(result.candidateMaterial).toBe(true);
    expect(result.reservesMoicValueChangeCount).toBe(1);
    expect(result.materialChangeCount).toBe(1);
    expect(result.rankChangeCount).toBe(0);
  });

  it('treats a rank change alone as material', () => {
    const legacy = [item('1', 1, 3.5), item('2', 2, 2.0)];
    const candidate = [item('1', 2, 3.5), item('2', 1, 2.0)];
    const result = assessMoicMateriality(legacy, candidate);
    expect(result.candidateMaterial).toBe(true);
    expect(result.rankChangeCount).toBe(2);
    expect(result.materialChangeCount).toBe(2);
    expect(result.reservesMoicValueChangeCount).toBe(0);
  });

  it('counts an added/removed investment as a material change, not a comparison', () => {
    const legacy = [item('1', 1, 3.5)];
    const candidate = [item('1', 1, 3.5), item('2', 2, 2.0)];
    const result = assessMoicMateriality(legacy, candidate);
    expect(result.comparedInvestmentCount).toBe(1);
    expect(result.materialChangeCount).toBe(1);
    expect(result.candidateMaterial).toBe(true);
  });

  it('treats null reservesMoic.value as 0 for the delta', () => {
    const legacy = [item('1', 1, null)];
    const candidate = [item('1', 1, 0)];
    const result = assessMoicMateriality(legacy, candidate);
    expect(result.candidateMaterial).toBe(false);
  });

  it('detects a FUTURE positive exitProbability candidate as material', () => {
    // Today the live adapter null-coerces exitProbability -> reservesMoic.value 0.
    // The day a real exitProbability/plannedReserves/reserveExitMultiple source
    // lands, the candidate values become positive. This proves the detector fires.
    const legacyAllZero = [item('1', 1, 0), item('2', 2, 0)];
    const candidateWithProbability = [item('1', 1, 2.45), item('2', 2, 1.4)];
    const result = assessMoicMateriality(legacyAllZero, candidateWithProbability);
    expect(result.candidateMaterial).toBe(true);
    expect(result.reservesMoicValueChangeCount).toBe(2);
  });

  it('honors a caller-supplied epsilon override', () => {
    const legacy = [item('1', 1, 1.0)];
    const candidate = [item('1', 1, 1.5)];
    expect(assessMoicMateriality(legacy, candidate, 1).candidateMaterial).toBe(false);
    expect(assessMoicMateriality(legacy, candidate, 0.1).candidateMaterial).toBe(true);
  });
});
