import { createHash } from 'node:crypto';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ZodError } from 'zod';

import {
  RELEASE_EVIDENCE_FRAGMENT_PRODUCER_JOBS,
  parseReleaseEvidenceFragment,
  sha256CanonicalJsonOfPayload,
  type ReleaseEvidenceFragmentKind,
  type ReleaseEvidenceFragmentV1,
} from '../../shared/contracts/release-evidence-fragment-v1.contract';
import {
  parseReleaseEvidenceManifest,
  scanForSecretShapedContent,
} from '../../shared/contracts/release-evidence-manifest-v1.contract';
import { parseReleaseProofCertification } from '../../shared/contracts/release-proof-certification-v1.contract';
import { parseReleaseProofLineage } from '../../shared/contracts/release-proof-lineage-v1.contract';

const SHA256_HEX = /^[a-f0-9]{64}$/;

class BuilderError extends Error {}

function fail(message: string): never {
  throw new BuilderError(`release evidence manifest build failed: ${message}`);
}

function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// Upload digests arrive as "sha256:<hex>" from the Actions API; lineage and
// manifest fields store bare lowercase hex.
function normalizeDigest(value: unknown, label: string): string {
  if (typeof value !== 'string' || value === '') fail(`${label} is required`);
  const bare = value.startsWith('sha256:') ? value.slice('sha256:'.length) : value;
  if (!SHA256_HEX.test(bare)) fail(`${label} is not a SHA-256 digest`);
  return bare;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value === '') fail(`${label} must be a non-empty string`);
  return value;
}

function asPositiveInteger(value: unknown, label: string): number {
  const numeric = typeof value === 'string' && value !== '' ? Number(value) : value;
  if (typeof numeric !== 'number' || !Number.isSafeInteger(numeric) || numeric < 1) {
    fail(`${label} must be a positive integer`);
  }
  return numeric;
}

interface ParsedArgs {
  designation: 'infrastructure_only' | 'activation_candidate';
  candidate: boolean;
  outputPath: string;
}

const KNOWN_FLAGS = ['--designation', '--candidate', '--output'] as const;

function parseArgs(argv: readonly string[]): ParsedArgs {
  const seen = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!KNOWN_FLAGS.includes(flag as (typeof KNOWN_FLAGS)[number])) {
      fail(`unknown argument ${String(flag)}`);
    }
    if (seen.has(flag as string)) fail(`${flag} may be provided only once`);
    const value = argv[index + 1];
    if (typeof value !== 'string' || value === '' || value.startsWith('--')) {
      fail(`${flag} requires a value`);
    }
    seen.set(flag as string, value);
    index += 1;
  }
  for (const flag of KNOWN_FLAGS) {
    if (!seen.has(flag)) fail(`${flag} is required`);
  }
  const designation = seen.get('--designation');
  if (designation !== 'infrastructure_only' && designation !== 'activation_candidate') {
    fail('--designation must be infrastructure_only or activation_candidate');
  }
  const candidateRaw = seen.get('--candidate');
  if (candidateRaw !== 'true' && candidateRaw !== 'false') {
    fail('--candidate must be true or false');
  }
  const candidate = candidateRaw === 'true';
  if (candidate !== (designation === 'activation_candidate')) {
    fail('--candidate must be true iff --designation is activation_candidate');
  }
  return { designation, candidate, outputPath: path.resolve(seen.get('--output') as string) };
}

interface FragmentEntry {
  kind: ReleaseEvidenceFragmentKind;
  path: string;
  artifactId: string;
  artifactName: string;
  artifactArchiveSha256: string;
  fileSha256: string;
  payloadSha256: string;
  producerJob: string;
}

