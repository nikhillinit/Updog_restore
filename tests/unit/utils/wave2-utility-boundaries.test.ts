import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import pLimit from '@/utils/pLimit';
import { performanceBaseline } from '@/utils/performance-baseline';
import { forEach, forEachWithMetrics } from '@/utils/array-safety-enhanced';
import { logger } from '@/lib/logger';

describe('Wave 2 utility boundaries', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.restoreAllMocks();
    performanceBaseline.reset();
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.unstubAllGlobals();
  });

  it('limits concurrent async work', async () => {
    const limit = pLimit(2);
    let active = 0;
    let maxActive = 0;

    const tasks = [1, 2, 3, 4].map((value) =>
      limit(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return value * 2;
      })
    );

    const results = await Promise.all(tasks);

    expect(results).toEqual([2, 4, 6, 8]);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('tracks render metrics and compares them with a baseline', () => {
    performanceBaseline.trackRender('Widget', 10);
    performanceBaseline.trackRender('Widget', 30);

    expect(performanceBaseline.getMetrics('Widget')).toMatchObject({
      componentName: 'Widget',
      renderCount: 2,
      averageRenderTime: 20,
      maxRenderTime: 30,
      minRenderTime: 10,
    });

    const comparison = performanceBaseline.compareWithBaseline([
      {
        componentName: 'Widget',
        renderCount: 1,
        averageRenderTime: 15,
        maxRenderTime: 15,
        minRenderTime: 15,
        timestamp: new Date().toISOString(),
      },
    ]);

    expect(comparison.regressions).toEqual(
      expect.arrayContaining([expect.stringContaining('render count increased')])
    );
  });

  it('keeps array helpers null-safe and routes development metrics through the logger', () => {
    const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => undefined);
    const values: number[] = [];

    forEach([1, 2], (value) => {
      values.push(value);
    });
    forEach(null, () => {
      throw new Error('null arrays should be ignored');
    });
    forEachWithMetrics([1, 2, 3], () => undefined, 'demo-loop');

    expect(values).toEqual([1, 2]);
    expect(debugSpy).toHaveBeenCalledWith('array helper received nullish input', {
      helper: 'forEach',
    });
    expect(debugSpy).toHaveBeenCalledWith(
      'array iteration metrics',
      expect.objectContaining({ helper: 'forEachWithMetrics', metricName: 'demo-loop' })
    );
  });
});
