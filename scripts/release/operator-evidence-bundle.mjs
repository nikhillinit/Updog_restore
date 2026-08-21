import console from 'node:console';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { lstat, mkdir, open, readFile, rm, chmod } from 'node:fs/promises';
import { TextDecoder } from 'node:util';
import path from 'node:path';
import process from 'node:process';

import { z } from 'zod';

export const OPERATOR_EVIDENCE_FIELDS = Object.freeze([
  'fundHealth',
  'fundReady',
  'capitalHealth',
  'capitalReady',
]);
export const MAX_OPERATOR_EVIDENCE_B64_CHARS = 60_000;

const MAX_SOURCE_FILE_BYTES = 12_000;
const MAX_AGGREGATE_BYTES = 44_000;
const MAX_OBJECT_DEPTH = 4;
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const DEPLOYMENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const ASCII_WHITESPACE_PATTERN = /[\t\n\f\r ]/g;
const SECRET_KEY_PATTERN =
  /(?:authorization|cookie|password|passwd|secret|token|api[-_]?key|database[-_]?url|redis[-_]?url|connection[-_]?string)/i;
const SECRET_VALUE_PATTERNS = [
  /\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]+/i,
  /\b(?:postgres(?:ql)?|redis):\/\/[^\s"'<>]+/i,
  /[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/\s@]*@/i,
  /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----/i,
  /\b(?:gh[pousr]|github_pat)_[A-Za-z0-9_]*\b/i,
];

const ISO_TIMESTAMP = z.string().datetime({ offset: true });
const SAFE_NONNEGATIVE_INTEGER = z
  .number()
  .finite()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
const SAFE_NONNEGATIVE_FINITE = z
  .number()
  .finite()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
const COMMIT = z.string().regex(SHA_PATTERN);
const DEPLOYMENT_ID = z.string().regex(DEPLOYMENT_ID_PATTERN);
const VERSION = z.string().min(1).max(64);

const FUND_WORKER_HEALTH = z
  .object({
    name: z.literal('fund-scenario-calc'),
    status: z.literal('healthy'),
    isRunning: z.literal(true),
    jobsProcessed: SAFE_NONNEGATIVE_INTEGER,
    lastJobTime: ISO_TIMESTAMP.optional(),
  })
  .strict();

const CAPITAL_WORKER_HEALTH = z
  .object({
    name: z.literal('capital-call-status'),
    status: z.literal('healthy'),
    isRunning: z.literal(true),
    jobsProcessed: SAFE_NONNEGATIVE_INTEGER,
    lastJobTime: ISO_TIMESTAMP.optional(),
    exhaustedOutboxCount: SAFE_NONNEGATIVE_INTEGER.optional(),
  })
  .strict();

const FUND_HEALTH = z
  .object({
    status: z.literal('healthy'),
    timestamp: ISO_TIMESTAMP,
    uptime: SAFE_NONNEGATIVE_FINITE,
    version: VERSION,
    commit: COMMIT,
    environment: z.literal('production'),
    workerType: z.literal('fund-scenario-calc'),
    deploymentId: DEPLOYMENT_ID,
    workers: z.array(FUND_WORKER_HEALTH).length(1),
    metrics: z
      .object({
        totalJobsProcessed: SAFE_NONNEGATIVE_INTEGER,
        totalErrors: SAFE_NONNEGATIVE_INTEGER,
      })
      .strict(),
  })
  .strict();

const CAPITAL_HEALTH = z
  .object({
    status: z.literal('healthy'),
    timestamp: ISO_TIMESTAMP,
    uptime: SAFE_NONNEGATIVE_FINITE,
    version: VERSION,
    commit: COMMIT,
    environment: z.literal('production'),
    workerType: z.literal('capital-call-status'),
    deploymentId: DEPLOYMENT_ID,
    workers: z.array(CAPITAL_WORKER_HEALTH).length(1),
    metrics: z
      .object({
        totalJobsProcessed: SAFE_NONNEGATIVE_INTEGER,
        totalErrors: SAFE_NONNEGATIVE_INTEGER,
      })
      .strict(),
  })
  .strict();

