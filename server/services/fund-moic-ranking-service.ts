import { db } from '../db';
import { MOICCalculator } from '../../shared/core/moic/MOICCalculator.js';
import type { Investment as MOICInvestment } from '../../shared/core/moic/MOICCalculator.js';
import { dbToMOICInvestment } from '../lib/moic-mapper.js';
import type {
  FundMoicFactsBasisV1,
  FundMoicRankingItemV1,
  FundMoicRankingsResponseV1,
} from '../../shared/contracts/fund-moic-v1.contract.js';
import { canonicalSha256 } from '../../shared/lib/canonical-hash';
import type { FundCompanyActualsFactsResponse } from '../../shared/contracts/fund-actuals/fund-company-actuals-fact.contract';
import Decimal from '../../shared/lib/decimal-config';
import { logger } from '../lib/logger.js';
import { buildFundCompanyActualsFacts } from './fund-actuals/fund-company-actuals-facts-service.js';
import { buildFundMoicFactsBasis } from './moic/fund-moic-facts-basis';

export const MOIC_CANDIDATE_SOURCE_VERSION = 'moic-round-fmv-facts-v2';
export const FUND_MOIC_CALCULATION_KEY = 'fund_moic_rankings_exit_probability';
export const FUND_MOIC_FACTS_ABSENT = { status: 'absent' } as const;

export type FundMoicFactsSource =
  | typeof FUND_MOIC_FACTS_ABSENT
  | { status: 'available'; response: FundCompanyActualsFactsResponse };

export interface FundMoicInputSummary {
  sourceVersion: typeof MOIC_CANDIDATE_SOURCE_VERSION;
  explicitExitProbabilityCount: number;
  defaultedExitProbabilityCount: number;
  activationBlockingDefaultedExitProbabilityCount: number;
  explicitReserveExitMultipleCount: number;
  defaultedReserveExitMultipleCount: number;
  activationBlockingDefaultedReserveExitMultipleCount: number;
}

export interface FundMoicRankingSources {
  legacy: FundMoicRankingSourceResponse;
  candidate: FundMoicRankingSourceResponse;
  moicInputSummary: FundMoicInputSummary;
  moicSourceInputHash: string;
  factsSource: FundMoicFactsSource;
  factsBasisByInvestmentId?: ReadonlyMap<string, FundMoicFactsBasisV1>;
  candidateFactsBasisByInvestmentId?: ReadonlyMap<string, FundMoicFactsBasisV1>;
}

export type FundMoicRankingSourceItem = Omit<FundMoicRankingItemV1, 'factsBasis'>;

export interface FundMoicRankingSourceResponse extends Omit<
  FundMoicRankingsResponseV1,
  'rankings'
> {
  rankings: FundMoicRankingSourceItem[];
}

export function summarizeMoicActualsProvenance(input: {
  factsStatus: 'available' | 'failed';
  factsInputHash: string | null;
  trustStates: Array<'LIVE' | 'PARTIAL' | 'UNAVAILABLE' | 'FAILED'>;
  defaultedEconomicInputCount: number;
  warnings?: Array<'actuals_facts_failed'>;
}) {
  return {
    factsStatus: input.factsStatus,
    factsInputHash: input.factsInputHash,
    companyCount: input.trustStates.length,
    trustStateCounts: {
      LIVE: input.trustStates.filter((state) => state === 'LIVE').length,
      PARTIAL: input.trustStates.filter((state) => state === 'PARTIAL').length,
      UNAVAILABLE: input.trustStates.filter((state) => state === 'UNAVAILABLE').length,
      FAILED: input.trustStates.filter((state) => state === 'FAILED').length,
    },
    defaultedEconomicInputCount: input.defaultedEconomicInputCount,
    warnings: input.warnings ?? [],
  };
}

