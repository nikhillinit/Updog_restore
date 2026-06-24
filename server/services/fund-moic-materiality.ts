/** No-op/materiality detector for MOIC reconciliation using epsilon-based rank-or-value sensitivity. */
import type { FundMoicRankingItemV1 } from '../../shared/contracts/fund-moic-v1.contract';

export const MOIC_MATERIALITY_EPSILON = 1e-8;

export interface MoicMaterialityResult {
  candidateMaterial: boolean;
  comparedInvestmentCount: number;
  rankChangeCount: number;
  reservesMoicValueChangeCount: number;
  materialChangeCount: number;
}

export function assessMoicMateriality(
  legacy: readonly FundMoicRankingItemV1[],
  candidate: readonly FundMoicRankingItemV1[],
  epsilon: number = MOIC_MATERIALITY_EPSILON
): MoicMaterialityResult {
  const candidateById = new Map(candidate.map((item) => [item.investmentId, item]));
  const legacyIds = new Set(legacy.map((item) => item.investmentId));
  const comparedLegacyIds = new Set<string>();

  let comparedInvestmentCount = 0;
  let rankChangeCount = 0;
  let reservesMoicValueChangeCount = 0;
  let materialChangeCount = 0;

  for (const legacyItem of legacy) {
    const investmentId = legacyItem.investmentId;

    if (comparedLegacyIds.has(investmentId)) {
      continue;
    }

    comparedLegacyIds.add(investmentId);

    const candidateItem = candidateById.get(investmentId);

    if (!candidateItem) {
      materialChangeCount += 1;
      continue;
    }

    comparedInvestmentCount += 1;

    const rankChanged = legacyItem.rank !== candidateItem.rank;
    const legacyValue = legacyItem.reservesMoic.value ?? 0;
    const candidateValue = candidateItem.reservesMoic.value ?? 0;
    const valueChanged = Math.abs(legacyValue - candidateValue) > epsilon;

    if (rankChanged) {
      rankChangeCount += 1;
    }

    if (valueChanged) {
      reservesMoicValueChangeCount += 1;
    }

    if (rankChanged || valueChanged) {
      materialChangeCount += 1;
    }
  }

  for (const candidateId of candidateById.keys()) {
    if (!legacyIds.has(candidateId)) {
      materialChangeCount += 1;
    }
  }

  return {
    candidateMaterial: materialChangeCount > 0,
    comparedInvestmentCount,
    rankChangeCount,
    reservesMoicValueChangeCount,
    materialChangeCount,
  };
}