function normalizeFragmentEntry(
  value: unknown,
  key: string,
  kind: ReleaseEvidenceFragmentKind
): FragmentEntry | null {
  if (value === null || value === undefined) return null;
  const entry = asRecord(value, `fragments.${key}`);
  if (entry['kind'] !== kind) fail(`fragments.${key}.kind must be ${kind}`);
  return {
    kind,
    path: asString(entry['path'], `fragments.${key}.path`),
    artifactId: asString(entry['artifactId'], `fragments.${key}.artifactId`),
    artifactName: asString(entry['artifactName'], `fragments.${key}.artifactName`),
    artifactArchiveSha256: normalizeDigest(
      entry['artifactArchiveSha256'],
      `fragments.${key}.artifactArchiveSha256`
    ),
    fileSha256: normalizeDigest(entry['fileSha256'], `fragments.${key}.fileSha256`),
    payloadSha256: normalizeDigest(entry['payloadSha256'], `fragments.${key}.payloadSha256`),
    producerJob: asString(entry['producerJob'], `fragments.${key}.producerJob`),
  };
}

interface VerifiedFragment {
  envelope: ReleaseEvidenceFragmentV1;
  lineage: {
    kind: ReleaseEvidenceFragmentKind;
    runId: string;
    runAttempt: number;
    sourceSha: string;
    artifactId: string;
    artifactName: string;
    artifactArchiveSha256: string;
    fileSha256: string;
    payloadSha256: string;
    producerJob: string;
  };
}

async function verifyFragment(
  entry: FragmentEntry | null,
  key: string,
  kind: ReleaseEvidenceFragmentKind,
  current: { runId: string; runAttempt: number; sourceSha: string }
): Promise<VerifiedFragment | null> {
  if (entry === null) return null;
  let bytes: Buffer;
  try {
    bytes = await readFile(entry.path);
  } catch {
    fail(`fragment file for ${key} could not be read`);
  }
  const fileSha256 = sha256Hex(bytes);
  if (fileSha256 !== entry.fileSha256) {
    fail(`fragment ${key} file hash does not match transported fileSha256`);
  }
  let envelope: ReleaseEvidenceFragmentV1;
  try {
    envelope = parseReleaseEvidenceFragment(JSON.parse(bytes.toString('utf8')));
  } catch (error) {
    // Report issue paths only — never echo received values into failure output.
    const detail =
      error instanceof ZodError
        ? [...new Set(error.issues.map((issue) => issue.path.join('.') || '(root)'))].join(', ')
        : 'parse error';
    fail(`fragment ${key} envelope is invalid at: ${detail}`);
  }
  if (envelope.kind !== kind) fail(`fragment ${key} envelope kind must be ${kind}`);
  const expectedProducer = RELEASE_EVIDENCE_FRAGMENT_PRODUCER_JOBS[kind];
  if (envelope.producerJob !== expectedProducer || entry.producerJob !== expectedProducer) {
    fail(`fragment ${key} producer job must be ${expectedProducer}`);
  }
  const recomputedPayloadSha256 = sha256CanonicalJsonOfPayload(envelope.payload);
  if (
    recomputedPayloadSha256 !== envelope.payloadSha256 ||
    recomputedPayloadSha256 !== entry.payloadSha256
  ) {
    fail(`fragment ${key} payload hash does not match its recomputed canonical hash`);
  }
  if (envelope.runId !== current.runId || envelope.runAttempt !== current.runAttempt) {
    fail(`fragment ${key} does not bind the current run id and attempt`);
  }
  if (envelope.sourceSha !== current.sourceSha) {
    fail(`fragment ${key} does not bind the release source SHA`);
  }
  return {
    envelope,
    lineage: {
      kind,
      runId: envelope.runId,
      runAttempt: envelope.runAttempt,
      sourceSha: envelope.sourceSha,
      artifactId: entry.artifactId,
      artifactName: entry.artifactName,
      artifactArchiveSha256: entry.artifactArchiveSha256,
      fileSha256: entry.fileSha256,
      payloadSha256: entry.payloadSha256,
      producerJob: entry.producerJob,
    },
  };
}

interface BaselineBinding {
  baselineRunId: string;
  baselineRunAttempt: number;
  baselineArtifactId: string;
  baselineArtifactDigest: string;
  baselineFileSha256: string;
  rollbackPrNumber: number | null;
  rollbackPrHeadSha: string | null;
}

