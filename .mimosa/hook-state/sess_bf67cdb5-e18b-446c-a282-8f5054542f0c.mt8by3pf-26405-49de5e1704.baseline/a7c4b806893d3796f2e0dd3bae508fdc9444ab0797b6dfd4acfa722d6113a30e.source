/**
 * Chart Adapter Configuration
 * Recharts is now the only supported chart runtime.
 */

export type ChartImplementation = 'recharts';

export interface ChartAdapterConfig {
  implementation: ChartImplementation;
  enableFallback: false;
  performanceMode: boolean;
  debugMode: boolean;
}

// Chart selection is no longer runtime-configurable after the Nivo retirement.
export function getChartConfig(): ChartAdapterConfig {
  return {
    implementation: 'recharts',
    enableFallback: false,
    performanceMode: process.env['CHART_PERFORMANCE'] === 'true',
    debugMode: process.env['NODE_ENV'] === 'development'
  };
}

export function shouldUseNewCharts(componentName?: string): boolean {
  void componentName;
  return true;
}

export function forceChartImplementation(impl: ChartImplementation): void {
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, ChartImplementation>)['__FORCE_CHART_IMPL'] = impl;
    console.warn(`Chart implementation is fixed to: ${impl}`);
  }
}

// Performance monitoring wrapper
export function withChartMetrics<T extends (...args: unknown[]) => unknown>(
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
