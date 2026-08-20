import { describe, expect, it } from 'vitest';

import {
  matchesExpectedExecution,
  pollReleaseCanaryWorkerStatus,
  RELEASE_CANARY_WORKER_POLL_DEADLINE_MS,
  RELEASE_CANARY_WORKER_POLL_INTERVAL_MS,
  RELEASE_CANARY_WORKER_TIMEOUT,
} from '../../smoke/support/release-canary-polling';

const expectation = {
  fundId: 7,
  scenarioSetId: '11111111-1111-4111-8111-111111111111',
  jobId: 'reserve-scenario-7-job',
  correlationId: '22222222-2222-4222-8222-222222222222',
};

function manualClock(stepMs: number): { now: () => number; sleep: (ms: number) => Promise<void> } {
  let currentMs = 0;
  return {
    now: () => currentMs,
    sleep: async () => {
      currentMs += stepMs;
    },
  };
}

function successBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fundId: expectation.fundId,
    scenarioSetId: expectation.scenarioSetId,
    correlationId: expectation.correlationId,
    jobId: expectation.jobId,
    status: 'succeeded',
    snapshotId: 42,
    calculationStartedAt: '2026-08-19T00:00:00.000Z',
    ...overrides,
  };
}

describe('release canary worker polling', () => {
  it('exports a poll deadline that is bounded and positive', () => {
    expect(Number.isSafeInteger(RELEASE_CANARY_WORKER_POLL_DEADLINE_MS)).toBe(true);
    expect(RELEASE_CANARY_WORKER_POLL_DEADLINE_MS).toBeGreaterThan(0);
    expect(Number.isSafeInteger(RELEASE_CANARY_WORKER_POLL_INTERVAL_MS)).toBe(true);
    expect(RELEASE_CANARY_WORKER_POLL_INTERVAL_MS).toBeGreaterThan(0);
  });

  it('returns a validated success bound to the exact execution identity', async () => {
    const clock = manualClock(250);
    const statuses = [
      { status: 200, body: successBody({ status: 'queued', snapshotId: null }) },
      { status: 200, body: successBody({ status: 'calculating', snapshotId: null }) },
      { status: 200, body: successBody() },
    ];
    let index = 0;

    const result = await pollReleaseCanaryWorkerStatus(expectation, {
      fetchStatus: async () => statuses[Math.min(index++, statuses.length - 1)]!,
      now: clock.now,
      sleep: clock.sleep,
      deadlineMs: 10_000,
      intervalMs: 250,
    });

    expect(result.kind).toBe('succeeded');
    if (result.kind !== 'succeeded') return;
    expect(result.jobId).toBe(expectation.jobId);
    expect(result.correlationId).toBe(expectation.correlationId);
    expect(result.snapshotId).toBe(42);
    expect(result.calculationStartedAt).toBe('2026-08-19T00:00:00.000Z');
  });

  it('returns a typed timeout retaining run identity when the deadline elapses', async () => {
    const clock = manualClock(1_000);
    const result = await pollReleaseCanaryWorkerStatus(expectation, {
      fetchStatus: async () => ({
        status: 200,
        body: successBody({ status: 'queued', snapshotId: null }),
      }),
      now: clock.now,
      sleep: clock.sleep,
      deadlineMs: 3_000,
      intervalMs: 1_000,
    });

    expect(result.kind).toBe(RELEASE_CANARY_WORKER_TIMEOUT);
    if (result.kind !== RELEASE_CANARY_WORKER_TIMEOUT) return;
    expect(result.fundId).toBe(expectation.fundId);
    expect(result.scenarioSetId).toBe(expectation.scenarioSetId);
    expect(result.jobId).toBe(expectation.jobId);
    expect(result.correlationId).toBe(expectation.correlationId);
    expect(result.observedStatuses).toContain('queued');
    expect(result.lastBody).toMatchObject({ status: 'queued' });
  });

  it('cannot substitute an older successful run with a different correlation', async () => {
    const clock = manualClock(1_000);
    const olderSuccess = successBody({
      correlationId: '99999999-9999-4999-8999-999999999999',
      jobId: 'reserve-scenario-7-older-job',
    });

    const result = await pollReleaseCanaryWorkerStatus(expectation, {
      fetchStatus: async () => ({ status: 200, body: olderSuccess }),
      now: clock.now,
      sleep: clock.sleep,
      deadlineMs: 3_000,
      intervalMs: 1_000,
    });

    expect(result.kind).toBe(RELEASE_CANARY_WORKER_TIMEOUT);
    if (result.kind !== RELEASE_CANARY_WORKER_TIMEOUT) return;
    expect(result.observedStatuses).toContain('mismatched-execution');
    expect(result.correlationId).toBe(expectation.correlationId);
  });

  it('throws on a terminal failure for the exact execution', async () => {
    const clock = manualClock(250);
    await expect(
      pollReleaseCanaryWorkerStatus(expectation, {
        fetchStatus: async () => ({
          status: 200,
          body: successBody({ status: 'failed', snapshotId: null }),
        }),
        now: clock.now,
        sleep: clock.sleep,
        deadlineMs: 10_000,
        intervalMs: 250,
      })
    ).rejects.toThrow(/terminal failure for the exact execution/);
  });

  it('throws when a succeeded status carries a different job identity', async () => {
    const clock = manualClock(250);
    await expect(
      pollReleaseCanaryWorkerStatus(expectation, {
        fetchStatus: async () => ({
          status: 200,
          body: successBody({ jobId: 'some-other-job' }),
        }),
        now: clock.now,
        sleep: clock.sleep,
        deadlineMs: 10_000,
        intervalMs: 250,
      })
    ).rejects.toThrow(/different job identity/);
  });

  it('throws on a non-200 status response', async () => {
    await expect(
      pollReleaseCanaryWorkerStatus(expectation, {
        fetchStatus: async () => ({ status: 503, body: 'unavailable' }),
        deadlineMs: 1_000,
        intervalMs: 100,
      })
    ).rejects.toThrow(/returned 503/);
  });

  it('matches only the exact fund, scenario set, and correlation', () => {
    expect(matchesExpectedExecution(successBody(), expectation)).toBe(true);
    expect(
      matchesExpectedExecution(successBody({ fundId: 8 }), expectation)
    ).toBe(false);
    expect(
      matchesExpectedExecution(
        successBody({ scenarioSetId: '33333333-3333-4333-8333-333333333333' }),
        expectation
      )
    ).toBe(false);
    expect(
      matchesExpectedExecution(
        successBody({ correlationId: '99999999-9999-4999-8999-999999999999' }),
        expectation
      )
    ).toBe(false);
  });
});