// Inline decode of release-baseline-binding-v1 (mirrors decodeBaselineEvidence
// in capture-release-recovery-context.mjs, which is untyped .mjs).
function decodeBaselineBinding(b64: unknown, releaseMode: 'primary' | 'rollback'): BaselineBinding {
  if (typeof b64 !== 'string' || b64.trim() === '') fail('baseline evidence is required');
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(b64.trim(), 'base64').toString('utf8'));
  } catch {
    fail('baseline evidence is not valid base64 JSON');
  }
  const binding = asRecord(decoded, 'baseline evidence');
  const expectedKeys = [
    'schemaVersion',
    'baselineRunId',
    'baselineRunAttempt',
    'baselineArtifactId',
    'baselineArtifactDigest',
    'baselineFileSha256',
    ...(releaseMode === 'rollback' ? ['rollbackPrNumber', 'rollbackPrHeadSha'] : []),
  ];
  const actualKeys = Object.keys(binding).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify([...expectedKeys].sort())) {
    fail('baseline evidence contains unexpected fields');
  }
  if (binding['schemaVersion'] !== 'release-baseline-binding-v1') {
    fail('baseline evidence schema version is invalid');
  }
  return {
    baselineRunId: asString(binding['baselineRunId'], 'baseline run id'),
    baselineRunAttempt: asPositiveInteger(binding['baselineRunAttempt'], 'baseline run attempt'),
    baselineArtifactId: asString(binding['baselineArtifactId'], 'baseline artifact id'),
    baselineArtifactDigest: normalizeDigest(
      binding['baselineArtifactDigest'],
      'baseline artifact digest'
    ),
    baselineFileSha256: normalizeDigest(binding['baselineFileSha256'], 'baseline file SHA-256'),
    rollbackPrNumber:
      releaseMode === 'rollback'
        ? asPositiveInteger(binding['rollbackPrNumber'], 'rollback PR number')
        : null,
    rollbackPrHeadSha:
      releaseMode === 'rollback'
        ? asString(binding['rollbackPrHeadSha'], 'rollback PR head SHA')
        : null,
  };
}

async function readJsonFile(filePath: string, label: string): Promise<unknown> {
  let bytes: Buffer;
  try {
    bytes = await readFile(filePath);
  } catch {
    fail(`${label} could not be read`);
  }
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    fail(`${label} is not valid JSON`);
  }
}

const FRAGMENT_KEYS: ReadonlyArray<readonly [string, ReleaseEvidenceFragmentKind]> = [
  ['baseline', 'baseline'],
  ['schema', 'schema'],
  ['policyConfig', 'policy-config'],
  ['policyMeasurement', 'policy-measurement'],
  ['operatorEvidence', 'operator-evidence'],
  ['releaseProvider', 'release-provider'],
  ['canaryResult', 'canary-result'],
];

