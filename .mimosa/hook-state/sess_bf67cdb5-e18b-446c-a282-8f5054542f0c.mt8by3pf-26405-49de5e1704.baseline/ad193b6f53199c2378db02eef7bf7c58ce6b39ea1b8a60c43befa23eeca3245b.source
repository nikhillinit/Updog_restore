import { createHash } from 'node:crypto';
import { chmod, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ZodError } from 'zod';

import {
  parseReleaseProofCertification,
  type ReleaseProofCertificationV1,
} from '../../shared/contracts/release-proof-certification-v1.contract';

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
    process.stderr.write('Certification builder failed\n');
  }
  process.exitCode = 1;
}

const SUMMARY_ENVIRONMENT = ['MATRIX_SUMMARY_SHA256', 'RELEASE_CHECK_SUMMARY_SHA256'] as const;

// A proof job that failed before its evidence step produces no summary hashes;
// the certification then records summaries: null. A successful full release
// proof must always carry both summaries.
function readSummaries(
  fullReleaseProofResult: string
): ReleaseProofCertificationV1['summaries'] {
  const values = SUMMARY_ENVIRONMENT.map((name) => process.env[name]?.trim() ?? '');
  const populated = values.filter((value) => value !== '').length;
  if (populated === SUMMARY_ENVIRONMENT.length) {
    return {
      matrixSummarySha256: requiredEnvironment('MATRIX_SUMMARY_SHA256'),
      releaseCheckSummarySha256: requiredEnvironment('RELEASE_CHECK_SUMMARY_SHA256'),
    };
  }
  if (populated !== 0) {
    throw new BuilderError('Summary environment variables must be all set or all empty');
  }
  if (fullReleaseProofResult === 'success') {
    throw new BuilderError(
      'Summary environment variables are required when the full release proof succeeded'
    );
  }
  return null;
}

const CHARACTERIZATION_ENVIRONMENT = [
  'CHARACTERIZATION_ARTIFACT_ID',
  'CHARACTERIZATION_ARTIFACT_NAME',
  'CHARACTERIZATION_ARTIFACT_DIGEST',
  'CHARACTERIZATION_FILE_SHA256',
  'CHARACTERIZATION_SOURCE_SHA',
] as const;

function readCharacterizationArtifact(): ReleaseProofCertificationV1['characterizationArtifact'] {
  const values = CHARACTERIZATION_ENVIRONMENT.map((name) => process.env[name]?.trim() ?? '');
  const populated = values.filter((value) => value !== '').length;
  if (populated === 0) return null;
  if (populated !== CHARACTERIZATION_ENVIRONMENT.length) {
    throw new BuilderError(
      'Characterization environment variables must be all set or all empty'
    );
  }
  return {
    artifactId: requiredEnvironment('CHARACTERIZATION_ARTIFACT_ID'),
    artifactName: requiredEnvironment('CHARACTERIZATION_ARTIFACT_NAME'),
    artifactArchiveSha256: stripSha256Prefix(
      requiredEnvironment('CHARACTERIZATION_ARTIFACT_DIGEST')
    ),
    fileSha256: requiredEnvironment('CHARACTERIZATION_FILE_SHA256'),
    sourceSha: requiredEnvironment('CHARACTERIZATION_SOURCE_SHA'),
  };
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2), ['--output']);
  const outputPath = path.resolve(flagValue(flags, '--output'));

  const runId = requiredEnvironment('GITHUB_RUN_ID');
  const runAttempt = requiredRunAttempt();
  const sourceSha = requiredEnvironment('CERT_SOURCE_SHA');
  const conclusions = {
    fullReleaseProof: requiredEnvironment('FULL_RELEASE_PROOF_RESULT'),
    providerIdentity: requiredEnvironment('PROVIDER_IDENTITY_RESULT'),
    canaryResidueCharacterization: requiredEnvironment('CHARACTERIZATION_RESULT'),
    g3ExactShaVerdict: requiredEnvironment('G3_EXACT_SHA_VERDICT_RESULT'),
  };
  const characterizationArtifact = readCharacterizationArtifact();
  const summaries = readSummaries(conclusions.fullReleaseProof);

  // Mirrors the certification contract's eligibleForSuccess rule exactly; the
  // contract's superRefine re-checks both directions after parse.
  const expectedCharacterizationName = `release-canary-residue-characterization-v1-${runId}-${runAttempt}-${sourceSha}`;
  const eligibleForSuccess =
    summaries !== null &&
    conclusions.fullReleaseProof === 'success' &&
    conclusions.canaryResidueCharacterization === 'success' &&
    conclusions.g3ExactShaVerdict === 'success' &&
    (conclusions.providerIdentity === 'success' || conclusions.providerIdentity === 'skipped') &&
    characterizationArtifact !== null &&
    characterizationArtifact.sourceSha === sourceSha &&
    characterizationArtifact.artifactName === expectedCharacterizationName;

  const certification = parseReleaseProofCertification({
    schemaVersion: 'release-proof-certification-v1',
    repository: requiredEnvironment('GITHUB_REPOSITORY'),
    runId,
    runAttempt,
    sourceSha,
    callerWorkflowRef: requiredEnvironment('CALLER_WORKFLOW_REF'),
    proofWorkflowRef: requiredEnvironment('PROOF_WORKFLOW_REF'),
    conclusions,
    summaries,
    characterizationArtifact,
    overallConclusion: eligibleForSuccess ? 'success' : 'failure',
  });

  const serialized = `${JSON.stringify(certification, null, 2)}\n`;
  await writeExclusive(outputPath, serialized);
  process.stdout.write(
    `${JSON.stringify({
      certificationFileSha256: sha256Hex(serialized),
      overallConclusion: certification.overallConclusion,
    })}\n`
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
