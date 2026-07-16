import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createAffectedTestPlan,
  executeSelectedPlan,
  validateAffectedTestPlan,
} from '../../../scripts/test-smart.mjs';

const tempRoots = [];

async function makeRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'updog-test-smart-'));
  tempRoots.push(root);
  return root;
}

async function write(root, relativePath, contents = '') {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents, 'utf8');
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('affected-test planning', () => {
  it('returns no_affected_tests for a documentation-only diff', async () => {
    const root = await makeRoot();
    await write(root, 'docs/readme.md', '# Docs');

    const plan = await createAffectedTestPlan({ root, changedFiles: ['docs/readme.md'] });

    expect(plan).toMatchObject({ version: 1, mode: 'no_affected_tests', tests: [] });
  });

  it('selects an existing unit test that directly imports a changed source file', async () => {
    const root = await makeRoot();
    await write(root, 'server/example.ts', 'export const value = 1;');
    await write(
      root,
      'tests/unit/example.test.ts',
      "import { value } from '../../server/example.js';\nvoid value;"
    );

    const plan = await createAffectedTestPlan({ root, changedFiles: ['server/example.ts'] });

    expect(plan.mode).toBe('selected');
    expect(plan.tests).toEqual(['tests/unit/example.test.ts']);
  });

  it('falls back when a selected test covers only part of the changed source set', async () => {
    const root = await makeRoot();
    await write(root, 'server/covered.ts', 'export const covered = 1;');
    await write(root, 'server/uncovered.ts', 'export const uncovered = 2;');
    await write(
      root,
      'tests/unit/covered.test.ts',
      "import { covered } from '../../server/covered.js';\nvoid covered;"
    );

    const plan = await createAffectedTestPlan({
      root,
      changedFiles: ['server/covered.ts', 'server/uncovered.ts'],
    });

    expect(plan).toMatchObject({ version: 1, mode: 'full_fallback', tests: [] });
    expect(plan.reason).toContain('server/uncovered.ts');
  });

  it.each([['shared/schema.ts'], ['package-lock.json'], ['.github/workflows/ci-unified.yml']])(
    'falls back to the full unit suite for broad-impact change %s',
    async (changedFile) => {
      const root = await makeRoot();
      await write(root, changedFile, 'changed');

      const plan = await createAffectedTestPlan({ root, changedFiles: [changedFile] });

      expect(plan).toMatchObject({ version: 1, mode: 'full_fallback', tests: [] });
    }
  );
});

describe('affected-test execution', () => {
  it.each([
    { version: 2, mode: 'selected', tests: ['tests/unit/a.test.ts'], reason: 'bad version' },
    { version: 1, mode: 'selected', tests: ['../a.test.ts'], reason: 'traversal' },
    { version: 1, mode: 'selected', tests: ['tests/unit/a.ts'], reason: 'not a test' },
    { version: 1, mode: 'selected', tests: [], reason: 'empty selected plan' },
  ])('rejects an invalid or tampered plan: $reason', async (plan) => {
    const root = await makeRoot();

    await expect(validateAffectedTestPlan(plan, { root })).rejects.toThrow();
  });

  it('rejects a selected test deleted after planning', async () => {
    const root = await makeRoot();
    const plan = {
      version: 1,
      mode: 'selected',
      tests: ['tests/unit/missing.test.ts'],
      reason: 'direct import',
    };

    await expect(validateAffectedTestPlan(plan, { root })).rejects.toThrow(/does not exist/);
  });

  it('propagates a selected-suite failure without invoking a fallback', async () => {
    const root = await makeRoot();
    await write(root, 'tests/unit/failing.test.ts', 'throw new Error("fail");');
    const plan = {
      version: 1,
      mode: 'selected',
      tests: ['tests/unit/failing.test.ts'],
      reason: 'changed test',
    };
    const spawn = vi.fn(() => ({ status: 7 }));

    const status = await executeSelectedPlan(plan, { root, spawn });

    expect(status).toBe(7);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn.mock.calls[0][1]).toContain('tests/unit/failing.test.ts');
  });

  it('runs a selected integration test with the integration configuration', async () => {
    const root = await makeRoot();
    await write(root, 'tests/integration/selected.test.ts');
    const plan = {
      version: 1,
      mode: 'selected',
      tests: ['tests/integration/selected.test.ts'],
      reason: 'changed integration test',
    };
    const spawn = vi.fn(() => ({ status: 0 }));

    const status = await executeSelectedPlan(plan, { root, spawn });

    expect(status).toBe(0);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn.mock.calls[0][1]).toEqual([
      'run',
      'test:integration',
      '--',
      'tests/integration/selected.test.ts',
    ]);
  });

  it('runs a Testcontainers-only selection with its owning configuration', async () => {
    const root = await makeRoot();
    await write(root, 'tests/integration/fund-lifecycle-db.test.ts');
    const plan = {
      version: 1,
      mode: 'selected',
      tests: ['tests/integration/fund-lifecycle-db.test.ts'],
      reason: 'changed Testcontainers-only test',
    };
    const spawn = vi.fn(() => ({ status: 0 }));

    const status = await executeSelectedPlan(plan, { root, spawn });

    expect(status).toBe(0);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn.mock.calls[0][1]).toEqual([
      'run',
      'test:testcontainers',
      '--',
      'tests/integration/fund-lifecycle-db.test.ts',
    ]);
  });

  it('runs mixed unit and API selections with their owning configurations', async () => {
    const root = await makeRoot();
    await write(root, 'tests/unit/selected.test.ts');
    await write(root, 'tests/api/selected.test.ts');
    const plan = {
      version: 1,
      mode: 'selected',
      tests: ['tests/api/selected.test.ts', 'tests/unit/selected.test.ts'],
      reason: 'changed tests',
    };
    const spawn = vi.fn(() => ({ status: 0 }));

    const status = await executeSelectedPlan(plan, { root, spawn });

    expect(status).toBe(0);
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn.mock.calls.map((call) => call[1])).toEqual([
      ['run', 'test:unit', '--', 'tests/unit/selected.test.ts'],
      ['run', 'test:integration', '--', 'tests/api/selected.test.ts'],
    ]);
  });

  it('rejects selected tests that have no configured affected-test runner', async () => {
    const root = await makeRoot();
    await write(root, 'tests/e2e/selected.spec.ts');
    const plan = {
      version: 1,
      mode: 'selected',
      tests: ['tests/e2e/selected.spec.ts'],
      reason: 'changed test',
    };
    const spawn = vi.fn(() => ({ status: 0 }));

    await expect(executeSelectedPlan(plan, { root, spawn })).rejects.toThrow(
      'No affected-test runner is configured for tests/e2e/selected.spec.ts.'
    );
    expect(spawn).not.toHaveBeenCalled();
  });
});
