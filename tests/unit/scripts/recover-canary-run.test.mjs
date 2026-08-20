import { describe, expect, it, vi } from 'vitest';

import {
  RECOVER_CANARY_EXIT_CODES,
  RECOVER_CANARY_MARK_FAILED_QUERY,
  RECOVER_CANARY_RESOLVE_QUERY,
  parseRecoverCanaryArgs,
  proveMarkFailedTarget,
  resolveRecoveryHandle,
  runCanaryRecovery,
} from '../../../scripts/release/recover-canary-run.mjs';

const SHA = 'a'.repeat(40);
const WRONG_SHA = 'b'.repeat(40);
const FUND_ID = 4242;
const RUN_UUID = '0b9f9d0e-3f6a-4f4e-8a83-0f6cf2f9a111';
const OTHER_RUN_UUID = '1c8e8c1f-4e5b-4a3d-9b94-1e7de3e8b222';
const GITHUB_RUN_ID = '17178572726';
const GITHUB_RUN_ATTEMPT = 2;

const RESOLVE_ARGS = Object.freeze([
  'resolve',
  '--github-run-id', GITHUB_RUN_ID,
  '--github-run-attempt', String(GITHUB_RUN_ATTEMPT),
  '--expected-sha', SHA,
]);

const MARK_FAILED_ARGS = Object.freeze([
  'mark-failed',
  '--github-run-id', GITHUB_RUN_ID,
  '--github-run-attempt', String(GITHUB_RUN_ATTEMPT),
  '--fund-id', String(FUND_ID),
  '--canary-run-id', RUN_UUID,
  '--expected-sha', SHA,
]);

function resolveRow(overrides = {}) {
  return {
    runId: RUN_UUID,
    runStatus: 'created',
    runVersion: 1,
    runReleaseSha: SHA,
    runWorkflowRunId: GITHUB_RUN_ID,
    runWorkflowRunAttempt: GITHUB_RUN_ATTEMPT,
    fundId: FUND_ID,
    fundDataOrigin: 'release_canary',
    ...overrides,
  };
}

function markFailedRow(overrides = {}) {
  return {
    fundId: FUND_ID,
    fundDataOrigin: 'release_canary',
    fundCanaryRunId: RUN_UUID,
    runId: RUN_UUID,
    runStatus: 'created',
    runVersion: 1,
    runReleaseSha: SHA,
    runWorkflowRunId: GITHUB_RUN_ID,
    runWorkflowRunAttempt: GITHUB_RUN_ATTEMPT,
    principalIsReleaseCanary: true,
    grantUserId: 19,
    ...overrides,
  };
}

const RESOLVE_OPTIONS = Object.freeze({
  githubRunId: GITHUB_RUN_ID,
  githubRunAttempt: GITHUB_RUN_ATTEMPT,
  expectedSha: SHA,
});

const MARK_FAILED_OPTIONS = Object.freeze({
  ...RESOLVE_OPTIONS,
  fundId: FUND_ID,
  canaryRunId: RUN_UUID,
});

function runMarkFailed(overrides = {}) {
  const transitionRun = overrides.transitionRun ?? vi.fn().mockResolvedValue({ total: 4 });
  const initialRows = overrides.initialRows ?? [markFailedRow()];
  const reloadedRows = overrides.reloadedRows ?? [markFailedRow({ runStatus: 'failed', runVersion: 2 })];
  let call = 0;
  const queryMarkFailedRows =
    overrides.queryMarkFailedRows ??
    vi.fn().mockImplementation(async () => {
      call += 1;
      return call === 1 ? initialRows : reloadedRows;
    });
  const output = [];
  const errors = [];
  const exitCodePromise = runCanaryRecovery({
    args: overrides.args ?? [...MARK_FAILED_ARGS],
    env: overrides.env ?? { DATABASE_URL: 'postgres://recovery.example.test/canary' },
    queryMarkFailedRows,
    transitionRun,
    output: (line) => output.push(line),
    errorOutput: (line) => errors.push(line),
  });
  return { exitCodePromise, transitionRun, queryMarkFailedRows, output, errors };
}

