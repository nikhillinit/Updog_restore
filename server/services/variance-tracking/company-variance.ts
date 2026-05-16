import { Decimal, toDecimal } from '@shared/lib/decimal-utils';
import type { CompanyVarianceRow } from '@shared/variance-validation';

export interface InvestmentAmountLike {
  amount?: string | number | null;
}

export interface CurrentCompanyLike {
  id: number;
  name: string;
  sector: string;
  stage?: string | null;
  status?: string | null;
  currentValuation?: string | number | null;
  investments?: InvestmentAmountLike[] | null;
}

export interface BaselineCompanySnapshot {
  portfolioCompanyId: number;
  companyId: number;
  name: string;
  sector: string;
  stage: string | null;
  status: string | null;
  currentValuation: Decimal | null;
  investedCapital: Decimal | null;
}

export type BaselineCompanySnapshotSource = 'full_snapshot' | 'legacy_top_performers' | 'none';

interface BaselineCompanySourceLike {
  companySnapshots?: unknown;
  topPerformers?: unknown;
}

interface LegacyTopPerformerLike {
  id: string | number;
  name?: string;
  sector?: string;
  stage?: string | null;
  status?: string | null;
  currentValuation?: string | number | null;
  valuation?: string | number | Decimal | null;
  investedCapital?: string | number | null;
}

export function sumInvestmentAmounts(
  investmentRows: InvestmentAmountLike[] | null | undefined
): Decimal {
  if (!investmentRows?.length) {
    return new Decimal(0);
  }

  return investmentRows.reduce<Decimal>((sum, investmentRow) => {
    if (investmentRow.amount == null) {
      return sum;
    }

    return sum.plus(toDecimal(String(investmentRow.amount)));
  }, new Decimal(0));
}

export function getCompanyVarianceRiskLevel(
  changePct: Decimal | null
): 'low' | 'medium' | 'high' | 'critical' {
  if (changePct === null) {
    return 'medium';
  }

  const magnitude = changePct.abs();
  if (magnitude.gte(0.5)) {
    return 'critical';
  }
  if (magnitude.gte(0.25)) {
    return 'high';
  }
  if (magnitude.gte(0.1)) {
    return 'medium';
  }

  return 'low';
}

export function withLegacyValuationAliases(
  valuationVariance: string | null,
  valuationVariancePct: string | null
): Pick<
  CompanyVarianceRow,
  'valuationChange' | 'valuationChangePct' | 'valuationVariance' | 'valuationVariancePct'
> {
  // TODO(variance): remove valuationChange* after all consumers switch to valuationVariance*.
  return {
    valuationChange: valuationVariance,
    valuationChangePct: valuationVariancePct,
    valuationVariance,
    valuationVariancePct,
  };
}

export function extractBaselineCompanySnapshots(baseline: BaselineCompanySourceLike): {
  source: BaselineCompanySnapshotSource;
  companies: BaselineCompanySnapshot[];
} {
  const rawCompanySnapshots = baseline.companySnapshots;

  if (Array.isArray(rawCompanySnapshots)) {
    const companies = rawCompanySnapshots
      .map((entry): BaselineCompanySnapshot | null => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }

        const record = entry as Record<string, unknown>;
        const rawPortfolioCompanyId =
          record['portfolioCompanyId'] ?? record['companyId'] ?? record['id'];
        const portfolioCompanyId =
          typeof rawPortfolioCompanyId === 'number'
            ? rawPortfolioCompanyId
            : Number(rawPortfolioCompanyId);
        if (!Number.isInteger(portfolioCompanyId) || portfolioCompanyId <= 0) {
          return null;
        }

        const rawValuation = record['currentValuation'] ?? record['valuation'];
        const rawInvestedCapital = record['investedCapital'];

        return {
          portfolioCompanyId,
          companyId: portfolioCompanyId,
          name:
            typeof record['companyName'] === 'string'
              ? record['companyName']
              : typeof record['name'] === 'string'
                ? record['name']
                : '',
          sector: typeof record['sector'] === 'string' ? record['sector'] : '',
          stage: typeof record['stage'] === 'string' ? record['stage'] : null,
          status: typeof record['status'] === 'string' ? record['status'] : null,
          currentValuation:
            rawValuation === null || rawValuation === undefined
              ? null
              : toDecimal(String(rawValuation)),
          investedCapital:
            rawInvestedCapital === null || rawInvestedCapital === undefined
              ? null
              : toDecimal(String(rawInvestedCapital)),
        };
      })
      .filter((company): company is BaselineCompanySnapshot => company !== null);

    if (companies.length > 0) {
      return {
        source: 'full_snapshot',
        companies,
      };
    }
  }

  const rawPerformers = baseline.topPerformers;
  let baselineCompanies: LegacyTopPerformerLike[] = [];

  if (Array.isArray(rawPerformers)) {
    baselineCompanies = rawPerformers as LegacyTopPerformerLike[];
  } else if (
    rawPerformers &&
    typeof rawPerformers === 'object' &&
    Array.isArray((rawPerformers as Record<string, unknown>)['companies'])
  ) {
    baselineCompanies = (rawPerformers as Record<string, unknown>)[
      'companies'
    ] as LegacyTopPerformerLike[];
  }

  if (baselineCompanies.length === 0) {
    return {
      source: 'none',
      companies: [],
    };
  }

  return {
    source: 'legacy_top_performers',
    companies: baselineCompanies
      .map((company) => {
        const portfolioCompanyId = typeof company.id === 'number' ? company.id : Number(company.id);
        const rawValuation = company.currentValuation ?? company.valuation;
        return {
          portfolioCompanyId,
          companyId: portfolioCompanyId,
          name: company.name ?? '',
          sector: company.sector ?? '',
          stage: company.stage ?? null,
          status: company.status ?? null,
          currentValuation:
            rawValuation === null || rawValuation === undefined
              ? null
              : toDecimal(String(rawValuation)),
          investedCapital:
            company.investedCapital === null || company.investedCapital === undefined
              ? null
              : toDecimal(String(company.investedCapital)),
        };
      })
      .filter((company) => company.portfolioCompanyId > 0),
  };
}

