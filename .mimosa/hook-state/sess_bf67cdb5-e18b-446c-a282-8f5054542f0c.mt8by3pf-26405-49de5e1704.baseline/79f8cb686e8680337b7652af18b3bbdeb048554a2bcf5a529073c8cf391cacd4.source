// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const webVitalsHandlers = {
  lcp: vi.fn(),
  inp: vi.fn(),
  cls: vi.fn(),
  fcp: vi.fn(),
  ttfb: vi.fn(),
};

vi.mock('web-vitals', () => ({
  onLCP: webVitalsHandlers.lcp,
  onINP: webVitalsHandlers.inp,
  onCLS: webVitalsHandlers.cls,
  onFCP: webVitalsHandlers.fcp,
  onTTFB: webVitalsHandlers.ttfb,
}));

describe('Wave 5 vitals helpers', () => {
  beforeEach(() => {
    webVitalsHandlers.lcp.mockImplementation((callback: (metric: { value: number }) => void) =>
      callback({ value: 101 })
    );
    webVitalsHandlers.inp.mockImplementation((callback: (metric: { value: number }) => void) =>
      callback({ value: 202 })
    );
    webVitalsHandlers.cls.mockImplementation((callback: (metric: { value: number }) => void) =>
      callback({ value: 0.03 })
    );
    webVitalsHandlers.fcp.mockImplementation((callback: (metric: { value: number }) => void) =>
      callback({ value: 303 })
    );
    webVitalsHandlers.ttfb.mockImplementation((callback: (metric: { value: number }) => void) =>
      callback({ value: 404 })
    );
  });

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    delete window.getVitalsSnapshot;
  });

  it('collects a snapshot from the web-vitals callbacks', async () => {
    const { getVitalsSnapshot } = await import('@/vitals');

    expect(getVitalsSnapshot()).toEqual({
      lcp: 101,
      inp: 202,
      cls: 0.03,
      fcp: 303,
      ttfb: 404,
    });
  });
});