describe('recover-canary-run argument parsing', () => {
  it('parses both explicit modes with their exact flags', () => {
    expect(parseRecoverCanaryArgs([...RESOLVE_ARGS])).toEqual({
      mode: 'resolve',
      githubRunId: GITHUB_RUN_ID,
      githubRunAttempt: GITHUB_RUN_ATTEMPT,
      expectedSha: SHA,
    });
    expect(parseRecoverCanaryArgs([...MARK_FAILED_ARGS])).toEqual({
      mode: 'mark-failed',
      githubRunId: GITHUB_RUN_ID,
      githubRunAttempt: GITHUB_RUN_ATTEMPT,
      fundId: FUND_ID,
      canaryRunId: RUN_UUID,
      expectedSha: SHA,
    });
  });

  it('requires an explicit mode and rejects unknown modes', () => {
    expect(() => parseRecoverCanaryArgs([])).toThrow(/mode/);
    expect(() => parseRecoverCanaryArgs(['purge'])).toThrow(/mode/);
    expect(() => parseRecoverCanaryArgs(undefined)).toThrow(/mode/);
  });

  it('rejects flags outside the mode contract', () => {
    expect(() =>
      parseRecoverCanaryArgs([...RESOLVE_ARGS, '--fund-id', String(FUND_ID)])
    ).toThrow(/Unknown argument/);
    expect(() =>
      parseRecoverCanaryArgs([...MARK_FAILED_ARGS, '--complete-current-run', 'x'])
    ).toThrow(/Unknown argument/);
  });

  it('rejects duplicate, dangling, and missing flags', () => {
    expect(() =>
      parseRecoverCanaryArgs([...RESOLVE_ARGS, '--expected-sha', SHA])
    ).toThrow(/Duplicate/);
    expect(() => parseRecoverCanaryArgs(['resolve', '--expected-sha'])).toThrow(
      /--name value pairs/
    );
    expect(() =>
      parseRecoverCanaryArgs([
        'resolve',
        '--github-run-id', GITHUB_RUN_ID,
        '--github-run-attempt', String(GITHUB_RUN_ATTEMPT),
      ])
    ).toThrow(/--expected-sha is required/);
    expect(() =>
      parseRecoverCanaryArgs([
        'mark-failed',
        '--github-run-id', GITHUB_RUN_ID,
        '--github-run-attempt', String(GITHUB_RUN_ATTEMPT),
        '--fund-id', String(FUND_ID),
        '--expected-sha', SHA,
      ])
    ).toThrow(/--canary-run-id is required/);
  });

  it.each([
    ['--github-run-id', '0123'],
    ['--github-run-id', 'abc'],
    ['--github-run-attempt', '0'],
    ['--github-run-attempt', '1.5'],
    ['--fund-id', '-1'],
    ['--canary-run-id', 'not-a-uuid'],
    ['--expected-sha', 'not-a-sha'],
  ])('rejects malformed %s value %s', (flag, value) => {
    const args = [...MARK_FAILED_ARGS];
    args[args.indexOf(flag) + 1] = value;
    expect(() => parseRecoverCanaryArgs(args)).toThrow();
  });
});

describe('recover-canary-run resolve mode', () => {
  it('selects only by unique workflow execution identity', () => {
    expect(RECOVER_CANARY_RESOLVE_QUERY).toContain('WHERE r.workflow_run_id = $1');
    expect(RECOVER_CANARY_RESOLVE_QUERY).toContain('AND r.workflow_run_attempt = $2');
    expect(RECOVER_CANARY_RESOLVE_QUERY).not.toMatch(/release_sha\s*=/);
    expect(RECOVER_CANARY_RESOLVE_QUERY).not.toMatch(/created_at|ORDER BY|LIMIT/);
  });

  it('outputs exactly the non-secret recovery handle', async () => {
    const output = [];
    const queryResolveRows = vi.fn().mockResolvedValue([resolveRow()]);

    await expect(
      runCanaryRecovery({
        args: [...RESOLVE_ARGS],
        env: { DATABASE_URL: 'postgres://recovery.example.test/canary' },
        queryResolveRows,
        output: (line) => output.push(line),
        errorOutput: () => undefined,
      })
    ).resolves.toBe(RECOVER_CANARY_EXIT_CODES.SUCCESS);

    expect(queryResolveRows).toHaveBeenCalledWith(GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT);
    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0])).toEqual({
      schemaVersion: 'release-canary-recovery-handle-v1',
      githubRunId: GITHUB_RUN_ID,
      githubRunAttempt: GITHUB_RUN_ATTEMPT,
      fundId: FUND_ID,
      canaryRunId: RUN_UUID,
      releaseSha: SHA,
    });
  });

  it.each([
    ['no rows', []],
    ['duplicate rows', [resolveRow(), resolveRow()]],
    ['wrong SHA', [resolveRow({ runReleaseSha: WRONG_SHA })]],
    ['wrong workflow run', [resolveRow({ runWorkflowRunId: '999999' })]],
    ['wrong attempt', [resolveRow({ runWorkflowRunAttempt: 3 })]],
    ['ordinary fund origin', [resolveRow({ fundDataOrigin: 'production' })]],
    ['corrupt run ID', [resolveRow({ runId: 'not-a-uuid' })]],
    ['corrupt fund ID', [resolveRow({ fundId: 'abc' })]],
  ])('fails resolve for %s', (_label, rows) => {
    expect(() => resolveRecoveryHandle({ rows, options: RESOLVE_OPTIONS })).toThrow();
  });
});

