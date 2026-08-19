import { describe, expect, it, vi } from 'vitest';

import {
  CANARY_RESIDUE_EXIT_CODES,
  RELEASE_CANARY_EXACT_RUN_QUERY,
  RELEASE_CANARY_RUNS_QUERY,
  assertExactRunResidueWithinReservation,
  evaluateCanaryResidue,
  parseCanaryResidueArgs,
  proveExactCurrentExecution,
  runCanaryResidueAssertion,
} from '../../../scripts/release/assert-canary-residue.mjs';

const SHA = 'a'.repeat(40);
const WRONG_SHA = 'b'.repeat(40);
const NOW = Date.parse('2026-08-10T12:00:00.000Z');
const FUND_ID = 4242;
const RUN_UUID = '0b9f9d0e-3f6a-4f4e-8a83-0f6cf2f9a111';
const OTHER_RUN_UUID = '1c8e8c1f-4e5b-4a3d-9b94-1e7de3e8b222';
const GITHUB_RUN_ID = '17178572726';
const GITHUB_RUN_ATTEMPT = 2;
const STARTED_AT = '2026-08-10T11:55:00.000Z';
const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
const MAX_ECMASCRIPT_TIME_MS = 8_640_000_000_000_000;
const INVALID_ROW_COUNT_VALUES = [
  [null, 0],
  [true, 1],
  [false, 0],
  [[], 0],
  [{}, 0],
  ['', 0],
  ['1', 1],
];
const INVALID_POLICY_CAP_VALUES = [null, true, false, [], {}, '', '1'];

const RESIDUE_GROUPS = [
  'portfolioCompany',
  'fund',
  'fundConfig',
  'fundEvent',
  'notification',
  'grant',
  'calculation',
  'mutationReceipt',
  'scenario',
  'reporting',
];
const THREE_RUN_POLICY = {
  portfolioCompany: 3, fund: 3, fundConfig: 3, fundEvent: 12, notification: 0,
  grant: 3, calculation: 36, mutationReceipt: 6, scenario: 21, reporting: 33,
  total: 120, ttlHours: 24,
};

function policy(overrides = {}) {
  return {
    ...Object.fromEntries(RESIDUE_GROUPS.map((group) => [group, 10])),
    total: 100,
    ttlHours: 24,
    ...overrides,
  };
}

function counts(overrides = {}) {
  return {
    ...Object.fromEntries(RESIDUE_GROUPS.map((group) => [`${group}ResidueCount`, 0])),
    totalResidueCount: 0,
    ...overrides,
  };
}

function row(overrides = {}) {
  return {
    releaseSha: SHA,
    status: 'completed',
    createdAt: '2026-08-10T10:00:00.000Z',
    expiresAt: '2026-08-11T10:00:00.000Z',
    purgedAt: null,
    ...Object.fromEntries(RESIDUE_GROUPS.map((group) => [`${group}ResidueCount`, 1])),
    totalResidueCount: 10,
    ...overrides,
  };
}

function evaluate(rows, policyOverrides = {}, options = {}) {
  return evaluateCanaryResidue({
    expectedSha: SHA,
    rows,
    policy: policy(policyOverrides),
    now: NOW,
    ...options,
  });
}

const EXACT_ARGS = Object.freeze([
  '--expected-sha', SHA,
  '--expected-fund-id', String(FUND_ID),
  '--expected-canary-run-id', RUN_UUID,
  '--github-run-id', GITHUB_RUN_ID,
  '--github-run-attempt', String(GITHUB_RUN_ATTEMPT),
  '--started-at', STARTED_AT,
  '--max-clock-skew-seconds', '300',
  '--complete-current-run',
]);

const RESERVED = Object.freeze({
  ...Object.fromEntries(RESIDUE_GROUPS.map((group) => [group, 5])),
  total: 50,
});

function exactRunRow(overrides = {}) {
  return {
    fundId: FUND_ID,
    fundDataOrigin: 'release_canary',
    fundCanaryRunId: RUN_UUID,
    runId: RUN_UUID,
    runVersion: 1,
    runStatus: 'created',
    runReleaseSha: SHA,
    runWorkflowRunId: GITHUB_RUN_ID,
    runWorkflowRunAttempt: GITHUB_RUN_ATTEMPT,
    runCreatedAt: '2026-08-10T11:56:00.000Z',
    principalIsReleaseCanary: true,
    grantUserId: 19,
    ...overrides,
  };
}

function exactCounts(overrides = {}) {
  return {
    ...Object.fromEntries(RESIDUE_GROUPS.map((group) => [group, 0])),
    fund: 1,
    fundConfig: 1,
    fundEvent: 1,
    grant: 1,
    total: 4,
    ...overrides,
  };
}

function prove(overrides = {}) {
  return proveExactCurrentExecution({
    rows: [exactRunRow()],
    expectedFundId: FUND_ID,
    expectedCanaryRunId: RUN_UUID,
    githubRunId: GITHUB_RUN_ID,
    githubRunAttempt: GITHUB_RUN_ATTEMPT,
    expectedSha: SHA,
    startedAt: STARTED_AT,
    maxClockSkewSeconds: 300,
    terminalStatus: 'completed',
    now: NOW,
    ...overrides,
  });
}

