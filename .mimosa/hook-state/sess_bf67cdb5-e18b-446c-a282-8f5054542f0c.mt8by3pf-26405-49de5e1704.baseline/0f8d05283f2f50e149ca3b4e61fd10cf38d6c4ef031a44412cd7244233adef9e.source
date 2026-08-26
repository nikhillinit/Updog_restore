import { z } from 'zod';

import {
  RELEASE_CANARY_RESERVED_RESIDUE,
  RELEASE_CANARY_RESIDUE_GROUP_KEYS,
  type ResidueVector,
} from './release-canary-residue-characterization-v1.contract';
import { sha256CanonicalJson } from '../lib/canonical-json';

export const RELEASE_EVIDENCE_FRAGMENT_KINDS = [
  'baseline',
  'schema',
  'policy-config',
  'policy-measurement',
  'policy-ratification',
  'operator-evidence',
  'release-provider',
  'canary-result',
] as const;

export type ReleaseEvidenceFragmentKind = (typeof RELEASE_EVIDENCE_FRAGMENT_KINDS)[number];

// Canonical payload digest used by builders, workflows, and the envelope schema.
export function sha256CanonicalJsonOfPayload(payload: unknown): string {
  return sha256CanonicalJson(payload);
}

export const RELEASE_EVIDENCE_FRAGMENT_PRODUCER_JOBS = Object.freeze({
  baseline: 'baseline-policy-preflight',
  schema: 'schema-audit',
  'policy-config': 'baseline-policy-preflight',
  'policy-measurement': 'staged-smoke',
  'policy-ratification': 'policy-ratification',
  'operator-evidence': 'g4-operator-evidence',
  'release-provider': 'promote',
  'canary-result': 'staged-smoke',
} as const) satisfies Readonly<Record<ReleaseEvidenceFragmentKind, string>>;

const PositiveDecimalIdSchema = z
  .string()
  .regex(/^[1-9][0-9]{0,31}$/, 'Identifier must be a positive decimal string');
const RunAttemptSchema = z.number().int().min(1).max(100);
const SourceShaSchema = z.string().regex(/^[a-f0-9]{40}$/, 'Source SHA must be lowercase SHA-1');
const Sha256HexSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, 'Digest must be lowercase 64-hex SHA-256');
const ArtifactNameSchema = z.string().min(1).max(2048);
// Mirrors IDENTIFIER in scripts/release/capture-release-recovery-context.mjs.
const ProviderIdentifierSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/, 'Provider identifier is invalid');
// Mirrors hostname() in scripts/release/capture-release-recovery-context.mjs.
const HostnameSchema = z
  .string()
  .max(253)
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/,
    'Hostname must be a lowercase dotted DNS name'
  )
  .refine((value) => value.split('.').every((segment) => segment.length <= 63), {
    message: 'Hostname segments must be at most 63 characters',
  });
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
const GitHubRunUrlSchema = z
  .string()
  .max(2048)
  .regex(/^https:\/\/github\.com\/[^\s?#]{1,2000}$/, 'Run URL must be an https github.com URL');
const GitHubLoginSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/, 'Reviewer login must be a GitHub login');

const ResidueCountSchema = z.number().int().min(0).max(10_000);

// The characterization contract does not export its vector schema, so this is a
// structurally identical rebuild pinned to the same exported group keys/type.
export const ResidueVectorSchema = z
  .object({
    portfolioCompany: ResidueCountSchema,
    fund: ResidueCountSchema,
    fundConfig: ResidueCountSchema,
    fundEvent: ResidueCountSchema,
    notification: ResidueCountSchema,
    grant: ResidueCountSchema,
    calculation: ResidueCountSchema,
    mutationReceipt: ResidueCountSchema,
    scenario: ResidueCountSchema,
    reporting: ResidueCountSchema,
    total: ResidueCountSchema,
  })
  .strict()
  .superRefine((vector, ctx) => {
    const sum = RELEASE_CANARY_RESIDUE_GROUP_KEYS.reduce((acc, key) => acc + vector[key], 0);
    if (vector.total !== sum) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['total'],
        message: 'Residue total must equal the sum of the ten group counts',
      });
    }
  });

