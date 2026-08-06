import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, extname, relative, resolve } from 'node:path';
import process from 'node:process';

import { z } from 'zod';

const freezeValues = (values) => Object.freeze([...values]);
const enumSchema = (values) => z.enum(values);

// Matrix vocabulary is the single source of truth for seeders, validators,
// and approval tooling.
export const INTERFACE_VALUES = freezeValues([
  'http-api',
  'client-route',
  'worker-job',
  'scheduler',
  'event-handler',
  'websocket',
  'vercel-function',
  'dormant-ui',
]);
export const InterfaceSchema = enumSchema(INTERFACE_VALUES);

export const PERSONA_VALUES = freezeValues([
  'gp',
  'lp',
  'admin',
  'analyst',
  'service',
  'system',
  'public',
  'unknown',
]);
export const PersonaSchema = enumSchema(PERSONA_VALUES);

// Auth identities are deliberately separate from PERSONA_VALUES. This table
// is the single authoring-time identity-to-persona authority: obvious product
// identities are decided, while roles whose product persona is a human G1
// decision remain explicitly undecided and therefore suggest `unknown`.
const authMappingEntry = (persona, decided, evidence) => Object.freeze({ persona, decided, evidence });
export const AUTH_ROLE_PERSONA_MAPPING = Object.freeze({
  admin: authMappingEntry('admin', true, 'shared/schema/user.ts USER_ROLES'),
  partner: authMappingEntry('gp', true, 'shared/schema/user.ts USER_ROLES'),
  analyst: authMappingEntry('analyst', true, 'shared/schema/user.ts USER_ROLES'),
  lp: authMappingEntry('lp', true, 'server/middleware/requireLPAccess.ts role guard'),
  operator: authMappingEntry('unknown', false, 'G1 persona decision required'),
  viewer: authMappingEntry('unknown', false, 'G1 persona decision required'),
  service: authMappingEntry('service', true, 'shared/schema/user.ts USER_ROLES'),
  flag_read: authMappingEntry('unknown', false, 'G1 capability-role persona decision required'),
  flag_admin: authMappingEntry('unknown', false, 'G1 capability-role persona decision required'),
  reserve_admin: authMappingEntry('unknown', false, 'G1 capability-role persona decision required'),
});
export const AUTH_PERSONA_MAPPING = AUTH_ROLE_PERSONA_MAPPING;
export const AUTH_IDENTITY_PERSONA_MAPPING = Object.freeze({
  ...AUTH_ROLE_PERSONA_MAPPING,
  lpId: authMappingEntry('lp', true, 'lpId identity boundary'),
  public: authMappingEntry('public', true, 'signed public identity boundary'),
});
export const AUTH_UNRESOLVED_ROLE = 'unresolved';

export const REACHABILITY_VALUES = freezeValues([
  'vercel',
  'railway',
  'both',
  'client',
  'local',
  'dormant',
]);
export const ReachabilitySchema = enumSchema(REACHABILITY_VALUES);

export const PROVEN_REACHABILITY_VALUES = freezeValues([
  'vercel',
  'railway',
  'both',
  'client',
  'local',
  'none',
]);
export const ProvenReachabilitySchema = enumSchema(PROVEN_REACHABILITY_VALUES);

export const DEPLOYMENT_VALUES = freezeValues([
  'vercel-api',
  'railway-api',
  'railway-worker',
  'vercel-web',
  'railway-web',
  'ml-service-local',
]);
export const DeploymentSchema = enumSchema(DEPLOYMENT_VALUES);

export const RUNTIME_VALUES = freezeValues([
  'make_app',
  'create_server',
  'register_routes',
  'vercel_function',
  'worker_process',
  'scheduler_poller',
  'event_handler',
  'websocket_server',
  'client_router',
  'service_listener',
]);
export const RuntimeSchema = enumSchema(RUNTIME_VALUES);

export const BOOT_STATUS_VALUES = freezeValues(['proven', 'failed', 'unproven']);
export const BootStatusSchema = enumSchema(BOOT_STATUS_VALUES);

export const PERSISTENCE_VALUES = freezeValues(['reads-only', 'writes', 'unknown']);
export const PersistenceSchema = enumSchema(PERSISTENCE_VALUES);

export const DESTRUCTIVE_VALUES = freezeValues(['none', 'soft', 'destructive', 'unknown']);
export const DestructiveSchema = enumSchema(DESTRUCTIVE_VALUES);

export const ENVIRONMENT_VALUES = freezeValues([
  'prod-safe',
  'staged-only',
  'local-only',
  'unknown',
]);
export const EnvironmentSchema = enumSchema(ENVIRONMENT_VALUES);

export const CLASSIFICATION_VALUES = freezeValues(['classified', 'unclassified']);
export const ClassificationSchema = enumSchema(CLASSIFICATION_VALUES);

export const DECISION_VALUES = freezeValues([
  'in-contract',
  'docker-only-excluded',
  'dev-only-excluded',
  'quarantined',
  'keep-and-prove',
  'remove-with-approval',
]);
export const DecisionSchema = enumSchema(DECISION_VALUES);

export const DECISION_STATUS_VALUES = freezeValues(['proposed', 'approved']);
export const DecisionStatusSchema = enumSchema(DECISION_STATUS_VALUES);

export const DEFINITION_ROLE_VALUES = freezeValues(['handler', 'guard', 'shadowed']);
export const DefinitionRoleSchema = enumSchema(DEFINITION_ROLE_VALUES);

export const TEST_LAYER_VALUES = freezeValues(['unit', 'integration', 'e2e', 'smoke']);
export const TestLayerSchema = enumSchema(TEST_LAYER_VALUES);

export const OWNER_VALUES = freezeValues([
  'platform',
  'gp-team',
  'analytics',
  'lp-reporting',
  'reporting',
  'unassigned',
]);
export const OwnerSchema = enumSchema(OWNER_VALUES);

export const COVERAGE_REVIEW_VALUES = freezeValues(['none-reviewed']);
export const CoverageReviewStatusSchema = enumSchema(COVERAGE_REVIEW_VALUES);

export const MERGE_OWNER_VALUES = freezeValues(['machine', 'human']);
export const MergeOwnerSchema = enumSchema(MERGE_OWNER_VALUES);

export const HTTP_METHOD_VALUES = freezeValues([
  'ANY',
  'DELETE',
  'GET',
  'HEAD',
  'OPTIONS',
  'PATCH',
  'POST',
  'PUT',
  'TRACE',
]);
export const HttpMethodSchema = enumSchema(HTTP_METHOD_VALUES);

export const ROW_ENUMS = Object.freeze({
  interface: INTERFACE_VALUES,
  personas: PERSONA_VALUES,
  reachability: REACHABILITY_VALUES,
  proven_reachability: PROVEN_REACHABILITY_VALUES,
  deployment: DEPLOYMENT_VALUES,
  runtime: RUNTIME_VALUES,
  boot_status: BOOT_STATUS_VALUES,
  persistence: PERSISTENCE_VALUES,
  destructive: DESTRUCTIVE_VALUES,
  environment: ENVIRONMENT_VALUES,
  owner: OWNER_VALUES,
  classification: CLASSIFICATION_VALUES,
  decision: DECISION_VALUES,
  decision_status: DECISION_STATUS_VALUES,
  definition_role: DEFINITION_ROLE_VALUES,
  test_layer: TEST_LAYER_VALUES,
});

export const SOURCE_INVENTORY_SCHEMA_VERSION = '1.0.0';
export const MATRIX_SCHEMA_VERSION = '1.0.0';

const nonEmptyString = z.string().min(1);
const jsonValue = z.unknown();
const evidenceSchema = z.union([nonEmptyString, z.record(z.string(), jsonValue)]);

export const DefinitionSchema = z
  .object({
    site: nonEmptyString.optional(),
    file: nonEmptyString.optional(),
    line: z.number().int().positive().optional(),
    role: DefinitionRoleSchema,
    effective_mount_order: z.number().int().nonnegative().optional(),
  })
  .passthrough();

export const AuthEvidenceSchema = z
  .object({
    kind: z.enum(['guard', 'handler', 'policy-boundary', 'identity', 'unresolved']),
    role: nonEmptyString.optional(),
    boundary: nonEmptyString.optional(),
    file: nonEmptyString.optional(),
    line: z.number().int().positive().optional(),
    evidence: nonEmptyString.optional(),
  })
  .passthrough();

export const IngressSchema = z
  .object({
    external_path: nonEmptyString,
    express_path: nonEmptyString,
    rewrite_evidence: jsonValue,
  })
  .passthrough();

export const BootEvidenceSchema = z
  .object({
    command_or_artifact: nonEmptyString,
    probe: nonEmptyString,
    result: nonEmptyString,
    observed_at: nonEmptyString,
  })
  .passthrough();

export const BootProofSchema = z
  .object({
    deployment: DeploymentSchema,
    runtime: RuntimeSchema.optional(),
    boot_status: BootStatusSchema,
    boot_evidence: BootEvidenceSchema,
  })
  .passthrough();

export const BootProofDocumentSchema = z
  .object({
    schema_version: nonEmptyString,
    proofs: z.array(BootProofSchema),
  })
  .passthrough();

export const ExposureSchema = z
  .object({
    deployment: DeploymentSchema,
    runtime: RuntimeSchema,
    mount_evidence: jsonValue,
    ingresses: z.array(IngressSchema),
    conditions: z.array(jsonValue),
    definitions: z.array(DefinitionSchema),
    boot_status: BootStatusSchema,
    boot_evidence: BootEvidenceSchema,
  })
  .passthrough();

export const QueueRoleEntrySchema = z
  .object({
    site: nonEmptyString,
    deployment: nonEmptyString,
    runtime: nonEmptyString,
    triggering_row_ids: z.array(nonEmptyString).optional(),
  })
  .passthrough();

export const QueueRolesSchema = z
  .object({
    producers: z.array(QueueRoleEntrySchema),
    consumers: z.array(QueueRoleEntrySchema),
  })
  .passthrough();

