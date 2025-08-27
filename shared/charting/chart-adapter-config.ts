/**
 * Chart Adapter Configuration
 * Controls which chart library implementation to use
 * Allows for gradual migration with feature flags
 */

export type ChartImplementation = 'recharts' | 'nivo' | 'legacy';

export interface ChartAdapterConfig {
  implementation: ChartImplementation;
  enableFallback: boolean;
  performanceMode: boolean;
  debugMode: boolean;
}

// Get configuration from environment or feature flags
export function getChartConfig(): ChartAdapterConfig {
  const impl = process.env['REACT_APP_CHART_IMPL'] || 
                process.env['CHART_IMPL'] || 
                'recharts'; // Default to Recharts since it's most used

  return {
    implementation: impl as ChartImplementation,
    enableFallback: process.env['CHART_FALLBACK'] === 'true',
    performanceMode: process.env['CHART_PERFORMANCE'] === 'true',
    debugMode: process.env['NODE_ENV'] === 'development'
  };
}

// Feature flag helper for gradual rollout
export function shouldUseNewCharts(componentName?: string): boolean {
  const config = getChartConfig();
  
  // Component-specific flags for granular control
  if (componentName) {
    const componentFlag = process.env[`CHART_${componentName.toUpperCase()}_NEW`];
    if (componentFlag !== undefined) {
      return componentFlag === 'true';
    }
  }

  // Global flag
  return config.implementation === 'recharts';
}

// Rollback helper for emergencies
export function forceChartImplementation(impl: ChartImplementation): void {
  if (typeof window !== 'undefined') {
    (window as any).__FORCE_CHART_IMPL = impl;
    console.warn(`Chart implementation forced to: ${impl}`);
  }
}

// Performance monitoring wrapper
export function withChartMetrics<T extends (...args: any[]) => any>(
  fn: T, 
  chartType: string
): T {
  return ((...args: Parameters<T>) => {
    const startTime = performance.now();
    const result = fn(...args);
    const duration = performance.now() - startTime;

    // Log to monitoring system
    if (duration > 100) {
      console.warn(`Slow chart render: ${chartType} took ${duration}ms`);
    }

    return result;
  }) as T;
}