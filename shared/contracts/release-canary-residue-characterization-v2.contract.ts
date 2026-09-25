import { z } from 'zod';

import {
  RELEASE_CANARY_RESERVED_RESIDUE,
  RELEASE_CANARY_RESIDUE_GROUP_KEYS,
  parseReleaseCanaryResidueCharacterization,
  type ReleaseCanaryResidueCharacterizationV1,
  type ResidueVector,
} from './release-canary-residue-characterization-v1.contract';
import { sha256CanonicalJson } from '../lib/canonical-json';

export const RELEASE_CANARY_HTTP_WORKFLOW_RESERVATION_IDENTITY =
  'release-canary-http-workflow-v2' as const;

export const RELEASE_CANARY_HTTP_WORKFLOW_RESERVED_RESIDUE: Readonly<ResidueVector> = Object.freeze(
  {
    portfolioCompany: 1,
    fund: 1,
    fundConfig: 1,
    fundEvent: 5,
    notification: 0,
    grant: 1,
    calculation: 12,
    mutationReceipt: 5,
    scenario: 7,
    reporting: 11,
    total: 44,
  }
);

const ResidueCountSchema = z.number().int().min(0).max(10_000);

const ResidueVectorSchema = z
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

const vectorEquals = (a: ResidueVector, b: ResidueVector): boolean =>
  a.total === b.total && RELEASE_CANARY_RESIDUE_GROUP_KEYS.every((key) => a[key] === b[key]);

const vectorAdd = (a: ResidueVector, b: ResidueVector): ResidueVector => ({
  portfolioCompany: a.portfolioCompany + b.portfolioCompany,
  fund: a.fund + b.fund,
  fundConfig: a.fundConfig + b.fundConfig,
  fundEvent: a.fundEvent + b.fundEvent,
  notification: a.notification + b.notification,
  grant: a.grant + b.grant,
  calculation: a.calculation + b.calculation,
  mutationReceipt: a.mutationReceipt + b.mutationReceipt,
  scenario: a.scenario + b.scenario,
  reporting: a.reporting + b.reporting,
  total: a.total + b.total,
});

const vectorSubtract = (a: ResidueVector, b: ResidueVector): ResidueVector => ({
  portfolioCompany: a.portfolioCompany - b.portfolioCompany,
  fund: a.fund - b.fund,
  fundConfig: a.fundConfig - b.fundConfig,
  fundEvent: a.fundEvent - b.fundEvent,
  notification: a.notification - b.notification,
  grant: a.grant - b.grant,
  calculation: a.calculation - b.calculation,
  mutationReceipt: a.mutationReceipt - b.mutationReceipt,
  scenario: a.scenario - b.scenario,
  reporting: a.reporting - b.reporting,
  total: a.total - b.total,
});

const HTTP_COMMAND_DELTA: Readonly<ResidueVector> = Object.freeze({
  portfolioCompany: 0,
  fund: 0,
  fundConfig: 0,
  fundEvent: 1,
  notification: 0,
  grant: 0,
  calculation: 0,
  mutationReceipt: 3,
  scenario: 0,
  reporting: 0,
  total: 4,
});

const SourceShaSchema = z.string().regex(/^[a-f0-9]{40}$/, 'Source SHA must be lowercase SHA-1');
const PositiveDecimalIdSchema = z
  .string()
  .regex(/^[1-9][0-9]{0,31}$/, 'Identifier must be a positive decimal string');
const RunAttemptSchema = z.number().int().min(1).max(100);
const UuidSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    'Identifier must be a lowercase UUID'
  );
const Sha256HexSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, 'Digest must be lowercase 64-hex SHA-256');
const PhaseNameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'Phase name must be kebab/word-safe');

const NamedResidueSchema = z
  .object({
    name: PhaseNameSchema,
    residue: ResidueVectorSchema,
  })
  .strict();

const DirectFundForeignKeySchema = z
  .object({
    table: z.string().min(1),
    column: z.string().min(1),
  })
  .strict();

const SNAPSHOT_TYPES = ['COHORT', 'ECONOMICS', 'PACING', 'RESERVE', 'SCENARIOS'] as const;

