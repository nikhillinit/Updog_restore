/**
 * ML Reserve Service Client
 * HTTP client for machine learning reserve prediction service
 */

import fetch, { AbortError } from 'node-fetch';
import type { RequestInit, Response } from 'node-fetch';
import type {
  PortfolioCompany,
  MarketConditions,
  PredictionExplanation,
  ReserveDecision,
  ReserveEngineOptions,
  ReservePrediction,
} from './ports.js';
import { logger } from '../../lib/logger.js';

export interface MLServiceConfig {
  baseUrl: string;
  timeoutMs: number;
  retries: number;
  backoffMs: number;
}

export interface MLTrainingRow {
  company: PortfolioCompany;
  market: MarketConditions;
  realizedReserveUsed: number;
  actualOutcome?: 'success' | 'failure' | 'partial';
}

export interface MLTrainingRequest {
  rows: MLTrainingRow[];
  modelVersion?: string;
  hyperparameters?: Record<string, unknown>;
}

export interface MLPredictRequest {
  company: PortfolioCompany;
  market: MarketConditions;
  explain: boolean;
  confidenceLevel?: number;
}

type HealthCheckResponse = { status: string; modelLoaded: boolean };
type TrainModelResponse = { modelVersion: string; rows: number };
type ExplanationMethod = PredictionExplanation['method'];
type TopFactor = NonNullable<PredictionExplanation['topFactors']>[number];

interface MlPredictResponse {
  modelVersion: string;
  prediction: {
    recommendedReserve: number;
    perRound?: Record<string, number>;
    confidence?: { low: number; high: number };
    notes?: string[];
  };
  explanation?: {
    method: string;
    details: Record<string, unknown>;
  };
  latencyMs?: number;
}

const EXPLANATION_METHODS: readonly ExplanationMethod[] = [
  'rules',
  'shap',
  'permutation',
  'feature_importance',
  'hybrid',
] as const;

export class MlClient {
  private config: MLServiceConfig;

  constructor(config: Partial<MLServiceConfig> = {}) {
    this.config = {
      baseUrl: process.env['ML_RESERVE_URL'] || 'http://localhost:8088',
      timeoutMs: parseInt(process.env['ML_TIMEOUT_MS'] || '1200'),
      retries: 2,
      backoffMs: 100,
      ...config,
    };
  }

  async healthCheck(): Promise<{ status: string; modelLoaded: boolean }> {
    try {
      const res = await this.fetchWithTimeout('/health', { method: 'GET' });
      if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
      return await this.readJson<HealthCheckResponse>(res);
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'ML service health check failed'
      );
      throw error;
    }
  }

  async trainModel(request: MLTrainingRequest): Promise<{ modelVersion: string; rows: number }> {
    const startTime = Date.now();

    try {
      const res = await this.fetchWithTimeout('/train', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!res.ok) {
        throw new Error(`Training failed: ${res.status} ${res.statusText}`);
      }

      const result = await this.readJson<TrainModelResponse>(res);

      logger.info(
        {
          modelVersion: result.modelVersion,
          trainingRows: result.rows,
          durationMs: Date.now() - startTime,
        },
        'ML model training completed'
      );

      return result;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - startTime,
          trainingRows: request.rows.length,
        },
        'ML model training failed'
      );
      throw error;
    }
  }

  async predict(
    company: PortfolioCompany,
    market: MarketConditions,
    opts: ReserveEngineOptions = {}
  ): Promise<ReserveDecision> {
    const startTime = Date.now();
    const request: MLPredictRequest = {
      company,
      market,
      explain: opts.explainPrediction ?? true,
      confidenceLevel: opts.confidenceLevel ?? 0.8,
    };

    try {
      const res = await this.fetchWithRetry('/predict', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-request-id': opts.requestId || '',
        },
        body: JSON.stringify(request),
      });

      if (!res.ok) {
        throw new Error(`ML prediction failed: ${res.status} ${res.statusText}`);
      }

      const body = await this.readJson<MlPredictResponse>(res);

      // Build prediction with conditional optional properties
      const prediction: ReservePrediction = {
        recommendedReserve: Math.max(0, body.prediction.recommendedReserve),
        notes: body.prediction.notes || [],
      };
      if (body.prediction.perRound !== undefined) {
        prediction.perRound = body.prediction.perRound;
      }
      if (body.prediction.confidence !== undefined) {
        prediction.confidence = body.prediction.confidence;
      }

      // Build decision with conditional explanation
      const decision: ReserveDecision = {
        prediction,
        engineType: 'ml',
        engineVersion: body.modelVersion,
        latencyMs: body.latencyMs ?? Date.now() - startTime,
      };
      if (body.explanation !== undefined) {
        decision.explanation = {
          method: this.toExplanationMethod(body.explanation.method),
          details: body.explanation.details,
          topFactors: this.extractTopFactors(body.explanation.details),
        };
      }

      logger.debug(
        {
          companyId: company.id,
          recommendedReserve: decision.prediction.recommendedReserve,
          latencyMs: decision.latencyMs,
          modelVersion: decision.engineVersion,
        },
        'ML prediction completed'
      );

      return decision;
    } catch (error) {
      logger.error(
        {
          companyId: company.id,
          error: error instanceof Error ? error.message : String(error),
          latencyMs: Date.now() - startTime,
        },
        'ML prediction failed'
      );
      throw error;
    }
  }

  private async fetchWithTimeout(path: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const res = await fetch(`${this.config.baseUrl}${path}`, {
        ...options,
        signal: controller.signal as Exclude<RequestInit['signal'], undefined>,
      });
      return res;
    } catch (error) {
      if (error instanceof AbortError) {
        throw new Error(`ML service timeout after ${this.config.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchWithRetry(path: string, options: RequestInit): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      try {
        return await this.fetchWithTimeout(path, options);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.config.retries) {
          const delay = this.config.backoffMs * Math.pow(2, attempt);
          await new Promise<void>((resolve) => setTimeout(resolve, delay));
          logger.warn(
            {
              attempt: attempt + 1,
              maxRetries: this.config.retries,
              delayMs: delay,
              error: lastError.message,
            },
            'Retrying ML service request'
          );
        }
      }
    }

    throw lastError ?? new Error('ML service request failed');
  }

  private async readJson<T>(response: Response): Promise<T> {
    return (await response.json()) as T;
  }

  private toExplanationMethod(method: string): ExplanationMethod {
    return isExplanationMethod(method) ? method : 'feature_importance';
  }

  private extractTopFactors(details: Record<string, unknown>): TopFactor[] {
    return Object.entries(details)
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
      .map(
        ([factor, importance]): TopFactor => ({
          factor,
          importance: Math.abs(importance),
          direction: importance >= 0 ? 'positive' : 'negative',
        })
      )
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 5); // Top 5 factors
  }
}

function isExplanationMethod(value: string): value is ExplanationMethod {
  return EXPLANATION_METHODS.includes(value as ExplanationMethod);
}
