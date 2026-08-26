import { z } from 'zod';

import {
  buildMarginalReserveMoicInputsFromSources,
  loadMarginalReserveInputSources,
  type MarginalReserveInputSources,
} from '../moic/marginal-reserve-moic-input-service';
import {
  buildReserveEnvelopeFromSources,
  loadReserveEnvelopeSources,
} from './reserve-envelope-service';
import { ConstrainedReserveEngine } from '../../../shared/core/reserves/ConstrainedReserveEngine';
import { calculateMarginalReserveMoic } from '../../../shared/core/moic/MarginalReserveMoic';
import type { ReserveEnvelopeV1 } from '../../../shared/contracts/reserve-envelope-v1.contract';
import Decimal from '../../../shared/lib/decimal-config';
import { ReserveInputSchema, type ReserveInput } from '../../../shared/schemas';
import { type CanonicalStage, toNoSeparatorStage } from '../../../shared/schemas/stage';
import { ConfidenceLevel, ReserveSummarySchema, type ReserveSummary } from '../../../shared/types';
import { centsToDollars, dollarsToCents } from '../../../shared/units';

const BuildInputSchema = z
  .object({
    fundId: z.number().int().positive(),
    asOfDate: z.string().date(),
  })
  .strict();

type LegacyReserveStage = ReturnType<typeof toNoSeparatorStage>;
type RankedReserveExclusionReason = 'unavailable' | 'indicative';
type RankedReserveFailSafeReason =
  'envelope_blocked' | 'envelope_untrusted' | 'no_actionable_candidates' | 'engine_error';

export interface RankedReserveCandidate {
  companyId: number;
  name: string;
  canonicalStage: CanonicalStage;
  invested: number;
  ownership: number;
  status: 'actionable' | 'indicative' | 'unavailable';
  marginalMoic: string | null;
}

export interface ComposeRankedReserveInput {
  envelope: ReserveEnvelopeV1;
  candidates: readonly RankedReserveCandidate[];
  constraints?: { maxPerCompany?: number; maxPerStage?: number; minCheck?: number };
  factsInputHash: string;
  assumptionsHash: string;
}

export interface RankedReserveAllocation {
  companyId: number;
  id: string;
  name: string;
  stage: LegacyReserveStage;
  allocated: number;
  rank: number;
  marginalMoic: string;
}

export interface RankedReserveAllocationResult {
  allocations: RankedReserveAllocation[];
  totalAllocated: number;
  remaining: number;
  conservationOk: boolean;
  excluded: Array<{ companyId: number; reason: RankedReserveExclusionReason }>;
  neutralPolicies: Array<{
    stage: LegacyReserveStage;
    reserveMultiple: 1;
    weight: 1;
  }>;
  disclosedDefaults: string[];
  failSafe: boolean;
  failSafeReason: RankedReserveFailSafeReason | null;
  envelopeInputHash: string;
  factsInputHash: string;
  assumptionsHash: string;
}

export interface RankedReserveShadowTelemetry {
  totalAllocationDeltaCents: number;
  rankAgreement: boolean;
  excludedCountsByReason: Record<RankedReserveExclusionReason, number>;
  envelopeInputHash: string;
  factsInputHash: string;
  assumptionsHash: string;
}

const SOURCE_STAGE_ALIASES: Readonly<Record<string, CanonicalStage>> = {
  preseed: 'pre_seed',
  seed: 'seed',
  seriesa: 'series_a',
  seriesb: 'series_b',
  seriesc: 'series_c',
  seriesd: 'series_d',
  seriesdplus: 'series_d',
  growth: 'growth',
  latestage: 'late_stage',
};

function canonicalStageFromSource(value: string | null | undefined): CanonicalStage | null {
  if (!value) return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  return SOURCE_STAGE_ALIASES[normalized] ?? null;
}

function disclosedDefaults(input: ComposeRankedReserveInput): string[] {
  const defaults: string[] = [];
  if (input.constraints?.maxPerCompany === undefined) defaults.push('maxPerCompany:Infinity');
  if (input.constraints?.maxPerStage === undefined) defaults.push('maxPerStage:{}');
  if (input.constraints?.minCheck === undefined) defaults.push('minCheck:0');
  return defaults;
}

