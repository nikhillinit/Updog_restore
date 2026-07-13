import type { FundMoicRankingItemV1 } from '../../../shared/contracts/fund-moic-v1.contract';
import type {
  MarginalReserveInputFailure,
  MarginalReserveRankingItemV1,
} from '../../../shared/contracts/marginal-reserve-moic-v1.contract';
import Decimal from '../../../shared/lib/decimal-config';
import { logger } from '../../lib/logger';

export interface MarginalReserveShadowMetrics {
  top_3_overlap: number;
  top_5_overlap: number;
  pairwise_rank_inversion_count: number;
  companies_actionable_in_both: number;
  companies_only_planned_actionable: number;
  companies_only_marginal_actionable: number;
  median_moic_ratio: string | null;
  unavailable_reason_counts: Record<string, number>;
}

export interface MarginalReserveShadowAnnotation {
  inversionId: string;
  companyIds: [number, number];
  plannedRanks: [number, number];
  marginalRanks: [number, number];
  annotation: string;
  reviewedBy: string | null;
  reviewerRole: 'investment_team' | null;
  reviewedAt: string | null;
}

export interface MarginalReserveShadowAnnotationInput {
  annotation: string;
  reviewedBy: string;
  reviewerRole: 'investment_team';
  reviewedAt: string;
}

export interface MarginalReserveMoicShadowArtifact {
  artifactVersion: 'marginal-reserve-moic-shadow-v1';
  fundId: number;
  status: 'approved' | 'annotation_required';
  metrics: MarginalReserveShadowMetrics;
  annotations: MarginalReserveShadowAnnotation[];
}

export interface MarginalReserveMoicShadowInput {
  fundId: number;
  plannedRankings: readonly FundMoicRankingItemV1[];
  marginalRankings: readonly MarginalReserveRankingItemV1[];
  unavailable: readonly MarginalReserveInputFailure[];
  annotationsByInversionId?: Readonly<Record<string, MarginalReserveShadowAnnotationInput>>;
}

interface ActionableRanking {
  companyId: number;
  position: number;
  moic: Decimal;
}

interface RankInversion {
  companyIds: [number, number];
  plannedRanks: [number, number];
  marginalRanks: [number, number];
}

export interface MarginalReserveShadowLogger {
  info(bindings: Record<string, unknown>, message: string): void;
}

function positiveCompanyId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const companyId = Number.parseInt(value, 10);
  return Number.isSafeInteger(companyId) ? companyId : null;
}

function plannedActionableRankings(
  rankings: readonly FundMoicRankingItemV1[]
): ActionableRanking[] {
  const seen = new Set<number>();
  const ordered = [...rankings].sort((left, right) => {
    const rankOrder = left.rank - right.rank;
    if (rankOrder !== 0) return rankOrder;
    const leftCompanyId = positiveCompanyId(left.investmentId);
    const rightCompanyId = positiveCompanyId(right.investmentId);
    return leftCompanyId !== null && rightCompanyId !== null
      ? leftCompanyId - rightCompanyId
      : left.investmentId.localeCompare(right.investmentId, 'en');
  });
  const actionable: ActionableRanking[] = [];
  for (const ranking of ordered) {
    const companyId = positiveCompanyId(ranking.investmentId);
    const value = ranking.reservesMoic.value;
    if (companyId === null || value === null || !Number.isFinite(value) || seen.has(companyId)) {
      continue;
    }
    seen.add(companyId);
    actionable.push({ companyId, position: actionable.length + 1, moic: new Decimal(value) });
  }
  return actionable;
}