const SnapshotTypeCountsSchema = z
  .array(
    z
      .object({
        type: z.enum(SNAPSHOT_TYPES),
        count: ResidueCountSchema,
      })
      .strict()
  )
  .length(SNAPSHOT_TYPES.length)
  .superRefine((counts, ctx) => {
    if (counts.some((entry, index) => entry.type !== SNAPSHOT_TYPES[index])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['snapshotTypeCounts'],
        message: 'snapshotTypeCounts must contain every expected type in deterministic order',
      });
    }
  });

const StoredRunSchema = z
  .object({
    releaseSha: SourceShaSchema,
    status: z.literal('completed'),
    version: z.literal(2),
  })
  .strict();

const BaseProvenanceShape = {
  executionPath: z.literal('FundPersistenceService.createFundWithInitialDraft'),
  databaseTimeZone: z.literal('Etc/UTC'),
  storedRun: StoredRunSchema,
  fundDataOrigins: z.array(z.literal('release_canary')).length(1),
  flagState: z
    .object({
      enableGpEconomicsEngine: z.boolean(),
      cohortCalculationInvoked: z.literal(false),
    })
    .strict(),
  snapshotTypeCounts: SnapshotTypeCountsSchema,
  directFundForeignKeys: z.array(DirectFundForeignKeySchema).min(1),
};

const V2ProvenanceSchema = z
  .object({
    ...BaseProvenanceShape,
    workflowRunId: PositiveDecimalIdSchema,
    workflowRunAttempt: RunAttemptSchema,
    databaseCanaryRunId: UuidSchema,
    serviceCharacterizationPayloadSha256: Sha256HexSchema,
    httpFundProofPayloadSha256: Sha256HexSchema,
    bindingSha256: Sha256HexSchema,
  })
  .strict()
  .superRefine((provenance, ctx) => {
    if (
      provenance.directFundForeignKeys.some((key, index, values) => {
        const previous = values[index - 1];
        return (
          previous !== undefined &&
          `${key.table}.${key.column}` < `${previous.table}.${previous.column}`
        );
      })
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['directFundForeignKeys'],
        message: 'directFundForeignKeys must be sorted',
      });
    }
  });

const SECRET_KEY_PATTERN = /(password|secret|token|credential)/i;
const SECRET_VALUE_PATTERNS: readonly RegExp[] = [
  /postgres(?:ql)?:\/\//i,
  /rediss?:\/\//i,
  /\bBearer\s+\S+/,
];
const GIT_SHA_SHAPE = /^[a-f0-9]{40}$/;
const SHA256_SHAPE = /^[a-f0-9]{64}$/;
const BASE64ISH_BLOB_PATTERN = /[A-Za-z0-9+/=_]{40,}/;

