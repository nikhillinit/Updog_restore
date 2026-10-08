import { describe, expect, it, vi } from 'vitest';

import {
  RESERVE_DELIVERY_EXPOSURE_CONTEXT_QUERY,
  RESERVE_DELIVERY_EXPOSURE_EXIT_CODES,
  RESERVE_DELIVERY_EXPOSURE_QUERY,
  formatExposureReport,
  parseReserveDeliveryExposureArgs,
  resolvePreviousPromotion,
  runReserveDeliveryExposureReport,
  summarizeExposure,
} from '../../../scripts/release/report-reserve-delivery-exposure.mjs';

const TOKEN = 'test-token';
const REPOSITORY = 'example-owner/example-repo';
const ENV = {
  DATABASE_URL: 'postgres://read-only.example.test/report',
  GH_TOKEN: TOKEN,
  GITHUB_REPOSITORY: REPOSITORY,
  GITHUB_RUN_ID: '999',
};
const CONTEXT = {
  executed_at: new Date('2026-10-08T12:00:00.000Z'),
  has_deadline_at: true,
  has_data_origin: true,
  has_canary_run_id: true,
  events_visible_total: '200',
  runs_visible_total: '30',
  queued_events_visible_all_time: '90',
  first_queued_event_at: new Date('2026-08-09T00:01:00.000Z'),
  last_queued_event_at: new Date('2026-10-08T11:00:00.000Z'),
};

function githubResponse(body, overrides = {}) {
  return { ok: true, json: async () => body, ...overrides };
}

function promotionRun(id, runStartedAt, conclusion = 'success') {
  return { id, run_started_at: runStartedAt, conclusion };
}

function promotionJobs(stepConclusion = 'success', jobName = 'Promote Staged Vercel Deployment') {
  return {
    jobs: [
      {
        name: jobName,
        conclusion: 'failure',
        steps: [
          { name: 'Promote verified deployment', conclusion: 'success' },
          { name: 'Resolve and prove canonical Vercel promotion', conclusion: stepConclusion },
        ],
      },
    ],
  };
}

function queuedRows(overrides = {}) {
  return [
    {
      classification: 'no_run_drop_candidate',
      canary_fund: false,
      count: 2,
      fund_id: 'fund-private-id',
      scenario_set_id: 'scenario-private-id',
      job_id: 'job-private-id',
      correlation_id: 'correlation-private-id',
      run_id: 'run-private-id',
    },
    ...(overrides.rows ?? []),
  ];
}