function failSafeResult(
  input: ComposeRankedReserveInput,
  failSafeReason: RankedReserveFailSafeReason,
  excluded: RankedReserveAllocationResult['excluded'] = [],
  neutralPolicies: RankedReserveAllocationResult['neutralPolicies'] = []
): RankedReserveAllocationResult {
  return {
    allocations: [],
    totalAllocated: 0,
    remaining: centsToDollars(input.envelope.availableReservesCents),
    conservationOk: true,
    excluded,
    neutralPolicies,
    disclosedDefaults: disclosedDefaults(input),
    failSafe: true,
    failSafeReason,
    envelopeInputHash: input.envelope.inputHash,
    factsInputHash: input.factsInputHash,
    assumptionsHash: input.assumptionsHash,
  };
}

export function composeRankedReserveAllocation(
  input: ComposeRankedReserveInput
): RankedReserveAllocationResult {
  if (input.envelope.blocked) {
    return failSafeResult(input, 'envelope_blocked');
  }
  if (!input.envelope.trustedForActivation) {
    return failSafeResult(input, 'envelope_untrusted');
  }

  const excluded: RankedReserveAllocationResult['excluded'] = input.candidates.flatMap(
    (candidate) =>
      candidate.status === 'actionable'
        ? []
        : [{ companyId: candidate.companyId, reason: candidate.status }]
  );
  const eligible = input.candidates.filter((candidate) => candidate.status === 'actionable');
  if (eligible.length === 0) {
    return failSafeResult(input, 'no_actionable_candidates', excluded);
  }

  try {
    const rankedCandidates = eligible
      .filter((candidate) => {
        if (candidate.marginalMoic !== null) return true;
        excluded.push({ companyId: candidate.companyId, reason: 'unavailable' });
        return false;
      })
      .sort((left, right) => {
        const marginalMoicOrder = new Decimal(right.marginalMoic as string).comparedTo(
          new Decimal(left.marginalMoic as string)
        );
        return (
          marginalMoicOrder ||
          left.name.localeCompare(right.name) ||
          left.companyId - right.companyId
        );
      });

    if (rankedCandidates.length === 0) {
      return failSafeResult(input, 'no_actionable_candidates', excluded);
    }

    const scoreOverride: Record<string, number> = {};
    const rankById = new Map<string, { companyId: number; rank: number; marginalMoic: string }>();
    const companies = rankedCandidates.map((candidate, index) => {
      const companyKey = String(candidate.companyId);
      const rank = index + 1;
      scoreOverride[companyKey] = rankedCandidates.length - index;
      rankById.set(companyKey, {
        companyId: candidate.companyId,
        rank,
        marginalMoic: candidate.marginalMoic as string,
      });
      return {
        id: companyKey,
        name: candidate.name,
        stage: toNoSeparatorStage(candidate.canonicalStage),
        invested: candidate.invested,
        ownership: candidate.ownership,
      };
    });

    const legacyStages = new Set(companies.map((company) => company.stage));
    const neutralPolicies: RankedReserveAllocationResult['neutralPolicies'] = [...legacyStages].map(
      (stage) => ({ stage, reserveMultiple: 1, weight: 1 })
    );
    const constraints: NonNullable<ReserveInput['constraints']> = {};
    if (input.constraints?.maxPerCompany !== undefined) {
      constraints.maxPerCompany = input.constraints.maxPerCompany;
    }
    if (input.constraints?.maxPerStage !== undefined) {
      const maxPerStage = input.constraints.maxPerStage;
      constraints.maxPerStage = Object.fromEntries(
        [...legacyStages].map((stage) => [stage, maxPerStage])
      );
    }
    if (input.constraints?.minCheck !== undefined) {
      constraints.minCheck = input.constraints.minCheck;
    }

    const reserveInput = ReserveInputSchema.parse({
      availableReserves: centsToDollars(input.envelope.availableReservesCents),
      companies,
      stagePolicies: neutralPolicies,
      ...(Object.keys(constraints).length > 0 ? { constraints } : {}),
      scoreOverride,
    });
    const engineResult = new ConstrainedReserveEngine().calculate(reserveInput);
    const allocations = engineResult.allocations.map((allocation) => {
      const ranking = rankById.get(allocation.id);
      if (!ranking) throw new Error(`Missing rank metadata for company ${allocation.id}`);
      return {
        companyId: ranking.companyId,
        id: allocation.id,
        name: allocation.name,
        stage: allocation.stage as LegacyReserveStage,
        allocated: allocation.allocated,
        rank: ranking.rank,
        marginalMoic: ranking.marginalMoic,
      };
    });

    return {
      allocations,
      totalAllocated: engineResult.totalAllocated,
      remaining: engineResult.remaining,
      conservationOk: engineResult.conservationOk,
      excluded,
      neutralPolicies,
      disclosedDefaults: disclosedDefaults(input),
      failSafe: false,
      failSafeReason: null,
      envelopeInputHash: input.envelope.inputHash,
      factsInputHash: input.factsInputHash,
      assumptionsHash: input.assumptionsHash,
    };
  } catch {
    return failSafeResult(input, 'engine_error', excluded);
  }
}

