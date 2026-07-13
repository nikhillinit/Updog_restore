import { and, asc, eq } from 'drizzle-orm';
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
}

export interface MarginalReservePublishedAssumptions {
  configId: number;
  version: number;
  publishedAt: Date | null;
  config: unknown;
}

export interface MarginalReserveInputSources {
  baseCurrency: string;
  facts: FundCompanyActualsFactsResponse;
  companies: readonly MarginalReserveCompanySource[];
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
    if (!ownership.isFinite() || ownership.lt(0) || ownership.gt(100)) return null;
    return (ownership.gt(1) ? ownership.div(100) : ownership).toString();
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

function prospectiveStage(
  config: FundDraftWriteV1,
  company: MarginalReserveCompanySource,
  currentStage: CanonicalStage,
  checkAmount: Decimal
): MarginalReserveStageV1 | null {
  const profile = profileForCompany(config, company.sector);
  if (!profile) return null;
  const currentStageIndex = CANONICAL_STAGES.indexOf(currentStage);
  const assumedStage = profile.stages
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
    )
    .find((candidate) => CANONICAL_STAGES.indexOf(candidate.canonical) > currentStageIndex);
  if (!assumedStage) return null;

  const roundSize = new Decimal(assumedStage.stage.roundSize);
  const statedValuation = new Decimal(assumedStage.stage.valuation);
  const preMoneyValuation =
    assumedStage.stage.valuationType === 'post'
      ? statedValuation.minus(roundSize)
      : statedValuation;
  const exitValuation = new Decimal(assumedStage.stage.exitValuation);
  const graduationProbability = probabilityString(assumedStage.stage.graduationRate);
  const exitProbability = probabilityString(assumedStage.stage.exitRate);
  if (
    !roundSize.gt(0) ||
    !preMoneyValuation.gt(0) ||
    !exitValuation.gt(0) ||
    graduationProbability === null ||
    exitProbability === null ||
    new Decimal(graduationProbability).plus(exitProbability).gt(1) ||
    !Number.isInteger(assumedStage.stage.monthsToGraduate) ||
    assumedStage.stage.monthsToGraduate < 0 ||
    !checkAmount.gt(0)
  ) {
    return null;
  }

  return {
    stage: assumedStage.canonical,
    preMoneyValuation: preMoneyValuation.toString(),
    roundSize: roundSize.toString(),
    monthsFromPriorStage: assumedStage.stage.monthsToGraduate,
    graduationProbability,
    exitProbability,
    exitValuation: exitValuation.toString(),
    withDecision: { participate: true, checkAmount: checkAmount.toString() },
    withoutDecision: { participate: false, checkAmount: '0' },
  };
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
  const factsInputHash = input.sources.facts.inputHash;
  const assumptionsHash = canonicalSha256({
    fundId,
    baseCurrency: input.sources.baseCurrency,
    publishedAssumptions: input.sources.publishedAssumptions,
    companies: companies.map((company) => ({
      companyId: company.companyId,
      stage: company.stage,
      currentStage: company.currentStage,
      sector: company.sector,
      currentOwnership: company.currentOwnership,
      plannedReservesCents: String(company.plannedReservesCents ?? ''),
    })),
  });
  const ready: MarginalReserveMoicInputV1[] = [];
  const unavailable: MarginalReserveInputFailure[] = [];

  for (const company of companies) {
    const reasons: MarginalReserveInputReadinessReason[] = [];
    const fact = factsByCompany.get(company.companyId);
    if (!fact) reasons.push('MISSING_ACTUALS_FACTS');
    if (
      input.sources.baseCurrency !== 'USD' ||
      !fact ||
      fact.currencyStatus !== 'base_currency' ||
      fact.currency !== 'USD'
    ) {
      reasons.push('BLOCKED_CURRENCY');
    }

    const ownership = currentOwnershipString(company.currentOwnership);
    if (ownership === null) reasons.push('MISSING_CURRENT_OWNERSHIP');
    if (!config || !input.sources.publishedAssumptions) {
      reasons.push('MISSING_PUBLISHED_ASSUMPTIONS');
    }

    const currentStage = canonicalStage(company.currentStage ?? company.stage);
    const policy =
      config && currentStage ? followOnPolicyForCompany(config, company, currentStage) : null;
    if (!policy || policy.followOnParticipationPct <= 0) {
      reasons.push('MISSING_FOLLOW_ON_POLICY');
    }

    const checkAmount = new Decimal(company.plannedReservesCents ?? 0).div(100);
    if (!checkAmount.gt(0)) reasons.push('MISSING_PLANNED_CHECK');
    const stage =
      config && currentStage && checkAmount.gt(0)
        ? prospectiveStage(config, company, currentStage, checkAmount)
        : null;
    if (!stage) {
      reasons.push('MISSING_STAGE_ASSUMPTION');
    } else if (checkAmount.gt(stage.roundSize)) {
      reasons.push('PLANNED_CHECK_EXCEEDS_ROUND_SIZE');
    }

    const blockingReasons = orderedReasons(
      reasons.filter((reason) => reason !== 'STALE_ASSUMPTION')
    );
    if (
      blockingReasons.length > 0 ||
      ownership === null ||
      !stage ||
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
        stages: [stage],
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
  const [facts, fundRows, configRows, companyRows] = await Promise.all([
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
      })
      .from(portfolioCompanies)
      .where(eq(portfolioCompanies.fundId, input.fundId))
      .orderBy(asc(portfolioCompanies.id)),
  ]);
  const fund = fundRows[0];
  if (!fund) {
    throw new Error(`Fund ${input.fundId} was not found`);
  }

  return {
    baseCurrency: fund.baseCurrency,
    facts,
    companies: companyRows,
    publishedAssumptions: configRows[0] ?? null,
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