export const TestEvidenceItemSchema = z
  .object({
    row: nonEmptyString.optional(),
    deployment: nonEmptyString.optional(),
    runtime: nonEmptyString.optional(),
    layer: TestLayerSchema,
    assertion_evidence: nonEmptyString.optional(),
    assertion_confirmed: z.boolean().optional(),
    test_file_sha256: nonEmptyString.optional(),
  })
  .passthrough();

export const TestEvidenceSchema = z
  .object({
    derived: z.array(TestEvidenceItemSchema),
    manual: z.array(TestEvidenceItemSchema),
  })
  .passthrough();

export const CoverageReviewSchema = z
  .object({
    test_coverage: CoverageReviewStatusSchema,
    contract_fingerprint: nonEmptyString,
    evidence: nonEmptyString.optional(),
  })
  .passthrough();

// Approval-contract fields. Excludes provenance timestamps, test evidence,
// and file:line positions by design.
export const CONTRACT_FINGERPRINT_FIELDS = freezeValues([
  'exposures[].deployment',
  'exposures[].runtime',
  'exposures[].conditions',
  'exposures[].ingresses[]',
  'exposures[].boot_status',
  'exposures[].boot_evidence.command_or_artifact',
  'exposures[].boot_evidence.probe',
  'exposures[].boot_evidence.result',
  'exposures[].definitions[].role',
  'exposures[].definitions[].effective_mount_order',
  'reachability',
  'proven_reachability',
  'interface',
  'queue_roles',
  'auth_roles[]',
  'behavior_flags[]',
  'personas[]',
  'persistence',
  'destructive',
  'environment',
  'owner',
  'classification',
  'decision',
  'closure_owner',
  'closure_gate',
  'closure_acceptance',
]);

const MACHINE_OWNED_FIELDS = [
  'seam',
  'exposures[]',
  'exposures[].definitions[]',
  'exposures[].boot_evidence',
  'reachability',
  'proven_reachability',
  'interface',
  'evidence',
  'test_evidence.derived[]',
  'source_mapping',
  'decision_suggestion',
  'queue_roles',
  'auth_roles[]',
  'behavior_flags[]',
  'decision',
  'machine_suggestions',
];

const HUMAN_OWNED_FIELDS = [
  'personas[]',
  'persistence',
  'destructive',
  'environment',
  'owner',
  'test_evidence.manual[]',
  'seam_override',
  'classification',
  'closure_owner',
  'closure_gate',
  'closure_acceptance',
  'decision_override',
  'decision_status',
  'decision_evidence',
  'coverage_review',
];

export const MERGE_OWNERSHIP = Object.freeze({
  machine: freezeValues(MACHINE_OWNED_FIELDS),
  human: freezeValues(HUMAN_OWNED_FIELDS),
  carve_outs: Object.freeze({
    'exposures[].boot_evidence.observed_at':
      'machine; preserve stored value when command_or_artifact, probe, result, and boot_status are unchanged',
  }),
});
export const FIELD_MERGE_OWNERSHIP = MERGE_OWNERSHIP;

export const SurfaceRowSchema = z
  .object({
    id: nonEmptyString,
    seam: nonEmptyString,
    seam_override: nonEmptyString.optional(),
    interface: InterfaceSchema,
    personas: z.array(PersonaSchema).min(1),
    reachability: ReachabilitySchema,
    proven_reachability: ProvenReachabilitySchema,
    exposures: z.array(ExposureSchema),
    persistence: PersistenceSchema,
    destructive: DestructiveSchema,
    environment: EnvironmentSchema,
    owner: OwnerSchema,
    evidence: z.array(evidenceSchema),
    source_mapping: z.record(z.string(), jsonValue).optional(),
    queue_roles: QueueRolesSchema,
    auth_roles: z.array(nonEmptyString),
    auth_evidence: z.array(AuthEvidenceSchema).optional(),
    behavior_flags: z.array(nonEmptyString),
    test_evidence: TestEvidenceSchema,
    classification: ClassificationSchema,
    decision: DecisionSchema,
    decision_suggestion: DecisionSchema,
    decision_override: DecisionSchema.optional(),
    decision_status: DecisionStatusSchema,
    decision_evidence: evidenceSchema.optional(),
    closure_owner: nonEmptyString.optional(),
    closure_gate: nonEmptyString.optional(),
    closure_acceptance: nonEmptyString.optional(),
    contract_fingerprint: nonEmptyString.optional(),
    approved_source_hashes: z.array(nonEmptyString),
    machine_suggestions: z.record(z.string(), jsonValue).optional(),
  })
  .passthrough();

export const ProvenanceSchema = z
  .object({
    git_head: nonEmptyString,
    snapshot_id: nonEmptyString,
    observed_at: nonEmptyString.optional(),
  })
  .passthrough();

export const SurfaceMatrixDocumentSchema = z
  .object({
    schema_version: nonEmptyString,
    phase: z.enum(['authoring', 'closed']),
    provenance: ProvenanceSchema,
    rows: z.array(SurfaceRowSchema),
    coverage_review: z.record(z.string(), CoverageReviewSchema),
  })
  .passthrough();

export const SourceInventorySchema = z
  .object({
    schema_version: nonEmptyString,
    snapshot_id: nonEmptyString,
    row_ids: z.array(nonEmptyString),
    source_hashes: z.record(z.string(), nonEmptyString),
    source_to_rows: z.record(z.string(), z.array(nonEmptyString)),
    row_to_sources: z.record(z.string(), z.array(nonEmptyString)),
  })
  .passthrough();

export const LISTENER_DISPOSITION_VALUES = freezeValues([
  'product-surface',
  'non-product-tooling',
]);
export const ListenerDispositionTypeSchema = enumSchema(LISTENER_DISPOSITION_VALUES);

export const LISTENER_ROW_NAMESPACE_VALUES = freezeValues(['api', 'listener']);
export const ListenerRowNamespaceSchema = enumSchema(LISTENER_ROW_NAMESPACE_VALUES);

const listenerDispositionCommon = {
  candidate_path: nonEmptyString,
  listener_id: nonEmptyString,
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  evidence: z.array(evidenceSchema).optional(),
};

export const ListenerProductDispositionSchema = z
  .object({
    ...listenerDispositionCommon,
    disposition: z.literal('product-surface'),
    row_namespace: ListenerRowNamespaceSchema,
    route_extraction_strategy: nonEmptyString,
  })
  .passthrough();

export const ListenerToolingDispositionSchema = z
  .object({
    ...listenerDispositionCommon,
    disposition: z.literal('non-product-tooling'),
    rationale: nonEmptyString,
    evidence: z.array(evidenceSchema).min(1),
  })
  .passthrough();

export const ListenerDispositionSchema = z.discriminatedUnion('disposition', [
  ListenerProductDispositionSchema,
  ListenerToolingDispositionSchema,
]);
export const ListenerDispositionsSchema = z.array(ListenerDispositionSchema);
export const ListenerDisposition = ListenerDispositionSchema;
export const ListenerDispositions = ListenerDispositionsSchema;

export const RuntimeExclusionSchema = z
  .object({
    id: nonEmptyString.optional(),
    exclusion_id: nonEmptyString.optional(),
    layer_id: nonEmptyString.optional(),
    fingerprint: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    contract_fingerprint: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    decision_status: DecisionStatusSchema.optional(),
    decision_evidence: evidenceSchema.optional(),
  })
  .passthrough()
  .refine((value) => value.id || value.exclusion_id || value.layer_id, {
    message: 'runtime exclusion requires id, exclusion_id, or layer_id',
  });
export const RuntimeExclusionsSchema = z.array(RuntimeExclusionSchema);

export const SurfaceMatrixDocument = SurfaceMatrixDocumentSchema;
export const SurfaceRow = SurfaceRowSchema;
export const SourceInventory = SourceInventorySchema;

const NAMESPACES = new Set([
  'api',
  'client',
  'worker',
  'scheduler',
  'event',
  'ws',
  'api-fn',
  'listener',
  'dormant',
]);

const normalizeMethodAndPath = (namespace, method, path) => {
  if (!method || !/^[A-Za-z]+$/.test(method)) {
    throw new Error(`Invalid ${namespace} method in row id`);
  }
  if (!path || !path.startsWith('/')) {
    throw new Error(`Invalid ${namespace} express path in row id`);
  }
  return `${namespace}:${method.toUpperCase()}:${path}`;
};

/** Normalize KG/policy spellings while preserving the express path verbatim. */
export function canonicalRowId(rowId) {
  if (typeof rowId !== 'string' || rowId.length === 0) {
    throw new Error('Row id must be a non-empty string');
  }

  const namespace = rowId.includes(':') ? rowId.slice(0, rowId.indexOf(':')) : rowId;
  if (!NAMESPACES.has(namespace)) {
    throw new Error(`Unknown row-id namespace: ${namespace}`);
  }

  if (namespace === 'api' || namespace === 'api-fn') {
    const remainder = rowId.slice(namespace.length + 1);
    const match = remainder.match(/^([A-Za-z]+)(?: |:)(\/.*)$/s);
    if (!match) {
      throw new Error(`Invalid ${namespace} row id: ${rowId}`);
    }
    return normalizeMethodAndPath(namespace, match[1], match[2]);
  }

  if (namespace === 'listener') {
    const remainder = rowId.slice(namespace.length + 1);
    const match = remainder.match(/^([^:]+):([A-Za-z]+)(?: |:)(\/.*)$/s);
    if (!match) {
      throw new Error(`Invalid listener row id: ${rowId}`);
    }
    return `listener:${match[1]}:${match[2].toUpperCase()}:${match[3]}`;
  }

  const value = rowId.slice(namespace.length + 1);
  if (!value) {
    throw new Error(`Invalid ${namespace} row id: ${rowId}`);
  }
  if (namespace === 'client' && !value.startsWith('/')) {
    throw new Error(`Invalid client route in row id: ${rowId}`);
  }
  return `${namespace}:${value}`;
}