// Compile-time parity between the rebuilt schema and the frozen contract type.
const RESERVED_RESIDUE: z.infer<typeof ResidueVectorSchema> = RELEASE_CANARY_RESERVED_RESIDUE;

export const vectorEqualsReserved = (vector: ResidueVector): boolean =>
  vector.total === RESERVED_RESIDUE.total &&
  RELEASE_CANARY_RESIDUE_GROUP_KEYS.every((key) => vector[key] === RESERVED_RESIDUE[key]);

export const VercelIdentitySchema = z
  .object({
    projectId: ProviderIdentifierSchema,
    deploymentId: ProviderIdentifierSchema,
    hostname: HostnameSchema,
    sourceSha: SourceShaSchema,
  })
  .strict();

const railwayServiceSchema = <N extends string>(serviceName: N) =>
  z
    .object({
      serviceName: z.literal(serviceName),
      serviceId: ProviderIdentifierSchema,
      deploymentId: ProviderIdentifierSchema,
      sourceSha: SourceShaSchema,
    })
    .strict();

export const RailwayIdentitySchema = z
  .object({
    projectId: ProviderIdentifierSchema,
    environmentId: ProviderIdentifierSchema,
    services: z.tuple([
      railwayServiceSchema('fund-scenario-calc'),
      railwayServiceSchema('capital-call-status'),
    ]),
  })
  .strict();

export const BaselineFragmentPayloadSchema = z
  .object({
    prechange: z
      .object({
        vercel: VercelIdentitySchema,
        railway: RailwayIdentitySchema,
      })
      .strict(),
    rollback: z
      .object({
        targetMainSha: SourceShaSchema,
        recoveryContextSha256: Sha256HexSchema,
      })
      .strict(),
    baselineArtifact: z
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
  })
  .strict()
  .superRefine((payload, ctx) => {
    if (payload.rollback.targetMainSha !== payload.baselineArtifact.baselineMainSha) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rollback', 'targetMainSha'],
        message: 'rollback.targetMainSha must equal baselineArtifact.baselineMainSha',
      });
    }
    if (payload.rollback.recoveryContextSha256 !== payload.baselineArtifact.contextFileSha256) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rollback', 'recoveryContextSha256'],
        message: 'rollback.recoveryContextSha256 must equal baselineArtifact.contextFileSha256',
      });
    }
  });

export const SchemaFragmentPayloadSchema = z
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
  .strict()
  .superRefine((payload, ctx) => {
    if (payload.apply.sourceSha !== payload.precursorSha) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['apply', 'sourceSha'],
        message: 'apply.sourceSha must equal precursorSha',
      });
    }
    const expectedApplyName = `prod-schema-reconcile-${payload.apply.runId}-1-apply-${payload.precursorSha}`;
    if (payload.apply.artifactName !== expectedApplyName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['apply', 'artifactName'],
        message: 'apply.artifactName must be prod-schema-reconcile-<runId>-1-apply-<precursorSha>',
      });
    }
  });

export const PolicyConfigFragmentPayloadSchema = z
  .object({
    reservedPerRun: ResidueVectorSchema,
    configuredCaps: ResidueVectorSchema,
    retainedRunBudget: z.literal(3),
    ttlHours: z.literal(24),
  })
  .strict()
  .superRefine((payload, ctx) => {
    if (!vectorEqualsReserved(payload.reservedPerRun)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reservedPerRun'],
        message: 'reservedPerRun must exactly equal the frozen reserved vector',
      });
    }
    const capsAreTripleReserved =
      payload.configuredCaps.total === RESERVED_RESIDUE.total * 3 &&
      RELEASE_CANARY_RESIDUE_GROUP_KEYS.every(
        (key) => payload.configuredCaps[key] === RESERVED_RESIDUE[key] * 3
      );
    if (!capsAreTripleReserved) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['configuredCaps'],
        message: 'configuredCaps must be component-wise exactly 3x reserved with total 120',
      });
    }
  });

export const PolicyMeasurementFragmentPayloadSchema = z
  .object({
    residue: ResidueVectorSchema,
  })
  .strict()
  .superRefine((payload, ctx) => {
    if (!vectorEqualsReserved(payload.residue)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['residue'],
        message: 'Staged measured residue must exactly equal the frozen reserved vector',
      });
    }
  });