function investedDollars(sources: MarginalReserveInputSources, companyId: number): number {
  const fact = sources.facts.facts.find((candidate) => candidate.companyId === companyId);
  if (!fact) return 0;
  // Match the facts-backed reserve convention: amount-only non-equity cash is not invested equity.
  return new Decimal(fact.initialInvestmentAmount).plus(fact.followOnInvestmentAmount).toNumber();
}

function ownershipNumber(value: string | number | null): number {
  try {
    const parsed = new Decimal(value ?? 0);
    return parsed.isFinite() && parsed.gte(0) && parsed.lte(1) ? parsed.toNumber() : 0;
  } catch {
    return 0;
  }
}

function candidateFromSources(input: {
  sources: MarginalReserveInputSources;
  companyId: number;
  status: RankedReserveCandidate['status'];
  marginalMoic: string | null;
  ownership: string | number | null;
}): RankedReserveCandidate {
  const company = input.sources.companies.find(
    (candidate) => candidate.companyId === input.companyId
  );
  const fact = input.sources.facts.facts.find(
    (candidate) => candidate.companyId === input.companyId
  );
  const canonicalStage = canonicalStageFromSource(company?.currentStage ?? company?.stage);
  const sourceComplete = company !== undefined && fact !== undefined && canonicalStage !== null;
  return {
    companyId: input.companyId,
    name: fact?.companyName ?? `Company ${input.companyId}`,
    canonicalStage: canonicalStage ?? 'seed',
    invested: investedDollars(input.sources, input.companyId),
    ownership: ownershipNumber(input.ownership),
    status: sourceComplete ? input.status : 'unavailable',
    marginalMoic: sourceComplete ? input.marginalMoic : null,
  };
}

/**
 * Folds the two independent "indicative" tiers into one candidate status.
 *
 * Tier 1 is the result tier (marginal MOIC > 100, MarginalReserveMoic.ts:331).
 * Tier 2 is the input-readiness tier (STALE_ASSUMPTION, assumption older than
 * MARGINAL_RESERVE_ASSUMPTION_STALE_AFTER_DAYS = 120).
 *
 * A stale assumption downgrades an otherwise-actionable result to indicative, but must never
 * upgrade an unavailable result. Precedent: server/routes/fund-moic.ts:174-178.
 */
export function foldMarginalCandidateStatus(
  resultStatus: RankedReserveCandidate['status'],
  readinessStatus: Exclude<RankedReserveCandidate['status'], 'unavailable'>
): RankedReserveCandidate['status'] {
  return resultStatus === 'actionable' && readinessStatus === 'indicative'
    ? 'indicative'
    : resultStatus;
}