/** Normalize a set and hard-fail on distinct aliases collapsing to one id. */
export function canonicalizeRowIds(rowIds) {
  if (!Array.isArray(rowIds)) {
    throw new Error('Row ids must be an array');
  }
  const seen = new Map();
  const canonicalIds = rowIds.map((rowId) => {
    const canonicalId = canonicalRowId(rowId);
    const previous = seen.get(canonicalId);
    if (previous !== undefined && previous !== rowId) {
      throw new Error(
        `Canonical row-id collision: ${JSON.stringify(previous)} and ${JSON.stringify(rowId)} -> ${canonicalId}`,
      );
    }
    seen.set(canonicalId, rowId);
    return canonicalId;
  });
  return canonicalIds;
}

export const assertCanonicalRowIds = canonicalizeRowIds;

const RELEASE_DEPLOYMENTS = new Set([
  'vercel-api',
  'railway-api',
  'railway-worker',
  'vercel-web',
  'railway-web',
]);

const asText = (value) => {
  if (typeof value === 'string') return value.toLowerCase();
  try {
    return JSON.stringify(value).toLowerCase();
  } catch {
    return '';
  }
};

const exposuresFor = (row) => (Array.isArray(row?.exposures) ? row.exposures : []);
const hasReleaseDeployment = (exposure) => RELEASE_DEPLOYMENTS.has(exposure?.deployment);
const isProven = (exposure) => exposure?.boot_status === 'proven';
const hasReleaseExposure = (row) =>
  exposuresFor(row).some(hasReleaseDeployment) || ['vercel', 'railway', 'both'].includes(row?.reachability);
const hasProvenReleaseExposure = (row) =>
  exposuresFor(row).some((exposure) => hasReleaseDeployment(exposure) && isProven(exposure)) ||
  ['vercel', 'railway', 'both'].includes(row?.proven_reachability);

const isDevelopmentOnly = (row) => {
  const exposures = exposuresFor(row);
  if (exposures.length === 0) return false;
  return exposures.every((exposure) =>
    (Array.isArray(exposure.conditions) ? exposure.conditions : []).some((condition) => {
      const text = asText(condition);
      return text.includes('node_env') && text.includes('development');
    }),
  );
};

const isLocalOnlyListener = (row) => {
  if (row?.interface !== 'http-api' || !String(row?.id ?? '').startsWith('listener:')) return false;
  const exposures = exposuresFor(row);
  return exposures.length === 0
    ? row?.reachability === 'local'
    : exposures.every((exposure) => !hasReleaseDeployment(exposure));
};

const isArchivedOrLegacyClientRoute = (row) => {
  if (row?.interface !== 'client-route') return false;
  const markers = [
    row?.route_kind,
    row?.route_category,
    row?.seam,
    row?.id,
    row?.archived_placeholder,
    row?.legacy,
  ];
  return markers.some((marker) => {
    if (marker === true) return true;
    const text = asText(marker);
    return text.includes('archived') || text.includes('legacy');
  });
};

const isPagesV2Dormant = (row) =>
  row?.interface === 'dormant-ui' && /(?:^|\/)pages\/v2(?:\/|$)/.test(String(row?.id ?? ''));

const isOnlyRegisterRoutes = (row) => {
  const exposures = exposuresFor(row);
  return (
    row?.interface === 'http-api' &&
    exposures.length > 0 &&
    exposures.every((exposure) => exposure.runtime === 'register_routes') &&
    exposures.some((exposure) => exposure.deployment === 'railway-api' && isProven(exposure))
  );
};

const isOnlyCreateServerOuter = (row) => {
  const exposures = exposuresFor(row);
  return (
    row?.interface === 'http-api' &&
    exposures.length > 0 &&
    exposures.every((exposure) => exposure.runtime === 'create_server')
  );
};

const hasZeroIngress = (row) => {
  const exposures = exposuresFor(row);
  return (
    row?.interface === 'http-api' &&
    exposures.length > 0 &&
    exposures.every((exposure) => !Array.isArray(exposure.ingresses) || exposure.ingresses.length === 0)
  );
};

const hasConfiguredReleaseWithoutProof = (row) => hasReleaseExposure(row) && !hasProvenReleaseExposure(row);

const PROPOSAL_RULES = [
  { name: 'pages-v2-quarantine', decision: 'quarantined', matches: isPagesV2Dormant },
  {
    name: 'curated-dormant-ui',
    decision: 'remove-with-approval',
    matches: (row) => row?.interface === 'dormant-ui',
  },
  { name: 'development-only', decision: 'dev-only-excluded', matches: isDevelopmentOnly },
  { name: 'local-only-listener', decision: 'keep-and-prove', matches: isLocalOnlyListener },
  {
    name: 'archived-placeholder-or-legacy-client',
    decision: 'keep-and-prove',
    matches: isArchivedOrLegacyClientRoute,
  },
  {
    name: 'configured-release-without-proof',
    decision: 'keep-and-prove',
    matches: hasConfiguredReleaseWithoutProof,
  },
  {
    name: 'docker-only-register-routes',
    decision: 'docker-only-excluded',
    matches: isOnlyRegisterRoutes,
  },
  {
    name: 'create-server-outer-composition',
    decision: 'docker-only-excluded',
    matches: isOnlyCreateServerOuter,
  },
  { name: 'zero-live-ingress', decision: 'keep-and-prove', matches: hasZeroIngress },
  {
    name: 'live-default',
    decision: 'in-contract',
    matches: (row) =>
      row?.interface === 'client-route' ||
      (row?.interface === 'http-api' && hasProvenReleaseExposure(row)) ||
      (row?.interface === 'vercel-function' && hasProvenReleaseExposure(row)) ||
      (['worker-job', 'scheduler', 'event-handler', 'websocket'].includes(row?.interface) &&
        hasProvenReleaseExposure(row)),
  },
  {
    name: 'unproven-or-unexposed-background-surface',
    decision: 'keep-and-prove',
    matches: (row) =>
      ['http-api', 'worker-job', 'scheduler', 'event-handler', 'websocket', 'vercel-function'].includes(
        row?.interface,
      ),
  },
];

export const PROPOSAL_PRECEDENCE = Object.freeze(PROPOSAL_RULES.map(({ name, decision }) => ({ name, decision })));

export function explainDecisionProposal(row) {
  const rule = PROPOSAL_RULES.find(({ matches }) => matches(row));
  if (!rule) {
    throw new Error(`No deterministic proposal rule covers interface: ${String(row?.interface)}`);
  }
  return Object.freeze({ rule: rule.name, decision: rule.decision });
}

export function proposeDecision(row) {
  return explainDecisionProposal(row).decision;
}

export const proposalForRow = proposeDecision;
export const decisionSuggestionForRow = proposeDecision;

const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'observed_at' && key !== 'file' && key !== 'line')
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
};

const stripQueueRoleSite = (entry) => {
  const copy = { ...entry };
  delete copy.site;
  return copy;
};

const contractFingerprintPayload = (row) => ({
  exposures: exposuresFor(row).map((exposure) => ({
    deployment: exposure.deployment,
    runtime: exposure.runtime,
    conditions: stableValue(exposure.conditions),
    ingresses: stableValue(exposure.ingresses),
    boot_status: exposure.boot_status,
    boot_evidence: {
      command_or_artifact: exposure.boot_evidence?.command_or_artifact,
      probe: exposure.boot_evidence?.probe,
      result: exposure.boot_evidence?.result,
    },
    definitions: (exposure.definitions ?? []).map((definition) => ({
      role: definition.role,
      effective_mount_order: definition.effective_mount_order,
    })),
  })),
  reachability: row?.reachability,
  proven_reachability: row?.proven_reachability,
  interface: row?.interface,
  // queue_roles sites are file:line evidence — excluded so line drift never
  // demotes an approval; structural role data stays fingerprinted.
  queue_roles: stableValue(
    row?.queue_roles
      ? {
          producers: (row.queue_roles.producers ?? []).map(stripQueueRoleSite),
          consumers: (row.queue_roles.consumers ?? []).map(stripQueueRoleSite),
        }
      : row?.queue_roles,
  ),
  auth_roles: stableValue(row?.auth_roles),
  behavior_flags: stableValue(row?.behavior_flags),
  personas: stableValue(row?.personas),
  persistence: row?.persistence,
  destructive: row?.destructive,
  environment: row?.environment,
  owner: row?.owner,
  classification: row?.classification,
  decision: row?.decision,
  closure_owner: row?.closure_owner,
  closure_gate: row?.closure_gate,
  closure_acceptance: row?.closure_acceptance,
});

export function contractFingerprint(row) {
  const payload = JSON.stringify(stableValue(contractFingerprintPayload(row)));
  return createHash('sha256').update(payload).digest('hex');
}

export const computeContractFingerprint = contractFingerprint;

const RUNTIME_SOURCE_EXTENSIONS = new Set(['.ts', '.js', '.mjs', '.cjs', '.py']);
const ROUTE_METHODS = new Map([
  ['get', 'GET'],
  ['post', 'POST'],
  ['put', 'PUT'],
  ['patch', 'PATCH'],
  ['delete', 'DELETE'],
  ['options', 'OPTIONS'],
  ['head', 'HEAD'],
  ['all', 'ANY'],
]);

const toRepoPath = (value) => value.replaceAll('\\', '/');

const isExcludedRuntimePath = (filePath) => {
  const normalized = toRepoPath(filePath).toLowerCase();
  const segments = normalized.split('/');
  const basename = segments.at(-1) ?? '';

  if (
    segments.some((segment) =>
      ['test', 'tests', '__tests__', 'spec', 'specs', 'fixture', 'fixtures'].includes(segment),
    )
  ) {
    return true;
  }
  return /\.(?:test|spec)\.[^.]+$/.test(basename);
};

const isDockerfile = (filePath) => /^dockerfile(?:\..+)?$/i.test(filePath.split('/').at(-1) ?? '');

const trackedRepositoryFiles = (rootDir, suppliedFiles) => {
  if (suppliedFiles) {
    return [...new Set(suppliedFiles.map(toRepoPath))].sort();
  }

  const output = execFileSync('git', ['ls-files', '-z'], {
    cwd: rootDir,
    encoding: 'utf8',
  });
  return output
    .split('\0')
    .filter(Boolean)
    .map(toRepoPath)
    .sort();
};

