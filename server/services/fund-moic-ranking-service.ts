import { db } from '../db';
import { MOICCalculator } from '../../shared/core/moic/MOICCalculator.js';
import type { Investment as MOICInvestment } from '../../shared/core/moic/MOICCalculator.js';
import { dbToMOICInvestment } from '../routes/moic.js';
import type { FundMoicRankingsResponseV1 } from '../../shared/contracts/fund-moic-v1.contract.js';
import { canonicalSha256 } from '../../shared/lib/canonical-hash';

export const MOIC_CANDIDATE_SOURCE_VERSION = 'moic-exit-probability-v1';
export const FUND_MOIC_CALCULATION_KEY = 'fund_moic_rankings_exit_probability';

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
  legacy: FundMoicRankingsResponseV1;
  candidate: FundMoicRankingsResponseV1;
  moicInputSummary: FundMoicInputSummary;
  moicSourceInputHash: string;
}

type PortfolioCompanyMoicSourceRow = {
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
  investment: MOICInvestment;
  hashRow: {
    companyId: number;
    fundId: number | null;
    plannedReservesCents: number;
    exitProbability: number | null;
    exitProbabilitySource: 'explicit' | 'defaulted';
    exitMoicBps: number | null;
    reserveExitMultipleSource: 'explicit' | 'defaulted';
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

function buildCandidateMoicInvestment(row: PortfolioCompanyMoicSourceRow): CandidateInput {
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

  return {
    investment: {
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
    },
    hashRow: {
      companyId: row.id,
      fundId: row.fundId ?? null,
      plannedReservesCents,
      exitProbability: explicitExitProbability,
      exitProbabilitySource: hasExplicitExitProbability ? 'explicit' : 'defaulted',
      exitMoicBps: explicitExitMoicBps,
      reserveExitMultipleSource: hasExplicitReserveExitMultiple ? 'explicit' : 'defaulted',
      sourceVersion: MOIC_CANDIDATE_SOURCE_VERSION,
    },
    hasExplicitExitProbability,
    hasExplicitReserveExitMultiple,
    activationBlocksExitProbability,
    activationBlocksReserveExitMultiple,
  };
}

export function buildMoicRankingsFromInvestments(
  fundId: number,
  investments: MOICInvestment[]
): FundMoicRankingsResponseV1 {
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

export function buildMoicRankingSourcesFromCompanies(
  fundId: number,
  companies: PortfolioCompanyMoicSourceRow[]
): FundMoicRankingSources {
  const sortedCompanies = [...companies].sort((a, b) => a.id - b.id);
  const legacyInvestments = sortedCompanies.map(buildLegacyMoicInvestment);
  const candidateInputs = sortedCompanies.map(buildCandidateMoicInvestment);
  const candidateInvestments = candidateInputs.map((input) => input.investment);
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

  return {
    legacy: buildMoicRankingsFromInvestments(fundId, legacyInvestments),
    candidate: buildMoicRankingsFromInvestments(fundId, candidateInvestments),
    moicInputSummary,
    moicSourceInputHash,
  };
}

export async function getFundMoicRankingSources(
  fundId: number,
  database: FundMoicRankingDatabase = db
): Promise<FundMoicRankingSources> {
  const companies = await database.query.portfolioCompanies.findMany({
    where: (pc, { eq }) => eq(pc.fundId, fundId),
    orderBy: (pc, { asc }) => [asc(pc.id)],
  });

  return buildMoicRankingSourcesFromCompanies(fundId, companies);
}

export async function getFundMoicRankings(
  fundId: number,
  database: FundMoicRankingDatabase = db
): Promise<FundMoicRankingsResponseV1> {
  const sources = await getFundMoicRankingSources(fundId, database);
  return sources.legacy;
}
