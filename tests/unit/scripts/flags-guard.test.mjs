import { execFileSync, spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterEach, describe, expect, it } from 'vitest';

const guardScript = path.join(process.cwd(), 'scripts', 'flags-guard.mjs');
const temporaryDirectories = [];

async function makeTemporaryDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'flags-guard-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function makeRepository(baseContents, headContents, relativePath = 'flags/test.yaml') {
  const directory = await makeTemporaryDirectory();
  execFileSync('git', ['init', '--quiet'], { cwd: directory });
  execFileSync('git', ['config', 'user.email', 'flags-guard-test@example.invalid'], {
    cwd: directory,
  });
  execFileSync('git', ['config', 'user.name', 'Flags Guard Test'], { cwd: directory });

  const flagPath = path.join(directory, relativePath);
  await mkdir(path.dirname(flagPath), { recursive: true });
  await writeFile(flagPath, baseContents, 'utf8');
  execFileSync('git', ['add', '.'], { cwd: directory });
  execFileSync('git', ['commit', '--quiet', '-m', 'base'], { cwd: directory });
  const baseSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: directory,
    encoding: 'utf8',
  }).trim();

  await writeFile(flagPath, headContents, 'utf8');
  execFileSync('git', ['add', '.'], { cwd: directory });
  execFileSync('git', ['commit', '--quiet', '--allow-empty', '-m', 'head'], { cwd: directory });
  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: directory,
    encoding: 'utf8',
  }).trim();

  return { baseSha, directory, headSha };
}

function findGitExecutable() {
  const pathDirectories = (process.env.PATH ?? '').split(path.delimiter);
  for (const directory of pathDirectories) {
    const candidate = path.join(directory, 'git');
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      // Keep searching the inherited PATH.
    }
  }
  throw new Error('git executable not found in PATH');
}

async function makeFailingGitPath() {
  const directory = await makeTemporaryDirectory();
  const wrapper = path.join(directory, 'git');
  await writeFile(
    wrapper,
    [
      '#!/usr/bin/env node',
      "import { spawnSync } from 'node:child_process';",
      'const args = process.argv.slice(2);',
      "const isDiff = args[0] === 'diff';",
      'const failMode = process.env.FAIL_GIT_DIFF_MODE;',
      "if (process.env.FAIL_GIT_REF_MODE === 'all' && (args[0] === 'check-ref-format' || args[0] === 'rev-parse')) {",
      "  process.stderr.write('simulated git ref failure\\n');",
      '  process.exit(2);',
      '}',
      "if (isDiff && (failMode === 'all' || (failMode === 'file' && !args.includes('--name-only')))) {",
      "  process.stderr.write('simulated git diff failure\\n');",
      '  process.exit(2);',
      '}',
      "const result = spawnSync(process.env.REAL_GIT, args, { stdio: 'inherit' });",
      'if (result.error) throw result.error;',
      'process.exit(result.status ?? 1);',
      '',
    ].join('\n'),
    'utf8'
  );
  await chmod(wrapper, 0o755);
  return directory;
}