function scanForSecretShapedContent(value: unknown, path: string): void {
  if (typeof value === 'string') {
    if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
      throw new Error(`Secret-shaped string value at ${path}`);
    }
    if (
      BASE64ISH_BLOB_PATTERN.test(value) &&
      !GIT_SHA_SHAPE.test(value) &&
      !SHA256_SHAPE.test(value)
    ) {
      throw new Error(`Secret-shaped blob value at ${path}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanForSecretShapedContent(entry, `${path}[${index}]`));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        throw new Error(`Secret-shaped key "${key}" at ${path}`);
      }
      scanForSecretShapedContent(entry, `${path}.${key}`);
    }
  }
}

export const ReleaseCanaryHttpFundProofV2Schema = z
  .object({
    schemaVersion: z.literal('release-canary-http-fund-proof-v2'),
    sourceSha: SourceShaSchema,
    workflowRunId: PositiveDecimalIdSchema,
    workflowRunAttempt: RunAttemptSchema,
    databaseCanaryRunId: UuidSchema,
    reservationIdentity: z.literal(RELEASE_CANARY_HTTP_WORKFLOW_RESERVATION_IDENTITY),
    observedFundPhaseResidue: ResidueVectorSchema,
    replayZeroGrowth: z.literal(true),
    overCapZeroGrowth: z.literal(true),
    result: z.literal('passed'),
  })
  .strict();

export type ReleaseCanaryHttpFundProofV2 = z.infer<typeof ReleaseCanaryHttpFundProofV2Schema>;

export function parseReleaseCanaryHttpFundProofV2(value: unknown): ReleaseCanaryHttpFundProofV2 {
  scanForSecretShapedContent(value, '$');
  return ReleaseCanaryHttpFundProofV2Schema.parse(value);
}

export const ReleaseCanaryResidueCharacterizationV2Schema = z
  .object({
    schemaVersion: z.literal('release-canary-residue-characterization-v2'),
    sourceSha: SourceShaSchema,
    contractVersion: z.literal('release-canary-residue-characterization-v2'),
    reservationIdentity: z.literal(RELEASE_CANARY_HTTP_WORKFLOW_RESERVATION_IDENTITY),
    reservedResidue: ResidueVectorSchema,
    phases: z.array(NamedResidueSchema).min(1).max(64),
    finalResidue: ResidueVectorSchema,
    failureBoundaries: z.array(NamedResidueSchema).min(1).max(64),
    provenance: V2ProvenanceSchema,
    result: z.literal('passed'),
  })
  .strict()
  .superRefine((record, ctx) => {
    if (record.sourceSha !== record.provenance.storedRun.releaseSha) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['provenance', 'storedRun', 'releaseSha'],
        message: 'sourceSha must equal provenance.storedRun.releaseSha',
      });
    }
    if (!vectorEquals(record.reservedResidue, RELEASE_CANARY_HTTP_WORKFLOW_RESERVED_RESIDUE)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reservedResidue'],
        message: 'reservedResidue must exactly equal the HTTP workflow reserved vector',
      });
    }
    if (!vectorEquals(record.finalResidue, RELEASE_CANARY_HTTP_WORKFLOW_RESERVED_RESIDUE)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['finalResidue'],
        message: 'finalResidue must exactly equal the HTTP workflow reserved vector',
      });
    }
    for (let i = 1; i < record.phases.length; i += 1) {
      const previous = record.phases[i - 1]!.residue;
      const current = record.phases[i]!.residue;
      const regressed = RELEASE_CANARY_RESIDUE_GROUP_KEYS.some(
        (key) => current[key] < previous[key]
      );
      if (regressed || current.total < previous.total) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['phases', i],
          message: 'Phase residue must be monotonic non-decreasing component-wise',
        });
      }
    }
    const lastPhase = record.phases[record.phases.length - 1];
    // The composer appends one aggregate phase to the service phases, whose
    // last entry the v1 schema pins to the frozen 40/4/2 vector.
    const servicePhase = record.phases[record.phases.length - 2];
    if (
      servicePhase === undefined ||
      !vectorEquals(servicePhase.residue, RELEASE_CANARY_RESERVED_RESIDUE)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['phases', record.phases.length - 2],
        message: 'The phase before http-command-delta must equal the frozen v1 service residue',
      });
    }
    const httpDeltaPhaseCount = record.phases.filter(
      (phase) => phase.name === 'http-command-delta'
    ).length;
    if (httpDeltaPhaseCount !== 1 || lastPhase?.name !== 'http-command-delta') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['phases', record.phases.length - 1, 'name'],
        message: 'Phases must contain exactly one terminal http-command-delta phase',
      });
    }
    if (lastPhase !== undefined && !vectorEquals(lastPhase.residue, record.finalResidue)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['phases', record.phases.length - 1],
        message: 'Last phase residue must deep-equal finalResidue',
      });
    }
    record.failureBoundaries.forEach((boundary, index) => {
      const exceeds = RELEASE_CANARY_RESIDUE_GROUP_KEYS.some(
        (key) => boundary.residue[key] > RELEASE_CANARY_HTTP_WORKFLOW_RESERVED_RESIDUE[key]
      );
      if (exceeds || boundary.residue.total > RELEASE_CANARY_HTTP_WORKFLOW_RESERVED_RESIDUE.total) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['failureBoundaries', index],
          message: 'Failure boundary residue must be component-wise <= reserved residue',
        });
      }
    });
  });

export type ReleaseCanaryResidueCharacterizationV2 = z.infer<
  typeof ReleaseCanaryResidueCharacterizationV2Schema
>;

export const ReleaseCanaryCharacterizationEvidenceV2Schema = z
  .object({
    reservationIdentity: z.literal(RELEASE_CANARY_HTTP_WORKFLOW_RESERVATION_IDENTITY),
    baselineResidue: ResidueVectorSchema,
    deltaResidue: ResidueVectorSchema,
    finalResidue: ResidueVectorSchema,
    workflowRunId: PositiveDecimalIdSchema,
    workflowRunAttempt: RunAttemptSchema,
    databaseCanaryRunId: UuidSchema,
    serviceCharacterizationPayloadSha256: Sha256HexSchema,
    httpFundProofPayloadSha256: Sha256HexSchema,
    bindingSha256: Sha256HexSchema,
  })
  .strict()
  .superRefine((evidence, ctx) => {
    if (!vectorEquals(evidence.baselineResidue, RELEASE_CANARY_RESERVED_RESIDUE)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['baselineResidue'],
        message: 'baselineResidue must equal the frozen v1 service residue',
      });
    }
    if (!vectorEquals(evidence.deltaResidue, HTTP_COMMAND_DELTA)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['deltaResidue'],
        message: 'deltaResidue must equal the fixed HTTP command delta',
      });
    }
    if (!vectorEquals(evidence.finalResidue, RELEASE_CANARY_HTTP_WORKFLOW_RESERVED_RESIDUE)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['finalResidue'],
        message: 'finalResidue must equal the HTTP workflow reserved residue',
      });
    }
  });

export type ReleaseCanaryCharacterizationEvidenceV2 = z.infer<
  typeof ReleaseCanaryCharacterizationEvidenceV2Schema
>;

export function parseReleaseCanaryCharacterizationEvidenceV2(
  value: unknown
): ReleaseCanaryCharacterizationEvidenceV2 {
  scanForSecretShapedContent(value, '$');
  return ReleaseCanaryCharacterizationEvidenceV2Schema.parse(value);
}

export function releaseCanaryCharacterizationEvidenceV2(
  artifact: ReleaseCanaryResidueCharacterizationV2
): ReleaseCanaryCharacterizationEvidenceV2 {
  const httpDeltaIndex = artifact.phases.findIndex((phase) => phase.name === 'http-command-delta');
  const baseline = artifact.phases[httpDeltaIndex - 1]?.residue;
  if (baseline === undefined) {
    throw new Error('Characterization artifact is missing the phase before http-command-delta');
  }
  return parseReleaseCanaryCharacterizationEvidenceV2({
    reservationIdentity: artifact.reservationIdentity,
    baselineResidue: baseline,
    deltaResidue: vectorSubtract(artifact.finalResidue, baseline),
    finalResidue: artifact.finalResidue,
    workflowRunId: artifact.provenance.workflowRunId,
    workflowRunAttempt: artifact.provenance.workflowRunAttempt,
    databaseCanaryRunId: artifact.provenance.databaseCanaryRunId,
    serviceCharacterizationPayloadSha256: artifact.provenance.serviceCharacterizationPayloadSha256,
    httpFundProofPayloadSha256: artifact.provenance.httpFundProofPayloadSha256,
    bindingSha256: artifact.provenance.bindingSha256,
  });
}

export function releaseCanaryResidueCharacterizationV2ArtifactName(
  runId: string,
  runAttempt: number,
  sourceSha: string
): string {
  return `release-canary-residue-characterization-v2-${runId}-${runAttempt}-${sourceSha}`;
}

export function parseReleaseCanaryResidueCharacterizationV2(
  value: unknown
): ReleaseCanaryResidueCharacterizationV2 {
  scanForSecretShapedContent(value, '$');
  return ReleaseCanaryResidueCharacterizationV2Schema.parse(value);
}

function requireExpected<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} does not match expected binding`);
  }
}

