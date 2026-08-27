import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

const prePushScript = path.resolve('scripts/pre-push.mjs');
const gitEnvironmentKeys = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE'];
const tempRoots = [];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with status ${result.status}: ${result.stderr}`
    );
  }

  return result.stdout.trim();
}

function git(cwd, args) {
  return run('git', ['-C', cwd, ...args]);
}

async function write(root, relativePath, contents, options) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents, options);
}

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'updog-pre-push-env-'));
  tempRoots.push(root);

  const primary = path.join(root, 'primary');
  const linked = path.join(root, 'linked');
  const environmentLog = path.join(root, 'child-environments.jsonl');

  run('git', ['init', '--initial-branch=main', primary]);
  git(primary, ['config', 'user.email', 'pre-push-environment@example.test']);
  git(primary, ['config', 'user.name', 'Pre-push environment test']);
  git(primary, ['config', 'core.bare', 'false']);

  await write(
    primary,
    'package.json',
    JSON.stringify({
      private: true,
      scripts: {
        'baseline:check': 'node scripts/capture-child-environment.mjs baseline',
        build: 'node scripts/capture-child-environment.mjs build',
        test: 'node scripts/capture-child-environment.mjs full-test assert-clean',
      },
    })
  );
  await write(
    primary,
    'scripts/capture-child-environment.mjs',
    `import { appendFileSync } from 'node:fs';

const gitEnvironment = Object.fromEntries(
  ${JSON.stringify(gitEnvironmentKeys)}.map((key) => [key, process.env[key] ?? null])
);
appendFileSync(
  process.env.PRE_PUSH_ENVIRONMENT_LOG,
  JSON.stringify({ label: process.argv[2], gitEnvironment }) + '\\n'
);
if (process.argv[3] === 'assert-clean' && Object.values(gitEnvironment).some(Boolean)) {
  process.exitCode = 86;
}
`
  );
  await write(
    primary,
    'scripts/pre-push-classification.mjs',
    `import { appendFileSync } from 'node:fs';

const gitEnvironment = Object.fromEntries(
  ${JSON.stringify(gitEnvironmentKeys)}.map((key) => [key, process.env[key] ?? null])
);
appendFileSync(
  process.env.PRE_PUSH_ENVIRONMENT_LOG,
  JSON.stringify({ label: 'classification', gitEnvironment }) + '\\n'
);
process.stdout.write(process.env.PRE_PUSH_FIXTURE_CLASSIFICATION);

export function requiresVendoredSkillLockCheck() {
  return false;
}
`
  );
  await write(
    primary,
    'scripts/check-doc-freshness.mjs',
    "import './capture-child-environment.mjs';\n"
  );
  await write(
    primary,
    'scripts/check-orphan-tests.mjs',
    "import './capture-child-environment.mjs';\n"
  );
  await write(primary, 'server/changed.ts', 'export const changed = false;\n');
  await write(primary, '.agents/skills/neon/SKILL.md', '# Locked fixture\n');
  await write(
    primary,
    'skills-lock.json',
    `${JSON.stringify({ version: 1, hashContract: 'sha256-folder-framed-v2', skills: {} }, null, 2)}\n`
  );
  await write(
    primary,
    'node_modules/.bin/vitest',
    `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';

