import { z } from 'zod';

import { RELEASE_CANARY_RESIDUE_GROUP_KEYS } from './release-canary-residue-characterization-v1.contract';
import {
  OperatorEvidenceFragmentPayloadSchema,
  PolicyRatificationFragmentPayloadSchema,
  RELEASE_EVIDENCE_FRAGMENT_KINDS,
  RELEASE_EVIDENCE_FRAGMENT_PRODUCER_JOBS,
  RailwayIdentitySchema,
  ResidueVectorSchema,
  VercelIdentitySchema,
  vectorEqualsReserved,
  type ReleaseEvidenceFragmentKind,
} from './release-evidence-fragment-v1.contract';

export const RELEASE_EVIDENCE_FAILURE_STAGES = [
  'validate-target',
  'baseline-policy-preflight',
  'release-proof',
  'schema-audit',
  'stage-production',
  'validate-deployment',
  'railway-workers-deploy',
  'railway-workers-verify',
  'staged-smoke',
  'staged-provider-identity',
  'g4-operator-evidence',
  'policy-ratification',
  'promote',
  'post-promotion-smoke',
] as const;

const GitHubRepositorySchema = z
  .string()
  .max(256)
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 'Repository must be owner/name');
const PositiveDecimalIdSchema = z
  .string()
  .regex(/^[1-9][0-9]{0,31}$/, 'Identifier must be a positive decimal string');
const RunAttemptSchema = z.number().int().min(1).max(100);
const SourceShaSchema = z.string().regex(/^[a-f0-9]{40}$/, 'Source SHA must be lowercase SHA-1');
const Sha256HexSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, 'Digest must be lowercase 64-hex SHA-256');
const ArtifactNameSchema = z.string().min(1).max(2048);
const PullRequestNumberSchema = z.number().int().min(1).max(1_000_000);
const PositiveIntegerSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const IsoUtcSchema = z
  .string()
  .max(64)
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/,
    'Timestamp must be strict ISO-8601 UTC'
  )
  .refine((value) => Number.isFinite(Date.parse(value)), {
    message: 'Timestamp must be a real instant',
  });
const UuidSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    'Identifier must be a lowercase UUID'
  );
const GitHubUrlSchema = z
  .string()
  .max(2048)
  .regex(
    // Real GitHub comment URLs carry an anchor fragment
    // (#issuecomment-<id> / #discussion_r<id>); query strings stay rejected.
    /^https:\/\/github\.com\/[^\s?#]{1,2000}(?:#[A-Za-z0-9_-]{1,100})?$/,
    'URL must be an https github.com URL'
  );
const GitHubLoginSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/, 'Login must be a GitHub login');
const RepoRelativePathSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9._][A-Za-z0-9._/-]{0,511}$/, 'Path must be repository-relative');
const CallerWorkflowRefSchema = z
  .string()
  .min(1)
  .max(2048)
  .regex(
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml@refs\/.+$/,
    'Caller workflow ref must be owner/repo/.github/workflows/<file>.yml@refs/...'
  );
const ProducerJobSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,127}$/, 'Producer job must be a workflow job id');
const WorkflowRunUrlOrRefSchema = z.string().min(1).max(2048);

const CiGateIdentitySchema = z
  .object({
    checkRunId: PositiveIntegerSchema,
    workflowRunId: PositiveIntegerSchema,
    runAttempt: RunAttemptSchema,
    headSha: SourceShaSchema,
  })
  .strict();

const ApprovalSchema = z
  .object({
    schemaVersion: z.literal('plan-approval-v2'),
    repository: GitHubRepositorySchema,
    pullRequest: PullRequestNumberSchema,
    verifiedPrHeadSha: SourceShaSchema,
    commentId: PositiveIntegerSchema,
    commentUrl: GitHubUrlSchema,
    authorLogin: GitHubLoginSchema,
    authorPermission: z.enum(['admin', 'maintain', 'write']),
    createdAt: IsoUtcSchema,
    bodySha256: Sha256HexSchema,
    planPath: RepoRelativePathSchema,
    planSha256: Sha256HexSchema,
    approvedBaseHeadSha: SourceShaSchema,
    reviewCommentId: PositiveIntegerSchema,
    reviewCommentUrl: GitHubUrlSchema,
    reviewAuthorLogin: GitHubLoginSchema,
    reviewCreatedAt: IsoUtcSchema,
    reviewBodySha256: Sha256HexSchema,
    ciGateCheckRunId: PositiveIntegerSchema,
    ciGateWorkflowRunId: PositiveIntegerSchema,
    ciGateRunAttempt: RunAttemptSchema,
    finalHeadCiGate: CiGateIdentitySchema,
    separationModel: z.literal('single-maintainer-owner-attestation'),
  })
  .strict();

