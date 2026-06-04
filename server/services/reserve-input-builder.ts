import type { PoolClient } from 'pg';
import { db } from '../db';
import type { ReserveCompanyInput } from '@shared/types';

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

function investmentRowToPortfolio(row: InvestmentPortfolioRow): ReserveCompanyInput {
  return {
    id: row.company_id ?? row.id,
    invested: toNumber(row.amount),
    ownership: toNumber(row.ownership_percentage, 0.15),
    stage: row.round ?? 'seed',
    sector: row.sector ?? 'unknown',
  };
}

function companyRowToPortfolio(row: PortfolioCompanyRow): ReserveCompanyInput {
  return {
    id: row.id,
    invested: toNumber(row.investment_amount),
    ownership: 0.15,
    stage: row.stage ?? 'seed',
    sector: row.sector ?? 'unknown',
  };
}

export async function buildReservePortfolioInput(fundId: number): Promise<ReserveCompanyInput[]> {
  const investments = await db.query.investments.findMany({
    where: (inv, { eq }) => eq(inv.fundId, fundId),
    with: {
      company: true,
    },
  });

  if (investments.length > 0) {
    return investments.map((inv) => ({
      id: inv.companyId || inv.id,
      invested: toNumber(inv.amount),
      ownership: inv.ownershipPercentage ? toNumber(inv.ownershipPercentage) : 0.15,
      stage: inv.round || 'seed',
      sector: getInvestmentSector(inv),
    }));
  }

  const portfolioCompanies = await db.query.portfolioCompanies.findMany({
    where: (companies, { eq }) => eq(companies.fundId, fundId),
  });

  return portfolioCompanies.map((company) => ({
    id: company.id,
    invested: toNumber(company.investmentAmount),
    ownership: 0.15,
    stage: company.stage,
    sector: company.sector,
  }));
}

export async function buildReservePortfolioInputForClient(
  client: PoolClient,
  fundId: number
): Promise<ReserveCompanyInput[]> {
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
    return investments.rows.map(investmentRowToPortfolio);
  }

  const companies = await client.query<PortfolioCompanyRow>(
    `SELECT id, investment_amount, stage, sector
       FROM portfoliocompanies
      WHERE fund_id = $1
      ORDER BY id ASC`,
    [fundId]
  );

  return companies.rows.map(companyRowToPortfolio);
}
