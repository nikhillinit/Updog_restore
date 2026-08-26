import { and, asc, eq, notExists } from 'drizzle-orm';
import { aliasedTable } from 'drizzle-orm/alias';

import { db } from '../db';
import {
  serializeRoundsToModelEvidence,
  type RoundModelRole,
  type RoundsToModelEvidence,
} from '../../shared/contracts/rounds-to-model-evidence.contract';
import type {
  StructuredWarning,
  WarningCode,
} from '../../shared/contracts/provenance-envelope.contract';
import { funds } from '../../shared/schema/fund';
import { investmentRoundModelOverrides } from '../../shared/schema/investment-round-model-overrides';
import { investmentRounds } from '../../shared/schema/investment-rounds';
import { investments, portfolioCompanies } from '../../shared/schema/portfolio';
import {
  makeAdapterFailedProvenance,
  makeCurrencyBlockedProvenance,
  makeLiveRoundsProvenance,
  makePartialRoundsProvenance,
} from '../lib/rounds-provenance';

type FundRow = { id: number; baseCurrency: string };
type CompanyRow = { id: number; name: string };
type InvestmentRow = { id: number; fundId: number | null; companyId: number | null };
type SecurityType = 'equity' | 'convertible_note' | 'safe' | 'warrant' | 'other';
type ActiveRoundRow = {
  id: number;
  fundId: number;
  investmentId: number;
  roundDate: string;
  createdAt: Date | null;
  securityType: SecurityType;
  currency: string;
  investmentAmount: string;
};
type ActiveOverrideRow = {
  id: number;
  fundId: number;
  roundId: number;
  overrideRole: 'initial' | 'follow_on' | 'amount_only';
  supersedesOverrideId: number | null;
  createdAt: Date;
};

export type RoundsEvidenceRows = {
  fund: FundRow;
  companies: CompanyRow[];
  investments: InvestmentRow[];
  activeRounds: ActiveRoundRow[];
  activeOverrides: ActiveOverrideRow[];
};

type BuildParams = {
  fundId: number;
  now: Date;
  rows: RoundsEvidenceRows;
};

type CompanyAccumulator = {
  companyId: number;
  companyName: string;
  investmentIds: Set<number>;
  initialAmount: string;
  followOnAmount: string;
  amountOnlyNonEquityAmount: string;
  rounds: RoundsToModelEvidence['companies'][number]['rounds'];
  warnings: StructuredWarning[];
};

function decimalAdd(left: string, right: string): string {
  const scale = 6;
  const [leftWhole = '0', leftFraction = ''] = left.split('.');
  const [rightWhole = '0', rightFraction = ''] = right.split('.');
  const leftUnits = BigInt(leftWhole) * 1_000_000n + BigInt(leftFraction.padEnd(scale, '0'));
  const rightUnits = BigInt(rightWhole) * 1_000_000n + BigInt(rightFraction.padEnd(scale, '0'));
  const sum = leftUnits + rightUnits;
  return `${sum / 1_000_000n}.${(sum % 1_000_000n).toString().padStart(scale, '0')}`;
}

function zeroDecimal(): string {
  return '0.000000';
}

function validateOverrideLineage(overrides: ActiveOverrideRow[]): void {
  const byId = new Map(overrides.map((override) => [override.id, override]));
  for (const override of overrides) {
    if (override.supersedesOverrideId === null) {
      continue;
    }
    const parent = byId.get(override.supersedesOverrideId);
    if (!parent) {
      continue;
    }
    if (parent.fundId !== override.fundId || parent.roundId !== override.roundId) {
      throw new Error('Override lineage crosses fund-round boundaries');
    }
  }
}

function latestOverrideByRound(overrides: ActiveOverrideRow[]): Map<number, ActiveOverrideRow> {
  validateOverrideLineage(overrides);
  const superseded = new Set(
    overrides
      .map((override) => override.supersedesOverrideId)
      .filter((id): id is number => id !== null)
  );
  const byRound = new Map<number, ActiveOverrideRow>();
  for (const override of overrides.filter((candidate) => !superseded.has(candidate.id))) {
    if (byRound.has(override.roundId)) {
      throw new Error(`Multiple active overrides for round ${override.roundId}`);
    }
    byRound.set(override.roundId, override);
  }
  return byRound;
}