export async function buildRankedReserveAllocation(input: {
  fundId: number;
  asOfDate: string;
}): Promise<RankedReserveAllocationResult> {
  const parsed = BuildInputSchema.parse(input);
  const [envelopeSources, marginalSources] = await Promise.all([
    loadReserveEnvelopeSources(parsed),
    loadMarginalReserveInputSources(parsed),
  ]);
  const envelope = buildReserveEnvelopeFromSources({ ...parsed, sources: envelopeSources });
  const assembly = buildMarginalReserveMoicInputsFromSources({
    ...parsed,
    sources: marginalSources,
  });
  const candidates = [
    ...assembly.ready.map((marginalInput) => {
      const result = calculateMarginalReserveMoic(marginalInput);
      const readiness = marginalInput.readiness ?? { status: 'actionable' as const, reasons: [] };
      const status = foldMarginalCandidateStatus(result.status, readiness.status);
      return candidateFromSources({
        sources: marginalSources,
        companyId: marginalInput.companyId,
        status,
        marginalMoic: result.marginalMoic,
        ownership: marginalInput.currentOwnership,
      });
    }),
    ...assembly.unavailable.map((failure) =>
      candidateFromSources({
        sources: marginalSources,
        companyId: failure.companyId,
        status: 'unavailable',
        marginalMoic: null,
        ownership:
          marginalSources.companies.find((company) => company.companyId === failure.companyId)
            ?.currentOwnership ?? null,
      })
    ),
  ];

  return composeRankedReserveAllocation({
    envelope,
    candidates,
    factsInputHash: assembly.factsInputHash,
    assumptionsHash: assembly.assumptionsHash,
  });
}

export function toReserveSummary(
  envelope: ReserveEnvelopeV1,
  composed: RankedReserveAllocationResult
): ReserveSummary {
  const allocations = composed.allocations.map((allocation) => {
    // This is a provenance proxy, not a model confidence. Composed allocations can only
    // originate from candidates whose post-fold status is actionable.
    const confidence =
      Math.round(
        Math.min(
          ConfidenceLevel.LOW + (envelope.trustedForActivation ? 0.2 : 0) + 0.15,
          ConfidenceLevel.MEDIUM
        ) * 100
      ) / 100;
    return {
      allocation: allocation.allocated,
      confidence,
      rationale: `ranked-allocation: marginal-MOIC rank ${allocation.rank} of ${composed.allocations.length}; envelope inputHash=${composed.envelopeInputHash.slice(0, 12)}`,
    };
  });
  const avgConfidence =
    allocations.length === 0
      ? 0
      : Math.round(
          (allocations.reduce((sum, allocation) => sum + allocation.confidence, 0) /
            allocations.length) *
            100
        ) / 100;

  // These rollups are provenance proxies under this engine, not ML confidences.
  return ReserveSummarySchema.parse({
    fundId: envelope.fundId,
    totalAllocation: composed.totalAllocated,
    avgConfidence,
    highConfidenceCount: allocations.filter(
      (allocation) => allocation.confidence >= ConfidenceLevel.MEDIUM
    ).length,
    allocations,
    generatedAt: new Date(),
  });
}

export function buildRankedShadowTelemetry(
  legacy: ReserveSummary,
  composed: RankedReserveAllocationResult
): RankedReserveShadowTelemetry {
  const marginalMoicOrder = [...composed.allocations].sort((left, right) => left.rank - right.rank);
  const realizedAllocationOrder = [...composed.allocations].sort(
    (left, right) => right.allocated - left.allocated || left.rank - right.rank
  );
  const rankAgreement = marginalMoicOrder.every(
    (allocation, index) => allocation.companyId === realizedAllocationOrder[index]?.companyId
  );

  return {
    totalAllocationDeltaCents:
      dollarsToCents(composed.totalAllocated) - dollarsToCents(legacy.totalAllocation),
    rankAgreement,
    excludedCountsByReason: {
      unavailable: composed.excluded.filter((item) => item.reason === 'unavailable').length,
      indicative: composed.excluded.filter((item) => item.reason === 'indicative').length,
    },
    envelopeInputHash: composed.envelopeInputHash,
    factsInputHash: composed.factsInputHash,
    assumptionsHash: composed.assumptionsHash,
  };
}
