import type { DualForecastResponse } from '@shared/contracts/dual-forecast/dual-forecast-response.contract';
import type { UnifiedFundMetrics } from '@shared/types/metrics';
import { metricsAggregator } from './metrics-aggregator';

export interface UnifiedMetricsOptions {
  skipCache?: boolean;
  skipProjections?: boolean;
}

export function getDualForecast(fundId: number): Promise<DualForecastResponse> {
  return metricsAggregator.getDualForecast(fundId);
}

export function getUnifiedMetrics(
  fundId: number,
  options: UnifiedMetricsOptions = {}
): Promise<UnifiedFundMetrics> {
  return metricsAggregator.getUnifiedMetrics(fundId, options);
}

export function invalidateCurrentForecastCache(fundId: number): Promise<void> {
  return metricsAggregator.invalidateCache(fundId);
}
