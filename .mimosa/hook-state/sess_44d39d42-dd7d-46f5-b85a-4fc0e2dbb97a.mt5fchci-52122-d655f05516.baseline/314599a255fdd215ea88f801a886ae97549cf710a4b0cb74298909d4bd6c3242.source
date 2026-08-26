import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportToExcel } from '@/utils/export-excel';
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

  it('exports portfolio data through a CSV download link', () => {
    const link = {
      download: '',
      href: '',
      style: { visibility: '' },
      setAttribute(name: string, value: string) {
        if (name === 'download') {
          this.download = value;
        }
        if (name === 'href') {
          this.href = value;
        }
      },
      click: vi.fn(),
    };
    const appendSpy = vi.fn();
    const removeSpy = vi.fn();
    vi.stubGlobal('document', {
      body: {
        appendChild: appendSpy,
        removeChild: removeSpy,
      },
      createElement: vi.fn(() => link),
    });
    const createObjectUrlMock = vi.fn(() => 'blob:wave2-report');
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createObjectUrlMock,
    });

    exportToExcel(
      {
        portfolioCompanies: [
          {
            name: 'Alpha',
            sector: 'SaaS',
            stage: 'Series A',
            investmentAmount: '5000000',
            currentValuation: '12500000',
            status: 'active',
            foundedYear: '2020',
          },
        ],
      },
      'fund-report'
    );

    expect(createObjectUrlMock).toHaveBeenCalledTimes(1);
    expect(link.click).toHaveBeenCalledTimes(1);
    expect(appendSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(link.download).toMatch(/^fund-report-\d{4}-\d{2}-\d{2}\.csv$/);
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