function filterOverridesToActiveRounds(params: {
  overrides: ActiveOverrideRow[];
  activeRounds: ActiveRoundRow[];
}): ActiveOverrideRow[] {
  const activeRoundIds = new Set(params.activeRounds.map((round) => round.id));
  return params.overrides.filter((override) => activeRoundIds.has(override.roundId));
}

function defaultEquityRole(
  indexWithinInvestment: number
): Extract<RoundModelRole, 'initial' | 'follow_on'> {
  return indexWithinInvestment === 0 ? 'initial' : 'follow_on';
}

function roleForRound(params: {
  round: ActiveRoundRow;
  indexWithinInvestment: number;
  override: ActiveOverrideRow | undefined;
}): RoundModelRole {
  if (params.override) {
    return params.override.overrideRole;
  }
  if (params.round.securityType !== 'equity') {
    return 'amount_only';
  }
  return defaultEquityRole(params.indexWithinInvestment);
}

function addWarning(params: {
  warnings: StructuredWarning[];
  code: WarningCode;
  severity: StructuredWarning['severity'];
  message: string;
  source?: string;
}): StructuredWarning {
  const warning = params.source
    ? {
        code: params.code,
        severity: params.severity,
        message: params.message,
        source: params.source,
      }
    : { code: params.code, severity: params.severity, message: params.message };
  params.warnings.push(warning);
  return warning;
}

function accumulateModelAmount(params: {
  company: CompanyAccumulator;
  round: ActiveRoundRow;
  role: RoundModelRole;
  amountOnly: boolean;
}): void {
  if (params.amountOnly) {
    return;
  }
  if (params.role === 'initial') {
    params.company.initialAmount = decimalAdd(
      params.company.initialAmount,
      params.round.investmentAmount
    );
  } else if (params.role === 'follow_on') {
    params.company.followOnAmount = decimalAdd(
      params.company.followOnAmount,
      params.round.investmentAmount
    );
  }
}