function runExact(overrides = {}) {
  const transitionRun =
    overrides.transitionRun ?? vi.fn().mockResolvedValue(exactCounts());
  const exactRows = overrides.exactRows ?? [exactRunRow()];
  const reloadedRows =
    overrides.reloadedRows ?? [exactRunRow({ runStatus: 'completed', runVersion: 2 })];
  let exactQueryCall = 0;
  const queryExactRunRows =
    overrides.queryExactRunRows ??
    vi.fn().mockImplementation(async () => {
      exactQueryCall += 1;
      return exactQueryCall === 1 ? exactRows : reloadedRows;
    });
  const output = [];
  const errors = [];
  const exitCodePromise = runCanaryResidueAssertion({
    args: overrides.args ?? [...EXACT_ARGS],
    env: overrides.env ?? { DATABASE_URL: 'postgres://read-only.example.test/canary' },
    ...('readRuntimePolicy' in overrides
      ? overrides.readRuntimePolicy !== undefined && { readRuntimePolicy: overrides.readRuntimePolicy }
      : { readRuntimePolicy: () => policy() }),
    readReservedResidue: overrides.readReservedResidue ?? (() => RESERVED),
    queryRows: overrides.queryRows ?? (async () => [row()]),
    queryExactRunRows,
    transitionRun,
    now: () => NOW,
    output: (line) => output.push(line),
    errorOutput: (line) => errors.push(line),
  });
  return { exitCodePromise, transitionRun, queryExactRunRows, output, errors };
}

