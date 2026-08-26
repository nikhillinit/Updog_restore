import { Decimal, sum, toDecimal } from '@shared/lib/decimal-utils';
import { canonicalSha256 } from '@shared/lib/canonical-hash';
import { isExitedStatus } from '@shared/lib/company-status';
import {
  PortfolioOverviewResponseV1Schema,
  type PortfolioOverviewCompany,
  type PortfolioOverviewResponseV1,
} from '@shared/contracts/portfolio-overview-v1.contract';

import { NotFoundError } from '../errors';
import { storage } from '../storage';
import { portfolioTimeMachineReadService } from './portfolio-time-machine-read';

/**
 * Server-side portfolio overview aggregator.
 *
 * Owns the financial math that previously lived in the client
 * (`OverviewTab.tsx`): per-company MOIC, portfolio totals, simple-average MOIC,
 * and return percent. All arithmetic uses Decimal.js; the result is carried
 * under the canonical #910 `FinancialProvenance` so the client can render it as
 * trusted output and fail closed when provenance is absent.
 *
 * The fund's resolved company set (live or historical `asOf`) is read through
 * `portfolioTimeMachineReadService.listCompanies`, the same resolver the
 * companies table uses, so the overview KPIs always match that table.
 */

const ENGINE = 'portfolio-overview';
const ENGINE_VERSION = 'portfolio-overview-service@1';
const CALCULATION_VERSION = 'portfolio_overview_metrics_v1';
const SOURCE_ROUTE = 'GET /api/portfolio-overview';
const EXITED_STATUSES = ['exited', 'closed', 'liquidated'] as const;

export interface GetPortfolioOverviewOptions {
  asOf?: Date;
  requestedAsOf?: string;
  /** Injectable clock for deterministic tests. */
  now?: Date;
}

export async function getPortfolioOverview(
  fundId: number,
  options: GetPortfolioOverviewOptions = {}
): Promise<PortfolioOverviewResponseV1> {
  // Resolve the fund first; never emit provenance-bearing output for a fund
  // that does not exist, and never fall back to a default currency.
  const fund = await storage.getFund(fundId);
  if (!fund) {
    throw new NotFoundError(`Fund ${fundId} not found`);
  }
  const currency = fund.baseCurrency ?? 'USD';
  const generatedAt = (options.now ?? new Date()).toISOString();

  const { companies, meta } = await portfolioTimeMachineReadService.listCompanies(fundId, {
    ...(options.asOf ? { asOf: options.asOf } : {}),
    ...(options.requestedAsOf ? { requestedAsOf: options.requestedAsOf } : {}),
  });

  const computed = companies.map((company) => {
    const invested = toDecimal(company.investmentAmount ?? '0');
    const companyValuation =
      company.currentValuation == null ? new Decimal(0) : toDecimal(company.currentValuation);
    const ownership =
      company.ownershipCurrentPct == null ? null : toDecimal(company.ownershipCurrentPct);
    const currentValue =
      ownership != null && ownership.gt(0) ? companyValuation.times(ownership) : companyValuation;
    // Preserve the original client guard: MOIC is 0 unless a positive amount was invested.
    const moic = invested.lte(0) ? new Decimal(0) : currentValue.dividedBy(invested);
    return { company, invested, currentValue, moic };
  });

  const rows: PortfolioOverviewCompany[] = computed.map(
    ({ company, invested, currentValue, moic }) => ({
      id: company.id,
      name: company.name,
      sector: company.sector,
      stage: company.currentStage ?? company.stage,
      status: company.status,
      invested: invested.toFixed(),
      currentValue: currentValue.toFixed(),
      moic: moic.toFixed(),
    })
  );

  const companyCount = computed.length;
  const totalInvested = sum(computed.map((entry) => entry.invested));
  const totalValue = sum(computed.map((entry) => entry.currentValue));
  const sumMoic = sum(computed.map((entry) => entry.moic));
  const averageMOIC = companyCount > 0 ? sumMoic.dividedBy(companyCount) : new Decimal(0);
  const returnPct = totalInvested.lte(0)
    ? new Decimal(0)
    : totalValue.minus(totalInvested).dividedBy(totalInvested).times(100);
  const exitedCompanies = companies.filter((company) => isExitedStatus(company.status)).length;
  const activeCompanies = companyCount - exitedCompanies;

  // Deterministic input hash: sort by company id and include only
  // metric-affecting fields plus the full resolver meta so live vs snapshot vs
  // empty-historical states hash differently (canonicalSha256 preserves array
  // order, hence the explicit sort).
  const hashCompanies = computed
    .map(({ company }) => ({
      id: company.id,
      investmentAmount: company.investmentAmount ?? null,
      currentValuation: company.currentValuation ?? null,
      ownershipCurrentPct: company.ownershipCurrentPct ?? null,
      status: company.status,
    }))
    .sort((left, right) => left.id - right.id);

  const inputHash = canonicalSha256({ fundId, currency, companies: hashCompanies, meta });
  const assumptionsHash = canonicalSha256({
    calculationVersion: CALCULATION_VERSION,
    averageMoicBasis: 'simple_average_of_per_company_moic',
    positionValueBasis: 'ownership_current_pct_times_current_valuation_when_present',
    zeroInvestedGuard: 'moic_zero_when_investment_amount_le_0',
    zeroCompanyGuard: 'average_zero_when_no_companies',
    exitedStatuses: EXITED_STATUSES,
  });

  return PortfolioOverviewResponseV1Schema.parse({
    fundId,
    generatedAt,
    currency,
    provenance: {
      sourceKind: 'computed',
      actionability: 'actionable',
      isFinanciallyActionable: true,
      sourceEngine: ENGINE,
      engineVersion: ENGINE_VERSION,
      calculationVersion: CALCULATION_VERSION,
      sourceRoute: SOURCE_ROUTE,
      inputHash,
      assumptionsHash,
      generatedAt,
      warnings: ['currentValuation may include user-entered marks or assumptions'],
    },
    sourceRecordCounts: { companies: companyCount },
    metrics: {
      totalInvested: totalInvested.toFixed(),
      totalValue: totalValue.toFixed(),
      averageMOIC: averageMOIC.toFixed(),
      returnPct: returnPct.toFixed(),
      totalCompanies: companyCount,
      activeCompanies,
      exitedCompanies,
    },
    companies: rows,
    meta,
  });
}
