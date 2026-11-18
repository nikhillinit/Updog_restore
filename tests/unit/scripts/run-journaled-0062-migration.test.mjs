import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  runJournaled0062Migration,
  runJournaled0062MigrationCli,
} from '../../../scripts/run-journaled-0062-migration.mjs';

const directories = [];
const connectionString = 'postgres://operator:disposable@localhost/test';

async function copySources() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'updog-journaled-0062-'));
  directories.push(directory);
  await Promise.all([
    cp('migrations', path.join(directory, 'migrations'), { recursive: true }),
    cp('scripts/prod-schema-manifests', path.join(directory, 'scripts/prod-schema-manifests'), {
      recursive: true,
    }),
  ]);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe('journaled 0062 source and command admission', () => {
  it.each([
    ['migrations/meta/_journal.json', 'journal or SQL source identity mismatch'],
    ['migrations/0062_vehicle_onboarding_commands.sql', 'journal or SQL source identity mismatch'],
    ['migrations/0061_durable_create_receipts.sql', 'predecessor SQL source identity mismatch'],
    ['migrations/0000_quick_vivisector.sql', 'baseline SQL source identity mismatch'],
    [
      'scripts/prod-schema-manifests/39-vehicle-onboarding-commands.json',
      'manifest source identity mismatch',
    ],
    ['scripts/prod-schema-manifests/01-cohort.json', 'manifest source identity mismatch'],
  ])('refuses changed %s before constructing a client', async (relativePath, message) => {
    const rootDir = await copySources();
    const target = path.join(rootDir, relativePath);
    await writeFile(target, `${await readFile(target, 'utf8')}\n`);
    const clientFactory = vi.fn();

    await expect(
      runJournaled0062Migration({ rootDir, connectionString, clientFactory })
    ).rejects.toThrow(message);
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it('refuses a later journal tail even when the exact 0062 entry is present', async () => {
    const rootDir = await copySources();
    const file = path.join(rootDir, 'migrations/meta/_journal.json');
    const journal = JSON.parse(await readFile(file, 'utf8'));
    journal.entries.push({ ...journal.entries.at(-1), idx: 64, tag: '0063_future' });
    await writeFile(file, JSON.stringify(journal));
    const clientFactory = vi.fn();

    await expect(
      runJournaled0062Migration({ rootDir, connectionString, clientFactory })
    ).rejects.toThrow('requires exactly journal entries 0-63 and manifests 1-39');
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it('refuses a pooler selected by the effective host before constructing a client', async () => {
    const clientFactory = vi.fn();
    await expect(
      runJournaled0062Migration({
        connectionString: `${connectionString}?host=test-pooler.example.invalid`,
        clientFactory,
      })
    ).rejects.toThrow('Refusing pooled database URL');
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it('refuses a missing apply fingerprint before constructing a client', async () => {
    const clientFactory = vi.fn();
    await expect(
      runJournaled0062Migration({ connectionString, apply: true, clientFactory })
    ).rejects.toThrow('Target fingerprint missing or mismatched');
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it.each([
    ['--yes'],
    ['--apply'],
    ['--apply --yes'],
    ['--apply', '--yes'],
    ['--apply', '--yes', '--yes'],
  ])('refuses flags on the read-only CLI', async (...argv) => {
    const stdout = { write: vi.fn() };
    const stderr = { write: vi.fn() };

    await expect(runJournaled0062MigrationCli({ argv, env: {}, stdout, stderr })).resolves.toBe(1);
    expect(stdout.write).not.toHaveBeenCalled();
    expect(stderr.write).toHaveBeenCalledWith(
      'journaled-0062: refused-before-connect: The 0062 CLI is read-only; use the governed apply route\n'
    );
  });
});
