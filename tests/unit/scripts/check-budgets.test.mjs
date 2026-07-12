import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterEach, describe, expect, it } from 'vitest';

const checker = path.resolve(process.cwd(), 'scripts', 'check-budgets.cjs');
const tempRoots = [];

async function makeBundleFixture(budgets) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'updog-bundle-budget-'));
  tempRoots.push(root);
  await mkdir(path.join(root, 'dist', 'public', '.vite'), { recursive: true });
  await mkdir(path.join(root, 'dist', 'public', 'assets'), { recursive: true });
  await writeFile(
    path.join(root, 'dist', 'public', '.vite', 'manifest.json'),
    JSON.stringify({ 'index.html': { file: 'assets/index.js' } }),
    'utf8'
  );
  await writeFile(
    path.join(root, 'dist', 'public', 'assets', 'index.js'),
    'export default 1;',
    'utf8'
  );
  await writeFile(path.join(root, '.size-limit.json'), JSON.stringify(budgets), 'utf8');
  return root;
}

function runChecker(root) {
  return spawnSync(process.execPath, [checker, '--json'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('bundle budget baselines', () => {
  it('fails a glob budget that matches no production assets', async () => {
    const root = await makeBundleFixture([
      {
        name: 'Missing chunks',
        strategy: 'glob-sum',
        path: 'dist/public/assets/missing-*.js',
        limit: '10 KB',
        gzip: true,
      },
    ]);

    const result = runChecker(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('matched no files');
  });

  it('measures the largest matching chunk instead of summing unrelated lazy chunks', async () => {
    const root = await makeBundleFixture([
      {
        name: 'Largest JavaScript chunk',
        strategy: 'glob-max',
        path: 'dist/public/assets/*.js',
        limit: '10 KB',
        gzip: false,
      },
    ]);
    await writeFile(
      path.join(root, 'dist', 'public', 'assets', 'large.js'),
      'x'.repeat(200),
      'utf8'
    );

    const result = runChecker(root);
    const report = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(report[0].size).toBe(200);
    expect(report[0].files).toEqual(['dist/public/assets/large.js']);
  });
});