export function analyzeCompanyVarianceRows(
  companies: CurrentCompanyLike[],
  baseline: BaselineCompanySourceLike
): CompanyVarianceRow[] {
  const { source, companies: baselineCompanies } = extractBaselineCompanySnapshots(baseline);
  if (baselineCompanies.length === 0) {
    return [];
  }

  const baselineMap = new Map<number, BaselineCompanySnapshot>();

  for (const baselineCompany of baselineCompanies) {
    baselineMap.set(baselineCompany.portfolioCompanyId, baselineCompany);
  }

  if (baselineMap.size === 0) {
    return [];
  }

  const variances: CompanyVarianceRow[] = [];
  const matchedCompanyIds = new Set<number>();

  for (const company of companies) {
    const baselineEntry = baselineMap.get(company.id);
    const currentInvestedCapital = sumInvestmentAmounts(company.investments);
    if (!baselineEntry) {
      if (source !== 'full_snapshot' || company.currentValuation == null) {
        continue;
      }

      const currentVal = toDecimal(String(company.currentValuation));
      variances.push({
        companyId: company.id,
        companyName: company.name,
        sector: company.sector,
        stage: company.stage ?? null,
        status: company.status ?? null,
        changeType: 'added',
        baselineValuation: null,
        currentValuation: currentVal.toString(),
        baselineInvestedCapital: null,
        currentInvestedCapital: currentInvestedCapital.toString(),
        ...withLegacyValuationAliases(currentVal.toString(), null),
        riskLevel: getCompanyVarianceRiskLevel(null),
      });
      continue;
    }

    if (company.currentValuation == null || baselineEntry.currentValuation == null) {
      continue;
    }

    matchedCompanyIds.add(company.id);
    const currentVal = toDecimal(String(company.currentValuation));
    const baseVal = baselineEntry.currentValuation;

    if (baseVal.isZero()) {
      continue;
    }

    const change = currentVal.minus(baseVal);
    const changePct = change.div(baseVal);

    variances.push({
      companyId: company.id,
      companyName: company.name,
      sector: company.sector,
      stage: company.stage ?? null,
      status: company.status ?? null,
      changeType: 'matched',
      baselineValuation: baseVal.toString(),
      currentValuation: currentVal.toString(),
      baselineInvestedCapital: baselineEntry.investedCapital?.toString() ?? null,
      currentInvestedCapital: currentInvestedCapital.toString(),
      ...withLegacyValuationAliases(change.toString(), changePct.toString()),
      riskLevel: getCompanyVarianceRiskLevel(changePct),
    });
  }

  if (source === 'full_snapshot') {
    for (const [companyId, baselineEntry] of baselineMap.entries()) {
      if (matchedCompanyIds.has(companyId) || baselineEntry.currentValuation == null) {
        continue;
      }

      const baseVal = baselineEntry.currentValuation;
      const change = baseVal.negated();
      const changePct = baseVal.isZero() ? null : new Decimal(-1);

      variances.push({
        companyId,
        companyName: baselineEntry.name,
        sector: baselineEntry.sector,
        stage: baselineEntry.stage,
        status: baselineEntry.status,
        changeType: 'removed',
        baselineValuation: baseVal.toString(),
        currentValuation: null,
        baselineInvestedCapital: baselineEntry.investedCapital?.toString() ?? null,
        currentInvestedCapital: null,
        ...withLegacyValuationAliases(change.toString(), changePct?.toString() ?? null),
        riskLevel: getCompanyVarianceRiskLevel(changePct),
      });
    }
  }

  return variances;
}
