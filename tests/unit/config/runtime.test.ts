// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeConfig } from '../../../client/src/config/runtime';

function makeResponse(body: Partial<RuntimeConfig>): Response {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

describe('runtime config', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-26T00:00:00.000Z'));
  });

  it('merges fetched runtime config with defaults and notifies subscribers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({
        thresholds: { errorScore: 42 },
        killSwitches: { emergencyRollback: true },
        version: 'remote-v1',
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { getRuntimeConfig, subscribeRuntimeConfig } = await import('../../../client/src/config/runtime');
    const onUpdate = vi.fn();
    const unsubscribe = subscribeRuntimeConfig(onUpdate);

    const config = await getRuntimeConfig(true);

    expect(config.thresholds.errorScore).toBe(42);
    expect(config.thresholds.consecutiveHighScore).toBe(3);
    expect(config.killSwitches.emergencyRollback).toBe(true);
    expect(config.version).toBe('remote-v1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith(config);

    unsubscribe();
  });

  it('caches successful fetches and falls back to defaults on errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse({ version: 'cached-v1' }))
      .mockRejectedValueOnce(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const { getRuntimeConfig } = await import('../../../client/src/config/runtime');

    const first = await getRuntimeConfig();
    const second = await getRuntimeConfig();
    const forced = await getRuntimeConfig(true);

    expect(first.version).toBe('cached-v1');
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(forced.version).toBe('ev1');
    expect(forced.killSwitches.emergencyRollback).toBe(false);
  });
});
