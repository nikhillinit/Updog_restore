/**
 * Compass - Internal Valuation Sandbox
 * Type Definitions
 *
 * ⚠️ IMPORTANT: This is an internal decision-support tool.
 * Valuations are FOR DISCUSSION ONLY and do not represent official marks.
 */

/**
 * Valuation inputs for sandbox calculations
 */
export interface ValuationInputs {
  /** Company's annual revenue (USD) */
  revenue: number;

  /** Selected EV/Revenue multiple */
  selectedMultiple: number;

  /** Illiquidity discount as decimal (e.g., 0.25 for 25%) */
  iliquidityDiscount: number;

  /** Control premium as decimal (e.g., 0.20 for 20%) */
  controlPremium: number;
}

/**
 * Comparable company data
 */
export interface ComparableCompany {
  /** Unique identifier (PitchBook ID or internal) */
  id: string;

  /** Company name */
  name: string;

  /** Ticker symbol (if public) */
  ticker?: string;

  /** EV/Revenue multiple */
  evRevenueMultiple: number;

  /** Annual revenue (USD) */
  revenue: number;

  /** Industry/sector tags */
  sector?: string;

  /** Company stage */
  stage?: string;

  /** Is this a public company? */
  isPublic: boolean;

  /** Last update timestamp */
  lastUpdated?: Date;
}

/**
 * Portfolio company metrics for valuation context
 */
export interface PortfolioCompanyMetrics {
  /** Unique company ID */
  id: string;

  /** Company name */
  name: string;

  /** Current annual revenue (USD) */
  currentRevenue: number;

  /** Last funding round details */
  lastRound?: {
    /** Post-money valuation (USD) */
    valuationUSD: number;

    /** Round date */
    date: Date;

    /** Revenue at time of round (USD) */
    revenueAtRound: number;

    /** Implied EV/Revenue multiple */
    impliedMultiple: number;
  };

  /** Industry/sector */
  sector: string;

  /** Company stage */
  stage: string;
}

/**
 * Valuation calculation result
 */
export interface ValuationResult {
  /** Calculated sandbox valuation (USD) */
  sandboxValue: number;

  /** Inputs used for calculation */
  inputs: ValuationInputs;

  /** Comparable companies used */
  compsUsed: string[]; // Array of comp IDs

  /** Calculated metrics */
  metrics: {
    /** Base enterprise value before adjustments */
    baseEV: number;

    /** EV after control premium */
    evWithControl: number;

    /** Final value after illiquidity discount */
    finalValue: number;

    /** Current implied multiple (sandboxValue / revenue) */
    impliedMultiple: number;

    /** Change vs. last round (if available) */
    vsLastRound?: {
      /** Absolute change (USD) */
      absoluteChange: number;

      /** Percentage change */
      percentChange: number;

      /** Multiple compression/expansion */
      multipleChange: number;
    };
  };

  /** Calculation timestamp */
  calculatedAt: Date;
}

/**
 * Saved scenario
 */
export interface ValuationScenario {
  /** Scenario ID */
  id: string;

  /** User ID who created it */
  userId: string;

  /** Portfolio company ID */
  portfolioCompanyId: string;

  /** Scenario name (user-provided) */
  scenarioName: string;

  /** Valuation result */
  result: ValuationResult;

  /** Creation timestamp */
  createdAt: Date;

  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * Portfolio heatmap entry
 */
export interface PortfolioHeatmapEntry {
  /** Company ID */
  companyId: string;

  /** Company name */
  companyName: string;

  /** Company stage */
  stage: string;

  /** Sector */
  sector: string;

  /** Current sandbox valuation */
  sandboxValue: number;

  /** Last official mark (if available) */
  lastOfficialMark?: number;

  /** Change vs. last mark */
  vsLastMark?: {
    absoluteChange: number;
    percentChange: number;
  };

  /** Implied multiple */
  impliedMultiple: number;

  /** Revenue */
  revenue: number;

  /** Last calculation timestamp */
  lastCalculated: Date;
}

/**
 * API Request/Response types
 */

export interface GetValuationContextRequest {
  companyId: string;
}

export interface GetValuationContextResponse {
  company: PortfolioCompanyMetrics;
  suggestedComps?: ComparableCompany[];
}

export interface SearchCompsRequest {
  query: string;
  sector?: string;
  stage?: string;
  isPublic?: boolean;
  limit?: number;
}

export interface SearchCompsResponse {
  results: ComparableCompany[];
  totalCount: number;
}

export interface CalculateValuationRequest {
  companyId: string;
  inputs: ValuationInputs;
  compIds: string[];
}

export interface CalculateValuationResponse {
  result: ValuationResult;
}

export interface SaveScenarioRequest {
  portfolioCompanyId: string;
  scenarioName: string;
  result: ValuationResult;
}

export interface SaveScenarioResponse {
  scenario: ValuationScenario;
}

export interface GetPortfolioHeatmapRequest {
  fundId?: string;
  stage?: string;
  sector?: string;
}

export interface GetPortfolioHeatmapResponse {
  entries: PortfolioHeatmapEntry[];
  summary: {
    totalCompanies: number;
    totalSandboxValue: number;
    averageMultiple: number;
  };
}
