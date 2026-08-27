import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

const verifier = path.resolve('scripts/verify-vendored-skills.mjs');
const tempRoots = [];

function hashSkillFiles(files) {
  const hash = createHash('sha256');
  const entries = Object.entries(files).sort(([left], [right]) =>
    Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
  );

  for (const [relativePath, contents] of entries) {
    const bytes = Buffer.from(contents);
    hash.update(Buffer.from(relativePath, 'utf8'));
    hash.update(bytes);
  }

  return hash.digest('hex');
}

async function write(root, relativePath, contents) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
}

async function createFixture({ lockTransform } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'updog-vendored-skills-'));
  tempRoots.push(root);

  const files = {
    'SKILL.md': '# Neon fixture\n',
    'references/a.md': 'first\n',
    'references/z.md': 'last\n',
  };
  for (const [relativePath, contents] of Object.entries(files).reverse()) {
    await write(root, `.agents/skills/neon/${relativePath}`, contents);
  }

  const lock = {
    version: 1,
    hashContract: 'sha256-folder-v1',
    skills: {
      neon: {
        source: 'neondatabase/agent-skills',
        sourceType: 'github',
        skillPath: 'skills/neon',
        localPath: '.agents/skills/neon',
        computedHash: hashSkillFiles(files),
      },
    },
  };
  lockTransform?.(lock);
  await write(root, 'skills-lock.json', `${JSON.stringify(lock, null, 2)}\n`);

  return { root };
}

function verify(root, ...args) {
  return spawnSync(process.execPath, [verifier, '--root', root, ...args], {
    encoding: 'utf8',
  });
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('vendored skill lock verification', () => {
  it('accepts content matching the deterministic folder hash', async () => {
    const { root } = await createFixture();

    const result = verify(root);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('PASS: 1 vendored skill lock entry verified');
  });

  it('fails nonzero when vendored content is stale', async () => {
    const { root } = await createFixture({
      lockTransform(lock) {
        lock.skills.neon.computedHash = '0'.repeat(64);
      },
    });

    const result = verify(root);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('neon: hash mismatch');
    expect(result.stderr).toContain(`expected ${'0'.repeat(64)}`);
  });

  it('fails nonzero when a vendored skill has no lock data', async () => {
    const { root } = await createFixture({
      lockTransform(lock) {
        lock.skills = {};
      },
    });

    const result = verify(root);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('unlocked vendored skill directory: .agents/skills/neon');
  });

  it('refreshes only computed hashes and produces a verifiable lock', async () => {
    const { root } = await createFixture({
      lockTransform(lock) {
        lock.skills.neon.computedHash = 'f'.repeat(64);
      },
    });

    const update = verify(root, '--write');
    const updatedLock = JSON.parse(await readFile(path.join(root, 'skills-lock.json'), 'utf8'));
    const check = verify(root);

    expect(update.status, update.stderr).toBe(0);
    expect(update.stdout).toContain('Updated 1 vendored skill hash in skills-lock.json');
    expect(updatedLock.skills.neon.computedHash).not.toBe('f'.repeat(64));
    expect(check.status, check.stderr).toBe(0);
  });
});