export function composeReleaseCanaryResidueCharacterizationV2(
  serviceCharacterization: ReleaseCanaryResidueCharacterizationV1,
  httpFundProof: ReleaseCanaryHttpFundProofV2,
  expectedSourceSha: string,
  expectedWorkflowRunId: string,
  expectedWorkflowRunAttempt: number
): ReleaseCanaryResidueCharacterizationV2 {
  const service = parseReleaseCanaryResidueCharacterization(serviceCharacterization);
  const http = parseReleaseCanaryHttpFundProofV2(httpFundProof);
  SourceShaSchema.parse(expectedSourceSha);
  PositiveDecimalIdSchema.parse(expectedWorkflowRunId);
  RunAttemptSchema.parse(expectedWorkflowRunAttempt);
  requireExpected(service.sourceSha, expectedSourceSha, 'Service source SHA');
  requireExpected(service.provenance.storedRun.releaseSha, expectedSourceSha, 'Stored source SHA');
  requireExpected(http.sourceSha, expectedSourceSha, 'HTTP source SHA');
  requireExpected(http.workflowRunId, expectedWorkflowRunId, 'HTTP workflow run ID');
  requireExpected(http.workflowRunAttempt, expectedWorkflowRunAttempt, 'HTTP workflow run attempt');
  requireExpected(
    http.reservationIdentity,
    RELEASE_CANARY_HTTP_WORKFLOW_RESERVATION_IDENTITY,
    'HTTP reservation identity'
  );
  if (!vectorEquals(service.finalResidue, RELEASE_CANARY_RESERVED_RESIDUE)) {
    throw new Error('Service final residue must equal the frozen v1 reserved vector');
  }

  const publishPhases = service.phases.filter((phase) => phase.name === 'publish');
  if (publishPhases.length !== 1) {
    throw new Error('Service characterization must contain exactly one publish phase');
  }
  const delta = vectorSubtract(http.observedFundPhaseResidue, publishPhases[0]!.residue);
  if (!vectorEquals(delta, HTTP_COMMAND_DELTA)) {
    throw new Error(
      'HTTP fund residue delta must be exactly fundEvent +1, mutationReceipt +3, total +4'
    );
  }
  const finalResidue = vectorAdd(service.finalResidue, delta);
  if (!vectorEquals(finalResidue, RELEASE_CANARY_HTTP_WORKFLOW_RESERVED_RESIDUE)) {
    throw new Error('Composed final residue must equal the HTTP workflow reserved vector');
  }

  const serviceCharacterizationPayloadSha256 = sha256CanonicalJson(service);
  const httpFundProofPayloadSha256 = sha256CanonicalJson(http);
  const bindingSha256 = sha256CanonicalJson([
    expectedSourceSha,
    expectedWorkflowRunId,
    expectedWorkflowRunAttempt,
    RELEASE_CANARY_HTTP_WORKFLOW_RESERVATION_IDENTITY,
    serviceCharacterizationPayloadSha256,
    httpFundProofPayloadSha256,
    service.finalResidue,
    delta,
    finalResidue,
  ]);

  return parseReleaseCanaryResidueCharacterizationV2({
    schemaVersion: 'release-canary-residue-characterization-v2',
    sourceSha: expectedSourceSha,
    contractVersion: 'release-canary-residue-characterization-v2',
    reservationIdentity: RELEASE_CANARY_HTTP_WORKFLOW_RESERVATION_IDENTITY,
    reservedResidue: { ...RELEASE_CANARY_HTTP_WORKFLOW_RESERVED_RESIDUE },
    phases: [...service.phases, { name: 'http-command-delta', residue: finalResidue }],
    finalResidue,
    failureBoundaries: service.failureBoundaries,
    provenance: {
      ...service.provenance,
      workflowRunId: expectedWorkflowRunId,
      workflowRunAttempt: expectedWorkflowRunAttempt,
      databaseCanaryRunId: http.databaseCanaryRunId,
      serviceCharacterizationPayloadSha256,
      httpFundProofPayloadSha256,
      bindingSha256,
    },
    result: 'passed',
  });
}
