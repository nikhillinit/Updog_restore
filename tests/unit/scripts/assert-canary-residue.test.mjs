import { describe, expect, it, vi } from 'vitest';

import {
  CANARY_RESIDUE_EXIT_CODES,
  RELEASE_CANARY_RUNS_QUERY,
  evaluateCanaryResidue,
  parseCanaryResidueArgs,
  runCanaryResidueAssertion,
} from '../../../scripts/release/assert-canary-residue.mjs';

const SHA = 'a'.repeat(40);
const WRONG_SHA = 'b'.repeat(40);
const NOW = Date.parse('2026-08-10T12:00:00.000Z');
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

function policy(overrides = {}) {
  return {
    portfolioCompany: 10,
    fund: 10,
    fundConfig: 10,
    fundEvent: 10,
    notification: 10,
    total: 50,
    ttlHours: 24,
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
    portfolioCompanyResidueCount: 1,
    fundResidueCount: 1,
    fundConfigResidueCount: 1,
    fundEventResidueCount: 1,
    notificationResidueCount: 1,
    totalResidueCount: 5,
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
        portfolioCompany: 1,
        fund: 1,
        fundConfig: 1,
        fundEvent: 1,
        notification: 1,
        total: 5,
      },
    });
  });

  it.each([['portfolioCompany'], ['fund'], ['fundConfig'], ['fundEvent'], ['notification']])(
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
      portfolioCompanyResidueCount: MAX_SAFE_INTEGER,
      fundResidueCount: 0,
      fundConfigResidueCount: 0,
      fundEventResidueCount: 0,
      notificationResidueCount: 0,
      totalResidueCount: MAX_SAFE_INTEGER,
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

  it('excludes purged rows from caps and expiry checks', () => {
    const result = evaluate([
      row(),
      row({
        releaseSha: WRONG_SHA,
        status: 'purged',
        purgedAt: '2026-08-10T11:00:00.000Z',
        createdAt: 'not-a-date',
        expiresAt: '2020-01-01T00:00:00.000Z',
        portfolioCompanyResidueCount: 999,
        fundResidueCount: 999,
        fundConfigResidueCount: 999,
        fundEventResidueCount: 999,
        notificationResidueCount: 999,
        totalResidueCount: 4995,
      }),
    ]);

    expect(result).toMatchObject({
      exitCode: CANARY_RESIDUE_EXIT_CODES.SUCCESS,
      counts: { unpurgedRows: 1, purgedRows: 1 },
      residue: { total: 5 },
    });
    expect(
      evaluate([row(), row({ releaseSha: WRONG_SHA, purgedAt: 'not-a-timestamp' })])
    ).toMatchObject({
      exitCode: CANARY_RESIDUE_EXIT_CODES.INVALID_ARGUMENT,
      verdict: 'invalid',
    });
  });

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
      [row(), row({ releaseSha: WRONG_SHA, status: 'failed', totalResidueCount: 5 })],
      { total: 9 }
    );

    expect(result).toMatchObject({
      exitCode: CANARY_RESIDUE_EXIT_CODES.POLICY_FAILURE,
      counts: { expectedShaRuns: 1, completedExpectedShaRuns: 1 },
      residue: { total: 10 },
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
          row({
            portfolioCompanyResidueCount: value,
            fundResidueCount: 0,
            fundConfigResidueCount: 0,
            fundEventResidueCount: 0,
            notificationResidueCount: 0,
            totalResidueCount: expectedTotal,
          }),
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
    const maxResidueRow = row({
      portfolioCompanyResidueCount: MAX_SAFE_INTEGER,
      fundResidueCount: 0,
      fundConfigResidueCount: 0,
      fundEventResidueCount: 0,
      notificationResidueCount: 0,
      totalResidueCount: MAX_SAFE_INTEGER,
    });

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
    expect(parseCanaryResidueArgs(['--expected-sha', SHA, '--max-age-hours', '12.5'])).toEqual({
      expectedSha: SHA,
      maxAgeHours: 12.5,
      reconcileExpectedSha: false,
    });
    expect(parseCanaryResidueArgs(['--expected-sha', SHA, '--reconcile-expected-sha'])).toEqual({
      expectedSha: SHA,
      maxAgeHours: undefined,
      reconcileExpectedSha: true,
    });
    expect(() => parseCanaryResidueArgs(['--expected-sha', 'bad'])).toThrow(/40-character SHA/i);
    expect(() => parseCanaryResidueArgs(['--unknown', 'value'])).toThrow(/Unknown argument/);
    expect(() => parseCanaryResidueArgs(['--expected-sha', SHA, '--expected-sha', SHA])).toThrow(
      /Duplicate/
    );
    expect(() => parseCanaryResidueArgs(['--expected-sha'])).toThrow(/--name value pairs/);
    expect(() => parseCanaryResidueArgs(['--expected-sha', SHA, '--max-age-hours', '0'])).toThrow(
      /positive number/i
    );
    expect(() =>
      parseCanaryResidueArgs(['--expected-sha', SHA, '--reconcile-expected-sha', '--reconcile-expected-sha'])
    ).toThrow(/Duplicate/);
  });

  it('orders residue rows deterministically and documents cumulative SHA accounting', () => {
    expect(RELEASE_CANARY_RUNS_QUERY).toContain('ORDER BY created_at');
    expect(RELEASE_CANARY_RUNS_QUERY).toContain('id');
  });

  it('emits exactly one JSON summary through injected CLI I/O', async () => {
    const output = [];
    const errors = [];

    await expect(
      runCanaryResidueAssertion({
        args: ['--expected-sha', SHA],
        env: { DATABASE_URL: 'postgres://read-only.example.test/canary' },
        readRuntimePolicy: () => policy(),
        queryRows: async () => [row()],
        now: () => NOW,
        output: (line) => output.push(line),
        errorOutput: (line) => errors.push(line),
      })
    ).resolves.toBe(CANARY_RESIDUE_EXIT_CODES.SUCCESS);

    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0])).toMatchObject({ verdict: 'pass' });
    expect(errors).toEqual([]);
  });

  it('opt-in reconciles created expected-SHA runs before evaluating residue', async () => {
    const output = [];
    const transitionRun = vi.fn().mockResolvedValue({
      portfolioCompany: 2,
      fund: 1,
      fundConfig: 1,
      fundEvent: 1,
      notification: 0,
      total: 5,
    });

    await expect(
      runCanaryResidueAssertion({
        args: ['--expected-sha', SHA, '--reconcile-expected-sha'],
        env: { DATABASE_URL: 'postgres://read-only.example.test/canary' },
        readRuntimePolicy: () => policy(),
        queryRows: async () => [row({ id: 'run-1', version: 7, status: 'created' })],
        transitionRun,
        now: () => NOW,
        output: (line) => output.push(line),
        errorOutput: () => undefined,
      })
    ).resolves.toBe(CANARY_RESIDUE_EXIT_CODES.SUCCESS);

    expect(transitionRun).toHaveBeenCalledOnce();
    expect(transitionRun).toHaveBeenCalledWith('run-1', 'completed', 7, ['created', 'running']);
    expect(JSON.parse(output[0])).toMatchObject({
      verdict: 'pass',
      counts: { expectedShaRuns: 1, completedExpectedShaRuns: 1 },
      residue: { total: 5 },
    });
  });

  it('keeps default residue evaluation read-only', async () => {
    const transitionRun = vi.fn();

    await expect(
      runCanaryResidueAssertion({
        args: ['--expected-sha', SHA],
        env: { DATABASE_URL: 'postgres://read-only.example.test/canary' },
        readRuntimePolicy: () => policy(),
        queryRows: async () => [row({ id: 'run-1', version: 1, status: 'created' })],
        transitionRun,
        output: () => undefined,
        errorOutput: () => undefined,
      })
    ).resolves.toBe(CANARY_RESIDUE_EXIT_CODES.EXPECTED_SHA_FAILURE);

    expect(transitionRun).not.toHaveBeenCalled();
  });

  it('rejects memory DATABASE_URL before it can query', async () => {
    const output = [];
    const errors = [];
    let queried = false;

    await expect(
      runCanaryResidueAssertion({
        args: ['--expected-sha', SHA],
        env: { DATABASE_URL: '  MeMoRy://canary  ' },
        readRuntimePolicy: () => policy(),
        queryRows: async () => {
          queried = true;
          return [row()];
        },
        output: (line) => output.push(line),
        errorOutput: (line) => errors.push(line),
      })
    ).resolves.toBe(CANARY_RESIDUE_EXIT_CODES.INVALID_ARGUMENT);

    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0])).toMatchObject({ verdict: 'invalid' });
    expect(errors).toEqual([expect.stringMatching(/DATABASE_URL/)]);
    expect(queried).toBe(false);
  });

  it('trims a non-memory DATABASE_URL before injected query I/O', async () => {
    let receivedDatabaseUrl;

    await expect(
      runCanaryResidueAssertion({
        args: ['--expected-sha', SHA],
        env: { DATABASE_URL: '  postgres://read-only.example.test/canary  ' },
        readRuntimePolicy: () => policy(),
        queryRows: async (databaseUrl) => {
          receivedDatabaseUrl = databaseUrl;
          return [row()];
        },
        now: () => NOW,
        output: () => undefined,
        errorOutput: () => undefined,
      })
    ).resolves.toBe(CANARY_RESIDUE_EXIT_CODES.SUCCESS);

    expect(receivedDatabaseUrl).toBe('postgres://read-only.example.test/canary');
  });

  it('rejects a custom env object before default global policy loading', async () => {
    const output = [];
    const errors = [];
    let queried = false;

    await expect(
      runCanaryResidueAssertion({
        args: ['--expected-sha', SHA],
        env: { DATABASE_URL: 'postgres://read-only.example.test/canary' },
        queryRows: async () => {
          queried = true;
          return [row()];
        },
        output: (line) => output.push(line),
        errorOutput: (line) => errors.push(line),
      })
    ).resolves.toBe(CANARY_RESIDUE_EXIT_CODES.INVALID_ARGUMENT);

    expect(queried).toBe(false);
    expect(JSON.parse(output[0])).toMatchObject({ reason: expect.stringMatching(/custom env/i) });
    expect(errors).toEqual([expect.stringMatching(/custom env/i)]);
  });

  it('passes supplied env to an injected runtime policy reader', async () => {
    const env = { DATABASE_URL: 'postgres://read-only.example.test/canary' };
    let policyEnv;

    await expect(
      runCanaryResidueAssertion({
        args: ['--expected-sha', SHA],
        env,
        readRuntimePolicy: (receivedEnv) => {
          policyEnv = receivedEnv;
          return policy();
        },
        queryRows: async () => [row()],
        now: () => NOW,
        output: () => undefined,
        errorOutput: () => undefined,
      })
    ).resolves.toBe(CANARY_RESIDUE_EXIT_CODES.SUCCESS);

    expect(policyEnv).toBe(env);
  });

  it('loads the shared cap/TTL policy from process.env on the default path', async () => {
    // Mirrors the release workflow's residue step: no injected policy reader,
    // policy comes from the seven runner env vars via readCanaryRuntimePolicy.
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const { fileURLToPath } = await import('node:url');
    const path = await import('node:path');
    const script = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../scripts/release/assert-canary-residue.mjs'
    );

    const { stdout } = await promisify(execFile)(
      process.execPath,
      [script, '--expected-sha', SHA],
      {
        env: {
          ...process.env,
          // Unreachable database: the run must get PAST policy loading and
          // fail on the query instead, proving env-driven policy resolution.
          DATABASE_URL: 'postgres://canary:canary@127.0.0.1:9/canary',
          RELEASE_CANARY_MAX_PORTFOLIO_COMPANY_RESIDUE: '10',
          RELEASE_CANARY_MAX_FUND_RESIDUE: '10',
          RELEASE_CANARY_MAX_FUND_CONFIG_RESIDUE: '10',
          RELEASE_CANARY_MAX_FUND_EVENT_RESIDUE: '10',
          RELEASE_CANARY_MAX_NOTIFICATION_RESIDUE: '10',
          RELEASE_CANARY_MAX_TOTAL_RESIDUE: '50',
          RELEASE_CANARY_TTL_HOURS: '24',
        },
        timeout: 120_000,
      }
    ).catch((error) => error);

    const summary = JSON.parse(String(stdout).trim().split('\n').at(-1));
    expect(summary.exitCode).toBe(CANARY_RESIDUE_EXIT_CODES.INVALID_ARGUMENT);
    // caps non-null proves readCanaryRuntimePolicy consumed the env vars
    // before the (expected) connection failure.
    expect(summary.caps).toMatchObject({ total: 50, ttlHours: 24 });
  }, 180_000);
});