function createdAtTimestamp(createdAt: Date | null): number {
  if (!createdAt) {
    return Number.NEGATIVE_INFINITY;
  }
  const timestamp = createdAt.getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function compareCreatedAt(left: Date | null, right: Date | null): number {
  const leftTimestamp = createdAtTimestamp(left);
  const rightTimestamp = createdAtTimestamp(right);
  if (leftTimestamp < rightTimestamp) {
    return -1;
  }
  if (leftTimestamp > rightTimestamp) {
    return 1;
  }
  return 0;
}

export function buildRoundsToModelEvidenceFromRows(params: BuildParams): RoundsToModelEvidence {
  const warnings: StructuredWarning[] = [];
  const activeOverrides = filterOverridesToActiveRounds({
    overrides: params.rows.activeOverrides,
    activeRounds: params.rows.activeRounds,
  });
  const byCompany = new Map(params.rows.companies.map((company) => [company.id, company]));
  const byInvestment = new Map(
    params.rows.investments
      .filter((investment) => investment.fundId === params.fundId)
      .map((investment) => [investment.id, investment])
  );
  const overridesByRound = latestOverrideByRound(activeOverrides);
  const roundsByInvestment = new Map<number, ActiveRoundRow[]>();

  for (const round of params.rows.activeRounds) {
    const rounds = roundsByInvestment.get(round.investmentId) ?? [];
    rounds.push(round);
    roundsByInvestment.set(round.investmentId, rounds);
  }

  const companyEvidence = new Map<number, CompanyAccumulator>();
  let currencyBlocked = false;

  for (const [investmentId, roundsForInvestment] of roundsByInvestment) {
    roundsForInvestment.sort((left, right) => {
      const dateOrder = left.roundDate.localeCompare(right.roundDate);
      if (dateOrder !== 0) {
        return dateOrder;
      }
      const createdOrder = compareCreatedAt(left.createdAt, right.createdAt);
      if (createdOrder !== 0) {
        return createdOrder;
      }
      return left.id - right.id;
    });

    const investment = byInvestment.get(investmentId);
    if (!investment?.companyId) {
      addWarning({
        warnings,
        code: 'ROLE_CLASSIFICATION_AMBIGUOUS',
        severity: 'warning',
        message: `Investment ${investmentId} has no parent company.`,
        source: `investment:${investmentId}`,
      });
      continue;
    }
    const company = byCompany.get(investment.companyId);
    if (!company) {
      addWarning({
        warnings,
        code: 'ROLE_CLASSIFICATION_AMBIGUOUS',
        severity: 'warning',
        message: `Company ${investment.companyId} was not loaded for investment ${investmentId}.`,
        source: `investment:${investmentId}`,
      });
      continue;
    }

    const evidence =
      companyEvidence.get(company.id) ??
      ({
        companyId: company.id,
        companyName: company.name,
        investmentIds: new Set<number>(),
        initialAmount: zeroDecimal(),
        followOnAmount: zeroDecimal(),
        amountOnlyNonEquityAmount: zeroDecimal(),
        rounds: [],
        warnings: [],
      } satisfies CompanyAccumulator);
    evidence.investmentIds.add(investmentId);

    roundsForInvestment.forEach((round, indexWithinInvestment) => {
      const override = overridesByRound.get(round.id);
      const role = roleForRound({ round, indexWithinInvestment, override });
      const amountOnly = role === 'amount_only' || round.securityType !== 'equity';

      if (round.currency !== params.rows.fund.baseCurrency) {
        currencyBlocked = true;
        addWarning({
          warnings,
          code: 'CURRENCY_MISMATCH_BLOCK',
          severity: 'blocking',
          message: `Round ${round.id} currency ${round.currency} does not match fund base currency ${params.rows.fund.baseCurrency}.`,
          source: `round:${round.id}`,
        });
      }

      if (override) {
        addWarning({
          warnings,
          code: 'ROUND_MODEL_OVERRIDE_APPLIED',
          severity: 'info',
          message: `Override ${override.id} applied to round ${round.id}.`,
          source: `round:${round.id}`,
        });
      }

      if (amountOnly) {
        const warning = addWarning({
          warnings,
          code: 'NON_EQUITY_AMOUNT_ONLY',
          severity: 'warning',
          message: `Round ${round.id} is ${round.securityType} and contributes amount-only evidence.`,
          source: `round:${round.id}`,
        });
        evidence.warnings.push(warning);
        evidence.amountOnlyNonEquityAmount = decimalAdd(
          evidence.amountOnlyNonEquityAmount,
          round.investmentAmount
        );
      }

      accumulateModelAmount({ company: evidence, round, role, amountOnly });
      evidence.rounds.push({
        roundId: round.id,
        investmentId: round.investmentId,
        companyId: company.id,
        roundDate: round.roundDate,
        securityType: round.securityType,
        role,
        currency: round.currency,
        investmentAmount: round.investmentAmount,
        amountOnly,
        overrideApplied: Boolean(override),
      });
    });

    companyEvidence.set(company.id, evidence);
  }

  if (params.rows.activeRounds.length === 0) {
    addWarning({
      warnings,
      code: 'EMPTY_FUND',
      severity: 'info',
      message: 'No active investment rounds were found.',
    });
  }

  const warningsByCode = warnings.reduce<Record<WarningCode, number>>(
    (record, warning) => ({
      ...record,
      [warning.code]: (record[warning.code] ?? 0) + 1,
    }),
    {} as Record<WarningCode, number>
  );
  const hashParams = {
    fundId: params.fundId,
    baseCurrency: params.rows.fund.baseCurrency,
    activeRounds: params.rows.activeRounds,
    activeOverrides,
    parentInvestments: params.rows.investments,
    companies: params.rows.companies,
  };
  const provenance = currencyBlocked
    ? makeCurrencyBlockedProvenance({ now: params.now, hashParams, structuredWarnings: warnings })
    : warnings.some((warning) => warning.severity === 'warning' || warning.severity === 'blocking')
      ? makePartialRoundsProvenance({ now: params.now, hashParams, structuredWarnings: warnings })
      : makeLiveRoundsProvenance({ now: params.now, hashParams, structuredWarnings: warnings });

  return serializeRoundsToModelEvidence({
    fundId: params.fundId,
    baseCurrency: params.rows.fund.baseCurrency,
    generatedAt: params.now.toISOString(),
    companies: Array.from(companyEvidence.values()).map((company) => ({
      companyId: company.companyId,
      companyName: company.companyName,
      investmentIds: Array.from(company.investmentIds).sort((left, right) => left - right),
      initialAmount: company.initialAmount,
      followOnAmount: company.followOnAmount,
      amountOnlyNonEquityAmount: company.amountOnlyNonEquityAmount,
      roundCount: company.rounds.length,
      rounds: company.rounds,
      warnings: company.warnings,
    })),
    coverage: {
      companyCount: companyEvidence.size,
      investmentCount: params.rows.investments.length,
      activeRoundCount: params.rows.activeRounds.length,
      activeOverrideCount: activeOverrides.length,
      warningsByCode,
    },
    provenance,
  });
}

const supersedingRounds = aliasedTable(investmentRounds, 'rounds_to_model_superseding_rounds');

export async function buildRoundsToModelEvidence(params: {
  fundId: number;
  now?: Date;
  database?: typeof db;
}): Promise<RoundsToModelEvidence> {
  const database = params.database ?? db;
  const now = params.now ?? new Date();

  try {
    const [fund] = await database
      .select({ id: funds.id, baseCurrency: funds.baseCurrency })
      .from(funds)
      .where(eq(funds.id, params.fundId))
      .limit(1);
    if (!fund) {
      throw new Error(`Fund ${params.fundId} was not found`);
    }

    const companies = await database
      .select({ id: portfolioCompanies.id, name: portfolioCompanies.name })
      .from(portfolioCompanies)
      .where(eq(portfolioCompanies.fundId, params.fundId))
      .orderBy(asc(portfolioCompanies.id));
    const parentInvestments = await database
      .select({
        id: investments.id,
        fundId: investments.fundId,
        companyId: investments.companyId,
      })
      .from(investments)
      .where(eq(investments.fundId, params.fundId))
      .orderBy(asc(investments.id));
    const activeRounds = await database
      .select({
        id: investmentRounds.id,
        fundId: investmentRounds.fundId,
        investmentId: investmentRounds.investmentId,
        roundDate: investmentRounds.roundDate,
        createdAt: investmentRounds.createdAt,
        securityType: investmentRounds.securityType,
        currency: investmentRounds.currency,
        investmentAmount: investmentRounds.investmentAmount,
      })
      .from(investmentRounds)
      .where(
        and(
          eq(investmentRounds.fundId, params.fundId),
          notExists(
            database
              .select({ id: supersedingRounds.id })
              .from(supersedingRounds)
              .where(eq(supersedingRounds.supersedesRoundId, investmentRounds.id))
          )
        )
      )
      .orderBy(
        asc(investmentRounds.investmentId),
        asc(investmentRounds.roundDate),
        asc(investmentRounds.createdAt),
        asc(investmentRounds.id)
      );
    const activeOverrides = await database
      .select({
        id: investmentRoundModelOverrides.id,
        fundId: investmentRoundModelOverrides.fundId,
        roundId: investmentRoundModelOverrides.roundId,
        overrideRole: investmentRoundModelOverrides.overrideRole,
        supersedesOverrideId: investmentRoundModelOverrides.supersedesOverrideId,
        createdAt: investmentRoundModelOverrides.createdAt,
      })
      .from(investmentRoundModelOverrides)
      .innerJoin(
        investmentRounds,
        and(
          eq(investmentRoundModelOverrides.roundId, investmentRounds.id),
          eq(investmentRoundModelOverrides.fundId, investmentRounds.fundId)
        )
      )
      .where(
        and(
          eq(investmentRoundModelOverrides.fundId, params.fundId),
          notExists(
            database
              .select({ id: supersedingRounds.id })
              .from(supersedingRounds)
              .where(eq(supersedingRounds.supersedesRoundId, investmentRounds.id))
          )
        )
      )
      .orderBy(
        asc(investmentRoundModelOverrides.roundId),
        asc(investmentRoundModelOverrides.createdAt),
        asc(investmentRoundModelOverrides.id)
      );

    return buildRoundsToModelEvidenceFromRows({
      fundId: params.fundId,
      now,
      rows: {
        fund,
        companies,
        investments: parentInvestments,
        activeRounds: activeRounds as ActiveRoundRow[],
        activeOverrides: activeOverrides as ActiveOverrideRow[],
      },
    });
  } catch (error) {
    return serializeRoundsToModelEvidence({
      fundId: params.fundId,
      baseCurrency: 'USD',
      generatedAt: now.toISOString(),
      companies: [],
      coverage: {
        companyCount: 0,
        investmentCount: 0,
        activeRoundCount: 0,
        activeOverrideCount: 0,
        warningsByCode: { ROUND_ADAPTER_FAILED: 1 },
      },
      provenance: makeAdapterFailedProvenance({
        now,
        message: error instanceof Error ? error.message : 'Rounds-to-model adapter failed',
      }),
    });
  }
}