const optionRootDir = (options) => {
  if (typeof options === 'string') return options;
  return options.rootDir ?? options.repoRoot ?? process.cwd();
};

const optionTrackedFiles = (options) => (typeof options === 'string' ? undefined : options.trackedFiles);

const optionAuthSources = (options) => {
  if (typeof options === 'string' || !options) return undefined;
  return options.sourceFiles ?? options.sources ?? options.authSources;
};

const sourceLineAt = (source, offset) => source.slice(0, offset).split('\n').length;

const sourceLineText = (source, offset) => {
  const start = source.lastIndexOf('\n', offset - 1) + 1;
  const end = source.indexOf('\n', offset);
  return source.slice(start, end === -1 ? source.length : end).trim();
};

const AUTH_SOURCE_EXTENSIONS = new Set(['.ts', '.js', '.mjs', '.cjs']);
const AUTH_SOURCE_PREFIXES = ['server/routes/', 'server/middleware/'];

const normalizeAuthSources = (suppliedSources) => {
  if (!suppliedSources) return undefined;
  if (suppliedSources instanceof Map) return [...suppliedSources.entries()]
    .map(([filePath, source]) => [toRepoPath(filePath), String(source)]);
  if (Array.isArray(suppliedSources)) {
    return suppliedSources.map((entry) => {
      if (Array.isArray(entry)) return [toRepoPath(entry[0]), String(entry[1])];
      return [toRepoPath(entry.path ?? entry.filePath), String(entry.source ?? entry.content ?? '')];
    });
  }
  return Object.entries(suppliedSources).map(([filePath, source]) => [toRepoPath(filePath), String(source)]);
};

const authSourceEntries = (options = {}) => {
  const supplied = normalizeAuthSources(optionAuthSources(options));
  if (supplied) return supplied.sort(([left], [right]) => left.localeCompare(right));

  const rootDir = resolve(optionRootDir(options));
  const files = trackedRepositoryFiles(rootDir, optionTrackedFiles(options));
  return files
    .filter((filePath) => AUTH_SOURCE_EXTENSIONS.has(extname(filePath).toLowerCase()))
    .filter((filePath) => AUTH_SOURCE_PREFIXES.some((prefix) => filePath.startsWith(prefix)))
    .filter((filePath) => !isExcludedRuntimePath(filePath))
    .map((filePath) => [filePath, fs.readFileSync(resolve(rootDir, filePath), 'utf8')]);
};

