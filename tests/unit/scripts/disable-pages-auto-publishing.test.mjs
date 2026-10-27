import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ACTION_ID,
  createFileLedger,
  createGitHubTransport,
  createSourceReader,
  executeContainment,
  parseArguments,
  readExistingToken,
  snapshotState,
  validateGitHubAdmission,
} from '../../../scripts/release/disable-pages-auto-publishing.mjs';

const REVIEWED = 'a'.repeat(40);
const MAIN = 'b'.repeat(40);
const SECRET = 'synthetic-github-token-never-emitted';
const REPO_URL = 'https://api.github.com/repos/nikhillinit/Updog_restore';
const temporaryDirectories = [];

function state(buildType = 'legacy') {
  return {
    repository: {
      id: 1023548405,
      name: 'Updog_restore',
      full_name: 'nikhillinit/Updog_restore',
      url: REPO_URL,
      node_id: 'repository-node',
      owner: { login: 'nikhillinit', id: 123 },
    },
    pages: {
      url: `${REPO_URL}/pages`,
      status: 'built',
      build_type: buildType,
      source: { branch: 'main', path: '/' },
      public: true,
      cname: null,
      html_url: 'https://nikhillinit.github.io/Updog_restore/',
      https_enforced: true,
      custom_404: false,
    },
  };
}

function source(overrides = {}) {
  return {
    headSha: REVIEWED,
    liveMainSha: MAIN,
    trackedDirty: false,
    trustedOrigin: true,
    mainIsAncestor: true,
    helperCommitted: true,
    helperSha256: 'c'.repeat(64),
    prMatches: true,
    ciGatePassed: true,
    ...overrides,
  };
}

function plan() {
  return snapshotState(state(), source()).planSha256;
}

function options(overrides = {}) {
  return {
    execute: true,
    expectedReviewedSha: REVIEWED,
    expectedMainSha: MAIN,
    expectedPlanSha256: plan(),
    bootstrapOwnerException: true,
    acceptConcurrentPagesChangeRisk: true,
    ...overrides,
  };
}

function harness(overrides = {}) {
  const records = [];
  const session = {
    attempted: vi.fn(async (record) => records.push(record)),
    finish: vi.fn(async (record) => records.push(record)),
  };
  return {
    now: () => 1_000,
    readSource: vi.fn(async () => source()),
    readState: vi
      .fn()
      .mockResolvedValueOnce(state())
      .mockResolvedValueOnce(state())
      .mockResolvedValue(state('workflow')),
    setWorkflow: vi.fn(async () => undefined),
    ledger: { acquire: vi.fn(async () => session) },
    session,
    records,
    ...overrides,
  };
}