function marginalActionableRankings(
  rankings: readonly MarginalReserveRankingItemV1[]
): ActionableRanking[] {
  const seen = new Set<number>();
  return [...rankings]
    .filter(
      (
        ranking
      ): ranking is MarginalReserveRankingItemV1 & {
        result: MarginalReserveRankingItemV1['result'] & { marginalMoic: string };
      } => ranking.status === 'actionable' && ranking.result.marginalMoic !== null
    )
    .sort((left, right) => {
      const moicOrder = new Decimal(right.result.marginalMoic).comparedTo(left.result.marginalMoic);
      return moicOrder !== 0 ? moicOrder : left.companyId - right.companyId;
    })
    .filter((ranking) => {
      if (seen.has(ranking.companyId)) return false;
      seen.add(ranking.companyId);
      return true;
    })
    .map((ranking, index) => ({
      companyId: ranking.companyId,
      position: index + 1,
      moic: new Decimal(ranking.result.marginalMoic),
    }));
}

function overlapCount(
  planned: readonly ActionableRanking[],
  marginal: readonly ActionableRanking[],
  limit: number
): number {
  const marginalTop = new Set(marginal.slice(0, limit).map((ranking) => ranking.companyId));
  return planned.slice(0, limit).filter((ranking) => marginalTop.has(ranking.companyId)).length;
}

function rankInversions(
  planned: readonly ActionableRanking[],
  marginal: readonly ActionableRanking[]
): RankInversion[] {
  const marginalPosition = new Map(
    marginal.map((ranking) => [ranking.companyId, ranking.position] as const)
  );
  const common = planned.filter((ranking) => marginalPosition.has(ranking.companyId));
  const inversions: RankInversion[] = [];
  for (let leftIndex = 0; leftIndex < common.length; leftIndex += 1) {
    const left = common[leftIndex];
    if (!left) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < common.length; rightIndex += 1) {
      const right = common[rightIndex];
      if (!right) continue;
      const leftMarginalPosition = marginalPosition.get(left.companyId);
      const rightMarginalPosition = marginalPosition.get(right.companyId);
      if (
        leftMarginalPosition === undefined ||
        rightMarginalPosition === undefined ||
        (left.position - right.position) * (leftMarginalPosition - rightMarginalPosition) >= 0
      ) {
        continue;
      }
      inversions.push({
        companyIds: [left.companyId, right.companyId],
        plannedRanks: [left.position, right.position],
        marginalRanks: [leftMarginalPosition, rightMarginalPosition],
      });
    }
  }
  return inversions;
}

function medianMoicRatio(
  planned: readonly ActionableRanking[],
  marginal: readonly ActionableRanking[]
): string | null {
  const plannedByCompany = new Map(planned.map((ranking) => [ranking.companyId, ranking] as const));
  const ratios = marginal
    .map((ranking) => {
      const plannedRanking = plannedByCompany.get(ranking.companyId);
      return plannedRanking && plannedRanking.moic.gt(0)
        ? ranking.moic.div(plannedRanking.moic)
        : null;
    })
    .filter((ratio): ratio is Decimal => ratio !== null)
    .sort((left, right) => left.comparedTo(right));
  if (ratios.length === 0) return null;
  const midpoint = Math.floor(ratios.length / 2);
  const upper = ratios[midpoint];
  if (!upper) return null;
  if (ratios.length % 2 === 1) return upper.toFixed(6);
  const lower = ratios[midpoint - 1];
  return lower ? lower.plus(upper).div(2).toFixed(6) : null;
}

function unavailableReasonCounts(
  unavailable: readonly MarginalReserveInputFailure[]
): Record<string, number> {
  const companiesByReason = new Map<string, Set<number>>();
  for (const failure of unavailable) {
    for (const reason of new Set(failure.reasons)) {
      const companyIds = companiesByReason.get(reason) ?? new Set<number>();
      companyIds.add(failure.companyId);
      companiesByReason.set(reason, companyIds);
    }
  }
  return Object.fromEntries(
    [...companiesByReason.entries()]
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([reason, companyIds]) => [reason, companyIds.size])
  );
}

function inversionId(inversion: RankInversion): string {
  return [...inversion.companyIds].sort((left, right) => left - right).join(':');
}

