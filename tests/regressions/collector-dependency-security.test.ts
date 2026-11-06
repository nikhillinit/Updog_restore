import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

type LockedPackage = {
  version?: string;
  optionalDependencies?: Record<string, string>;
};

type PackageLock = { packages: Record<string, LockedPackage> };

async function readLock(relativePath: string): Promise<PackageLock> {
  return JSON.parse(await readFile(path.join(process.cwd(), relativePath), 'utf8'));
}

describe('collector dependency security', () => {
  it.each([
    ['vite', '6.4.4'],
    ['basic-ftp', '6.2.1'],
    ['undici', '7.30.2'],
  ])(
    'resolves every root %s installation to the reviewed patched version',
    async (name, version) => {
      const lock = await readLock('package-lock.json');
      const installations = Object.entries(lock.packages).filter(
        ([location]) =>
          location === `node_modules/${name}` || location.endsWith(`/node_modules/${name}`)
      );

      expect(installations.length).toBeGreaterThan(0);
      for (const [location, installed] of installations) {
        expect(installed.version, location).toBe(version);
      }
    }
  );

  it.each([
    ['path-to-regexp', { '6': '6.3.0', '8': '8.4.2' }],
    ['undici', { '6': '6.29.1', '7': '7.30.2' }],
  ] as const)(
    'preserves every patched %s major family in the Vercel lock',
    async (name, versions) => {
      const lock = await readLock('scripts/release/g3-vercel-build/package-lock.json');
      const observedMajors = new Set<string>();
      for (const [location, installed] of Object.entries(lock.packages)) {
        if (location !== `node_modules/${name}` && !location.endsWith(`/node_modules/${name}`))
          continue;
        const major = installed.version?.split('.')[0];
        if (!major) throw new Error(`Missing version at ${location}`);
        observedMajors.add(major);
        expect(installed.version, location).toBe((versions as Record<string, string>)[major]);
      }
      expect([...observedMajors].sort()).toEqual(Object.keys(versions).sort());
    }
  );

  it('avoids conflicting inherited override contexts for shared Vercel dependencies', async () => {
    const manifest = JSON.parse(
      await readFile(
        path.join(process.cwd(), 'scripts/release/g3-vercel-build/package.json'),
        'utf8'
      )
    ) as { overrides: Record<string, string | Record<string, string>> };
    expect(manifest.overrides).toMatchObject({
      'path-to-regexp@6': '6.3.0',
      'path-to-regexp@8': '8.4.2',
      'undici@5': '6.29.1',
      'undici@6': '6.29.1',
      'undici@7': '7.30.2',
    });
    // npm 11 rejects shared nodes whose parent contexts carry incompatible rules,
    // even when their installed versions satisfy every direct dependency range.
    for (const override of Object.values(manifest.overrides)) {
      if (typeof override !== 'object') continue;
      expect(override).not.toHaveProperty('path-to-regexp');
      expect(override).not.toHaveProperty('undici');
    }
  });

  it.each(['package-lock.json', 'scripts/release/g3-vercel-build/package-lock.json'])(
    'keeps the esbuild JavaScript API and every platform binary coupled in %s',
    async (relativePath) => {
      const lock = await readLock(relativePath);
      const wrapper = lock.packages['node_modules/esbuild'];
      if (!wrapper?.version) throw new Error(`Missing esbuild version in ${relativePath}`);
      const platforms = Object.entries(wrapper.optionalDependencies ?? {});
      expect(platforms.length).toBeGreaterThan(0);

      for (const [name, version] of platforms) {
        expect(version, name).toBe(wrapper.version);
        expect(lock.packages[`node_modules/${name}`]?.version, name).toBe(wrapper.version);
      }
      for (const [location, installed] of Object.entries(lock.packages)) {
        if (
          location.endsWith('/esbuild') ||
          /\/node_modules\/@esbuild\/[^/]+$/.test(`/${location}`)
        ) {
          expect(installed.version, location).toBe(wrapper.version);
        }
      }
    }
  );

  it('bundles and executes TypeScript through the installed esbuild native binary', async () => {
    const fixture = await mkdtemp(path.join(tmpdir(), 'collector-esbuild-'));
    try {
      await writeFile(path.join(fixture, 'value.ts'), 'export const value: number = 21;\n');
      const result = await build({
        stdin: {
          contents: 'import { value } from "./value.ts"; export const answer: number = value * 2;',
          resolveDir: fixture,
          loader: 'ts',
        },
        bundle: true,
        platform: 'node',
        target: 'node22',
        format: 'iife',
        globalName: 'collectorBundle',
        write: false,
      });
      const output = result.outputFiles?.[0];
      if (!output) throw new Error('esbuild emitted no bundle');
      const context: { collectorBundle?: { answer: number } } = {};
      runInNewContext(output.text, context, { timeout: 1_000 });
      expect(context.collectorBundle?.answer).toBe(42);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });
});