export type PortfolioCompanyMoicSourceRow = {
  id: number;
  fundId?: number | null;
  name: string;
  investmentAmount?: string | number | null;
  currentValuation?: string | number | null;
  plannedReservesCents?: number | bigint | null;
  exitMoicBps?: string | number | null;
  exitProbability?: string | number | null;
  investmentDate?: Date | string | null;
};

type FundMoicRankingDatabase = typeof db;

type CandidateInput = {
  companyName: string;
  investment: MOICInvestment | null;
  factsBasis: FundMoicFactsBasisV1;
  candidateRankability: FundMoicFactsBasisV1['rankability'];
  hashRow: {
    companyId: number;
    fundId: number | null;
    investmentName: string;
    plannedReservesCents: string;
    exitProbability: number | null;
    exitProbabilitySource: 'explicit' | 'defaulted';
    exitMoicBps: number | null;
    reserveExitMultipleSource: 'explicit' | 'defaulted';
    factsInputHash: string | null;
    observedInitialInvestment: string;
    observedFollowOnInvestment: string;
    valuationAnchorKind: FundMoicFactsBasisV1['valuationAnchor']['kind'];
    valuationAnchorValue: string | null;
    valuationAnchorAsOfDate: string | null;
    planningFmvStatus: FundMoicFactsBasisV1['planningFmvStatus'];
    currencyStatus: FundMoicFactsBasisV1['currencyStatus'];
    rankability: FundMoicFactsBasisV1['rankability'];
    sourceVersion: typeof MOIC_CANDIDATE_SOURCE_VERSION;
  };
  hasExplicitExitProbability: boolean;
  hasExplicitReserveExitMultiple: boolean;
  activationBlocksExitProbability: boolean;
  activationBlocksReserveExitMultiple: boolean;
};

function parseFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseDecimalString(value: unknown): string | null {
  try {
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'number') {
      return Number.isFinite(value) ? new Decimal(value).toString() : null;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      return new Decimal(value.trim()).toString();
    }
    return null;
  } catch {
    return null;
  }
}

function parseExitProbability(value: unknown): number | null {
  const parsed = parseFiniteNumber(value);
  return parsed !== null && parsed >= 0 && parsed <= 1 ? parsed : null;
}

