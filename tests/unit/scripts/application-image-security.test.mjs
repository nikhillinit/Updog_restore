import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
const runtime = dockerfile.split(/^FROM .* AS prod\s*$/m)[1];
const hardening = runtime
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('#'))
  .join('\n')
  .replace(/\\\r?\n/g, ' ')
  .match(/^RUN (.+)$/m)[1];
const temporaryRoots = [];

afterEach(() => {
  for (const directory of temporaryRoots.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

function runHardening(failingApkCommand = '') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'application-image-security-'));
  temporaryRoots.push(directory);
  const trace = path.join(directory, 'commands.jsonl');
  const stub = `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const command = path.basename(process.argv[1]);
const args = process.argv.slice(2);
fs.appendFileSync(process.env.IMAGE_TEST_TRACE, JSON.stringify({ command, args }) + '\\n');
if (command === 'apk' && args[0] === process.env.IMAGE_TEST_FAIL_APK) process.exit(23);
`;
  for (const command of ['addgroup', 'adduser', 'apk', 'rm'])
    fs.writeFileSync(path.join(directory, command), stub, { mode: 0o755 });

  // Every external command is stubbed; the Dockerfile's cleanup cannot touch the host.
  const result = spawnSync('/bin/sh', ['-eu', '-c', hardening], {
    env: {
      PATH: directory,
      IMAGE_TEST_TRACE: trace,
      IMAGE_TEST_FAIL_APK: failingApkCommand,
      TZ: 'UTC',
    },
    encoding: 'utf8',
    timeout: 5000,
  });
  const commands = fs.existsSync(trace)
    ? fs.readFileSync(trace, 'utf8').trim().split('\n').map(JSON.parse)
    : [];
  return { result, commands };
}

describe.skipIf(process.platform === 'win32')('application runtime image security', () => {
  it('requires patched musl packages in the final image while retaining runtime hardening', () => {
    const { result, commands } = runHardening();
    expect(result.status, result.stderr).toBe(0);
    const installation = commands.find(
      ({ command, args }) => command === 'apk' && args[0] === 'add'
    );
    expect(installation?.args).toEqual(
      expect.arrayContaining(['--no-cache', 'dumb-init', 'musl>=1.2.6-r3', 'musl-utils>=1.2.6-r3'])
    );
    expect(commands.find(({ command }) => command === 'rm')?.args).toEqual([
      '-rf',
      '/usr/local/lib/node_modules/npm',
      '/usr/local/bin/npm',
      '/usr/local/bin/npx',
    ]);
    expect(runtime).toMatch(/^USER 1001:1001$/m);
    expect(runtime).toContain('ENTRYPOINT ["dumb-init", "--"]');
  });

  it.each(['upgrade', 'add'])('stops the runtime build when apk %s fails', (command) => {
    const { result, commands } = runHardening(command);
    expect(result.status, result.stderr).toBe(23);
    expect(commands.at(-1)?.command).toBe('apk');
    expect(commands.at(-1)?.args[0]).toBe(command);
    expect(commands.some(({ command: name }) => name === 'rm')).toBe(false);
  });
});
