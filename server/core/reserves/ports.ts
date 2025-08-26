/**
 * Reserve Engine Ports and Interfaces
 * Defines the contract for ML-enhanced reserve allocation
 */

export interface PortfolioCompany {
  id: string;
  fundId: string;
  name: string;
  stage: 'preseed' | 'seed' | 'series_a' | 'series_b' | 'series_c' | 'series_dplus';
  sector?: string;
  checkSize: number;
  invested: number;
  ownership: number;
  exitMoic?: number;
  entryDate?: string;
  lastRoundDate?: string;
}

export interface MarketConditions {
  asOfDate: string;
  marketScore?: number;
  vix?: number;
  fedFundsRate?: number;
  ust10yYield?: number;
  ipoCount30d?: number;
  creditSpreadBaa?: number;
}

export interface ReservePrediction {
  recommendedReserve: number;
  perRound?: Record<string, number>;
  confidence?: { 
    low: number; 
    high: number;
    level?: number; // confidence level (e.g., 0.8 for 80%)
  };
  notes?: string[];
  riskFactors?: string[];
}

export interface PredictionExplanation {
  method: 'rules' | 'shap' | 'permutation' | 'feature_importance' | 'hybrid';
  details: Record<string, unknown>;
  topFactors?: Array<{ factor: string; importance: number; direction: 'positive' | 'negative' }>;
  rulesFired?: string[];
}

export interface ReserveDecision {
  prediction: ReservePrediction;
  explanation?: PredictionExplanation;
  engineType: 'rules' | 'ml' | 'hybrid';
  engineVersion: string;
  latencyMs?: number;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface ReserveEngineOptions {
  requestId?: string;
  flags?: Record<string, boolean | string | number>;
  userId?: string;
  periodStart?: string;
  periodEnd?: string;
  explainPrediction?: boolean;
  confidenceLevel?: number;
}

export interface ReserveEnginePort {
  compute(
    company: PortfolioCompany, 
    market: MarketConditions, 
    opts?: ReserveEngineOptions
  ): Promise<ReserveDecision>;
}