describe('recover-canary-run mark-failed mode', () => {
  it('joins the full recovery handle before any transition', () => {
    for (const fragment of [
      'JOIN release_canary_runs AS r ON r.id = f.canary_run_id',
      'JOIN users AS u ON u.id = r.principal_user_id',
      'JOIN user_fund_grants AS g ON g.user_id = r.principal_user_id AND g.fund_id = f.id',
      'WHERE f.id = $1',
      'AND r.workflow_run_id = $2',
      'AND r.workflow_run_attempt = $3',
    ]) {
      expect(RECOVER_CANARY_MARK_FAILED_QUERY).toContain(fragment);
    }
  });

  it('marks the exact created run failed through the version fence', async () => {
    const { exitCodePromise, transitionRun, queryMarkFailedRows, output } = runMarkFailed();

    await expect(exitCodePromise).resolves.toBe(RECOVER_CANARY_EXIT_CODES.SUCCESS);
    expect(transitionRun).toHaveBeenCalledOnce();
    expect(transitionRun).toHaveBeenCalledWith(RUN_UUID, 'failed', 1, ['created', 'running']);
    expect(queryMarkFailedRows).toHaveBeenCalledTimes(2);
    expect(queryMarkFailedRows).toHaveBeenCalledWith(FUND_ID, GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT);
    expect(JSON.parse(output[0])).toMatchObject({
      mode: 'mark-failed',
      outcome: 'marked-failed',
      status: 'failed',
    });
  });

  it('verifies an already-failed run as idempotent success', async () => {
    const { exitCodePromise, transitionRun, output } = runMarkFailed({
      initialRows: [markFailedRow({ runStatus: 'failed', runVersion: 3 })],
    });

    await expect(exitCodePromise).resolves.toBe(RECOVER_CANARY_EXIT_CODES.SUCCESS);
    expect(transitionRun).toHaveBeenCalledWith(RUN_UUID, 'failed', 3, ['created', 'running']);
    expect(JSON.parse(output[0])).toMatchObject({ outcome: 'already-failed', status: 'failed' });
  });

  it('treats an already-completed run as a verified no-op with distinct status', async () => {
    const { exitCodePromise, transitionRun, queryMarkFailedRows, output } = runMarkFailed({
      initialRows: [markFailedRow({ runStatus: 'completed', runVersion: 2 })],
    });

    await expect(exitCodePromise).resolves.toBe(RECOVER_CANARY_EXIT_CODES.SUCCESS);
    expect(transitionRun).not.toHaveBeenCalled();
    expect(queryMarkFailedRows).toHaveBeenCalledTimes(1);
    expect(JSON.parse(output[0])).toMatchObject({
      outcome: 'noop-already-completed',
      status: 'completed',
    });
  });

  it('can never request a completed transition', async () => {
    const { exitCodePromise, transitionRun } = runMarkFailed();
    await exitCodePromise;
    for (const call of transitionRun.mock.calls) {
      expect(call[1]).toBe('failed');
    }
  });

  it.each([
    ['wrong fund ID', [markFailedRow({ fundId: FUND_ID + 1 })]],
    ['ordinary fund origin', [markFailedRow({ fundDataOrigin: 'production' })]],
    ['fund-run link mismatch', [markFailedRow({ fundCanaryRunId: OTHER_RUN_UUID })]],
    ['wrong canary run', [markFailedRow({ runId: OTHER_RUN_UUID, fundCanaryRunId: OTHER_RUN_UUID })]],
    ['wrong workflow run', [markFailedRow({ runWorkflowRunId: '999999' })]],
    ['null workflow run', [markFailedRow({ runWorkflowRunId: null })]],
    ['wrong attempt', [markFailedRow({ runWorkflowRunAttempt: 3 })]],
    ['wrong SHA', [markFailedRow({ runReleaseSha: WRONG_SHA })]],
    ['principal flag false', [markFailedRow({ principalIsReleaseCanary: false })]],
    ['missing grant', [markFailedRow({ grantUserId: null })]],
    ['invalid version', [markFailedRow({ runVersion: 0 })]],
    ['duplicate join', [markFailedRow(), markFailedRow()]],
    ['no rows', []],
    ['expired status', [markFailedRow({ runStatus: 'expired' })]],
    ['purged status', [markFailedRow({ runStatus: 'purged' })]],
  ])('refuses mark-failed for %s', (_label, rows) => {
    expect(() => proveMarkFailedTarget({ rows, options: MARK_FAILED_OPTIONS })).toThrow();
  });

  it('surfaces a stale version fence without raw database errors', async () => {
    const conflict = new Error('Release canary run version conflict');
    conflict.name = 'CanaryRunTransitionConflictError';
    const { exitCodePromise, output, errors } = runMarkFailed({
      transitionRun: vi.fn().mockRejectedValue(conflict),
    });

    await expect(exitCodePromise).resolves.toBe(RECOVER_CANARY_EXIT_CODES.RECOVERY_FAILURE);
    expect(JSON.parse(output[0])).toMatchObject({
      outcome: 'recovery-failure',
      reason: 'Release canary run version conflict',
    });
    expect(errors).toEqual(['Release canary run version conflict']);
  });

  it('fails closed when the reloaded run is not failed', async () => {
    const { exitCodePromise, output } = runMarkFailed({
      reloadedRows: [markFailedRow({ runStatus: 'running' })],
    });

    await expect(exitCodePromise).resolves.toBe(RECOVER_CANARY_EXIT_CODES.RECOVERY_FAILURE);
    expect(JSON.parse(output[0]).reason).toMatch(/did not reach failed/);
  });

  it('fails closed when the reload returns a different run identity', async () => {
    const { exitCodePromise, output } = runMarkFailed({
      reloadedRows: [
        markFailedRow({
          runId: OTHER_RUN_UUID,
          fundCanaryRunId: OTHER_RUN_UUID,
          runStatus: 'failed',
        }),
      ],
    });

    await expect(exitCodePromise).resolves.toBe(RECOVER_CANARY_EXIT_CODES.RECOVERY_FAILURE);
    expect(JSON.parse(output[0]).reason).toMatch(/different run/);
  });

  it('keeps raw database failures and credentials out of every output line', async () => {
    const rawDatabaseError = new Error(
      'connect ECONNREFUSED 10.0.0.9:5432 password=super-secret'
    );
    const { exitCodePromise, output, errors } = runMarkFailed({
      queryMarkFailedRows: vi.fn().mockRejectedValue(rawDatabaseError),
    });

    await expect(exitCodePromise).resolves.toBe(RECOVER_CANARY_EXIT_CODES.RECOVERY_FAILURE);
    for (const line of [...output, ...errors]) {
      expect(line).not.toContain('super-secret');
      expect(line).not.toContain('ECONNREFUSED');
    }
  });

  it('rejects memory DATABASE_URL before any query', async () => {
    const { exitCodePromise, queryMarkFailedRows, transitionRun } = runMarkFailed({
      env: { DATABASE_URL: 'memory://canary' },
    });

    await expect(exitCodePromise).resolves.toBe(RECOVER_CANARY_EXIT_CODES.INVALID_ARGUMENT);
    expect(queryMarkFailedRows).not.toHaveBeenCalled();
    expect(transitionRun).not.toHaveBeenCalled();
  });
});
