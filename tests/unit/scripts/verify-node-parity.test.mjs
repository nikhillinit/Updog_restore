import { mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { DOCKER_BASE_IMAGE, NODE_ENGINE, NODE_VERSION } from '../../../scripts/verify-node-parity.mjs';

const temporaryRoots = [];
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const parityScript = join(repoRoot, 'scripts/verify-node-parity.mjs');

function runNodeScript(source, rootDir) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source, rootDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  expect(result.status, result.stderr || result.stdout).toBe(0);
}

function createParityFixture() {
  const rootDir = mkdtempSync(join(tmpdir(), 'node-parity-'));
  temporaryRoots.push(rootDir);

  runNodeScript(
    `
      import { mkdirSync, writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      const root = process.argv[1];
      const version = ${JSON.stringify(NODE_VERSION)};
      const image = ${JSON.stringify(DOCKER_BASE_IMAGE)};
      const write = (relativePath, content) => {
        const filePath = join(root, relativePath);
        mkdirSync(join(filePath, '..'), { recursive: true });
        writeFileSync(filePath, content);
      };
      write('package.json', JSON.stringify({ engines: { node: ${JSON.stringify(NODE_ENGINE)} }, volta: { node: version } }));
      write('.nvmrc', version + '\\n');
      write('.github/workflows/ci.yml', "      - uses: actions/setup-node@v7\\n        with:\\n          node-version: '" + version + "'\\n          run: node -v | grep '^v" + version + "$'\\n");
      write('.github/actions/setup-node-env/action.yml', "inputs:\\n  node-version:\\n    default: '" + version + "'\\n");
      for (const fileName of ['Dockerfile', 'Dockerfile.railway', 'Dockerfile.worker']) write(fileName, 'FROM ' + image + '\\n');
      for (const fileName of ['scripts/build-server.mjs', 'scripts/build-vercel-api.mjs', 'scripts/build-workers.mjs']) write(fileName, "  target: 'node22',\\n");
    `,
    rootDir
  );

  return rootDir;
}

function replaceFixtureFile(rootDir, relativePath, content) {
  runNodeScript(
    `
      import { writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      writeFileSync(join(process.argv[1], ${JSON.stringify(relativePath)}), ${JSON.stringify(content)});
    `,
    rootDir
  );
}

function runParity(rootDir) {
  return spawnSync(process.execPath, [parityScript, '--root', rootDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    rmSync(temporaryRoots.pop(), { recursive: true, force: true });
  }
});

describe('verify-node-parity', () => {
  it('passes when all controlled runtime surfaces agree', () => {
    const rootDir = createParityFixture();
    const result = runParity(rootDir);
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain('pass');
  });

  it('returns nonzero and identifies runtime drift', () => {
    const rootDir = createParityFixture();
    replaceFixtureFile(rootDir, '.nvmrc', '20.19.5\n');
    replaceFixtureFile(
      rootDir,
      '.github/workflows/ci.yml',
      "      - uses: actions/setup-node@v7\n        with:\n          node-version: '20.19.0'\n"
    );

    const result = runParity(rootDir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('.nvmrc');
    expect(result.stderr).toContain('ci.yml node-version');
  });
});
