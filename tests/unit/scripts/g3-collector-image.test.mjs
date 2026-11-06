import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const dockerfile = fs.readFileSync(
  path.join(root, 'scripts/release/g3-vercel-build/Dockerfile'),
  'utf8'
);
const entrypoint = JSON.parse(dockerfile.match(/^ENTRYPOINT (.+)$/m)[1]);
const temporaryRoots = [];
afterEach(() => {
  for (const directory of temporaryRoots.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

describe('collector image security and prepared dependencies', () => {
  it('pins patched runtime and compiler images without changing execution isolation', () => {
    expect(dockerfile).toMatch(
      /^FROM --platform=linux\/amd64 node:22\.23\.4-alpine3\.24@sha256:[a-f0-9]{64}$/m
    );
    expect(dockerfile).toMatch(
      /^FROM --platform=\$BUILDPLATFORM golang:1\.27\.3-alpine3\.24@sha256:[a-f0-9]{64} AS esbuild-build$/m
    );
    expect(dockerfile).toContain('npm install --global npm@11.21.2 --ignore-scripts');
    expect(dockerfile).toMatch(/^USER node$/m);
    expect(dockerfile).toContain('npm_config_offline=true');
    expect(dockerfile).toContain('npm_config_ignore_scripts=true');
    expect(entrypoint.slice(0, 7)).toEqual(['timeout', '-s', 'KILL', '660', 'sh', '-eu', '-c']);
  });

  it('rebuilds both locked esbuild versions and removes cached vulnerable binaries', () => {
    for (const [directory, output] of [
      ['', 'app'],
      ['scripts/release/g3-vercel-build', 'g3'],
    ]) {
      const lock = JSON.parse(fs.readFileSync(path.join(root, directory, 'package-lock.json')));
      const version = lock.packages['node_modules/esbuild'].version;
      expect(dockerfile).toContain(`cd /go/pkg/mod/github.com/evanw/esbuild@v${version}`);
      expect(dockerfile).toContain(
        `go build -trimpath -ldflags="-s -w" -o /out/${output}/esbuild ./cmd/esbuild`
      );
      expect(dockerfile).toContain(
        `cp /rebuilt-esbuild/${output}/esbuild /opt/${output}/node_modules/@esbuild/linux-x64/bin/esbuild`
      );
    }
    const installation = dockerfile.slice(dockerfile.indexOf('RUN --mount='));
    expect(installation).toContain('npm ci --prefix /opt/g3 --ignore-scripts');
    expect(installation).toContain('npm ci --include=dev --ignore-scripts');
    expect(installation).toContain('npm cache clean --force');
    expect(installation.indexOf('npm cache clean --force')).toBeGreaterThan(
      installation.lastIndexOf('cp /rebuilt-esbuild/')
    );
  });

  it.skipIf(process.platform === 'win32').each([null, 'package.json', 'package-lock.json'])(
    'uses the actual entrypoint to reject changed dependency input %s before copying dependencies',
    (changedInput) => {
      const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'g3-image-entrypoint-'));
      temporaryRoots.push(temporary);
      for (const directory of [
        'candidate',
        'proof',
        'input',
        'prepared/node_modules',
        'archive',
        'bin',
      ])
        fs.mkdirSync(path.join(temporary, directory), { recursive: true });
      for (const filename of ['package.json', 'package-lock.json']) {
        fs.writeFileSync(path.join(temporary, 'prepared', filename), '{}\n');
        fs.writeFileSync(
          path.join(temporary, 'archive', filename),
          filename === changedInput ? '{"changed":true}\n' : '{}\n'
        );
      }
      fs.writeFileSync(path.join(temporary, 'prepared/node_modules/patched-binary'), 'prepared');
      const marker = path.join(temporary, 'collector-called');
      fs.writeFileSync(
        path.join(temporary, 'bin/node'),
        '#!/bin/sh\nprintf invoked > "$G3_TEST_MARKER"\n',
        {
          mode: 0o755,
        }
      );
      const archive = spawnSync('tar', [
        '-cf',
        path.join(temporary, 'input/candidate.tar'),
        '-C',
        path.join(temporary, 'archive'),
        '.',
      ]);
      expect(archive.status, archive.stderr?.toString()).toBe(0);
      const destinations = {
        '/candidate': 'candidate',
        '/proof': 'proof',
        '/input': 'input',
        '/opt/app': 'prepared',
      };
      const script = entrypoint[7].replace(
        /\/candidate(?=\/|[\s";])|\/proof(?=\/|[\s";])|\/input(?=\/|[\s";])|\/opt\/app(?=\/|[\s";])/g,
        (source) => path.join(temporary, destinations[source])
      );
      const result = spawnSync('sh', ['-eu', '-c', script, 'g3-test', 'a'.repeat(40)], {
        env: {
          PATH: `${path.join(temporary, 'bin')}:/usr/bin:/bin`,
          G3_TEST_MARKER: marker,
          TZ: 'UTC',
        },
        encoding: 'utf8',
        timeout: 5000,
      });
      if (changedInput) {
        expect(result.status).not.toBe(0);
        expect(fs.existsSync(marker)).toBe(false);
        expect(fs.existsSync(path.join(temporary, 'candidate/node_modules'))).toBe(false);
      } else {
        expect(result.status, result.stderr).toBe(0);
        expect(fs.readFileSync(marker, 'utf8')).toBe('invoked');
        expect(
          fs.readFileSync(path.join(temporary, 'candidate/node_modules/patched-binary'), 'utf8')
        ).toBe('prepared');
      }
    }
  );
});
