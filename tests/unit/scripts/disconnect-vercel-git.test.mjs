import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ACTION_ID,
  PROJECT_ID,
  TEAM_ID,
  createFileLedger,
  createVercelTransport,
  executeDisconnect,
  parseArguments,
  readExistingToken,
  snapshotProject,
} from '../../../scripts/release/disconnect-vercel-git.mjs';

const SHA = 'a'.repeat(40);
const SECRET = 'synthetic-provider-secret-never-output';
const POLICY = `## One-time Vercel Git-repository disconnect (ADR-112)
The action \`vercel-git-disconnect-2026-10-27\` uses
\`scripts/release/disconnect-vercel-git.mjs\`.
## Next section
`;
const directories = [];

function project() {
  return {
    id: PROJECT_ID,
    accountId: TEAM_ID,
    name: 'updog-restore',
    updatedAt: 1,
    link: {
      type: 'github',
      org: 'nikhillinit',
      repo: 'Updog_restore',
      repoId: 1023548405,
      productionBranch: 'main',
      gitCredentialId: 'credential-id',
      deployHooks: [],
    },
    env: [{ id: 'env-id', key: 'DATABASE_URL', value: SECRET, target: ['production'] }],
    targets: { production: { id: 'dpl-production', url: 'existing.vercel.app' } },
    passwordProtection: { deploymentType: 'all', password: SECRET },
    framework: 'vite',
  };
}

function unlinked() {
  return { ...project(), link: null, updatedAt: 2 };
}

function source() {
  return {
    headSha: SHA,
    liveMainSha: SHA,
    dirty: false,
    trustedOrigin: true,
    helperMatchesProtected: true,
    policy: POLICY,
    policySha256: 'b'.repeat(64),
    helperSha256: 'c'.repeat(64),
  };
}