function admission() {
  return {
    pull: {
      number: 1665,
      state: 'open',
      draft: false,
      head: { sha: REVIEWED, repo: { id: 1023548405, full_name: 'nikhillinit/Updog_restore' } },
      base: {
        sha: MAIN,
        ref: 'main',
        repo: { id: 1023548405, full_name: 'nikhillinit/Updog_restore' },
      },
    },
    checks: {
      total_count: 1,
      check_runs: [
        {
          name: 'CI Gate Status',
          head_sha: REVIEWED,
          status: 'completed',
          conclusion: 'success',
          app: { id: 15368 },
        },
      ],
    },
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe('GitHub Pages publishing containment', { retry: 0 }, () => {
  it('defaults to dry-run and rejects override, duplicate, conflicting, or incomplete arguments', () => {
    expect(parseArguments([])).toEqual({ execute: false });
    for (const args of [
      ['--token', SECRET],
      ['--ledger-path', '/tmp/alternate'],
      ['--repository', 'other/repo'],
      ['--execute', '--dry-run'],
      ['--expected-main-sha'],
      ['--execute', '--execute'],
    ])
      expect(() => parseArguments(args)).toThrow();
  });

  it('prepares a plan without claiming bootstrap authorization or admitted policy', async () => {
    const io = harness({
      readSource: vi.fn(async () =>
        source({ trackedDirty: true, ciGatePassed: undefined, prMatches: undefined })
      ),
    });
    const result = await executeContainment({ execute: false }, io);
    expect(result).toMatchObject({
      outcome: 'DRY_RUN',
      executionEligible: false,
      ownerExceptionRequired: true,
      policyAdmissionProven: false,
    });
    expect(result.plan.planSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(io.readSource.mock.calls[0][0].requireAdmission).toBe(false);
    expect(io.setWorkflow).not.toHaveBeenCalled();
    expect(io.ledger.acquire).not.toHaveBeenCalled();
  });

  it.each([
    { bootstrapOwnerException: false },
    { acceptConcurrentPagesChangeRisk: false },
    { expectedReviewedSha: 'bad' },
    { expectedMainSha: 'bad' },
  ])(
    'refuses absent execution acknowledgements or exact source inputs %# before provider access',
    async (change) => {
      const io = harness();
      await expect(executeContainment(options(change), io)).rejects.toThrow();
      expect(io.readState).not.toHaveBeenCalled();
      expect(io.setWorkflow).not.toHaveBeenCalled();
    }
  );

  it.each([
    { headSha: MAIN },
    { liveMainSha: REVIEWED },
    { trackedDirty: true },
    { trustedOrigin: false },
    { mainIsAncestor: false },
    { helperCommitted: false },
    { prMatches: false },
    { prMatches: undefined },
    { ciGatePassed: false },
    { ciGatePassed: undefined },
  ])('refuses unverified source/admission %# before provider state reads', async (change) => {
    const io = harness({ readSource: vi.fn(async () => source(change)) });
    await expect(executeContainment(options(), io)).rejects.toThrow();
    expect(io.readState).not.toHaveBeenCalled();
    expect(io.setWorkflow).not.toHaveBeenCalled();
  });

  it.each([
    (value) => {
      value.repository.id = 42;
    },
    (value) => {
      value.repository.full_name = 'other/Updog_restore';
    },
    (value) => {
      value.pages.url = 'https://api.github.com/repos/other/repo/pages';
    },
    (value) => {
      value.pages.html_url = 'https://other.github.io/Updog_restore/';
    },
    (value) => {
      value.pages.source.branch = 'other';
    },
    (value) => {
      value.pages.source.path = '/docs';
    },
    (value) => {
      value.pages.public = false;
    },
    (value) => {
      value.pages.build_type = 'unknown';
    },
  ])(
    'refuses target or initial configuration mismatch %# without reserving an action',
    async (change) => {
      const changed = state();
      change(changed);
      const io = harness({ readState: vi.fn(async () => changed) });
      await expect(executeContainment(options(), io)).rejects.toThrow();
      expect(io.ledger.acquire).not.toHaveBeenCalled();
      expect(io.setWorkflow).not.toHaveBeenCalled();
    }
  );

  it('binds the reviewed source and every Pages field, including status, to the plan', async () => {
    const io = harness();
    await expect(
      executeContainment(options({ expectedPlanSha256: 'd'.repeat(64) }), io)
    ).rejects.toThrow('REVIEWED_PLAN_MISMATCH');
    expect(io.setWorkflow).not.toHaveBeenCalled();
    const changed = state();
    changed.pages.status = 'building';
    expect(snapshotState(changed, source()).planSha256).not.toBe(plan());
    expect(snapshotState(state(), source({ helperSha256: 'd'.repeat(64) })).planSha256).not.toBe(
      plan()
    );
  });

  it('rechecks source, CI, identity and full plan, then persists one attempt before one PUT', async () => {
    const io = harness();
    io.setWorkflow.mockImplementation(async () => {
      expect(io.readSource).toHaveBeenCalledTimes(2);
      expect(io.readSource.mock.calls.every(([args]) => args.requireAdmission)).toBe(true);
      expect(io.readState).toHaveBeenCalledTimes(2);
      expect(io.session.attempted).toHaveBeenCalledTimes(1);
    });
    expect(await executeContainment(options(), io)).toMatchObject({
      outcome: 'WORKFLOW_MODE_VERIFIED',
      acknowledged: true,
      observedWorkflow: true,
      unrelatedUnchanged: true,
    });
    expect(io.setWorkflow).toHaveBeenCalledTimes(1);
    expect(new Set(io.readState.mock.calls.map(([args]) => args.deadlineAt))).toEqual(
      new Set([301_000])
    );
  });

  it('refuses CI or Pages configuration drift at the final fence', async () => {
    const sourceIo = harness({
      readSource: vi
        .fn()
        .mockResolvedValueOnce(source())
        .mockResolvedValue(source({ ciGatePassed: false })),
    });
    await expect(executeContainment(options(), sourceIo)).rejects.toThrow();
    expect(sourceIo.setWorkflow).not.toHaveBeenCalled();
    const changed = state();
    changed.pages.custom_field = 'new configuration';
    const stateIo = harness({
      readState: vi.fn().mockResolvedValueOnce(state()).mockResolvedValue(changed),
    });
    await expect(executeContainment(options(), stateIo)).rejects.toThrow(
      'PLAN_CHANGED_BEFORE_WRITE'
    );
    expect(stateIo.session.attempted).not.toHaveBeenCalled();
    expect(stateIo.setWorkflow).not.toHaveBeenCalled();
  });

  it('treats workflow mode only as a zero-write observation, never a prior-success proof', async () => {
    const io = harness({ readState: vi.fn(async () => state('workflow')) });
    expect(await executeContainment(options(), io)).toMatchObject({
      outcome: 'ALREADY_WORKFLOW',
      observationOnly: true,
      acknowledged: false,
      observedWorkflow: true,
    });
    expect(io.ledger.acquire).not.toHaveBeenCalled();
    expect(io.setWorkflow).not.toHaveBeenCalled();
  });

  it('does not retry a lost acknowledgement; records one bounded observed-mode readback', async () => {
    const io = harness({
      setWorkflow: vi.fn(async () => {
        throw new Error(SECRET);
      }),
    });
    const result = await executeContainment(options(), io);
    expect(result).toMatchObject({
      outcome: 'WORKFLOW_MODE_OBSERVED',
      acknowledged: false,
      observedWorkflow: true,
      unrelatedUnchanged: true,
    });
    expect(io.setWorkflow).toHaveBeenCalledTimes(1);
    expect(io.readState).toHaveBeenCalledTimes(3);
    expect(JSON.stringify([result, io.records])).not.toContain(SECRET);
  });

  it('keeps a surviving legacy mode unresolved with no retry or rollback', async () => {
    const io = harness({
      readState: vi.fn(async () => state()),
      setWorkflow: vi.fn(async () => {
        throw new Error(SECRET);
      }),
    });
    expect(await executeContainment(options(), io)).toMatchObject({
      outcome: 'UNRESOLVED',
      acknowledged: false,
      observedWorkflow: false,
    });
    expect(io.setWorkflow).toHaveBeenCalledTimes(1);
    expect(io.readState).toHaveBeenCalledTimes(3);
  });

  it('allows only build_type/status changes after PUT and reports every other delta', async () => {
    const allowed = state('workflow');
    allowed.pages.status = 'building';
    const good = harness({
      readState: vi
        .fn()
        .mockResolvedValueOnce(state())
        .mockResolvedValueOnce(state())
        .mockResolvedValue(allowed),
    });
    expect(await executeContainment(options(), good)).toMatchObject({
      outcome: 'WORKFLOW_MODE_VERIFIED',
    });
    const changed = state('workflow');
    changed.pages.cname = 'changed.example';
    const bad = harness({
      readState: vi
        .fn()
        .mockResolvedValueOnce(state())
        .mockResolvedValueOnce(state())
        .mockResolvedValue(changed),
    });
    expect(await executeContainment(options(), bad)).toMatchObject({
      outcome: 'UNRESOLVED',
      acknowledged: true,
      observedWorkflow: true,
      unrelatedUnchanged: false,
    });
  });

  it('refuses duplicate reservations or failed attempt persistence before PUT', async () => {
    const duplicate = harness({
      ledger: {
        acquire: vi.fn(async () => {
          throw new Error('reserved');
        }),
      },
    });
    await expect(executeContainment(options(), duplicate)).rejects.toThrow();
    expect(duplicate.setWorkflow).not.toHaveBeenCalled();
    const failed = harness();
    failed.session.attempted.mockRejectedValue(new Error(SECRET));
    await expect(executeContainment(options(), failed)).rejects.toThrow('ATTEMPT_RECORD_FAILED');
    expect(failed.setWorkflow).not.toHaveBeenCalled();
  });

  it('does not mutate after the deadline or create a new reconciliation budget', async () => {
    let clock = 1_000;
    const before = harness({ now: () => clock });
    before.session.attempted.mockImplementation(async () => {
      clock = 301_001;
    });
    await expect(executeContainment(options(), before)).rejects.toThrow(
      'ACTION_DEADLINE_EXHAUSTED'
    );
    expect(before.setWorkflow).not.toHaveBeenCalled();
    clock = 1_000;
    const after = harness({
      now: () => clock,
      setWorkflow: vi.fn(async () => {
        clock = 301_001;
        throw new Error(SECRET);
      }),
    });
    expect(await executeContainment(options(), after)).toMatchObject({ outcome: 'UNRESOLVED' });
    expect(after.readState).toHaveBeenCalledTimes(2);
    expect(after.setWorkflow).toHaveBeenCalledTimes(1);
  });
});

describe('fixed Pages transport, source and durable state', { retry: 0 }, () => {
  it('uses only fixed native HTTPS paths and the exact PUT body without redirects', async () => {
    const fetchImpl = vi.fn(async (url) => ({
      ok: true,
      json: async () => (url.endsWith('/pages') ? state().pages : state().repository),
    }));
    const transport = createGitHubTransport({ token: SECRET, fetchImpl });
    await transport.readState({ deadlineAt: Date.now() + 10_000 });
    await transport.setWorkflow({ deadlineAt: Date.now() + 10_000 });
    expect(
      fetchImpl.mock.calls.map(([url, args]) => [url, args.method, args.body, args.redirect])
    ).toEqual([
      [REPO_URL, 'GET', undefined, 'error'],
      [`${REPO_URL}/pages`, 'GET', undefined, 'error'],
      [`${REPO_URL}/pages`, 'PUT', '{"build_type":"workflow"}', 'error'],
    ]);
    expect(
      fetchImpl.mock.calls.every(([, args]) => args.headers.Authorization === `Bearer ${SECRET}`)
    ).toBe(true);
  });

  it('does not retry network, server or redirect failures or reveal raw diagnostics', async () => {
    for (const response of [500, 302, 'network']) {
      const fetchImpl = vi.fn(async () => {
        if (response === 'network') throw new Error(SECRET);
        return { ok: false, status: response };
      });
      const transport = createGitHubTransport({ token: SECRET, fetchImpl });
      await expect(transport.setWorkflow({ deadlineAt: Date.now() + 1_000 })).rejects.toThrow(
        'GITHUB_REQUEST_FAILED'
      );
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it('caps request and body reads at the same remaining deadline', async () => {
    for (const body of [false, true]) {
      const fetchImpl = vi.fn((_url, { signal }) => {
        const pending = () =>
          new Promise((_resolve, reject) =>
            signal.addEventListener('abort', () => reject(new Error(SECRET)), { once: true })
          );
        return body ? Promise.resolve({ ok: true, json: pending }) : pending();
      });
      const transport = createGitHubTransport({ token: SECRET, fetchImpl });
      await expect(transport.readState({ deadlineAt: Date.now() + 15 })).rejects.toThrow(
        'GITHUB_REQUEST_FAILED'
      );
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it('uses existing environment auth precedence or one read-only gh auth token call', async () => {
    const execFileImpl = vi.fn(async () => ({ stdout: SECRET + '\n' }));
    expect(
      await readExistingToken({
        environment: { GH_TOKEN: SECRET, GITHUB_TOKEN: 'secondary' },
        execFileImpl,
        deadlineAt: Date.now() + 1_000,
      })
    ).toBe(SECRET);
    expect(execFileImpl).not.toHaveBeenCalled();
    expect(
      await readExistingToken({
        environment: { GITHUB_TOKEN: SECRET },
        execFileImpl,
        deadlineAt: Date.now() + 1_000,
      })
    ).toBe(SECRET);
    expect(
      await readExistingToken({ environment: {}, execFileImpl, deadlineAt: Date.now() + 1_000 })
    ).toBe(SECRET);
    expect(execFileImpl.mock.calls[0].slice(0, 2)).toEqual([
      'gh',
      ['auth', 'token', '--hostname', 'github.com'],
    ]);
    expect(JSON.stringify(execFileImpl.mock.calls)).not.toContain(SECRET);
    await expect(
      readExistingToken({
        environment: { GH_TOKEN: '' },
        execFileImpl,
        deadlineAt: Date.now() + 1_000,
      })
    ).rejects.toThrow('GITHUB_AUTH_UNAVAILABLE');
    await expect(
      readExistingToken({
        environment: {},
        execFileImpl: async () => {
          throw new Error(SECRET);
        },
        deadlineAt: Date.now() + 1_000,
      })
    ).rejects.toThrow('GITHUB_AUTH_UNAVAILABLE');
  });

  it('requires exact PR1665 and successful current-head GitHub Actions aggregate', () => {
    const good = admission();
    expect(validateGitHubAdmission(good.pull, good.checks, REVIEWED, MAIN)).toEqual({
      prMatches: true,
      ciGatePassed: true,
    });
    for (const change of [
      (value) => {
        value.pull.draft = true;
      },
      (value) => {
        value.pull.state = 'closed';
      },
      (value) => {
        value.pull.head.sha = MAIN;
      },
      (value) => {
        value.pull.base.sha = REVIEWED;
      },
      (value) => {
        value.checks.check_runs[0].app.id = 42;
      },
      (value) => {
        value.checks.check_runs[0].conclusion = 'failure';
      },
      (value) => {
        value.checks.check_runs[0].head_sha = MAIN;
      },
      (value) => {
        value.checks.total_count = 101;
      },
      (value) => {
        value.checks.check_runs.push(value.checks.check_runs[0]);
        value.checks.total_count++;
      },
    ]) {
      const bad = admission();
      change(bad);
      const result = validateGitHubAdmission(bad.pull, bad.checks, REVIEWED, MAIN);
      expect(result.prMatches && result.ciGatePassed).toBe(false);
    }
  });

  it('reads its own source bytes, refreshed main, ancestry and bounded exact PR checks', async () => {
    const content = 'exact own helper bytes\n';
    const data = admission();
    const execFileImpl = vi.fn(async (command, args) => {
      if (command === 'gh')
        return {
          stdout: JSON.stringify(args.at(-1).includes('/pulls/') ? data.pull : data.checks),
        };
      if (args[0] === 'remote') return { stdout: 'git@github.com:nikhillinit/Updog_restore.git\n' };
      if (args[0] === 'ls-remote') return { stdout: `${MAIN}\trefs/heads/main\n` };
      if (args[0] === 'rev-parse') return { stdout: (args[1] === 'HEAD' ? REVIEWED : MAIN) + '\n' };
      if (args[0] === 'show') return { stdout: content };
      return { stdout: '' };
    });
    const readFileImpl = vi.fn(async () => content);
    const reader = createSourceReader({ execFileImpl, readFileImpl, now: () => 1_000 });
    const result = await reader({
      deadlineAt: 301_000,
      requireAdmission: true,
      expectedReviewedSha: REVIEWED,
      expectedMainSha: MAIN,
    });
    expect(result).toMatchObject({
      headSha: REVIEWED,
      liveMainSha: MAIN,
      helperCommitted: true,
      mainIsAncestor: true,
      prMatches: true,
      ciGatePassed: true,
    });
    expect(readFileImpl.mock.calls[0][0]).toBe(
      path.resolve('scripts/release/disable-pages-auto-publishing.mjs')
    );
    expect(
      execFileImpl.mock.calls.every(([, , args]) => args.timeout > 0 && args.timeout <= 30_000)
    ).toBe(true);
    expect(
      execFileImpl.mock.calls.some(
        ([command, args]) =>
          command === 'git' &&
          args.join(' ') === `show ${REVIEWED}:scripts/release/disable-pages-auto-publishing.mjs`
      )
    ).toBe(true);
    expect(
      execFileImpl.mock.calls.some(
        ([command, args]) =>
          command === 'git' && args.join(' ') === `merge-base --is-ancestor ${MAIN} ${REVIEWED}`
      )
    ).toBe(true);
    readFileImpl.mockResolvedValue(content + '\n');
    expect((await reader({ deadlineAt: 301_000, requireAdmission: false })).helperCommitted).toBe(
      false
    );
  });

  it('reserves once, fsyncs create-only phase records, and refuses duplicate/crash replay', async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'pages-containment-'));
    temporaryDirectories.push(temporary);
    const directory = path.join(temporary, ACTION_ID);
    const ledger = createFileLedger(directory);
    const outcomes = await Promise.allSettled([
      ledger.acquire({ actionId: ACTION_ID }),
      ledger.acquire({ actionId: ACTION_ID }),
    ]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const session = outcomes.find((result) => result.status === 'fulfilled').value;
    await session.attempted({ phase: 'PUT_ATTEMPTED' });
    expect(
      JSON.parse(await readFile(path.join(directory, '001-put-attempted.json'), 'utf8'))
    ).toEqual({ phase: 'PUT_ATTEMPTED' });
    await expect(createFileLedger(directory).acquire({})).rejects.toThrow(
      'ACTION_ALREADY_RESERVED'
    );
    await expect(session.attempted({})).rejects.toThrow();
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
    expect((await stat(path.join(directory, '001-put-attempted.json'))).mode & 0o777).toBe(0o600);
  });
});
