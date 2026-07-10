import type { PoolClient } from 'pg';
import { db } from '../db';
import type { ReserveCompanyInput } from '@shared/types';
import type {
  ReserveCompanyInputWithProvenance,
  ReserveInputTrustSummary,
} from '../../shared/contracts/reserve-input-provenance.contract';

interface InvestmentPortfolioRow {
  id: number;
  company_id: number | null;
  amount: string | number;
  ownership_percentage: string | number | null;
  round: string | null;
  sector: string | null;
}

interface PortfolioCompanyRow {
  id: number;
  investment_amount: string | number | null;
  stage: string | null;
  sector: string | null;
}

function getInvestmentSector(investment: { company?: { sector?: string | null } | null }): string {
  return investment.company?.sector ?? 'unknown';
}

function toNumber(value: string | number | null | undefined, fallback = 0): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export interface ReservePortfolioInputWithTrust {
  portfolio: ReserveCompanyInput[];
  provenancePortfolio: ReserveCompanyInputWithProvenance[];
  reserveInputTrustSummary: ReserveInputTrustSummary;
}

export function buildReservePortfolioInputWithProvenanceFromRows(input: {
  investments: InvestmentPortfolioRow[];
  companies: PortfolioCompanyRow[];
}): ReserveCompanyInputWithProvenance[] {
  if (input.investments.length > 0) {
    return input.investments.map(investmentRowToPortfolioWithProvenance);
  }
  return input.companies.map(companyRowToPortfolioWithProvenance);
}

export function buildReserveInputTrustSummary(
  portfolio: ReserveCompanyInputWithProvenance[]
): ReserveInputTrustSummary {
  const fields = portfolio.flatMap((company) => Object.entries(company.provenance));
  const defaultedFields = fields
    .filter(([, provenance]) => provenance.status === 'defaulted')
    .map(([field]) => field as 'invested' | 'ownership' | 'stage' | 'sector');
  const unavailableFields = fields
    .filter(([, provenance]) => provenance.status === 'unavailable')
    .map(([field]) => field as 'invested' | 'ownership' | 'stage' | 'sector');

  return {
    trustedForActivation: defaultedFields.length === 0 && unavailableFields.length === 0,
    defaultedInputCount: defaultedFields.length,
    unavailableInputCount: unavailableFields.length,
    defaultedFields: [...new Set(defaultedFields)].sort(),
    unavailableFields: [...new Set(unavailableFields)].sort(),
  };
}

function fieldProvenance(
  status: 'observed' | 'approved_assumption' | 'estimated' | 'defaulted' | 'unavailable',
  source: string,
  reason: string | null
) {
  return { status, source, reason };
}

function investmentRowToPortfolioWithProvenance(
  row: InvestmentPortfolioRow
): ReserveCompanyInputWithProvenance {
  const ownershipMissing = row.ownership_percentage == null;
  const stageMissing = row.round == null || row.round.trim().length === 0;
  const sectorMissing = row.sector == null || row.sector.trim().length === 0;

  return {
    id: row.company_id ?? row.id,
    invested: toNumber(row.amount),
    ownership: ownershipMissing ? 0.15 : toNumber(row.ownership_percentage),
    stage: row.round != null && row.round.trim().length > 0 ? row.round : 'seed',
    sector: row.sector != null && row.sector.trim().length > 0 ? row.sector : 'unknown',
    provenance: {
      invested: fieldProvenance('observed', 'investments.amount', null),
      ownership: ownershipMissing
        ? fieldProvenance('defaulted', 'system_default_ownership', 'Missing ownership percentage uses 0.15 legacy default')
        : fieldProvenance('observed', 'investments.ownership_percentage', null),
      stage: stageMissing
        ? fieldProvenance('defaulted', 'system_default_stage', 'Missing round uses seed legacy default')
        : fieldProvenance('observed', 'investments.round', null),
      sector: sectorMissing
        ? fieldProvenance('defaulted', 'system_default_sector', 'Missing sector uses unknown legacy default')
        : fieldProvenance('observed', 'portfolio_companies.sector', null),
    },
  };
}

