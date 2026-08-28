#!/usr/bin/env node

import { Buffer } from 'node:buffer';
import console from 'node:console';
import { createHash, randomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { link, lstat, open, readdir, realpath, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { TextDecoder } from 'node:util';
import { fileURLToPath } from 'node:url';

export const HASH_CONTRACT = 'sha256-folder-framed-v2';
const LOCK_FILE = 'skills-lock.json';
const UPDATE_LEASE_FILE = '.skills-lock.json.update.lock';
const UPDATE_LEASE_RECLAIM_PREFIX = `${UPDATE_LEASE_FILE}.reclaim.`;
const VENDORED_ROOT = '.agents/skills';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const U64_MAX = (1n << 64n) - 1n;
const NO_FOLLOW = fsConstants.O_NOFOLLOW ?? 0;
const READ_NO_FOLLOW = fsConstants.O_RDONLY | NO_FOLLOW;
const WRITE_EXCLUSIVE_NO_FOLLOW =
  fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | NO_FOLLOW;
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

function encodeLength(value) {
  const length = BigInt(value);
  if (length < 0n || length > U64_MAX) {
    throw new Error(`length is outside unsigned 64-bit range: ${value}`);
  }
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(length);
  return bytes;
}

function compareBytes(left, right) {
  return Buffer.compare(left, right);
}

export function decodeFilenameBytes(value) {
  try {
    return utf8Decoder.decode(value);
  } catch {
    throw new Error(`filename is not valid UTF-8: ${Buffer.from(value).toString('hex')}`);
  }
}

function normalizedRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\\')) return null;
  if (path.posix.isAbsolute(value) || path.posix.normalize(value) !== value) return null;
  if (value === '..' || value.startsWith('../') || value.includes('/../')) return null;
  return value;
}

function ensureInsideRoot(root, candidate, label) {
  const relative = path.relative(root, candidate);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) return;
  throw new Error(`${label} resolves outside repository root`);
}

function statFingerprint(stat) {
  return [
    stat.dev,
    stat.ino,
    stat.mode,
    stat.nlink,
    stat.size,
    stat.mtimeNs,
    stat.ctimeNs,
  ].map(String).join(':');
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

async function canonicalDirectory(directory, label) {
  const stat = await lstat(directory, { bigint: true });
  if (stat.isSymbolicLink()) throw new Error(`${label} is a symlink`);
  if (!stat.isDirectory()) throw new Error(`${label} is not a directory`);
  return realpath(directory);
}

async function assertSafeDirectoryChain(root, relativeDirectory) {
  const normalized = normalizedRelativePath(relativeDirectory);
  if (!normalized) throw new Error(`path is not normalized POSIX: ${relativeDirectory}`);

  let current = root;
  for (const component of normalized.split('/')) {
    current = path.join(current, component);
    const stat = await lstat(current, { bigint: true });
    if (stat.isSymbolicLink()) throw new Error(`directory is a symlink: ${relativeDirectory}`);
    if (!stat.isDirectory()) throw new Error(`path component is not a directory: ${relativeDirectory}`);
    ensureInsideRoot(root, await realpath(current), relativeDirectory);
  }
}

async function readRegularFileNoFollow(root, relativePath) {
  const normalized = normalizedRelativePath(relativePath);
  if (!normalized) throw new Error(`path is not normalized POSIX: ${relativePath}`);

  const parent = path.posix.dirname(normalized);
  if (parent !== '.') await assertSafeDirectoryChain(root, parent);

  const absolutePath = path.join(root, ...normalized.split('/'));
  const before = await lstat(absolutePath, { bigint: true });
  if (before.isSymbolicLink()) throw new Error(`symlink is not allowed: ${normalized}`);
  if (!before.isFile()) throw new Error(`non-regular file is not allowed: ${normalized}`);
  ensureInsideRoot(root, await realpath(absolutePath), normalized);

  let handle;
  try {
    handle = await open(absolutePath, READ_NO_FOLLOW);
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || !sameIdentity(before, opened)) {
      throw new Error(`file changed while opening: ${normalized}`);
    }

    const bytes = await handle.readFile();
    const afterRead = await handle.stat({ bigint: true });
    if (statFingerprint(opened) !== statFingerprint(afterRead)) {
      throw new Error(`file changed while reading: ${normalized}`);
    }

    const afterPath = await lstat(absolutePath, { bigint: true });
    if (
      afterPath.isSymbolicLink() ||
      !afterPath.isFile() ||
      !sameIdentity(afterRead, afterPath) ||
      statFingerprint(afterRead) !== statFingerprint(afterPath)
    ) {
      throw new Error(`file path changed while reading: ${normalized}`);
    }
    ensureInsideRoot(root, await realpath(absolutePath), normalized);

    return {
      bytes,
      fingerprint: statFingerprint(afterRead),
      mode: Number(afterRead.mode & 0o777n),
    };
  } finally {
    await handle?.close();
  }
}

