import { and, asc, eq, inArray } from 'drizzle-orm';

import { db } from '../../db';
import {
  makeCurrencyBlockedProvenance,
  makeLiveRoundsProvenance,
  makePartialRoundsProvenance,
} from '../../lib/rounds-provenance';
import { isoDay, selectActiveValuationMarks } from '../lp-reporting/active-valuation-mark-selector';
import {
  buildRoundsToModelEvidenceFromRows,
  type RoundsEvidenceRows,
} from '../rounds-to-model-evidence-service';
import {
  FundCompanyActualsFactsResponseSchema,
  type FundCompanyActualsCurrencyStatus,
  type FundCompanyActualsFact,
  type FundCompanyActualsFactsResponse,
  type FundCompanyActualsPlanningFmvStatus,
} from '../../../shared/contracts/fund-actuals/fund-company-actuals-fact.contract';
import type {
  ProvenanceEnvelope,
  StructuredWarning,
  WarningCode,
} from '../../../shared/contracts/provenance-envelope.contract';
import { canonicalSha256 } from '../../../shared/lib/canonical-hash';
import { funds } from '../../../shared/schema/fund';
import { investmentRoundModelOverrides } from '../../../shared/schema/investment-round-model-overrides';
import { investmentRounds } from '../../../shared/schema/investment-rounds';
import { valuationMarks } from '../../../shared/schema/lp-reporting-evidence';
import { investments, portfolioCompanies } from '../../../shared/schema/portfolio';

export class FundActualsFactsServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'FundActualsFactsServiceError';
  }
}

export const PLANNING_FMV_STALE_AFTER_DAYS = 120;
// No repo-wide staleness day-count constant exists (verified 2026-07-06);
// this local constant is the policy source for planning FMV staleness.

type FundRow = { id: number; baseCurrency: string };
type CompanyRow = { id: number; fundId: number | null; name: string };
type InvestmentRow = { id: number; fundId: number | null; companyId: number | null };
type SecurityType = 'equity' | 'convertible_note' | 'safe' | 'warrant' | 'other';
type RoundRow = {
  id: number;
  fundId: number;
  investmentId: number;
  roundDate: string;
  createdAt: Date | null;
  securityType: SecurityType;
  currency: string;
  investmentAmount: string;
  preMoneyValuation: string | null;
  roundSize: string | null;
  supersedesRoundId: number | null;
};
type ActiveOverrideRow = {
  id: number;
  fundId: number;
  roundId: number;
  overrideRole: 'initial' | 'follow_on' | 'amount_only';
  supersedesOverrideId: number | null;
  createdAt: Date;
};
type PlanningMarkStatus = 'draft' | 'approved' | 'locked' | 'superseded' | 'reversed';
type PlanningMarkRow = {
  id: number;
  fundId: number;
  companyId: number;
  markDate: string;
  fairValue: string;
  currency: string;
  status: PlanningMarkStatus;
};
type SelectablePlanningMarkRow = PlanningMarkRow & {
  asOfDate: string;
  confidenceLevel: 'medium';
};

export interface BuildFundCompanyActualsFactsInput {
  fundId: number;
  asOfDate: string;
  now?: Date;
  database?: typeof db;
}

export type FundCompanyActualsFactsRows = {
  fund: FundRow;
  companies: CompanyRow[];
  investments: InvestmentRow[];
  allRounds: RoundRow[];
  activeOverrides: ActiveOverrideRow[];
  planningMarks: PlanningMarkRow[];
};

export interface BuildFundCompanyActualsFactsFromRowsInput {
  fundId: number;
  asOfDate: string;
  now: Date;
  rows: FundCompanyActualsFactsRows;
}

function zeroDecimal(): string {
  return '0.000000';
}

function warning(params: {
  code: WarningCode;
  severity: StructuredWarning['severity'];
  message: string;
  source?: string;
}): StructuredWarning {
  return params.source
    ? {
        code: params.code,
        severity: params.severity,
        message: params.message,
        source: params.source,
      }
    : {
        code: params.code,
        severity: params.severity,
        message: params.message,
      };
}

