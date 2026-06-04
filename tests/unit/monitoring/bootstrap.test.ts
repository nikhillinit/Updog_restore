// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { bootstrapMonitoring } from '@/monitoring/bootstrap';

describe('monitoring bootstrap', () => {
  it('does not load monitoring or vitals outside production', () => {
    const loadMonitoring = vi.fn();
    const loadVitals = vi.fn();

    bootstrapMonitoring({
      env: { PROD: false, VITE_SENTRY_DSN: 'https://example.test/sentry' },
      loadMonitoring,
      loadVitals,
    });

    expect(loadMonitoring).not.toHaveBeenCalled();
    expect(loadVitals).not.toHaveBeenCalled();
  });

  it('loads Sentry only when configured and schedules vitals in production', async () => {
    const startVitals = vi.fn();
    const loadMonitoring = vi.fn().mockResolvedValue({});
    const loadVitals = vi.fn().mockResolvedValue({ startVitals });

    bootstrapMonitoring({
      env: { PROD: true, VITE_SENTRY_DSN: 'https://example.test/sentry' },
      loadMonitoring,
      loadVitals,
      scheduleIdle: (callback) => callback(),
    });

    await vi.waitFor(() => expect(startVitals).toHaveBeenCalledTimes(1));
    expect(loadMonitoring).toHaveBeenCalledTimes(1);
    expect(loadVitals).toHaveBeenCalledTimes(1);
  });

  it('skips Sentry without a DSN but still starts production vitals', async () => {
    const startVitals = vi.fn();
    const loadMonitoring = vi.fn().mockResolvedValue({});
    const loadVitals = vi.fn().mockResolvedValue({ startVitals });

    bootstrapMonitoring({
      env: { PROD: true },
      loadMonitoring,
      loadVitals,
      scheduleIdle: (callback) => callback(),
    });

    await vi.waitFor(() => expect(startVitals).toHaveBeenCalledTimes(1));
    expect(loadMonitoring).not.toHaveBeenCalled();
    expect(loadVitals).toHaveBeenCalledTimes(1);
  });
});
