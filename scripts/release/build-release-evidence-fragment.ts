import { createHash } from 'node:crypto';
import { chmod, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ZodError } from 'zod';

import {
  RELEASE_EVIDENCE_FRAGMENT_KINDS,
  RELEASE_EVIDENCE_FRAGMENT_PRODUCER_JOBS,
  parseReleaseEvidenceFragment,
  sha256CanonicalJsonOfPayload,
  type ReleaseEvidenceFragmentKind,
} from '../../shared/contracts/release-evidence-fragment-v1.contract';
import { scanForSecretShapedContent } from '../../shared/contracts/release-evidence-manifest-v1.contract';

const MAX_PAYLOAD_BYTES = 1024 * 1024;

class BuilderError extends Error {}

function parseFlags(argv: readonly string[], allowed: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    if (flag === undefined || !flag.startsWith('--')) {
      throw new BuilderError('Positional arguments are not accepted');
    }
    if (!allowed.includes(flag)) throw new BuilderError(`Unknown flag: ${flag}`);
    if (flags.has(flag)) throw new BuilderError(`Duplicate flag: ${flag}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new BuilderError(`${flag} requires a value`);
    }
    flags.set(flag, value);
  }
  for (const flag of allowed) {
    if (!flags.has(flag)) throw new BuilderError(`${flag} is required`);
  }
  return flags;
}

function flagValue(flags: Map<string, string>, name: string): string {
  const value = flags.get(name);
  if (value === undefined) throw new BuilderError(`${name} is required`);
  return value;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new BuilderError(`${name} is required`);
  return value;
}

function requiredRunAttempt(): number {
  const value = Number(requiredEnvironment('GITHUB_RUN_ATTEMPT'));
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new BuilderError('GITHUB_RUN_ATTEMPT must be a positive integer');
  }
  return value;
}

function isFragmentKind(value: string): value is ReleaseEvidenceFragmentKind {
  return (RELEASE_EVIDENCE_FRAGMENT_KINDS as readonly string[]).includes(value);
}

async function readPayload(payloadPath: string): Promise<unknown> {
  let stats;
  try {
    stats = await stat(payloadPath);
  } catch {
    throw new BuilderError('Payload file could not be read');
  }
  if (!stats.isFile()) throw new BuilderError('Payload file must be a regular file');
  if (stats.size > MAX_PAYLOAD_BYTES) {
    throw new BuilderError('Payload file exceeds the 1MB limit');
  }
  let raw: string;
  try {
    raw = await readFile(payloadPath, 'utf8');
  } catch {
    throw new BuilderError('Payload file could not be read');
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    // JSON.parse errors embed input excerpts; replace with a fixed message.
    throw new BuilderError('Payload file is not valid JSON');
  }
}

async function writeExclusive(outputPath: string, content: string): Promise<void> {
  try {
    await writeFile(outputPath, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new BuilderError('Output file already exists; refusing to overwrite');
    }
    throw new BuilderError('Output file could not be written');
  }
  await chmod(outputPath, 0o600);
}

function sha256Hex(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

// Never echo environment values or payload bodies: zod issues are reported by
// path only, and unknown errors collapse to a fixed message.
function reportFailure(error: unknown): void {
  if (error instanceof ZodError) {
    const paths = error.issues.map((issue) => issue.path.join('.') || '(root)');
    process.stderr.write(`Contract validation failed at: ${[...new Set(paths)].join(', ')}\n`);
  } else if (error instanceof BuilderError) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write('Fragment builder failed\n');
  }
  process.exitCode = 1;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2), [
    '--kind',
    '--payload-file',
    '--producer-job',
    '--output',
  ]);
  const kind = flagValue(flags, '--kind');
  if (!isFragmentKind(kind)) throw new BuilderError('Unknown fragment kind');
  const producerJob = flagValue(flags, '--producer-job');
  if (producerJob !== RELEASE_EVIDENCE_FRAGMENT_PRODUCER_JOBS[kind]) {
    throw new BuilderError('Producer job does not match fragment kind');
  }
  const outputPath = path.resolve(flagValue(flags, '--output'));

  const payload = await readPayload(path.resolve(flagValue(flags, '--payload-file')));
  const secretViolations = scanForSecretShapedContent(payload);
  if (secretViolations.length > 0) {
    throw new BuilderError(
      `Secret-shaped or oversized payload content: ${secretViolations.join('; ')}`
    );
  }
  const payloadSha256 = sha256CanonicalJsonOfPayload(payload);

  const fragment = parseReleaseEvidenceFragment({
    schemaVersion: 'release-evidence-fragment-v1',
    kind,
    runId: requiredEnvironment('GITHUB_RUN_ID'),
    runAttempt: requiredRunAttempt(),
    sourceSha: requiredEnvironment('FRAGMENT_SOURCE_SHA'),
    producerJob,
    createdAt: new Date().toISOString(),
    payloadSha256,
    payload,
  });

  const serialized = `${JSON.stringify(fragment, null, 2)}\n`;
  await writeExclusive(outputPath, serialized);
  process.stdout.write(
    `${JSON.stringify({ payloadSha256, fileSha256: sha256Hex(serialized) })}\n`
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    await main();
  } catch (error) {
    reportFailure(error);
  }
}
