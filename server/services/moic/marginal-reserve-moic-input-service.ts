import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../../db';
import { buildFundCompanyActualsFacts } from '../fund-actuals/fund-company-actuals-facts-service';
import {
  FundDraftWriteV1Schema,
  type FundDraftWriteV1,
} from '../../../shared/contracts/fund-draft-write-v1.contract';
import type { FundCompanyActualsFactsResponse } from '../../../shared/contracts/fund-actuals/fund-company-actuals-fact.contract';
import {
  MarginalReserveInputFailureSchema,
  MarginalReserveMoicInputV1Schema,
  type MarginalReserveInputFailure,
  type MarginalReserveInputReadinessReason,
  type MarginalReserveMoicInputV1,
  type MarginalReserveStageV1,
} from '../../../shared/contracts/marginal-reserve-moic-v1.contract';
import { canonicalSha256 } from '../../../shared/lib/canonical-hash';
import Decimal from '../../../shared/lib/decimal-config';
import { CANONICAL_STAGES, type CanonicalStage } from '../../../shared/schemas/stage';
import { fundConfigs, funds, portfolioCompanies } from '../../../shared/schema';
import { allocationScenarioIcDecisions } from '../../../shared/schema/allocation-scenarios';

export const MARGINAL_RESERVE_ASSUMPTION_STALE_AFTER_DAYS = 120;

const BuildInputSchema = z
  .object({
    fundId: z.number().int().positive(),
    asOfDate: z.string().date(),
  })
  .strict();

export interface MarginalReserveCompanySource {
  companyId: number;
  stage: string | null;
  currentStage: string | null;
  sector: string;
  currentOwnership: string | number | null;
  plannedReservesCents: number | bigint | null;
  allocationVersion: number;
}

export interface MarginalReserveApprovedAllocationSource {
  companyId: number;
  decisionType: string;
  decisionStatus: string;
  finalPlannedReservesCents: number | bigint | null;
  liveAllocationVersion: number | null;
  decidedAt: Date | null;
  updatedAt: Date;
}

export interface MarginalReservePublishedAssumptions {
  configId: number;
  version: number;
  publishedAt: Date | null;
  config: unknown;
}

export interface MarginalReserveInputSources {
  sourceSnapshotDate: string;
  baseCurrency: string;
  facts: FundCompanyActualsFactsResponse;
  companies: readonly MarginalReserveCompanySource[];
  approvedAllocations: readonly MarginalReserveApprovedAllocationSource[];
  publishedAssumptions: MarginalReservePublishedAssumptions | null;
}

export interface MarginalReserveInputAssembly {
  ready: MarginalReserveMoicInputV1[];
  unavailable: MarginalReserveInputFailure[];
  factsInputHash: string;
  assumptionsHash: string;
}