const gitEnvironment = Object.fromEntries(
  ${JSON.stringify(gitEnvironmentKeys)}.map((key) => [key, process.env[key] ?? null])
);
appendFileSync(
  process.env.PRE_PUSH_ENVIRONMENT_LOG,
  JSON.stringify({ label: 'targeted-test', gitEnvironment }) + '\\n'
);
if (Object.values(gitEnvironment).some(Boolean)) process.exitCode = 86;
`
  );
  await chmod(path.join(primary, 'node_modules/.bin/vitest'), 0o755);

  git(primary, ['add', '.']);
  git(primary, ['commit', '-m', 'fixture base']);
  git(primary, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  await write(primary, 'server/changed.ts', 'export const changed = true;\n');
  git(primary, ['add', 'server/changed.ts']);
  git(primary, ['commit', '-m', 'fixture change']);
  git(primary, ['worktree', 'add', '--detach', linked, 'HEAD']);

  return { environmentLog, linked, primary, root };
}

function hostileHookEnvironment(worktree, environmentLog, classification) {
  const gitDir = git(worktree, ['rev-parse', '--absolute-git-dir']);
  const indexPath = git(worktree, ['rev-parse', '--git-path', 'index']);

  return {
    ...process.env,
    CLAUDE_HOOKS_DISABLE: '1',
    GIT_DIR: gitDir,
    GIT_WORK_TREE: worktree,
    GIT_INDEX_FILE: path.resolve(worktree, indexPath),
    PRE_PUSH_ENVIRONMENT_LOG: environmentLog,
    PRE_PUSH_FIXTURE_CLASSIFICATION: classification,
  };
}

async function capturedEnvironments(environmentLog) {
  const contents = await readFile(environmentLog, 'utf8');
  return contents
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('pre-push hook child environment', () => {
  it('runs vendored skill lock check when a locked skill file is renamed out', async () => {
    const fixture = await createFixture();
    const primary = fixture.primary;
    await mkdir(path.join(primary, 'vendor/neon'), { recursive: true });
    git(primary, ['mv', '.agents/skills/neon/SKILL.md', 'vendor/neon/SKILL.md']);
    git(primary, ['add', '.']);
    git(primary, ['commit', '-m', 'rename locked skill out']);
    const result = spawnSync(process.execPath, [prePushScript], {
      cwd: primary,
      env: hostileHookEnvironment(primary, fixture.environmentLog, 'targeted'),
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toContain('skills:lock:check');
  });

  it('runs vendored skill lock check for a renamed skill path containing a newline', async () => {
    const fixture = await createFixture();
    const primary = fixture.primary;
    const hostileSource = '.agents/skills/neon/line\nbreak.md';
    const hostileTarget = 'vendor/neon/line\nbreak.md';
    await write(primary, hostileSource, 'hostile path\n');
    git(primary, ['add', '.']);
    git(primary, ['commit', '-m', 'add hostile skill path']);
    git(primary, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    await mkdir(path.join(primary, 'vendor/neon'), { recursive: true });
    git(primary, ['mv', hostileSource, hostileTarget]);
    git(primary, ['add', '.']);
    git(primary, ['commit', '-m', 'rename hostile skill path out']);

    const result = spawnSync(process.execPath, [prePushScript], {
      cwd: primary,
      env: hostileHookEnvironment(primary, fixture.environmentLog, 'targeted'),
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toContain('skills:lock:check');
  });

  it.each([
    ['primary worktree full-run', 'primary', 'full-run', 'full-test'],
    ['primary worktree targeted', 'primary', 'targeted', 'targeted-test'],
    ['linked worktree full-run', 'linked', 'full-run', 'full-test'],
    ['linked worktree targeted', 'linked', 'targeted', 'targeted-test'],
  ])(
    'removes hook-local Git variables for %s validation',
    async (_name, worktreeType, classification, targetLabel) => {
      const fixture = await createFixture();
      const worktree = fixture[worktreeType];
      const result = spawnSync(process.execPath, [prePushScript], {
        cwd: worktree,
        env: hostileHookEnvironment(worktree, fixture.environmentLog, classification),
        encoding: 'utf8',
      });

      expect(result.error).toBeUndefined();

      const childEnvironments = await capturedEnvironments(fixture.environmentLog);
      const target = childEnvironments.find((entry) => entry.label === targetLabel);
      expect(target).toMatchObject({
        gitEnvironment: {
          GIT_DIR: null,
          GIT_WORK_TREE: null,
          GIT_INDEX_FILE: null,
        },
      });
      expect(childEnvironments).not.toHaveLength(0);
      expect(
        childEnvironments.every((entry) =>
          Object.values(entry.gitEnvironment).every((value) => value === null)
        )
      ).toBe(true);
      expect(result.status).toBe(0);
      expect(git(fixture.primary, ['config', '--bool', 'core.bare'])).toBe('false');
    }
  );
});
