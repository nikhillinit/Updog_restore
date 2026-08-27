import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
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
  const encodeLength = (value) => {
    const encoded = Buffer.alloc(8);
    encoded.writeBigUInt64BE(BigInt(value));
    return encoded;
  };

  hash.update('updog/vendored-skill-folder/sha256-folder-framed-v2\0');
  hash.update(encodeLength(entries.length));
  for (const [relativePath, contents] of entries) {
    const pathBytes = Buffer.from(relativePath, 'utf8');
    const bytes = Buffer.from(contents);
    hash.update(encodeLength(pathBytes.length));
    hash.update(pathBytes);
    hash.update(encodeLength(bytes.length));
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
    hashContract: 'sha256-folder-framed-v2',
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
  it('rejects duplicate JSON keys at every object depth without update writes', async () => {
    const { root } = await createFixture();
    const lockPath = path.join(root, 'skills-lock.json');
    const malformed = await readFile(lockPath, 'utf8');
    const contents = malformed.replace('"version": 1', '"version": 999, "version": 1');
    await writeFile(lockPath, contents, 'utf8');
    const check = verify(root);
    const update = verify(root, '--write');
    expect(check.status).not.toBe(0);
    expect(update.status).not.toBe(0);
    expect(await readFile(lockPath, 'utf8')).toBe(contents);
  });

  it('rejects symlinked lock path in check and update modes', async () => {
    const { root } = await createFixture();
    const outside = await mkdtemp(path.join(os.tmpdir(), 'updog-vendored-outside-'));
    tempRoots.push(outside);
    await write(outside, 'SKILL.md', 'outside\n');
    await rm(path.join(root, 'skills-lock.json'));
    await symlink(outside, path.join(root, 'skills-lock.json'));
    const check = verify(root);
    const update = verify(root, '--write');
    expect(check.status).not.toBe(0);
    expect(update.status).not.toBe(0);
  });

  it('rejects symlinked vendor root and skill directory in check and update modes', async () => {
    for (const target of ['root', 'skill']) {
      const { root } = await createFixture();
      const outside = await mkdtemp(path.join(os.tmpdir(), 'updog-vendored-outside-'));
      tempRoots.push(outside);
      await write(outside, 'SKILL.md', 'outside\n');
      if (target === 'root') {
        await rm(path.join(root, '.agents/skills'), { recursive: true });
        await symlink(outside, path.join(root, '.agents/skills'));
      } else {
        await rm(path.join(root, '.agents/skills/neon'), { recursive: true });
        await symlink(outside, path.join(root, '.agents/skills/neon'));
      }
      const check = verify(root);
      const update = verify(root, '--write');
      expect(check.status).not.toBe(0);
      expect(update.status).not.toBe(0);
    }
  });

  it('rejects malformed computedHash forms in update mode without rewriting the lock', async () => {
    for (const malformed of ['not-a-hash', 'A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), 123]) {
      const { root } = await createFixture({
        lockTransform(lock) {
          lock.skills.neon.computedHash = malformed;
        },
      });
      const lockPath = path.join(root, 'skills-lock.json');
      const before = await readFile(lockPath, 'utf8');
      const update = verify(root, '--write');
      expect(update.status).not.toBe(0);
      expect(await readFile(lockPath, 'utf8')).toBe(before);
    }
  });

  it('uses an injective framed folder hash contract', async () => {
    const { hashVendoredSkill } = await import(verifier);
    const left = await mkdtemp(path.join(os.tmpdir(), 'updog-hash-left-'));
    const right = await mkdtemp(path.join(os.tmpdir(), 'updog-hash-right-'));
    tempRoots.push(left, right);
    await writeFile(path.join(left, 'a'), 'bc');
    await writeFile(path.join(right, 'ab'), 'c');
    const leftHash = await hashVendoredSkill(left);
    const rightHash = await hashVendoredSkill(right);
    expect(leftHash.hash).not.toBe(rightHash.hash);
  });

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
