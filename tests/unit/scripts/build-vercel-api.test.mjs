/* global process */

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('build-vercel-api', () => {
  it('bundles the Vercel Neon HTTP driver instead of leaving a traced runtime require', () => {
    const result = spawnSync(process.execPath, [resolve(root, 'scripts/build-vercel-api.mjs')], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    });

    expect(result.status, result.stderr || result.stdout).toBe(0);

    const generatedPath = resolve(root, 'api/_app.generated.mjs');
    const inspect = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
          import { readFileSync } from 'node:fs';
          const generated = readFileSync(process.argv[1], 'utf8');
          console.log(JSON.stringify({
            hasRequire2: generated.includes('require2("drizzle-orm/neon-http")'),
            hasRequire: generated.includes('require("drizzle-orm/neon-http")'),
            mentionsNeonHttp: generated.includes('neon-http')
          }));
        `,
        generatedPath,
      ],
      {
        cwd: root,
        encoding: 'utf8',
      }
    );

    expect(inspect.status, inspect.stderr || inspect.stdout).toBe(0);
    const bundleState = JSON.parse(inspect.stdout);

    expect(bundleState.hasRequire2).toBe(false);
    expect(bundleState.hasRequire).toBe(false);
    expect(bundleState.mentionsNeonHttp).toBe(true);
  });
});
