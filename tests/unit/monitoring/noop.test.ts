import { describe, expect, it, vi } from 'vitest';
import noopMonitoring, { configureScope, withScope } from '@/monitoring/noop';

describe('Wave 5 monitoring noop shim', () => {
  it('invokes scope callbacks with a no-op scope surface', () => {
    const callback = vi.fn((scope: Parameters<typeof withScope>[0] extends (scope: infer T) => void ? T : never) => {
      scope.setMeasurement('lcp', 1200);
      scope.setTag('env', 'test');
      scope.setContext('web-vitals', { enabled: false });
      scope.setUser({ id: 'user-1' });
      scope.setLevel('info');
    });

    withScope(callback);
    configureScope(callback);

    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('exports the full noop monitoring facade as the default export', () => {
    expect(noopMonitoring.captureException()).toBe('');
    expect(noopMonitoring.captureMessage()).toBe('');
    expect(noopMonitoring.browserTracingIntegration()).toEqual({});
    expect(noopMonitoring.replayIntegration()).toEqual({});
  });
});