const FUND_READY = z
  .object({
    status: z.literal('ready'),
    timestamp: ISO_TIMESTAMP,
    workerType: z.literal('fund-scenario-calc'),
    commit: COMMIT,
    deploymentId: DEPLOYMENT_ID,
  })
  .strict();

const CAPITAL_READY = z
  .object({
    status: z.literal('ready'),
    timestamp: ISO_TIMESTAMP,
    workerType: z.literal('capital-call-status'),
    commit: COMMIT,
    deploymentId: DEPLOYMENT_ID,
  })
  .strict();

const BUNDLE = z
  .object({
    fundHealth: FUND_HEALTH,
    fundReady: FUND_READY,
    capitalHealth: CAPITAL_HEALTH,
    capitalReady: CAPITAL_READY,
  })
  .strict();

function reject() {
  throw new Error('Operator evidence rejected');
}

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function inspectUntrustedValue(value, depth = 0, ancestors = new Set()) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) reject();
    return;
  }
  if (typeof value === 'string') {
    if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) reject();
    return;
  }
  if (value === null || typeof value === 'boolean') return;
  if (typeof value !== 'object' || depth > MAX_OBJECT_DEPTH) reject();
  if (ancestors.has(value)) reject();
  ancestors.add(value);

  if (Array.isArray(value)) {
    for (const entry of value) inspectUntrustedValue(entry, depth + 1, ancestors);
  } else if (isPlainRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (SECRET_KEY_PATTERN.test(key)) reject();
      inspectUntrustedValue(entry, depth + 1, ancestors);
    }
  } else {
    reject();
  }

  ancestors.delete(value);
}

function validateBundle(input) {
  inspectUntrustedValue(input);
  const parsed = BUNDLE.safeParse(input);
  if (!parsed.success) reject();

  const { fundHealth, fundReady, capitalHealth, capitalReady } = parsed.data;
  if (
    fundHealth.commit !== fundReady.commit ||
    capitalHealth.commit !== capitalReady.commit ||
    fundHealth.commit !== capitalHealth.commit ||
    fundHealth.deploymentId !== fundReady.deploymentId ||
    capitalHealth.deploymentId !== capitalReady.deploymentId ||
    fundHealth.deploymentId === capitalHealth.deploymentId
  ) {
    reject();
  }

  return parsed.data;
}

function serializeNormalizedBundle(input) {
  const normalized = validateBundle(input);
  let serialized;
  try {
    serialized = JSON.stringify(normalized);
  } catch {
    reject();
  }
  if (typeof serialized !== 'string') reject();
  const bytes = Buffer.byteLength(serialized, 'utf8');
  if (bytes > MAX_AGGREGATE_BYTES) reject();
  return { normalized, serialized };
}

function sourceInputWithinLimit(input) {
  let source;
  try {
    source = JSON.stringify(input);
  } catch {
    reject();
  }
  if (typeof source !== 'string' || Buffer.byteLength(source, 'utf8') > MAX_AGGREGATE_BYTES) {
    reject();
  }
}

function decodeUtf8(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    reject();
  }
}

function parseJsonBytes(bytes) {
  const text = decodeUtf8(bytes);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    reject();
  }
  return parsed;
}

function decodeCanonicalBase64(encoded) {
  if (typeof encoded !== 'string') reject();
  const compact = encoded.replace(ASCII_WHITESPACE_PATTERN, '');
  if (
    compact.length === 0 ||
    compact.length > MAX_OPERATOR_EVIDENCE_B64_CHARS ||
    compact.length % 4 !== 0 ||
    !BASE64_PATTERN.test(compact)
  ) {
    reject();
  }

  let bytes;
  try {
    bytes = Buffer.from(compact, 'base64');
  } catch {
    reject();
  }
  if (bytes.length > MAX_AGGREGATE_BYTES || bytes.toString('base64') !== compact) reject();
  return bytes;
}

