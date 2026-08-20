import { describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';

import {
  executeReserveCalculationCommand,
  type ExecuteReserveCalculationCommandOptions,
} from '../../../server/services/fund-scenario-calculation-command-service';

const SCENARIO_SET_ID = '3d9f1f36-7b53-4de4-9f6f-2f4f9a6f9a01';
const RUN_ID = '6f1b0f52-8d4f-4a3c-9c1e-0d5a3f4b6c7d';
const CORRELATION_ID = '0b2f7d38-6c58-4f9c-a2be-6a1d2c3e4f50';
const JOB_ID = `reserve-scenario-7-${SCENARIO_SET_ID}-scenario-input-hash-v1-${'a'.repeat(64)}__run__${RUN_ID}`;

const IDENTITY = {
  fundId: 7,
  scenarioSetId: SCENARIO_SET_ID,
  sourceConfigId: 31,
  sourceConfigVersion: 4,
  currentPublishedConfigVersion: 4,
  inputHash: 'a'.repeat(64),
  inputLineage: {
    hashKind: 'scenario-input-hash-v1' as const,
    modelInputsAsOfDate: null,
    comparisonLineageVersion: null,
  },
  variantCount: 2,
};

const RUN_CONTEXT = {
  identity: IDENTITY,
  run: {
    id: RUN_ID,
    correlationId: CORRELATION_ID,
    jobId: JOB_ID,
    status: 'queued',
  },
  inserted: true,
  jobId: JOB_ID,
};

interface StoredCommand {
  id: string;
  fund_id: number;
  scenario_set_id: string;
  idempotency_key: string;
  request_hash: string;
  status: 'pending' | 'completed' | 'failed';
  run_id: string | null;
  correlation_id: string | null;
  response_status: number | null;
  response_body: unknown;
  attempt_count: number;
  lease_token: string | null;
  lease_expires_at_ms: number | null;
  failure_code: string | null;
  version: number;
}

class FakeCommandStore {
  row: StoredCommand | null = null;
  nowMs = 0;
  private nextId = 1;

  private project(row: StoredCommand) {
    return {
      id: row.id,
      status: row.status,
      request_hash: row.request_hash,
      run_id: row.run_id,
      correlation_id: row.correlation_id,
      response_status: row.response_status,
      response_body: row.response_body,
      attempt_count: row.attempt_count,
      lease_token: row.lease_token,
      lease_expires_at: row.lease_expires_at_ms,
      lease_expired: row.lease_expires_at_ms !== null && row.lease_expires_at_ms <= this.nowMs,
      failure_code: row.failure_code,
      version: row.version,
    };
  }

  query(text: string, values: unknown[]): { rows: unknown[]; rowCount: number } {
    if (text.includes('INSERT INTO fund_scenario_calculation_commands')) {
      if (this.row) return { rows: [], rowCount: 0 };
      this.row = {
        id: `command-${this.nextId++}`,
        fund_id: values[0] as number,
        scenario_set_id: values[1] as string,
        idempotency_key: values[2] as string,
        request_hash: values[3] as string,
        status: 'pending',
        run_id: null,
        correlation_id: null,
        response_status: null,
        response_body: null,
        attempt_count: 1,
        lease_token: values[4] as string,
        lease_expires_at_ms: this.nowMs + Number(values[5]),
        failure_code: null,
        version: 1,
      };
      return { rows: [this.project(this.row)], rowCount: 1 };
    }

    if (/^\s*SELECT/.test(text)) {
      return this.row ? { rows: [this.project(this.row)], rowCount: 1 } : { rows: [], rowCount: 0 };
    }

    if (text.includes("SET status = 'pending'")) {
      const [id, leaseToken, leaseMs, expectedVersion] = values as [string, string, number, number];
      const row = this.row;
      const reclaimable =
        row &&
        row.id === id &&
        row.version === expectedVersion &&
        (row.status === 'failed' ||
          (row.status === 'pending' &&
            row.lease_expires_at_ms !== null &&
            row.lease_expires_at_ms <= this.nowMs));
      if (!reclaimable || !row) return { rows: [], rowCount: 0 };
      row.status = 'pending';
      row.lease_token = leaseToken;
      row.lease_expires_at_ms = this.nowMs + Number(leaseMs);
      row.attempt_count += 1;
      row.failure_code = null;
      row.response_status = null;
      row.response_body = null;
      row.version += 1;
      return { rows: [this.project(row)], rowCount: 1 };
    }

    if (text.includes('SET run_id = $3')) {
      const [id, leaseToken, runId, correlationId, expectedVersion] = values as [
        string,
        string,
        string,
        string,
        number,
      ];
      const row = this.row;
      if (!row || row.id !== id || row.lease_token !== leaseToken || row.version !== expectedVersion) {
        return { rows: [], rowCount: 0 };
      }
      row.run_id = runId;
      row.correlation_id = correlationId;
      row.version += 1;
      return { rows: [this.project(row)], rowCount: 1 };
    }

    if (text.includes("SET status = 'completed'")) {
      const [id, leaseToken, responseJson, expectedVersion] = values as [
        string,
        string,
        string,
        number,
      ];
      const row = this.row;
      if (!row || row.id !== id || row.lease_token !== leaseToken || row.version !== expectedVersion) {
        return { rows: [], rowCount: 0 };
      }
      row.status = 'completed';
      row.response_status = 202;
      row.response_body = JSON.parse(responseJson);
      row.lease_token = null;
      row.lease_expires_at_ms = null;
      row.version += 1;
      return { rows: [{ id: row.id }], rowCount: 1 };
    }

    if (text.includes("SET status = 'failed'")) {
      const [id, leaseToken, failureCode] = values as [string, string, string];
      const row = this.row;
      if (!row || row.id !== id || row.lease_token !== leaseToken) {
        return { rows: [], rowCount: 0 };
      }
      row.status = 'failed';
      row.failure_code = failureCode;
      row.response_status = null;
      row.response_body = null;
      row.lease_token = null;
      row.lease_expires_at_ms = null;
      row.version += 1;
      return { rows: [{ id: row.id }], rowCount: 1 };
    }

    throw new Error(`FakeCommandStore does not understand statement: ${text.slice(0, 80)}`);
  }
}

function buildHarness(overrides: {
  store?: FakeCommandStore;
  getQueue?: () => unknown;
  resolveIdentity?: () => Promise<typeof IDENTITY>;
  acquireRun?: () => Promise<typeof RUN_CONTEXT>;
  ensureJob?: () => Promise<string>;
  recordQueuedEventOnce?: () => Promise<boolean>;
} = {}) {
  const store = overrides.store ?? new FakeCommandStore();
  const sleepCalls: number[] = [];
  const getQueue = vi.fn(overrides.getQueue ?? (() => ({ name: 'fund-scenario-calc' })));
  const resolveIdentity = vi.fn(overrides.resolveIdentity ?? (async () => IDENTITY));
  const acquireRun = vi.fn(overrides.acquireRun ?? (async () => RUN_CONTEXT));
  const ensureJob = vi.fn(overrides.ensureJob ?? (async () => JOB_ID));
  const recordQueuedEventOnce = vi.fn(overrides.recordQueuedEventOnce ?? (async () => true));

  let uuidCounter = 0;
  const options: ExecuteReserveCalculationCommandOptions = {
    leaseDurationMs: 30_000,
    receiptPollIntervalMs: 100,
    receiptWaitTimeoutMs: 2_000,
    now: () => store.nowMs,
    sleep: async (ms: number) => {
      sleepCalls.push(ms);
      store.nowMs += ms;
    },
    randomUUID: () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}`,
    deps: {
      transaction: (async (fn: (client: Pick<PoolClient, 'query'>) => unknown) =>
        fn({
          query: ((text: string, values: unknown[]) =>
            Promise.resolve(store.query(text, values))) as PoolClient['query'],
        })) as never,
      getQueue: getQueue as never,
      resolveIdentity: resolveIdentity as never,
      acquireRun: acquireRun as never,
      ensureJob: ensureJob as never,
      recordQueuedEventOnce: recordQueuedEventOnce as never,
    },
  };

  return { store, options, sleepCalls, getQueue, resolveIdentity, acquireRun, ensureJob, recordQueuedEventOnce };
}

const BASE_INPUT = {
  fundId: 7,
  scenarioSetId: SCENARIO_SET_ID,
  idempotencyKey: 'command-key-1',
  request: { calculationMode: 'async_reserve_allocation' as const },
  actor: { userId: 101, label: 'writer@example.com' },
};

const EXPECTED_RESPONSE = {
  fundId: 7,
  scenarioSetId: SCENARIO_SET_ID,
  calculationMode: 'async_reserve_allocation',
  status: 'queued',
  jobId: JOB_ID,
  correlationId: CORRELATION_ID,
};

describe('executeReserveCalculationCommand', () => {
  it('claims a fresh key, queues once, and finalizes a completed receipt', async () => {
    const harness = buildHarness();

    const response = await executeReserveCalculationCommand(BASE_INPUT, harness.options);

    expect(response).toEqual(EXPECTED_RESPONSE);
    expect(harness.acquireRun).toHaveBeenCalledTimes(1);
    expect(harness.ensureJob).toHaveBeenCalledTimes(1);
    expect(harness.recordQueuedEventOnce).toHaveBeenCalledTimes(1);
    expect(harness.store.row).toMatchObject({
      status: 'completed',
      response_status: 202,
      run_id: RUN_ID,
      correlation_id: CORRELATION_ID,
      lease_token: null,
      lease_expires_at_ms: null,
      attempt_count: 1,
    });
  });

  it('replays a completed receipt without touching the queue or run services', async () => {
    const harness = buildHarness();
    await executeReserveCalculationCommand(BASE_INPUT, harness.options);
    const versionAfterFirst = harness.store.row?.version;

    const replayHarness = buildHarness({ store: harness.store });
    const replay = await executeReserveCalculationCommand(BASE_INPUT, replayHarness.options);

    expect(replay).toEqual(EXPECTED_RESPONSE);
    expect(replayHarness.acquireRun).not.toHaveBeenCalled();
    expect(replayHarness.ensureJob).not.toHaveBeenCalled();
    expect(replayHarness.recordQueuedEventOnce).not.toHaveBeenCalled();
    expect(harness.store.row?.version).toBe(versionAfterFirst);
  });

  it('rejects the same key with a different request body as 422 key reuse', async () => {
    const harness = buildHarness();
    await executeReserveCalculationCommand(BASE_INPUT, harness.options);

    const conflictHarness = buildHarness({ store: harness.store });
    await expect(
      executeReserveCalculationCommand(
        { ...BASE_INPUT, request: {} },
        conflictHarness.options
      )
    ).rejects.toMatchObject({ statusCode: 422, code: 'idempotency_key_reused' });
  });

  it('rejects the same key after an input lineage change even with an unchanged body', async () => {
    const harness = buildHarness();
    await executeReserveCalculationCommand(BASE_INPUT, harness.options);

    const changedLineage = buildHarness({
      store: harness.store,
      resolveIdentity: async () => ({ ...IDENTITY, inputHash: 'b'.repeat(64) }),
    });
    await expect(
      executeReserveCalculationCommand(BASE_INPUT, changedLineage.options)
    ).rejects.toMatchObject({ statusCode: 422, code: 'idempotency_key_reused' });
  });

  it('returns 409 in-progress after bounded polling while another lease is active', async () => {
    const harness = buildHarness();
    await executeReserveCalculationCommand(BASE_INPUT, harness.options);
    const row = harness.store.row;
    if (!row) throw new Error('expected stored command');
    row.status = 'pending';
    row.response_status = null;
    row.response_body = null;
    row.lease_token = 'f0000000-0000-4000-8000-000000000001';
    row.lease_expires_at_ms = harness.store.nowMs + 60_000;

    const waiting = buildHarness({ store: harness.store });
    waiting.store.nowMs = harness.store.nowMs;
    await expect(
      executeReserveCalculationCommand(BASE_INPUT, waiting.options)
    ).rejects.toMatchObject({ statusCode: 409, code: 'idempotency_request_in_progress' });
    expect(waiting.sleepCalls.length).toBeGreaterThanOrEqual(19);
    expect(waiting.sleepCalls.every((ms) => ms === 100)).toBe(true);
  });

  it('returns the stored response when the concurrent owner completes during polling', async () => {
    const harness = buildHarness();
    await executeReserveCalculationCommand(BASE_INPUT, harness.options);
    const row = harness.store.row;
    if (!row) throw new Error('expected stored command');
    const completedBody = row.response_body;
    row.status = 'pending';
    row.response_status = null;
    row.response_body = null;
    row.lease_token = 'f0000000-0000-4000-8000-000000000001';
    row.lease_expires_at_ms = harness.store.nowMs + 60_000;

    const waiting = buildHarness({ store: harness.store });
    waiting.store.nowMs = harness.store.nowMs;
    const originalSleep = waiting.options.sleep;
    let ticks = 0;
    waiting.options.sleep = async (ms) => {
      await originalSleep?.(ms);
      if (++ticks === 3) {
        row.status = 'completed';
        row.response_status = 202;
        row.response_body = completedBody;
        row.lease_token = null;
        row.lease_expires_at_ms = null;
      }
    };

    const response = await executeReserveCalculationCommand(BASE_INPUT, waiting.options);
    expect(response).toEqual(EXPECTED_RESPONSE);
    expect(waiting.acquireRun).not.toHaveBeenCalled();
  });

  it('reclaims a failed receipt and increments the attempt count', async () => {
    const failing = buildHarness({
      ensureJob: async () => {
        throw new Error('redis timeout with secret://credential');
      },
    });
    await expect(executeReserveCalculationCommand(BASE_INPUT, failing.options)).rejects.toMatchObject(
      { code: 'reserve_calculation_enqueue_uncertain' }
    );
    expect(failing.store.row).toMatchObject({
      status: 'failed',
      failure_code: 'QUEUE_ENQUEUE_UNCERTAIN',
      lease_token: null,
    });
    expect(JSON.stringify(failing.store.row)).not.toContain('secret://credential');

    const retry = buildHarness({ store: failing.store });
    const response = await executeReserveCalculationCommand(BASE_INPUT, retry.options);
    expect(response).toEqual(EXPECTED_RESPONSE);
    expect(retry.store.row).toMatchObject({ status: 'completed', attempt_count: 2 });
  });

  it('reclaims an expired pending lease', async () => {
    const harness = buildHarness();
    await executeReserveCalculationCommand(BASE_INPUT, harness.options);
    const row = harness.store.row;
    if (!row) throw new Error('expected stored command');
    row.status = 'pending';
    row.response_status = null;
    row.response_body = null;
    row.run_id = null;
    row.correlation_id = null;
    row.lease_token = 'f0000000-0000-4000-8000-000000000002';
    row.lease_expires_at_ms = harness.store.nowMs - 1;

    const reclaim = buildHarness({ store: harness.store });
    reclaim.store.nowMs = harness.store.nowMs;
    const response = await executeReserveCalculationCommand(BASE_INPUT, reclaim.options);
    expect(response).toEqual(EXPECTED_RESPONSE);
    expect(reclaim.store.row).toMatchObject({ status: 'completed', attempt_count: 2 });
  });

  it('stores QUEUE_UNAVAILABLE and rethrows the 503 contract when the queue is down', async () => {
    const queueError = Object.assign(new Error('Fund scenario calculation queue is not available'), {
      statusCode: 503,
      code: 'scenario_calculation_queue_unavailable',
    });
    const harness = buildHarness({
      getQueue: () => {
        throw queueError;
      },
    });

    await expect(executeReserveCalculationCommand(BASE_INPUT, harness.options)).rejects.toBe(
      queueError
    );
    expect(harness.store.row).toMatchObject({
      status: 'failed',
      failure_code: 'QUEUE_UNAVAILABLE',
      lease_token: null,
      run_id: null,
      correlation_id: null,
    });
  });

  it('stores QUEUE_ENQUEUE_UNCERTAIN when the queued-event write fails after enqueue', async () => {
    const harness = buildHarness({
      recordQueuedEventOnce: async () => {
        throw new Error('connection reset by peer at redis://user:pass@host');
      },
    });

    await expect(executeReserveCalculationCommand(BASE_INPUT, harness.options)).rejects.toMatchObject(
      { statusCode: 500, code: 'reserve_calculation_enqueue_uncertain' }
    );
    expect(harness.store.row?.failure_code).toBe('QUEUE_ENQUEUE_UNCERTAIN');
    expect(JSON.stringify(harness.store.row)).not.toContain('redis://user:pass@host');
  });

  it('stores COMMAND_FAILED for other owner-path failures and rethrows the original error', async () => {
    const originalError = new Error('run acquisition failed');
    const harness = buildHarness({
      acquireRun: async () => {
        throw originalError;
      },
    });

    await expect(executeReserveCalculationCommand(BASE_INPUT, harness.options)).rejects.toBe(
      originalError
    );
    expect(harness.store.row?.failure_code).toBe('COMMAND_FAILED');
  });

  it('cannot finalize with a stale lease token', async () => {
    const harness = buildHarness({
      ensureJob: async () => {
        const row = harness.store.row;
        if (row) {
          row.lease_token = 'f0000000-0000-4000-8000-000000000003';
          row.lease_expires_at_ms = harness.store.nowMs + 60_000;
        }
        return JOB_ID;
      },
    });

    await expect(executeReserveCalculationCommand(BASE_INPUT, harness.options)).rejects.toMatchObject(
      { statusCode: 409, code: 'idempotency_request_in_progress' }
    );
    expect(harness.store.row?.status).not.toBe('completed');
  });

  it('reuses the persisted run identity for a different key on the same lineage', async () => {
    const first = buildHarness();
    await executeReserveCalculationCommand(BASE_INPUT, first.options);

    const secondStore = new FakeCommandStore();
    const second = buildHarness({
      store: secondStore,
      acquireRun: async () => ({ ...RUN_CONTEXT, inserted: false }),
    });
    const response = await executeReserveCalculationCommand(
      { ...BASE_INPUT, idempotencyKey: 'command-key-2' },
      second.options
    );

    expect(response).toEqual(EXPECTED_RESPONSE);
    expect(secondStore.row).toMatchObject({
      status: 'completed',
      run_id: RUN_ID,
      correlation_id: CORRELATION_ID,
    });
  });
});