describe('release canary residue assertion', () => {
  it('passes completed expected-SHA residue within every cap', () => {
    expect(evaluate([row()])).toMatchObject({
      exitCode: CANARY_RESIDUE_EXIT_CODES.SUCCESS,
      verdict: 'pass',
      counts: {
        rows: 1,
        unpurgedRows: 1,
        expectedShaRuns: 1,
        completedExpectedShaRuns: 1,
      },
      residue: {
        ...Object.fromEntries(RESIDUE_GROUPS.map((group) => [group, 1])),
        total: 10,
      },
    });
  });

  it('allows three complete retained runs and rejects a fourth projected run', () => {
    const complete = row({
      portfolioCompanyResidueCount: 1, fundResidueCount: 1, fundConfigResidueCount: 1,
      fundEventResidueCount: 4, notificationResidueCount: 0, grantResidueCount: 1,
      calculationResidueCount: 12, mutationReceiptResidueCount: 2, scenarioResidueCount: 7,
      reportingResidueCount: 11, totalResidueCount: 40,
    });
    expect(evaluate([complete, complete, complete], THREE_RUN_POLICY)).toMatchObject({
      exitCode: CANARY_RESIDUE_EXIT_CODES.SUCCESS, verdict: 'pass',
    });
    expect(evaluate([complete, complete, complete, complete], THREE_RUN_POLICY)).toMatchObject({
      exitCode: CANARY_RESIDUE_EXIT_CODES.POLICY_FAILURE, verdict: 'policy-failure',
    });
  });

  it.each(RESIDUE_GROUPS.map((group) => [group]))(
    'fails policy when %s cap is exceeded',
    (cap) => {
      const result = evaluate([row()], { [cap]: 0 });

      expect(result).toMatchObject({
        exitCode: CANARY_RESIDUE_EXIT_CODES.POLICY_FAILURE,
        verdict: 'policy-failure',
      });
      expect(result.reason).toContain(cap);
      expect(result.residue[cap]).toBe(1);
    }
  );

  it('fails policy when stored total residue exceeds its cap', () => {
    const result = evaluate([row()], { total: 4 });

    expect(result).toMatchObject({
      exitCode: CANARY_RESIDUE_EXIT_CODES.POLICY_FAILURE,
      verdict: 'policy-failure',
    });
    expect(result.reason).toContain('total');
  });

  it.each(['created', 'running', 'failed', 'expired', 'purged'])(
    'rejects expected-SHA run with status %s',
    (status) => {
      expect(
        evaluate([
          row({
            status,
            ...(status === 'purged' ? { purgedAt: '2026-08-10T11:00:00.000Z' } : {}),
          }),
        ])
      ).toMatchObject({
        exitCode: CANARY_RESIDUE_EXIT_CODES.EXPECTED_SHA_FAILURE,
        verdict: 'expected-sha-failure',
      });
    }
  );

  it('fails expired unpurged residue before it can be ignored', () => {
    expect(evaluate([row({ expiresAt: '2026-08-10T12:00:00.000Z' })])).toMatchObject({
      exitCode: CANARY_RESIDUE_EXIT_CODES.POLICY_FAILURE,
      verdict: 'policy-failure',
    });
  });

  it('uses max-age-hours as the exact age override', () => {
    const tightened = evaluate(
      [
        row({
          createdAt: '2026-08-10T02:00:00.000Z',
          expiresAt: '2026-08-11T12:00:00.000Z',
        }),
      ],
      {},
      { maxAgeHours: 8 }
    );
    const overridden = evaluate(
      [
        row({
          createdAt: '2026-08-09T11:00:00.000Z',
          expiresAt: '2026-08-11T12:00:00.000Z',
        }),
      ],
      {},
      { maxAgeHours: 48 }
    );
    const atAgeBoundary = evaluate(
      [
        row({
          createdAt: '2026-08-10T04:00:00.000Z',
          expiresAt: '2026-08-11T12:00:00.000Z',
        }),
      ],
      {},
      { maxAgeHours: 8 }
    );

    expect(tightened).toMatchObject({
      exitCode: CANARY_RESIDUE_EXIT_CODES.POLICY_FAILURE,
      caps: { effectiveMaxAgeHours: 8 },
    });
    expect(overridden).toMatchObject({
      exitCode: CANARY_RESIDUE_EXIT_CODES.SUCCESS,
      caps: { effectiveMaxAgeHours: 48 },
    });
    expect(atAgeBoundary).toMatchObject({
      exitCode: CANARY_RESIDUE_EXIT_CODES.SUCCESS,
      caps: { effectiveMaxAgeHours: 8 },
    });
  });

  it('rejects out-of-range timestamps before a purged row can hide residue', () => {
    const hiddenResidue = row({
      releaseSha: WRONG_SHA,
      status: 'purged',
      purgedAt: Number.MAX_VALUE,
      ...counts({
        portfolioCompanyResidueCount: MAX_SAFE_INTEGER,
        totalResidueCount: MAX_SAFE_INTEGER,
      }),
    });

    expect(evaluate([row(), hiddenResidue])).toMatchObject({
      exitCode: CANARY_RESIDUE_EXIT_CODES.INVALID_ARGUMENT,
      verdict: 'invalid',
    });
    expect(evaluate([row({ createdAt: Number.MAX_VALUE })])).toMatchObject({
      exitCode: CANARY_RESIDUE_EXIT_CODES.INVALID_ARGUMENT,
      verdict: 'invalid',
    });
    expect(evaluate([row({ expiresAt: Number.MAX_VALUE })])).toMatchObject({
      exitCode: CANARY_RESIDUE_EXIT_CODES.INVALID_ARGUMENT,
      verdict: 'invalid',
    });
    expect(evaluate([row()], {}, { now: Number.MAX_VALUE })).toMatchObject({
      exitCode: CANARY_RESIDUE_EXIT_CODES.INVALID_ARGUMENT,
      verdict: 'invalid',
    });
    expect(evaluate([row({ createdAt: ['2026-08-10T10:00:00.000Z'] })])).toMatchObject({
      exitCode: CANARY_RESIDUE_EXIT_CODES.INVALID_ARGUMENT,
      verdict: 'invalid',
    });
  });

  it('rejects unrepresentable age durations and accepts the ECMAScript boundary', () => {
    expect(evaluate([row()], { ttlHours: Number.MAX_VALUE })).toMatchObject({
      exitCode: CANARY_RESIDUE_EXIT_CODES.INVALID_ARGUMENT,
      verdict: 'invalid',
    });
    expect(evaluate([row()], {}, { maxAgeHours: Number.MAX_VALUE })).toMatchObject({
      exitCode: CANARY_RESIDUE_EXIT_CODES.INVALID_ARGUMENT,
      verdict: 'invalid',
    });
    expect(
      evaluate(
        [row({ createdAt: MAX_ECMASCRIPT_TIME_MS, expiresAt: MAX_ECMASCRIPT_TIME_MS })],
        { ttlHours: MAX_ECMASCRIPT_TIME_MS / (60 * 60 * 1000) },
        {
          now: MAX_ECMASCRIPT_TIME_MS - 1,
          maxAgeHours: MAX_ECMASCRIPT_TIME_MS / (60 * 60 * 1000),
        }
      )
    ).toMatchObject({
      exitCode: CANARY_RESIDUE_EXIT_CODES.SUCCESS,
      caps: { effectiveMaxAgeHours: MAX_ECMASCRIPT_TIME_MS / (60 * 60 * 1000) },
    });
  });

  it('excludes valid purged rows from caps and expiry checks', () => {
    const result = evaluate([
      row(),
      row({
        releaseSha: WRONG_SHA,
        status: 'purged',
        purgedAt: '2026-08-10T11:00:00.000Z',
        createdAt: '2026-08-01T00:00:00.000Z',
        expiresAt: '2020-01-01T00:00:00.000Z',
        ...Object.fromEntries(RESIDUE_GROUPS.map((group) => [`${group}ResidueCount`, 999])),
        totalResidueCount: 9990,
      }),
    ]);

    expect(result).toMatchObject({
      exitCode: CANARY_RESIDUE_EXIT_CODES.SUCCESS,
      counts: { unpurgedRows: 1, purgedRows: 1 },
      residue: { total: 10 },
    });
  });

  function purgedRow(overrides = {}) {
    return row({
      releaseSha: WRONG_SHA,
      status: 'purged',
      purgedAt: '2026-08-10T11:00:00.000Z',
      ...overrides,
    });
  }

  it.each([
    ['malformed createdAt', { createdAt: 'not-a-date' }],
    ['malformed expiresAt', { expiresAt: 'not-a-date' }],
    ['malformed purgedAt', { purgedAt: 'not-a-timestamp' }],
    ['inconsistent total residue', { totalResidueCount: 9 }],
  ])('rejects a purged row with %s instead of excluding it', (_label, overrides) => {
    expect(evaluate([row(), purgedRow(overrides)])).toMatchObject({
      exitCode: CANARY_RESIDUE_EXIT_CODES.INVALID_ARGUMENT,
      verdict: 'invalid',
    });
  });

  it.each([[null], ['1'], [true], [[]], [{}], [-1], [2 ** 53]])(
    'rejects a purged row whose residue count is %p',
    (value) => {
      expect(evaluate([row(), purgedRow({ grantResidueCount: value })])).toMatchObject({
        exitCode: CANARY_RESIDUE_EXIT_CODES.INVALID_ARGUMENT,
        verdict: 'invalid',
      });
    }
  );

  it.each(RESIDUE_GROUPS.map((group) => [group]))(
    'rejects a purged row with a null %s residue count',
    (group) => {
      expect(evaluate([row(), purgedRow({ [`${group}ResidueCount`]: null })])).toMatchObject({
        exitCode: CANARY_RESIDUE_EXIT_CODES.INVALID_ARGUMENT,
        verdict: 'invalid',
      });
    }
  );

  it.each([
    ['purged status without purgedAt', { status: 'purged', purgedAt: null }],
    [
      'purgedAt without purged status',
      { status: 'completed', purgedAt: '2026-08-10T11:00:00.000Z' },
    ],
  ])('fails closed for %s', (_label, markers) => {
    expect(evaluate([row(), row({ releaseSha: WRONG_SHA, ...markers })])).toMatchObject({
      exitCode: CANARY_RESIDUE_EXIT_CODES.INVALID_ARGUMENT,
      verdict: 'invalid',
    });
  });

  it('counts wrong-SHA unpurged residue for caps but ignores its completion state', () => {
    const result = evaluate(
      [row(), row({ releaseSha: WRONG_SHA, status: 'failed', totalResidueCount: 10 })],
      { total: 19 }
    );

    expect(result).toMatchObject({
      exitCode: CANARY_RESIDUE_EXIT_CODES.POLICY_FAILURE,
      counts: { expectedShaRuns: 1, completedExpectedShaRuns: 1 },
      residue: { total: 20 },
    });
  });

  it.each(['created', 'running'])(
    'fails residue policy for wrong-SHA active run with status %s',
    (status) => {
      expect(evaluate([row(), row({ releaseSha: WRONG_SHA, status })])).toMatchObject({
        exitCode: CANARY_RESIDUE_EXIT_CODES.POLICY_FAILURE,
        verdict: 'policy-failure',
      });
    }
  );

  it('prioritizes expected-SHA completion failure over simultaneous policy failures', () => {
    expect(
      evaluate([row({ status: 'failed', expiresAt: '2026-08-10T11:59:59.000Z' })], {
        total: 4,
      })
    ).toMatchObject({
      exitCode: CANARY_RESIDUE_EXIT_CODES.EXPECTED_SHA_FAILURE,
      verdict: 'expected-sha-failure',
    });
  });

  it('fails closed when no expected-SHA canary exists', () => {
    expect(evaluate([row({ releaseSha: WRONG_SHA })])).toMatchObject({
      exitCode: CANARY_RESIDUE_EXIT_CODES.EXPECTED_SHA_FAILURE,
      verdict: 'expected-sha-failure',
    });
  });

  it('fails closed for malformed or inconsistent stored residue counts', () => {
    expect(evaluate([row({ totalResidueCount: 'not-a-number' })])).toMatchObject({
      exitCode: CANARY_RESIDUE_EXIT_CODES.INVALID_ARGUMENT,
      verdict: 'invalid',
    });
    expect(evaluate([row({ totalResidueCount: 4 })])).toMatchObject({
      exitCode: CANARY_RESIDUE_EXIT_CODES.INVALID_ARGUMENT,
      verdict: 'invalid',
    });
  });

  it.each(INVALID_ROW_COUNT_VALUES)(
    'rejects non-numeric row residue count %p without coercion',
    (value, expectedTotal) => {
      expect(
        evaluate([
          row(
            counts({ portfolioCompanyResidueCount: value, totalResidueCount: expectedTotal })
          ),
        ])
      ).toMatchObject({
        exitCode: CANARY_RESIDUE_EXIT_CODES.INVALID_ARGUMENT,
        verdict: 'invalid',
      });
      expect(
        evaluate([
          row(counts({ grantResidueCount: value, totalResidueCount: expectedTotal })),
        ])
      ).toMatchObject({
        exitCode: CANARY_RESIDUE_EXIT_CODES.INVALID_ARGUMENT,
        verdict: 'invalid',
      });
    }
  );

  it.each(INVALID_POLICY_CAP_VALUES)(
    'rejects non-numeric policy cap %p without coercion',
    (value) => {
      expect(evaluate([row()], { portfolioCompany: value })).toMatchObject({
        exitCode: CANARY_RESIDUE_EXIT_CODES.INVALID_ARGUMENT,
        verdict: 'invalid',
      });
    }
  );

  it.each(['24', true, null])('rejects non-numeric policy ttlHours %p', (value) => {
    expect(evaluate([row()], { ttlHours: value })).toMatchObject({
      exitCode: CANARY_RESIDUE_EXIT_CODES.INVALID_ARGUMENT,
      verdict: 'invalid',
    });
  });

  it('fails closed when aggregate residue addition exceeds the safe integer range', () => {
    const maxResidueRow = row(
      counts({
        portfolioCompanyResidueCount: MAX_SAFE_INTEGER,
        totalResidueCount: MAX_SAFE_INTEGER,
      })
    );

    expect(
      evaluate([maxResidueRow, { ...maxResidueRow, releaseSha: WRONG_SHA }], {
        portfolioCompany: MAX_SAFE_INTEGER,
        total: MAX_SAFE_INTEGER,
      })
    ).toMatchObject({
      exitCode: CANARY_RESIDUE_EXIT_CODES.INVALID_ARGUMENT,
      verdict: 'invalid',
    });
  });

  it('requires strict argument pairs, a 40-hex SHA, and no duplicate or unknown flags', () => {
    expect(parseCanaryResidueArgs([...EXACT_ARGS, '--max-age-hours', '12.5'])).toEqual({
      expectedSha: SHA,
      maxAgeHours: 12.5,
      globalOnly: false,
      expectedFundId: FUND_ID,
      expectedCanaryRunId: RUN_UUID,
      githubRunId: GITHUB_RUN_ID,
      githubRunAttempt: GITHUB_RUN_ATTEMPT,
      startedAt: STARTED_AT,
      maxClockSkewSeconds: 300,
      terminalStatus: 'completed',
    });
    const failArgs = EXACT_ARGS.map((value) =>
      value === '--complete-current-run' ? '--fail-current-run' : value
    );
    expect(parseCanaryResidueArgs(failArgs)).toMatchObject({ terminalStatus: 'failed' });
    expect(() => parseCanaryResidueArgs(['--expected-sha', 'bad'])).toThrow(/40-character SHA/i);
    expect(() => parseCanaryResidueArgs(['--unknown', 'value'])).toThrow(/Unknown argument/);
    expect(() => parseCanaryResidueArgs([...EXACT_ARGS, '--expected-sha', SHA])).toThrow(
      /Duplicate/
    );
    expect(() => parseCanaryResidueArgs(['--expected-sha'])).toThrow(/--name value pairs/);
    expect(() => parseCanaryResidueArgs([...EXACT_ARGS, '--max-age-hours', '0'])).toThrow(
      /positive number/i
    );
  });

  it('removes the SHA-wide reconcile surface entirely', async () => {
    expect(() =>
      parseCanaryResidueArgs([...EXACT_ARGS, '--reconcile-expected-sha', SHA])
    ).toThrow(/Unknown argument/);
    const scriptModule = await import('../../../scripts/release/assert-canary-residue.mjs');
    expect(scriptModule.reconcileExpectedShaRuns).toBeUndefined();
  });

  it('requires the exact current-execution arguments and one transition flag', () => {
    const withoutFlag = (flag) => {
      const args = [...EXACT_ARGS];
      const index = args.indexOf(flag);
      args.splice(index, flag.startsWith('--complete') ? 1 : 2);
      return args;
    };
    for (const flag of [
      '--expected-fund-id',
      '--expected-canary-run-id',
      '--github-run-id',
      '--github-run-attempt',
      '--started-at',
      '--max-clock-skew-seconds',
      '--complete-current-run',
    ]) {
      expect(() => parseCanaryResidueArgs(withoutFlag(flag))).toThrow(/required/i);
    }
    expect(() => parseCanaryResidueArgs([...EXACT_ARGS, '--fail-current-run'])).toThrow(
      /mutually exclusive/
    );
  });

  it.each([
    ['--expected-fund-id', '0'],
    ['--expected-fund-id', '-4'],
    ['--expected-fund-id', '4.5'],
    ['--expected-canary-run-id', 'not-a-uuid'],
    ['--github-run-id', '0123'],
    ['--github-run-id', 'abc'],
    ['--github-run-attempt', '0'],
    ['--github-run-attempt', '1.5'],
    ['--started-at', 'not-a-timestamp'],
    ['--max-clock-skew-seconds', '0'],
    ['--max-clock-skew-seconds', '-1'],
  ])('rejects a malformed %s value %s', (flag, value) => {
    const args = [...EXACT_ARGS];
    args[args.indexOf(flag) + 1] = value;
    expect(() => parseCanaryResidueArgs(args)).toThrow();
  });

  it('keeps --global-only strictly read-only and free of exact-run arguments', async () => {
    expect(parseCanaryResidueArgs(['--expected-sha', SHA, '--global-only'])).toEqual({
      expectedSha: SHA,
      maxAgeHours: undefined,
      globalOnly: true,
    });
    expect(() =>
      parseCanaryResidueArgs(['--expected-sha', SHA, '--global-only', '--expected-fund-id', '1'])
    ).toThrow(/forbidden with --global-only/);
    expect(() =>
      parseCanaryResidueArgs(['--expected-sha', SHA, '--global-only', '--complete-current-run'])
    ).toThrow(/forbidden with --global-only/);
    expect(() =>
      parseCanaryResidueArgs(['--expected-sha', SHA, '--global-only', '--fail-current-run'])
    ).toThrow(/forbidden with --global-only/);

    const { exitCodePromise, transitionRun, queryExactRunRows } = runExact({
      args: ['--expected-sha', SHA, '--global-only'],
    });
    await expect(exitCodePromise).resolves.toBe(CANARY_RESIDUE_EXIT_CODES.SUCCESS);
    expect(transitionRun).not.toHaveBeenCalled();
    expect(queryExactRunRows).not.toHaveBeenCalled();
  });

  it('joins the exact fund through run, principal, and creator grant', () => {
    for (const fragment of [
      'FROM funds AS f',
      'JOIN release_canary_runs AS r ON r.id = f.canary_run_id',
      'JOIN users AS u ON u.id = r.principal_user_id',
      'JOIN user_fund_grants AS g ON g.user_id = r.principal_user_id AND g.fund_id = f.id',
      'WHERE f.id = $1',
    ]) {
      expect(RELEASE_CANARY_EXACT_RUN_QUERY).toContain(fragment);
    }
  });

  it('proves the exact current execution for a matching created run', () => {
    expect(prove()).toEqual({ runId: RUN_UUID, runVersion: 1, runStatus: 'created' });
    expect(prove({ rows: [exactRunRow({ runStatus: 'running' })] })).toMatchObject({
      runStatus: 'running',
    });
  });

  it.each([
    ['wrong fund ID', { rows: [exactRunRow({ fundId: FUND_ID + 1 })] }],
    ['ordinary fund origin', { rows: [exactRunRow({ fundDataOrigin: 'production' })] }],
    ['fund-run link mismatch', { rows: [exactRunRow({ fundCanaryRunId: OTHER_RUN_UUID })] }],
    ['wrong canary run', { expectedCanaryRunId: OTHER_RUN_UUID }],
    ['wrong workflow run', { rows: [exactRunRow({ runWorkflowRunId: '999999' })] }],
    ['null workflow run', { rows: [exactRunRow({ runWorkflowRunId: null })] }],
    ['same run different attempt', { rows: [exactRunRow({ runWorkflowRunAttempt: 3 })] }],
    ['wrong release SHA', { rows: [exactRunRow({ runReleaseSha: WRONG_SHA })] }],
    ['principal flag false', { rows: [exactRunRow({ principalIsReleaseCanary: false })] }],
    ['missing grant join', { rows: [exactRunRow({ grantUserId: null })] }],
    ['invalid version', { rows: [exactRunRow({ runVersion: 0 })] }],
    ['duplicate join', { rows: [exactRunRow(), exactRunRow()] }],
    ['no rows', { rows: [] }],
    ['terminal status mismatch', { rows: [exactRunRow({ runStatus: 'failed' })] }],
    ['purged status', { rows: [exactRunRow({ runStatus: 'purged' })] }],
  ])('refuses exact-run proof for %s', (_label, overrides) => {
    expect(() => prove(overrides)).toThrow();
  });

  it('accepts an already-terminal run only at the requested terminal status', () => {
    expect(
      prove({ rows: [exactRunRow({ runStatus: 'completed' })], terminalStatus: 'completed' })
    ).toMatchObject({ runStatus: 'completed' });
    expect(() =>
      prove({ rows: [exactRunRow({ runStatus: 'completed' })], terminalStatus: 'failed' })
    ).toThrow(/cannot transition/);
  });

  it('accepts both exact clock-skew boundaries and rejects just beyond them', () => {
    const lowerBoundary = Date.parse(STARTED_AT) - 300_000;
    const upperBoundary = NOW + 300_000;
    expect(prove({ rows: [exactRunRow({ runCreatedAt: lowerBoundary })] })).toBeTruthy();
    expect(prove({ rows: [exactRunRow({ runCreatedAt: upperBoundary })] })).toBeTruthy();
    expect(() => prove({ rows: [exactRunRow({ runCreatedAt: lowerBoundary - 1 })] })).toThrow(
      /before the workflow started/
    );
    expect(() => prove({ rows: [exactRunRow({ runCreatedAt: upperBoundary + 1 })] })).toThrow(
      /after the verifier time/
    );
  });

  it('bounds the exact run by the frozen reservation with a consistent total', () => {
    expect(() => assertExactRunResidueWithinReservation(exactCounts(), RESERVED)).not.toThrow();
    expect(() =>
      assertExactRunResidueWithinReservation(exactCounts({ fund: 6, total: 9 }), RESERVED)
    ).toThrow(/exceeds reservation/);
    expect(() =>
      assertExactRunResidueWithinReservation(exactCounts({ total: 5 }), RESERVED)
    ).toThrow(/group sum/);
  });

  it('orders residue rows deterministically and documents cumulative SHA accounting', () => {
    expect(RELEASE_CANARY_RUNS_QUERY).toContain('ORDER BY created_at');
    expect(RELEASE_CANARY_RUNS_QUERY).toContain('id');
  });

  it('proves, transitions, and evaluates the exact current execution end to end', async () => {
    const { exitCodePromise, transitionRun, queryExactRunRows, output, errors } = runExact();

    await expect(exitCodePromise).resolves.toBe(CANARY_RESIDUE_EXIT_CODES.SUCCESS);
    expect(transitionRun).toHaveBeenCalledOnce();
    expect(transitionRun).toHaveBeenCalledWith(RUN_UUID, 'completed', 1, ['created', 'running']);
    expect(queryExactRunRows).toHaveBeenCalledTimes(2);
    expect(queryExactRunRows).toHaveBeenCalledWith(FUND_ID);
    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0])).toMatchObject({ verdict: 'pass' });
    expect(errors).toEqual([]);
  });

  it('fails the exact current run when Playwright failed after handle creation', async () => {
    const failArgs = EXACT_ARGS.map((value) =>
      value === '--complete-current-run' ? '--fail-current-run' : value
    );
    const { exitCodePromise, transitionRun } = runExact({
      args: failArgs,
      reloadedRows: [exactRunRow({ runStatus: 'failed', runVersion: 2 })],
      queryRows: async () => [row({ status: 'failed' })],
    });

    // The run is marked failed by exact identity; global completion evidence
    // then correctly reports the expected-SHA failure for this release.
    await expect(exitCodePromise).resolves.toBe(CANARY_RESIDUE_EXIT_CODES.EXPECTED_SHA_FAILURE);
    expect(transitionRun).toHaveBeenCalledWith(RUN_UUID, 'failed', 1, ['created', 'running']);
  });

  it('refuses masking: an ordinary fund cannot borrow an old completed same-SHA run', async () => {
    // An old completed canary run for the expected SHA exists globally, but
    // the expected current fund is an ordinary production fund: exact proof
    // must fail even though SHA-wide evidence looks complete.
    const { exitCodePromise, transitionRun, output } = runExact({
      exactRows: [exactRunRow({ fundDataOrigin: 'production', fundCanaryRunId: null })],
      queryRows: async () => [row()],
    });

    await expect(exitCodePromise).resolves.toBe(CANARY_RESIDUE_EXIT_CODES.EXACT_RUN_FAILURE);
    expect(transitionRun).not.toHaveBeenCalled();
    expect(JSON.parse(output[0])).toMatchObject({ verdict: 'exact-run-failure' });
  });

  it('fails closed when the reloaded run misses the requested terminal status', async () => {
    const { exitCodePromise, output } = runExact({
      reloadedRows: [exactRunRow({ runStatus: 'running' })],
    });

    await expect(exitCodePromise).resolves.toBe(CANARY_RESIDUE_EXIT_CODES.EXACT_RUN_FAILURE);
    expect(JSON.parse(output[0]).reason).toMatch(/terminal status/);
  });

  it('fails closed when the reload returns a different run identity', async () => {
    const { exitCodePromise, output } = runExact({
      reloadedRows: [
        exactRunRow({ runId: OTHER_RUN_UUID, fundCanaryRunId: OTHER_RUN_UUID, runStatus: 'completed' }),
      ],
    });

    await expect(exitCodePromise).resolves.toBe(CANARY_RESIDUE_EXIT_CODES.EXACT_RUN_FAILURE);
    expect(JSON.parse(output[0]).reason).toMatch(/different run/);
  });

  it('surfaces a version-fence conflict without raw database errors', async () => {
    const conflict = new Error('Release canary run version conflict');
    conflict.name = 'CanaryRunTransitionConflictError';
    const { exitCodePromise, output, errors } = runExact({
      transitionRun: vi.fn().mockRejectedValue(conflict),
    });

    await expect(exitCodePromise).resolves.toBe(CANARY_RESIDUE_EXIT_CODES.EXACT_RUN_FAILURE);
    expect(JSON.parse(output[0])).toMatchObject({
      verdict: 'exact-run-failure',
      reason: 'Release canary run version conflict',
    });
    expect(errors).toEqual(['Release canary run version conflict']);
  });

  it('keeps raw database failures generic in the emitted summary', async () => {
    const rawDatabaseError = new Error(
      'connect ECONNREFUSED 10.0.0.9:5432 password=super-secret'
    );
    const { exitCodePromise, output, errors } = runExact({
      transitionRun: vi.fn().mockRejectedValue(rawDatabaseError),
    });

    await expect(exitCodePromise).resolves.toBe(CANARY_RESIDUE_EXIT_CODES.INVALID_ARGUMENT);
    for (const line of [...output, ...errors]) {
      expect(line).not.toContain('super-secret');
      expect(line).not.toContain('ECONNREFUSED');
    }
  });

  it('rejects an over-reservation exact run before global evaluation', async () => {
    const { exitCodePromise, output } = runExact({
      transitionRun: vi.fn().mockResolvedValue(exactCounts({ fund: 6, total: 9 })),
    });

    await expect(exitCodePromise).resolves.toBe(CANARY_RESIDUE_EXIT_CODES.EXACT_RUN_FAILURE);
    expect(JSON.parse(output[0]).reason).toMatch(/exceeds reservation/);
  });

  it('rejects memory DATABASE_URL before it can query', async () => {
    const { exitCodePromise, queryExactRunRows, transitionRun, output, errors } = runExact({
      env: { DATABASE_URL: '  MeMoRy://canary  ' },
    });

    await expect(exitCodePromise).resolves.toBe(CANARY_RESIDUE_EXIT_CODES.INVALID_ARGUMENT);
    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0])).toMatchObject({ verdict: 'invalid' });
    expect(errors).toEqual([expect.stringMatching(/DATABASE_URL/)]);
    expect(queryExactRunRows).not.toHaveBeenCalled();
    expect(transitionRun).not.toHaveBeenCalled();
  });

  it('trims a non-memory DATABASE_URL before injected query I/O', async () => {
    let receivedDatabaseUrl;
    const { exitCodePromise } = runExact({
      env: { DATABASE_URL: '  postgres://read-only.example.test/canary  ' },
      queryRows: async (databaseUrl) => {
        receivedDatabaseUrl = databaseUrl;
        return [row()];
      },
    });

    await expect(exitCodePromise).resolves.toBe(CANARY_RESIDUE_EXIT_CODES.SUCCESS);
    expect(receivedDatabaseUrl).toBe('postgres://read-only.example.test/canary');
  });

  it('rejects a custom env object before default global policy loading', async () => {
    const { exitCodePromise, queryExactRunRows, output, errors } = runExact({
      readRuntimePolicy: undefined,
    });

    await expect(exitCodePromise).resolves.toBe(CANARY_RESIDUE_EXIT_CODES.INVALID_ARGUMENT);
    expect(queryExactRunRows).not.toHaveBeenCalled();
    expect(JSON.parse(output[0])).toMatchObject({ reason: expect.stringMatching(/custom env/i) });
    expect(errors).toEqual([expect.stringMatching(/custom env/i)]);
  });

  it('passes supplied env to an injected runtime policy reader', async () => {
    const env = { DATABASE_URL: 'postgres://read-only.example.test/canary' };
    let policyEnv;
    const { exitCodePromise } = runExact({
      env,
      readRuntimePolicy: (receivedEnv) => {
        policyEnv = receivedEnv;
        return policy();
      },
    });

    await expect(exitCodePromise).resolves.toBe(CANARY_RESIDUE_EXIT_CODES.SUCCESS);
    expect(policyEnv).toBe(env);
  });

  it('loads the shared cap/TTL policy from process.env on the default path', async () => {
    // Mirrors the release workflow's residue step: no injected policy reader,
    // policy comes from the twelve runner env vars via readCanaryRuntimePolicy
    // (the real shared-service reader, resolved through the default
    // readSharedRuntimePolicy seam). Runs in-process — an earlier
    // child-process variant of this proof starved the 4-worker CI pool and
    // timed out unrelated tail tests.
    for (const [key, value] of Object.entries({
      DATABASE_URL: 'postgres://canary:canary@127.0.0.1:9/canary',
      RELEASE_CANARY_MAX_PORTFOLIO_COMPANY_RESIDUE: '10',
      RELEASE_CANARY_MAX_FUND_RESIDUE: '10',
      RELEASE_CANARY_MAX_FUND_CONFIG_RESIDUE: '10',
      RELEASE_CANARY_MAX_FUND_EVENT_RESIDUE: '10',
      RELEASE_CANARY_MAX_NOTIFICATION_RESIDUE: '10',
      RELEASE_CANARY_MAX_GRANT_RESIDUE: '10',
      RELEASE_CANARY_MAX_CALCULATION_RESIDUE: '10',
      RELEASE_CANARY_MAX_MUTATION_RECEIPT_RESIDUE: '10',
      RELEASE_CANARY_MAX_SCENARIO_RESIDUE: '10',
      RELEASE_CANARY_MAX_REPORTING_RESIDUE: '10',
      RELEASE_CANARY_MAX_TOTAL_RESIDUE: '100',
      RELEASE_CANARY_TTL_HOURS: '24',
    })) {
      vi.stubEnv(key, value);
    }

    const output = [];
    try {
      let exactQueryCall = 0;
      const exitCode = await runCanaryResidueAssertion({
        args: [...EXACT_ARGS],
        queryRows: async () => [row()],
        queryExactRunRows: async () => {
          exactQueryCall += 1;
          return exactQueryCall === 1
            ? [exactRunRow()]
            : [exactRunRow({ runStatus: 'completed', runVersion: 2 })];
        },
        transitionRun: async () => exactCounts(),
        readReservedResidue: () => RESERVED,
        now: () => NOW,
        output: (line) => output.push(line),
        errorOutput: () => undefined,
      });
      expect(exitCode).toBe(CANARY_RESIDUE_EXIT_CODES.SUCCESS);
    } finally {
      vi.unstubAllEnvs();
    }

    const summary = JSON.parse(output[0]);
    // caps prove readCanaryRuntimePolicy consumed the stubbed process.env
    // through the default (non-injected) policy path.
    expect(summary.caps).toMatchObject({ total: 100, ttlHours: 24 });
  }, 120_000);
});