function parsePositiveExitMoicBps(value: unknown): number | null {
  const parsed = parseFiniteNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function buildLegacyMoicInvestment(row: PortfolioCompanyMoicSourceRow): MOICInvestment {
  return dbToMOICInvestment({
    id: row.id,
    name: row.name,
    investmentAmount: row.investmentAmount ?? null,
    currentValuation: row.currentValuation ?? null,
    projectedExitValue: null,
    exitProbability: null,
    plannedReservesCents: row.plannedReservesCents ?? null,
    exitMoicBps: parseFiniteNumber(row.exitMoicBps),
    investmentDate: row.investmentDate ?? null,
    followOnAmount: null,
  });
}

function buildCandidateMoicInvestment(
  row: PortfolioCompanyMoicSourceRow,
  factsBasis: FundMoicFactsBasisV1,
  useFactsCandidate: boolean
): CandidateInput {
  const plannedReservesCents = parseFiniteNumber(row.plannedReservesCents) ?? 0;
  const explicitExitProbability = parseExitProbability(row.exitProbability);
  const explicitExitMoicBps = parsePositiveExitMoicBps(row.exitMoicBps);
  const hasExplicitExitProbability = explicitExitProbability !== null;
  const hasExplicitReserveExitMultiple = explicitExitMoicBps !== null;
  const exitProbability = explicitExitProbability ?? 1;
  const reserveExitMultiple = explicitExitMoicBps !== null ? explicitExitMoicBps / 100 : 1;
  const plannedReservesCanAffectMoic = plannedReservesCents > 0;
  const activationBlocksReserveExitMultiple =
    plannedReservesCanAffectMoic && !hasExplicitReserveExitMultiple;
  const activationBlocksExitProbability =
    plannedReservesCanAffectMoic && !hasExplicitExitProbability && hasExplicitReserveExitMultiple;
  const candidateRankability: FundMoicFactsBasisV1['rankability'] =
    useFactsCandidate && (!hasExplicitExitProbability || !hasExplicitReserveExitMultiple)
      ? 'not_actionable'
      : factsBasis.rankability;
  let investment: MOICInvestment | null;

  if (useFactsCandidate) {
    const valuationAnchor = parseFiniteNumber(factsBasis.valuationAnchor.value);
    investment =
      candidateRankability === 'not_actionable' ||
      explicitExitProbability === null ||
      explicitExitMoicBps === null ||
      valuationAnchor === null
        ? null
        : {
            id: String(row.id),
            name: row.name,
            initialInvestment: parseFiniteNumber(factsBasis.observedInitialInvestment) ?? 0,
            followOnInvestment: parseFiniteNumber(factsBasis.observedFollowOnInvestment) ?? 0,
            currentValuation: valuationAnchor,
            projectedExitValue: 0,
            exitProbability: explicitExitProbability,
            plannedReserves: plannedReservesCents / 100,
            reserveExitMultiple: explicitExitMoicBps / 100,
            investmentDate: row.investmentDate ? new Date(row.investmentDate) : new Date(),
          };
  } else {
    investment = {
      id: String(row.id),
      name: row.name,
      initialInvestment: parseFiniteNumber(row.investmentAmount) ?? 0,
      followOnInvestment: 0,
      currentValuation: parseFiniteNumber(row.currentValuation) ?? 0,
      projectedExitValue: 0,
      exitProbability,
      plannedReserves: plannedReservesCents / 100,
      reserveExitMultiple,
      investmentDate: row.investmentDate ? new Date(row.investmentDate) : new Date(),
    };
  }

  return {
    companyName: row.name,
    investment,
    factsBasis,
    candidateRankability,
    hashRow: {
      companyId: row.id,
      fundId: row.fundId ?? null,
      investmentName: row.name,
      plannedReservesCents: parseDecimalString(row.plannedReservesCents) ?? '0',
      exitProbability: explicitExitProbability,
      exitProbabilitySource: hasExplicitExitProbability ? 'explicit' : 'defaulted',
      exitMoicBps: explicitExitMoicBps,
      reserveExitMultipleSource: hasExplicitReserveExitMultiple ? 'explicit' : 'defaulted',
      factsInputHash: factsBasis.factsInputHash,
      observedInitialInvestment: factsBasis.observedInitialInvestment,
      observedFollowOnInvestment: factsBasis.observedFollowOnInvestment,
      valuationAnchorKind: factsBasis.valuationAnchor.kind,
      valuationAnchorValue: factsBasis.valuationAnchor.value,
      valuationAnchorAsOfDate: factsBasis.valuationAnchor.asOfDate,
      planningFmvStatus: factsBasis.planningFmvStatus,
      currencyStatus: factsBasis.currencyStatus,
      rankability: candidateRankability,
      sourceVersion: MOIC_CANDIDATE_SOURCE_VERSION,
    },
    hasExplicitExitProbability,
    hasExplicitReserveExitMultiple,
    activationBlocksExitProbability,
    activationBlocksReserveExitMultiple,
  };
}

function buildMoicRankingSourceFromInvestments(
  fundId: number,
  investments: MOICInvestment[]
): FundMoicRankingSourceResponse {
  const ranked = MOICCalculator.rankByReservesMOIC(investments);

  return {
    fundId,
    provenance: {
      source: 'portfolio_companies',
      calculation: 'reserves_moic_rankings',
      metricBasis: 'planned_reserves',
      sourceRecordCount: investments.length,
    },
    generatedAt: new Date().toISOString(),
    rankings: ranked.map((item) => ({
      rank: item.rank,
      investmentId: item.investment.id,
      investmentName: item.investment.name,
      reservesMoic: {
        value: item.reservesMOIC.value,
        description: item.reservesMOIC.description,
        formula: item.reservesMOIC.formula,
      },
    })),
  };
}

function buildFactsCandidateRankingSource(
  fundId: number,
  candidateInputs: CandidateInput[]
): FundMoicRankingSourceResponse {
  const rankabilityOrder: Record<FundMoicFactsBasisV1['rankability'], number> = {
    actionable: 0,
    indicative: 1,
    not_actionable: 2,
  };
  const ranked = candidateInputs
    .map((input) => ({
      input,
      reservesMoic:
        input.investment === null
          ? {
              value: null,
              description: 'Not actionable from the current Round/FMV facts basis',
              formula: 'N/A (non-actionable inputs)',
            }
          : MOICCalculator.calculateReservesMOIC(input.investment, true),
    }))
    .sort((left, right) => {
      const rankabilityDifference =
        rankabilityOrder[left.input.candidateRankability] -
        rankabilityOrder[right.input.candidateRankability];
      if (rankabilityDifference !== 0) return rankabilityDifference;

      const leftValue = left.reservesMoic.value ?? Number.NEGATIVE_INFINITY;
      const rightValue = right.reservesMoic.value ?? Number.NEGATIVE_INFINITY;
      if (leftValue !== rightValue) return rightValue - leftValue;
      return left.input.hashRow.companyId - right.input.hashRow.companyId;
    });

  return {
    fundId,
    provenance: {
      source: 'portfolio_companies',
      calculation: 'reserves_moic_rankings',
      metricBasis: 'planned_reserves',
      sourceRecordCount: candidateInputs.length,
    },
    generatedAt: new Date().toISOString(),
    rankings: ranked.map(({ input, reservesMoic }, index) => ({
      rank: index + 1,
      investmentId: String(input.hashRow.companyId),
      investmentName: input.companyName,
      reservesMoic: {
        value: reservesMoic.value,
        description: reservesMoic.description,
        formula: reservesMoic.formula,
      },
    })),
  };
}

export function discloseFundMoicRankings(
  source: FundMoicRankingSourceResponse,
  factsBasisByInvestmentId?: ReadonlyMap<string, FundMoicFactsBasisV1>
): FundMoicRankingsResponseV1 {
  return {
    ...source,
    rankings: source.rankings.map((ranking) => ({
      ...ranking,
      factsBasis: factsBasisByInvestmentId?.get(ranking.investmentId) ?? null,
    })),
  };
}

export function buildMoicRankingsFromInvestments(
  fundId: number,
  investments: MOICInvestment[]
): FundMoicRankingsResponseV1 {
  return discloseFundMoicRankings(buildMoicRankingSourceFromInvestments(fundId, investments));
}

export function buildMoicRankingSourcesFromCompanies(
  fundId: number,
  companies: PortfolioCompanyMoicSourceRow[],
  factsSource: FundMoicFactsSource = FUND_MOIC_FACTS_ABSENT
): FundMoicRankingSources {
  const sortedCompanies = [...companies].sort((a, b) => a.id - b.id);
  const actualsFacts = factsSource.status === 'available' ? factsSource.response : undefined;
  const factsByCompanyId = actualsFacts
    ? new Map(actualsFacts.facts.map((fact) => [fact.companyId, fact] as const))
    : undefined;
  const legacyInvestments = sortedCompanies.map(buildLegacyMoicInvestment);
  const candidateInputs = sortedCompanies.map((company) => {
    const factsBasis = buildFundMoicFactsBasis({
      company,
      fact: factsByCompanyId?.get(company.id) ?? null,
    });
    return buildCandidateMoicInvestment(company, factsBasis, actualsFacts !== undefined);
  });
  const factsBasisByInvestmentId = new Map(
    candidateInputs.map((input) => [String(input.hashRow.companyId), input.factsBasis])
  );
  const candidateFactsBasisByInvestmentId = new Map(
    candidateInputs.map((input) => [
      String(input.hashRow.companyId),
      input.candidateRankability === input.factsBasis.rankability
        ? input.factsBasis
        : { ...input.factsBasis, rankability: input.candidateRankability },
    ])
  );
  const candidateInvestments = candidateInputs.flatMap((input) =>
    input.investment === null ? [] : [input.investment]
  );
  const moicInputSummary: FundMoicInputSummary = {
    sourceVersion: MOIC_CANDIDATE_SOURCE_VERSION,
    explicitExitProbabilityCount: candidateInputs.filter(
      (input) => input.hasExplicitExitProbability
    ).length,
    defaultedExitProbabilityCount: candidateInputs.filter(
      (input) => !input.hasExplicitExitProbability
    ).length,
    activationBlockingDefaultedExitProbabilityCount: candidateInputs.filter(
      (input) => input.activationBlocksExitProbability
    ).length,
    explicitReserveExitMultipleCount: candidateInputs.filter(
      (input) => input.hasExplicitReserveExitMultiple
    ).length,
    defaultedReserveExitMultipleCount: candidateInputs.filter(
      (input) => !input.hasExplicitReserveExitMultiple
    ).length,
    activationBlockingDefaultedReserveExitMultipleCount: candidateInputs.filter(
      (input) => input.activationBlocksReserveExitMultiple
    ).length,
  };
  const moicSourceInputHash = canonicalSha256({
    kind: 'fund_moic_candidate_source',
    fundId,
    rows: candidateInputs.map((input) => input.hashRow),
    sourceVersion: MOIC_CANDIDATE_SOURCE_VERSION,
  });
  const disclosedFactsBasisByInvestmentId = actualsFacts ? factsBasisByInvestmentId : undefined;
  const disclosedCandidateFactsBasisByInvestmentId = actualsFacts
    ? candidateFactsBasisByInvestmentId
    : undefined;

  return {
    legacy: buildMoicRankingSourceFromInvestments(fundId, legacyInvestments),
    candidate: actualsFacts
      ? buildFactsCandidateRankingSource(fundId, candidateInputs)
      : buildMoicRankingSourceFromInvestments(fundId, candidateInvestments),
    moicInputSummary,
    moicSourceInputHash,
    factsSource,
    ...(disclosedFactsBasisByInvestmentId !== undefined && {
      factsBasisByInvestmentId: disclosedFactsBasisByInvestmentId,
    }),
    ...(disclosedCandidateFactsBasisByInvestmentId !== undefined && {
      candidateFactsBasisByInvestmentId: disclosedCandidateFactsBasisByInvestmentId,
    }),
  };
}

export async function getFundMoicRankingSources(
  fundId: number,
  database: FundMoicRankingDatabase = db,
  factsSource?: FundMoicFactsSource,
  now: Date = new Date()
): Promise<FundMoicRankingSources> {
  const asOfDate = now.toISOString().slice(0, 10);
  const [companies, resolvedFactsSource] = await Promise.all([
    database.query.portfolioCompanies.findMany({
      where: (pc, { eq }) => eq(pc.fundId, fundId),
      orderBy: (pc, { asc }) => [asc(pc.id)],
    }),
    factsSource
      ? Promise.resolve(factsSource)
      : buildFundCompanyActualsFacts({ fundId, asOfDate, database, now })
          .then((response) => ({ status: 'available' as const, response }))
          .catch((error: unknown) => {
            logger.warn(
              {
                fundId,
                asOfDate,
                error: error instanceof Error ? error.message : String(error),
              },
              'fund-moic actuals facts load failed; using unavailable facts source'
            );
            return FUND_MOIC_FACTS_ABSENT;
          }),
  ]);

  return buildMoicRankingSourcesFromCompanies(fundId, companies, resolvedFactsSource);
}

export async function getFundMoicRankings(
  fundId: number,
  database: FundMoicRankingDatabase = db
): Promise<FundMoicRankingsResponseV1> {
  const sources = await getFundMoicRankingSources(fundId, database);
  return discloseFundMoicRankings(sources.legacy);
}
