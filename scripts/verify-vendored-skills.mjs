#!/usr/bin/env node

import { Buffer } from 'node:buffer';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const HASH_CONTRACT = 'sha256-folder-v1';
const LOCK_FILE = 'skills-lock.json';
const VENDORED_ROOT = '.agents/skills';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function normalizedRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\\')) return null;
  if (path.posix.isAbsolute(value) || path.posix.normalize(value) !== value) return null;
  if (value === '..' || value.startsWith('../') || value.includes('/../')) return null;
  return value;
}

async function collectFiles(directory, relativeDirectory = '') {
  const currentDirectory = relativeDirectory
    ? path.join(directory, ...relativeDirectory.split('/'))
    : directory;
  const entries = await readdir(currentDirectory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
    if (!normalizedRelativePath(relativePath)) {
      throw new Error(`path is not normalized POSIX: ${relativePath}`);
    }
    if (entry.isSymbolicLink()) {
      throw new Error(`symlink is not allowed: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(directory, relativePath)));
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`non-regular file is not allowed: ${relativePath}`);
    }
    files.push(relativePath);
  }

  return files.sort(compareUtf8);
}

export async function hashVendoredSkill(directory) {
  const files = await collectFiles(directory);
  const hash = createHash('sha256');

  for (const relativePath of files) {
    const bytes = await readFile(path.join(directory, ...relativePath.split('/')));
    hash.update(Buffer.from(relativePath, 'utf8'));
    hash.update(bytes);
  }

  return { files, hash: hash.digest('hex') };
}

async function readLock(repoRoot) {
  const lockPath = path.join(repoRoot, LOCK_FILE);
  let contents;
  try {
    contents = await readFile(lockPath, 'utf8');
  } catch (error) {
    throw new Error(`cannot read ${LOCK_FILE}: ${error.message}`);
  }

  try {
    return { lock: JSON.parse(contents), lockPath };
  } catch (error) {
    throw new Error(`${LOCK_FILE} is not valid JSON: ${error.message}`);
  }
}

async function inspectVendoredDirectories(repoRoot, errors) {
  const root = path.join(repoRoot, VENDORED_ROOT);
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    errors.push(`cannot read ${VENDORED_ROOT}: ${error.message}`);
    return [];
  }

  const directories = [];
  for (const entry of entries.sort((left, right) => compareUtf8(left.name, right.name))) {
    const localPath = `${VENDORED_ROOT}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      errors.push(`vendored skill path is a symlink: ${localPath}`);
    } else if (entry.isDirectory()) {
      directories.push(localPath);
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

export async function verifyVendoredSkills({ repoRoot, write = false }) {
  const errors = [];
  const { lock, lockPath } = await readLock(repoRoot);
  const hasValidShape = validateLockShape(lock, errors);
  const vendoredDirectories = await inspectVendoredDirectories(repoRoot, errors);
  if (!hasValidShape) return { errors, updated: 0, verified: 0 };

  const seenLocalPaths = new Set();
  const computed = new Map();
  const skillNames = Object.keys(lock.skills).sort(compareUtf8);

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
      computed.set(name, result.hash);
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

  if (write) {
    const structuralErrors = errors.filter((error) => !error.includes('computedHash must be'));
    if (structuralErrors.length > 0) return { errors, updated: 0, verified: computed.size };

    let updated = 0;
    for (const name of skillNames) {
      const nextHash = computed.get(name);
      if (nextHash && lock.skills[name].computedHash !== nextHash) {
        lock.skills[name].computedHash = nextHash;
        updated += 1;
      }
    }
    await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
    return { errors: [], updated, verified: computed.size };
  }

  return { errors, updated: 0, verified: computed.size };
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