function companyRowToPortfolioWithProvenance(
  row: PortfolioCompanyRow
): ReserveCompanyInputWithProvenance {
  const investedMissing = row.investment_amount == null;
  const stageMissing = row.stage == null || row.stage.trim().length === 0;
  const sectorMissing = row.sector == null || row.sector.trim().length === 0;

  return {
    id: row.id,
    invested: toNumber(row.investment_amount),
    ownership: 0.15,
    stage: row.stage != null && row.stage.trim().length > 0 ? row.stage : 'seed',
    sector: row.sector != null && row.sector.trim().length > 0 ? row.sector : 'unknown',
    provenance: {
      invested: investedMissing
        ? fieldProvenance('defaulted', 'system_default_invested', 'Missing investment amount uses 0 legacy default')
        : fieldProvenance('observed', 'portfolio_companies.investment_amount', null),
      ownership: fieldProvenance('defaulted', 'system_default_ownership', 'portfolioCompanies rows do not provide actuals-grade ownership; legacy fallback is 0.15'),
      stage: stageMissing
        ? fieldProvenance('defaulted', 'system_default_stage', 'Missing stage uses seed legacy default')
        : fieldProvenance('observed', 'portfolio_companies.stage', null),
      sector: sectorMissing
        ? fieldProvenance('defaulted', 'system_default_sector', 'Missing sector uses unknown legacy default')
        : fieldProvenance('observed', 'portfolio_companies.sector', null),
    },
  };
}

function toLegacyReservePortfolio(
  provenancePortfolio: ReserveCompanyInputWithProvenance[]
): ReserveCompanyInput[] {
  return provenancePortfolio.map(({ id, invested, ownership, stage, sector }) => ({
    id,
    invested,
    ownership,
    stage,
    sector,
  }));
}

function buildReservePortfolioInputWithTrustFromRows(input: {
  investments: InvestmentPortfolioRow[];
  companies: PortfolioCompanyRow[];
}): ReservePortfolioInputWithTrust {
  const provenancePortfolio = buildReservePortfolioInputWithProvenanceFromRows(input);
  return {
    portfolio: toLegacyReservePortfolio(provenancePortfolio),
    provenancePortfolio,
    reserveInputTrustSummary: buildReserveInputTrustSummary(provenancePortfolio),
  };
}

export async function buildReservePortfolioInputWithProvenance(
  fundId: number
): Promise<ReservePortfolioInputWithTrust> {
  const investments = await db.query.investments.findMany({
    where: (inv, { eq }) => eq(inv.fundId, fundId),
    with: { company: true },
  });

  if (investments.length > 0) {
    return buildReservePortfolioInputWithTrustFromRows({
      investments: investments.map((inv) => ({
        id: inv.id,
        company_id: inv.companyId ?? null,
        amount: inv.amount,
        ownership_percentage: inv.ownershipPercentage ?? null,
        round: inv.round ?? null,
        sector: getInvestmentSector(inv),
      })),
      companies: [],
    });
  }

  const portfolioCompanies = await db.query.portfolioCompanies.findMany({
    where: (companies, { eq }) => eq(companies.fundId, fundId),
  });

  return buildReservePortfolioInputWithTrustFromRows({
    investments: [],
    companies: portfolioCompanies.map((company) => ({
      id: company.id,
      investment_amount: company.investmentAmount,
      stage: company.stage,
      sector: company.sector,
    })),
  });
}

export async function buildReservePortfolioInput(fundId: number): Promise<ReserveCompanyInput[]> {
  return (await buildReservePortfolioInputWithProvenance(fundId)).portfolio;
}

export async function buildReservePortfolioInputForClientWithProvenance(
  client: PoolClient,
  fundId: number
): Promise<ReservePortfolioInputWithTrust> {
  const investments = await client.query<InvestmentPortfolioRow>(
    `SELECT
       i.id,
       i.company_id,
       i.amount,
       i.ownership_percentage,
       i.round,
       pc.sector
     FROM investments i
     LEFT JOIN portfoliocompanies pc ON pc.id = i.company_id
     WHERE i.fund_id = $1
     ORDER BY COALESCE(i.company_id, i.id), i.id`,
    [fundId]
  );

  if (investments.rows.length > 0) {
    return buildReservePortfolioInputWithTrustFromRows({
      investments: investments.rows,
      companies: [],
    });
  }

  const companies = await client.query<PortfolioCompanyRow>(
    `SELECT id, investment_amount, stage, sector
       FROM portfoliocompanies
      WHERE fund_id = $1
      ORDER BY id ASC`,
    [fundId]
  );

  return buildReservePortfolioInputWithTrustFromRows({
    investments: [],
    companies: companies.rows,
  });
}

export async function buildReservePortfolioInputForClient(
  client: PoolClient,
  fundId: number
): Promise<ReserveCompanyInput[]> {
  return (await buildReservePortfolioInputForClientWithProvenance(client, fundId)).portfolio;
}
