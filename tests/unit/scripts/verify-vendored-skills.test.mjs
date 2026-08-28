import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import {
  access,
  chmod,
  link,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
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
  it('verifies the checked-in vendored lock during the unit suite', () => {
    const result = verify(process.cwd());

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('PASS: 2 vendored skill lock entries verified');
  });

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

  it('rejects a symlinked lock file without modifying its external target', async () => {
    const { root } = await createFixture();
    const outside = await mkdtemp(path.join(os.tmpdir(), 'updog-vendored-outside-'));
    tempRoots.push(outside);
    const lockPath = path.join(root, 'skills-lock.json');
    const externalLockPath = path.join(outside, 'skills-lock.json');
    const original = await readFile(lockPath, 'utf8');
    await writeFile(externalLockPath, original, 'utf8');
    await rm(lockPath);
    await symlink(externalLockPath, lockPath);

    const check = verify(root);
    const update = verify(root, '--write');

    expect(check.status).not.toBe(0);
    expect(update.status).not.toBe(0);
    expect(await readFile(externalLockPath, 'utf8')).toBe(original);
  });

  it('rejects symlinked vendored ancestors and skill directories in check and update modes', async () => {
    for (const target of ['agents', 'root', 'skill']) {
      const { root } = await createFixture();
      const outside = await mkdtemp(path.join(os.tmpdir(), 'updog-vendored-outside-'));
      tempRoots.push(outside);

      if (target === 'agents') {
        await write(outside, 'skills/neon/SKILL.md', '# Neon fixture\n');
        await write(outside, 'skills/neon/references/a.md', 'first\n');
        await write(outside, 'skills/neon/references/z.md', 'last\n');
        await rm(path.join(root, '.agents'), { recursive: true });
        await symlink(outside, path.join(root, '.agents'));
      } else if (target === 'root') {
        await write(outside, 'neon/SKILL.md', '# Neon fixture\n');
        await write(outside, 'neon/references/a.md', 'first\n');
        await write(outside, 'neon/references/z.md', 'last\n');
        await rm(path.join(root, '.agents/skills'), { recursive: true });
        await symlink(outside, path.join(root, '.agents/skills'));
      } else {
        await write(outside, 'SKILL.md', '# Neon fixture\n');
        await write(outside, 'references/a.md', 'first\n');
        await write(outside, 'references/z.md', 'last\n');
        await rm(path.join(root, '.agents/skills/neon'), { recursive: true });
        await symlink(outside, path.join(root, '.agents/skills/neon'));
      }

      const check = verify(root);
      const update = verify(root, '--write');
      expect(check.status).not.toBe(0);
      expect(update.status).not.toBe(0);
    }
  });

  it('strictly rejects invalid UTF-8 filename bytes', async () => {
    const module = await import(verifier);
    expect(() => module.decodeFilenameBytes(Buffer.from([0xff]))).toThrow(/UTF-8/);
    expect(module.decodeFilenameBytes(Buffer.from('\ufffd', 'utf8'))).toBe('\ufffd');
  });

  it('rejects a file swapped to a symlink after traversal', async () => {
    const { root } = await createFixture();
    const outside = await mkdtemp(path.join(os.tmpdir(), 'updog-vendored-outside-'));
    tempRoots.push(outside);
    const victim = path.join(root, '.agents/skills/neon/references/a.md');
    const external = path.join(outside, 'outside.md');
    await writeFile(external, 'first\n');

    const { hashVendoredSkill } = await import(verifier);
    await expect(
      hashVendoredSkill(path.join(root, '.agents/skills/neon'), {
        async afterCollect() {
          await rm(victim);
          await symlink(external, victim);
        },
      })
    ).rejects.toThrow(/symlink|changed/i);
  });

  it('fails an update if the lock changes after it was read', async () => {
    const { root } = await createFixture({
      lockTransform(lock) {
        lock.skills.neon.computedHash = 'f'.repeat(64);
      },
    });
    const lockPath = path.join(root, 'skills-lock.json');
    const replacement = `${await readFile(lockPath, 'utf8')}\n`;
    const { verifyVendoredSkills } = await import(verifier);

    const result = await verifyVendoredSkills({
      repoRoot: root,
      write: true,
      async beforeCommit() {
        await writeFile(lockPath, replacement, 'utf8');
      },
    });

    expect(result.errors).toContain('skills-lock.json changed while the update was running');
    expect(await readFile(lockPath, 'utf8')).toBe(replacement);
  });

  it('reclaims a stale dead-PID update lease', async () => {
    const { root } = await createFixture();
    const leasePath = path.join(root, '.skills-lock.json.update.lock');
    await writeFile(leasePath, '2147483647\n', 'utf8');

    const update = verify(root, '--write');

    expect(update.status, update.stderr).toBe(0);
    await expect(access(leasePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('cleans a dead reclaim marker before acquiring the update lease', async () => {
    const { root } = await createFixture();
    const markerPath = path.join(
      root,
      '.skills-lock.json.update.lock.reclaim.2147483647.aaaaaaaaaaaaaaaa.claim'
    );
    await writeFile(markerPath, '2147483647\n', 'utf8');

    const update = verify(root, '--write');

    expect(update.status, update.stderr).toBe(0);
    await expect(access(markerPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each([
    [
      'live',
      `.skills-lock.json.update.lock.reclaim.${process.pid}.bbbbbbbbbbbbbbbb.claim`,
      '2147483647\n',
    ],
    ['malformed', '.skills-lock.json.update.lock.reclaim.invalid.claim', 'not-a-pid\n'],
  ])('refuses a %s reclaim marker without changing it', async (_kind, markerName, contents) => {
    const { root } = await createFixture();
    const markerPath = path.join(root, markerName);
    await writeFile(markerPath, contents, 'utf8');

    const update = verify(root, '--write');

    expect(update.status).not.toBe(0);
    expect(update.stderr).toContain('skills-lock.json update already in progress');
    expect(await readFile(markerPath, 'utf8')).toBe(contents);
  });

  it('withdraws a provisional writer raced by stale reclaimers before entering the critical section', async () => {
    const { root } = await createFixture();
    const leasePath = path.join(root, '.skills-lock.json.update.lock');
    const firstMarkerPath = path.join(
      root,
      `.skills-lock.json.update.lock.reclaim.${process.pid}.cccccccccccccccc.claim`
    );
    const secondMarkerPath = path.join(
      root,
      `.skills-lock.json.update.lock.reclaim.${process.pid}.dddddddddddddddd.claim`
    );
    await writeFile(leasePath, '2147483647\n', 'utf8');
    const { verifyVendoredSkills } = await import(verifier);

    const raced = await verifyVendoredSkills({
      repoRoot: root,
      write: true,
      async afterLeaseOwnerRecordSynced() {
        await link(leasePath, firstMarkerPath);
        await link(leasePath, secondMarkerPath);
        await rm(leasePath);
      },
      async afterCanonicalLeasePublished() {
        await rm(leasePath);
      },
    });

    expect(raced.errors).toContain('skills-lock.json update already in progress');
    await expect(access(leasePath)).rejects.toMatchObject({ code: 'ENOENT' });
    await rm(firstMarkerPath);
    await rm(secondMarkerPath);

    const eventual = await verifyVendoredSkills({ repoRoot: root, write: true });

    expect(eventual.errors).toEqual([]);
  });

  it('refuses to steal a live-PID update lease', async () => {
    const { root } = await createFixture();
    const leasePath = path.join(root, '.skills-lock.json.update.lock');
    await writeFile(leasePath, `${process.pid}\n`, 'utf8');

    const update = verify(root, '--write');

    expect(update.status).not.toBe(0);
    expect(update.stderr).toContain('skills-lock.json update already in progress');
    expect(await readFile(leasePath, 'utf8')).toBe(`${process.pid}\n`);
  });

  it('refuses malformed update-lease ownership without changing its bytes', async () => {
    const { root } = await createFixture();
    const leasePath = path.join(root, '.skills-lock.json.update.lock');
    const malformed = 'not-a-pid\n';
    await writeFile(leasePath, malformed, 'utf8');

    const update = verify(root, '--write');

    expect(update.status).not.toBe(0);
    expect(update.stderr).toContain('skills-lock.json update already in progress');
    expect(await readFile(leasePath, 'utf8')).toBe(malformed);
  });

  it('publishes no canonical lease before a complete owner record is synced', async () => {
    const { root } = await createFixture();
    const leasePath = path.join(root, '.skills-lock.json.update.lock');
    const { verifyVendoredSkills } = await import(verifier);

    await expect(
      verifyVendoredSkills({
        repoRoot: root,
        write: true,
        async afterLeaseOwnerRecordSynced() {
          await expect(access(leasePath)).rejects.toMatchObject({ code: 'ENOENT' });
          throw new Error('interrupted after lease record sync');
        },
      })
    ).rejects.toThrow('interrupted after lease record sync');

    await expect(access(leasePath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(
      (await readdir(root)).filter((name) => name.startsWith('.skills-lock.json.update.lock.'))
    ).toEqual([]);
  });

  it('serializes canonical writers across final verification and replacement', async () => {
    const { root } = await createFixture({
      lockTransform(lock) {
        lock.skills.neon.computedHash = 'f'.repeat(64);
      },
    });
    const { verifyVendoredSkills } = await import(verifier);
    let announceFinalVerification;
    const finalVerificationReached = new Promise((resolve) => {
      announceFinalVerification = resolve;
    });
    let resumeFirstWriter;
    const firstWriterMayResume = new Promise((resolve) => {
      resumeFirstWriter = resolve;
    });

    const firstWriter = verifyVendoredSkills({
      repoRoot: root,
      write: true,
      async afterFinalVerification() {
        announceFinalVerification();
        await firstWriterMayResume;
      },
    });
    const firstPhase = await Promise.race([
      finalVerificationReached.then(() => 'final-verification'),
      firstWriter.then(() => 'completed'),
    ]);

    expect(firstPhase).toBe('final-verification');
    const secondWriter = await verifyVendoredSkills({ repoRoot: root, write: true });
    expect(secondWriter.errors).toContain('skills-lock.json update already in progress');

    resumeFirstWriter();
    expect((await firstWriter).errors).toEqual([]);
    await expect(access(path.join(root, '.skills-lock.json.update.lock'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('fails closed if the skill tree changes after final verification', async () => {
    const { root } = await createFixture({
      lockTransform(lock) {
        lock.skills.neon.computedHash = 'f'.repeat(64);
      },
    });
    const { verifyVendoredSkills } = await import(verifier);

    const result = await verifyVendoredSkills({
      repoRoot: root,
      write: true,
      async afterFinalVerification() {
        await writeFile(path.join(root, '.agents/skills/neon/SKILL.md'), '# changed before rename\n');
      },
    });

    expect(result.errors).toContain('vendored skill tree changed while publishing the lock');
    await expect(access(path.join(root, '.skills-lock.json.update.lock'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('keeps the original lock intact when atomic replacement fails', async () => {
    const { root } = await createFixture({
      lockTransform(lock) {
        lock.skills.neon.computedHash = 'f'.repeat(64);
      },
    });
    const lockPath = path.join(root, 'skills-lock.json');
    const before = await readFile(lockPath, 'utf8');
    const { verifyVendoredSkills } = await import(verifier);

    await expect(
      verifyVendoredSkills({
        repoRoot: root,
        write: true,
        async beforeAtomicReplace() {
          throw new Error('injected replace failure');
        },
      })
    ).rejects.toThrow('injected replace failure');
    expect(await readFile(lockPath, 'utf8')).toBe(before);
  });

  it('restores the prior lock if vendored inputs drift after publication', async () => {
    const { root } = await createFixture({
      lockTransform(lock) {
        lock.skills.neon.computedHash = 'f'.repeat(64);
      },
    });
    const lockPath = path.join(root, 'skills-lock.json');
    await chmod(lockPath, 0o640);
    const before = await readFile(lockPath);
    const { verifyVendoredSkills } = await import(verifier);

    const result = await verifyVendoredSkills({
      repoRoot: root,
      write: true,
      async afterAtomicReplace() {
        await writeFile(
          path.join(root, '.agents/skills/neon/SKILL.md'),
          '# drifted after publish\n'
        );
      },
    });

    expect(result.errors).toContain('vendored skill tree changed while publishing lock');
    expect(await readFile(lockPath)).toEqual(before);
    expect((await stat(lockPath)).mode & 0o777).toBe(0o640);
    await expect(access(path.join(root, '.skills-lock.json.update.lock'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('preserves lock file permissions across atomic replacement', async () => {
    const { root } = await createFixture({
      lockTransform(lock) {
        lock.skills.neon.computedHash = 'f'.repeat(64);
      },
    });
    const lockPath = path.join(root, 'skills-lock.json');
    await chmod(lockPath, 0o640);

    const update = verify(root, '--write');

    expect(update.status, update.stderr).toBe(0);
    expect((await stat(lockPath)).mode & 0o777).toBe(0o640);
  });

  it('fails an update if a skill tree changes after hashing', async () => {
    const { root } = await createFixture({
      lockTransform(lock) {
        lock.skills.neon.computedHash = 'f'.repeat(64);
      },
    });
    const lockPath = path.join(root, 'skills-lock.json');
    const before = await readFile(lockPath, 'utf8');
    const { verifyVendoredSkills } = await import(verifier);

    const result = await verifyVendoredSkills({
      repoRoot: root,
      write: true,
      async beforeCommit() {
        await writeFile(path.join(root, '.agents/skills/neon/SKILL.md'), '# changed after hash\n');
      },
    });

    expect(result.errors).toContain('vendored skill tree changed while the update was running');
    expect(await readFile(lockPath, 'utf8')).toBe(before);
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