function fakePool({ context = CONTEXT, rows = queuedRows(), failAt } = {}) {
  const calls = [];
  const client = {
    query: vi.fn(async (query, values) => {
      calls.push({ query, values });
      if (failAt === query) {
        const error = new Error('secret database detail must not escape');
        error.code = '42501';
        throw error;
      }
      if (query === RESERVE_DELIVERY_EXPOSURE_CONTEXT_QUERY) return { rows: [context] };
      if (query === RESERVE_DELIVERY_EXPOSURE_QUERY) return { rows };
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  const pool = { connect: vi.fn(async () => client), end: vi.fn() };
  return { calls, client, pool, createPool: vi.fn(async () => pool) };
}

describe('reserve delivery exposure release report', () => {
  it('uses the newest successful canonical proof even when later job or run status failed', async () => {
    const runs = [promotionRun(12, '2026-10-07T10:00:00Z', 'failure')];
    const fetch = vi.fn(async (url, options) => {
      expect(options.headers.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(options.signal).toHaveProperty('aborted', false);
      return url.includes('/jobs?')
        ? githubResponse(promotionJobs())
        : githubResponse({ workflow_runs: runs });
    });

    await expect(
      resolvePreviousPromotion({
        fetch,
        repository: REPOSITORY,
        token: TOKEN,
        currentRunId: '99',
      })
    ).resolves.toEqual({ source: 'promotion', windowStart: '2026-10-07T10:00:00Z', runId: '12' });
  });

  it('skips the current run, phase A and runs without successful proof, then picks previous proof run start', async () => {
    const runs = [
      promotionRun(999, '2026-10-08T11:00:00Z'),
      promotionRun(14, '2026-10-08T09:00:00Z'),
      promotionRun(13, '2026-10-08T08:00:00Z'),
      promotionRun(12, '2026-10-07T10:00:00Z'),
    ];
    const jobs = new Map([
      ['14', { jobs: [{ name: 'railway-workers-only', steps: [] }] }],
      ['13', promotionJobs('failure')],
      ['12', promotionJobs('success')],
    ]);
    const fetch = vi.fn(async (url) => {
      const jobMatch = url.match(/\/runs\/(\d+)\/jobs/);
      return jobMatch
        ? githubResponse(jobs.get(jobMatch[1]))
        : githubResponse({ workflow_runs: runs });
    });

    const result = await resolvePreviousPromotion({
      fetch,
      repository: REPOSITORY,
      token: TOKEN,
      currentRunId: '999',
    });
    expect(result).toEqual({
      source: 'promotion',
      windowStart: '2026-10-07T10:00:00Z',
      runId: '12',
    });
    expect(fetch).toHaveBeenCalledTimes(4);
    const queuedBetweenPreflightAndPromotion = Date.parse('2026-10-07T10:03:00Z');
    expect(queuedBetweenPreflightAndPromotion).toBeGreaterThanOrEqual(
      Date.parse(result.windowStart)
    );
  });

  it('does not treat a successful promote command or a legacy job without proof as promotion', async () => {
    const fetch = vi.fn(async (url) => {
      const jobs = url.includes('/jobs?')
        ? {
            jobs: [
              {
                name: 'Promote Staged Vercel Deployment',
                steps: [{ name: 'Promote verified deployment', conclusion: 'success' }],
              },
            ],
          }
        : { workflow_runs: [promotionRun(5, '2026-10-01T00:00:00Z')] };
      return githubResponse(jobs);
    });
    await expect(
      resolvePreviousPromotion({ fetch, repository: REPOSITORY, token: TOKEN, currentRunId: '9' })
    ).resolves.toEqual({ source: 'fallback', windowStart: '2026-08-09T00:00:00Z' });
  });

  it('falls back when completed runs are exhausted', async () => {
    const fetch = vi.fn(async (url) =>
      githubResponse(url.includes('/jobs?') ? { jobs: [] } : { workflow_runs: [] })
    );
    await expect(
      resolvePreviousPromotion({ fetch, repository: REPOSITORY, token: TOKEN, currentRunId: '9' })
    ).resolves.toEqual({ source: 'fallback', windowStart: '2026-08-09T00:00:00Z' });
  });

  it('throws on API errors, malformed responses, invalid matched timestamps, and deadline expiry', async () => {
    const options = { repository: REPOSITORY, token: TOKEN, currentRunId: '9' };
    await expect(
      resolvePreviousPromotion({ ...options, fetch: async () => githubResponse({}, { ok: false }) })
    ).rejects.toThrow('GitHub API request failed');
    await expect(
      resolvePreviousPromotion({
        ...options,
        fetch: async () => ({
          ok: true,
          json: async () => {
            throw new Error();
          },
        }),
      })
    ).rejects.toThrow('malformed JSON');

    const invalidTimestampFetch = async (url) =>
      githubResponse(
        url.includes('/jobs?') ? promotionJobs() : { workflow_runs: [promotionRun(3, null)] }
      );
    await expect(
      resolvePreviousPromotion({ ...options, fetch: invalidTimestampFetch })
    ).rejects.toThrow('run_started_at');

    let clock = 0;
    const deadlineFetch = async () => {
      clock = 11;
      return githubResponse({ workflow_runs: [] });
    };
    await expect(
      resolvePreviousPromotion({
        ...options,
        fetch: deadlineFetch,
        deadlineAt: 10,
        now: () => clock,
      })
    ).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it('validates classifications, booleans and numeric integer counts while splitting canary rows', () => {
    const summary = summarizeExposure([
      { classification: 'no_run_drop_candidate', canary_fund: false, count: 3 },
      { classification: 'no_run_drop_candidate', canary_fund: true, count: 7 },
      { classification: 'completed_with_snapshot', canary_fund: false, count: 2 },
    ]);
    expect(summary).toMatchObject({
      counts: { no_run_drop_candidate: 3, completed_with_snapshot: 2 },
      canaryTotal: 7,
      warningTotal: 3,
    });
    expect(() =>
      summarizeExposure([{ classification: 'new_class', canary_fund: false, count: 1 }])
    ).toThrow('unknown classification');
    for (const count of ['1', -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() =>
        summarizeExposure([{ classification: 'stuck', canary_fund: false, count }])
      ).toThrow('safe non-negative integer');
    }
    expect(() =>
      summarizeExposure([{ classification: 'stuck', canary_fund: 1, count: 1 }])
    ).toThrow('canary flag');
  });

  it('rejects invalid CLI bounds and defaults valid options', () => {
    expect(parseReserveDeliveryExposureArgs([])).toEqual({
      stuckAfterHours: 6,
      statementTimeoutSeconds: 60,
      deadlineSeconds: 120,
    });
    expect(() => parseReserveDeliveryExposureArgs(['--deadline-seconds', '151'])).toThrow(
      '30 to 150'
    );
  });

  it('formats counts and timestamps without accepting row identifiers', () => {
    const summary = summarizeExposure(
      queuedRows({ rows: [{ classification: 'stuck', canary_fund: false, count: 1 }] })
    );
    const report = formatExposureReport({
      windowStart: '2026-10-07T10:00:00Z',
      windowEnd: '2026-10-08T12:00:00Z',
      windowSource: 'promotion',
      promotionRunId: '123456',
      context: CONTEXT,
      summary,
    });
    const rendered = `${report.lines.join('\n')}\n${report.stepSummary}\n${report.warning}`;
    expect(rendered).toContain('2026-10-07T10:00:00Z');
    expect(rendered).toContain('no_run_drop_candidate');
    expect(rendered).not.toContain('fund-private-id');
    expect(rendered).not.toContain('scenario-private-id');
    expect(rendered).not.toContain('job-private-id');
    expect(rendered).not.toContain('correlation-private-id');
    expect(rendered).not.toContain('run-private-id');
    const finalProjection = RESERVE_DELIVERY_EXPOSURE_QUERY.split(/\)\s*SELECT\s*\n/).at(-1);
    expect(finalProjection).toContain('classification,');
    expect(finalProjection).toContain('canary_fund,');
    expect(finalProjection).toContain('count(*)::int AS count');
    expect(finalProjection).not.toMatch(
      /fund_id|scenario_set_id|job_id|correlation_id|event_id|run_id/
    );
    expect(RESERVE_DELIVERY_EXPOSURE_CONTEXT_QUERY).not.toContain('current_user');
    expect(RESERVE_DELIVERY_EXPOSURE_CONTEXT_QUERY).not.toContain('is_superuser');
  });

  it('returns success for warning findings and runs read-only queries in order', async () => {
    const { calls, client, pool, createPool } = fakePool();
    const fetch = vi.fn(async () => githubResponse({ workflow_runs: [] }));
    const output = [];
    const errors = [];
    const code = await runReserveDeliveryExposureReport({
      args: [],
      env: ENV,
      fetch,
      createPool,
      now: () => 1_000,
      output: (line) => output.push(line),
      errorOutput: (line) => errors.push(line),
    });

    expect(code).toBe(RESERVE_DELIVERY_EXPOSURE_EXIT_CODES.SUCCESS);
    expect(calls.map(({ query }) => query)).toEqual([
      'BEGIN TRANSACTION READ ONLY',
      expect.stringMatching(/^SET LOCAL statement_timeout/),
      "SET LOCAL lock_timeout = '5s'",
      RESERVE_DELIVERY_EXPOSURE_CONTEXT_QUERY,
      expect.stringMatching(/^SET LOCAL statement_timeout/),
      RESERVE_DELIVERY_EXPOSURE_QUERY,
      'ROLLBACK',
    ]);
    expect(calls[5].values).toEqual([
      '2026-08-09T00:00:00Z',
      '2026-10-08T12:00:00.000Z',
      '6 hours',
    ]);
    expect(output.some((line) => line.startsWith('::warning::'))).toBe(true);
    expect(errors).toEqual([]);
    expect(client.release).toHaveBeenCalledOnce();
    expect(pool.end).toHaveBeenCalledOnce();
  });

  it('returns nonzero on database failure, hides database details, rolls back and ends pool', async () => {
    const { calls, client, pool, createPool } = fakePool({
      failAt: RESERVE_DELIVERY_EXPOSURE_CONTEXT_QUERY,
    });
    const errors = [];
    const code = await runReserveDeliveryExposureReport({
      env: ENV,
      fetch: async () => githubResponse({ workflow_runs: [] }),
      createPool,
      output: () => {},
      errorOutput: (line) => errors.push(line),
    });
    expect(code).toBe(RESERVE_DELIVERY_EXPOSURE_EXIT_CODES.EXECUTION_FAILURE);
    expect(calls.at(-1).query).toBe('ROLLBACK');
    expect(errors.join('\n')).toContain('42501');
    expect(errors.join('\n')).not.toContain('secret database detail');
    expect(client.release).toHaveBeenCalledOnce();
    expect(pool.end).toHaveBeenCalledOnce();
  });
});
