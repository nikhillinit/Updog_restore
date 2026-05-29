import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { register } from 'prom-client';

describe('worker metrics registration', () => {
  beforeEach(() => {
    register.clear();
    vi.resetModules();
  });

  afterEach(() => {
    register.clear();
    vi.resetModules();
  });

  it('reuses existing prom-client metrics when the module is reloaded', async () => {
    const firstImport = await import('../../../lib/metrics');
    firstImport.metrics.recordQueueDepth('fund-scenario-calc', 'reserve', 1);

    vi.resetModules();

    await expect(import('../../../lib/metrics')).resolves.toMatchObject({
      metrics: expect.any(Object),
    });
  });
});
