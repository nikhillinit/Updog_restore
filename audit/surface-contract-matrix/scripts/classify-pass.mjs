import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  API_ROUTE_POLICY_REGISTRY,
  routePolicyKey,
} from '../../../server/route-policy/api-route-policy-registry.ts';
import { COMMON_API_ROUTE_MANIFEST } from '../../../shared/routes/api-route-manifest.ts';
import { ROUTE_GOVERNANCE_REGISTRY } from '../../../shared/routes/route-governance-registry.ts';
import {
  AUTH_IDENTITY_PERSONA_MAPPING,
  AUTH_UNRESOLVED_ROLE,
  assertAuthRoleMappingExhaustive,
  canonicalRowId,
  discoverAuthRoleEvidence,
  mergeMatrix,
  SurfaceMatrixDocumentSchema,
} from '../matrix-schema.mjs';
import { closureReport } from './validate-matrix.mjs';

/*
 * Phase 2 is an authoring sweep, not a second proposal engine.
 *
 * Persona rule: an HTTP row with only decided auth identities receives the
 * mapped personas. An undecided or unresolved identity remains unknown. An
 * HTTP row with no role guard receives gp+admin only when its policy boundary
 * has a fund-scoped mode; require_auth without fund scope remains unknown.
 * Public health/metrics-ingest/login/shared/portal evidence is public; the
 * worker, scheduler, event, and websocket interfaces are system surfaces.
 * Client persona follows route-governance surface: lp-route -> lp,
 * admin-gated -> admin, public-contract -> public, otherwise gp.
 *
 * Persistence rule: GET/HEAD/OPTIONS and client routes are reads-only;
 * mutation HTTP methods and runtime background interfaces write; ANY remains
 * unknown. Destructive rule: reads are none, DELETE is destructive, and all
 * other mutations are soft unless an existing policy hint explicitly names
 * destructive/delete/irreversible behavior. Environment rule: release
 * contract reads are prod-safe and writes staged-only; ml-service-local,
 * dev-only, and local reachability are local-only; dormant rows stay unknown.
 *
 * Human values are patched only when still seeded as unknown/unassigned.
 * mergeMatrix runs first so machine refreshes and orphan/coverage behavior
 * retain the same merge path as seed-matrix; a second seed therefore cannot
 * clobber this pass.
 * Suggestion-derived fields are sticky only after decision evidence exists.
 * Proposed rows without decision_evidence are authoring material, so this
 * pass resets personas, persistence, destructive, environment, and owner from
 * fresh machine_suggestions before applying the rules above.
 */