async function collectFiles(root, relativeDirectory = '') {
  if (relativeDirectory) await assertSafeDirectoryChain(root, relativeDirectory);
  const currentDirectory = relativeDirectory
    ? path.join(root, ...relativeDirectory.split('/'))
    : root;
  const entries = await readdir(currentDirectory, { encoding: 'buffer', withFileTypes: true });
  entries.sort((left, right) => compareBytes(left.name, right.name));
  const files = [];

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name);
    const name = decodeFilenameBytes(nameBytes);
    const relativePath = relativeDirectory ? `${relativeDirectory}/${name}` : name;
    if (!normalizedRelativePath(relativePath)) {
      throw new Error(`path is not normalized POSIX: ${relativePath}`);
    }
    if (entry.isSymbolicLink()) {
      throw new Error(`symlink is not allowed: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(root, relativePath)));
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`non-regular file is not allowed: ${relativePath}`);
    }
    files.push({ pathBytes: Buffer.from(relativePath, 'utf8'), relativePath });
  }

  return files.sort((left, right) => compareBytes(left.pathBytes, right.pathBytes));
}

async function hashVendoredSkillOnce(root, options = {}) {
  const files = await collectFiles(root);
  await options.afterCollect?.();

  const hash = createHash('sha256');
  hash.update('updog/vendored-skill-folder/sha256-folder-framed-v2\0');
  hash.update(encodeLength(files.length));
  const fingerprints = [];

  for (const file of files) {
    const { bytes, fingerprint } = await readRegularFileNoFollow(root, file.relativePath);
    hash.update(encodeLength(file.pathBytes.length));
    hash.update(file.pathBytes);
    hash.update(encodeLength(bytes.length));
    hash.update(bytes);
    fingerprints.push(`${file.relativePath}\0${fingerprint}`);
  }

  return {
    files: files.map((file) => file.relativePath),
    fingerprints,
    hash: hash.digest('hex'),
  };
}

export async function hashVendoredSkill(directory, options = {}) {
  const root = await canonicalDirectory(directory, 'vendored skill directory');
  const first = await hashVendoredSkillOnce(root, options);
  const second = await hashVendoredSkillOnce(root);
  if (
    first.hash !== second.hash ||
    JSON.stringify(first.files) !== JSON.stringify(second.files) ||
    JSON.stringify(first.fingerprints) !== JSON.stringify(second.fingerprints)
  ) {
    throw new Error('vendored skill tree changed while hashing');
  }
  return { files: first.files, hash: first.hash };
}

async function readLock(repoRoot) {
  let file;
  try {
    file = await readRegularFileNoFollow(repoRoot, LOCK_FILE);
  } catch (error) {
    throw new Error(`cannot read ${LOCK_FILE}: ${error.message}`);
  }

  let contents;
  try {
    contents = utf8Decoder.decode(file.bytes);
  } catch {
    throw new Error(`${LOCK_FILE} is not valid UTF-8`);
  }

  try {
    assertNoDuplicateJsonKeys(contents);
    const lock = JSON.parse(contents);
    return {
      contents: file.bytes,
      fingerprint: file.fingerprint,
      lock,
      mode: file.mode,
      lockPath: path.join(repoRoot, LOCK_FILE),
    };
  } catch (error) {
    throw new Error(`${LOCK_FILE} is not valid JSON: ${error.message}`);
  }
}

function assertNoDuplicateJsonKeys(contents) {
  const stack = [{ type: 'root', keys: new Set(), awaitingKey: false, path: '<root>' }];
  let index = 0;

  const parseString = () => {
    const start = index;
    index += 1;
    while (index < contents.length) {
      const char = contents[index];
      if (char === '\\') {
        index += 2;
      } else if (char === '"') {
        index += 1;
        return contents.slice(start, index);
      } else {
        index += 1;
      }
    }
    throw new Error('unterminated JSON string');
  };

  const skipWhitespace = () => {
    while (/[\t\n\r ]/.test(contents[index] ?? '')) index += 1;
  };

  const expect = (char) => {
    skipWhitespace();
    if (contents[index] !== char) throw new Error(`expected ${char} at JSON offset ${index}`);
    index += 1;
  };

  const parseValue = () => {
    skipWhitespace();
    const char = contents[index];
    if (char === '{') {
      index += 1;
      const top = stack.at(-1);
      const objectPath = top.type === 'object' ? `${top.path}.${top.currentKey}` : top.path;
      stack.push({ type: 'object', keys: new Set(), awaitingKey: true, path: objectPath });
      parseObjectValue();
      return;
    }
    if (char === '[') {
      index += 1;
      stack.push({ type: 'array' });
      parseArrayValue();
      return;
    }
    if (char === '"') {
      parseString();
      return;
    }
    if (char === 't') {
      if (contents.slice(index, index + 4) !== 'true')
        throw new Error(`invalid JSON at offset ${index}`);
      index += 4;
      return;
    }
    if (char === 'f') {
      if (contents.slice(index, index + 5) !== 'false')
        throw new Error(`invalid JSON at offset ${index}`);
      index += 5;
      return;
    }
    if (char === 'n') {
      if (contents.slice(index, index + 4) !== 'null')
        throw new Error(`invalid JSON at offset ${index}`);
      index += 4;
      return;
    }
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(contents.slice(index));
    if (!match) throw new Error(`invalid JSON at offset ${index}`);
    index += match[0].length;
  };

  const parseObjectValue = () => {
    const object = stack.at(-1);
    skipWhitespace();
    if (contents[index] === '}') {
      index += 1;
      stack.pop();
      return;
    }
    for (;;) {
      skipWhitespace();
      if (contents[index] !== '"') throw new Error(`expected object key at JSON offset ${index}`);
      const key = JSON.parse(parseString());
      if (object.keys.has(key)) {
        throw new Error(`${LOCK_FILE} contains duplicate JSON key '${key}' at ${object.path}`);
      }
      object.keys.add(key);
      object.currentKey = key;
      expect(':');
      parseValue();
      skipWhitespace();
      if (contents[index] === '}') {
        index += 1;
        stack.pop();
        return;
      }
      expect(',');
    }
  };

  const parseArrayValue = () => {
    skipWhitespace();
    if (contents[index] === ']') {
      index += 1;
      stack.pop();
      return;
    }
    for (;;) {
      parseValue();
      skipWhitespace();
      if (contents[index] === ']') {
        index += 1;
        stack.pop();
        return;
      }
      expect(',');
    }
  };

  parseValue();
  skipWhitespace();
  if (index !== contents.length || stack.length !== 1) {
    throw new Error(`${LOCK_FILE} contains trailing or malformed JSON`);
  }
}

async function inspectVendoredDirectories(repoRoot, errors) {
  try {
    await assertSafeDirectoryChain(repoRoot, VENDORED_ROOT);
  } catch (error) {
    errors.push(`cannot read ${VENDORED_ROOT}: ${error.message}`);
    return [];
  }

  const root = path.join(repoRoot, ...VENDORED_ROOT.split('/'));
  let entries;
  try {
    entries = await readdir(root, { encoding: 'buffer', withFileTypes: true });
  } catch (error) {
    errors.push(`cannot read ${VENDORED_ROOT}: ${error.message}`);
    return [];
  }

  entries.sort((left, right) => compareBytes(left.name, right.name));
  const directories = [];
  for (const entry of entries) {
    let name;
    try {
      name = decodeFilenameBytes(entry.name);
    } catch (error) {
      errors.push(`${VENDORED_ROOT}: ${error.message}`);
      continue;
    }
    const localPath = `${VENDORED_ROOT}/${name}`;
    if (entry.isSymbolicLink()) {
      errors.push(`vendored skill path is a symlink: ${localPath}`);
    } else if (entry.isDirectory()) {
      try {
        await assertSafeDirectoryChain(repoRoot, localPath);
        directories.push(localPath);
      } catch (error) {
        errors.push(`${localPath}: ${error.message}`);
      }
    } else {
      errors.push(`unexpected non-directory entry under ${VENDORED_ROOT}: ${localPath}`);
    }
  }
  return directories;
}

function validateLockShape(lock, errors) {
  if (!lock || typeof lock !== 'object' || Array.isArray(lock)) {
    errors.push(`${LOCK_FILE}: root must be an object`);
    return false;
  }
  if (lock.version !== 1) errors.push(`${LOCK_FILE}: version must be 1`);
  if (lock.hashContract !== HASH_CONTRACT) {
    errors.push(`${LOCK_FILE}: hashContract must be ${HASH_CONTRACT}`);
  }
  if (!lock.skills || typeof lock.skills !== 'object' || Array.isArray(lock.skills)) {
    errors.push(`${LOCK_FILE}: skills must be an object`);
    return false;
  }
  return true;
}

function validateEntry(name, entry, seenLocalPaths, errors) {
  if (!SKILL_NAME_PATTERN.test(name)) {
    errors.push(`${name}: invalid skill name`);
    return null;
  }
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    errors.push(`${name}: lock entry must be an object`);
    return null;
  }

  for (const field of ['source', 'sourceType', 'skillPath']) {
    if (typeof entry[field] !== 'string' || entry[field].length === 0) {
      errors.push(`${name}: ${field} must be a non-empty string`);
    }
  }

  const expectedLocalPath = `${VENDORED_ROOT}/${name}`;
  const localPath = normalizedRelativePath(entry.localPath);
  if (!localPath) {
    errors.push(`${name}: localPath must be a normalized relative POSIX path`);
  } else if (localPath !== expectedLocalPath) {
    errors.push(`${name}: localPath must be ${expectedLocalPath}`);
  } else if (seenLocalPaths.has(localPath)) {
    errors.push(`${name}: duplicate localPath ${localPath}`);
  } else {
    seenLocalPaths.add(localPath);
  }

  if (!SHA256_PATTERN.test(entry.computedHash ?? '')) {
    errors.push(`${name}: computedHash must be 64 lowercase hexadecimal characters`);
  }

  return localPath;
}

async function assertInputsUnchanged({ computed, lockSnapshot, repoRoot, skillNames }) {
  let currentLock;
  try {
    currentLock = await readLock(repoRoot);
  } catch {
    return [`${LOCK_FILE} changed while the update was running`];
  }
  if (
    !currentLock.contents.equals(lockSnapshot.contents) ||
    currentLock.fingerprint !== lockSnapshot.fingerprint
  ) {
    return [`${LOCK_FILE} changed while the update was running`];
  }

  return assertVendoredInputsUnchanged({ computed, repoRoot, skillNames });
}

async function assertVendoredInputsUnchanged({ computed, repoRoot, skillNames }) {
  const errors = [];
  const directories = await inspectVendoredDirectories(repoRoot, errors);
  const expectedDirectories = skillNames.map((name) => `${VENDORED_ROOT}/${name}`).sort();
  if (JSON.stringify(directories) !== JSON.stringify(expectedDirectories)) {
    errors.push('vendored skill tree changed while the update was running');
    return errors;
  }

  for (const name of skillNames) {
    const expected = computed.get(name);
    try {
      const result = await hashVendoredSkill(path.join(repoRoot, VENDORED_ROOT, name));
      if (!expected || expected.hash !== result.hash || expected.filesJson !== JSON.stringify(result.files)) {
        errors.push('vendored skill tree changed while the update was running');
        break;
      }
    } catch {
      errors.push('vendored skill tree changed while the update was running');
      break;
    }
  }
  return errors;
}

async function writeLockAtomically({
  contents,
  lockPath,
  mode,
  options,
  restoreContents,
  verifyPublished,
  verifyUnchanged,
}) {
  const directory = path.dirname(lockPath);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(lockPath)}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`
  );
  let handle;
  try {
    handle = await open(temporaryPath, WRITE_EXCLUSIVE_NO_FOLLOW, 0o600);
    await handle.chmod(mode);
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;

    await options.beforeAtomicReplace?.();
    const errors = await verifyUnchanged();
    if (errors.length > 0) return errors;

    await options.afterFinalVerification?.();
    const publishErrors = await verifyUnchanged();
    if (publishErrors.length > 0) {
      return publishErrors.map((error) =>
        error.includes('vendored skill tree changed')
          ? 'vendored skill tree changed while publishing the lock'
          : error
      );
    }

    await rename(temporaryPath, lockPath);
    let directoryHandle;
    try {
      directoryHandle = await open(directory, fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0));
      await directoryHandle.sync();
    } finally {
      await directoryHandle?.close();
    }

    await options.afterAtomicReplace?.();
    const postPublicationErrors = await verifyPublished();
    if (postPublicationErrors.length > 0) {
      const restoreErrors = await restoreLockAtomically({
        contents: restoreContents,
        lockPath,
        mode,
      });
      return [
        ...postPublicationErrors.map((error) =>
          error.includes('vendored skill tree changed')
            ? 'vendored skill tree changed while publishing lock'
            : error
        ),
        ...restoreErrors,
      ];
    }
    return [];
  } finally {
    await handle?.close();
    await rm(temporaryPath, { force: true });
  }
}