export function encodeOperatorEvidenceBundle(input) {
  sourceInputWithinLimit(input);
  const { serialized } = serializeNormalizedBundle(input);
  const encoded = Buffer.from(serialized, 'utf8').toString('base64');
  if (encoded.length > MAX_OPERATOR_EVIDENCE_B64_CHARS) reject();
  return encoded;
}

export function decodeOperatorEvidenceBundle(encoded) {
  const bytes = decodeCanonicalBase64(encoded);
  const parsed = parseJsonBytes(bytes);
  const { normalized } = serializeNormalizedBundle(parsed);
  return normalized;
}

const INPUT_FILES = Object.freeze([
  ['fundHealth', 'fund-health.json'],
  ['fundReady', 'fund-ready.json'],
  ['capitalHealth', 'capital-health.json'],
  ['capitalReady', 'capital-ready.json'],
]);

async function readEvidenceFiles(paths) {
  const stats = [];
  for (const filePath of paths) {
    try {
      const fileStat = await lstat(filePath);
      if (!fileStat.isFile() || fileStat.isSymbolicLink() || fileStat.size > MAX_SOURCE_FILE_BYTES) {
        reject();
      }
      stats.push(fileStat);
    } catch {
      reject();
    }
  }
  if (stats.reduce((total, fileStat) => total + fileStat.size, 0) > MAX_AGGREGATE_BYTES) {
    reject();
  }

  const values = [];
  for (const filePath of paths) {
    let bytes;
    try {
      bytes = await readFile(filePath);
    } catch {
      reject();
    }
    values.push(parseJsonBytes(bytes));
  }
  return values;
}

async function assertOutputAbsent(outputDir) {
  try {
    await lstat(outputDir);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    reject();
  }
  reject();
}

async function writeDecodedEvidence(bundle, outputDir) {
  await assertOutputAbsent(outputDir);
  let created = false;
  try {
    await mkdir(outputDir, { mode: 0o700 });
    created = true;
    await chmod(outputDir, 0o700);
    for (const [field, filename] of INPUT_FILES) {
      const handle = await open(path.join(outputDir, filename), 'wx', 0o600);
      try {
        await handle.writeFile(JSON.stringify(bundle[field]), 'utf8');
      } finally {
        await handle.close();
      }
      await chmod(path.join(outputDir, filename), 0o600);
    }
  } catch {
    if (created) await rm(outputDir, { recursive: true, force: true }).catch(() => {});
    reject();
  }
}

function parseCliArguments(args) {
  const parsed = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith('--') || value === undefined || parsed.has(flag)) reject();
    parsed.set(flag, value);
  }
  return parsed;
}

function requireExactFlags(parsed, flags) {
  if (parsed.size !== flags.length || flags.some((flag) => !parsed.has(flag))) reject();
}

async function runCli(args) {
  const command = args[0];
  if (command !== 'encode' && command !== 'decode') reject();
  const parsed = parseCliArguments(args.slice(1));

  if (command === 'encode') {
    requireExactFlags(parsed, ['--fund-health', '--fund-ready', '--capital-health', '--capital-ready']);
    const values = await readEvidenceFiles(
      INPUT_FILES.map(([field]) => parsed.get(`--${field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`))
    );
    const bundle = Object.fromEntries(INPUT_FILES.map(([field], index) => [field, values[index]]));
    process.stdout.write(`${encodeOperatorEvidenceBundle(bundle)}\n`);
    return;
  }

  requireExactFlags(parsed, ['--output-dir']);
  const encoded = process.env.OPERATOR_EVIDENCE_B64;
  const bundle = decodeOperatorEvidenceBundle(encoded);
  await writeDecodedEvidence(bundle, parsed.get('--output-dir'));
  process.stdout.write('operator evidence decoded\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runCli(process.argv.slice(2)).catch(() => {
    console.error('Operator evidence command failed.');
    process.exitCode = 1;
  });
}