const thisFile = fileURLToPath(import.meta.url);
const matrixDir = path.resolve(path.dirname(thisFile), '..');
const repoRoot = path.resolve(matrixDir, '../..');
const matrixFile = path.join(matrixDir, 'matrix.json');
const requirementsFile = path.join(matrixDir, 'requirements.json');
const listenersFile = path.join(matrixDir, 'listener-dispositions.json');
const candidatesFile = path.join(matrixDir, 'dormant-candidates.json');
const orphansFile = path.join(matrixDir, 'orphans.json');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJsonAtomic = (file, value) => {
  const temporary = `${file}.classify.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
};
const sortedUnique = (values) => [...new Set(values)].sort((left, right) => left.localeCompare(right));
const validOwners = new Set(['platform', 'gp-team', 'analytics', 'lp-reporting', 'reporting']);
const routePolicies = new Map(API_ROUTE_POLICY_REGISTRY.map((entry) => [routePolicyKey(entry), entry]));
// Policy entries also carry a canonical-normalizable id (api:post:/x) — the
// exact-id join catches entries whose routePolicyKey format differs from the
// classifier's method+path lookup.
const routePoliciesByCanonicalId = new Map();
for (const entry of API_ROUTE_POLICY_REGISTRY) {
  if (typeof entry.id === 'string' && entry.id.startsWith('api:')) {
    try {
      routePoliciesByCanonicalId.set(canonicalRowId(entry.id), entry);
    } catch {
      // Non-canonical policy ids fall back to the key join below.
    }
  }
}
const routeGovernance = new Map(ROUTE_GOVERNANCE_REGISTRY.map((entry) => [entry.path, entry]));
const manifestById = new Map(COMMON_API_ROUTE_MANIFEST.map((entry) => [entry.id, entry]));

const directRouterNames = Object.freeze([
  ['reserves-v1', 'server/routes/v1/reserves.ts'],
  ['cashflow', 'server/routes/cashflow.ts'],
  ['calculations', 'server/routes/calculations.ts'],
  ['ai', 'server/routes/ai.ts'],
  ['scenario-analysis', 'server/routes/scenario-analysis.ts'],
]);

const rowRoute = (row) => {
  if (row.id.startsWith('client:')) return row.source_mapping?.route_path ?? row.id.slice('client:'.length);
  const match = row.id.match(/^[^:]+:([^:]+):(.*)$/);
  return match ? { method: match[1], path: match[2] } : undefined;
};

const rowPolicy = (row) => {
  if (row.id.startsWith('api:')) {
    const byId = routePoliciesByCanonicalId.get(row.id);
    if (byId) return byId;
  }
  const route = rowRoute(row);
  if (!route) return undefined;
  if (typeof route === 'string') return routePolicies.get(`client:${route}`) || routePolicies.get(route);
  return routePolicies.get(`${route.method} ${route.path}`) || routePolicies.get(route.path);
};

const rowManifestOwner = (row) => {
  for (const id of row.source_mapping?.manifest_ids ?? []) {
    const owner = manifestById.get(id)?.owner;
    if (validOwners.has(owner)) return owner;
  }
  return undefined;
};

const ownerForRow = (row) => {
  if (row.owner !== 'unassigned') return row.owner;
  const policyOwner = rowPolicy(row)?.owner;
  if (validOwners.has(policyOwner)) return policyOwner;
  const manifestOwner = rowManifestOwner(row);
  if (manifestOwner) return manifestOwner;
  if (row.interface === 'client-route') {
    const route = rowRoute(row);
    const governance = routeGovernance.get(route);
    if (governance?.surface === 'lp-route' || route === '/lp' || route?.startsWith('/lp/')) return 'lp-reporting';
    if (governance?.surface === 'admin-gated') return 'platform';
    if (governance?.surface === 'public-contract' && /^\/(?:shared|portal)(?:\/|$)/.test(route)) return 'lp-reporting';
    return 'gp-team';
  }
  if (row.interface === 'worker-job') {
    const domain = row.source_mapping?.queue_name || row.seam;
    if (['reserve-calc', 'pacing-calc', 'cohort-calc', 'monte-carlo-simulations', 'fund-scenario-calc', 'backtesting-jobs', 'scenario-generation', 'economics-calc'].includes(domain)) return 'analytics';
    if (['lp-report-generation', 'lp-view-refresh'].includes(domain)) return 'lp-reporting';
    if (domain === 'capital-call-status') return 'gp-team';
    if (domain === 'error-tracking') return 'platform';
  }
  if (row.interface === 'scheduler') {
    if (row.seam === 'variance-alert-automation' || row.seam === 'internal-analysis-checkpoint') return 'analytics';
    if (row.seam === 'artifact-retention') return 'platform';
  }
  if (row.interface === 'event-handler' && row.seam === 'calc-run-completion') return 'analytics';
  if (row.interface === 'websocket') return 'platform';
  if (row.seam === 'worker-health') return 'platform';
  if (row.seam === 'ml-reserve') return 'analytics';
  if (row.interface === 'vercel-function' && row.seam === 'vercel-functions') return 'platform';
  return undefined;
};

const policyBoundary = (row) => String(rowPolicy(row)?.apiAuthBoundary ?? '');
const policyFundScope = (row) => String(rowPolicy(row)?.fundScopeMode ?? '');
const hasGpFundScope = (row) => [
  'parent_entity_lookup',
  'route_param_fund_id',
  'query_param_fund_id',
].includes(policyFundScope(row));

const publicRoute = (row) => {
  const route = rowRoute(row);
  const value = typeof route === 'string' ? route : route?.path;
  if (!value) return false;
  if (/^\/(?:login|portal)(?:\/|$)/.test(value) || /^\/shared\//.test(value)) return true;
  if (/(?:^|\/)(?:health|healthz|live|ready)(?:\/|$)/.test(value)) return true;
  return typeof route !== 'string' && route.method === 'POST' && /(?:^|\/)metrics\/(?:rum|ingest)(?:\/|$)/.test(value);
};

const systemSurface = (row) => ['worker-job', 'scheduler', 'event-handler', 'websocket'].includes(row.interface)
  || ['ml-reserve', 'worker-health'].includes(row.seam);

const personasForRow = (row) => {
  if (systemSurface(row)) return { personas: ['system'], reason: undefined };
  if (row.interface === 'dormant-ui') return { personas: ['unknown'], reason: 'dormant-pending' };
  if (row.interface === 'client-route') {
    const route = rowRoute(row);
    const governance = routeGovernance.get(route);
    if (governance?.surface === 'lp-route' || route === '/lp' || route?.startsWith('/lp/')) return { personas: ['lp'] };
    if (governance?.surface === 'admin-gated') return { personas: ['admin'] };
    if (governance?.surface === 'public-contract' || publicRoute(row)) return { personas: ['public'] };
    if (governance || route === '/') return { personas: ['gp'] };
    return { personas: ['unknown'], reason: 'other' };
  }

  const roles = sortedUnique(row.auth_roles ?? []);
  if (roles.includes(AUTH_UNRESOLVED_ROLE)) return { personas: ['unknown'], reason: 'unresolved-auth' };
  if (roles.length > 0) {
    const undecided = roles.filter((role) => AUTH_IDENTITY_PERSONA_MAPPING[role]?.decided !== true);
    if (undecided.length > 0) return { personas: ['unknown'], reason: 'undecided-role' };
    const mapped = sortedUnique(roles.map((role) => AUTH_IDENTITY_PERSONA_MAPPING[role].persona));
    return { personas: mapped };
  }
  if (publicRoute(row)) return { personas: ['public'] };
  if (policyBoundary(row).startsWith('require_auth') && hasGpFundScope(row)) return { personas: ['admin', 'gp'] };
  if (policyBoundary(row).startsWith('require_auth')) return { personas: ['unknown'], reason: 'unresolved-auth' };
  return { personas: ['unknown'], reason: 'unresolved-auth' };
};

const methodForRow = (row) => {
  const route = rowRoute(row);
  return typeof route === 'object' ? route.method : undefined;
};

const persistenceForRow = (row) => {
  if (row.interface === 'dormant-ui') return 'unknown';
  if (['worker-job', 'scheduler', 'event-handler', 'websocket'].includes(row.interface)) return 'writes';
  if (row.interface === 'client-route') return 'reads-only';
  const method = methodForRow(row);
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return 'reads-only';
  if (method && method !== 'ANY') return 'writes';
  return 'unknown';
};

const destructiveForRow = (row, persistence) => {
  if (persistence === 'reads-only') return 'none';
  if (persistence === 'unknown') return 'unknown';
  if (methodForRow(row) === 'DELETE') return 'destructive';
  const policy = rowPolicy(row);
  const hint = `${policy?.exportPolicy ?? ''} ${policy?.workflowRequirement ?? ''}`.toLowerCase();
  return /destructive|delete|irreversible|purge|destroy|overwrite/.test(hint) ? 'destructive' : 'soft';
};

const localOnlyEvidence = (row) => {
  if (row.interface === 'dormant-ui') return true;
  if (row.proven_reachability === 'local' || row.reachability === 'local') return true;
  if (row.decision === 'dev-only-excluded') return true;
  return (row.exposures ?? []).some((exposure) => exposure.deployment === 'ml-service-local')
    || JSON.stringify(row.conditions ?? []).toLowerCase().match(/dev-only|local-only/) !== null;
};

const environmentForRow = (row, persistence) => {
  if (row.interface === 'dormant-ui') return 'unknown';
  if (localOnlyEvidence(row)) return 'local-only';
  if (['remove-with-approval', 'quarantined'].includes(row.decision)) return 'unknown';
  if (persistence === 'reads-only') return 'prod-safe';
  if (persistence === 'writes') return 'staged-only';
  return 'unknown';
};

const directRouterSweep = (row) => {
  const match = directRouterNames.find(([, seam]) => row.seam === seam);
  return match?.[0];
};

const sweepForRow = (row, dockerIds) => {
  if (row.interface === 'dormant-ui') return 'dormant-leftovers';
  if (row.interface === 'client-route') return 'client-routes';
  if (['worker-job', 'scheduler', 'event-handler', 'websocket'].includes(row.interface)
    || row.seam === 'worker-health' || row.seam === 'ml-reserve') return 'runtime-background';
  if (dockerIds.has(row.id)) return 'docker-only';
  const direct = directRouterSweep(row);
  if (direct) return `direct-router:${direct}`;
  if (row.source_mapping?.manifest_ids?.length) return 'common-manifest';
  return 'runtime-specific-and-other-http';
};

const requiredFieldsKnown = (row) => row.personas.length > 0 && !row.personas.includes('unknown')
  && row.persistence !== 'unknown'
  && row.destructive !== 'unknown'
  && row.environment !== 'unknown'
  && row.owner !== 'unassigned';

const reasonForRow = (row, personaReason) => {
  if (row.interface === 'dormant-ui') return 'dormant-pending';
  if (personaReason === 'undecided-role') return personaReason;
  if (personaReason === 'unresolved-auth') return personaReason;
  if (personaReason) return personaReason;
  return 'other';
};

const resetUnauthorisedSuggestions = (row) => {
  if (row.decision_status !== 'proposed' || row.decision_evidence) return row;
  const suggestions = row.machine_suggestions ?? {};
  const next = { ...row };
  for (const field of ['personas', 'persistence', 'destructive', 'environment', 'owner']) {
    if (!Object.prototype.hasOwnProperty.call(suggestions, field)) continue;
    const value = suggestions[field];
    if (value === undefined || JSON.stringify(next[field]) === JSON.stringify(value)) continue;
    next[field] = Array.isArray(value) ? [...value] : value;
  }
  next.classification = 'unclassified';
  return next;
};

const lifecycleCounts = (report) => Object.fromEntries(
  Object.entries(report.issues).map(([key, values]) => [key, values.length]),
);

const loadOffRowData = () => ({
  requirements: readJson(requirementsFile),
  listeners: readJson(listenersFile),
  candidates: readJson(candidatesFile),
  orphans: readJson(orphansFile),
});

export function classifyDocument(document, { dockerIds = new Set() } = {}) {
  const discoveredRoles = discoverAuthRoleEvidence({ rootDir: repoRoot });
  assertAuthRoleMappingExhaustive(discoveredRoles.roles);
  const seeded = SurfaceMatrixDocumentSchema.parse(document);
  const merged = mergeMatrix(seeded, seeded);
  const sweepCounts = {};
  const reasonCounts = { 'undecided-role': 0, 'dormant-pending': 0, 'unresolved-auth': 0, other: 0 };
  const rows = merged.rows.map((original) => {
    const row = resetUnauthorisedSuggestions({ ...original });
    if (row.classification === 'classified') return row;
    const sweep = sweepForRow(row, dockerIds);
    const count = sweepCounts[sweep] ?? { rows: 0, classified: 0, unclassified: 0 };
    count.rows += 1;
    const owner = ownerForRow(row);
    if (row.owner === 'unassigned' && owner) row.owner = owner;
    const personaResult = personasForRow(row);
    if (row.personas.length === 1 && row.personas[0] === 'unknown' && personaResult.personas[0] !== 'unknown') {
      row.personas = personaResult.personas;
    }
    const persistence = persistenceForRow(row);
    if (row.persistence === 'unknown') row.persistence = persistence;
    const destructive = destructiveForRow(row, row.persistence);
    if (row.destructive === 'unknown') row.destructive = destructive;
    const environment = environmentForRow(row, row.persistence);
    if (row.environment === 'unknown') row.environment = environment;
    if (requiredFieldsKnown(row)) {
      row.classification = 'classified';
      count.classified += 1;
    } else {
      row.classification = 'unclassified';
      count.unclassified += 1;
      reasonCounts[reasonForRow(row, personaResult.reason)] += 1;
    }
    sweepCounts[sweep] = count;
    return row;
  });
  return { ...merged, rows };
}

export async function runClassificationPass() {
  const previous = SurfaceMatrixDocumentSchema.parse(readJson(matrixFile));
  const offRow = loadOffRowData();
  const requirements = offRow.requirements;
  const before = closureReport({
    document: previous,
    requirements,
    listeners: offRow.listeners,
    candidates: offRow.candidates,
    orphans: offRow.orphans,
    discoveredRoles: discoverAuthRoleEvidence({ rootDir: repoRoot }).roles,
  });
  const dockerIds = new Set(
    (requirements.families ?? []).find((family) => family.id === 'docker-only')?.selector?.ids ?? [],
  );
  const classified = classifyDocument(previous, { dockerIds });
  delete classified.orphans;
  writeJsonAtomic(matrixFile, classified);
  const after = closureReport({
    document: classified,
    requirements,
    listeners: offRow.listeners,
    candidates: offRow.candidates,
    orphans: offRow.orphans,
    discoveredRoles: discoverAuthRoleEvidence({ rootDir: repoRoot }).roles,
  });
  const counts = {
    classified: classified.rows.filter((row) => row.classification === 'classified').length,
    unclassified: classified.rows.filter((row) => row.classification === 'unclassified').length,
  };
  const reasons = { 'undecided-role': 0, 'dormant-pending': 0, 'unresolved-auth': 0, other: 0 };
  for (const row of classified.rows.filter((entry) => entry.classification === 'unclassified')) {
    const persona = personasForRow(row);
    reasons[reasonForRow(row, persona.reason)] += 1;
  }
  const sweeps = {};
  for (const row of classified.rows) {
    const sweep = sweepForRow(row, dockerIds);
    const bucket = sweeps[sweep] ?? { rows: 0, classified: 0, unclassified: 0 };
    bucket.rows += 1;
    bucket[row.classification] += 1;
    sweeps[sweep] = bucket;
  }
  return {
    counts,
    reasons,
    sweeps,
    closure: {
      before: { passed: before.passed, issue_counts: lifecycleCounts(before) },
      after: { passed: after.passed, issue_counts: lifecycleCounts(after) },
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  runClassificationPass()
    .then((summary) => process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}
