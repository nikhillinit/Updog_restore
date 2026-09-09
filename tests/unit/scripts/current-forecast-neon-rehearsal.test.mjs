import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import {
  directHostFingerprint,
  rehearseCurrentForecastNeon,
  validateRehearsalInput,
} from '../../../scripts/release/rehearse-current-forecast-neon.mjs';

const input = {
  expectedSha: 'a'.repeat(40),
  projectId: 'project-1',
  parentBranchId: 'branch-1',
  databaseName: 'updog',
  expectedParentMigrationTail: '0049_kpi_observations',
};
const operationId = 'a07f8772-1877-4da9-a939-3a3ae62d1d8d';

describe('0056 rehearsal source admission', () => {
  const draftInput = {
    ...input,
    mode: 'actuals-draft-0056',
    expectedParentMigrationTail: '0055_current_forecast_recompute_commands',
  };
  it('requires the exact0055 parent only in the new mode', () => {
    expect(validateRehearsalInput(draftInput)).toEqual(draftInput);
    expect(() =>
      validateRehearsalInput({
        ...draftInput,
        expectedParentMigrationTail: input.expectedParentMigrationTail,
      })
    ).toThrow();
    expect(() =>
      validateRehearsalInput({
        ...input,
        expectedParentMigrationTail: draftInput.expectedParentMigrationTail,
      })
    ).toThrow();
  });
  it('makes zero provider, database, or command calls while authoritative prerequisites are unavailable', async () => {
    const fetchImpl = vi.fn();
    const tailReader = vi.fn();
    const commandRunner = vi.fn();
    await expect(
      rehearseCurrentForecastNeon({
        input: draftInput,
        apiKey: 'synthetic-test-value',
        githubRunId: '12',
        githubRunAttempt: 1,
        fetchImpl,
        tailReader,
        commandRunner,
      })
    ).rejects.toMatchObject({ code: 'PRODUCTION_PREREQUISITES_UNAVAILABLE' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(tailReader).not.toHaveBeenCalled();
    expect(commandRunner).not.toHaveBeenCalled();
  });
});
describe('0057 rehearsal source admission', () => {
  const restatementInput = {
    ...input,
    mode: 'actuals-restatement-0057',
    expectedParentMigrationTail: '0056_actuals_draft_revisions',
  };
  it('requires the exact0056 parent only in the new mode', () => {
    expect(validateRehearsalInput(restatementInput)).toEqual(restatementInput);
    expect(() =>
      validateRehearsalInput({
        ...restatementInput,
        expectedParentMigrationTail: input.expectedParentMigrationTail,
      })
    ).toThrow();
    expect(() =>
      validateRehearsalInput({
        ...input,
        expectedParentMigrationTail: restatementInput.expectedParentMigrationTail,
      })
    ).toThrow();
  });
  it('makes zero provider, database, or command calls while authoritative prerequisites are unavailable', async () => {
    const fetchImpl = vi.fn();
    const tailReader = vi.fn();
    const commandRunner = vi.fn();
    await expect(
      rehearseCurrentForecastNeon({
        input: restatementInput,
        apiKey: 'synthetic-test-value',
        githubRunId: '12',
        githubRunAttempt: 1,
        fetchImpl,
        tailReader,
        commandRunner,
      })
    ).rejects.toMatchObject({ code: 'PRODUCTION_PREREQUISITES_UNAVAILABLE' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(tailReader).not.toHaveBeenCalled();
    expect(commandRunner).not.toHaveBeenCalled();
  });
});
/** @typedef {Record<string, any>} NeonResponse */
const parentEndpoint = {
  id: 'ep-parent',
  project_id: 'project-1',
  branch_id: 'branch-1',
  type: 'read_write',
  host: 'ep-parent.us.neon.tech',
  current_state: 'active',
  disabled: false,
};
const childEndpoint = {
  id: 'ep-child',
  project_id: 'project-1',
  branch_id: 'branch-2',
  type: 'read_write',
  host: 'ep-child.us.neon.tech',
  current_state: 'active',
  disabled: false,
};

/** @returns {NeonResponse[]} */
function happyResponses() {
  return [
    { project: { id: 'project-1' } },
    { branch: { id: 'branch-1', project_id: 'project-1' } },
    { database: { branch_id: 'branch-1', name: 'updog', owner_name: 'app_owner' } },
    { endpoints: [parentEndpoint] },
    { uri: 'postgres://app_owner:parent-secret@ep-parent.us.neon.tech/updog' },
    {
      branch: {
        id: 'branch-2',
        project_id: 'project-1',
        parent_id: 'branch-1',
        current_state: 'ready',
      },
      endpoints: [childEndpoint],
      operations: [
        {
          id: operationId,
          project_id: 'project-1',
          branch_id: 'branch-2',
          endpoint_id: 'ep-child',
          status: 'finished',
          failures_count: 0,
        },
      ],
    },
    {
      branch: {
        id: 'branch-2',
        project_id: 'project-1',
        parent_id: 'branch-1',
        current_state: 'ready',
      },
    },
    { database: { branch_id: 'branch-2', name: 'updog', owner_name: 'app_owner' } },
    { endpoints: [childEndpoint] },
    { uri: 'postgres://app_owner:child-secret@ep-child.us.neon.tech/updog' },
  ];
}

/** @param {NeonResponse[]} responses */
function mockFetch(responses = happyResponses()) {
  return vi.fn(async (_url, _init) => {
    void _url;
    void _init;
    const response = responses.shift();
    if (!response) throw new Error('Mock Neon response queue exhausted');
    return response?.apiFailure
      ? { ok: false, json: async () => response }
      : { ok: true, json: async () => response };
  });
}

function run(overrides = {}) {
  return rehearseCurrentForecastNeon({
    input,
    apiKey: 'api-secret',
    githubRunId: '12',
    githubRunAttempt: 1,
    fetchImpl: mockFetch(),
    commandRunner: vi.fn(async () => undefined),
    tailReader: vi
      .fn()
      .mockResolvedValueOnce('0049_kpi_observations')
      .mockResolvedValueOnce('0055_current_forecast_recompute_commands'),
    sleepImpl: vi.fn(async () => undefined),
    ...overrides,
  });
}

describe('Current Forecast Neon rehearsal', { retry: 0 }, () => {
  it('keeps the workflow manual, protected, first-attempt-only, and artifact-free', async () => {
    const workflow = await readFile(
      '.github/workflows/current-forecast-neon-rehearsal.yml',
      'utf8'
    );
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('github.run_attempt == 1');
    expect(workflow).toContain('environment: production-schema');
    expect(workflow).toContain('git fetch origin refs/heads/main');
    expect(workflow).not.toContain('pull_request:');
    expect(workflow).not.toContain('upload-artifact');
  });

  it.each([
    ['expectedSha', 'bad'],
    ['projectId', '../bad'],
    ['parentBranchId', 'bad/id'],
    ['databaseName', 'bad name'],
    ['expectedParentMigrationTail', '0055_current_forecast_recompute_commands'],
  ])('rejects invalid %s before dependent calls', async (field, value) => {
    const fetchImpl = vi.fn();
    const commandRunner = vi.fn();
    const tailReader = vi.fn();
    await expect(
      run({ input: { ...input, [field]: value }, fetchImpl, commandRunner, tailReader })
    ).rejects.toThrow(/invalid/);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(commandRunner).not.toHaveBeenCalled();
    expect(tailReader).not.toHaveBeenCalled();
  });

  it('accepts 60-character Neon resource IDs and refuses 61 characters', () => {
    expect(
      validateRehearsalInput({
        ...input,
        projectId: 'a'.repeat(60),
        parentBranchId: '-'.repeat(60),
      })
    ).toMatchObject({ projectId: 'a'.repeat(60), parentBranchId: '-'.repeat(60) });
    expect(() => validateRehearsalInput({ ...input, projectId: 'a'.repeat(61) })).toThrow(
      /projectId is invalid/
    );
  });

  it.each([
    ['missing key', { apiKey: '' }],
    ['rerun', { githubRunAttempt: 2 }],
  ])('rejects %s before provider or database calls', async (_label, override) => {
    const fetchImpl = vi.fn();
    const commandRunner = vi.fn();
    const tailReader = vi.fn();
    await expect(run({ ...override, fetchImpl, commandRunner, tailReader })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(commandRunner).not.toHaveBeenCalled();
    expect(tailReader).not.toHaveBeenCalled();
  });

  it('rejects pooled hosts', () => {
    expect(() => directHostFingerprint('postgres://u:p@ep-x-pooler.us.neon.tech/db')).toThrow(
      /pooled/i
    );
    expect(() => directHostFingerprint('not-a-uri-with-secret')).toThrow(
      'Neon connection URI is invalid'
    );
  });

  it('binds role, endpoint, database, branch, operations, and command order', async () => {
    const fetchImpl = mockFetch();
    const commandRunner = vi.fn(async (_command, _args, _env) => {
      void _command;
      void _args;
      void _env;
    });
    const tailReader = vi
      .fn()
      .mockResolvedValueOnce('0049_kpi_observations')
      .mockResolvedValueOnce('0055_current_forecast_recompute_commands');
    const result = await run({ fetchImpl, commandRunner, tailReader });

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      'https://console.neon.tech/api/v2/projects/project-1',
      'https://console.neon.tech/api/v2/projects/project-1/branches/branch-1',
      'https://console.neon.tech/api/v2/projects/project-1/branches/branch-1/databases/updog',
      'https://console.neon.tech/api/v2/projects/project-1/branches/branch-1/endpoints',
      'https://console.neon.tech/api/v2/projects/project-1/connection_uri?branch_id=branch-1&endpoint_id=ep-parent&database_name=updog&role_name=app_owner&pooled=false',
      'https://console.neon.tech/api/v2/projects/project-1/branches',
      'https://console.neon.tech/api/v2/projects/project-1/branches/branch-2',
      'https://console.neon.tech/api/v2/projects/project-1/branches/branch-2/databases/updog',
      'https://console.neon.tech/api/v2/projects/project-1/branches/branch-2/endpoints',
      'https://console.neon.tech/api/v2/projects/project-1/connection_uri?branch_id=branch-2&endpoint_id=ep-child&database_name=updog&role_name=app_owner&pooled=false',
    ]);
    expect(JSON.parse(fetchImpl.mock.calls[5][1].body)).toEqual({
      endpoints: [{ type: 'read_write' }],
      branch: { parent_id: 'branch-1', name: 'current-forecast-12-1' },
    });
    expect(commandRunner.mock.calls.map(([command, args]) => [command, args])).toEqual([
      ['node', ['scripts/run-current-forecast-journaled-migrations.mjs', '--apply', '--yes']],
      ['node', ['scripts/run-current-forecast-journaled-migrations.mjs']],
      [
        'npx',
        [
          'vitest',
          'run',
          'tests/integration/current-forecast-journaled-migration-recovery.test.ts',
          'tests/integration/current-forecast-manual-recompute.pg.test.ts',
          'tests/integration/current-forecast-reference.pg.test.ts',
          '--config',
          'vitest.config.testcontainers.ts',
          '--configLoader',
          'native',
          '--retry=0',
        ],
      ],
    ]);
    expect(result).toMatchObject({
      rehearsalBranchId: 'branch-2',
      databaseName: 'updog',
      beforeMigrationTail: '0049_kpi_observations',
      afterMigrationTail: '0055_current_forecast_recompute_commands',
    });
    expect(JSON.stringify(result)).not.toMatch(
      /postgres:|secret|app_owner|ep-child\.us\.neon\.tech/
    );
  });

  it.each([
    ['project mismatch', 0, { project: { id: 'wrong' } }, /project identity mismatch/],
    [
      'parent branch mismatch',
      1,
      { branch: { id: 'branch-1', project_id: 'wrong' } },
      /parent branch identity mismatch/,
    ],
    [
      'parent database mismatch',
      2,
      { database: { branch_id: 'branch-1', name: 'wrong', owner_name: 'app_owner' } },
      /database identity mismatch/,
    ],
    [
      'parent endpoint mismatch',
      3,
      { endpoints: [{ ...parentEndpoint, project_id: 'wrong' }] },
      /endpoint identity mismatch/,
    ],
  ])('stops before database mutation on %s', async (_label, index, replacement, message) => {
    const responses = happyResponses();
    responses[index] = replacement;
    const commandRunner = vi.fn();
    const tailReader = vi.fn();
    await expect(
      run({ fetchImpl: mockFetch(responses), commandRunner, tailReader })
    ).rejects.toThrow(message);
    expect(commandRunner).not.toHaveBeenCalled();
    expect(tailReader).not.toHaveBeenCalled();
  });

  it('accepts provider UUID operation IDs outside version 1-5', async () => {
    const responses = happyResponses();
    responses[5].operations[0].id = 'a07f8772-1877-6da9-a939-3a3ae62d1d8d';
    await expect(run({ fetchImpl: mockFetch(responses) })).resolves.toBeDefined();
  });

  it('stops before create when the parent migration tail mismatches', async () => {
    const fetchImpl = mockFetch();
    const commandRunner = vi.fn();
    await expect(
      run({ fetchImpl, commandRunner, tailReader: vi.fn(async () => 'wrong') })
    ).rejects.toThrow(/Parent migration tail mismatch/);
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(commandRunner).not.toHaveBeenCalled();
  });

  it.each([
    ['create failure', { apiFailure: true }, /API request failed/],
    [
      'returned branch mismatch',
      {
        branch: { id: 'branch-2', project_id: 'wrong', parent_id: 'branch-1' },
        endpoints: [childEndpoint],
        operations: [],
      },
      /branch identity mismatch/,
    ],
    [
      'missing endpoint',
      {
        branch: { id: 'branch-2', project_id: 'project-1', parent_id: 'branch-1' },
        endpoints: [],
        operations: [],
      },
      /endpoint identity is ambiguous/,
    ],
    [
      'ambiguous endpoint',
      {
        branch: { id: 'branch-2', project_id: 'project-1', parent_id: 'branch-1' },
        endpoints: [childEndpoint, { ...childEndpoint, id: 'ep-other' }],
        operations: [],
      },
      /endpoint identity is ambiguous/,
    ],
    [
      'missing operation',
      {
        branch: { id: 'branch-2', project_id: 'project-1', parent_id: 'branch-1' },
        endpoints: [childEndpoint],
        operations: [],
      },
      /operation identity is ambiguous/,
    ],
  ])('stops after %s without running commands', async (_label, createResponse, message) => {
    const responses = happyResponses();
    responses[5] = createResponse;
    const commandRunner = vi.fn();
    await expect(run({ fetchImpl: mockFetch(responses), commandRunner })).rejects.toThrow(message);
    expect(commandRunner).not.toHaveBeenCalled();
  });

  it.each([
    [
      'failed operation',
      {
        id: operationId,
        project_id: 'project-1',
        branch_id: 'branch-2',
        endpoint_id: 'ep-child',
        status: 'failed',
        failures_count: 1,
      },
      /operation failed/,
    ],
    [
      'wrong operation branch',
      {
        id: operationId,
        project_id: 'project-1',
        branch_id: 'wrong',
        endpoint_id: 'ep-child',
        status: 'finished',
        failures_count: 0,
      },
      /operation identity mismatch/,
    ],
  ])('rejects %s before child database access', async (_label, operation, message) => {
    const responses = happyResponses();
    responses[5].operations = [operation];
    const commandRunner = vi.fn();
    await expect(run({ fetchImpl: mockFetch(responses), commandRunner })).rejects.toThrow(message);
    expect(commandRunner).not.toHaveBeenCalled();
  });

  it('polls an unfinished operation and requires successful readiness', async () => {
    const responses = happyResponses();
    responses[5].operations[0].status = 'running';
    responses.splice(6, 0, {
      operation: {
        id: operationId,
        project_id: 'project-1',
        branch_id: 'branch-2',
        endpoint_id: 'ep-child',
        status: 'finished',
        failures_count: 0,
      },
    });
    const sleepImpl = vi.fn(async () => undefined);
    await run({ fetchImpl: mockFetch(responses), sleepImpl });
    expect(sleepImpl).toHaveBeenCalledWith(1_000);
  });

  it('bounds operation readiness polling', async () => {
    const responses = happyResponses();
    responses[5].operations[0].status = 'running';
    responses.splice(
      6,
      0,
      ...Array.from({ length: 20 }, () => ({
        operation: {
          id: operationId,
          project_id: 'project-1',
          branch_id: 'branch-2',
          endpoint_id: 'ep-child',
          status: 'running',
          failures_count: 0,
        },
      }))
    );
    const sleepImpl = vi.fn(async () => undefined);
    const commandRunner = vi.fn();
    await expect(
      run({ fetchImpl: mockFetch(responses), sleepImpl, commandRunner })
    ).rejects.toThrow('Created Neon operation did not finish successfully');
    expect(sleepImpl).toHaveBeenCalledTimes(20);
    expect(commandRunner).not.toHaveBeenCalled();
  });

  it.each([
    [
      'branch not ready',
      6,
      {
        branch: {
          id: 'branch-2',
          project_id: 'project-1',
          parent_id: 'branch-1',
          current_state: 'init',
        },
      },
      /branch readiness mismatch/,
    ],
    [
      'child database branch mismatch',
      7,
      {
        database: { branch_id: 'branch-1', name: 'updog', owner_name: 'app_owner' },
      },
      /database identity mismatch/,
    ],
    [
      'child owner mismatch',
      7,
      {
        database: { branch_id: 'branch-2', name: 'updog', owner_name: 'other_owner' },
      },
      /database owner mismatch/,
    ],
    [
      'child endpoint not ready',
      8,
      {
        endpoints: [{ ...childEndpoint, current_state: 'init' }],
      },
      /endpoint is not ready/,
    ],
  ])('rejects %s before commands', async (_label, index, replacement, message) => {
    const responses = happyResponses();
    responses[index] = replacement;
    const commandRunner = vi.fn();
    await expect(run({ fetchImpl: mockFetch(responses), commandRunner })).rejects.toThrow(message);
    expect(commandRunner).not.toHaveBeenCalled();
  });

  it.each([
    ['parent host alias', 'postgres://app_owner:x@ep-parent.us.neon.tech/updog'],
    ['endpoint host mismatch', 'postgres://app_owner:x@wrong.us.neon.tech/updog'],
    ['database mismatch', 'postgres://app_owner:x@ep-child.us.neon.tech/wrong'],
    ['role mismatch', 'postgres://wrong:x@ep-child.us.neon.tech/updog'],
    ['pooled child', 'postgres://app_owner:x@ep-child-pooler.us.neon.tech/updog'],
  ])('rejects child URI %s before commands', async (_label, uri) => {
    const responses = happyResponses();
    responses[9] = { uri };
    const commandRunner = vi.fn();
    await expect(run({ fetchImpl: mockFetch(responses), commandRunner })).rejects.toThrow();
    expect(commandRunner).not.toHaveBeenCalled();
  });

  it('sanitizes command and after-tail failures', async () => {
    const childUri = 'postgres://app_owner:child-secret@ep-child.us.neon.tech/updog';
    await expect(
      run({
        commandRunner: vi.fn(async () => {
          throw new Error(childUri);
        }),
      })
    ).rejects.toThrow('Rehearsal command failed');
    await expect(
      run({
        tailReader: vi
          .fn()
          .mockResolvedValueOnce('0049_kpi_observations')
          .mockRejectedValueOnce(new Error(childUri)),
      })
    ).rejects.toThrow('Rehearsal migration tail read failed');
    await expect(
      run({
        tailReader: vi
          .fn()
          .mockResolvedValueOnce('0049_kpi_observations')
          .mockResolvedValueOnce('0054_current_forecast_snapshots'),
      })
    ).rejects.toThrow('Rehearsal migration tail mismatch');
  });
});