function options(overrides = {}) {
  return {
    execute: true,
    expectedSha: SHA,
    ownerAuthorized: true,
    acceptConcurrentLinkChangeRisk: true,
    expectedLinkSha256: snapshotProject(project()).linkSha256,
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
    records,
    session,
    now: () => 1_000,
    readSource: vi.fn(async () => source()),
    readProject: vi
      .fn()
      .mockResolvedValueOnce(project())
      .mockResolvedValueOnce(project())
      .mockResolvedValue(unlinked()),
    deleteLink: vi.fn(async () => undefined),
    ledger: { acquire: vi.fn(async () => session) },
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe('one-time Vercel Git disconnect', { retry: 0 }, () => {
  it('defaults to dry-run, requires explicit execution controls, and rejects unknown arguments', () => {
    expect(parseArguments([])).toEqual({ execute: false });
    expect(() => parseArguments(['--token', SECRET])).toThrow();
    expect(() => parseArguments(['--execute', '--dry-run'])).toThrow();
    expect(() => parseArguments(['--expected-sha', SHA, '--expected-sha', SHA])).toThrow();
  });

  it('prepares an unmerged dry-run without claiming execution eligibility or acquiring a ledger', async () => {
    const io = harness({
      readSource: vi.fn(async () => ({ ...source(), headSha: 'd'.repeat(40), policy: '' })),
    });
    const result = await executeDisconnect({ execute: false }, io);
    expect(result).toMatchObject({
      outcome: 'DRY_RUN',
      executionEligible: false,
      observedUnlinked: false,
    });
    expect(result.plan.linkSha256).toBe(snapshotProject(project()).linkSha256);
    expect(io.deleteLink).not.toHaveBeenCalled();
    expect(io.ledger.acquire).not.toHaveBeenCalled();
  });

  it.each([
    ['owner authorization', { ownerAuthorized: false }],
    ['concurrency risk', { acceptConcurrentLinkChangeRisk: false }],
    ['source SHA', { expectedSha: 'bad' }],
  ])('refuses missing %s before provider access', async (_name, changed) => {
    const io = harness();
    await expect(executeDisconnect(options(changed), io)).rejects.toThrow();
    expect(io.readProject).not.toHaveBeenCalled();
    expect(io.deleteLink).not.toHaveBeenCalled();
  });

  it.each([
    { headSha: 'd'.repeat(40) },
    { liveMainSha: 'd'.repeat(40) },
    { dirty: true },
    { trustedOrigin: false },
    { helperMatchesProtected: false },
    { policy: '' },
    { policy: `## Other\n${ACTION_ID}\nscripts/release/disconnect-vercel-git.mjs` },
    {
      policy:
        '## One-time Vercel Git-repository disconnect (ADR-112)\n## Other\n' +
        POLICY.split('\n').slice(1).join('\n'),
    },
  ])('refuses stale, dirty, or unadmitted source %# before provider access', async (change) => {
    const io = harness({ readSource: vi.fn(async () => ({ ...source(), ...change })) });
    await expect(executeDisconnect(options(), io)).rejects.toThrow();
    expect(io.readProject).not.toHaveBeenCalled();
    expect(io.deleteLink).not.toHaveBeenCalled();
  });

  it.each([
    { id: 'other-project' },
    { accountId: 'other-team' },
    { name: 'other-project' },
    { link: { ...project().link, repo: 'other' } },
    { link: { ...project().link, org: 'other' } },
    { link: { ...project().link, repoId: 123 } },
    { link: { ...project().link, productionBranch: 'other' } },
    { link: { ...project().link, deployHooks: undefined } },
    { link: { ...project().link, deployHooks: [{ id: 'hook-id' }] } },
    { env: undefined },
    { targets: {} },
  ])('refuses wrong or incomplete provider target %#', async (change) => {
    const io = harness({ readProject: vi.fn(async () => ({ ...project(), ...change })) });
    await expect(executeDisconnect(options(), io)).rejects.toThrow();
    expect(io.deleteLink).not.toHaveBeenCalled();
    expect(io.ledger.acquire).not.toHaveBeenCalled();
  });

  it('requires the reviewed link digest and detects link drift immediately before write', async () => {
    const absent = harness();
    await expect(
      executeDisconnect(options({ expectedLinkSha256: undefined }), absent)
    ).rejects.toThrow();
    expect(absent.deleteLink).not.toHaveBeenCalled();
    const changed = { ...project(), link: { ...project().link, gitCredentialId: 'changed' } };
    const io = harness({
      readProject: vi.fn().mockResolvedValueOnce(project()).mockResolvedValue(changed),
    });
    await expect(executeDisconnect(options(), io)).rejects.toThrow();
    expect(io.session.attempted).not.toHaveBeenCalled();
    expect(io.deleteLink).not.toHaveBeenCalled();
  });

  it('rechecks source and persists the attempt before exactly one mutation', async () => {
    const io = harness();
    io.deleteLink.mockImplementation(async () => {
      expect(io.readSource).toHaveBeenCalledTimes(2);
      expect(io.readProject).toHaveBeenCalledTimes(2);
      expect(io.session.attempted).toHaveBeenCalledTimes(1);
    });
    const result = await executeDisconnect(options(), io);
    expect(result).toMatchObject({
      outcome: 'DISCONNECTED_VERIFIED',
      acknowledged: true,
      observedUnlinked: true,
      unrelatedUnchanged: true,
    });
    expect(io.deleteLink).toHaveBeenCalledTimes(1);
    expect(new Set(io.readProject.mock.calls.map(([value]) => value.deadlineAt))).toEqual(
      new Set([301_000])
    );
  });

  it('does not mutate when a duplicate runner cannot reserve the fixed action', async () => {
    const io = harness({
      ledger: {
        acquire: vi.fn(async () => {
          throw new Error('ACTION_ALREADY_RESERVED');
        }),
      },
    });
    await expect(executeDisconnect(options(), io)).rejects.toThrow();
    expect(io.deleteLink).not.toHaveBeenCalled();
  });

  it('does not mutate when the consumed attempt cannot be persisted', async () => {
    const io = harness();
    io.session.attempted.mockRejectedValue(new Error(SECRET));
    await expect(executeDisconnect(options(), io)).rejects.toThrow('ATTEMPT_RECEIPT_FAILED');
    expect(io.deleteLink).not.toHaveBeenCalled();
    expect(JSON.stringify(io.records)).not.toContain(SECRET);
  });

  it('refuses late source drift before persisting any mutation attempt', async () => {
    const io = harness({
      readSource: vi
        .fn()
        .mockResolvedValueOnce(source())
        .mockResolvedValue({ ...source(), dirty: true }),
    });
    await expect(executeDisconnect(options(), io)).rejects.toThrow();
    expect(io.deleteLink).not.toHaveBeenCalled();
    expect(io.session.attempted).not.toHaveBeenCalled();
  });

  it('reports already unlinked readback without acquiring a ledger or mutating', async () => {
    const io = harness({ readProject: vi.fn(async () => unlinked()) });
    const result = await executeDisconnect(options(), io);
    expect(result).toMatchObject({
      outcome: 'ALREADY_UNLINKED',
      acknowledged: false,
      observedUnlinked: true,
      observationOnly: true,
    });
    expect(result).not.toHaveProperty('unrelatedUnchanged');
    expect(result).not.toHaveProperty('postRead');
    expect(io.ledger.acquire).not.toHaveBeenCalled();
    expect(io.deleteLink).not.toHaveBeenCalled();
  });

  it('distinguishes response loss from acknowledgement and performs one read reconciliation', async () => {
    const io = harness({
      deleteLink: vi.fn(async () => {
        throw new Error(SECRET);
      }),
    });
    const result = await executeDisconnect(options(), io);
    expect(result).toMatchObject({
      outcome: 'DISCONNECT_OBSERVED',
      acknowledged: false,
      observedUnlinked: true,
    });
    expect(io.readProject).toHaveBeenCalledTimes(3);
    expect(io.deleteLink).toHaveBeenCalledTimes(1);
    expect(JSON.stringify([result, io.records])).not.toContain(SECRET);
  });

  it('keeps provider failure with a surviving link unresolved without retry', async () => {
    const io = harness({
      readProject: vi.fn(async () => project()),
      deleteLink: vi.fn(async () => {
        throw new Error(SECRET);
      }),
    });
    expect(await executeDisconnect(options(), io)).toMatchObject({
      outcome: 'UNRESOLVED',
      acknowledged: false,
      observedUnlinked: false,
    });
    expect(io.deleteLink).toHaveBeenCalledTimes(1);
    expect(io.readProject).toHaveBeenCalledTimes(3);
  });

  it('does not create a reconciliation window after a mutation timeout exhausts the action', async () => {
    let clock = 1_000;
    const io = harness({
      now: () => clock,
      deleteLink: vi.fn(async () => {
        clock = 301_001;
        throw new Error(SECRET);
      }),
    });
    expect(await executeDisconnect(options(), io)).toMatchObject({
      outcome: 'UNRESOLVED',
      acknowledged: false,
    });
    expect(io.readProject).toHaveBeenCalledTimes(2);
    expect(io.deleteLink).toHaveBeenCalledTimes(1);
  });

  it.each([
    { env: [{ ...project().env[0], updatedAt: 2 }] },
    { targets: { production: { id: 'other-deployment' } } },
    { framework: 'other' },
  ])(
    'does not claim successful containment when unrelated postconditions drift %#',
    async (changed) => {
      const io = harness({
        readProject: vi
          .fn()
          .mockResolvedValueOnce(project())
          .mockResolvedValueOnce(project())
          .mockResolvedValue({ ...unlinked(), ...changed }),
      });
      expect(await executeDisconnect(options(), io)).toMatchObject({
        outcome: 'UNRESOLVED',
        acknowledged: true,
        observedUnlinked: true,
        unrelatedUnchanged: false,
      });
      expect(io.deleteLink).toHaveBeenCalledTimes(1);
    }
  );

  it('exhausts one total deadline without issuing a mutation or opening a new budget', async () => {
    let clock = 1_000;
    const io = harness({ now: () => clock });
    io.session.attempted.mockImplementation(async () => {
      clock = 301_001;
    });
    await expect(executeDisconnect(options(), io)).rejects.toThrow(/DEADLINE/);
    expect(io.deleteLink).not.toHaveBeenCalled();
  });

  it('never includes environment values or provider payload in plans and receipts', async () => {
    const first = snapshotProject(project());
    const second = snapshotProject({
      ...project(),
      env: [{ ...project().env[0], value: 'different-secret' }],
    });
    expect(first.environmentMetadataSha256).toBe(second.environmentMetadataSha256);
    const io = harness();
    const result = await executeDisconnect(options(), io);
    const serialized = JSON.stringify([first, result, io.records]);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain('DATABASE_URL');
    expect(serialized).not.toContain('existing.vercel.app');
  });
});

describe('fixed Vercel transport and durable ledger', { retry: 0 }, () => {
  it('uses an existing environment token without reading any credential file', async () => {
    const readFileImpl = vi.fn();
    expect(
      await readExistingToken({
        environment: { VERCEL_TOKEN: SECRET },
        platform: 'darwin',
        readFileImpl,
      })
    ).toBe(SECRET);
    expect(readFileImpl).not.toHaveBeenCalled();
  });

  it('reads only the fixed macOS auth file, uses no refresh token, and refuses expiry', async () => {
    const readFileImpl = vi.fn(async () =>
      JSON.stringify({ token: SECRET, refreshToken: 'never-used', expiresAt: 100 })
    );
    const parameters = {
      environment: {},
      platform: 'darwin',
      home: '/test-user',
      now: () => 99_000,
      readFileImpl,
    };
    expect(await readExistingToken(parameters)).toBe(SECRET);
    expect(readFileImpl).toHaveBeenCalledWith(
      '/test-user/Library/Application Support/com.vercel.cli/auth.json',
      'utf8'
    );
    await expect(readExistingToken({ ...parameters, now: () => 101_000 })).rejects.toThrow(
      'VERCEL_AUTH_EXPIRED'
    );
    await expect(readExistingToken({ ...parameters, platform: 'linux' })).rejects.toThrow(
      'VERCEL_AUTH_PLATFORM_UNSUPPORTED'
    );
    await expect(
      readExistingToken({
        ...parameters,
        readFileImpl: async () => JSON.stringify({ refreshToken: SECRET }),
      })
    ).rejects.toThrow('VERCEL_AUTH_UNAVAILABLE');
  });

  it('uses only fixed GET/DELETE endpoints, team scope, in-memory auth, and no redirects', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => project() }));
    const transport = createVercelTransport({ token: SECRET, fetchImpl });
    await transport.readProject({ deadlineAt: Date.now() + 10_000 });
    await transport.deleteLink({ deadlineAt: Date.now() + 10_000 });
    expect(fetchImpl.mock.calls.map(([url, init]) => [url, init.method, init.redirect])).toEqual([
      [`https://api.vercel.com/v9/projects/${PROJECT_ID}?teamId=${TEAM_ID}`, 'GET', 'error'],
      [
        `https://api.vercel.com/v9/projects/${PROJECT_ID}/link?teamId=${TEAM_ID}`,
        'DELETE',
        'error',
      ],
    ]);
    expect(
      fetchImpl.mock.calls.every(([, init]) => init.headers.Authorization === `Bearer ${SECRET}`)
    ).toBe(true);
  });

  it.each(['network', 'http', 'body'])(
    'does not retry %s errors or expose provider diagnostics',
    async (failure) => {
      const fetchImpl = vi.fn(async () => {
        if (failure === 'network') throw new Error(SECRET);
        return {
          ok: failure !== 'http',
          json: async () => {
            throw new Error(SECRET);
          },
        };
      });
      const transport = createVercelTransport({ token: SECRET, fetchImpl });
      await expect(transport.readProject({ deadlineAt: Date.now() + 1_000 })).rejects.toThrow(
        /PROVIDER/
      );
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  );

  it('aborts a hanging request within its remaining deadline without retry', async () => {
    const fetchImpl = vi.fn(
      (_url, { signal }) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(new Error(SECRET)), { once: true })
        )
    );
    const transport = createVercelTransport({ token: SECRET, fetchImpl });
    await expect(transport.deleteLink({ deadlineAt: Date.now() + 15 })).rejects.toThrow(/PROVIDER/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('never retries a retryable DELETE response and refuses an expired budget before fetch', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500 }));
    const transport = createVercelTransport({ token: SECRET, fetchImpl, now: () => 1_000 });
    await expect(transport.deleteLink({ deadlineAt: 2_000 })).rejects.toThrow(
      'PROVIDER_REQUEST_FAILED'
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(transport.deleteLink({ deadlineAt: 1_000 })).rejects.toThrow(
      'ACTION_DEADLINE_EXHAUSTED'
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('keeps the response body within the same request deadline', async () => {
    const fetchImpl = vi.fn(async (_url, { signal }) => ({
      ok: true,
      json: () =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(new Error(SECRET)), { once: true })
        ),
    }));
    const transport = createVercelTransport({ token: SECRET, fetchImpl });
    await expect(transport.readProject({ deadlineAt: Date.now() + 15 })).rejects.toThrow(
      /PROVIDER/
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('creates durable exclusive phases and refuses duplicate runners and crash replay', async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'vercel-disconnect-test-'));
    directories.push(temporary);
    const directory = path.join(temporary, ACTION_ID);
    const ledger = createFileLedger(directory);
    const intent = { actionId: ACTION_ID, expectedSha: SHA };
    const results = await Promise.allSettled([ledger.acquire(intent), ledger.acquire(intent)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const session = results.find((result) => result.status === 'fulfilled').value;
    await session.attempted({ phase: 'DELETE_ATTEMPTED' });
    expect(
      JSON.parse(await readFile(path.join(directory, '001-delete-attempted.json'), 'utf8'))
    ).toMatchObject({ phase: 'DELETE_ATTEMPTED' });
    await expect(createFileLedger(directory).acquire(intent)).rejects.toThrow(
      /ACTION_ALREADY_RESERVED/
    );
    await expect(session.attempted({ phase: 'DELETE_ATTEMPTED' })).rejects.toThrow();
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
    for (const name of await readdir(directory))
      expect((await stat(path.join(directory, name))).mode & 0o777).toBe(0o600);
  });
});