const CertificationArtifactRefSchema = z
  .object({
    artifactId: PositiveDecimalIdSchema,
    artifactName: ArtifactNameSchema,
    artifactArchiveSha256: Sha256HexSchema,
    certificationFileSha256: Sha256HexSchema,
  })
  .strict();

const LineageArtifactRefSchema = z
  .object({
    artifactId: PositiveDecimalIdSchema,
    artifactName: ArtifactNameSchema,
    artifactArchiveSha256: Sha256HexSchema,
    lineageFileSha256: Sha256HexSchema,
  })
  .strict();

const CertificationSchema = z
  .object({
    schemaVersion: z.literal('release-proof-lineage-v1'),
    callerWorkflowRef: CallerWorkflowRefSchema,
    proofWorkflowRef: WorkflowRunUrlOrRefSchema,
    runId: PositiveDecimalIdSchema,
    runAttempt: RunAttemptSchema,
    sourceSha: SourceShaSchema,
    conclusion: z.enum(['success', 'failure']),
    certificationArtifact: CertificationArtifactRefSchema,
    lineageArtifact: LineageArtifactRefSchema,
  })
  .strict();

const WorkflowSchema = z
  .object({
    runId: PositiveDecimalIdSchema,
    runAttempt: RunAttemptSchema,
    startedAt: IsoUtcSchema,
    manifestBuiltAt: IsoUtcSchema,
    preManifestOutcome: z.enum(['success', 'failure', 'cancelled']),
    failureStage: z.enum(RELEASE_EVIDENCE_FAILURE_STAGES).nullable(),
    manifestArtifactName: ArtifactNameSchema,
  })
  .strict();