export const PolicyRatificationFragmentPayloadSchema = z
  .object({
    environmentId: PositiveDecimalIdSchema,
    environmentName: z.literal('Production Policy Ratification'),
    reviewerLogin: GitHubLoginSchema,
    reviewerPermission: z.enum(['admin', 'maintain', 'write']),
    approvalState: z.literal('approved'),
    commentSha256: Sha256HexSchema,
    policyConfigPayloadSha256: Sha256HexSchema,
    policyMeasurementPayloadSha256: Sha256HexSchema,
    characterizationFileSha256: Sha256HexSchema,
    canaryResultPayloadSha256: Sha256HexSchema,
    verifiedAt: IsoUtcSchema,
  })
  .strict();

export const OperatorEvidenceFragmentPayloadSchema = z
  .object({
    bundleSha256: Sha256HexSchema,
    capturedAt: IsoUtcSchema,
    verifiedAt: IsoUtcSchema,
  })
  .strict()
  .superRefine((payload, ctx) => {
    if (Date.parse(payload.verifiedAt) < Date.parse(payload.capturedAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['verifiedAt'],
        message: 'verifiedAt must not precede capturedAt',
      });
    }
  });

// Frozen to mirror release-recovery-context-v1 provider identity exactly.
export const ReleaseProviderFragmentPayloadSchema = z
  .object({
    vercel: VercelIdentitySchema,
    railway: RailwayIdentitySchema,
  })
  .strict();

export const CanaryResultFragmentPayloadSchema = z
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
    h9Artifact: z
      .object({
        // The stored report export and package carry positive-integer IDs
        // (reportPackageExportId / reportPackageId) — no UUID identity exists
        // on canary 6's validated H9 surface.
        recordId: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
        packageId: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
        contentHash: Sha256HexSchema,
        fingerprint: Sha256HexSchema,
        sizeBytes: z.number().int().min(1).max(1_000_000_000),
      })
      .strict(),
  })
  .strict();

const fragmentEnvelopeSchema = <K extends ReleaseEvidenceFragmentKind, P extends z.ZodTypeAny>(
  kind: K,
  payload: P
) =>
  z
    .object({
      schemaVersion: z.literal('release-evidence-fragment-v1'),
      kind: z.literal(kind),
      runId: PositiveDecimalIdSchema,
      runAttempt: RunAttemptSchema,
      sourceSha: SourceShaSchema,
      producerJob: z.literal(RELEASE_EVIDENCE_FRAGMENT_PRODUCER_JOBS[kind]),
      createdAt: IsoUtcSchema,
      payloadSha256: Sha256HexSchema,
      payload,
    })
    .strict();

export const ReleaseEvidenceFragmentV1Schema = z
  .discriminatedUnion('kind', [
    fragmentEnvelopeSchema('baseline', BaselineFragmentPayloadSchema),
    fragmentEnvelopeSchema('schema', SchemaFragmentPayloadSchema),
    fragmentEnvelopeSchema('policy-config', PolicyConfigFragmentPayloadSchema),
    fragmentEnvelopeSchema('policy-measurement', PolicyMeasurementFragmentPayloadSchema),
    fragmentEnvelopeSchema('policy-ratification', PolicyRatificationFragmentPayloadSchema),
    fragmentEnvelopeSchema('operator-evidence', OperatorEvidenceFragmentPayloadSchema),
    fragmentEnvelopeSchema('release-provider', ReleaseProviderFragmentPayloadSchema),
    fragmentEnvelopeSchema('canary-result', CanaryResultFragmentPayloadSchema),
  ])
  .superRefine((fragment, ctx) => {
    if (fragment.payloadSha256 !== sha256CanonicalJsonOfPayload(fragment.payload)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payloadSha256'],
        message: 'payloadSha256 must equal sha256CanonicalJson(payload)',
      });
    }
  });

export type ReleaseEvidenceFragmentV1 = z.infer<typeof ReleaseEvidenceFragmentV1Schema>;

export function parseReleaseEvidenceFragment(value: unknown): ReleaseEvidenceFragmentV1 {
  return ReleaseEvidenceFragmentV1Schema.parse(value);
}