async function restoreLockAtomically({ contents, lockPath, mode }) {
  const directory = path.dirname(lockPath);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(lockPath)}.${process.pid}.${randomBytes(8).toString('hex')}.restore.tmp`
  );
  let handle;
  try {
    handle = await open(temporaryPath, WRITE_EXCLUSIVE_NO_FOLLOW, 0o600);
    await handle.chmod(mode);
    await handle.writeFile(contents);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, lockPath);
    let directoryHandle;
    try {
      directoryHandle = await open(
        directory,
        fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0)
      );
      await directoryHandle.sync();
    } finally {
      await directoryHandle?.close();
    }
    return [];
  } catch (error) {
    return [`failed to restore ${LOCK_FILE}: ${error.message}`];
  } finally {
    await handle?.close();
    await rm(temporaryPath, { force: true });
  }
}

async function acquireUpdateLease(repoRoot, options) {
  const leasePath = path.join(repoRoot, UPDATE_LEASE_FILE);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!(await scanReclaimMarkers(repoRoot))) return null;
    const temporaryPath = path.join(
      repoRoot,
      `${UPDATE_LEASE_FILE}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`
    );
    let handle;
    let published = false;
    let ownerSnapshot;
    try {
      handle = await open(temporaryPath, WRITE_EXCLUSIVE_NO_FOLLOW, 0o600);
      await handle.writeFile(`${process.pid}\n`, 'utf8');
      await handle.sync();
      await options.afterLeaseOwnerRecordSynced?.();
      ownerSnapshot = await readLeaseSnapshot(temporaryPath);
      await link(temporaryPath, leasePath);
      published = true;
      let directoryHandle;
      try {
        directoryHandle = await open(
          repoRoot,
          fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0)
        );
        await directoryHandle.sync();
      } finally {
        await directoryHandle?.close();
      }
      await options.afterCanonicalLeasePublished?.();
      const markersClear = await scanReclaimMarkers(repoRoot);
      const canonicalStillOwned = await leaseMatchesSnapshot(leasePath, ownerSnapshot);
      if (!markersClear || !canonicalStillOwned) {
        await removeLeaseIfStillSame(leasePath, ownerSnapshot);
        return null;
      }
      await handle.close();
      handle = undefined;

      return async () => {
        await removeLeaseIfStillSame(leasePath, ownerSnapshot);
      };
    } catch (error) {
      await handle?.close();
      handle = undefined;
      if (!published && error.code === 'EEXIST' && (await reclaimStaleUpdateLease(repoRoot, leasePath, options))) {
        continue;
      }
      if (!published && error.code === 'EEXIST') return null;
      if (published && ownerSnapshot) {
        await removeLeaseIfStillSame(leasePath, ownerSnapshot);
      }
      throw error;
    } finally {
      await handle?.close();
      await rm(temporaryPath, { force: true });
    }
  }
  return null;
}

function immutableLeaseFingerprint(stat) {
  return [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeNs].map(String).join(':');
}

function updateLeaseContentsHash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function readLeaseSnapshot(leasePath) {
  const before = await lstat(leasePath, { bigint: true });
  if (before.isSymbolicLink() || !before.isFile()) {
    throw new Error('lease is not a regular file');
  }

  let handle;
  try {
    handle = await open(leasePath, READ_NO_FOLLOW);
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || !sameIdentity(before, opened)) {
      throw new Error('lease changed while opening');
    }
    const bytes = await handle.readFile();
    const afterRead = await handle.stat({ bigint: true });
    if (immutableLeaseFingerprint(opened) !== immutableLeaseFingerprint(afterRead)) {
      throw new Error('lease changed while reading');
    }
    const afterPath = await lstat(leasePath, { bigint: true });
    if (
      afterPath.isSymbolicLink() ||
      !afterPath.isFile() ||
      !sameIdentity(afterRead, afterPath) ||
      immutableLeaseFingerprint(afterRead) !== immutableLeaseFingerprint(afterPath)
    ) {
      throw new Error('lease path changed while reading');
    }
    return {
      bytes,
      contentsHash: updateLeaseContentsHash(bytes),
      immutableFingerprint: immutableLeaseFingerprint(afterRead),
      stat: afterRead,
    };
  } finally {
    await handle?.close();
  }
}

async function leaseMatchesSnapshot(leasePath, expected) {
  try {
    const current = await readLeaseSnapshot(leasePath);
    return (
      sameIdentity(expected.stat, current.stat) &&
      expected.immutableFingerprint === current.immutableFingerprint &&
      expected.contentsHash === current.contentsHash
    );
  } catch {
    return false;
  }
}

async function removeLeaseIfStillSame(leasePath, expected) {
  if (!(await leaseMatchesSnapshot(leasePath, expected))) return false;
  try {
    await rm(leasePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function parseUpdateLeasePid(contents) {
  if (!/^[1-9]\d*\n$/.test(contents)) return null;
  const pid = Number(contents.slice(0, -1));
  return Number.isSafeInteger(pid) ? pid : null;
}

function parseReclaimMarkerName(name) {
  const pattern = /^\.skills-lock\.json\.update\.lock\.reclaim\.([1-9]\d*)\.([a-f0-9]{16})\.claim$/;
  const match = pattern.exec(name);
  if (!match) return null;
  const reclaimerPid = Number(match[1]);
  return Number.isSafeInteger(reclaimerPid) ? reclaimerPid : null;
}

function isLiveProcess(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}

async function scanReclaimMarkers(repoRoot) {
  let markerNames;
  try {
    markerNames = (await readdir(repoRoot)).filter((name) => name.startsWith(UPDATE_LEASE_RECLAIM_PREFIX));
  } catch (error) {
    return false;
  }

  for (const markerName of markerNames) {
    const reclaimerPid = parseReclaimMarkerName(markerName);
    if (reclaimerPid === null || isLiveProcess(reclaimerPid)) return false;
    const markerPath = path.join(repoRoot, markerName);
    let markerSnapshot;
    try {
      markerSnapshot = await readLeaseSnapshot(markerPath);
    } catch {
      return false;
    }
    if (parseUpdateLeasePid(markerSnapshot.bytes.toString('utf8')) === null) return false;
    if (!(await removeLeaseIfStillSame(markerPath, markerSnapshot))) return false;
  }
  return true;
}

async function reclaimStaleUpdateLease(repoRoot, leasePath, options) {
  if (!(await scanReclaimMarkers(repoRoot))) return false;
  let staleSnapshot;
  try {
    staleSnapshot = await readLeaseSnapshot(leasePath);
  } catch (error) {
    return error.code === 'ENOENT';
  }
  const pid = parseUpdateLeasePid(staleSnapshot.bytes.toString('utf8'));
  if (pid === null || isLiveProcess(pid)) return false;

  const markerPath = path.join(
    repoRoot,
    `${UPDATE_LEASE_RECLAIM_PREFIX}${process.pid}.${randomBytes(8).toString('hex')}.claim`
  );
  let markerCreated = false;
  try {
    await link(leasePath, markerPath);
    markerCreated = true;
    const markerSnapshot = await readLeaseSnapshot(markerPath);
    if (
      !sameIdentity(staleSnapshot.stat, markerSnapshot.stat) ||
      staleSnapshot.immutableFingerprint !== markerSnapshot.immutableFingerprint ||
      staleSnapshot.contentsHash !== markerSnapshot.contentsHash
    ) {
      return false;
    }
    if (!(await leaseMatchesSnapshot(leasePath, staleSnapshot))) return false;
    return removeLeaseIfStillSame(leasePath, staleSnapshot);
  } catch (error) {
    if (error.code === 'ENOENT') return true;
    return false;
  } finally {
    if (markerCreated) await rm(markerPath, { force: true });
  }
}

async function verifyVendoredSkillsWithRoot(options, repoRoot, write) {
  const errors = [];
  const lockSnapshot = await readLock(repoRoot);
  const { lock } = lockSnapshot;
  const hasValidShape = validateLockShape(lock, errors);
  const vendoredDirectories = await inspectVendoredDirectories(repoRoot, errors);
  if (!hasValidShape) return { errors, updated: 0, verified: 0 };

  const seenLocalPaths = new Set();
  const computed = new Map();
  const skillNames = Object.keys(lock.skills).sort((left, right) =>
    compareBytes(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
  );

  for (const name of skillNames) {
    const entry = lock.skills[name];
    const localPath = validateEntry(name, entry, seenLocalPaths, errors);
    if (!localPath) continue;

    try {
      const result = await hashVendoredSkill(path.join(repoRoot, ...localPath.split('/')));
      if (result.files.length === 0) {
        errors.push(`${name}: vendored skill directory is empty: ${localPath}`);
        continue;
      }
      computed.set(name, { filesJson: JSON.stringify(result.files), hash: result.hash });
      if (!write && entry.computedHash !== result.hash) {
        errors.push(
          `${name}: hash mismatch; expected ${entry.computedHash}, actual ${result.hash}`
        );
      }
    } catch (error) {
      errors.push(`${name}: cannot hash ${localPath}: ${error.message}`);
    }
  }

  for (const localPath of vendoredDirectories) {
    if (!seenLocalPaths.has(localPath)) {
      errors.push(`unlocked vendored skill directory: ${localPath}`);
    }
  }

  if (!write) return { errors, updated: 0, verified: computed.size };
  if (errors.length > 0) return { errors, updated: 0, verified: computed.size };

  const nextLock = structuredClone(lock);
  let updated = 0;
  for (const name of skillNames) {
    const nextHash = computed.get(name)?.hash;
    if (nextHash && nextLock.skills[name].computedHash !== nextHash) {
      nextLock.skills[name].computedHash = nextHash;
      updated += 1;
    }
  }
  if (updated === 0) return { errors: [], updated, verified: computed.size };

  await options.beforeCommit?.();
  const verifyUnchanged = () =>
    assertInputsUnchanged({ computed, lockSnapshot, repoRoot, skillNames });
  const verifyPublished = () => assertVendoredInputsUnchanged({ computed, repoRoot, skillNames });
  const stabilityErrors = await verifyUnchanged();
  if (stabilityErrors.length > 0) {
    return { errors: stabilityErrors, updated: 0, verified: computed.size };
  }

  const writeErrors = await writeLockAtomically({
    contents: `${JSON.stringify(nextLock, null, 2)}\n`,
    lockPath: lockSnapshot.lockPath,
    mode: lockSnapshot.mode,
    options,
    restoreContents: lockSnapshot.contents,
    verifyPublished,
    verifyUnchanged,
  });
  if (writeErrors.length > 0) {
    return { errors: writeErrors, updated: 0, verified: computed.size };
  }
  return { errors: [], updated, verified: computed.size };
}

export async function verifyVendoredSkills(options) {
  const write = options.write ?? false;
  const repoRoot = await canonicalDirectory(options.repoRoot, 'repository root');
  if (!write) return verifyVendoredSkillsWithRoot(options, repoRoot, false);

  const releaseLease = await acquireUpdateLease(repoRoot, options);
  if (!releaseLease) {
    return {
      errors: [`${LOCK_FILE} update already in progress`],
      updated: 0,
      verified: 0,
    };
  }

  try {
    return await verifyVendoredSkillsWithRoot(options, repoRoot, true);
  } finally {
    await releaseLease();
  }
}

function parseArgs(argv) {
  let repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let write = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--write') {
      write = true;
    } else if (argument === '--root') {
      const value = argv[index + 1];
      if (!value) throw new Error('--root requires a path');
      repoRoot = path.resolve(value);
      index += 1;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }

  return { repoRoot, write };
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await verifyVendoredSkills(options);

    if (result.errors.length > 0) {
      console.error('FAIL: vendored skill lock verification failed');
      for (const error of result.errors) console.error(`  - ${error}`);
      return 1;
    }

    if (options.write) {
      const noun = result.updated === 1 ? 'hash' : 'hashes';
      console.log(`Updated ${result.updated} vendored skill ${noun} in ${LOCK_FILE}`);
      return 0;
    }

    const noun = result.verified === 1 ? 'entry' : 'entries';
    console.log(`PASS: ${result.verified} vendored skill lock ${noun} verified`);
    return 0;
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    return 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const exitCode = await main();
  process.exitCode = exitCode;
}