function isApprovedPlanningMark(mark: PlanningMarkRow): boolean {
  return mark.status === 'approved' || mark.status === 'locked';
}

function toSelectablePlanningMark(mark: PlanningMarkRow): SelectablePlanningMarkRow {
  return {
    ...mark,
    asOfDate: mark.markDate,
    confidenceLevel: 'medium',
  };
}

function toSourcePlanningMark(mark: SelectablePlanningMarkRow | undefined): PlanningMarkRow | null {
  if (!mark) {
    return null;
  }
  return {
    id: mark.id,
    fundId: mark.fundId,
    companyId: mark.companyId,
    markDate: isoDay(mark.markDate),
    fairValue: mark.fairValue,
    currency: mark.currency,
    status: mark.status,
  };
}

function sortById<T extends { id: number }>(rows: T[]): T[] {
  return [...rows].sort((left, right) => left.id - right.id);
}

function deriveActiveRounds(allRounds: RoundRow[]): RoundRow[] {
  const supersededRoundIds = new Set(
    allRounds
      .map((round) => round.supersedesRoundId)
      .filter((id): id is number => id !== null)
  );
  return allRounds
    .filter((round) => !supersededRoundIds.has(round.id))
    .sort((left, right) => {
      const investmentOrder = left.investmentId - right.investmentId;
      if (investmentOrder !== 0) {
        return investmentOrder;
      }
      const dateOrder = left.roundDate.localeCompare(right.roundDate);
      if (dateOrder !== 0) {
        return dateOrder;
      }
      const leftCreatedAt = left.createdAt?.getTime() ?? Number.NEGATIVE_INFINITY;
      const rightCreatedAt = right.createdAt?.getTime() ?? Number.NEGATIVE_INFINITY;
      if (leftCreatedAt !== rightCreatedAt) {
        return leftCreatedAt - rightCreatedAt;
      }
      return left.id - right.id;
    });
}

function toRoundsEvidenceRows(params: {
  fundId: number;
  fund: FundRow;
  companies: CompanyRow[];
  investments: InvestmentRow[];
  activeRounds: RoundRow[];
  activeOverrides: ActiveOverrideRow[];
}): RoundsEvidenceRows {
  return {
    fund: params.fund,
    companies: params.companies.map((company) => ({
      id: company.id,
      name: company.name,
    })),
    investments: params.investments,
    activeRounds: params.activeRounds.map((round) => ({
      id: round.id,
      fundId: round.fundId,
      investmentId: round.investmentId,
      roundDate: isoDay(round.roundDate),
      createdAt: round.createdAt,
      securityType: round.securityType,
      currency: round.currency,
      investmentAmount: round.investmentAmount,
    })),
    activeOverrides: params.activeOverrides,
  };
}

