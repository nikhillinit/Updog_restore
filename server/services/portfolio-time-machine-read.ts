import { db } from '../db';
import { NotFoundError } from '../errors';
import { storage } from '../storage';
import { TimeTravelAnalyticsService } from './time-travel-analytics';

type StoredPortfolioCompany = Awaited<ReturnType<typeof storage.getPortfolioCompanies>>[number];

export type PortfolioCompaniesMode = 'live' | 'historical';
export type PortfolioCompaniesSource = 'live' | 'snapshot';
export type PortfolioCompaniesEmptyReason =
  | 'no_snapshot'
  | 'unsupported_snapshot'
  | 'no_companies_at_date';

export interface PortfolioCompaniesMeta {
  mode: PortfolioCompaniesMode;
  requestedAsOf: string | null;
  resolvedAsOf: string | null;
  source: PortfolioCompaniesSource;
  historicalAvailable: boolean;
  emptyReason?: PortfolioCompaniesEmptyReason;
}

export interface PortfolioCompaniesReadResponse {
  companies: StoredPortfolioCompany[];
  meta: PortfolioCompaniesMeta;
}

type HistoricalCompanyState = {
  id?: number | string;
  name?: string;
  valuation?: number | string | null;
  currentValuation?: number | string | null;
  stage?: string | null;
  sector?: string | null;
  status?: string | null;
  investmentAmount?: number | string | null;
  ownershipCurrentPct?: number | string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function coerceDecimalString(value: unknown, fallback: string | null = '0'): string | null {
  if (value == null) {
    return fallback;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toString();
  }
  return fallback;
}

function parseHistoricalId(
  value: number | string | undefined,
  fallback: number | undefined
): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function extractHistoricalCompanies(state: unknown): HistoricalCompanyState[] {
  if (!isRecord(state)) {
    return [];
  }

  const directCompanies = state['companies'];
  if (Array.isArray(directCompanies)) {
    return directCompanies.filter(isRecord) as HistoricalCompanyState[];
  }

  const nestedPortfolio = state['portfolioState'];
  if (isRecord(nestedPortfolio) && Array.isArray(nestedPortfolio['companies'])) {
    return nestedPortfolio['companies'].filter(isRecord) as HistoricalCompanyState[];
  }

  const nestedPortfolioCompanies = state['portfolioCompanies'];
  if (Array.isArray(nestedPortfolioCompanies)) {
    return nestedPortfolioCompanies.filter(isRecord) as HistoricalCompanyState[];
  }

  return [];
}

function buildLiveMeta(): PortfolioCompaniesMeta {
  return {
    mode: 'live',
    requestedAsOf: null,
    resolvedAsOf: null,
    source: 'live',
    historicalAvailable: false,
  };
}

function buildHistoricalEmptyMeta(
  requestedAsOf: string,
  emptyReason: PortfolioCompaniesEmptyReason
): PortfolioCompaniesMeta {
  return {
    mode: 'historical',
    requestedAsOf,
    resolvedAsOf: requestedAsOf,
    source: 'snapshot',
    historicalAvailable: false,
    emptyReason,
  };
}

function mergeHistoricalCompany(
  historicalCompany: HistoricalCompanyState,
  liveCompanies: StoredPortfolioCompany[],
  fundId: number,
  fallbackOrdinal: number
): StoredPortfolioCompany | null {
  const historicalName = historicalCompany.name?.trim();
  const byId = parseHistoricalId(historicalCompany.id, undefined);

  const liveMatch =
    liveCompanies.find((company) => company.id === byId) ||
    (historicalName
      ? liveCompanies.find(
          (company) => company.name.trim().toLowerCase() === historicalName.toLowerCase()
        )
      : undefined);

  const resolvedId = parseHistoricalId(historicalCompany.id, liveMatch?.id);
  const resolvedName = historicalName || liveMatch?.name;

  if (!resolvedName) {
    return null;
  }

  return {
    id: resolvedId ?? fallbackOrdinal * -1,
    fundId: liveMatch?.fundId ?? fundId,
    name: resolvedName,
    sector: historicalCompany.sector ?? liveMatch?.sector ?? 'Unknown',
    stage: historicalCompany.stage ?? liveMatch?.stage ?? 'Unknown',
    investmentAmount:
      coerceDecimalString(historicalCompany.investmentAmount, null) ??
      liveMatch?.investmentAmount ??
      '0',
    currentValuation:
      coerceDecimalString(
        historicalCompany.currentValuation ?? historicalCompany.valuation,
        null
      ) ?? liveMatch?.currentValuation ?? null,
    foundedYear: liveMatch?.foundedYear ?? null,
    status: historicalCompany.status ?? liveMatch?.status ?? 'Historical',
    description: liveMatch?.description ?? null,
    dealTags: liveMatch?.dealTags ?? null,
    createdAt: liveMatch?.createdAt ?? new Date(),
  };
}

export class PortfolioTimeMachineReadService {
  private readonly timelineService = new TimeTravelAnalyticsService(db);

  async listCompanies(
    fundId?: number,
    options: { asOf?: Date; requestedAsOf?: string } = {}
  ): Promise<PortfolioCompaniesReadResponse> {
    const { asOf, requestedAsOf } = options;
    const liveCompanies = await storage.getPortfolioCompanies(fundId);

    if (!fundId || !asOf) {
      return {
        companies: liveCompanies,
        meta: buildLiveMeta(),
      };
    }

    try {
      const historicalState = await this.timelineService.getStateAtTime(fundId, asOf, false);
      const historicalCompanies = extractHistoricalCompanies(historicalState.state);

      if (historicalCompanies.length === 0) {
        return {
          companies: [],
          meta: buildHistoricalEmptyMeta(
            requestedAsOf ?? historicalState.timestamp,
            'unsupported_snapshot'
          ),
        };
      }

      const mergedCompanies = historicalCompanies
        .map((company, index) => mergeHistoricalCompany(company, liveCompanies, fundId, index + 1))
        .filter((company): company is StoredPortfolioCompany => company !== null);

      return {
        companies: mergedCompanies,
        meta: {
          mode: 'historical',
          requestedAsOf: requestedAsOf ?? historicalState.timestamp,
          resolvedAsOf: historicalState.timestamp,
          source: 'snapshot',
          historicalAvailable: mergedCompanies.length > 0,
          ...(mergedCompanies.length === 0 ? { emptyReason: 'no_companies_at_date' } : {}),
        },
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        return {
          companies: [],
          meta: buildHistoricalEmptyMeta(requestedAsOf ?? asOf.toISOString(), 'no_snapshot'),
        };
      }

      throw error;
    }
  }
}

export const portfolioTimeMachineReadService = new PortfolioTimeMachineReadService();
