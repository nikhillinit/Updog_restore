import { createHash } from 'node:crypto';
import { chmod, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ZodError } from 'zod';

import { parseReleaseProofLineage } from '../../shared/contracts/release-proof-lineage-v1.contract';

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

function stripSha256Prefix(value: string): string {
  return value.startsWith('sha256:') ? value.slice('sha256:'.length) : value;
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
    process.stderr.write('Lineage builder failed\n');
  }
  process.exitCode = 1;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2), ['--output']);
  const outputPath = path.resolve(flagValue(flags, '--output'));

  const lineage = parseReleaseProofLineage({
    schemaVersion: 'release-proof-lineage-v1',
    repository: requiredEnvironment('GITHUB_REPOSITORY'),
    runId: requiredEnvironment('GITHUB_RUN_ID'),
    runAttempt: requiredRunAttempt(),
    sourceSha: requiredEnvironment('CERT_SOURCE_SHA'),
    callerWorkflowRef: requiredEnvironment('CALLER_WORKFLOW_REF'),
    proofWorkflowRef: requiredEnvironment('PROOF_WORKFLOW_REF'),
    conclusion: requiredEnvironment('PROOF_CONCLUSION'),
    certificationArtifact: {
      artifactId: requiredEnvironment('CERTIFICATION_ARTIFACT_ID'),
      artifactName: requiredEnvironment('CERTIFICATION_ARTIFACT_NAME'),
      artifactArchiveSha256: stripSha256Prefix(
        requiredEnvironment('CERTIFICATION_ARTIFACT_DIGEST')
      ),
      certificationFileSha256: requiredEnvironment('CERTIFICATION_FILE_SHA256'),
    },
  });

  const serialized = `${JSON.stringify(lineage, null, 2)}\n`;
  await writeExclusive(outputPath, serialized);
  process.stdout.write(`${JSON.stringify({ lineageFileSha256: sha256Hex(serialized) })}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    await main();
  } catch (error) {
    reportFailure(error);
  }
}