function validInvestmentTeamAnnotation(
  annotation: MarginalReserveShadowAnnotationInput | undefined
): annotation is MarginalReserveShadowAnnotationInput {
  return Boolean(
    annotation &&
    annotation.annotation.trim() &&
    annotation.reviewedBy.trim() &&
    annotation.reviewerRole === 'investment_team' &&
    !Number.isNaN(Date.parse(annotation.reviewedAt))
  );
}

export function buildMarginalReserveMoicShadowArtifact(
  input: MarginalReserveMoicShadowInput
): MarginalReserveMoicShadowArtifact {
  const planned = plannedActionableRankings(input.plannedRankings);
  const marginal = marginalActionableRankings(input.marginalRankings);
  const plannedIds = new Set(planned.map((ranking) => ranking.companyId));
  const marginalIds = new Set(marginal.map((ranking) => ranking.companyId));
  const inversions = rankInversions(planned, marginal);
  const topFiveIds = new Set([
    ...planned.slice(0, 5).map((ranking) => ranking.companyId),
    ...marginal.slice(0, 5).map((ranking) => ranking.companyId),
  ]);
  const annotations = inversions
    .filter((inversion) => inversion.companyIds.some((companyId) => topFiveIds.has(companyId)))
    .map((inversion) => {
      const id = inversionId(inversion);
      const supplied = input.annotationsByInversionId?.[id];
      const accepted = validInvestmentTeamAnnotation(supplied) ? supplied : null;
      return {
        inversionId: id,
        companyIds: inversion.companyIds,
        plannedRanks: inversion.plannedRanks,
        marginalRanks: inversion.marginalRanks,
        annotation: accepted?.annotation.trim() ?? '',
        reviewedBy: accepted?.reviewedBy.trim() ?? null,
        reviewerRole: accepted?.reviewerRole ?? null,
        reviewedAt: accepted?.reviewedAt ?? null,
      };
    });
  const metrics: MarginalReserveShadowMetrics = {
    top_3_overlap: overlapCount(planned, marginal, 3),
    top_5_overlap: overlapCount(planned, marginal, 5),
    pairwise_rank_inversion_count: inversions.length,
    companies_actionable_in_both: [...plannedIds].filter((companyId) => marginalIds.has(companyId))
      .length,
    companies_only_planned_actionable: [...plannedIds].filter(
      (companyId) => !marginalIds.has(companyId)
    ).length,
    companies_only_marginal_actionable: [...marginalIds].filter(
      (companyId) => !plannedIds.has(companyId)
    ).length,
    median_moic_ratio: medianMoicRatio(planned, marginal),
    unavailable_reason_counts: unavailableReasonCounts(input.unavailable),
  };

  return {
    artifactVersion: 'marginal-reserve-moic-shadow-v1',
    fundId: input.fundId,
    status: annotations.every(
      (annotation) =>
        annotation.annotation.length > 0 &&
        annotation.reviewedBy !== null &&
        annotation.reviewerRole === 'investment_team' &&
        annotation.reviewedAt !== null
    )
      ? 'approved'
      : 'annotation_required',
    metrics,
    annotations,
  };
}

export function emitMarginalReserveMoicShadowComparison(
  input: MarginalReserveMoicShadowInput,
  log: MarginalReserveShadowLogger = logger
): MarginalReserveMoicShadowArtifact {
  const artifact = buildMarginalReserveMoicShadowArtifact(input);
  const companyIds = [
    ...new Set([
      ...input.plannedRankings
        .map((ranking) => positiveCompanyId(ranking.investmentId))
        .filter((companyId): companyId is number => companyId !== null),
      ...input.marginalRankings.map((ranking) => ranking.companyId),
      ...input.unavailable.map((failure) => failure.companyId),
    ]),
  ].sort((left, right) => left - right);
  log.info(
    {
      fundId: artifact.fundId,
      status: artifact.status,
      companyIds,
      inversionIds: artifact.annotations.map((annotation) => annotation.inversionId),
      metrics: artifact.metrics,
    },
    'marginal reserve MOIC shadow comparison generated'
  );
  return artifact;
}