const STAGE_ALIASES: Readonly<Record<string, CanonicalStage>> = {
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
const USD_PER_MILLION = new Decimal(1_000_000);

function normalizedKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function canonicalStage(value: string | null | undefined): CanonicalStage | null {
  if (!value) return null;
  return STAGE_ALIASES[normalizedKey(value)] ?? null;
}

function probabilityString(percent: number): string | null {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  return new Decimal(percent).div(100).toString();
}

function currentOwnershipString(value: string | number | null): string | null {
  if (value === null || value === '') return null;
  try {
    const ownership = new Decimal(value);
    if (!ownership.isFinite() || ownership.lt(0) || ownership.gt(1)) return null;
    return ownership.toString();
  } catch {
    return null;
  }
}

function assumptionIsStale(publishedAt: Date | null, asOfDate: string): boolean {
  if (!publishedAt) return true;
  const asOf = new Date(`${asOfDate}T00:00:00.000Z`).getTime();
  const ageDays = (asOf - publishedAt.getTime()) / 86_400_000;
  return ageDays > MARGINAL_RESERVE_ASSUMPTION_STALE_AFTER_DAYS;
}

function assumptionIsEffective(publishedAt: Date | null, asOfDate: string): boolean {
  return publishedAt !== null && publishedAt.toISOString().slice(0, 10) <= asOfDate;
}

function profileForCompany(config: FundDraftWriteV1, sector: string) {
  const profiles = config.pipelineProfiles ?? [];
  if (profiles.length === 1) return profiles[0] ?? null;
  const sectorKey = normalizedKey(sector);
  const matches = profiles.filter(
    (profile) =>
      normalizedKey(profile.id) === sectorKey || normalizedKey(profile.name) === sectorKey
  );
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

function followOnPolicyForCompany(
  config: FundDraftWriteV1,
  company: MarginalReserveCompanySource,
  currentStage: CanonicalStage
) {
  const sectorProfileId = config.sectorProfiles?.find(
    (profile) => normalizedKey(profile.name) === normalizedKey(company.sector)
  )?.id;
  const sectorCandidates = (config.capitalPlanAllocations ?? []).filter(
    (allocation) =>
      allocation.sectorProfileId === undefined || allocation.sectorProfileId === sectorProfileId
  );
  const stageCandidates = sectorCandidates.filter(
    (allocation) => canonicalStage(allocation.entryRound) === currentStage
  );
  if (stageCandidates.length === 1) return stageCandidates[0] ?? null;
  return sectorCandidates.length === 1 ? (sectorCandidates[0] ?? null) : null;
}

function prospectiveStages(
  config: FundDraftWriteV1,
  company: MarginalReserveCompanySource,
  currentStage: CanonicalStage
): Array<Omit<MarginalReserveStageV1, 'withDecision' | 'withoutDecision'>> | null {
  const profile = profileForCompany(config, company.sector);
  if (!profile) return null;
  const orderedStages = profile.stages
    .map((stage) => ({ stage, canonical: canonicalStage(stage.name) }))
    .filter(
      (
        candidate
      ): candidate is { stage: (typeof profile.stages)[number]; canonical: CanonicalStage } =>
        candidate.canonical !== null
    )
    .sort(
      (left, right) =>
        CANONICAL_STAGES.indexOf(left.canonical) - CANONICAL_STAGES.indexOf(right.canonical)
    );
  const currentProfileIndex = orderedStages.findIndex(
    (candidate) => candidate.canonical === currentStage
  );
  if (currentProfileIndex < 0) return null;
  const assumedStages = orderedStages.slice(currentProfileIndex + 1);
  if (assumedStages.length === 0) return null;

  const stages: Array<Omit<MarginalReserveStageV1, 'withDecision' | 'withoutDecision'>> = [];
  for (let index = 0; index < assumedStages.length; index += 1) {
    const assumedStage = assumedStages[index];
    const priorStage = orderedStages[currentProfileIndex + index];
    if (!assumedStage || !priorStage) return null;
    const roundSize = new Decimal(assumedStage.stage.roundSize).times(USD_PER_MILLION);
    const statedValuation = new Decimal(assumedStage.stage.valuation).times(USD_PER_MILLION);
    const preMoneyValuation =
      assumedStage.stage.valuationType === 'post'
        ? statedValuation.minus(roundSize)
        : statedValuation;
    const exitValuation = new Decimal(assumedStage.stage.exitValuation).times(USD_PER_MILLION);
    const graduationProbability = probabilityString(assumedStage.stage.graduationRate);
    const exitProbability = probabilityString(assumedStage.stage.exitRate);
    if (
      !roundSize.gt(0) ||
      !preMoneyValuation.gt(0) ||
      !exitValuation.gt(0) ||
      graduationProbability === null ||
      exitProbability === null ||
      new Decimal(graduationProbability).plus(exitProbability).gt(1) ||
      !Number.isInteger(priorStage.stage.monthsToGraduate) ||
      priorStage.stage.monthsToGraduate <= 0
    ) {
      return null;
    }
    stages.push({
      stage: assumedStage.canonical,
      preMoneyValuation: preMoneyValuation.toString(),
      roundSize: roundSize.toString(),
      // V1 advances financing stages on the prior stage's approved graduation cadence.
      monthsFromPriorStage: priorStage.stage.monthsToGraduate,
      graduationProbability,
      exitProbability,
      exitValuation: exitValuation.toString(),
    });
  }
  return stages;
}

function approvedCheckAmount(
  policy: NonNullable<FundDraftWriteV1['capitalPlanAllocations']>[number] | null,
  ownership: string | null,
  stage: Omit<MarginalReserveStageV1, 'withDecision' | 'withoutDecision'>
): Decimal | null {
  if (!policy || policy.followOnParticipationPct <= 0 || ownership === null) return null;
  if (policy.followOnStrategy === 'amount') {
    const amount = new Decimal(policy.followOnAmount ?? 0);
    return amount.gt(0) ? amount : null;
  }
  const maintainOwnershipCheck = new Decimal(stage.roundSize).times(ownership);
  return maintainOwnershipCheck.gt(0) ? maintainOwnershipCheck : null;
}

function currentApprovedAllocation(
  company: MarginalReserveCompanySource,
  approvals: readonly MarginalReserveApprovedAllocationSource[],
  asOfDate: string
): MarginalReserveApprovedAllocationSource | null {
  return (
    [...approvals]
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .find(
        (approval) =>
          approval.companyId === company.companyId &&
          approval.decisionType === 'follow_on' &&
          approval.decisionStatus === 'approved' &&
          approval.decidedAt !== null &&
          approval.decidedAt.toISOString().slice(0, 10) <= asOfDate &&
          approval.liveAllocationVersion === company.allocationVersion &&
          String(approval.finalPlannedReservesCents ?? '') ===
            String(company.plannedReservesCents ?? '') &&
          new Decimal(approval.finalPlannedReservesCents ?? 0).gt(0)
      ) ?? null
  );
}

function orderedReasons(
  reasons: Iterable<MarginalReserveInputReadinessReason>
): MarginalReserveInputReadinessReason[] {
  return [...new Set(reasons)].sort();
}

export function buildMarginalReserveMoicInputsFromSources(input: {
  fundId: number;
  asOfDate: string;
  sources: MarginalReserveInputSources;
}): MarginalReserveInputAssembly {
  const { fundId, asOfDate } = BuildInputSchema.parse({
    fundId: input.fundId,
    asOfDate: input.asOfDate,
  });
  const companies = [...input.sources.companies].sort(
    (left, right) => left.companyId - right.companyId
  );
  const factsByCompany = new Map(
    input.sources.facts.facts.map((fact) => [fact.companyId, fact] as const)
  );
  const parsedConfig = input.sources.publishedAssumptions
    ? FundDraftWriteV1Schema.safeParse(input.sources.publishedAssumptions.config)
    : null;
  const config = parsedConfig?.success ? parsedConfig.data : null;
  const factsScopeMatches =
    input.sources.facts.fundId === fundId &&
    input.sources.facts.asOfDate === asOfDate &&
    input.sources.facts.facts.every((fact) => fact.fundId === fundId);
  const currentStateDateMatches = input.sources.sourceSnapshotDate === asOfDate;
  const currentFactsRows = companies.map((company) => ({
    companyId: company.companyId,
    stage: company.stage,
    currentStage: company.currentStage,
    sector: company.sector,
    currentOwnership: company.currentOwnership,
  }));
  const factsInputHash = canonicalSha256({
    fundId,
    asOfDate,
    actualsFactsInputHash: input.sources.facts.inputHash,
    sourceSnapshotDate: input.sources.sourceSnapshotDate,
    baseCurrency: input.sources.baseCurrency,
    currentCompanyFacts: currentFactsRows,
  });
  const assumptionsHash = canonicalSha256({
    fundId,
    publishedAssumptions: input.sources.publishedAssumptions,
    currentAllocations: companies.map((company) => ({
      companyId: company.companyId,
      plannedReservesCents: String(company.plannedReservesCents ?? ''),
      allocationVersion: company.allocationVersion,
    })),
    approvedAllocations: [...input.sources.approvedAllocations].sort(
      (left, right) =>
        left.companyId - right.companyId || right.updatedAt.getTime() - left.updatedAt.getTime()
    ),
  });
  const ready: MarginalReserveMoicInputV1[] = [];
  const unavailable: MarginalReserveInputFailure[] = [];

  for (const company of companies) {
    const reasons: MarginalReserveInputReadinessReason[] = [];
    const fact = factsByCompany.get(company.companyId);
    if (!factsScopeMatches) reasons.push('FACTS_SCOPE_MISMATCH');
    if (!currentStateDateMatches) reasons.push('CURRENT_STATE_DATE_MISMATCH');
    if (!fact) reasons.push('MISSING_ACTUALS_FACTS');
    if (
      input.sources.baseCurrency !== 'USD' ||
      fact?.currencyStatus === 'mismatch_blocked' ||
      (fact !== undefined && fact.currency !== 'USD')
    ) {
      reasons.push('BLOCKED_CURRENCY');
    }
    if (fact?.currencyStatus === 'unknown') reasons.push('UNKNOWN_CURRENCY');

    const ownership = currentOwnershipString(company.currentOwnership);
    if (ownership === null) reasons.push('MISSING_CURRENT_OWNERSHIP');
    if (!config || !input.sources.publishedAssumptions?.publishedAt) {
      reasons.push('MISSING_PUBLISHED_ASSUMPTIONS');
    } else if (!assumptionIsEffective(input.sources.publishedAssumptions.publishedAt, asOfDate)) {
      reasons.push('ASSUMPTION_NOT_EFFECTIVE');
    }

    const currentStage = canonicalStage(company.currentStage ?? company.stage);
    const policy =
      config && currentStage ? followOnPolicyForCompany(config, company, currentStage) : null;
    if (!policy || policy.followOnParticipationPct <= 0) {
      reasons.push('MISSING_FOLLOW_ON_POLICY');
    }
    const approvedAllocation = currentApprovedAllocation(
      company,
      input.sources.approvedAllocations,
      asOfDate
    );
    if (!approvedAllocation) reasons.push('MISSING_APPROVED_ALLOCATION');

    const stageTerms =
      config && currentStage ? prospectiveStages(config, company, currentStage) : null;
    if (!stageTerms) {
      reasons.push('MISSING_STAGE_ASSUMPTION');
    }
    const firstCheckAmount =
      stageTerms?.[0] && approvedAllocation
        ? approvedCheckAmount(policy, ownership, stageTerms[0])
        : null;
    const checkAmounts = stageTerms?.map((_stage, index) =>
      index === 0 ? firstCheckAmount : new Decimal(0)
    );
    if (!checkAmounts || firstCheckAmount === null) {
      reasons.push('MISSING_PLANNED_CHECK');
    }
    if (
      firstCheckAmount &&
      approvedAllocation &&
      firstCheckAmount.gt(new Decimal(approvedAllocation.finalPlannedReservesCents ?? 0).div(100))
    ) {
      reasons.push('PLANNED_CHECK_EXCEEDS_APPROVED_ALLOCATION');
    }
    if (
      stageTerms?.some((stage, index) => {
        const checkAmount = checkAmounts?.[index];
        return checkAmount !== null && checkAmount !== undefined && checkAmount.gt(stage.roundSize);
      })
    ) {
      reasons.push('PLANNED_CHECK_EXCEEDS_ROUND_SIZE');
    }

    const blockingReasons = orderedReasons(
      reasons.filter((reason) => reason !== 'STALE_ASSUMPTION')
    );
    if (
      blockingReasons.length > 0 ||
      ownership === null ||
      !stageTerms ||
      !checkAmounts ||
      firstCheckAmount === null ||
      !input.sources.publishedAssumptions
    ) {
      unavailable.push(
        MarginalReserveInputFailureSchema.parse({
          companyId: company.companyId,
          reasons: blockingReasons,
        })
      );
      continue;
    }

    const stale = assumptionIsStale(input.sources.publishedAssumptions.publishedAt, asOfDate);
    ready.push(
      MarginalReserveMoicInputV1Schema.parse({
        contractVersion: 'marginal-reserve-moic-input-v1',
        fundId,
        companyId: company.companyId,
        baseCurrency: 'USD',
        asOfDate,
        currentOwnership: ownership,
        stages: stageTerms.map((stage, index) => {
          const checkAmount = checkAmounts[index];
          if (!checkAmount) throw new Error('Approved check path is incomplete');
          return {
            ...stage,
            withDecision: { participate: checkAmount.gt(0), checkAmount: checkAmount.toString() },
            withoutDecision: { participate: false, checkAmount: '0' },
          };
        }),
        factsInputHash,
        assumptionsHash,
        engineVersion: 'marginal-reserve-moic-v1',
        readiness: stale
          ? { status: 'indicative', reasons: ['STALE_ASSUMPTION'] }
          : { status: 'actionable', reasons: [] },
      })
    );
  }

  return { ready, unavailable, factsInputHash, assumptionsHash };
}

async function loadMarginalReserveInputSources(input: {
  fundId: number;
  asOfDate: string;
}): Promise<MarginalReserveInputSources> {
  const sourceSnapshotDate = new Date().toISOString().slice(0, 10);
  const [facts, fundRows, configRows, companyRows, approvedAllocations] = await Promise.all([
    buildFundCompanyActualsFacts(input),
    db
      .select({ baseCurrency: funds.baseCurrency })
      .from(funds)
      .where(eq(funds.id, input.fundId))
      .limit(1),
    db
      .select({
        configId: fundConfigs.id,
        version: fundConfigs.version,
        publishedAt: fundConfigs.publishedAt,
        config: fundConfigs.config,
      })
      .from(fundConfigs)
      .where(and(eq(fundConfigs.fundId, input.fundId), eq(fundConfigs.isPublished, true)))
      .limit(1),
    db
      .select({
        companyId: portfolioCompanies.id,
        stage: portfolioCompanies.stage,
        currentStage: portfolioCompanies.currentStage,
        sector: portfolioCompanies.sector,
        currentOwnership: portfolioCompanies.ownershipCurrentPct,
        plannedReservesCents: portfolioCompanies.plannedReservesCents,
        allocationVersion: portfolioCompanies.allocationVersion,
      })
      .from(portfolioCompanies)
      .where(eq(portfolioCompanies.fundId, input.fundId))
      .orderBy(asc(portfolioCompanies.id)),
    db
      .select({
        companyId: allocationScenarioIcDecisions.companyId,
        decisionType: allocationScenarioIcDecisions.decisionType,
        decisionStatus: allocationScenarioIcDecisions.decisionStatus,
        finalPlannedReservesCents: allocationScenarioIcDecisions.finalPlannedReservesCents,
        liveAllocationVersion: allocationScenarioIcDecisions.liveAllocationVersion,
        decidedAt: allocationScenarioIcDecisions.decidedAt,
        updatedAt: allocationScenarioIcDecisions.updatedAt,
      })
      .from(allocationScenarioIcDecisions)
      .where(
        and(
          eq(allocationScenarioIcDecisions.fundId, input.fundId),
          eq(allocationScenarioIcDecisions.decisionType, 'follow_on'),
          eq(allocationScenarioIcDecisions.decisionStatus, 'approved')
        )
      )
      .orderBy(
        asc(allocationScenarioIcDecisions.companyId),
        desc(allocationScenarioIcDecisions.updatedAt)
      ),
  ]);
  const fund = fundRows[0];
  if (!fund) {
    throw new Error(`Fund ${input.fundId} was not found`);
  }

  return {
    baseCurrency: fund.baseCurrency,
    facts,
    companies: companyRows,
    approvedAllocations,
    publishedAssumptions: configRows[0] ?? null,
    sourceSnapshotDate,
  };
}

export async function buildMarginalReserveMoicInputs(input: {
  fundId: number;
  asOfDate: string;
}): Promise<MarginalReserveInputAssembly> {
  const parsed = BuildInputSchema.parse(input);
  const sources = await loadMarginalReserveInputSources(parsed);
  return buildMarginalReserveMoicInputsFromSources({ ...parsed, sources });
}
