import { describe, expect, it, vi } from 'vitest';

import { runInspectorProfiles } from '../../../audit/knowledge-graph/scripts/inspector-runner.mjs';

describe('runInspectorProfiles', () => {
  it('returns documents in profile-list order despite out-of-order completion', { retry: 0 }, async () => {
    const delays = { a: 30, b: 5, c: 15 };
    const docs = await runInspectorProfiles({
      profiles: ['a', 'b', 'c'],
      concurrency: 3,
      spawnProfile: (p) => new Promise((res) => globalThis.setTimeout(() => res({ profile: p }), delays[p])),
      log: () => {},
    });
    expect(docs.map((d) => d.profile)).toEqual(['a', 'b', 'c']);
  });

  it('first failure aborts active siblings and schedules nothing new', { retry: 0 }, async () => {
    const aborted = [];
    const spawnProfile = (p, { signal }) => p === 'bad'
      ? Promise.reject(new Error('boom'))
      : new Promise((_res, rej) => signal.addEventListener('abort', () => { aborted.push(p); rej(new Error('aborted')); }));
    await expect(runInspectorProfiles({
      profiles: ['slow1', 'bad', 'slow2', 'never'], concurrency: 3, spawnProfile, log: () => {},
    })).rejects.toThrow('boom');
    expect(aborted.sort()).toEqual(['slow1', 'slow2']); // 'never' was never scheduled
  });

  it('enforces per-profile timeout and reports active_children 0 on every exit path', { retry: 0 }, async () => {
    const events = [];
    await expect(runInspectorProfiles({
      profiles: ['hang'], perProfileTimeoutMs: 20,
      spawnProfile: (_p, { signal }) => new Promise((_res, rej) => signal.addEventListener('abort', () => rej(new Error('aborted')))),
      log: (e) => events.push(e),
    })).rejects.toThrow(/timeout/i);
    expect(events.at(-1)).toMatchObject({ active_children: 0 });
  });

  it('enforces the aggregate deadline across all profiles and reports active_children 0', { retry: 0 }, async () => {
    vi.useFakeTimers();
    try {
      const events = [];
      const spawnProfile = (_p, { signal }) => new Promise((_res, rej) => {
        signal.addEventListener('abort', () => rej(new Error('aborted')));
      });
      const promise = runInspectorProfiles({
        profiles: ['p1', 'p2'],
        concurrency: 2,
        aggregateTimeoutMs: 100,
        perProfileTimeoutMs: 10_000,
        spawnProfile,
        log: (e) => events.push(e),
      });
      const expectation = expect(promise).rejects.toThrow(/aggregate/i);
      await vi.advanceTimersByTimeAsync(100);
      await expectation;
      expect(events.at(-1)).toMatchObject({ active_children: 0 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits for a slow-to-settle spawnProfile before reporting active_children 0', { retry: 0 }, async () => {
    // Simulates the production wrapper's SIGTERM -> wait -> SIGKILL -> wait
    // escalation: spawnProfile does not settle the instant abort() is
    // called, it settles some time later. The runner must not report
    // active_children: 0 until that settlement actually happens.
    let settled = false;
    const events = [];
    const spawnProfile = (_p, { signal }) => new Promise((_res, rej) => {
      signal.addEventListener('abort', () => {
        globalThis.setTimeout(() => {
          settled = true;
          rej(new Error('aborted'));
        }, 25);
      });
    });
    await expect(runInspectorProfiles({
      profiles: ['hang'],
      perProfileTimeoutMs: 10,
      spawnProfile,
      log: (e) => events.push(e),
    })).rejects.toThrow(/timeout/i);
    expect(settled).toBe(true);
    expect(events.at(-1)).toMatchObject({ active_children: 0 });
  });
});