const stringLiterals = (source) => [...source.matchAll(/(['"])([^'"\n]+)\1/g)].map((match) => ({
  value: match[2],
  offset: match.index ?? 0,
}));

const matchingDelimiter = (source, openIndex, open = '(', close = ')') => {
  let depth = 0;
  let quote;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === open) depth += 1;
    if (character === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return source.length;
};

const routeRegistrationRanges = (source, options = {}) => {
  const method = String(options.method ?? '').toLowerCase();
  const registrationLines = new Set(options.registrationLines ?? []);
  const methods = method || 'use|get|post|put|patch|delete|options|head|all';
  const pattern = new RegExp(`(?:\\.(?:${methods})|\\[\\s*[\\"'](?:${methods})[\\"']\\s*\\])\\s*\\(`, 'gi');
  const matches = [...source.matchAll(pattern)];
  const selected = matches
    .map((match) => {
      const line = sourceLineAt(source, match.index ?? 0);
      const distances = [...registrationLines].map((candidate) => Math.abs(candidate - line));
      return {
        match,
        line,
        distance: distances.length > 0 ? Math.min(...distances) : Number.MAX_SAFE_INTEGER,
      };
    })
    .filter((entry) => registrationLines.size === 0 || registrationLines.has(entry.line) || entry.distance <= 1)
    .sort((left, right) => left.distance - right.distance || left.line - right.line)
    .slice(0, Math.max(1, registrationLines.size));
  const ranges = [];
  for (const { match } of selected) {
    const openIndex = (match.index ?? 0) + match[0].lastIndexOf('(');
    ranges.push([match.index ?? 0, matchingDelimiter(source, openIndex) + 1]);
  }
  return ranges;
};

const functionRangesForNames = (source, names) => {
  const ranges = [];
  for (const name of names) {
    const pattern = new RegExp(`(?:\\b(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)|\\b(?:const|let|var)\\s+${name}\\s*=\\s*(?:async\\s*)?(?:\\([^)]*\\)|[A-Za-z_$][\\w$]*)\\s*=>)`);
    const match = pattern.exec(source);
    if (!match) continue;
    const bodyStart = source.indexOf('{', (match.index ?? 0) + match[0].length);
    if (bodyStart === -1) continue;
    ranges.push([match.index ?? 0, matchingDelimiter(source, bodyStart, '{', '}') + 1]);
  }
  return ranges;
};

/** Extract auth evidence only from one route registration and its handlers. */
export function extractAuthRoleEvidenceForRoute(source, filePath, options = {}) {
  const registrationRanges = routeRegistrationRanges(source, options);
  const referencedNames = new Set();
  for (const [start, end] of registrationRanges) {
    const registration = source.slice(start, end);
    for (const match of registration.matchAll(/\b[A-Za-z_$][\w$]*\b/g)) referencedNames.add(match[0]);
  }
  const ranges = [...registrationRanges, ...functionRangesForNames(source, referencedNames)];
  return extractAuthRoleEvidenceFromSource(source, filePath, { ...options, ranges });
}

const roleArrayConstants = (source) => {
  const constants = new Map();
  const pattern = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*\[([\s\S]*?)\]/g;
  for (const match of source.matchAll(pattern)) {
    const values = stringLiterals(match[2]).map((literal) => literal.value);
    if (values.length > 0) constants.set(match[1], { values, offset: match.index ?? 0 });
  }
  return constants;
};

/** Extract literal role checks and statically resolvable role-list guards from one source. */
export function extractAuthRoleEvidenceFromSource(source, filePath, options = {}) {
  const evidence = [];
  const defaultKind = options.kind ?? 'guard';
  const constants = roleArrayConstants(source);
  const ranges = options.ranges;
  const inScope = (offset) => !ranges || ranges.some(([start, end]) => offset >= start && offset < end);
  const add = (role, offset, kind = defaultKind) => {
    if (!role) return;
    evidence.push({
      role,
      kind,
      file: toRepoPath(filePath),
      line: sourceLineAt(source, offset),
      evidence: sourceLineText(source, offset),
    });
  };

  const directCallPattern = /\b(?:requireRole|requireAnyRole|requireWriteRole)\s*\(\s*(['"])([^'"]+)\1/g;
  for (const match of source.matchAll(directCallPattern)) {
    if (inScope(match.index ?? 0)) add(match[2], match.index ?? 0, 'guard');
  }

  const listCallPattern = /\b(?:requireAnyRole|requireWriteRole)\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g;
  for (const match of source.matchAll(listCallPattern)) {
    if (!inScope(match.index ?? 0)) continue;
    const constant = constants.get(match[1]);
    if (constant) {
      for (const role of constant.values) add(role, match.index ?? 0, 'guard');
    } else {
      evidence.push({
        role: AUTH_UNRESOLVED_ROLE,
        kind: 'unresolved',
        file: toRepoPath(filePath),
        line: sourceLineAt(source, match.index ?? 0),
        evidence: sourceLineText(source, match.index ?? 0),
      });
    }
  }

  const inlineListPattern = /\b(?:requireAnyRole|requireWriteRole)\s*\(\s*\[([\s\S]*?)\]\s*\)/g;
  for (const match of source.matchAll(inlineListPattern)) {
    if (!inScope(match.index ?? 0)) continue;
    const roles = stringLiterals(match[1]).map((literal) => literal.value);
    if (roles.length === 0) {
      evidence.push({
        role: AUTH_UNRESOLVED_ROLE,
        kind: 'unresolved',
        file: toRepoPath(filePath),
        line: sourceLineAt(source, match.index ?? 0),
        evidence: sourceLineText(source, match.index ?? 0),
      });
    } else {
      for (const role of roles) add(role, match.index ?? 0, 'guard');
    }
  }

  const scalarCheckPattern = /\b(?:req|request|ctx|context|auth|session|currentUser|user)\s*(?:\?\.)?\s*(?:user\s*(?:\?\.)?\s*)?role\s*(?:===|!==|==|!=)\s*(['"])([^'"]+)\1/g;
  for (const match of source.matchAll(scalarCheckPattern)) {
    if (!inScope(match.index ?? 0)) continue;
    if (/\btypeof\b/.test(sourceLineText(source, match.index ?? 0))) continue;
    add(match[2], match.index ?? 0, 'handler');
  }

  const membershipPattern = /\b(?:roles|userRoles|user\.roles)\s*\.\s*includes\s*\(\s*(['"])([^'"]+)\1/g;
  for (const match of source.matchAll(membershipPattern)) {
    if (inScope(match.index ?? 0)) add(match[2], match.index ?? 0, 'handler');
  }

  const dynamicGuardPattern = /\brequireRole\s*\(\s*(?!['"])([^)]*)\)/g;
  for (const match of source.matchAll(dynamicGuardPattern)) {
    if (!inScope(match.index ?? 0)) continue;
    evidence.push({
      role: AUTH_UNRESOLVED_ROLE,
      kind: 'unresolved',
      file: toRepoPath(filePath),
      line: sourceLineAt(source, match.index ?? 0),
      evidence: sourceLineText(source, match.index ?? 0),
    });
  }

  return evidence
    .filter((entry, index, entries) => entries.findIndex((candidate) =>
      candidate.role === entry.role && candidate.kind === entry.kind && candidate.file === entry.file && candidate.line === entry.line) === index)
    .sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line || left.role.localeCompare(right.role));
}

const userEnumRoles = (source) => {
  const match = source.match(/\bUSER_ROLES\s*=\s*\[([\s\S]*?)\]\s+as\s+const/);
  return match ? stringLiterals(match[1]).map((literal) => literal.value) : [];
};

/** Discover all role identities used by the canonical user enum and route guards. */
export function discoverAuthRoleEvidence(options = {}) {
  const entries = authSourceEntries(options);
  const evidence = [];
  const roles = new Set();
  const rootDir = resolve(optionRootDir(options));
  const canonicalUserPath = 'shared/schema/user.ts';
  let userSource;
  const supplied = normalizeAuthSources(optionAuthSources(options));
  if (supplied) userSource = new Map(supplied).get(canonicalUserPath);
  else if (trackedRepositoryFiles(rootDir, optionTrackedFiles(options)).includes(canonicalUserPath)) {
    userSource = fs.readFileSync(resolve(rootDir, canonicalUserPath), 'utf8');
  }
  for (const role of userEnumRoles(userSource ?? '')) {
    roles.add(role);
    evidence.push({ role, kind: 'identity', file: canonicalUserPath, evidence: 'USER_ROLES enum' });
  }
  for (const [filePath, source] of entries) {
    // LP identity is established by the request-scoped lpId boundary even
    // when no literal role guard names `lp`. Keep it in the exhaustive role
    // inventory so identity-to-persona coverage cannot silently disappear.
    if (/\blpId\b/.test(source)) {
      roles.add('lp');
      evidence.push({ role: 'lp', kind: 'identity', file: filePath, evidence: 'lpId identity boundary' });
    }
    for (const entry of extractAuthRoleEvidenceFromSource(source, filePath)) {
      evidence.push(entry);
      if (entry.role !== AUTH_UNRESOLVED_ROLE) roles.add(entry.role);
    }
  }
  return {
    roles: [...roles].sort((left, right) => left.localeCompare(right)),
    evidence: evidence.sort((left, right) => left.file.localeCompare(right.file) || (left.line ?? 0) - (right.line ?? 0) || left.role.localeCompare(right.role)),
  };
}

export function discoverAuthRoleLiterals(options = {}) {
  return discoverAuthRoleEvidence(options).roles;
}

/** Fail closed when a new enum or guard role has no explicit persona decision entry. */
export function assertAuthRoleMappingExhaustive(discoveredRoles, mapping = AUTH_IDENTITY_PERSONA_MAPPING) {
  const roles = Array.isArray(discoveredRoles) ? discoveredRoles : discoveredRoles.roles;
  const missing = [...new Set(roles)].filter((role) => !mapping[role]);
  if (missing.length > 0) {
    throw new Error(`Auth role mapping is not exhaustive; missing entries: ${missing.sort().join(', ')}`);
  }
  return true;
}

export function suggestedPersonasForAuthRoles(authRoles, mapping = AUTH_IDENTITY_PERSONA_MAPPING) {
  const roles = [...new Set(authRoles ?? [])].filter((role) => role !== AUTH_UNRESOLVED_ROLE);
  assertAuthRoleMappingExhaustive(roles, mapping);
  const personas = [...new Set(roles.map((role) => mapping[role].decided ? mapping[role].persona : 'unknown'))]
    .sort((left, right) => left.localeCompare(right));
  return personas.length > 0 ? personas : ['unknown'];
}

export const personaSuggestionsForAuthRoles = suggestedPersonasForAuthRoles;

const preserveNewlinesWhileMasking = (source, pattern) =>
  source.replace(pattern, (match) => match.replaceAll(/[^\n]/g, ' '));

const sourceForDetection = (source, extension) => {
  if (extension === '.py') {
    return preserveNewlinesWhileMasking(source, /#.*$/gm);
  }
  return preserveNewlinesWhileMasking(
    preserveNewlinesWhileMasking(source, /\/\*[\s\S]*?\*\//g),
    /\/\/.*$/gm,
  );
};

const listenerPattern = (source, offset, kind) => ({
  kind,
  line: sourceLineAt(source, offset),
  text: sourceLineText(source, offset),
});

const collectPatternMatches = (source, detectionSource, regex, kind, predicate = () => true) => {
  const patterns = [];
  for (const match of detectionSource.matchAll(regex)) {
    const offset = match.index ?? 0;
    if (predicate(match, detectionSource, offset)) {
      patterns.push(listenerPattern(source, offset, kind));
    }
  }
  return patterns;
};

const dedupePatterns = (patterns) => {
  const seen = new Set();
  return patterns.filter((pattern) => {
    const key = `${pattern.kind}|${pattern.line}|${pattern.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const sourceListenerPatterns = (source, filePath) => {
  const extension = extname(filePath).toLowerCase();
  const detectionSource = sourceForDetection(source, extension);
  const patterns = [];

  if (extension === '.py') {
    patterns.push(
      ...collectPatternMatches(source, detectionSource, /\b(?:uvicorn)\.run\s*\(/g, 'uvicorn-run'),
      ...collectPatternMatches(
        source,
        detectionSource,
        /\b[A-Za-z_$][\w$]*\s*=\s*(?:FastAPI|Flask)\s*\(/g,
        'python-app-creation',
      ),
    );
  } else {
    patterns.push(
      ...collectPatternMatches(source, detectionSource, /\.\s*listen\s*\(/g, 'node-listen'),
      ...collectPatternMatches(
        source,
        detectionSource,
        /\b(?:https?|http)\s*\.\s*createServer\s*\(|(?<![\w.])createServer\s*\(/g,
        'node-http-server-creation',
        (_match, text, offset) => /\.\s*listen\s*\(/.test(text.slice(offset)),
      ),
    );
  }

  return dedupePatterns(patterns);
};

const containerListenerPatterns = (source) => {
  const patterns = [];
  const commandPattern = /^\s*(CMD|ENTRYPOINT)\s+(.+)$/gim;
  const httpEntrypoint = /\b(?:uvicorn|gunicorn|flask|fastapi|node|tsx|ts-node|npm)\b/i;
  for (const match of source.matchAll(commandPattern)) {
    if (httpEntrypoint.test(match[2])) {
      patterns.push({
        kind: 'container-http-entrypoint',
        line: sourceLineAt(source, match.index ?? 0),
        text: match[0].trim(),
      });
    }
  }
  return dedupePatterns(patterns);
};

/**
 * Scan tracked runtime-capable sources for possible HTTP listeners.
 * The default file universe comes from `git ls-files`; callers may inject a
 * sorted file list only for hermetic fixtures.
 */
export function discoverHttpListenerCandidates(options = {}) {
  const rootDir = resolve(optionRootDir(options));
  const trackedFiles = trackedRepositoryFiles(rootDir, optionTrackedFiles(options));
  const candidates = [];

  for (const filePath of trackedFiles) {
    if (isExcludedRuntimePath(filePath)) continue;
    const extension = extname(filePath).toLowerCase();
    const sourceRuntimeCapable = RUNTIME_SOURCE_EXTENSIONS.has(extension);
    if (!sourceRuntimeCapable && !isDockerfile(filePath)) continue;

    const absolutePath = resolve(rootDir, filePath);
    let source;
    try {
      source = fs.readFileSync(absolutePath, 'utf8');
    } catch {
      continue;
    }

    const patterns = sourceRuntimeCapable
      ? sourceListenerPatterns(source, filePath)
      : containerListenerPatterns(source);
    if (patterns.length === 0) continue;

    candidates.push({
      path: toRepoPath(filePath),
      source_type: sourceRuntimeCapable ? 'source' : 'container',
      patterns: patterns.sort((left, right) => left.line - right.line || left.kind.localeCompare(right.kind)),
    });
  }

  return candidates.sort((left, right) => left.path.localeCompare(right.path));
}

const resolveTrackedModule = (rootDir, fromFile, specifier, trackedSet) => {
  if (!specifier.startsWith('.')) return undefined;
  const base = resolve(rootDir, dirname(fromFile), specifier);
  const extensionless = base.replace(/\.(?:m?js|cjs|ts|tsx|py)$/, '');
  const candidates = [
    base,
    `${extensionless}.ts`,
    `${extensionless}.tsx`,
    `${extensionless}.js`,
    `${extensionless}.mjs`,
    `${extensionless}.cjs`,
    `${extensionless}.py`,
    `${extensionless}/index.ts`,
    `${extensionless}/index.js`,
    `${extensionless}/index.py`,
  ];
  return candidates.find((candidate) => trackedSet.has(toRepoPath(relative(rootDir, candidate))));
};

const relativeImportSpecifiers = (source, extension) => {
  const specifiers = [];
  const jsImportPattern = /(?:\bfrom\s*|\bimport\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)(['"])([^'"]+)\1/g;
  for (const match of source.matchAll(jsImportPattern)) {
    if (match[2].startsWith('.')) specifiers.push(match[2]);
  }

  if (extension === '.py') {
    const pythonImportPattern = /^\s*from\s+(\.+[\w.]*)\s+import\s+/gm;
    for (const match of source.matchAll(pythonImportPattern)) {
      const dots = match[1].match(/^\.+/)?.[0].length ?? 0;
      const modulePath = match[1].slice(dots).replaceAll('.', '/');
      specifiers.push(`${'.'.repeat(Math.max(1, dots))}${modulePath ? `/${modulePath}` : ''}`);
    }
  }

  return [...new Set(specifiers)];
};

/** Resolve the tracked relative module graph rooted at a listener candidate. */
export function resolveListenerModuleGraph(candidatePath, options = {}) {
  const rootDir = resolve(optionRootDir(options));
  const trackedFiles = trackedRepositoryFiles(rootDir, optionTrackedFiles(options));
  const trackedSet = new Set(trackedFiles);
  const entryPath = toRepoPath(candidatePath);
  if (!trackedSet.has(entryPath)) {
    throw new Error(`Listener candidate is not tracked: ${entryPath}`);
  }

  const visited = new Set();
  const pending = [entryPath];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    const source = fs.readFileSync(resolve(rootDir, current), 'utf8');
    for (const specifier of relativeImportSpecifiers(source, extname(current).toLowerCase())) {
      const resolved = resolveTrackedModule(rootDir, current, specifier, trackedSet);
      if (resolved) {
        pending.push(toRepoPath(relative(rootDir, resolved)));
      }
    }
  }

  return [...visited].sort();
}

const skipWhitespaceAndComments = (source, start) => {
  let index = start;
  while (index < source.length) {
    if (/\s/.test(source[index])) {
      index += 1;
    } else if (source.startsWith('//', index)) {
      const newline = source.indexOf('\n', index + 2);
      index = newline === -1 ? source.length : newline + 1;
    } else if (source.startsWith('#', index)) {
      const newline = source.indexOf('\n', index + 1);
      index = newline === -1 ? source.length : newline + 1;
    } else {
      break;
    }
  }
  return index;
};

const readLiteralArgument = (source, openIndex, filePath) => {
  const start = skipWhitespaceAndComments(source, openIndex + 1);
  const quote = source[start];
  if (!['\'', '"', '`'].includes(quote)) {
    throw new Error(`Unsupported dynamic route registration at ${filePath}:${sourceLineAt(source, start)}`);
  }

  let value = '';
  let index = start + 1;
  while (index < source.length) {
    const character = source[index];
    if (character === '\\') {
      const next = source[index + 1];
      if (next === undefined) break;
      value += next;
      index += 2;
      continue;
    }
    if (character === quote) {
      if (quote === '`' && value.includes('${')) {
        throw new Error(`Unsupported dynamic route registration at ${filePath}:${sourceLineAt(source, start)}`);
      }
      const afterLiteral = skipWhitespaceAndComments(source, index + 1);
      if (![',', ')', ']'].includes(source[afterLiteral])) {
        throw new Error(`Unsupported dynamic route registration at ${filePath}:${sourceLineAt(source, start)}`);
      }
      return { value, afterLiteral, line: sourceLineAt(source, start) };
    }
    value += character;
    index += 1;
  }

  throw new Error(`Unsupported dynamic route registration at ${filePath}:${sourceLineAt(source, start)}`);
};

const routeFromLiteral = (method, literal, filePath, line) => {
  if (!literal.startsWith('/')) {
    throw new Error(`Unsupported non-path route registration at ${filePath}:${line}`);
  }
  return { method, path: literal, file: filePath, line };
};

const pythonMethodsFromTail = (source, afterLiteral, filePath, line) => {
  const end = source.indexOf(')', afterLiteral);
  const tail = source.slice(afterLiteral, end === -1 ? source.length : end);
  const methodsMatch = tail.match(/\bmethods\s*=\s*\[([\s\S]*?)\]/);
  if (!methodsMatch) return ['GET'];
  const methods = [...methodsMatch[1].matchAll(/['"]([A-Za-z]+)['"]/g)].map((match) => match[1].toUpperCase());
  if (methods.length === 0 || methodsMatch[1].replace(/['"\s,]/g, '')) {
    throw new Error(`Unsupported dynamic route registration at ${filePath}:${line}`);
  }
  return methods;
};

const extractJavaScriptRoutes = (source, filePath) => {
  const routes = [];
  const routeCallPattern = /\b(?:app|router|application|server)\s*\.\s*(get|post|put|patch|delete|options|head|all)\s*\(/gi;
  for (const match of source.matchAll(routeCallPattern)) {
    const method = ROUTE_METHODS.get(match[1].toLowerCase());
    const openIndex = (match.index ?? 0) + match[0].length - 1;
    const literal = readLiteralArgument(source, openIndex, filePath);
    routes.push(routeFromLiteral(method, literal.value, filePath, literal.line));
  }

  const dynamicRoutePattern = /\b(?:app|router|application|server)\s*\[[^\]]+\]\s*\(/g;
  const dynamicMatch = dynamicRoutePattern.exec(source);
  if (dynamicMatch) {
    throw new Error(
      `Unsupported dynamic route registration at ${filePath}:${sourceLineAt(source, dynamicMatch.index)}`,
    );
  }
  return routes;
};

const extractPythonRoutes = (source, filePath) => {
  const routes = [];
  const decoratorPattern = /@(?:app|router|application)\s*\.\s*(get|post|put|patch|delete|options|head|route|api_route)\s*\(/gi;
  for (const match of source.matchAll(decoratorPattern)) {
    const operation = match[1].toLowerCase();
    const openIndex = (match.index ?? 0) + match[0].length - 1;
    const literal = readLiteralArgument(source, openIndex, filePath);
    const methods = ROUTE_METHODS.has(operation)
      ? [ROUTE_METHODS.get(operation)]
      : pythonMethodsFromTail(source, literal.afterLiteral, filePath, literal.line);
    for (const method of methods) {
      routes.push(routeFromLiteral(method, literal.value, filePath, literal.line));
    }
  }

  const functionRoutePattern = /\b(?:app|router|application)\s*\.\s*(add_api_route|add_url_rule)\s*\(/gi;
  for (const match of source.matchAll(functionRoutePattern)) {
    const openIndex = (match.index ?? 0) + match[0].length - 1;
    const literal = readLiteralArgument(source, openIndex, filePath);
    const methods = pythonMethodsFromTail(source, literal.afterLiteral, filePath, literal.line);
    for (const method of methods) {
      routes.push(routeFromLiteral(method, literal.value, filePath, literal.line));
    }
  }

  const dynamicPattern = /\b(?:app|router|application)\s*\[[^\]]+\]\s*\(|\bgetattr\s*\(\s*(?:app|router|application)\s*,/g;
  const dynamicMatch = dynamicPattern.exec(source);
  if (dynamicMatch) {
    throw new Error(
      `Unsupported dynamic route registration at ${filePath}:${sourceLineAt(source, dynamicMatch.index)}`,
    );
  }
  return routes;
};

/** Extract literal route registrations from a product listener's module graph. */
export function extractProductRoutes(disposition, options = {}) {
  const parsedDisposition = ListenerDispositionSchema.parse(disposition);
  if (parsedDisposition.disposition !== 'product-surface') return [];

  const rootDir = resolve(optionRootDir(options));
  const files = resolveListenerModuleGraph(parsedDisposition.candidate_path, options);
  const routes = [];
  for (const filePath of files) {
    const extension = extname(filePath).toLowerCase();
    if (!RUNTIME_SOURCE_EXTENSIONS.has(extension)) continue;
    const source = fs.readFileSync(resolve(rootDir, filePath), 'utf8');
    routes.push(...(extension === '.py' ? extractPythonRoutes(source, filePath) : extractJavaScriptRoutes(source, filePath)));
  }

  const seen = new Set();
  return routes
    .filter((route) => {
      const key = `${route.method}:${route.path}:${route.file}:${route.line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line || left.method.localeCompare(right.method))
    .map((route) => ({
      ...route,
      id: canonicalRowId(
        parsedDisposition.row_namespace === 'listener'
          ? `listener:${parsedDisposition.listener_id}:${route.method}:${route.path}`
          : `api:${route.method}:${route.path}`,
      ),
    }));
}

export function listenerDispositionFingerprint(disposition, candidate) {
  const dispositionForParsing = { ...disposition };
  if (!dispositionForParsing.fingerprint) dispositionForParsing.fingerprint = '0'.repeat(64);
  const parsedDisposition = ListenerDispositionSchema.parse(dispositionForParsing);
  const patterns = (candidate?.patterns ?? parsedDisposition.detected_listener_patterns ?? []).map((pattern) => ({
    kind: pattern.kind,
    text: pattern.text,
  }));
  const fingerprintInput = {
    candidate_path: parsedDisposition.candidate_path,
    detected_listener_patterns: patterns,
    disposition: parsedDisposition.disposition,
  };
  if (parsedDisposition.disposition === 'product-surface') {
    fingerprintInput.row_namespace = parsedDisposition.row_namespace;
    fingerprintInput.route_extraction_strategy = parsedDisposition.route_extraction_strategy;
  } else {
    fingerprintInput.rationale = parsedDisposition.rationale;
    fingerprintInput.evidence = parsedDisposition.evidence;
  }
  return createHash('sha256').update(JSON.stringify(stableValue(fingerprintInput))).digest('hex');
}

export const computeListenerDispositionFingerprint = listenerDispositionFingerprint;

const offRowFingerprint = (value) => createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');

export function dormantCandidateFingerprint(candidate) {
  return offRowFingerprint({
    path: candidate.path,
    importer_evidence: candidate.importer_evidence ?? [],
  });
}

export function orphanResolutionFingerprint(orphan) {
  return offRowFingerprint({
    id: canonicalRowId(orphan.id),
    resolution: orphan.resolution,
    last_contract_fingerprint: orphan.last_contract_fingerprint,
    replacement_row: orphan.replacement_row ?? orphan.replacement,
    evidence: orphan.resolution_evidence ?? orphan.decision_evidence ?? orphan.evidence,
  });
}

export function absenceEvidenceFingerprint(family) {
  const absenceEvidence = { ...(family.absence_evidence ?? {}) };
  delete absenceEvidence.fingerprint;
  delete absenceEvidence.contract_fingerprint;
  return offRowFingerprint({
    id: family.id,
    selector: family.selector,
    absence_evidence: absenceEvidence,
  });
}

export function runtimeExclusionFingerprint(exclusion) {
  return offRowFingerprint({
    id: exclusion.id ?? exclusion.exclusion_id ?? exclusion.layer_id,
    matched_layer: exclusion.matched_layer ?? exclusion.layer ?? exclusion.layer_id,
    rule: exclusion.rule,
    evidence: exclusion.evidence,
  });
}

export const computeDormantCandidateFingerprint = dormantCandidateFingerprint;
export const computeOrphanResolutionFingerprint = orphanResolutionFingerprint;
export const computeAbsenceEvidenceFingerprint = absenceEvidenceFingerprint;
export const computeRuntimeExclusionFingerprint = runtimeExclusionFingerprint;

const MERGE_HUMAN_FIELD_NAMES = Object.freeze([
  'personas',
  'persistence',
  'destructive',
  'environment',
  'owner',
  'seam_override',
  'classification',
  'closure_owner',
  'closure_gate',
  'closure_acceptance',
  'decision_override',
  'decision_status',
  'decision_evidence',
]);

const cloneJson = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

const mergeArrayUnique = (left = [], right = []) => {
  const result = [];
  const seen = new Set();
  for (const value of [...left, ...right]) {
    const key = JSON.stringify(stableValue(value));
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
};

const canonicalRows = (rows, label) => {
  if (!Array.isArray(rows)) throw new Error(`${label} rows must be an array`);
  const seen = new Map();
  for (const row of rows) {
    const canonicalId = canonicalRowId(row.id);
    const previous = seen.get(canonicalId);
    if (previous && previous.rawId !== row.id) {
      throw new Error(
        `Canonical row-id collision: ${JSON.stringify(previous.rawId)} and ${JSON.stringify(row.id)} -> ${canonicalId}`,
      );
    }
    if (!previous) {
      seen.set(canonicalId, { rawId: row.id, row: cloneJson({ ...row, id: canonicalId }) });
      continue;
    }

    // Same canonical row identity is valid when a source emits multiple
    // definitions. Keep one row and union machine definition-bearing fields.
    previous.row.exposures = mergeArrayUnique(previous.row.exposures, row.exposures);
    previous.row.evidence = mergeArrayUnique(previous.row.evidence, row.evidence);
    previous.row.auth_roles = mergeArrayUnique(previous.row.auth_roles, row.auth_roles);
    previous.row.auth_evidence = mergeArrayUnique(previous.row.auth_evidence, row.auth_evidence);
    previous.row.behavior_flags = mergeArrayUnique(previous.row.behavior_flags, row.behavior_flags);
    previous.row.queue_roles = {
      producers: mergeArrayUnique(previous.row.queue_roles?.producers, row.queue_roles?.producers),
      consumers: mergeArrayUnique(previous.row.queue_roles?.consumers, row.queue_roles?.consumers),
    };
  }
  return new Map([...seen.entries()].map(([id, value]) => [id, value.row]));
};

const parseMatrixDocument = (document, label) => {
  if (!document || typeof document !== 'object') throw new Error(`${label} must be an object`);
  const parsed = SurfaceMatrixDocumentSchema.parse({
    ...document,
    coverage_review: document.coverage_review ?? {},
  });
  return {
    ...parsed,
    rows: canonicalRows(parsed.rows, label),
    orphans: Array.isArray(document.orphans) ? cloneJson(document.orphans) : [],
  };
};

const sortedStrings = (values = []) => [...new Set(values)].sort((left, right) => left.localeCompare(right));

const sameStableValue = (left, right) =>
  JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));

const sourceHashSetChanged = (previous, current) =>
  JSON.stringify(sortedStrings(previous)) !== JSON.stringify(sortedStrings(current));

const freshDecisionFields = (seededRow) => {
  const row = cloneJson(seededRow);
  row.id = canonicalRowId(row.id);
  row.decision_suggestion = proposeDecision(row);
  row.decision = row.decision_override ?? row.decision_suggestion;
  return row;
};

const preserveHumanRowFields = (freshRow, previousRow) => {
  const merged = { ...freshRow };
  for (const field of MERGE_HUMAN_FIELD_NAMES) {
    if (Object.prototype.hasOwnProperty.call(previousRow, field)) merged[field] = cloneJson(previousRow[field]);
  }
  if (Object.prototype.hasOwnProperty.call(previousRow, 'test_evidence')) {
    merged.test_evidence = {
      ...freshRow.test_evidence,
      manual: cloneJson(previousRow.test_evidence?.manual ?? []),
    };
  }
  merged.seam_override = previousRow.seam_override;
  merged.decision = merged.decision_override ?? merged.decision_suggestion;
  return merged;
};

const preserveUnchangedBootTimestamps = (freshRow, previousRow) => {
  const previousExposures = previousRow?.exposures ?? [];
  freshRow.exposures = (freshRow.exposures ?? []).map((exposure, index) => {
    const previousExposure = previousExposures.find(
      (candidate) => candidate.deployment === exposure.deployment && candidate.runtime === exposure.runtime,
    ) ?? previousExposures[index];
    const freshBoot = exposure.boot_evidence;
    const previousBoot = previousExposure?.boot_evidence;
    if (
      previousExposure
      && previousExposure.boot_status === exposure.boot_status
      && sameStableValue(
        {
          command_or_artifact: previousBoot?.command_or_artifact,
          probe: previousBoot?.probe,
          result: previousBoot?.result,
        },
        {
          command_or_artifact: freshBoot?.command_or_artifact,
          probe: freshBoot?.probe,
          result: freshBoot?.result,
        },
      )
      && previousBoot?.observed_at
    ) {
      return {
        ...exposure,
        boot_evidence: { ...freshBoot, observed_at: previousBoot.observed_at },
      };
    }
    return exposure;
  });
  return freshRow;
};

const demoteApprovalIfStale = (merged, previous, reentry = false) => {
  const fingerprintChanged = previous?.decision_status === 'approved'
    && previous.contract_fingerprint !== merged.contract_fingerprint;
  const sourceHashesChanged = previous?.decision_status === 'approved'
    && sourceHashSetChanged(previous.approved_source_hashes, merged.approved_source_hashes);
  const suggestionsChanged = previous?.decision_status === 'approved'
    && !sameStableValue(previous.machine_suggestions, merged.machine_suggestions);
  if (reentry || fingerprintChanged || sourceHashesChanged || suggestionsChanged) {
    merged.decision_status = 'proposed';
  }
  return merged;
};

const mergeOneRow = (previousRow, seededRow, reentry = false) => {
  const fresh = freshDecisionFields(seededRow);
  if (!previousRow) {
    fresh.decision_status = 'proposed';
    delete fresh.decision_override;
    delete fresh.decision_evidence;
    fresh.decision = fresh.decision_suggestion;
    fresh.contract_fingerprint = contractFingerprint(fresh);
    return fresh;
  }

  const merged = preserveUnchangedBootTimestamps(preserveHumanRowFields(fresh, previousRow), previousRow);
  merged.contract_fingerprint = contractFingerprint(merged);
  return demoteApprovalIfStale(merged, previousRow, reentry);
};

const orphanForRow = (row) => ({
  id: row.id,
  resolution: 'unresolved',
  vanished_row: cloneJson(row),
  last_contract_fingerprint: row.contract_fingerprint ?? contractFingerprint(row),
});

const replacementRowForOrphan = (orphan) =>
  orphan.replacement_row ?? orphan.replacement ?? (orphan.resolution === 'retained' ? orphan.row : undefined);

const rowIdentityKeys = (row) => [
  row.source_mapping?.function_file ? `function:${row.source_mapping.function_file}` : undefined,
  row.source_mapping?.candidate_path ? `candidate:${row.source_mapping.candidate_path}` : undefined,
  row.source_mapping?.kg_node ? `kg:${row.source_mapping.kg_node}` : undefined,
  row.source_mapping?.listener_id && row.source_mapping?.candidate_path
    ? `listener:${row.source_mapping.listener_id}:${row.source_mapping.candidate_path}` : undefined,
].filter(Boolean);

/**
 * Merge fresh machine seed output into a human-reviewed matrix.
 * Machine fields are taken from seededDocument; human fields are copied only
 * by canonical row id. The returned document is deterministic and timestamp
 * free except for boot evidence supplied by the seed.
 */
export function mergeMatrix(previousDocument, seededDocument) {
  const previous = parseMatrixDocument(previousDocument, 'previous document');
  const seeded = parseMatrixDocument(seededDocument, 'seeded document');
  if (previous.phase === 'closed' && seeded.phase === 'authoring') {
    throw new Error('Cannot write authoring matrix over closed matrix');
  }

  const previousRows = previous.rows;
  const seededRows = new Map(seeded.rows);
  const previousByIdentity = new Map();
  for (const previousRow of previousRows.values()) {
    for (const identity of rowIdentityKeys(previousRow)) {
      if (!previousByIdentity.has(identity)) previousByIdentity.set(identity, previousRow);
    }
  }
  const existingOrphans = new Map(
    previous.orphans.map((orphan) => [canonicalRowId(orphan.id), cloneJson(orphan)]),
  );
  const retainedReentries = new Map();
  for (const orphan of existingOrphans.values()) {
    if (orphan.resolution !== 'retained') continue;
    const replacement = replacementRowForOrphan(orphan);
    if (!replacement) {
      throw new Error(`Retained orphan ${orphan.id} requires replacement_row and evidence`);
    }
    if (!Array.isArray(replacement.exposures) || replacement.exposures.length === 0) {
      throw new Error(`Retained orphan ${orphan.id} requires replacement exposures`);
    }
    if (!Array.isArray(replacement.evidence) || replacement.evidence.length === 0) {
      throw new Error(`Retained orphan ${orphan.id} requires replacement evidence`);
    }
    const replacementId = canonicalRowId(replacement.id ?? orphan.id);
    if (!seededRows.has(replacementId)) retainedReentries.set(replacementId, cloneJson({ ...replacement, id: replacementId }));
  }

  const rows = [];
  const consumedPreviousIds = new Set();
  for (const [id, seededRow] of seededRows) {
    const previousRow = previousRows.get(id)
      ?? rowIdentityKeys(seededRow).map((identity) => previousByIdentity.get(identity)).find(Boolean);
    if (previousRow) consumedPreviousIds.add(previousRow.id);
    rows.push(mergeOneRow(previousRow, seededRow, retainedReentries.has(id)));
  }
  for (const [id, replacement] of retainedReentries) {
    if (!seededRows.has(id)) rows.push(mergeOneRow(undefined, replacement, true));
  }

  const currentIds = new Set(rows.map((row) => row.id));
  for (const [id, previousRow] of previousRows) {
    if (currentIds.has(id) || consumedPreviousIds.has(id)) continue;
    if (!existingOrphans.has(id)) existingOrphans.set(id, orphanForRow(previousRow));
  }

  const coverageReview = {};
  for (const [key, value] of Object.entries(previous.coverage_review ?? {})) {
    const rowId = key.split('|', 1)[0];
    const currentRow = rows.find((row) => row.id === rowId);
    if (currentRow && value.contract_fingerprint === currentRow.contract_fingerprint) {
      coverageReview[key] = cloneJson(value);
    }
  }
  const output = {
    ...cloneJson(seeded),
    phase: previous.phase === 'closed' ? 'closed' : seeded.phase,
    rows: rows.sort((left, right) => left.id.localeCompare(right.id)),
    coverage_review: coverageReview,
    orphans: [...existingOrphans.values()].sort((left, right) => left.id.localeCompare(right.id)),
  };
  return SurfaceMatrixDocumentSchema.parse(output);
}

const CLIENT_SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const isExcludedClientPath = (filePath) => {
  const normalized = toRepoPath(filePath).toLowerCase();
  const basename = normalized.split('/').at(-1) ?? '';
  return normalized.split('/').some((segment) =>
    ['test', 'tests', '__tests__', 'spec', 'specs', 'fixture', 'fixtures', 'stories'].includes(segment),
  ) || /\.(?:test|spec|stories)\.[^.]+$/.test(basename);
};

const clientModuleCandidates = (rootDir, fromFile, specifier, trackedSet) => {
  let base;
  if (specifier.startsWith('@/')) base = resolve(rootDir, 'client/src', specifier.slice(2));
  else if (specifier.startsWith('.')) base = resolve(rootDir, dirname(fromFile), specifier);
  else return [];
  const candidates = [
    base,
    ...[...CLIENT_SOURCE_EXTENSIONS].map((extension) => `${base}${extension}`),
    ...[...CLIENT_SOURCE_EXTENSIONS].map((extension) => `${base}/index${extension}`),
  ];
  return candidates
    .map((candidate) => toRepoPath(relative(rootDir, candidate)))
    .filter((candidate) => trackedSet.has(candidate));
};

const sourceWithoutTypeImports = (source) =>
  source
    .replace(/\bimport\s+type[\s\S]*?from\s*(['"])[^'"]+\1\s*;?/g, (match) =>
      match.replaceAll(/[^\n]/g, ' '),
    )
    .replace(/\bexport\s+type[\s\S]*?from\s*(['"])[^'"]+\1\s*;?/g, (match) =>
      match.replaceAll(/[^\n]/g, ' '),
    )
    .replace(
      /\bimport\s*\{\s*(?:type\s+[A-Za-z_$][\w$]*\s*,?\s*)+\}\s*from\s*(['"])[^'"]+\1\s*;?/g,
      (match) => match.replaceAll(/[^\n]/g, ' '),
    );

const clientImportSpecifiers = (source) => {
  const cleaned = sourceWithoutTypeImports(source);
  const imports = [];
  const patterns = [
    { kind: 'static-import', regex: /\bfrom\s*(['"])([^'"]+)\1/g },
    { kind: 'side-effect-import', regex: /\bimport\s*(['"])([^'"]+)\1/g },
    { kind: 'lazy-import', regex: /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g },
    { kind: 're-export', regex: /\bexport\s*[^;\n]*?\sfrom\s*(['"])([^'"]+)\1/g },
  ];
  for (const { kind, regex } of patterns) {
    for (const match of cleaned.matchAll(regex)) {
      imports.push({
        kind,
        specifier: match[2],
        line: sourceLineAt(source, match.index ?? 0),
      });
    }
  }
  return imports;
};

const isScreenExport = (source) =>
  /\bexport\s+(?:default\s+|async\s+)?(?:function|class|const|let|var)\b/.test(source)
  || /\bexport\s*\{[^}]+\}/s.test(source)
  || /\bexport\s+default\b/.test(source);

// Roots cover all three routing surfaces (ARCHI §5): the app entry chain
// (main -> App -> app-router) reaches the public-entry surface (login,
// portal, shared links) that the route-definition files alone do not.
const dormantRouterRoot = (filePath) =>
  filePath === 'client/src/main.tsx'
  || filePath === 'client/src/App.tsx'
  || filePath === 'client/src/app/app-router.tsx'
  || filePath === 'client/src/app/app-routes.tsx'
  || filePath === 'client/src/app/app-route-definitions.ts'
  || filePath === 'client/src/app/route-governance-registry.ts'
  || filePath === 'shared/routes/app-route-definitions.ts'
  || filePath === 'shared/routes/route-governance-registry.ts';

const mergeDormantCandidate = (previous, discovered) => {
  const merged = { ...discovered };
  if (previous) {
    for (const field of ['disposition', 'evidence', 'decision_status', 'decision_evidence', 'contract_fingerprint']) {
      if (Object.prototype.hasOwnProperty.call(previous, field)) merged[field] = cloneJson(previous[field]);
    }
  }
  const fingerprint = dormantCandidateFingerprint(merged);
  if (previous?.decision_status === 'approved'
    && previous.contract_fingerprint
    && previous.contract_fingerprint !== fingerprint) {
    merged.decision_status = 'proposed';
  }
  merged.contract_fingerprint = fingerprint;
  return merged;
};

/** Discover page screens that are not reachable from tracked router sources. */
export function discoverDormantCandidates(options = {}) {
  const rootDir = resolve(optionRootDir(options));
  const trackedFiles = trackedRepositoryFiles(rootDir, optionTrackedFiles(options));
  const trackedSet = new Set(trackedFiles);
  const sources = new Map();
  for (const filePath of trackedFiles) {
    if (!CLIENT_SOURCE_EXTENSIONS.has(extname(filePath).toLowerCase()) || isExcludedClientPath(filePath)) continue;
    try {
      sources.set(filePath, fs.readFileSync(resolve(rootDir, filePath), 'utf8'));
    } catch {
      // Tracked-but-missing files are ignored; git state is the authoritative universe.
    }
  }

  const reachable = new Set();
  const importEvidence = new Map();
  const pending = trackedFiles.filter(dormantRouterRoot);
  while (pending.length > 0) {
    const current = pending.shift();
    if (!current || reachable.has(current) || !sources.has(current)) continue;
    reachable.add(current);
    for (const imported of clientImportSpecifiers(sources.get(current))) {
      const resolved = clientModuleCandidates(rootDir, current, imported.specifier, trackedSet)[0];
      if (!resolved || isExcludedClientPath(resolved)) continue;
      const evidence = importEvidence.get(resolved) ?? [];
      evidence.push({ importer: current, kind: imported.kind, line: imported.line });
      importEvidence.set(resolved, evidence);
      pending.push(resolved);
    }
  }

  const discovered = [];
  for (const [filePath, source] of sources) {
    if (!filePath.startsWith('client/src/pages/')) continue;
    if (!isScreenExport(source) || reachable.has(filePath)) continue;
    discovered.push({
      id: canonicalRowId(`dormant:${filePath}`),
      path: filePath,
      exists: true,
      importer_evidence: (importEvidence.get(filePath) ?? []).sort(
        (left, right) => left.importer.localeCompare(right.importer) || left.line - right.line,
      ),
    });
  }
  const sorted = discovered.sort((left, right) => left.path.localeCompare(right.path));
  return options.previousCandidates
    ? mergeDormantCandidates(options.previousCandidates, sorted)
    : sorted;
}

/** Merge dormant candidates by stable path, replacing machine evidence only. */
export function mergeDormantCandidates(previousCandidates, discoveredCandidates) {
  const previous = new Map((previousCandidates ?? []).map((candidate) => [candidate.path, candidate]));
  return [...(discoveredCandidates ?? [])]
    .map((candidate) => mergeDormantCandidate(previous.get(candidate.path), candidate))
    .sort((left, right) => left.path.localeCompare(right.path));
}

const bullmqFileExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

const literalConstants = (source) => {
  const values = new Map();
  for (const match of source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(['"])([^'"]+)\2/g)) {
    values.set(match[1], { value: match[3], source: 'constant' });
  }
  for (const match of source.matchAll(/\b([A-Za-z_$][\w$]*)\s*(?::[^=,)]+)?\s*=\s*(['"])([^'"]+)\2/g)) {
    if (!values.has(match[1])) values.set(match[1], { value: match[3], source: 'parameter-default' });
  }
  return values;
};

const firstConstructorArgument = (source, openIndex) => {
  const start = skipWhitespaceAndComments(source, openIndex + 1);
  const quote = source[start];
  if (quote === '\'' || quote === '"') {
    const end = source.indexOf(quote, start + 1);
    return end === -1 ? undefined : { value: source.slice(start + 1, end), source: 'literal' };
  }
  const match = source.slice(start).match(/^([A-Za-z_$][\w$]*)/);
  return match ? { value: match[1], source: 'identifier' } : undefined;
};

/** Scan tracked server/worker BullMQ Worker and Queue constructors. */
export function scanBullmqConstructors(options = {}) {
  const rootDir = resolve(optionRootDir(options));
  const trackedFiles = trackedRepositoryFiles(rootDir, optionTrackedFiles(options));
  const findings = [];
  for (const filePath of trackedFiles) {
    if (!(filePath.startsWith('server/') || filePath.startsWith('workers/'))) continue;
    if (isExcludedRuntimePath(filePath) || !bullmqFileExtensions.has(extname(filePath).toLowerCase())) continue;
    const source = fs.readFileSync(resolve(rootDir, filePath), 'utf8');
    if (!/from\s*['"]bullmq['"]|require\s*\(\s*['"]bullmq['"]/.test(source)) continue;
    const constants = literalConstants(source);
    const constructorPattern = /\bnew\s+(?:bullmq\.)?(Worker|Queue)\s*(?:<[^\n()]*>)?\s*\(/g;
    for (const match of source.matchAll(constructorPattern)) {
      const argument = firstConstructorArgument(source, (match.index ?? 0) + match[0].length - 1);
      if (!argument) continue;
      const resolved = argument.source === 'identifier' ? constants.get(argument.value) : argument;
      if (!resolved) continue;
      findings.push({
        constructor: match[1],
        kind: match[1].toLowerCase(),
        queue_name: resolved.value,
        queueName: resolved.value,
        source: resolved.source,
        path: toRepoPath(filePath),
        line: sourceLineAt(source, match.index ?? 0),
      });
    }
  }
  return findings.sort(
    (left, right) => left.queue_name.localeCompare(right.queue_name)
      || left.path.localeCompare(right.path)
      || left.line - right.line
      || left.constructor.localeCompare(right.constructor),
  );
}