export async function main(
  argv: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
  { output = (line: string): void => console.log(line) }: { output?: (line: string) => void } = {}
): Promise<void> {
  const args = parseArgs(argv);
  const inputsPath = env['RELEASE_EVIDENCE_INPUTS_PATH'];
  if (!inputsPath) fail('RELEASE_EVIDENCE_INPUTS_PATH is required');
  const inputs = asRecord(
    await readJsonFile(inputsPath, 'evidence inputs file'),
    'evidence inputs'
  );

  const sourceInput = asRecord(inputs['source'], 'inputs.source');
  const repository = asString(sourceInput['repository'], 'source.repository');
  const sourceSha = asString(sourceInput['sha'], 'source.sha');
  const releaseModeRaw = asString(sourceInput['releaseMode'], 'source.releaseMode');
  if (releaseModeRaw !== 'primary' && releaseModeRaw !== 'rollback') {
    fail('source.releaseMode must be primary or rollback');
  }
  const releaseMode: 'primary' | 'rollback' = releaseModeRaw;
  const primaryPullRequest =
    releaseMode === 'primary'
      ? asPositiveInteger(sourceInput['pullRequest'], 'source.pullRequest')
      : null;
  const primaryPullRequestHeadSha =
    releaseMode === 'primary'
      ? asString(sourceInput['pullRequestHeadSha'], 'source.pullRequestHeadSha')
      : null;

  const workflowInput = asRecord(inputs['workflow'], 'inputs.workflow');
  const runId = asString(workflowInput['runId'], 'workflow.runId');
  const runAttempt = asPositiveInteger(workflowInput['runAttempt'], 'workflow.runAttempt');
  const startedAt = asString(workflowInput['startedAt'], 'workflow.startedAt');
  const preManifestOutcome = asString(
    workflowInput['preManifestOutcome'],
    'workflow.preManifestOutcome'
  );
  const failureStage =
    workflowInput['failureStage'] === null || workflowInput['failureStage'] === undefined
      ? null
      : asString(workflowInput['failureStage'], 'workflow.failureStage');
  const current = { runId, runAttempt, sourceSha };

  // Fragments: re-read every nonnull file and verify transport + envelope.
  const fragmentsInput = asRecord(inputs['fragments'], 'inputs.fragments');
  const verified = new Map<string, VerifiedFragment | null>();
  for (const [key, kind] of FRAGMENT_KEYS) {
    const entry = normalizeFragmentEntry(fragmentsInput[key], key, kind);
    verified.set(key, await verifyFragment(entry, key, kind, current));
  }
  const baselineFragment = verified.get('baseline') ?? null;
  const policyConfigFragment = verified.get('policyConfig') ?? null;
  if (baselineFragment === null) fail('baseline fragment is required for every manifest');
  if (policyConfigFragment === null) fail('policy-config fragment is required for every manifest');
  if (preManifestOutcome !== 'success' && failureStage === null) {
    fail('failureStage is required when preManifestOutcome is not success');
  }

  const baselineEnvelope = baselineFragment.envelope;
  if (baselineEnvelope.kind !== 'baseline') fail('baseline fragment kind mismatch');
  const baselinePayload = baselineEnvelope.payload;
  const policyConfigEnvelope = policyConfigFragment.envelope;
  if (policyConfigEnvelope.kind !== 'policy-config') fail('policy-config fragment kind mismatch');
  const policyConfigPayload = policyConfigEnvelope.payload;

  // Baseline binding cross-check: the decoded dispatch input must equal the
  // baseline fragment's recorded artifact identity.
  const binding = decodeBaselineBinding(inputs['baselineEvidenceB64'], releaseMode);
  const baselineArtifact = baselinePayload.baselineArtifact;
  if (
    baselineArtifact.runId !== binding.baselineRunId ||
    baselineArtifact.runAttempt !== binding.baselineRunAttempt ||
    baselineArtifact.artifactId !== binding.baselineArtifactId ||
    baselineArtifact.artifactArchiveSha256 !== binding.baselineArtifactDigest ||
    baselineArtifact.contextFileSha256 !== binding.baselineFileSha256
  ) {
    fail('baseline fragment does not match the dispatched baseline evidence binding');
  }

  // Certification + lineage files: re-read, re-hash, parse, and cross-check
  // against the reusable workflow outputs and current execution identity.
  const outputsInput = asRecord(inputs['certificationOutputs'], 'inputs.certificationOutputs');
  const proofRunId = asString(outputsInput['proofRunId'], 'certificationOutputs.proofRunId');
  const proofRunAttempt = asPositiveInteger(
    outputsInput['proofRunAttempt'],
    'certificationOutputs.proofRunAttempt'
  );
  const proofSourceSha = asString(
    outputsInput['proofSourceSha'],
    'certificationOutputs.proofSourceSha'
  );
  const callerWorkflowRef = asString(
    outputsInput['callerWorkflowRef'],
    'certificationOutputs.callerWorkflowRef'
  );
  const proofWorkflowRef = asString(
    outputsInput['proofWorkflowRef'],
    'certificationOutputs.proofWorkflowRef'
  );
  const proofConclusion = asString(
    outputsInput['proofConclusion'],
    'certificationOutputs.proofConclusion'
  );
  if (proofRunId !== runId || proofRunAttempt !== runAttempt || proofSourceSha !== sourceSha) {
    fail('certification outputs do not bind the current run id, attempt, and source SHA');
  }
  const certificationFilePath = asString(inputs['certificationFilePath'], 'certificationFilePath');
  const lineageFilePath = asString(inputs['lineageFilePath'], 'lineageFilePath');
  let certificationBytes: Buffer;
  let lineageBytes: Buffer;
  try {
    certificationBytes = await readFile(certificationFilePath);
    lineageBytes = await readFile(lineageFilePath);
  } catch {
    fail('certification or lineage file could not be read');
  }
  const certificationFileSha256 = normalizeDigest(
    outputsInput['certificationFileSha256'],
    'certificationOutputs.certificationFileSha256'
  );
  const lineageFileSha256 = normalizeDigest(
    outputsInput['lineageFileSha256'],
    'certificationOutputs.lineageFileSha256'
  );
  if (sha256Hex(certificationBytes) !== certificationFileSha256) {
    fail('certification file hash does not match certification outputs');
  }
  if (sha256Hex(lineageBytes) !== lineageFileSha256) {
    fail('lineage file hash does not match certification outputs');
  }
  const certification = parseReleaseProofCertification(
    JSON.parse(certificationBytes.toString('utf8'))
  );
  const lineage = parseReleaseProofLineage(JSON.parse(lineageBytes.toString('utf8')));
  if (
    certification.runId !== runId ||
    certification.runAttempt !== runAttempt ||
    certification.sourceSha !== sourceSha ||
    certification.callerWorkflowRef !== callerWorkflowRef ||
    certification.proofWorkflowRef !== proofWorkflowRef ||
    certification.overallConclusion !== proofConclusion
  ) {
    fail('certification file does not match certification outputs and current execution');
  }
  if (
    lineage.runId !== runId ||
    lineage.runAttempt !== runAttempt ||
    lineage.sourceSha !== sourceSha ||
    lineage.callerWorkflowRef !== callerWorkflowRef ||
    lineage.proofWorkflowRef !== proofWorkflowRef ||
    lineage.conclusion !== proofConclusion
  ) {
    fail('lineage file does not match certification outputs and current execution');
  }
  const certificationArtifactDigest = normalizeDigest(
    outputsInput['certificationArtifactDigest'],
    'certificationOutputs.certificationArtifactDigest'
  );
  if (
    lineage.certificationArtifact.artifactId !==
      asString(outputsInput['certificationArtifactId'], 'certificationArtifactId') ||
    lineage.certificationArtifact.artifactName !==
      asString(outputsInput['certificationArtifactName'], 'certificationArtifactName') ||
    lineage.certificationArtifact.artifactArchiveSha256 !== certificationArtifactDigest ||
    lineage.certificationArtifact.certificationFileSha256 !== certificationFileSha256
  ) {
    fail('lineage certification artifact does not match certification outputs');
  }

  // Characterization evidence must equal the certification's recorded object.
  const characterizationInput =
    inputs['characterization'] === null || inputs['characterization'] === undefined
      ? null
      : asRecord(inputs['characterization'], 'inputs.characterization');
  const characterizationEvidence =
    characterizationInput === null
      ? null
      : {
          artifactId: asString(characterizationInput['artifactId'], 'characterization.artifactId'),
          artifactName: asString(
            characterizationInput['artifactName'],
            'characterization.artifactName'
          ),
          artifactArchiveSha256: normalizeDigest(
            characterizationInput['artifactArchiveSha256'],
            'characterization.artifactArchiveSha256'
          ),
          fileSha256: normalizeDigest(
            characterizationInput['fileSha256'],
            'characterization.fileSha256'
          ),
          sourceSha: asString(characterizationInput['sourceSha'], 'characterization.sourceSha'),
        };
  if (characterizationEvidence !== null) {
    const recorded = certification.characterizationArtifact;
    if (
      recorded === null ||
      recorded.artifactId !== characterizationEvidence.artifactId ||
      recorded.artifactName !== characterizationEvidence.artifactName ||
      recorded.artifactArchiveSha256 !== characterizationEvidence.artifactArchiveSha256 ||
      recorded.fileSha256 !== characterizationEvidence.fileSha256 ||
      recorded.sourceSha !== characterizationEvidence.sourceSha
    ) {
      fail('characterization evidence does not match the certification record');
    }
  }

  // Schema fragment must be provable against the dispatcher schema inputs.
  const schemaFragment = verified.get('schema') ?? null;
  let schemaSection: unknown = null;
  if (schemaFragment !== null) {
    const schemaEnvelope = schemaFragment.envelope;
    if (schemaEnvelope.kind !== 'schema') fail('schema fragment kind mismatch');
    const schemaPayload = schemaEnvelope.payload;
    const schemaInputsRaw = inputs['schemaInputs'];
    if (schemaInputsRaw === null || schemaInputsRaw === undefined) {
      fail('schema fragment is present but dispatcher schema inputs are missing');
    }
    const schemaInputs = asRecord(schemaInputsRaw, 'inputs.schemaInputs');
    if (
      schemaPayload.apply.runId !== asString(schemaInputs['runId'], 'schemaInputs.runId') ||
      asPositiveInteger(schemaInputs['runAttempt'], 'schemaInputs.runAttempt') !== 1 ||
      schemaPayload.apply.artifactId !==
        asString(schemaInputs['artifactId'], 'schemaInputs.artifactId') ||
      schemaPayload.apply.artifactArchiveSha256 !==
        normalizeDigest(schemaInputs['artifactDigest'], 'schemaInputs.artifactDigest') ||
      schemaPayload.apply.receiptFileSha256 !==
        asString(schemaInputs['receiptFileSha256'], 'schemaInputs.receiptFileSha256') ||
      schemaPayload.precursorSha !==
        asString(schemaInputs['precursorSha'], 'schemaInputs.precursorSha')
    ) {
      fail('schema fragment does not match the dispatcher schema inputs');
    }
    schemaSection = schemaPayload;
  }

  const sourcePullRequest =
    (releaseMode === 'rollback' ? binding.rollbackPrNumber : null) ?? primaryPullRequest ?? 1;
  const sourcePullRequestHeadSha =
    (releaseMode === 'rollback' ? binding.rollbackPrHeadSha : null) ??
    primaryPullRequestHeadSha ??
    '0'.repeat(40);

  const policyMeasurement = verified.get('policyMeasurement') ?? null;
  const operatorEvidence = verified.get('operatorEvidence') ?? null;
  const releaseProvider = verified.get('releaseProvider') ?? null;
  const canaryResult = verified.get('canaryResult') ?? null;

  const measurementPayload =
    policyMeasurement === null
      ? null
      : policyMeasurement.envelope.kind === 'policy-measurement'
        ? policyMeasurement.envelope.payload
        : fail('policy-measurement fragment kind mismatch');
  const operatorEvidencePayload =
    operatorEvidence === null
      ? null
      : operatorEvidence.envelope.kind === 'operator-evidence'
        ? operatorEvidence.envelope.payload
        : fail('operator-evidence fragment kind mismatch');
  const releaseProviderPayload =
    releaseProvider === null
      ? null
      : releaseProvider.envelope.kind === 'release-provider'
        ? releaseProvider.envelope.payload
        : fail('release-provider fragment kind mismatch');
  const canaryPayload =
    canaryResult === null
      ? null
      : canaryResult.envelope.kind === 'canary-result'
        ? canaryResult.envelope.payload
        : fail('canary-result fragment kind mismatch');

  const manifest = {
    schemaVersion: 'release-evidence-manifest-v1',
    designation: args.designation,
    candidate: args.candidate,
    source: {
      repository,
      sha: sourceSha,
      releaseMode,
      pullRequest: sourcePullRequest,
      pullRequestHeadSha: sourcePullRequestHeadSha,
      planApprovalPullRequest: null,
      planPath: null,
      planSha256: null,
    },
    approval: null,
    certification: {
      schemaVersion: 'release-proof-lineage-v1',
      callerWorkflowRef,
      proofWorkflowRef,
      runId,
      runAttempt,
      sourceSha,
      conclusion: proofConclusion,
      certificationArtifact: {
        artifactId: lineage.certificationArtifact.artifactId,
        artifactName: lineage.certificationArtifact.artifactName,
        artifactArchiveSha256: lineage.certificationArtifact.artifactArchiveSha256,
        certificationFileSha256: lineage.certificationArtifact.certificationFileSha256,
      },
      lineageArtifact: {
        artifactId: asString(outputsInput['lineageArtifactId'], 'lineageArtifactId'),
        artifactName: asString(outputsInput['lineageArtifactName'], 'lineageArtifactName'),
        artifactArchiveSha256: normalizeDigest(
          outputsInput['lineageArtifactDigest'],
          'lineageArtifactDigest'
        ),
        lineageFileSha256,
      },
    },
    workflow: {
      runId,
      runAttempt,
      startedAt,
      manifestBuiltAt: new Date().toISOString(),
      preManifestOutcome,
      failureStage,
      manifestArtifactName: `release-evidence-manifest-v1-${runId}-${runAttempt}-${sourceSha}`,
    },
    schema: schemaSection,
    policy: {
      reservedPerRun: policyConfigPayload.reservedPerRun,
      stagedMeasuredResidue: measurementPayload === null ? null : measurementPayload.residue,
      configuredCaps: policyConfigPayload.configuredCaps,
      retainedRunBudget: policyConfigPayload.retainedRunBudget,
      ttlHours: policyConfigPayload.ttlHours,
      characterizationEvidence,
      ratification: null,
    },
    prechange: {
      baseline: baselinePayload.baselineArtifact,
      vercel: baselinePayload.prechange.vercel,
      railway: baselinePayload.prechange.railway,
    },
    release: releaseProviderPayload,
    operatorEvidence: operatorEvidencePayload,
    canary:
      canaryPayload === null
        ? null
        : {
            execution: canaryPayload.execution,
            status: canaryPayload.status,
            residue: canaryPayload.residue,
          },
    h9Artifact: canaryPayload === null ? null : canaryPayload.h9Artifact,
    fragmentLineage: {
      baseline: baselineFragment.lineage,
      schema: schemaFragment === null ? null : schemaFragment.lineage,
      policyConfig: policyConfigFragment.lineage,
      policyMeasurement: policyMeasurement === null ? null : policyMeasurement.lineage,
      policyRatification: null,
      operatorEvidence: operatorEvidence === null ? null : operatorEvidence.lineage,
      releaseProvider: releaseProvider === null ? null : releaseProvider.lineage,
      canaryResult: canaryResult === null ? null : canaryResult.lineage,
    },
    rollback: {
      mode: releaseMode,
      recoveryContextSha256: baselinePayload.rollback.recoveryContextSha256,
      targetMainSha: baselinePayload.rollback.targetMainSha,
    },
  };

  const violations = scanForSecretShapedContent(manifest);
  if (violations.length > 0) {
    fail(`secret-shaped or oversized manifest content: ${violations.join('; ')}`);
  }
  parseReleaseEvidenceManifest(manifest);

  const serialized = `${JSON.stringify(manifest)}\n`;
  await writeFile(args.outputPath, serialized, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await chmod(args.outputPath, 0o600);
  output(args.outputPath);
  output(JSON.stringify({ manifestSha256: sha256Hex(Buffer.from(serialized, 'utf8')) }));
}

// Never echo payload or fragment values: zod issues are reported by path and
// code only, builder-authored failures print their fixed messages, and any
// other error collapses to a generic line.
function reportFailure(error: unknown): void {
  if (error instanceof ZodError) {
    const issues = error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'} (${issue.code})`
    );
    process.stderr.write(`Contract validation failed at: ${[...new Set(issues)].join(', ')}\n`);
  } else if (error instanceof BuilderError) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write('release evidence manifest build failed\n');
  }
  process.exitCode = 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error: unknown) => {
    reportFailure(error);
  });
}