const GitHubRunUrlSchema = z
  .string()
  .max(2048)
  .regex(/^https:\/\/github\.com\/[^\s?#]{1,2000}$/, 'Run URL must be an https github.com URL');

const SchemaSectionSchema = z
  .object({
    migration: z.literal('0053'),
    precursorSha: SourceShaSchema,
    apply: z
      .object({
        runId: PositiveDecimalIdSchema,
        runAttempt: z.literal(1),
        workflowPath: z.literal('.github/workflows/prod-schema-reconcile.yml'),
        sourceSha: SourceShaSchema,
        runUrl: GitHubRunUrlSchema,
        artifactId: PositiveDecimalIdSchema,
        artifactName: ArtifactNameSchema,
        artifactArchiveSha256: Sha256HexSchema,
        receiptFileSha256: Sha256HexSchema,
      })
      .strict(),
    audit: z
      .object({
        runId: PositiveDecimalIdSchema,
        runAttempt: RunAttemptSchema,
        workflowPath: z.literal('.github/workflows/prod-schema-reconcile.yml'),
        sourceSha: SourceShaSchema,
        runUrl: GitHubRunUrlSchema,
        result: z.literal('clean'),
      })
      .strict(),
  })
  .strict();

const CharacterizationEvidenceSchema = z
  .object({
    artifactId: PositiveDecimalIdSchema,
    artifactName: ArtifactNameSchema,
    artifactArchiveSha256: Sha256HexSchema,
    fileSha256: Sha256HexSchema,
    sourceSha: SourceShaSchema,
  })
  .strict();

const PolicySchema = z
  .object({
    reservedPerRun: ResidueVectorSchema,
    stagedMeasuredResidue: ResidueVectorSchema.nullable(),
    configuredCaps: ResidueVectorSchema,
    retainedRunBudget: z.literal(3),
    ttlHours: z.literal(24),
    characterizationEvidence: CharacterizationEvidenceSchema.nullable(),
    ratification: PolicyRatificationFragmentPayloadSchema.nullable(),
  })
  .strict();

const PrechangeSchema = z
  .object({
    baseline: z
      .object({
        runId: PositiveDecimalIdSchema,
        runAttempt: RunAttemptSchema,
        workflowPath: z.literal('.github/workflows/capture-release-baseline.yml'),
        baselineMainSha: SourceShaSchema,
        plannedPrHeadSha: SourceShaSchema,
        artifactId: PositiveDecimalIdSchema,
        artifactName: ArtifactNameSchema,
        artifactArchiveSha256: Sha256HexSchema,
        contextFileSha256: Sha256HexSchema,
      })
      .strict(),
    vercel: VercelIdentitySchema,
    railway: RailwayIdentitySchema,
  })
  .strict();

const ReleaseSectionSchema = z
  .object({
    vercel: VercelIdentitySchema,
    railway: RailwayIdentitySchema,
  })
  .strict();

const CanarySectionSchema = z
  .object({
    execution: z
      .object({
        fundId: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
        canaryRunId: UuidSchema,
        githubRunId: PositiveDecimalIdSchema,
        githubRunAttempt: RunAttemptSchema,
        releaseSha: SourceShaSchema,
        startedAt: IsoUtcSchema,
      })
      .strict(),
    status: z.literal('completed'),
    residue: ResidueVectorSchema,
  })
  .strict();

const H9ArtifactSchema = z
  .object({
    // Positive-integer identities (reportPackageExportId / reportPackageId);
    // canary 6's validated H9 surface carries no UUID.
    recordId: PositiveIntegerSchema,
    packageId: PositiveIntegerSchema,
    contentHash: Sha256HexSchema,
    fingerprint: Sha256HexSchema,
    sizeBytes: z.number().int().min(1).max(1_000_000_000),
  })
  .strict();

const FragmentLineageSchema = z
  .object({
    kind: z.enum(RELEASE_EVIDENCE_FRAGMENT_KINDS),
    runId: PositiveDecimalIdSchema,
    runAttempt: RunAttemptSchema,
    sourceSha: SourceShaSchema,
    artifactId: PositiveDecimalIdSchema,
    artifactName: ArtifactNameSchema,
    artifactArchiveSha256: Sha256HexSchema,
    fileSha256: Sha256HexSchema,
    payloadSha256: Sha256HexSchema,
    producerJob: ProducerJobSchema,
  })
  .strict();

const FragmentLineageMapSchema = z
  .object({
    baseline: FragmentLineageSchema,
    schema: FragmentLineageSchema.nullable(),
    policyConfig: FragmentLineageSchema,
    policyMeasurement: FragmentLineageSchema.nullable(),
    policyRatification: FragmentLineageSchema.nullable(),
    operatorEvidence: FragmentLineageSchema.nullable(),
    releaseProvider: FragmentLineageSchema.nullable(),
    canaryResult: FragmentLineageSchema.nullable(),
  })
  .strict();

const FRAGMENT_LINEAGE_KINDS: ReadonlyArray<
  readonly [keyof z.infer<typeof FragmentLineageMapSchema>, ReleaseEvidenceFragmentKind]
> = [
  ['baseline', 'baseline'],
  ['schema', 'schema'],
  ['policyConfig', 'policy-config'],
  ['policyMeasurement', 'policy-measurement'],
  ['policyRatification', 'policy-ratification'],
  ['operatorEvidence', 'operator-evidence'],
  ['releaseProvider', 'release-provider'],
  ['canaryResult', 'canary-result'],
];

const RollbackSchema = z
  .object({
    mode: z.enum(['primary', 'rollback']),
    recoveryContextSha256: Sha256HexSchema,
    targetMainSha: SourceShaSchema,
  })
  .strict();

const SourceSchema = z
  .object({
    repository: GitHubRepositorySchema,
    sha: SourceShaSchema,
    releaseMode: z.enum(['primary', 'rollback']),
    pullRequest: PullRequestNumberSchema,
    pullRequestHeadSha: SourceShaSchema,
    planApprovalPullRequest: PullRequestNumberSchema.nullable(),
    planPath: RepoRelativePathSchema.nullable(),
    planSha256: Sha256HexSchema.nullable(),
  })
  .strict();

export const ReleaseEvidenceManifestV1Schema = z
  .object({
    schemaVersion: z.literal('release-evidence-manifest-v1'),
    designation: z.enum(['infrastructure_only', 'activation_candidate']),
    candidate: z.boolean(),
    source: SourceSchema,
    approval: ApprovalSchema.nullable(),
    certification: CertificationSchema,
    workflow: WorkflowSchema,
    schema: SchemaSectionSchema.nullable(),
    policy: PolicySchema,
    prechange: PrechangeSchema,
    release: ReleaseSectionSchema.nullable(),
    operatorEvidence: OperatorEvidenceFragmentPayloadSchema.nullable(),
    canary: CanarySectionSchema.nullable(),
    h9Artifact: H9ArtifactSchema.nullable(),
    fragmentLineage: FragmentLineageMapSchema,
    rollback: RollbackSchema,
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const issue = (path: Array<string | number>, message: string): void => {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
    };
    const { source, approval, certification, workflow, policy } = manifest;
    const sourcePlanFields = [source.planApprovalPullRequest, source.planPath, source.planSha256];
    const hasAllSourcePlanFields = sourcePlanFields.every((value) => value !== null);
    const hasNoSourcePlanFields = sourcePlanFields.every((value) => value === null);
    if (!hasAllSourcePlanFields && !hasNoSourcePlanFields) {
      issue(['source'], 'source plan provenance fields must be all-null or all-non-null');
    }
    if ((approval !== null) !== hasAllSourcePlanFields) {
      issue(['approval'], 'approval must be non-null iff source plan provenance is complete');
    }

    if (manifest.candidate !== (manifest.designation === 'activation_candidate')) {
      issue(['candidate'], 'candidate must be true iff designation is activation_candidate');
    }

    if (approval !== null) {
      if (approval.repository !== source.repository) {
        issue(['approval', 'repository'], 'approval.repository must equal source.repository');
      }
      if (
        source.planApprovalPullRequest != null &&
        approval.pullRequest !== source.planApprovalPullRequest
      ) {
        issue(
          ['approval', 'pullRequest'],
          'approval.pullRequest must equal source.planApprovalPullRequest'
        );
      }
      if (source.planPath != null && approval.planPath !== source.planPath) {
        issue(['approval', 'planPath'], 'approval.planPath must equal source.planPath');
      }
      if (source.planSha256 != null && approval.planSha256 !== source.planSha256) {
        issue(['approval', 'planSha256'], 'approval.planSha256 must equal source.planSha256');
      }
      if (approval.finalHeadCiGate.headSha !== approval.verifiedPrHeadSha) {
        issue(
          ['approval', 'finalHeadCiGate', 'headSha'],
          'finalHeadCiGate.headSha must equal approval.verifiedPrHeadSha'
        );
      }
      if (source.releaseMode === 'primary') {
        if (approval.verifiedPrHeadSha !== source.pullRequestHeadSha) {
          issue(
            ['approval', 'verifiedPrHeadSha'],
            'In primary mode approval.verifiedPrHeadSha must equal source.pullRequestHeadSha'
          );
        }
        if (
          source.planApprovalPullRequest != null &&
          source.pullRequest !== source.planApprovalPullRequest
        ) {
          issue(
            ['source', 'pullRequest'],
            'In primary mode source.pullRequest must equal source.planApprovalPullRequest'
          );
        }
      }
    }

    if (certification.sourceSha !== source.sha) {
      issue(['certification', 'sourceSha'], 'certification.sourceSha must equal source.sha');
    }
    if (certification.runId !== workflow.runId) {
      issue(['certification', 'runId'], 'certification.runId must equal workflow.runId');
    }
    if (certification.runAttempt !== workflow.runAttempt) {
      issue(
        ['certification', 'runAttempt'],
        'certification.runAttempt must equal workflow.runAttempt'
      );
    }
    const expectedProofRef = `${source.repository}/.github/workflows/release-proof.yml@${source.sha}`;
    if (certification.proofWorkflowRef !== expectedProofRef) {
      issue(
        ['certification', 'proofWorkflowRef'],
        'proofWorkflowRef must be <repository>/.github/workflows/release-proof.yml@<sourceSha>'
      );
    }
    const certificationSuffix = `${certification.runId}-${certification.runAttempt}-${certification.sourceSha}`;
    if (
      certification.certificationArtifact.artifactName !==
      `release-proof-certification-v1-${certificationSuffix}`
    ) {
      issue(
        ['certification', 'certificationArtifact', 'artifactName'],
        'Certification artifact name must be release-proof-certification-v1-<runId>-<runAttempt>-<sourceSha>'
      );
    }
    if (
      certification.lineageArtifact.artifactName !==
      `release-proof-lineage-v1-${certificationSuffix}`
    ) {
      issue(
        ['certification', 'lineageArtifact', 'artifactName'],
        'Lineage artifact name must be release-proof-lineage-v1-<runId>-<runAttempt>-<sourceSha>'
      );
    }

    const expectedManifestName = `release-evidence-manifest-v1-${workflow.runId}-${workflow.runAttempt}-${source.sha}`;
    if (workflow.manifestArtifactName !== expectedManifestName) {
      issue(
        ['workflow', 'manifestArtifactName'],
        'manifestArtifactName must be release-evidence-manifest-v1-<runId>-<runAttempt>-<sourceSha>'
      );
    }
    if (Date.parse(workflow.manifestBuiltAt) < Date.parse(workflow.startedAt)) {
      issue(['workflow', 'manifestBuiltAt'], 'manifestBuiltAt must not precede startedAt');
    }
    if ((workflow.preManifestOutcome === 'success') !== (workflow.failureStage === null)) {
      issue(
        ['workflow', 'failureStage'],
        'failureStage must be null iff preManifestOutcome is success'
      );
    }

    if (manifest.schema !== null) {
      const { schema } = manifest;
      if (schema.apply.sourceSha !== schema.precursorSha) {
        issue(
          ['schema', 'apply', 'sourceSha'],
          'schema.apply.sourceSha must equal schema.precursorSha'
        );
      }
      const expectedApplyName = `prod-schema-reconcile-${schema.apply.runId}-1-apply-${schema.precursorSha}`;
      if (schema.apply.artifactName !== expectedApplyName) {
        issue(
          ['schema', 'apply', 'artifactName'],
          'schema.apply.artifactName must be prod-schema-reconcile-<runId>-1-apply-<precursorSha>'
        );
      }
      if (
        schema.audit.runId !== workflow.runId ||
        schema.audit.runAttempt !== workflow.runAttempt
      ) {
        issue(
          ['schema', 'audit'],
          'schema.audit must record the current release run id and attempt'
        );
      }
      if (schema.audit.sourceSha !== source.sha) {
        issue(['schema', 'audit', 'sourceSha'], 'schema.audit.sourceSha must equal source.sha');
      }
    }

    if (!vectorEqualsReserved(policy.reservedPerRun)) {
      issue(
        ['policy', 'reservedPerRun'],
        'reservedPerRun must exactly equal the frozen reserved vector'
      );
    }
    const capsAreTripleReserved =
      policy.configuredCaps.total === 120 &&
      RELEASE_CANARY_RESIDUE_GROUP_KEYS.every(
        (key) => policy.configuredCaps[key] === policy.reservedPerRun[key] * 3
      );
    if (!capsAreTripleReserved) {
      issue(
        ['policy', 'configuredCaps'],
        'configuredCaps must be component-wise exactly 3x reserved with total 120'
      );
    }
    if (policy.characterizationEvidence !== null) {
      if (policy.characterizationEvidence.sourceSha !== source.sha) {
        issue(
          ['policy', 'characterizationEvidence', 'sourceSha'],
          'characterizationEvidence.sourceSha must equal source.sha'
        );
      }
      const expectedCharacterizationName = `release-canary-residue-characterization-v1-${workflow.runId}-${workflow.runAttempt}-${source.sha}`;
      if (policy.characterizationEvidence.artifactName !== expectedCharacterizationName) {
        issue(
          ['policy', 'characterizationEvidence', 'artifactName'],
          'characterizationEvidence.artifactName must be release-canary-residue-characterization-v1-<runId>-<runAttempt>-<sourceSha>'
        );
      }
    }
    if (policy.ratification !== null) {
      const { ratification } = policy;
      if (
        policy.characterizationEvidence !== null &&
        ratification.characterizationFileSha256 !== policy.characterizationEvidence.fileSha256
      ) {
        issue(
          ['policy', 'ratification', 'characterizationFileSha256'],
          'ratification.characterizationFileSha256 must equal characterizationEvidence.fileSha256'
        );
      }
      if (
        ratification.policyConfigPayloadSha256 !==
        manifest.fragmentLineage.policyConfig.payloadSha256
      ) {
        issue(
          ['policy', 'ratification', 'policyConfigPayloadSha256'],
          'ratification.policyConfigPayloadSha256 must equal fragmentLineage.policyConfig.payloadSha256'
        );
      }
      if (
        manifest.fragmentLineage.policyMeasurement !== null &&
        ratification.policyMeasurementPayloadSha256 !==
          manifest.fragmentLineage.policyMeasurement.payloadSha256
      ) {
        issue(
          ['policy', 'ratification', 'policyMeasurementPayloadSha256'],
          'ratification.policyMeasurementPayloadSha256 must equal fragmentLineage.policyMeasurement.payloadSha256'
        );
      }
      if (
        manifest.fragmentLineage.canaryResult !== null &&
        ratification.canaryResultPayloadSha256 !==
          manifest.fragmentLineage.canaryResult.payloadSha256
      ) {
        issue(
          ['policy', 'ratification', 'canaryResultPayloadSha256'],
          'ratification.canaryResultPayloadSha256 must equal fragmentLineage.canaryResult.payloadSha256'
        );
      }
      if (Date.parse(ratification.verifiedAt) < Date.parse(workflow.startedAt)) {
        issue(
          ['policy', 'ratification', 'verifiedAt'],
          'ratification.verifiedAt must not precede workflow.startedAt'
        );
      }
    }

    if (manifest.rollback.recoveryContextSha256 !== manifest.prechange.baseline.contextFileSha256) {
      issue(
        ['rollback', 'recoveryContextSha256'],
        'rollback.recoveryContextSha256 must equal prechange.baseline.contextFileSha256'
      );
    }
    if (manifest.rollback.targetMainSha !== manifest.prechange.baseline.baselineMainSha) {
      issue(
        ['rollback', 'targetMainSha'],
        'rollback.targetMainSha must equal prechange.baseline.baselineMainSha'
      );
    }
    if (manifest.rollback.mode !== source.releaseMode) {
      issue(['rollback', 'mode'], 'rollback.mode must equal source.releaseMode');
    }

    if (manifest.release !== null) {
      if (manifest.release.vercel.sourceSha !== source.sha) {
        issue(['release', 'vercel', 'sourceSha'], 'release.vercel.sourceSha must equal source.sha');
      }
      manifest.release.railway.services.forEach((service, index) => {
        if (service.sourceSha !== source.sha) {
          issue(
            ['release', 'railway', 'services', index, 'sourceSha'],
            'release.railway service sourceSha must equal source.sha'
          );
        }
      });
    }

    if (manifest.canary !== null) {
      if (manifest.canary.execution.releaseSha !== source.sha) {
        issue(
          ['canary', 'execution', 'releaseSha'],
          'canary.execution.releaseSha must equal source.sha'
        );
      }
      if (
        manifest.canary.execution.githubRunId !== workflow.runId ||
        manifest.canary.execution.githubRunAttempt !== workflow.runAttempt
      ) {
        issue(
          ['canary', 'execution'],
          'canary.execution must record the current release run id and attempt'
        );
      }
    }

    for (const [key, kind] of FRAGMENT_LINEAGE_KINDS) {
      const lineage = manifest.fragmentLineage[key];
      if (lineage === null) continue;
      if (lineage.kind !== kind) {
        issue(['fragmentLineage', key, 'kind'], `fragmentLineage.${key}.kind must be ${kind}`);
      }
      if (lineage.producerJob !== RELEASE_EVIDENCE_FRAGMENT_PRODUCER_JOBS[kind]) {
        issue(
          ['fragmentLineage', key, 'producerJob'],
          `fragmentLineage.${key}.producerJob must be ${RELEASE_EVIDENCE_FRAGMENT_PRODUCER_JOBS[kind]}`
        );
      }
      if (lineage.runId !== workflow.runId || lineage.runAttempt !== workflow.runAttempt) {
        issue(
          ['fragmentLineage', key],
          `fragmentLineage.${key} must record the current release run id and attempt`
        );
      }
      if (lineage.sourceSha !== source.sha) {
        issue(
          ['fragmentLineage', key, 'sourceSha'],
          `fragmentLineage.${key}.sourceSha must equal source.sha`
        );
      }
      const expectedFragmentName = `release-evidence-fragment-v1-${kind}-${workflow.runId}-${workflow.runAttempt}-${source.sha}`;
      if (lineage.artifactName !== expectedFragmentName) {
        issue(
          ['fragmentLineage', key, 'artifactName'],
          `fragmentLineage.${key}.artifactName must be release-evidence-fragment-v1-${kind}-<runId>-<runAttempt>-<sourceSha>`
        );
      }
    }

    if (workflow.preManifestOutcome === 'success') {
      const requireNonnull: ReadonlyArray<readonly [Array<string>, unknown]> = [
        [['schema'], manifest.schema],
        [['operatorEvidence'], manifest.operatorEvidence],
        [['release'], manifest.release],
        [['canary'], manifest.canary],
        [['h9Artifact'], manifest.h9Artifact],
        [['policy', 'stagedMeasuredResidue'], policy.stagedMeasuredResidue],
        [['policy', 'characterizationEvidence'], policy.characterizationEvidence],
        [['fragmentLineage', 'schema'], manifest.fragmentLineage.schema],
        [['fragmentLineage', 'policyMeasurement'], manifest.fragmentLineage.policyMeasurement],
        [['fragmentLineage', 'operatorEvidence'], manifest.fragmentLineage.operatorEvidence],
        [['fragmentLineage', 'releaseProvider'], manifest.fragmentLineage.releaseProvider],
        [['fragmentLineage', 'canaryResult'], manifest.fragmentLineage.canaryResult],
      ];
      for (const [path, value] of requireNonnull) {
        if (value === null) {
          issue(path, `${path.join('.')} must be nonnull when preManifestOutcome is success`);
        }
      }
      if (
        policy.stagedMeasuredResidue !== null &&
        !vectorEqualsReserved(policy.stagedMeasuredResidue)
      ) {
        issue(
          ['policy', 'stagedMeasuredResidue'],
          'Successful releases require stagedMeasuredResidue to exactly equal the reserved vector'
        );
      }
      if (certification.conclusion !== 'success') {
        issue(
          ['certification', 'conclusion'],
          'certification.conclusion must be success when preManifestOutcome is success'
        );
      }
    }
  });

export type ReleaseEvidenceManifestV1 = z.infer<typeof ReleaseEvidenceManifestV1Schema>;

const SECRET_KEY_PATTERN = /(password|secret|token|credential|authorization)/i;
const SECRET_VALUE_PATTERNS: readonly RegExp[] = [
  /postgres(?:ql)?:\/\//i,
  /-----BEGIN/,
  /^(gh[pousr]|github_pat)_/,
  /^Bearer /,
  /^\/(Users|home|tmp|private)\//,
  /^[A-Za-z]:\\/,
];
const BASE64_BLOB_PATTERN = /[A-Za-z0-9+/=_-]{513,}/;

export function scanForSecretShapedContent(value: unknown): string[] {
  const violations: string[] = [];
  const walk = (node: unknown, path: string): void => {
    if (typeof node === 'string') {
      if (node.length > 2048) {
        violations.push(`${path}: string exceeds 2048 characters`);
      }
      if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(node))) {
        violations.push(`${path}: secret-shaped string value`);
      } else if (BASE64_BLOB_PATTERN.test(node)) {
        violations.push(`${path}: base64 blob exceeds 512 characters`);
      }
      return;
    }
    if (typeof node === 'number') {
      if (!Number.isFinite(node) || Math.abs(node) > Number.MAX_SAFE_INTEGER) {
        violations.push(`${path}: number outside safe integer range`);
      }
      return;
    }
    if (Array.isArray(node)) {
      if (node.length > 64) {
        violations.push(`${path}: array exceeds 64 entries`);
      }
      node.forEach((entry, index) => walk(entry, `${path}[${index}]`));
      return;
    }
    if (node !== null && typeof node === 'object') {
      for (const [key, entry] of Object.entries(node)) {
        if (SECRET_KEY_PATTERN.test(key)) {
          violations.push(`${path}.${key}: secret-shaped key name`);
        }
        walk(entry, `${path}.${key}`);
      }
    }
  };
  walk(value, '$');
  return violations;
}

export function parseReleaseEvidenceManifest(value: unknown): ReleaseEvidenceManifestV1 {
  const violations = scanForSecretShapedContent(value);
  if (violations.length > 0) {
    throw new Error(`Secret-shaped or oversized manifest content: ${violations.join('; ')}`);
  }
  return ReleaseEvidenceManifestV1Schema.parse(value);
}
