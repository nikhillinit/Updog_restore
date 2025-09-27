/**
 * Performance baseline collection utilities for tracking render counts
 * and detecting performance regressions during the state management migration.
 */

import React from 'react';

interface RenderMetrics {
  componentName: string;
  renderCount: number;
  averageRenderTime: number;
  maxRenderTime: number;
  minRenderTime: number;
  timestamp: string;
}

class PerformanceBaseline {
  private metrics: Map<string, RenderMetrics> = new Map();
  private renderTimes: Map<string, number[]> = new Map();
  
  /**
   * Track a component render
   */
  trackRender(componentName: string, renderTime: number) {
    // Get or initialize render times array
    const times = this.renderTimes.get(componentName) || [];
    times.push(renderTime);
    this.renderTimes.set(componentName, times);
    
    // Update metrics
    const existing = this.metrics.get(componentName);
    const renderCount = (existing?.renderCount || 0) + 1;
    
    this.metrics.set(componentName, {
      componentName,
      renderCount,
      averageRenderTime: times.reduce((a, b) => a + b, 0) / times.length,
      maxRenderTime: Math.max(...times),
      minRenderTime: Math.min(...times),
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Get metrics for a specific component
   */
  getMetrics(componentName: string): RenderMetrics | undefined {
    return this.metrics.get(componentName);
  }
  
  /**
   * Get all collected metrics
   */
  getAllMetrics(): RenderMetrics[] {
    return Array.from(this.metrics.values());
  }
  
  /**
   * Export metrics as JSON
   */
  exportMetrics(): string {
    return JSON.stringify(this.getAllMetrics(), null, 2);
  }
  
  /**
   * Reset all metrics
   */
  reset() {
    this.metrics.clear();
    this.renderTimes.clear();
  }
  
  /**
   * Compare current metrics with a baseline
   */
  compareWithBaseline(baseline: RenderMetrics[]): {
    regressions: string[];
    improvements: string[];
  } {
    const regressions: string[] = [];
    const improvements: string[] = [];
    
    for (const baselineMetric of baseline) {
      const current = this.metrics.get(baselineMetric.componentName);
      if (!current) continue;
      
      // Check for render count regression (>10% increase)
      if (current.renderCount > baselineMetric.renderCount * 1.1) {
        regressions.push(
          `${baselineMetric.componentName}: render count increased from ${baselineMetric.renderCount} to ${current.renderCount}`
        );
      } else if (current.renderCount < baselineMetric.renderCount * 0.9) {
        improvements.push(
          `${baselineMetric.componentName}: render count decreased from ${baselineMetric.renderCount} to ${current.renderCount}`
        );
      }
      
      // Check for render time regression (>20% increase)
      if (current.averageRenderTime > baselineMetric.averageRenderTime * 1.2) {
        regressions.push(
          `${baselineMetric.componentName}: average render time increased from ${baselineMetric.averageRenderTime.toFixed(2)}ms to ${current.averageRenderTime.toFixed(2)}ms`
        );
      } else if (current.averageRenderTime < baselineMetric.averageRenderTime * 0.8) {
        improvements.push(
          `${baselineMetric.componentName}: average render time decreased from ${baselineMetric.averageRenderTime.toFixed(2)}ms to ${current.averageRenderTime.toFixed(2)}ms`
        );
      }
    }
    
    return { regressions, improvements };
  }
}

// Global singleton instance
export const performanceBaseline = new PerformanceBaseline();

/**
 * React hook to track component render performance
 */
export function useRenderTracking(componentName: string) {
  if (!import.meta.env.DEV) return;
  
  const startTime = performance.now();
  
  // Track after render completes
  React.useEffect(() => {
    const renderTime = performance.now() - startTime;
    performanceBaseline.trackRender(componentName, renderTime);
  });
}

/**
 * Development-only render counter hook
 */
export function useRenderCounter(componentName: string) {
  const renderCount = React.useRef(0);
  
  React.useEffect(() => {
    if (!import.meta.env.DEV) return;
    
    renderCount.current += 1;
    
    // Log every 10 renders to avoid spam
    if (renderCount.current % 10 === 0) {
      console.debug(`[Render Count] ${componentName}: ${renderCount.current} renders`);
    }
  });
  
  return renderCount.current;
}

// Export for use in tests
export type { RenderMetrics };

// Helper for running baseline collection
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as any).__performanceBaseline = performanceBaseline;
  
  // Log metrics on page unload
  window.addEventListener('beforeunload', () => {
    const metrics = performanceBaseline.getAllMetrics();
    if (metrics.length > 0) {
      console.log('[Performance Baseline]', metrics);
    }
  });
}