function isoDateParts(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay(value));
  if (!match) {
    throw new Error(`Invalid ISO date: ${value}`);
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function daysBetweenIsoDays(left: string, right: string): number {
  const leftParts = isoDateParts(left);
  const rightParts = isoDateParts(right);
  const leftUtc = Date.UTC(leftParts.year, leftParts.month - 1, leftParts.day);
  const rightUtc = Date.UTC(rightParts.year, rightParts.month - 1, rightParts.day);
  return Math.floor((leftUtc - rightUtc) / 86_400_000);
}

function latestActiveEquityRound(activeRounds: RoundRow[]): RoundRow | null {
  return activeRounds
    .filter((round) => round.securityType === 'equity')
    .reduce<RoundRow | null>((latest, candidate) => {
      if (!latest) {
        return candidate;
      }
      const dateOrder = candidate.roundDate.localeCompare(latest.roundDate);
      if (dateOrder > 0) {
        return candidate;
      }
      if (dateOrder === 0 && candidate.id > latest.id) {
        return candidate;
      }
      return latest;
    }, null);
}

function currencySummary(params: {
  baseCurrency: string;
  activeRounds: RoundRow[];
  selectedPlanningFmvMark: PlanningMarkRow | null;
}): { currency: string; currencyStatus: FundCompanyActualsCurrencyStatus } {
  const sourceCurrencies = [
    ...params.activeRounds.map((round) => round.currency),
    ...(params.selectedPlanningFmvMark ? [params.selectedPlanningFmvMark.currency] : []),
  ];
  const mismatched = sourceCurrencies.find((currency) => currency !== params.baseCurrency);
  if (mismatched) {
    return { currency: mismatched, currencyStatus: 'mismatch_blocked' };
  }
  if (sourceCurrencies.length === 0) {
    return { currency: params.baseCurrency, currencyStatus: 'unknown' };
  }
  return { currency: params.baseCurrency, currencyStatus: 'base_currency' };
}

function planningFmvSummary(params: {
  companyId: number;
  asOfDate: string;
  selectedPlanningFmvMark: PlanningMarkRow | null;
  currencyStatus: FundCompanyActualsCurrencyStatus;
}): {
  approvedPlanningFmvMarkId: number | null;
  latestPlanningFmvDate: string | null;
  latestPlanningFmvValue: string | null;
  planningFmvStatus: FundCompanyActualsPlanningFmvStatus;
  warnings: StructuredWarning[];
} {
  const warnings: StructuredWarning[] = [];
  const mark = params.selectedPlanningFmvMark;
  let status: FundCompanyActualsPlanningFmvStatus = 'none';

  if (!mark) {
    warnings.push(
      warning({
        code: 'PLANNING_FMV_MISSING',
        severity: 'warning',
        message: 'No approved planning FMV mark is available for this company.',
        source: `company:${params.companyId}`,
      })
    );
  } else if (daysBetweenIsoDays(params.asOfDate, isoDay(mark.markDate)) > PLANNING_FMV_STALE_AFTER_DAYS) {
    status = 'stale';
    warnings.push(
      warning({
        code: 'PLANNING_FMV_STALE',
        severity: 'warning',
        message: 'The approved planning FMV mark is stale for the requested as-of date.',
        source: `company:${params.companyId}`,
      })
    );
  } else {
    status = 'active';
  }

  if (params.currencyStatus === 'mismatch_blocked') {
    status = 'blocked';
  }

  return {
    approvedPlanningFmvMarkId: mark?.id ?? null,
    latestPlanningFmvDate: mark ? isoDay(mark.markDate) : null,
    latestPlanningFmvValue: mark?.fairValue ?? null,
    planningFmvStatus: status,
    warnings,
  };
}

function makeCompanyProvenance(params: {
  now: Date;
  fundId: number;
  baseCurrency: string;
  activeRounds: RoundRow[];
  activeOverrides: ActiveOverrideRow[];
  investments: InvestmentRow[];
  company: CompanyRow;
  warnings: StructuredWarning[];
  currencyStatus: FundCompanyActualsCurrencyStatus;
}): ProvenanceEnvelope {
  const hashParams = {
    fundId: params.fundId,
    baseCurrency: params.baseCurrency,
    activeRounds: params.activeRounds,
    activeOverrides: params.activeOverrides,
    parentInvestments: params.investments,
    companies: [params.company],
  };

  if (params.currencyStatus === 'mismatch_blocked') {
    return makeCurrencyBlockedProvenance({
      now: params.now,
      hashParams,
      structuredWarnings: params.warnings,
    });
  }
  if (
    params.warnings.some(
      (structuredWarning) =>
        structuredWarning.severity === 'warning' || structuredWarning.severity === 'blocking'
    )
  ) {
    return makePartialRoundsProvenance({
      now: params.now,
      hashParams,
      structuredWarnings: params.warnings,
    });
  }
  return makeLiveRoundsProvenance({
    now: params.now,
    hashParams,
    structuredWarnings: params.warnings,
  });
}

function companySort(left: CompanyRow, right: CompanyRow): number {
  const nameOrder = left.name.localeCompare(right.name);
  if (nameOrder !== 0) {
    return nameOrder;
  }
  return left.id - right.id;
}

export function buildFundCompanyActualsFactsFromRows(
  params: BuildFundCompanyActualsFactsFromRowsInput
): FundCompanyActualsFactsResponse {
  const fundCompanies = sortById(
    params.rows.companies.filter((company) => company.fundId === params.fundId)
  );
  const fundInvestments = sortById(
    params.rows.investments.filter((investment) => investment.fundId === params.fundId)
  );
  const fundRounds = sortById(
    params.rows.allRounds
      .filter((round) => round.fundId === params.fundId)
      .map((round) => ({ ...round, roundDate: isoDay(round.roundDate) }))
  );
  const activeOverrides = sortById(
    params.rows.activeOverrides.filter((override) => override.fundId === params.fundId)
  );
  const planningMarks = sortById(
    params.rows.planningMarks
      .filter((mark) => mark.fundId === params.fundId && isApprovedPlanningMark(mark))
      .map((mark) => ({ ...mark, markDate: isoDay(mark.markDate) }))
  );
  const activeRounds = deriveActiveRounds(fundRounds);
  const evidence = buildRoundsToModelEvidenceFromRows({
    fundId: params.fundId,
    now: params.now,
    rows: toRoundsEvidenceRows({
      fundId: params.fundId,
      fund: params.rows.fund,
      companies: fundCompanies,
      investments: fundInvestments,
      activeRounds,
      activeOverrides,
    }),
  });

  const selectedPlanningMarks = selectActiveValuationMarks(
    planningMarks.map(toSelectablePlanningMark),
    params.asOfDate
  ).active;
  const selectedPlanningMarksByCompany = new Map(
    selectedPlanningMarks.map((mark) => [mark.companyId, mark])
  );
  const investmentsByCompany = new Map<number, InvestmentRow[]>();
  for (const investment of fundInvestments) {
    if (investment.companyId === null) {
      continue;
    }
    const investmentsForCompany = investmentsByCompany.get(investment.companyId) ?? [];
    investmentsForCompany.push(investment);
    investmentsByCompany.set(investment.companyId, investmentsForCompany);
  }
  const investmentById = new Map(fundInvestments.map((investment) => [investment.id, investment]));
  const companyIdsWithActiveRounds = new Set<number>();
  for (const round of activeRounds) {
    const companyId = investmentById.get(round.investmentId)?.companyId;
    if (companyId !== null && companyId !== undefined) {
      companyIdsWithActiveRounds.add(companyId);
    }
  }

  const companiesForFacts = fundCompanies
    .filter(
      (company) =>
        (investmentsByCompany.get(company.id)?.length ?? 0) > 0 ||
        companyIdsWithActiveRounds.has(company.id) ||
        selectedPlanningMarksByCompany.has(company.id)
    )
    .sort(companySort);
  const evidenceByCompany = new Map(evidence.companies.map((company) => [company.companyId, company]));

  const facts: FundCompanyActualsFact[] = companiesForFacts.map((company) => {
    const companyInvestments = sortById(investmentsByCompany.get(company.id) ?? []);
    const companyInvestmentIds = new Set(companyInvestments.map((investment) => investment.id));
    const companyActiveSourceRounds = activeRounds.filter((round) =>
      companyInvestmentIds.has(round.investmentId)
    );
    const companyActiveRoundIds = companyActiveSourceRounds.map((round) => round.id);
    const companyAllRounds = fundRounds.filter((round) =>
      companyInvestmentIds.has(round.investmentId)
    );
    const companyOverrides = activeOverrides.filter((override) =>
      companyActiveRoundIds.includes(override.roundId)
    );
    const selectedPlanningFmvMark = toSourcePlanningMark(
      selectedPlanningMarksByCompany.get(company.id)
    );
    const evidenceCompany = evidenceByCompany.get(company.id);
    const latestEquityRound = latestActiveEquityRound(companyActiveSourceRounds);
    const { currency, currencyStatus } = currencySummary({
      baseCurrency: params.rows.fund.baseCurrency,
      activeRounds: companyActiveSourceRounds,
      selectedPlanningFmvMark,
    });
    const companyWarnings = [...(evidenceCompany?.warnings ?? [])];
    if (currencyStatus === 'mismatch_blocked') {
      companyWarnings.push(
        warning({
          code: 'CURRENCY_MISMATCH_BLOCK',
          severity: 'blocking',
          message: `Company ${company.id} has source currency that does not match fund base currency ${params.rows.fund.baseCurrency}.`,
          source: `company:${company.id}`,
        })
      );
    }
    const planning = planningFmvSummary({
      companyId: company.id,
      asOfDate: params.asOfDate,
      selectedPlanningFmvMark,
      currencyStatus,
    });
    companyWarnings.push(...planning.warnings);
    const provenance = makeCompanyProvenance({
      now: params.now,
      fundId: params.fundId,
      baseCurrency: params.rows.fund.baseCurrency,
      activeRounds: companyActiveSourceRounds,
      activeOverrides: companyOverrides,
      investments: companyInvestments,
      company,
      warnings: companyWarnings,
      currencyStatus,
    });

    return {
      fundId: params.fundId,
      companyId: company.id,
      companyName: company.name,
      investmentIds: companyInvestments.map((investment) => investment.id),
      activeRoundIds: [...companyActiveRoundIds].sort((left, right) => left - right),
      approvedPlanningFmvMarkId: planning.approvedPlanningFmvMarkId,
      planningFmvStatus: planning.planningFmvStatus,
      initialInvestmentAmount: evidenceCompany?.initialAmount ?? zeroDecimal(),
      followOnInvestmentAmount: evidenceCompany?.followOnAmount ?? zeroDecimal(),
      amountOnlyNonEquityAmount: evidenceCompany?.amountOnlyNonEquityAmount ?? zeroDecimal(),
      latestRoundDate: latestEquityRound ? isoDay(latestEquityRound.roundDate) : null,
      latestRoundValuation: latestEquityRound?.preMoneyValuation ?? null,
      latestPlanningFmvDate: planning.latestPlanningFmvDate,
      latestPlanningFmvValue: planning.latestPlanningFmvValue,
      currency,
      currencyStatus,
      supersedeLineage: companyAllRounds
        .map((round) => ({
          roundId: round.id,
          supersedesRoundId: round.supersedesRoundId,
        }))
        .sort((left, right) => left.roundId - right.roundId),
      warnings: companyWarnings,
      provenance,
      inputHash: canonicalSha256({
        fundId: params.fundId,
        companyId: company.id,
        asOfDate: params.asOfDate,
        baseCurrency: params.rows.fund.baseCurrency,
        activeRounds: companyActiveSourceRounds,
        selectedPlanningFmvMark,
        parentInvestments: companyInvestments,
      }),
    };
  });

  const selectedPlanningFmvMarks = facts
    .map((fact) => selectedPlanningMarksByCompany.get(fact.companyId))
    .map(toSourcePlanningMark)
    .filter((mark): mark is PlanningMarkRow => mark !== null)
    .sort((left, right) => {
      const companyOrder = left.companyId - right.companyId;
      if (companyOrder !== 0) {
        return companyOrder;
      }
      return left.id - right.id;
    });

  return FundCompanyActualsFactsResponseSchema.parse({
    fundId: params.fundId,
    asOfDate: params.asOfDate,
    facts,
    inputHash: canonicalSha256({
      fundId: params.fundId,
      asOfDate: params.asOfDate,
      baseCurrency: params.rows.fund.baseCurrency,
      activeRounds,
      selectedPlanningFmvMarks,
      parentInvestments: fundInvestments,
    }),
    generatedAt: params.now.toISOString(),
  });
}

export async function buildFundCompanyActualsFacts(
  input: BuildFundCompanyActualsFactsInput
): Promise<FundCompanyActualsFactsResponse> {
  const database = input.database ?? db;
  const now = input.now ?? new Date();

  const [fund] = await database
    .select({ id: funds.id, baseCurrency: funds.baseCurrency })
    .from(funds)
    .where(eq(funds.id, input.fundId))
    .limit(1);

  if (!fund) {
    throw new FundActualsFactsServiceError(
      404,
      'fund_not_found',
      `Fund ${input.fundId} was not found`
    );
  }

  const [companies, parentInvestments, allRounds, activeOverrides, planningMarks] =
    await Promise.all([
      database
        .select({
          id: portfolioCompanies.id,
          fundId: portfolioCompanies.fundId,
          name: portfolioCompanies.name,
        })
        .from(portfolioCompanies)
        .where(eq(portfolioCompanies.fundId, input.fundId))
        .orderBy(asc(portfolioCompanies.id)),
      database
        .select({
          id: investments.id,
          fundId: investments.fundId,
          companyId: investments.companyId,
        })
        .from(investments)
        .where(eq(investments.fundId, input.fundId))
        .orderBy(asc(investments.id)),
      database
        .select({
          id: investmentRounds.id,
          fundId: investmentRounds.fundId,
          investmentId: investmentRounds.investmentId,
          roundDate: investmentRounds.roundDate,
          createdAt: investmentRounds.createdAt,
          securityType: investmentRounds.securityType,
          currency: investmentRounds.currency,
          investmentAmount: investmentRounds.investmentAmount,
          preMoneyValuation: investmentRounds.preMoneyValuation,
          roundSize: investmentRounds.roundSize,
          supersedesRoundId: investmentRounds.supersedesRoundId,
        })
        .from(investmentRounds)
        .where(eq(investmentRounds.fundId, input.fundId))
        .orderBy(
          asc(investmentRounds.investmentId),
          asc(investmentRounds.roundDate),
          asc(investmentRounds.createdAt),
          asc(investmentRounds.id)
        ),
      database
        .select({
          id: investmentRoundModelOverrides.id,
          fundId: investmentRoundModelOverrides.fundId,
          roundId: investmentRoundModelOverrides.roundId,
          overrideRole: investmentRoundModelOverrides.overrideRole,
          supersedesOverrideId: investmentRoundModelOverrides.supersedesOverrideId,
          createdAt: investmentRoundModelOverrides.createdAt,
        })
        .from(investmentRoundModelOverrides)
        .where(eq(investmentRoundModelOverrides.fundId, input.fundId))
        .orderBy(
          asc(investmentRoundModelOverrides.roundId),
          asc(investmentRoundModelOverrides.createdAt),
          asc(investmentRoundModelOverrides.id)
        ),
      database
        .select({
          id: valuationMarks.id,
          fundId: valuationMarks.fundId,
          companyId: valuationMarks.companyId,
          markDate: valuationMarks.markDate,
          fairValue: valuationMarks.fairValue,
          currency: valuationMarks.currency,
          status: valuationMarks.status,
        })
        .from(valuationMarks)
        .where(
          and(
            eq(valuationMarks.fundId, input.fundId),
            eq(valuationMarks.importedFrom, 'planning_fmv_override'),
            inArray(valuationMarks.status, ['approved', 'locked'])
          )
        )
        .orderBy(asc(valuationMarks.companyId), asc(valuationMarks.markDate), asc(valuationMarks.id)),
    ]);

  return buildFundCompanyActualsFactsFromRows({
    fundId: input.fundId,
    asOfDate: input.asOfDate,
    now,
    rows: {
      fund,
      companies,
      investments: parentInvestments,
      allRounds: allRounds as RoundRow[],
      activeOverrides: activeOverrides as ActiveOverrideRow[],
      planningMarks: planningMarks as PlanningMarkRow[],
    },
  });
}