function runGuard(cwd, args = [], env = {}) {
  return spawnSync(process.execPath, [guardScript, ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      CI: '',
      GITHUB_ACTIONS: '',
      GITHUB_EVENT_NAME: '',
      PR_BASE_SHA: '',
      PR_HEAD_REPOSITORY: '',
      PR_HEAD_SHA: '',
      PR_NUMBER: '',
      ...env,
    },
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe('feature flags approval guard', () => {
  it('fails closed instead of reporting no changes when changed-file diff retrieval fails', async () => {
    const repository = await makeRepository('key: test.flag\n', 'key: test.flag\n');
    const failingGitPath = await makeFailingGitPath();
    const realGit = findGitExecutable();

    const result = runGuard(
      repository.directory,
      ['--base', repository.baseSha, '--head', repository.headSha],
      {
        FAIL_GIT_DIFF_MODE: 'all',
        PATH: `${failingGitPath}${path.delimiter}${process.env.PATH}`,
        REAL_GIT: realGit,
      }
    );
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).not.toContain('No flag files changed');
    expect(output).toMatch(/Git diff|simulated git diff failure/i);
  });

  it('fails closed when a changed flag file diff cannot be retrieved', async () => {
    const repository = await makeRepository(
      'key: test.flag\ntargeting:\n  enabled: false\n',
      'key: test.flag\ntargeting:\n  enabled: true\n'
    );
    const failingGitPath = await makeFailingGitPath();
    const realGit = findGitExecutable();

    const result = runGuard(
      repository.directory,
      ['--base', repository.baseSha, '--head', repository.headSha],
      {
        FAIL_GIT_DIFF_MODE: 'file',
        PATH: `${failingGitPath}${path.delimiter}${process.env.PATH}`,
        REAL_GIT: realGit,
      }
    );

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/Git diff failed for flags\/test.yaml/i);
  });

  it('requires both approvals for a new active sensitive flat YAML flag', async () => {
    const repository = await makeRepository(
      '# flags\n',
      ['key: auth.new', 'targeting:', '  enabled: true', ''].join('\n')
    );
    const args = ['--base', repository.baseSha, '--head', repository.headSha];

    const noLabels = runGuard(repository.directory, args);
    const productOnly = runGuard(repository.directory, args, {
      PR_LABELS: JSON.stringify(['product-signoff']),
    });
    const allRequiredApprovals = runGuard(repository.directory, args, {
      PR_LABELS: JSON.stringify(['product-signoff', 'approved:flags-change']),
    });

    expect(noLabels.status).toBe(1);
    expect(`${noLabels.stdout}\n${noLabels.stderr}`).toContain("Flag 'auth.new'");
    expect(productOnly.status).toBe(1);
    expect(`${productOnly.stdout}\n${productOnly.stderr}`).toContain('approved:flags-change');
    expect(allRequiredApprovals.status).toBe(0);
    expect(allRequiredApprovals.stdout).toContain('FLAG CHANGES APPROVED');
  });

  it('requires product signoff for an existing flat YAML enabled false-to-true change', async () => {
    const repository = await makeRepository(
      [
        'key: test.flag',
        'default: false',
        'description: Test flag',
        'owner: test@example.invalid',
        'risk: medium',
        'expiresAt: 2026-12-31',
        'exposeToClient: false',
        'targeting:',
        '  enabled: false',
        '  rules: []',
        '',
      ].join('\n'),
      [
        'key: test.flag',
        'default: false',
        'description: Test flag',
        'owner: test@example.invalid',
        'risk: medium',
        'expiresAt: 2026-12-31',
        'exposeToClient: false',
        'targeting:',
        '  enabled: true',
        '  rules: []',
        '',
      ].join('\n')
    );
    const args = ['--base', repository.baseSha, '--head', repository.headSha];

    const result = runGuard(repository.directory, args);
    const approved = runGuard(repository.directory, args, {
      PR_LABELS: JSON.stringify(['product-signoff']),
    });
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(1);
    expect(output).toContain("Flag 'test.flag' is being enabled/exposed");
    expect(output).toContain('product-signoff');
    expect(approved.status).toBe(0);
  });

  it('requires product signoff for a same-line JavaScript false-to-true change', async () => {
    const repository = await makeRepository(
      ['export const flags = {', "  'wizard.v1': { enabled: false },", '};', ''].join('\n'),
      ['export const flags = {', "  'wizard.v1': { enabled: true },", '};', ''].join('\n'),
      'src/feature-flags.js'
    );
    const args = ['--base', repository.baseSha, '--head', repository.headSha];

    const result = runGuard(repository.directory, args);
    const approved = runGuard(repository.directory, args, {
      PR_LABELS: JSON.stringify(['product-signoff']),
    });

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      "Flag 'wizard.v1' is being enabled/exposed"
    );
    expect(approved.status).toBe(0);
  });

  it('does not pair a removed false from one compact flag with true from another', async () => {
    const repository = await makeRepository(
      [
        'export const flags = {',
        "  'flag.one': { enabled: false },",
        "  'flag.two': { enabled: true },",
        '};',
        '',
      ].join('\n'),
      [
        'export const flags = {',
        "  'flag.one': {},",
        "  'flag.two': { enabled: true, description: 'metadata only' },",
        '};',
        '',
      ].join('\n'),
      'src/feature-flags.js'
    );

    const result = runGuard(repository.directory, [
      '--base',
      repository.baseSha,
      '--head',
      repository.headSha,
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('FLAG CHANGES APPROVED');
    expect(result.stdout).not.toContain('is being enabled/exposed');
  });

  it('requires product signoff for canonical registry default activation', async () => {
    const repository = await makeRepository(
      [
        "schema_version: '1.0'",
        'flags:',
        '  test_flag:',
        '    default: false',
        '    environments:',
        '      development: false',
        '      staging: false',
        '      production: false',
        '',
      ].join('\n'),
      [
        "schema_version: '1.0'",
        'flags:',
        '  test_flag:',
        '    default: true',
        '    environments:',
        '      development: false',
        '      staging: false',
        '      production: false',
        '',
      ].join('\n'),
      'flags/registry.yaml'
    );
    const args = ['--base', repository.baseSha, '--head', repository.headSha];

    const result = runGuard(repository.directory, args);
    const approved = runGuard(repository.directory, args, {
      PR_LABELS: JSON.stringify(['product-signoff']),
    });

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      "Flag 'test_flag' is being enabled/exposed"
    );
    expect(approved.status).toBe(0);
  });

  it('requires product signoff for canonical registry environment activation', async () => {
    const repository = await makeRepository(
      [
        "schema_version: '1.0'",
        'flags:',
        '  test_flag:',
        '    default: false',
        '    environments:',
        '      development: false',
        '      staging: false',
        '      production: false',
        '',
      ].join('\n'),
      [
        "schema_version: '1.0'",
        'flags:',
        '  test_flag:',
        '    default: false',
        '    environments:',
        '      development: false',
        '      staging: false',
        '      production: true',
        '',
      ].join('\n'),
      'flags/registry.yaml'
    );
    const args = ['--base', repository.baseSha, '--head', repository.headSha];

    const result = runGuard(repository.directory, args);
    const approved = runGuard(repository.directory, args, {
      PR_LABELS: JSON.stringify(['product-signoff']),
    });

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      "Flag 'test_flag' is being enabled/exposed"
    );
    expect(approved.status).toBe(0);
  });

  it('fails closed on a malformed activation value in a supported YAML flag', async () => {
    const repository = await makeRepository(
      ['key: test.flag', 'targeting:', '  enabled: false', ''].join('\n'),
      ['key: test.flag', 'targeting:', '  enabled: definitely', ''].join('\n')
    );

    const result = runGuard(repository.directory, [
      '--base',
      repository.baseSha,
      '--head',
      repository.headSha,
    ]);

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/malformed|boolean|failed closed/i);
  });

  it('ignores feature-like text in YAML comments', async () => {
    const repository = await makeRepository(
      ['key: test.flag', 'targeting:', '  enabled: false', ''].join('\n'),
      [
        'key: test.flag',
        'targeting:',
        '  enabled: false',
        '# key: auth.comment',
        '# targeting:',
        '#   enabled: true',
        '',
      ].join('\n')
    );

    const result = runGuard(repository.directory, [
      '--base',
      repository.baseSha,
      '--head',
      repository.headSha,
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('FLAG CHANGES APPROVED');
    expect(result.stdout).not.toContain('auth.comment');
  });

  it('does not let high-severity approval override missing critical approval', async () => {
    const repository = await makeRepository(
      [
        'export const flags = {',
        "  'admin.killSwitch': {",
        '    enabled: true,',
        '    killSwitch: true,',
        '  },',
        '};',
        '',
      ].join('\n'),
      [
        'export const flags = {',
        "  'admin.killSwitch': {",
        '    enabled: true,',
        '    killSwitch: false,',
        '  },',
        '};',
        '',
      ].join('\n'),
      'src/feature-flags.js'
    );

    const result = runGuard(
      repository.directory,
      ['--base', repository.baseSha, '--head', repository.headSha],
      { PR_LABELS: JSON.stringify(['approved:flags-change']) }
    );

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain('emergency-override');
  });

  it('allows a successfully computed diff with no flag files', async () => {
    const repository = await makeRepository(
      'export const value = false;\n',
      'export const value = true;\n',
      'src/feature-calculator.ts'
    );

    const result = runGuard(repository.directory, [
      '--base',
      repository.baseSha,
      '--head',
      repository.headSha,
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('No flag files changed');
  });

  it('fails closed on an unresolved exact ref', async () => {
    const repository = await makeRepository('key: test.flag\n', 'key: test.flag\n');

    const result = runGuard(repository.directory, [
      '--base',
      'f'.repeat(40),
      '--head',
      repository.headSha,
    ]);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).not.toContain('No flag files changed');
  });

  it('fails closed when ref validation itself cannot run', async () => {
    const repository = await makeRepository('key: test.flag\n', 'key: test.flag\n');
    const failingGitPath = await makeFailingGitPath();
    const realGit = findGitExecutable();

    const result = runGuard(
      repository.directory,
      ['--base', repository.baseSha, '--head', repository.headSha],
      {
        FAIL_GIT_REF_MODE: 'all',
        PATH: `${failingGitPath}${path.delimiter}${process.env.PATH}`,
        REAL_GIT: realGit,
      }
    );

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).not.toContain('No flag files changed');
  });

  it('fails closed in CI when exact pull-request provenance is missing', async () => {
    const repository = await makeRepository('key: test.flag\n', 'key: test.flag\n');

    const result = runGuard(
      repository.directory,
      ['--base', repository.baseSha, '--head', repository.headSha],
      {
        CI: 'true',
        GITHUB_ACTIONS: 'true',
        GITHUB_EVENT_NAME: 'pull_request',
        PR_BASE_SHA: repository.baseSha,
        PR_HEAD_REPOSITORY: '',
        PR_HEAD_SHA: repository.headSha,
        PR_NUMBER: '',
      }
    );

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/exact PR|PR number|head repository/i);
  });

  it('fails closed in CI when event head provenance does not match the requested head', async () => {
    const repository = await makeRepository('key: test.flag\n', 'key: test.flag\n');

    const result = runGuard(
      repository.directory,
      ['--base', repository.baseSha, '--head', repository.headSha],
      {
        CI: 'true',
        GITHUB_ACTIONS: 'true',
        GITHUB_EVENT_NAME: 'pull_request',
        PR_BASE_SHA: repository.baseSha,
        PR_HEAD_REPOSITORY: 'fork-owner/updog',
        PR_HEAD_SHA: 'e'.repeat(40),
        PR_NUMBER: '1434',
      }
    );

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/head SHA.*match/i);
  });

  it('uses exact event provenance without branch-name or PR-search inputs', async () => {
    const repository = await makeRepository('key: test.flag\n', 'key: test.flag\n');

    const result = runGuard(
      repository.directory,
      ['--base', repository.baseSha, '--head', repository.headSha],
      {
        CI: 'true',
        GITHUB_ACTIONS: 'true',
        GITHUB_EVENT_NAME: 'pull_request',
        PR_BASE_SHA: repository.baseSha,
        PR_HEAD_REPOSITORY: 'fork-owner/updog',
        PR_HEAD_SHA: repository.headSha,
        PR_NUMBER: '1434',
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('No flag files changed');
  });

  it('requires product signoff for canonical YAML rollout and client-exposure increases', async () => {
    const base = [
      'flags:',
      '  beta_rollout:',
      '    default: false',
      '    rolloutPercentage: 0',
      '    exposeToClient: false',
      '',
    ].join('\n');
    const head = [
      'flags:',
      '  beta_rollout:',
      '    default: false',
      '    rolloutPercentage: 100',
      '    exposeToClient: true',
      '',
    ].join('\n');
    const repository = await makeRepository(base, head, 'flags/registry.yaml');
    const args = ['--base', repository.baseSha, '--head', repository.headSha];

    const result = runGuard(repository.directory, args);
    const productOnly = runGuard(repository.directory, args, {
      PR_LABELS: JSON.stringify(['product-signoff']),
    });
    const approved = runGuard(repository.directory, args, {
      PR_LABELS: JSON.stringify(['product-signoff', 'approved:flags-change']),
    });

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/rollout|audience|exposed/i);
    expect(`${result.stdout}\n${result.stderr}`).toContain('product-signoff');
    expect(productOnly.status).toBe(1);
    expect(`${productOnly.stdout}\n${productOnly.stderr}`).toContain('approved:flags-change');
    expect(approved.status).toBe(0);
  });

  it('fails closed on invalid YAML rollout percentages and unknown risks', async () => {
    for (const invalidField of [
      'rolloutPercentage: 101',
      'rolloutPercentage: nope',
      'risk: extreme',
    ]) {
      const repository = await makeRepository(
        ['key: beta.invalid', 'default: false', 'rolloutPercentage: 0', 'risk: low', ''].join('\n'),
        ['key: beta.invalid', 'default: false', invalidField, ''].join('\n')
      );

      const result = runGuard(repository.directory, [
        '--base',
        repository.baseSha,
        '--head',
        repository.headSha,
      ]);

      expect(result.status).toBe(1);
      expect(`${result.stdout}\n${result.stderr}`).toMatch(/malformed|rollout|risk|failed closed/i);
    }
  });

  it('requires flags approval for a YAML risk escalation', async () => {
    const repository = await makeRepository(
      ['key: beta.risky', 'default: false', 'risk: low', ''].join('\n'),
      ['key: beta.risky', 'default: false', 'risk: high', ''].join('\n')
    );
    const args = ['--base', repository.baseSha, '--head', repository.headSha];

    const result = runGuard(repository.directory, args);
    const approved = runGuard(repository.directory, args, {
      PR_LABELS: JSON.stringify(['approved:flags-change']),
    });

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/risk|approved:flags-change/i);
    expect(approved.status).toBe(0);
  });

  it('requires emergency override when YAML killSwitch or emergency protection is weakened', async () => {
    for (const [baseField, headField] of [
      ['killSwitch: true', 'killSwitch: false'],
      ['killSwitch: true', null],
      ['emergency: true', 'emergency: false'],
      ['emergency: true', null],
    ]) {
      const repository = await makeRepository(
        ['key: beta.protected', 'default: false', baseField, ''].join('\n'),
        ['key: beta.protected', 'default: false', headField, ''].filter(Boolean).join('\n')
      );
      const args = ['--base', repository.baseSha, '--head', repository.headSha];
      const result = runGuard(repository.directory, args);
      const approved = runGuard(repository.directory, args, {
        PR_LABELS: JSON.stringify(['emergency-override']),
      });

      expect(result.status).toBe(1);
      expect(`${result.stdout}\n${result.stderr}`).toContain('emergency-override');
      expect(approved.status).toBe(0);
    }
  });

  it('treats absent activation and client-exposure fields as inactive in both YAML shapes', async () => {
    for (const [base, head, relativePath] of [
      [
        ['key: beta.flat', ''].join('\n'),
        [
          'key: beta.flat',
          'targeting:',
          '  enabled: true',
          'exposeToClient: true',
          'environments:',
          '  production: true',
          '',
        ].join('\n'),
        'flags/beta.flat.yaml',
      ],
      [
        ['flags:', '  beta_canonical:', '    default: false', ''].join('\n'),
        [
          'flags:',
          '  beta_canonical:',
          '    default: false',
          '    targeting:',
          '      enabled: true',
          '    exposeToClient: true',
          '    environments:',
          '      production: true',
          '',
        ].join('\n'),
        'flags/registry.yaml',
      ],
    ]) {
      const repository = await makeRepository(base, head, relativePath);
      const args = ['--base', repository.baseSha, '--head', repository.headSha];
      const result = runGuard(repository.directory, args);
      const approved = runGuard(repository.directory, args, {
        PR_LABELS: JSON.stringify(['product-signoff']),
      });

      expect(result.status).toBe(1);
      expect(`${result.stdout}\n${result.stderr}`).toContain('product-signoff');
      expect(approved.status).toBe(0);
    }
  });

  it('fails closed for ambiguous YAML roots regardless of key order', async () => {
    for (const head of [
      [
        'key: beta.real',
        'targeting:',
        '  enabled: true',
        'flags:',
        '  decoy:',
        '    default: false',
        '',
      ].join('\n'),
      [
        'flags:',
        '  decoy:',
        '    default: false',
        'key: beta.real',
        'targeting:',
        '  enabled: true',
        '',
      ].join('\n'),
    ]) {
      const repository = await makeRepository(
        ['key: beta.real', 'targeting:', '  enabled: false', ''].join('\n'),
        head
      );
      const result = runGuard(repository.directory, [
        '--base',
        repository.baseSha,
        '--head',
        repository.headSha,
      ]);

      expect(result.status).toBe(1);
      expect(`${result.stdout}\n${result.stderr}`).toMatch(/ambiguous|failed closed/i);
    }
  });

  it('requires flags approval when a sensitive YAML flag is deleted', async () => {
    const repository = await makeRepository(
      ['flags:', '  require_auth:', '    default: false', ''].join('\n'),
      ['flags:', '  benign_flag:', '    default: false', ''].join('\n'),
      'flags/registry.yaml'
    );
    const args = ['--base', repository.baseSha, '--head', repository.headSha];

    const result = runGuard(repository.directory, args);
    const approved = runGuard(repository.directory, args, {
      PR_LABELS: JSON.stringify(['approved:flags-change']),
    });

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain("Flag 'require_auth'");
    expect(`${result.stdout}\n${result.stderr}`).toContain('approved:flags-change');
    expect(approved.status).toBe(0);
  });

  it('defines YAML rename behavior without weakening activation or sensitive-name approvals', async () => {
    const preservingRepository = await makeRepository(
      ['flags:', '  beta_old:', '    default: false', ''].join('\n'),
      ['flags:', '  beta_new:', '    default: false', ''].join('\n'),
      'flags/registry.yaml'
    );
    const preserving = runGuard(preservingRepository.directory, [
      '--base',
      preservingRepository.baseSha,
      '--head',
      preservingRepository.headSha,
    ]);
    expect(preserving.status).toBe(0);

    const activeRepository = await makeRepository(
      ['flags:', '  auth_old:', '    default: false', ''].join('\n'),
      ['flags:', '  beta_new:', '    default: true', ''].join('\n'),
      'flags/registry.yaml'
    );
    const args = ['--base', activeRepository.baseSha, '--head', activeRepository.headSha];
    const flagsOnly = runGuard(activeRepository.directory, args, {
      PR_LABELS: JSON.stringify(['approved:flags-change']),
    });
    const both = runGuard(activeRepository.directory, args, {
      PR_LABELS: JSON.stringify(['approved:flags-change', 'product-signoff']),
    });

    expect(flagsOnly.status).toBe(1);
    expect(`${flagsOnly.stdout}\n${flagsOnly.stderr}`).toContain('product-signoff');
    expect(both.status).toBe(0);
  });

  it('requires product signoff for new compact and multiline active JavaScript flags', async () => {
    for (const head of [
      [
        'export const flags = {',
        "  'beta.compact': { enabled: true },",
        "  'beta.inactive': { enabled: false },",
        '};',
        '',
      ].join('\n'),
      [
        'export const flags = {',
        "  'beta.multiline': {",
        "    description: 'new active flag',",
        '    enabled: true,',
        '  },',
        '};',
        '',
      ].join('\n'),
    ]) {
      const repository = await makeRepository(
        ['export const flags = {};', ''].join('\n'),
        head,
        'src/feature-flags.js'
      );
      const args = ['--base', repository.baseSha, '--head', repository.headSha];
      const result = runGuard(repository.directory, args);
      const approved = runGuard(repository.directory, args, {
        PR_LABELS: JSON.stringify(['product-signoff']),
      });

      expect(result.status).toBe(1);
      expect(`${result.stdout}\n${result.stderr}`).toContain('product-signoff');
      expect(approved.status).toBe(0);
    }
  });

  it('composes product and flags approvals for a new active sensitive JavaScript flag', async () => {
    const repository = await makeRepository(
      ['export const flags = {};', ''].join('\n'),
      [
        'export const flags = {',
        "  'auth.new': { enabled: true },",
        "  'beta.other': { enabled: false },",
        '};',
        '',
      ].join('\n'),
      'src/feature-flags.ts'
    );
    const args = ['--base', repository.baseSha, '--head', repository.headSha];
    const flagsOnly = runGuard(repository.directory, args, {
      PR_LABELS: JSON.stringify(['approved:flags-change']),
    });
    const productOnly = runGuard(repository.directory, args, {
      PR_LABELS: JSON.stringify(['product-signoff']),
    });
    const both = runGuard(repository.directory, args, {
      PR_LABELS: JSON.stringify(['approved:flags-change', 'product-signoff']),
    });

    expect(flagsOnly.status).toBe(1);
    expect(`${flagsOnly.stdout}\n${flagsOnly.stderr}`).toContain('product-signoff');
    expect(productOnly.status).toBe(1);
    expect(`${productOnly.stdout}\n${productOnly.stderr}`).toContain('approved:flags-change');
    expect(both.status).toBe(0);
  });

  it('binds JavaScript activation to its declaration beyond the old 1000-line diff context', async () => {
    const padding = Array.from({ length: 1005 }, (_, index) => `    // metadata ${index}`);
    const makeContents = (enabled) =>
      [
        'export const flags = {',
        "  'beta.long': {",
        ...padding,
        `    enabled: ${enabled},`,
        '  },',
        '};',
        '',
      ].join('\n');
    const repository = await makeRepository(
      makeContents(false),
      makeContents(true),
      'src/feature-flags.js'
    );
    const args = ['--base', repository.baseSha, '--head', repository.headSha];

    const result = runGuard(repository.directory, args);
    const approved = runGuard(repository.directory, args, {
      PR_LABELS: JSON.stringify(['product-signoff']),
    });

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain("Flag 'beta.long'");
    expect(approved.status).toBe(0);
  });

  it('keeps cross-hunk JavaScript ownership and multiple-flag pairing isolated', async () => {
    const padding = Array.from({ length: 20 }, (_, index) => `  // separator ${index}`);
    const base = [
      'export const flags = {',
      "  'flag.one': { enabled: false },",
      ...padding,
      "  'flag.two': { enabled: true },",
      '};',
      '',
    ].join('\n');
    const head = [
      'export const flags = {',
      "  'flag.one': { enabled: true },",
      ...padding.map((line, index) => (index === 10 ? `${line} changed` : line)),
      "  'flag.two': { enabled: true, description: 'metadata only' },",
      '};',
      '',
    ].join('\n');
    const repository = await makeRepository(base, head, 'src/feature-flags.js');
    const result = runGuard(repository.directory, [
      '--base',
      repository.baseSha,
      '--head',
      repository.headSha,
    ]);

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain("Flag 'flag.one'");
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(
      "Flag 'flag.two' is being enabled/exposed"
    );
  });

  it('fails closed when JavaScript declarations cannot be bound uniquely', async () => {
    const repository = await makeRepository(
      [
        "const flags = { 'beta.duplicate': { enabled: false } };",
        "const featureFlags = { 'beta.duplicate': { enabled: false } };",
        '',
      ].join('\n'),
      [
        "const flags = { 'beta.duplicate': { enabled: true } };",
        "const featureFlags = { 'beta.duplicate': { enabled: false } };",
        '',
      ].join('\n'),
      'src/feature-flags.js'
    );
    const result = runGuard(repository.directory, [
      '--base',
      repository.baseSha,
      '--head',
      repository.headSha,
    ]);

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/ambiguous|unique|failed closed/i);
  });

  it('defines JavaScript rename behavior and keeps comments immune', async () => {
    const preservingRepository = await makeRepository(
      ['export const flags = {', "  'beta.old': { enabled: false },", '};', ''].join('\n'),
      [
        '// auth.comment: { enabled: true }',
        'export const flags = {',
        "  'beta.new': { enabled: false },",
        '};',
        '',
      ].join('\n'),
      'src/feature-flags.js'
    );
    const preserving = runGuard(preservingRepository.directory, [
      '--base',
      preservingRepository.baseSha,
      '--head',
      preservingRepository.headSha,
    ]);
    expect(preserving.status).toBe(0);
    expect(`${preserving.stdout}\n${preserving.stderr}`).not.toContain('auth.comment');

    const activeRepository = await makeRepository(
      ['export const flags = {', "  'auth.old': { enabled: false },", '};', ''].join('\n'),
      ['export const flags = {', "  'beta.new': { enabled: true },", '};', ''].join('\n'),
      'src/feature-flags.js'
    );
    const args = ['--base', activeRepository.baseSha, '--head', activeRepository.headSha];
    const both = runGuard(activeRepository.directory, args, {
      PR_LABELS: JSON.stringify(['approved:flags-change', 'product-signoff']),
    });
    const productOnly = runGuard(activeRepository.directory, args, {
      PR_LABELS: JSON.stringify(['product-signoff']),
    });

    expect(productOnly.status).toBe(1);
    expect(`${productOnly.stdout}\n${productOnly.stderr}`).toContain('approved:flags-change');
    expect(both.status).toBe(0);
  });

  it('fails closed on computed or spread JavaScript flag configuration', async () => {
    for (const head of [
      [
        'const ACTIVE = { enabled: true };',
        'export const flags = {',
        "  'auth.bypass': { ...ACTIVE },",
        '};',
        '',
      ].join('\n'),
      [
        'export const flags = {',
        "  'auth.bypass': { ['enabled']: true },",
        '};',
        '',
      ].join('\n'),
      [
        "const ACTIVE_FLAGS = { 'auth.bypass': { enabled: true } };",
        'export const flags = { ...ACTIVE_FLAGS };',
        '',
      ].join('\n'),
      [
        'const ACTIVE_TARGETING = { enabled: true };',
        'export const flags = {',
        "  'auth.bypass': { targeting: { ...ACTIVE_TARGETING } },",
        '};',
        '',
      ].join('\n'),
    ]) {
      const repository = await makeRepository(
        ['export const flags = {};', ''].join('\n'),
        head,
        'src/feature-flags.js'
      );
      const result = runGuard(repository.directory, [
        '--base',
        repository.baseSha,
        '--head',
        repository.headSha,
      ]);

      expect(result.status).toBe(1);
      expect(`${result.stdout}\n${result.stderr}`).toMatch(/computed|spread|failed closed/i);
    }
  });

  it('allows unrelated spread syntax outside candidate JavaScript flag registries', async () => {
    const repository = await makeRepository(
      [
        'const defaults = { description: \'metadata\' };',
        'const flagMetadata = { ...defaults };',
        'export const flags = {',
        "  'beta.safe': { enabled: false },",
        '};',
        'void flagMetadata;',
        '',
      ].join('\n'),
      [
        'const defaults = { description: \'metadata\' };',
        "const flagMetadata = { ...defaults, owner: 'team' };",
        'export const flags = {',
        "  'beta.safe': { enabled: false },",
        '};',
        'void flagMetadata;',
        '',
      ].join('\n'),
      'src/feature-flags.js'
    );
    const result = runGuard(repository.directory, [
      '--base',
      repository.baseSha,
      '--head',
      repository.headSha,
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('FLAG CHANGES APPROVED');
  });

  it('ignores unrelated governed-looking objects and nested flags properties', async () => {
    for (const head of [
      [
        "const defaults = { enabled: true };",
        'const metadata = { flags: { preview: { ...defaults } } };',
        'export const flags = {',
        "  'beta.safe': { enabled: false },",
        '};',
        'void metadata;',
        '',
      ].join('\n'),
      [
        'const metadata = { preview: { enabled: true } };',
        'export const flags = {',
        "  'beta.safe': { enabled: false },",
        '};',
        'void metadata;',
        '',
      ].join('\n'),
    ]) {
      const repository = await makeRepository(
        [
          'export const flags = {',
          "  'beta.safe': { enabled: false },",
          '};',
          '',
        ].join('\n'),
        head,
        'src/feature-flags.js'
      );
      const result = runGuard(repository.directory, [
        '--base',
        repository.baseSha,
        '--head',
        repository.headSha,
      ]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('FLAG CHANGES APPROVED');
      expect(`${result.stdout}\n${result.stderr}`).not.toContain("Flag 'preview'");
    }
  });

  it('analyzes canonical JavaScript registries in legacy candidate paths', async () => {
    for (const file of [
      'packages/app/flags/registry.js',
      'src/feature-control.js',
      'src/registry.js',
    ]) {
      const repository = await makeRepository(
        ['export const flags = {', "  'beta.routed': { enabled: false },", '};', ''].join(
          '\n'
        ),
        ['export const flags = {', "  'beta.routed': { enabled: true },", '};', ''].join(
          '\n'
        ),
        file
      );
      const args = ['--base', repository.baseSha, '--head', repository.headSha];
      const result = runGuard(repository.directory, args);
      const approved = runGuard(repository.directory, args, {
        PR_LABELS: JSON.stringify(['product-signoff']),
      });

      expect(result.status).toBe(1);
      expect(`${result.stdout}\n${result.stderr}`).toContain('product-signoff');
      expect(approved.status).toBe(0);
    }
  });

  it('ignores unrelated TypeScript modules routed for registry discovery', async () => {
    const repository = await makeRepository(
      [
        'interface Metadata { enabled: boolean }',
        'const metadata: Metadata = { enabled: false };',
        'void metadata;',
        '',
      ].join('\n'),
      [
        'interface Metadata { enabled: boolean }',
        'const metadata: Metadata = { enabled: true };',
        'void metadata;',
        '',
      ].join('\n'),
      'src/registry.ts'
    );
    const result = runGuard(repository.directory, [
      '--base',
      repository.baseSha,
      '--head',
      repository.headSha,
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('No flag files changed');
  });

  it('evaluates every audience increase for cumulative approval requirements', async () => {
    const repository = await makeRepository(
      [
        'key: beta.cumulative',
        'default: false',
        'rolloutPercentage: 0',
        'targeting:',
        '  rules:',
        '    - percentage: 0',
        '',
      ].join('\n'),
      [
        'key: beta.cumulative',
        'default: false',
        'rolloutPercentage: 100',
        'targeting:',
        '  rules:',
        '    - percentage: 1',
        '',
      ].join('\n')
    );
    const args = ['--base', repository.baseSha, '--head', repository.headSha];
    const flagsOnly = runGuard(repository.directory, args, {
      PR_LABELS: JSON.stringify(['approved:flags-change']),
    });
    const both = runGuard(repository.directory, args, {
      PR_LABELS: JSON.stringify(['approved:flags-change', 'product-signoff']),
    });

    expect(flagsOnly.status).toBe(1);
    expect(`${flagsOnly.stdout}\n${flagsOnly.stderr}`).toContain('product-signoff');
    expect(both.status).toBe(0);
  });

  it('requires flags approval for new active and inactive high-risk flags', async () => {
    for (const targetingEnabled of [true, false]) {
      const repository = await makeRepository(
        '# flags\n',
        [
          'key: beta.high-risk',
          'risk: high',
          'targeting:',
          `  enabled: ${targetingEnabled}`,
          '',
        ].join('\n')
      );
      const args = ['--base', repository.baseSha, '--head', repository.headSha];
      const insufficient = runGuard(repository.directory, args, {
        PR_LABELS: JSON.stringify(targetingEnabled ? ['product-signoff'] : []),
      });
      const approved = runGuard(repository.directory, args, {
        PR_LABELS: JSON.stringify(
          targetingEnabled
            ? ['product-signoff', 'approved:flags-change']
            : ['approved:flags-change']
        ),
      });

      expect(insufficient.status).toBe(1);
      expect(`${insufficient.stdout}\n${insufficient.stderr}`).toContain(
        'approved:flags-change'
      );
      expect(approved.status).toBe(0);
    }
  });

  it('requires flags approval when an existing flag gains high risk from no risk', async () => {
    const repository = await makeRepository(
      ['key: beta.safe', 'default: false', ''].join('\n'),
      ['key: beta.safe', 'default: false', 'risk: high', ''].join('\n')
    );
    const args = ['--base', repository.baseSha, '--head', repository.headSha];
    const result = runGuard(repository.directory, args);
    const approved = runGuard(repository.directory, args, {
      PR_LABELS: JSON.stringify(['approved:flags-change']),
    });

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain('approved:flags-change');
    expect(approved.status).toBe(0);
  });
});
