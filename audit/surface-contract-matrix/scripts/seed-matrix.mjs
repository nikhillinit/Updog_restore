import fs from 'node:fs';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  API_ROUTE_POLICY_REGISTRY,
  routePolicyKey,
} from '../../../server/route-policy/api-route-policy-registry.ts';
import { QUEUE_CATALOG } from '../../../server/queues/registry.ts';
import { COMMON_API_ROUTE_MANIFEST } from '../../../shared/routes/api-route-manifest.ts';
import { API_RUNTIME_SPECIFIC_MANIFEST } from '../../../shared/routes/api-runtime-specific-manifest.ts';
import { ROUTE_GOVERNANCE_REGISTRY } from '../../../shared/routes/route-governance-registry.ts';
import { TEAM_WRITE_ROLES } from '../../../shared/auth/effective-roles.ts';
import {
  canonicalRowId,
  authMiddlewareCallLine,
  AUTH_UNRESOLVED_ROLE,
  assertAuthRoleMappingExhaustive,
  BootProofDocumentSchema,
  contractFingerprint,
  discoverAuthRoleEvidence,
  discoverDormantCandidates,
  discoverHttpListenerCandidates,
  extractAuthRoleEvidenceForRoute,
  routeRegistrationRanges,
  extractProductRoutes,
  ListenerDispositionSchema,
  listenerDispositionFingerprint,
  mergeDormantCandidates,
  orphanResolutionFingerprint,
  resolveListenerModuleGraph,
  runtimeExclusionFingerprint,
  MATRIX_SCHEMA_VERSION,
  mergeMatrix,
  proposeDecision,
  scanBullmqConstructors,
  AUTH_TRUTH_SOURCE_PATTERNS,
  SOURCE_INVENTORY_SCHEMA_VERSION,
  SurfaceMatrixDocumentSchema,
  suggestedPersonasForAuthRoles,
} from '../matrix-schema.mjs';

const currentFile = fileURLToPath(import.meta.url);
const matrixDir = path.resolve(path.dirname(currentFile), '..');
const repoRoot = path.resolve(matrixDir, '../..');
const kgOutDir = path.join(repoRoot, 'audit', 'knowledge-graph', 'out');
const matrixPath = path.join(matrixDir, 'matrix.json');
const inventoryPath = path.join(matrixDir, 'source-inventory.json');
const bootProofPath = path.join(matrixDir, 'boot-proofs.json');
const listenerDispositionPath = path.join(matrixDir, 'listener-dispositions.json');
const dormantCandidatesPath = path.join(matrixDir, 'dormant-candidates.json');
const dormantInventoryPath = path.join(matrixDir, 'dormant-inventory.json');
const runtimeExclusionsPath = path.join(matrixDir, 'runtime-exclusions.json');
const conditionOverridesPath = path.join(matrixDir, 'condition-overrides.json');
const definitionOverridesPath = path.join(matrixDir, 'definition-overrides.json');
const orphansPath = path.join(matrixDir, 'orphans.json');

const REGISTRATION_GATES = [
  'ENABLE_METRICS',
  'ENABLE_PORTFOLIO_INTELLIGENCE',
  'ENABLE_MARGINAL_RESERVE_MOIC',
  'ENABLE_SCENARIO_SEED_PICKER',
  'ENABLE_STAT_GATING',
  'ENABLE_SESSIONS',
  'ENABLE_QUEUES',
  'ENABLE_RUM_V2',
];

const API_NODE_TYPES = new Set(['APIEndpoint', 'ClientRoute', 'WorkerJob']);
const ROUTE_EDGE_TYPES = new Set([
  'MOUNTS',
  'EXPOSES',
  'DEFINES',
  'GUARDS',
  'MIDDLEWARE',
  'AUTHENTICATES',
  'PROTECTS',
]);
const GLOBAL_AUTH_BOUNDARIES = Object.freeze({
  make_app: Object.freeze({
    boundary: 'global_authenticated',
    file: 'server/app.ts',
    line: authMiddlewareCallLine(fs.readFileSync(path.join(repoRoot, 'server/app.ts'), 'utf8'), 'requireApiAuth'),
    middleware: 'requireApiAuth',
  }),
  create_server: Object.freeze({
    boundary: 'global_authenticated',
    file: 'server/server.ts',
    line: authMiddlewareCallLine(fs.readFileSync(path.join(repoRoot, 'server/server.ts'), 'utf8'), 'requireSecureContext'),
    middleware: 'requireSecureContext',
  }),
  register_routes: Object.freeze({
    boundary: 'global_authenticated',
    boundary_scope: 'create_server',
    file: 'server/server.ts',
    line: authMiddlewareCallLine(fs.readFileSync(path.join(repoRoot, 'server/server.ts'), 'utf8'), 'requireSecureContext'),
    middleware: 'requireSecureContext',
  }),
});
// Registration order differs by runtime. make_app mounts these modules before
// its /api auth boundary; create_server applies requireSecureContext before
// registerRoutes mounts the same modules. Keep the exception set exposure-
// scoped so Railway health routes retain secure-context evidence.
const GLOBAL_BOUNDARY_PRECEDING_SOURCES_BY_RUNTIME = Object.freeze({
  make_app: new Set([
    'server/routes/health.ts',
    'server/routes/metrics.ts',
    'server/routes/metrics-rum.ts',
    'server/routes/metrics-rum-ingress.ts',
    'server/routes/public/csp-report.ts',
  ]),
  // create_server mounts CSP/metrics/RUM directly in server/server.ts before
  // the requireSecureContext middleware. The line-order check below keeps
  // later server.ts registrations in the protected phase.
  create_server: new Set(['server/server.ts']),
});
const PUBLIC_API_EXACT_PATHS = new Set([
  '/healthz',
  '/readyz',
  '/health',
  '/health/ready',
  '/health/live',
  '/flags',
  '/flags/status',
]);
const PUBLIC_NON_API_EXACT_PATHS = new Set([
  '/api-docs',
  '/api-docs.json',
  '/healthz',
  '/readyz',
  '/health',
  '/health/ready',
  '/health/live',
]);
const RUNTIME_SOURCE_UNIVERSE = [
  'server/routes/**/*.ts',
  'server/app.ts',
  'api/**/*.ts',
  'workers/**',
  'server/workers/**',
  'ml-service/**',
];
const TEST_OR_FIXTURE_SEGMENT = /(?:^|\/)(?:__tests__|tests?|specs?|fixtures?)(?:\/|$)/i;
const TEST_OR_FIXTURE_SUFFIX = /\.(?:test|spec|stories)\.[^.]+$/i;

const readJson = (filePath, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
};

const writeJson = (filePath, value) => {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const repoPath = (filePath) => filePath.split(path.sep).join('/');

const trackedFiles = () =>
  execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 })
  .toString()
  .split('\0')
  .filter(Boolean)
  .map(repoPath)
  .sort((left, right) => left.localeCompare(right));

const trackedSet = new Set(trackedFiles());

async function* jsonLines(filePath) {
  const input = createReadStream(filePath, { encoding: 'utf8' });
  const lines = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (line.trim()) yield JSON.parse(line);
    }
  } finally {
    lines.close();
    input.destroy();
  }
}

async function readKnowledgeGraph() {
  const manifest = readJson(path.join(kgOutDir, 'manifest.json'), undefined);
  if (!manifest?.snapshot_id) throw new Error('Knowledge-graph manifest has no snapshot_id');

  const nodes = new Map();
  for await (const record of jsonLines(path.join(kgOutDir, 'nodes-routes.jsonl'))) {
    if (record.record === 'node' && API_NODE_TYPES.has(record.type)) {
      const id = record.type === 'APIEndpoint'
        ? canonicalRowId(record.id)
        : record.id;
      nodes.set(id, { ...record, id });
    }
  }

  const edges = [];
  for await (const record of jsonLines(path.join(kgOutDir, 'edges-routes.jsonl'))) {
    if (record.record === 'edge' && ROUTE_EDGE_TYPES.has(record.type)) edges.push(record);
  }

  return { manifest, nodes, edges };
}

const sourceSite = (record) => {
  const source = record.source_path || record.from?.replace(/^file:/, '');
  if (!source) return undefined;
  const line = record.line_start ?? record.line ?? 1;
  return `${source}:${line}`;
};

const manifestSourcePath = (sourceModule) => {
  if (!sourceModule) return undefined;
  const withoutPrefix = sourceModule.replace(/^\.\//, '').replace(/\.(?:m?js|cjs|ts|tsx)$/, '');
  const candidate = `server/${withoutPrefix}.ts`;
  if (trackedSet.has(candidate)) return candidate;
  const javascriptCandidate = `server/${withoutPrefix}.js`;
  return trackedSet.has(javascriptCandidate) ? javascriptCandidate : undefined;
};

const sortedUnique = (values) => [...new Set(values)].sort((left, right) => left.localeCompare(right));

const stableJson = (value) => {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableJson(entry)]));
  }
  return value;
};

const asEvidence = (value) => (value ? String(value) : 'seed evidence unavailable');

const bootEvidence = (deployment, runtime, snapshotId, extra = {}) => ({
  command_or_artifact: extra.command_or_artifact
    || (runtime === 'vercel_function'
      ? 'inspect enabled api/** Vercel build output'
      : deployment === 'vercel-api'
      ? 'load Vercel build-vercel-api bundle and construct makeApp()'
      : deployment === 'vercel-web'
        ? 'npm run build:web'
        : deployment.startsWith('railway-worker-')
          ? 'npm run build:workers && start selected worker entrypoint'
          : deployment === 'ml-service-local'
            ? 'docker build -f ml-service/Dockerfile ml-service'
            : 'npm run build:prod && start dist/index.js'),
  probe: extra.probe
    || (runtime === 'worker_process'
      ? 'GET /health, /live, /ready, /metrics, /stats and queue consumer registration'
      : runtime === 'client_router'
        ? 'built SPA entry HTML and deep-link asset probe'
        : runtime === 'vercel_function'
          ? 'handler export and built function invocation'
          : 'HTTP listener and route probe'),
  result: 'not-yet-executed',
  observed_at: snapshotId,
});

const dedupeBy = (values, keyOf) => {
  const seen = new Set();
  return values.filter((value) => {
    const key = keyOf(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const makeExposure = ({
  deployment,
  runtime,
  mountEvidence,
  definitions = [],
  ingresses = [],
  conditions = [],
  snapshotId,
  boot = {},
  authEvidence = [],
  outer_mount_site: outerMountSite,
  outer_mount_order: outerMountOrder,
}) => ({
  deployment,
  runtime,
  mount_evidence: asEvidence(mountEvidence),
  ...(outerMountSite ? {
    outer_mount_site: asEvidence(outerMountSite),
    outer_mount_order: Number.isFinite(outerMountOrder) ? Math.max(0, outerMountOrder) : 0,
  } : {}),
  // The profile fan-out observes the same registration once per profile and
  // fs-variant; exposures store the deduped union, ordered deterministically.
  ingresses: dedupeBy(ingresses, (ingress) => `${ingress.external_path}|${ingress.express_path}`)
    .sort((left, right) => `${left.external_path}|${left.express_path}`.localeCompare(`${right.external_path}|${right.express_path}`)),
  conditions: dedupeBy([...conditions], (condition) => JSON.stringify(condition))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  definitions: dedupeBy(
    definitions,
    (definition) => `${definition.site}|${definition.role}|${definition.effective_mount_order ?? 0}`,
  )
    .sort(
      (left, right) => (left.effective_mount_order ?? 0) - (right.effective_mount_order ?? 0)
        || `${left.site}|${left.role}`.localeCompare(`${right.site}|${right.role}`),
    ),
  boot_status: 'unproven',
  boot_evidence: bootEvidence(deployment, runtime, snapshotId, boot),
  auth_evidence: dedupeBy(authEvidence, (entry) => JSON.stringify(entry))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
});

const emptyQueueRoles = () => ({ producers: [], consumers: [] });

const bootProofKey = (deployment, runtime) => `${deployment}|${runtime ?? '*'}`;

const assertBootProofSourceSha = (bootProofDocument, kgManifest, gitHead) => {
  const bootProofSourceSha = bootProofDocument.source_sha;
  const kgRepoHead = kgManifest?.repo_head;
  if (!kgRepoHead) throw new Error('Knowledge-graph manifest has no repo_head');
  if (bootProofSourceSha !== gitHead || bootProofSourceSha !== kgRepoHead) {
    throw new Error(
      `Boot-proof source_sha ${bootProofSourceSha} must exactly equal KG manifest repo_head ${kgRepoHead} and current Git HEAD ${gitHead}`,
    );
  }
};

const applyBootProofs = (rows, bootProofDocument) => {
  const proofs = new Map((bootProofDocument.proofs ?? []).map((proof) => [
    bootProofKey(proof.deployment, proof.runtime),
    proof,
  ]));
  for (const row of rows.values()) {
    row.exposures = row.exposures.map((exposure) => {
      const proof = proofs.get(bootProofKey(exposure.deployment, exposure.runtime))
        || proofs.get(bootProofKey(exposure.deployment));
      if (!proof) {
        throw new Error(`Boot-proof output has no proof for ${exposure.deployment}/${exposure.runtime}`);
      }
      return {
        ...exposure,
        boot_status: proof.boot_status,
        boot_evidence: { ...proof.boot_evidence },
      };
    });

    const proven = new Set();
    for (const exposure of row.exposures) {
      if (exposure.boot_status !== 'proven') continue;
      if (row.interface === 'http-api' && (exposure.ingresses ?? []).length === 0) continue;
      if (row.interface === 'client-route' && exposure.deployment === 'vercel-web') {
        proven.add('client');
      } else if (exposure.deployment === 'vercel-api') {
        proven.add('vercel');
      } else if (exposure.deployment.startsWith('railway-worker-')) {
        proven.add('railway');
      } else if (exposure.deployment === 'ml-service-local') {
        proven.add('local');
      }
    }
    row.proven_reachability = proven.has('vercel') && proven.has('railway') ? 'both'
      : ['vercel', 'railway', 'client', 'local'].find((value) => proven.has(value)) || 'none';
    row.decision_suggestion = proposeDecision(row);
    row.decision = row.decision_suggestion;
    row.contract_fingerprint = contractFingerprint(row);
  }
};

const ownerForPolicy = (policy) => {
  const owner = policy?.owner;
  return ['platform', 'gp-team', 'analytics', 'lp-reporting', 'reporting'].includes(owner)
    ? owner
    : undefined;
};

const routePolicyMap = new Map(
  API_ROUTE_POLICY_REGISTRY.map((entry) => [routePolicyKey(entry), entry]),
);

const governanceByPath = new Map(ROUTE_GOVERNANCE_REGISTRY.map((entry) => [entry.path, entry]));

const authRoleInventory = discoverAuthRoleEvidence({ rootDir: repoRoot });
assertAuthRoleMappingExhaustive(authRoleInventory.roles);
const TEAM_FUND_FALLBACK_ROLES = Object.freeze([...TEAM_WRITE_ROLES]);
const IS_TEAM_ROLE_LINE = (() => {
  const source = fs.readFileSync(path.join(repoRoot, 'shared/auth/effective-roles.ts'), 'utf8');
  const match = source.split('\n').findIndex((l) => /^export function isTeamRole\b/.test(l));
  return match === -1 ? 58 : match + 1;
})();

const definitionFile = (site) => String(site ?? '').replace(/:\d+$/, '');
const definitionLine = (definition) => definition.line ?? Number(String(definition.site ?? '').match(/:(\d+)$/)?.[1] ?? 0);

const policyAuthBoundary = (manifest, policy) => String(
  manifest?.authBoundary || policy?.apiAuthBoundary || '',
);

const authBoundaryRoles = (boundary) => {
  if (boundary === 'admin_only') return ['admin'];
  if (boundary === 'require_auth_and_lp_access') return ['lpId'];
  if (boundary === 'public' || boundary === 'signed_public_share') return ['public'];
  if (boundary.includes('and_role')) return [AUTH_UNRESOLVED_ROLE];
  return [];
};

const routePathForGlobalBoundary = (routePath) => {
  const pathValue = String(routePath ?? '');
  if (!pathValue.startsWith('/api')) return undefined;
  const mountRelative = pathValue.slice('/api'.length) || '/';
  return mountRelative.startsWith('/') ? mountRelative : `/${mountRelative}`;
};

const isPublicApiPath = (method, routePath) => {
  const mountRelative = routePathForGlobalBoundary(routePath);
  if (!mountRelative) return false;
  const normalizedMethod = String(method ?? '').toUpperCase();
  if (PUBLIC_API_EXACT_PATHS.has(mountRelative)) return true;
  if (normalizedMethod === 'GET' && /^\/public\/shares\/[^/]+$/.test(mountRelative)) return true;
  if (normalizedMethod === 'POST' && /^\/public\/shares\/[^/]+\/verify$/.test(mountRelative)) return true;
  if (normalizedMethod === 'POST' && mountRelative === '/auth/login') return true;
  if (normalizedMethod === 'GET' && mountRelative === '/auth/csrf') return true;
  return false;
};

const sourceFileForDefinition = (definition) => definitionFile(definition?.site);

const definitionSource = (definition) => {
  const filePath = sourceFileForDefinition(definition);
  if (!filePath) return undefined;
  const sourcePath = path.join(repoRoot, filePath);
  return fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, 'utf8') : undefined;
};

const sourceWindowAtLine = (source, line, radius = 80) => {
  const lines = String(source ?? '').split('\n');
  const start = Math.max(0, Number(line ?? 1) - 1);
  return lines.slice(start, start + radius).join('\n');
};

const localRoleAliasEvidenceForDefinitions = (definitions, source, filePath) => {
  const evidence = [];
  const registrationLines = definitions.map(definitionLine).filter(Boolean);
  const ranges = routeRegistrationRanges(source, { registrationLines });
  for (const [charStart, charEnd] of ranges) {
    const registration = source.slice(charStart, charEnd);
    const aliases = new Set(
      [...registration.matchAll(/\b(require[A-Z][\w$]*)\b/g)].map((match) => match[1])
    );
    for (const alias of aliases) {
      const declaration = new RegExp(
        `^\\s*const\\s+${alias}\\s*=\\s*require(?:Write|Any)Role\\s*\\(\\s*[A-Za-z_$][\\w$]*\\s*\\)`,
        'm'
      ).exec(source);
      if (!declaration) continue;
      const declarationLine = source.slice(0, declaration.index).split('\n').length;
      evidence.push(
        ...authRoleInventory.evidence.filter(
          (entry) =>
            entry.kind === 'guard' && entry.file === filePath && entry.line === declarationLine
        )
      );
    }
  }
  return evidence;
};

const teamFundScopeEvidenceForDefinitions = (definitions, source, filePath) => {
  const evidence = [];
  const registrationLines = definitions.map(definitionLine).filter(Boolean);
  const ranges = routeRegistrationRanges(source, { registrationLines });
  for (const [charStart, charEnd] of ranges) {
    const registrationText = source.slice(charStart, charEnd);
    const searchInRegistration = (pattern) => {
      const match = pattern.exec(registrationText);
      if (!match) return undefined;
      return source.slice(0, charStart + match.index).split('\n').length;
    };
    const providedFundScopeLine = searchInRegistration(/\benforceProvidedFundScope\s*\(/);
    if (providedFundScopeLine) {
      evidence.push({
        kind: 'policy-boundary',
        boundary: 'fund_scope',
        file: filePath,
        line: providedFundScopeLine,
        evidence: `${filePath}:${providedFundScopeLine} enforces provided fund scope`,
      });
    }
    const teamFundScopeLine = searchInRegistration(/\bcanManageFund\s*\(/);
    if (teamFundScopeLine) {
      evidence.push({
        kind: 'policy-boundary',
        boundary: 'team_fund_scope',
        file: filePath,
        line: teamFundScopeLine,
        evidence: `${filePath}:${teamFundScopeLine} checks team/fund management scope`,
      });
    }
  }
  return evidence;
};

const localGuardEvidenceForDefinition = (definition) => {
  const source = definitionSource(definition);
  if (!source || definition?.role !== 'guard') return [];
  const siteLine = definitionLine(definition);
  const window = sourceWindowAtLine(source, siteLine);
  const evidence = [];
  const add = (entry) => evidence.push({
    kind: 'guard',
    file: sourceFileForDefinition(definition),
    line: siteLine,
    ...entry,
  });

  if (/\brequireAuth\s*\(/.test(window)
    || /\brequireHealthKeyOrAuth\b/.test(window)
    || /\bauthenticateHealthDiagnostics\b/.test(window)) {
    add({
      boundary: 'authenticated',
      evidence: `${sourceFileForDefinition(definition)}:${siteLine} route-local authentication middleware`,
    });
  }
  if (/\brequireLP(?:Fund)?Access\b/.test(window)) {
    add({
      role: 'lp',
      boundary: 'lp_access',
      evidence: `${sourceFileForDefinition(definition)}:${siteLine} LP access middleware`,
    });
  }
  return evidence;
};

const globalAuthEvidenceForExposure = ({ exposure, method, routePath }) => {
  const boundary = GLOBAL_AUTH_BOUNDARIES[exposure.runtime];
  if (!boundary || !routePathForGlobalBoundary(routePath) || isPublicApiPath(method, routePath)) return [];
  const outerMountFile = definitionFile(exposure.outer_mount_site);
  const outerMountLine = definitionLine({ site: exposure.outer_mount_site });
  if (exposure.runtime === 'create_server'
    && outerMountFile === 'server/server.ts'
    && outerMountLine > 0
    && outerMountLine < boundary.line) return [];
  const definitions = exposure.definitions ?? [];
  const precedingSources = GLOBAL_BOUNDARY_PRECEDING_SOURCES_BY_RUNTIME[exposure.runtime] ?? new Set();
  const hasPreBoundaryDefinition = definitions.some((definition) => {
    const source = sourceFileForDefinition(definition);
    if (source === boundary.file) {
      return definitionLine(definition) > 0 && definitionLine(definition) < boundary.line;
    }
    if (!precedingSources.has(source)) return false;
    return true;
  });
  if (hasPreBoundaryDefinition) return [];
  return [{
    kind: 'policy-boundary',
    boundary: boundary.boundary,
    boundary_scope: boundary.boundary_scope || exposure.runtime,
    middleware: boundary.middleware,
    file: boundary.file,
    line: boundary.line,
    evidence: `${boundary.file}:${boundary.line} ${boundary.middleware} precedes protected ${exposure.runtime} routes`,
  }];
};

const observedRegistrationEvidenceForExposure = (exposure) => {
  const rawRegistrationSite = exposure.outer_mount_site
    || exposure.definitions?.find((definition) => definition.role === 'handler')?.site
    || exposure.mount_evidence;
  const registrationSite = String(rawRegistrationSite ?? '').match(/^(.*?:\d+)/)?.[1]
    || rawRegistrationSite;
  const file = definitionFile(registrationSite);
  const line = definitionLine({ site: registrationSite });
  return {
    kind: 'handler',
    boundary: 'public',
    ...(file ? { file } : {}),
    ...(line > 0 ? { line } : {}),
    evidence: `${registrationSite} observed route registration`,
  };
};

const publicApiEvidenceForExposure = ({ method, routePath, exposure }) => {
  // Keep the canonical /api public matcher as the first branch. Its evidence
  // identifies the policy boundary itself; non-/api public aliases instead
  // need evidence for the registration that actually exposed the route.
  if (isPublicApiPath(method, routePath)) {
    return [{
      kind: 'policy-boundary',
      boundary: 'public',
      file: 'server/lib/public-api-boundary.ts',
      line: 19,
      evidence: 'server/lib/public-api-boundary.ts isPublicApiPath public exemption',
    }];
  }
  const normalizedPath = String(routePath ?? '');
  const publicAlias = PUBLIC_NON_API_EXACT_PATHS.has(normalizedPath)
    || (String(method ?? '').toUpperCase() === 'POST' && normalizedPath === '/metrics/rum');
  return publicAlias && exposure ? [observedRegistrationEvidenceForExposure(exposure)] : [];
};

const authEvidenceForDefinitions = (definitions, manifest, policy, { includePolicyBoundary = true } = {}) => {
  const evidence = [];
  const definitionsByFile = new Map();
  for (const definition of definitions ?? []) {
    const filePath = definitionFile(definition.site);
    const entries = definitionsByFile.get(filePath) ?? [];
    entries.push(definition);
    definitionsByFile.set(filePath, entries);
  }
  for (const [filePath, fileDefinitions] of definitionsByFile) {
    const sourcePath = path.join(repoRoot, filePath);
    if (!fs.existsSync(sourcePath)) continue;
    const source = fs.readFileSync(sourcePath, 'utf8');
    const routeEvidence = extractAuthRoleEvidenceForRoute(source, filePath, {
      method: fileDefinitions[0]?.method,
      path: fileDefinitions[0]?.path,
      registrationLines: fileDefinitions.map(definitionLine).filter(Boolean),
    });
    evidence.push(
      ...routeEvidence,
      ...localRoleAliasEvidenceForDefinitions(fileDefinitions, source, filePath),
      ...fileDefinitions.flatMap(localGuardEvidenceForDefinition),
      ...teamFundScopeEvidenceForDefinitions(fileDefinitions, source, filePath)
    );
  }
  const boundary = policyAuthBoundary(manifest, policy);
  if (boundary && includePolicyBoundary) {
    evidence.push({
      kind: 'policy-boundary',
      boundary,
      evidence: `policy-registry:${boundary}`,
    });
  }
  return dedupeBy(evidence, (entry) => JSON.stringify(entry))
    .sort((left, right) => `${left.file ?? ''}:${left.line ?? 0}:${left.role ?? ''}`.localeCompare(`${right.file ?? ''}:${right.line ?? 0}:${right.role ?? ''}`));
};

const authSuggestionFor = ({
  manifest,
  policy,
  definitions,
  exposures = [],
  additionalAuthEvidence = [],
  method,
  path: routePath,
}) => {
  const routeDefinitions = (definitions ?? []).map((definition) => ({
    ...definition,
    method,
    path: routePath,
  }));
  const evidence = exposures.length > 0
    ? []
    : authEvidenceForDefinitions(routeDefinitions, manifest, policy);
  evidence.push(...additionalAuthEvidence);
  for (const exposure of exposures) {
    const exposureDefinitions = (exposure.definitions ?? []).map((definition) => ({
      ...definition,
      method,
      path: routePath,
    }));
    const localEvidence = authEvidenceForDefinitions(exposureDefinitions, undefined, undefined, {
      includePolicyBoundary: false,
    });
    const globalEvidence = globalAuthEvidenceForExposure({ exposure, method, routePath });
    const publicEvidence = publicApiEvidenceForExposure({ method, routePath, exposure });
    const scopedAdditionalEvidence = additionalAuthEvidence.filter((entry) =>
      (!entry.runtime && !entry.surface)
      || entry.runtime === exposure.runtime
      || entry.surface === exposure.runtime
      || entry.surface === (exposure.runtime === 'register_routes' ? 'create_server' : exposure.runtime));
    exposure.auth_evidence = dedupeBy(
      [...localEvidence, ...globalEvidence, ...publicEvidence, ...scopedAdditionalEvidence],
      (entry) => JSON.stringify(entry),
    ).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    evidence.push(...exposure.auth_evidence);
  }
  const boundary = policyAuthBoundary(manifest, policy);
  const evidenceRoles = evidence.map((entry) => entry.role).filter(Boolean);
  let roles = sortedUnique([...evidenceRoles, ...authBoundaryRoles(boundary)]);
  // An `and_role` policy boundary injects the unresolved sentinel meaning
  // "role-gated, roles unknown". Concrete guard-role evidence satisfies that
  // demand; keep the sentinel only when the guards themselves are unresolved
  // or no role evidence exists at all (fail closed).
  const guardRoles = evidenceRoles.filter((role) => role !== AUTH_UNRESOLVED_ROLE);
  if (!evidenceRoles.includes(AUTH_UNRESOLVED_ROLE) && guardRoles.length > 0) {
    roles = roles.filter((role) => role !== AUTH_UNRESOLVED_ROLE);
  }
  const hasGlobalAuthentication = evidence.some(
    (entry) => entry.boundary === 'global_authenticated'
  );
  const scopeEvidence = evidence.filter(
    (entry) => entry.boundary === 'fund_scope' || entry.boundary === 'team_fund_scope'
  );
  const hasExplicitOrUnresolvedRoleGuard =
    roles.includes(AUTH_UNRESOLVED_ROLE) ||
    authBoundaryRoles(boundary).some((role) => role !== 'public') ||
    evidence.some((entry) => entry.role && entry.kind === 'guard');
  const isPublic = roles.includes('public') || evidence.some((entry) => entry.boundary === 'public');
  if (hasGlobalAuthentication && scopeEvidence.length > 0 && !hasExplicitOrUnresolvedRoleGuard && !isPublic) {
    const scopeCitations = scopeEvidence.map((s) => `${s.file}:${s.line}`).join(', ');
    roles = sortedUnique([...roles, ...TEAM_FUND_FALLBACK_ROLES]);
    const derivedBoundary = scopeEvidence[0].boundary;
    evidence.push(
      ...TEAM_FUND_FALLBACK_ROLES.map((role) => ({
        kind: 'identity',
        role,
        boundary: derivedBoundary,
        file: 'shared/auth/effective-roles.ts',
        line: IS_TEAM_ROLE_LINE,
        evidence: `shared/auth/effective-roles.ts:${IS_TEAM_ROLE_LINE} isTeamRole includes ${role}; ${scopeCitations} proves route ${derivedBoundary} scope`,
      }))
    );
  }
  const mappedRoles = roles.filter((role) => role !== AUTH_UNRESOLVED_ROLE);
  const personas = suggestedPersonasForAuthRoles(mappedRoles);
  if (roles.includes(AUTH_UNRESOLVED_ROLE)) personas.push('unknown');
  const dedupedEvidence = dedupeBy(evidence, (entry) => JSON.stringify(entry))
    .sort((left, right) => `${left.file ?? ''}:${left.line ?? 0}:${left.role ?? ''}:${left.boundary ?? ''}`
      .localeCompare(`${right.file ?? ''}:${right.line ?? 0}:${right.role ?? ''}:${right.boundary ?? ''}`));
  return {
    auth_roles: roles,
    auth_evidence: dedupedEvidence,
    personas: sortedUnique(personas),
    unresolved: roles.includes(AUTH_UNRESOLVED_ROLE),
    undecided_roles: mappedRoles.filter((role) => suggestedPersonasForAuthRoles([role]).includes('unknown')),
  };
};

const persistenceSuggestionFor = (method, policy) => {
  const safeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(String(method).toUpperCase());
  return {
    value: safeMethod ? 'reads-only' : 'writes',
    evidence: {
      method,
      policy_lifecycle: policy?.lifecycle ?? 'unavailable',
      policy_workflow_requirement: policy?.workflowRequirement ?? null,
      basis: safeMethod ? 'safe HTTP method' : 'mutation HTTP method',
    },
  };
};

const manifestBySource = new Map();
for (const entry of COMMON_API_ROUTE_MANIFEST) {
  const source = manifestSourcePath(entry.sourceModule);
  if (!source) continue;
  const entries = manifestBySource.get(source) ?? [];
  entries.push(entry);
  manifestBySource.set(source, entries);
}

const runtimeSpecificBySource = new Map();
for (const entry of API_RUNTIME_SPECIFIC_MANIFEST) {
  const source = manifestSourcePath(entry.sourceModule);
  if (!source) continue;
  const entries = runtimeSpecificBySource.get(source) ?? [];
  entries.push(entry);
  runtimeSpecificBySource.set(source, entries);
}

const policyForApiNode = (node) => routePolicyMap.get(`${node.method} ${node.path}`)
  || routePolicyMap.get(node.path);

const manifestForApiNode = (node) => {
  const entries = manifestBySource.get(node.source_path) ?? [];
  return entries[0];
};

const edgeDefinitionsByRow = (edges) => {
  const result = new Map();
  for (const edge of edges) {
    if (!['EXPOSES', 'DEFINES'].includes(edge.type)) continue;
    const target = edge.to?.startsWith('api:') ? canonicalRowId(edge.to) : edge.to;
    if (!target) continue;
    const definitions = result.get(target) ?? [];
    definitions.push({ edge, site: sourceSite(edge) });
    result.set(target, definitions);
  }
  return result;
};

const edgeMountsByRow = (edges) => {
  const result = new Map();
  for (const edge of edges) {
    if (edge.type !== 'MOUNTS') continue;
    const target = edge.to?.startsWith('api:') ? canonicalRowId(edge.to) : edge.to;
    if (!target) continue;
    const mounts = result.get(target) ?? [];
    mounts.push(edge);
    result.set(target, mounts);
  }
  return result;
};

const edgeAuthEvidenceByRow = (edges) => {
  const result = new Map();
  const authEdgeTypes = new Set(['GUARDS', 'MIDDLEWARE', 'AUTHENTICATES', 'PROTECTS']);
  for (const edge of edges) {
    if (!authEdgeTypes.has(edge.type)) continue;
    const rowId = [edge.to, edge.from]
      .filter((value) => String(value ?? '').startsWith('api:'))
      .map(canonicalRowId)[0];
    if (!rowId) continue;
    const site = sourceSite(edge);
    const line = definitionLine({ site });
    const evidence = {
      kind: 'guard',
      role: edge.role || edge.auth_role || edge.guard_role || edge.required_role,
      boundary: edge.boundary || edge.auth_boundary || edge.middleware,
      ...(site ? { file: definitionFile(site) } : {}),
      ...(line > 0 ? { line } : {}),
      evidence: site || `${edge.type} edge in knowledge graph`,
      ...(edge.surface ? { surface: edge.surface } : {}),
      ...(edge.runtime ? { runtime: edge.runtime } : {}),
    };
    if (!evidence.role) delete evidence.role;
    if (!evidence.boundary) delete evidence.boundary;
    const entries = result.get(rowId) ?? [];
    entries.push(evidence);
    result.set(rowId, entries);
  }
  return result;
};

const runtimeForMount = (mount) => {
  const from = String(mount.from ?? '');
  if (from.includes('server/app.ts')) return { deployment: 'vercel-api', runtime: 'make_app' };
  if (from.includes('server/routes.ts')) return { deployment: 'local-process', runtime: 'register_routes' };
  return undefined;
};

const definitionFromSite = (site, role = 'handler', order = 0) => ({
  site: asEvidence(site),
  role,
  effective_mount_order: Number.isFinite(order) ? Math.max(0, order) : 0,
});

const routeIngresses = (expressPath, deployment, runtime) => {
  if (deployment !== 'vercel-api' || runtime !== 'make_app') return [{
    external_path: expressPath,
    express_path: expressPath,
    rewrite_evidence: 'local-only runtime disposition',
  }];
  // Vercel resolution is ordered: /metrics/:path* rewrites to
  // /api/metrics/:path* BEFORE /api/:slug* reaches the catch-all function, so
  // an express path only has an external ingress when some external request
  // resolves TO it. Bare non-/api express mounts (e.g. /metrics/rum,
  // /api-docs, /health) resolve to the SPA fallback, never the API — zero
  // ingresses, which the zero-live-ingress proposal rule then surfaces.
  if (!expressPath.startsWith('/api/')) return [];
  const ingresses = [{
    external_path: expressPath,
    express_path: expressPath,
    rewrite_evidence: 'vercel.json /api/:slug* -> /api/[...slug]',
  }];
  if (expressPath.startsWith('/api/metrics/')) {
    ingresses.push({
      external_path: `/metrics/${expressPath.slice('/api/metrics/'.length)}`,
      express_path: expressPath,
      rewrite_evidence: 'vercel.json /metrics/:path* -> /api/metrics/:path*',
    });
  }
  return ingresses;
};

const conditionKey = (condition) => JSON.stringify(condition);

const createRuntimeIndex = (documents) => {
  const observations = new Map();
  const byProfile = new Map();
  for (const document of documents) {
    const profileKey = `${document.profile}|${document.fs_variant}`;
    const profileRoutes = new Set();
    byProfile.set(profileKey, profileRoutes);
    for (const route of document.routes ?? []) {
      if (!route.id || !route.path?.startsWith('/') || !['handler', 'guard', 'shadowed'].includes(route.role)) continue;
      if (route.path.includes('*') && route.kind === 'terminal') continue;
      const key = `${route.surface}|${route.id}`;
      profileRoutes.add(key);
      const entries = observations.get(key) ?? [];
      entries.push({ ...route, profile: document.profile, fs_variant: document.fs_variant });
      observations.set(key, entries);
    }
  }

  const conditions = new Map();
  for (const [key, entries] of observations) {
    const conditionSet = new Map();
    const presentProfiles = new Set(entries.map((entry) => `${entry.profile}|${entry.fs_variant}`));
    for (const gate of REGISTRATION_GATES) {
      const enabled = presentProfiles.has(`gate:${gate}:enabled|static`)
        || presentProfiles.has(`gate:${gate}:enabled|api-only`);
      const disabled = presentProfiles.has(`gate:${gate}:disabled|static`)
        || presentProfiles.has(`gate:${gate}:disabled|api-only`);
      if (enabled !== disabled) {
        const condition = { gate, enabled };
        conditionSet.set(conditionKey(condition), condition);
      }
    }
    if (entries.some((entry) => entry.profile === 'development')
      && !entries.some((entry) => entry.profile === 'default')) {
      const condition = { NODE_ENV: 'development' };
      conditionSet.set(conditionKey(condition), condition);
    }
    conditions.set(key, [...conditionSet.values()]);
  }
  return { observations, conditions };
};

const allProfiles = () => [
  'default',
  ...REGISTRATION_GATES.flatMap((gate) => [`gate:${gate}:enabled`, `gate:${gate}:disabled`]),
  'development',
];

const runInspector = (profile, fsVariant) => {
  const tsxPath = path.join(repoRoot, 'node_modules', '.bin', 'tsx');
  const inspectorPath = path.join(matrixDir, 'scripts', 'inspect-runtime.mjs');
  const result = spawnSync(tsxPath, [
    '--tsconfig',
    path.join(repoRoot, 'tsconfig.server.json'),
    inspectorPath,
    '--profile',
    profile,
    '--fs-variant',
    fsVariant,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env },
  });
  if (result.status !== 0) {
    throw new Error(`Runtime inspection failed for ${profile}/${fsVariant}: ${result.stderr || result.error}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Runtime inspection emitted invalid JSON for ${profile}/${fsVariant}: ${error.message}`);
  }
};

const collectRuntimeDocuments = () => {
  const documents = [];
  for (const profile of allProfiles()) {
    for (const fsVariant of ['static', 'api-only']) documents.push(runInspector(profile, fsVariant));
  }
  return documents;
};

const makeApiRows = ({ nodes, edges, runtimeIndex, snapshotId }) => {
  const definitionsByRow = edgeDefinitionsByRow(edges);
  const mountsByRow = edgeMountsByRow(edges);
  const authEvidenceByRow = edgeAuthEvidenceByRow(edges);
  const rows = new Map();
  const runtimeRows = new Map();
  for (const [key, observations] of runtimeIndex.observations) {
    if (!key.includes('|api:')) continue;
    const id = key.slice(key.indexOf('|') + 1);
    const current = runtimeRows.get(id) ?? [];
    runtimeRows.set(id, [...current, ...observations]);
  }

  const apiNodes = [...nodes.values()].filter((node) => node.type === 'APIEndpoint');
  const ids = new Set([...apiNodes.map((node) => node.id), ...runtimeRows.keys()]);
  for (const id of [...ids].sort((left, right) => left.localeCompare(right))) {
    const node = nodes.get(id) ?? {};
    const observations = runtimeRows.get(id) ?? [];
    const manifest = manifestForApiNode(node);
    const policy = policyForApiNode(node);
    const definitions = [];
    const exposuresByKey = new Map();
    const edgeDefinitions = definitionsByRow.get(id) ?? [];
    for (const entry of edgeDefinitions) {
      definitions.push(definitionFromSite(entry.site, 'handler', entry.edge.line_start ?? 0));
    }
    for (const observation of observations) {
      const runtime = observation.surface === 'make_app'
        ? { deployment: 'vercel-api', runtime: 'make_app' }
        : {
          deployment: 'local-process',
          runtime: observation.surface === 'register_routes' ? 'register_routes' : 'create_server',
        };
      const key = `${runtime.deployment}|${runtime.runtime}`;
      const item = exposuresByKey.get(key) ?? {
        ...runtime,
        definitions: [],
        conditions: [],
        ingresses: [],
        mountEvidence: `${observation.site} runtime registration`,
        ...(observation.outer_mount_site ? {
          outer_mount_site: observation.outer_mount_site,
          outer_mount_order: observation.outer_mount_order,
        } : {}),
      };
      item.definitions.push(definitionFromSite(observation.site, observation.role, observation.order));
      item.conditions.push(...(runtimeIndex.conditions.get(`${observation.surface}|${id}`) ?? []));
      item.ingresses.push(...routeIngresses(observation.path, runtime.deployment, runtime.runtime));
      exposuresByKey.set(key, item);
    }
    for (const mount of mountsByRow.get(id) ?? []) {
      const runtime = runtimeForMount(mount);
      if (!runtime) continue;
      const key = `${runtime.deployment}|${runtime.runtime}`;
      if (!exposuresByKey.has(key)) {
        exposuresByKey.set(key, {
          ...runtime,
          definitions: [],
          conditions: [],
          ingresses: routeIngresses(node.path || id.replace(/^api:[A-Z]+/, ''), runtime.deployment, runtime.runtime),
          mountEvidence: sourceSite(mount),
        });
      }
    }
    // KG edge definitions are structural fallback evidence only: runtime
    // instrumentation owns definitions[] (role + effective order) whenever the
    // surface was actually observed. Injecting edge sites alongside runtime
    // observations misattributes roles (the /api/version shadowed pair).
    if (!exposuresByKey.has('vercel-api|make_app')) {
      for (const definition of definitions) {
        if (definition.site?.startsWith('server/app.ts')) {
          const key = 'vercel-api|make_app';
          const exposure = exposuresByKey.get(key) ?? {
            deployment: 'vercel-api', runtime: 'make_app', definitions: [], conditions: [], ingresses: [], mountEvidence: definition.site,
          };
          exposure.definitions.push(definition);
          exposure.ingresses.push(...routeIngresses(node.path || id.replace(/^api:[A-Z]+/, ''), 'vercel-api', 'make_app'));
          exposuresByKey.set(key, exposure);
        }
      }
    }
    const sourceRuntimeEntries = runtimeSpecificBySource.get(node.source_path) ?? [];
    const exposures = [...exposuresByKey.values()].map((exposure) => makeExposure({
      ...exposure,
      snapshotId,
    }));
    const observedDefinitions = exposures.flatMap((exposure) => exposure.definitions ?? []);
    const authSuggestion = authSuggestionFor({
      manifest,
      policy,
      definitions: observedDefinitions.length > 0 ? observedDefinitions : definitions,
      exposures,
      additionalAuthEvidence: authEvidenceByRow.get(id) ?? [],
      method: node.method,
      path: node.path || id.replace(/^api:[A-Z]+/, ''),
    });
    const persistenceSuggestion = persistenceSuggestionFor(node.method, policy);
    const safeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(String(node.method).toUpperCase());
    const hasVercelExposure = exposures.some((exposure) =>
      exposure.deployment === 'vercel-api' && (exposure.ingresses ?? []).length > 0);
    const reachability = hasVercelExposure ? 'vercel' : 'local';
    const sourceEvidence = sortedUnique([
      node.source_path ? `${node.source_path}:${node.line_start ?? 1}` : undefined,
      ...edgeDefinitions.map((entry) => entry.site),
      ...observations.map((observation) => observation.site),
    ].filter(Boolean));
    rows.set(id, makeRow({
      id,
      seam: manifest?.id || node.source_path || 'runtime-observed',
      interface: 'http-api',
      owner: ownerForPolicy(policy) || manifest?.owner || 'unassigned',
      auth_roles: authSuggestion.auth_roles,
      auth_evidence: authSuggestion.auth_evidence,
      reachability,
      proven_reachability: 'none',
      exposures,
      evidence: sourceEvidence,
      source_mapping: {
        kg_node: node.id,
        source_module: manifest?.sourceModule,
        manifest_ids: manifest ? [manifest.id] : [],
        runtime_specific_ids: sourceRuntimeEntries.map((entry) => entry.id),
      },
      machine_suggestions: {
        owner: ownerForPolicy(policy) || manifest?.owner || 'unassigned',
        personas: authSuggestion.personas,
        auth_roles: authSuggestion.auth_roles,
        unresolved_auth: authSuggestion.unresolved,
        undecided_auth_roles: authSuggestion.undecided_roles,
        persistence: persistenceSuggestion.value,
        persistence_evidence: persistenceSuggestion.evidence,
        destructive: safeMethod ? 'none' : 'unknown',
        environment: 'unknown',
      },
    }));
  }
  return rows;
};

const makeRow = (input) => {
  const row = {
    id: canonicalRowId(input.id),
    seam: input.seam || 'unassigned',
    interface: input.interface,
    personas: ['unknown'],
    reachability: input.reachability || 'local',
    proven_reachability: input.proven_reachability || 'none',
    exposures: input.exposures || [],
    persistence: 'unknown',
    destructive: 'unknown',
    environment: 'unknown',
    owner: input.owner || 'unassigned',
    evidence: input.evidence || [],
    source_mapping: input.source_mapping || {},
    queue_roles: input.queue_roles || emptyQueueRoles(),
    auth_roles: input.auth_roles || [],
    auth_evidence: input.auth_evidence || [],
    behavior_flags: input.behavior_flags || [],
    test_evidence: { derived: [], manual: [] },
    classification: 'unclassified',
    decision_status: 'proposed',
    approved_source_hashes: [],
    machine_suggestions: input.machine_suggestions || {},
    ...input,
  };
  row.decision_suggestion = proposeDecision(row);
  row.decision = row.decision_suggestion;
  row.contract_fingerprint = contractFingerprint(row);
  return row;
};

const makeClientRows = ({ nodes, snapshotId }) => {
  const rows = new Map();
  for (const node of [...nodes.values()].filter((item) => item.type === 'ClientRoute')) {
    const id = canonicalRowId(`client:${node.path}`);
    const governance = governanceByPath.get(node.path);
    const isLpRoute = node.path === '/lp' || governance?.surface === 'lp-route';
    const isArchivedRedirect = governance?.surface === 'archived-placeholder'
      || governance?.surface === 'legacy-redirect';
    const isCanonicalMoic = node.path === '/fund-model-results/:fundId/moic-analysis';
    const isLegacyMoic = node.path === '/moic-analysis';
    const lifecycleCondition = isLpRoute
      ? [{
        gate: 'enable_lp_reporting',
        enabled: false,
        source: 'client/src/app/app-router.tsx:129',
        reason: 'LP dashboard routes mount only when enable_lp_reporting is enabled',
      }]
      : [];
    const routeKind = isArchivedRedirect
      ? governance.surface
      : isCanonicalMoic ? 'canonical' : isLegacyMoic ? 'legacy-redirect' : governance?.surface;
    const redirectTarget = isLegacyMoic
      ? '/model-results'
      : governance?.redirectTarget;
    const governanceOwner = governance?.surface === 'lp-route' || node.path.startsWith('/lp')
      ? 'lp-reporting'
      : governance?.surface === 'admin-gated' ? 'platform' : undefined;
    rows.set(id, makeRow({
      id,
      seam: 'client-router',
      interface: 'client-route',
      reachability: 'client',
      proven_reachability: 'none',
      exposures: [
        makeExposure({
          deployment: 'vercel-web',
          runtime: 'client_router',
          mountEvidence: sourceSite(node),
          definitions: [definitionFromSite(sourceSite(node), 'handler', node.line_start ?? 0)],
          ingresses: [{
            external_path: node.path,
            express_path: node.path,
            rewrite_evidence: 'vercel.json SPA deployment topology',
          }],
          conditions: lifecycleCondition,
          snapshotId,
        }),
      ],
      evidence: [asEvidence(sourceSite(node))],
      owner: governanceOwner || 'unassigned',
      source_mapping: { kg_node: node.id, route_path: node.path, component: node.component },
      route_kind: routeKind,
      route_category: isArchivedRedirect ? 'compatibility-surface' : 'live-product-route',
      archived_placeholder: governance?.surface === 'archived-placeholder',
      legacy: governance?.surface === 'legacy-redirect' || isLegacyMoic,
      ...(redirectTarget ? { redirect_target: redirectTarget } : {}),
      machine_suggestions: {
        owner: governanceOwner || 'unassigned',
        governance: governance?.surface,
        lifecycle: isArchivedRedirect ? 'compatibility-surface' : 'live-product-route',
        ...(isLpRoute ? { feature_flag: 'enable_lp_reporting', flag_default: false } : {}),
        ...(isCanonicalMoic ? { moic_route: 'canonical' } : {}),
        ...(isLegacyMoic ? { moic_route: 'redirect', redirect_target: '/model-results' } : {}),
      },
    }));
  }
  return rows;
};

const moduleGraphFor = (entryPath, cache) => {
  if (cache.has(entryPath)) return cache.get(entryPath);
  let graph;
  try {
    graph = new Set(resolveListenerModuleGraph(entryPath, { rootDir: repoRoot }));
  } catch {
    graph = new Set([entryPath]);
  }
  cache.set(entryPath, graph);
  return graph;
};

const dedicatedRailwayEntrypointFor = (deployment) =>
  `workers/${String(deployment).replace(/^railway-worker-/, '')}-worker.ts`;

const queueRuntimeFor = (catalog, roleKind, site = '', topology = { cache: new Map() }) => {
  if (!catalog?.productionDisposition) {
    throw new Error(`Discovered queue has no QUEUE_CATALOG productionDisposition: ${catalog?.queueName ?? 'unknown'}`);
  }
  const disposition = catalog.productionDisposition;
  if (disposition.mode === 'quarantined') {
    return {
      deployment: 'excluded',
      runtime: 'unreachable',
      topology_reason: 'QUEUE_CATALOG productionDisposition quarantined; registry runtime registration is excluded',
    };
  }
  if (disposition.mode === 'railway-worker') {
    if (roleKind === 'producer' && catalog.owner === 'route') {
      return { deployment: 'vercel-api', runtime: 'make_app', topology_reason: 'route-owned producer runs in Vercel API' };
    }
    const sourcePath = String(site).split(':')[0];
    const entrypoint = dedicatedRailwayEntrypointFor(disposition.deployment);
    if ((roleKind === 'consumer' || (roleKind === 'producer' && catalog.owner === 'providers'))
      && moduleGraphFor(entrypoint, topology.cache).has(sourcePath)) {
      return {
        deployment: disposition.deployment,
        runtime: 'worker_process',
        topology_reason: `dedicated Railway entrypoint ${entrypoint} module graph reaches ${sourcePath}`,
      };
    }
  }
  return {
    deployment: 'local-process',
    runtime: 'worker_process',
    topology_reason: `QUEUE_CATALOG productionDisposition ${disposition.mode}`,
  };
};

const methodFromRowId = (row) => row.id.match(/^api:([A-Z]+):/)?.[1] ?? 'ANY';

const handlerFilesForRow = (row) => sortedUnique([
  ...(row.exposures ?? []).flatMap((exposure) => (exposure.definitions ?? [])
    .filter((definition) => definition.role === 'handler')
    .map((definition) => String(definition.site ?? '').split(':')[0])),
  row.source_mapping?.source_module ? manifestSourcePath(row.source_mapping.source_module) : undefined,
].filter((filePath) => filePath && trackedSet.has(filePath)));

const triggeringRowsForSite = (site, httpRows, backgroundRows, topology) => {
  const filePath = String(site ?? '').split(':')[0];
  const producerRows = [];
  for (const row of httpRows) {
    const method = methodFromRowId(row);
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) continue;
    const handlerFiles = handlerFilesForRow(row);
    if (handlerFiles.some((handlerFile) => moduleGraphFor(handlerFile, topology.cache).has(filePath))) {
      producerRows.push(row.id);
    }
  }
  for (const row of backgroundRows) {
    if (row.evidence?.some((evidence) => String(evidence).startsWith(`${filePath}:`))) producerRows.push(row.id);
  }
  return [...new Set(producerRows)].sort((left, right) => left.localeCompare(right));
};

const triggeringReason = (site, triggeringRowIds) => triggeringRowIds.length > 0
  ? 'mutation handler module graph reaches producer site'
  : `no determinable mutation handler reaches producer site ${String(site).split(':')[0]}; triggering rows left empty`;

const queueExposureSpecs = (roles) => {
  const byKey = new Map();
  for (const role of [...roles.producers, ...roles.consumers]) {
    if (!['vercel-api', 'railway-worker-fund-scenario-calc', 'railway-worker-capital-call-status', 'local-process'].includes(role.deployment)) continue;
    const key = `${role.deployment}|${role.runtime}`;
    const current = byKey.get(key) ?? { deployment: role.deployment, runtime: role.runtime, sites: [] };
    current.sites.push(role.site);
    byKey.set(key, current);
  }
  return [...byKey.values()].sort((left, right) => `${left.deployment}|${left.runtime}`.localeCompare(`${right.deployment}|${right.runtime}`));
};

const makeWorkerRows = ({ nodes, findings, snapshotId, httpRows = [], backgroundRows = [] }) => {
  const workerNames = new Map();
  const topology = { cache: new Map() };
  for (const node of [...nodes.values()].filter((item) => item.type === 'WorkerJob')) {
    workerNames.set(node.name || node.queue, { node, queue: node.queue || node.name });
  }
  for (const finding of findings) {
    const current = workerNames.get(finding.queue_name) ?? {};
    workerNames.set(finding.queue_name, {
      ...current,
      queue: finding.queue_name,
      findings: [...(current.findings ?? []), finding],
    });
  }
  for (const catalog of QUEUE_CATALOG) {
    const current = workerNames.get(catalog.queueName) ?? {};
    workerNames.set(catalog.queueName, { ...current, queue: catalog.queueName, catalog });
  }
  const catalogByQueueName = new Map(QUEUE_CATALOG.map((catalog) => [catalog.queueName, catalog]));
  const rows = new Map();
  for (const [queue, data] of [...workerNames.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const catalog = data.catalog ?? catalogByQueueName.get(queue);
    if (!catalog) throw new Error(`Discovered queue has no QUEUE_CATALOG metadata: ${queue}`);
    const id = canonicalRowId(`worker:${queue}`);
    const node = data.node;
    const roles = emptyQueueRoles();
    for (const finding of data.findings ?? []) {
      const triggeringRowIds = finding.kind === 'queue'
        ? triggeringRowsForSite(finding.path, httpRows, backgroundRows, topology)
        : [];
      const siteTopology = queueRuntimeFor(catalog, finding.kind === 'queue' ? 'producer' : 'consumer', finding.path, topology);
      const role = {
        site: `${finding.path}:${finding.line}`,
        deployment: siteTopology.deployment,
        runtime: siteTopology.runtime,
        topology_reason: siteTopology.topology_reason,
        ...(finding.kind === 'queue'
          ? { triggering_row_ids: triggeringRowIds, triggering_row_ids_reason: triggeringReason(finding.path, triggeringRowIds) }
          : {}),
      };
      if (finding.kind === 'queue') roles.producers.push(role);
      else roles.consumers.push(role);
    }
    if (catalog.healthMode === 'worker' && roles.consumers.length === 0 && node) {
      roles.consumers.push({
        site: sourceSite(node),
        ...queueRuntimeFor(catalog, 'consumer', sourceSite(node), topology),
      });
    }
    const exposureSpecs = queueExposureSpecs(roles);
    const reachableDeployments = new Set(exposureSpecs.map((spec) => spec.deployment));
    const hasReachableConsumer = roles.consumers
      .some((role) => reachableDeployments.has(role.deployment));
    roles.consumer_status = hasReachableConsumer ? 'reachable' : 'no-reachable-consumer';
    roles.consumer_status_reason = hasReachableConsumer
      ? 'at least one consumer site belongs to a tracked runtime module graph'
      : catalog.productionDisposition.mode === 'quarantined'
        ? 'QUEUE_CATALOG quarantines this queue, so runtime registration is excluded'
        : 'no consumer site is reachable from scripts/build-workers.mjs or the tracked API composition graph';
    const noReachableRuntime = exposureSpecs.length === 0;
    const evidence = sortedUnique([
      node ? sourceSite(node) : undefined,
      ...(data.findings ?? []).map((finding) => `${finding.path}:${finding.line}`),
      `server/queues/registry.ts:${catalog.key}`,
    ].filter(Boolean));
    rows.set(id, makeRow({
      id,
      seam: catalog.key,
      interface: 'worker-job',
      reachability: noReachableRuntime ? 'dormant' : exposureSpecs.some((spec) => spec.deployment.startsWith('railway-worker-')) ? 'railway' : exposureSpecs.some((spec) => spec.deployment === 'vercel-api') ? 'vercel' : 'local',
      proven_reachability: 'none',
      exposures: exposureSpecs.map((spec) => makeExposure({
        deployment: spec.deployment,
        runtime: spec.runtime,
        mountEvidence: spec.sites[0],
        definitions: spec.sites.map((site) => definitionFromSite(site, 'handler', 0)),
        snapshotId,
      })),
      queue_roles: roles,
      evidence,
      source_mapping: {
        queue_catalog_keys: [catalog.key],
        queue_name: queue,
        kg_nodes: node ? [node.id] : [],
        production_disposition: catalog.productionDisposition,
      },
      // Queue catalog owners (`providers`/`route`) describe registration
      // sites, not matrix owner domains. Classification assigns the
      // documented queue-domain owner from this deliberately unassigned seed.
      machine_suggestions: { owner: 'unassigned' },
    }));
  }
  return rows;
};

const makeBackgroundRows = (snapshotId) => {
  const definitions = [
    ['scheduler:variance-alert-automation', 'variance-alert-automation', 'server/routes.ts:42'],
    ['scheduler:artifact-retention', 'artifact-retention', 'server/routes.ts:44'],
    ['scheduler:internal-analysis-checkpoint', 'internal-analysis-checkpoint', 'server/routes.ts:46'],
    ['event:calc-run-completion', 'calc-run-completion', 'server/routes.ts:40'],
  ];
  const rows = new Map();
  for (const [id, seam, site] of definitions) {
    const interfaceName = id.startsWith('scheduler:') ? 'scheduler' : id.startsWith('event:') ? 'event-handler' : 'websocket';
    const runtime = interfaceName === 'scheduler' ? 'scheduler_poller' : interfaceName === 'event-handler' ? 'event_handler' : 'websocket_server';
    rows.set(id, makeRow({
      id,
      seam,
      interface: interfaceName,
      reachability: 'local',
      proven_reachability: 'none',
      exposures: [makeExposure({
        deployment: 'local-process',
        runtime,
        mountEvidence: site,
        definitions: [definitionFromSite(site, 'handler', 0)],
        snapshotId,
      })],
      evidence: [site],
      source_mapping: { registration: site },
    }));
  }
  const websocketRows = [
    {
      id: 'ws:portfolio-metrics',
      seam: 'portfolio-metrics',
      path: '/ws/portfolio-metrics',
      sourceFile: 'server/websocket/portfolio-metrics.ts',
      authEvidence: [{
        kind: 'policy-boundary',
        boundary: 'authenticated_and_fund_channel_authorized',
        file: 'server/websocket/portfolio-metrics.ts',
        line: 1,
        evidence: 'portfolio metrics WebSocket requires authenticated fund/channel authorization',
      }],
    },
    {
      id: 'ws:dev-dashboard',
      seam: 'dev-dashboard',
      path: '/socket.io/dev-dashboard',
      sourceFile: 'server/websocket/dev-dashboard.ts',
      conditions: [{ NODE_ENV: 'development' }],
      authEvidence: [],
    },
  ];
  for (const websocket of websocketRows) {
    rows.set(websocket.id, makeRow({
      id: websocket.id,
      seam: websocket.seam,
      interface: 'websocket',
      reachability: 'local',
      proven_reachability: 'none',
      personas: ['system'],
      exposures: [makeExposure({
        deployment: 'local-process',
        runtime: 'websocket_server',
        mountEvidence: 'server/routes.ts:153',
        definitions: [definitionFromSite(`server/routes.ts:153`, 'handler', 0)],
        ingresses: [{
          external_path: websocket.path,
          express_path: websocket.path,
          rewrite_evidence: `${websocket.sourceFile} WebSocket server path`,
        }],
        conditions: websocket.conditions ?? [],
        authEvidence: websocket.authEvidence,
        snapshotId,
      })],
      auth_evidence: websocket.authEvidence,
      evidence: ['server/routes.ts:153', `${websocket.sourceFile}:1`],
      source_mapping: {
        registration: 'server/routes.ts:153',
        source_file: websocket.sourceFile,
        websocket_path: websocket.path,
      },
      machine_suggestions: {
        owner: 'unassigned',
        websocket_path: websocket.path,
        ...(websocket.id === 'ws:portfolio-metrics'
          ? { auth_requirement: 'authenticated_and_fund_channel_authorized' }
          : { environment: 'development-only' }),
      },
    }));
  }
  return rows;
};

const makeListenerDispositions = (candidates) => {
  const product = new Map([
    ['workers/health-server.ts', { listenerId: 'worker-health', rowNamespace: 'listener', strategy: 'literal-route-registration' }],
    ['ml-service/app.py', { listenerId: 'ml-reserve', rowNamespace: 'listener', strategy: 'literal-route-registration' }],
    ['server/index.ts', { listenerId: 'server-index', rowNamespace: 'api', strategy: 'existing-api-row-mapping' }],
    ['server/bootstrap.ts', { listenerId: 'server-bootstrap', rowNamespace: 'api', strategy: 'existing-api-row-mapping' }],
    ['Dockerfile', { listenerId: 'dockerfile-root', rowNamespace: 'api', strategy: 'container-entrypoint-evidence' }],
    ['Dockerfile.simple', { listenerId: 'dockerfile-simple', rowNamespace: 'api', strategy: 'container-entrypoint-evidence' }],
    ['Dockerfile.worker', { listenerId: 'dockerfile-worker', rowNamespace: 'api', strategy: 'container-entrypoint-evidence' }],
    ['ml-service/Dockerfile', { listenerId: 'dockerfile-ml-reserve', rowNamespace: 'listener', strategy: 'container-entrypoint-evidence' }],
  ]);
  const entries = [];
  for (const candidate of candidates) {
    if (candidate.path === 'Dockerfile.railway') {
      const base = {
        candidate_path: candidate.path,
        listener_id: 'legacy-dockerfile-railway',
        disposition: 'non-product-tooling',
        rationale: 'Legacy undeployed Railway API container evidence; inventory-gated and excluded from production topology.',
        evidence: candidate.patterns.map((pattern) => `${candidate.path}:${pattern.line}`),
        detected_listener_patterns: candidate.patterns,
      };
      entries.push(ListenerDispositionSchema.parse({
        ...base,
        fingerprint: listenerDispositionFingerprint(base, candidate),
      }));
      continue;
    }
    const productSpec = product.get(candidate.path);
    if (productSpec) {
      const base = {
        candidate_path: candidate.path,
        listener_id: productSpec.listenerId,
        disposition: 'product-surface',
        row_namespace: productSpec.rowNamespace,
        route_extraction_strategy: productSpec.strategy,
        detected_listener_patterns: candidate.patterns,
        evidence: candidate.patterns.map((pattern) => `${candidate.path}:${pattern.line}`),
      };
      entries.push(ListenerDispositionSchema.parse({
        ...base,
        fingerprint: listenerDispositionFingerprint(base, candidate),
      }));
      continue;
    }
    const base = {
      candidate_path: candidate.path,
      listener_id: `tooling-${candidate.path.replace(/[^A-Za-z0-9]+/g, '-')}`.replace(/-$/, ''),
      disposition: 'non-product-tooling',
      rationale: 'Local development or orchestration listener; not a product deployment surface.',
      evidence: candidate.patterns.map((pattern) => ({
        file: candidate.path,
        line: pattern.line,
        pattern: pattern.kind,
        text: pattern.text,
      })),
      detected_listener_patterns: candidate.patterns,
    };
    entries.push(ListenerDispositionSchema.parse({
      ...base,
      fingerprint: listenerDispositionFingerprint(base, candidate),
    }));
  }
  return entries.sort((left, right) => left.candidate_path.localeCompare(right.candidate_path));
};

export const mergeListenerDispositions = (previousEntries, discoveredEntries, candidates) => {
  const previousByPath = new Map((previousEntries ?? []).map((entry) => [entry.candidate_path, entry]));
  return discoveredEntries.map((discovered) => {
    const previous = previousByPath.get(discovered.candidate_path);
    const merged = { ...discovered };
    const forcedLegacy = discovered.candidate_path === 'Dockerfile.railway';
    if (previous && !forcedLegacy) {
      for (const field of [
        'disposition',
        'row_namespace',
        'route_extraction_strategy',
        'rationale',
        'evidence',
        'decision_status',
        'decision_evidence',
      ]) {
        if (Object.prototype.hasOwnProperty.call(previous, field)) merged[field] = previous[field];
      }
    }
    const candidate = candidates.find((entry) => entry.path === merged.candidate_path);
    const fingerprint = listenerDispositionFingerprint(merged, candidate);
    if (forcedLegacy || (previous?.decision_status === 'approved' && previous.fingerprint !== fingerprint)) {
      merged.decision_status = 'proposed';
    }
    merged.fingerprint = fingerprint;
    return ListenerDispositionSchema.parse(merged);
  }).sort((left, right) => left.candidate_path.localeCompare(right.candidate_path));
};

const makeRuntimeExclusions = () => {
  const exclusions = [
    {
      id: 'legacy-railway-api-topology',
      matched_layer: 'legacy-container-and-service-manifests',
      rule: 'undeployed; inventory-gated; excluded from production topology',
      evidence: [
        'Dockerfile.railway',
        'DECISIONS.md#ADR-080',
        'railway.toml absent: retired by ADR-080',
      ],
      decision_status: 'proposed',
      decision_evidence: 'ADR-080 source-derived legacy Railway topology exclusion.',
    },
    {
      id: 'ml-service-local-production-topology',
      matched_layer: 'ml-service-local',
      rule: 'local-only; excluded from Vercel and Railway production artifacts; provider inventory approval required',
      evidence: [
        'ml-service/Dockerfile',
        '.vercelignore:ml-service/ is excluded from Vercel build input',
        '.dockerignore:ml-service/ is excluded from production Docker build input',
        'vercel.json',
        'railway.worker.toml',
        'railway.capital-call-status.worker.toml',
        'DECISIONS.md#ADR-075',
      ],
      decision_status: 'proposed',
      decision_evidence: 'ADR-075 source-derived local-only ML service exclusion; exact provider inventory remains an approval-time gate.',
    },
  ];
  return exclusions.map((entry) => ({ ...entry, fingerprint: runtimeExclusionFingerprint(entry) }));
};

const mergeRuntimeExclusions = (previousEntries, discoveredEntries) => {
  const previousById = new Map((previousEntries ?? []).map((entry) => [entry.id ?? entry.exclusion_id ?? entry.layer_id, entry]));
  const discoveredIds = new Set();
  const merged = (discoveredEntries ?? []).map((entry) => {
    const id = entry.id ?? entry.exclusion_id ?? entry.layer_id;
    discoveredIds.add(id);
    const previous = previousById.get(id);
    if (previous?.fingerprint === entry.fingerprint) return { ...entry, ...Object.fromEntries([
      'decision_status', 'decision_evidence',
    ].filter((field) => Object.prototype.hasOwnProperty.call(previous, field)).map((field) => [field, previous[field]])) };
    return entry;
  });
  for (const entry of previousEntries ?? []) {
    const id = entry.id ?? entry.exclusion_id ?? entry.layer_id;
    if (!discoveredIds.has(id)) merged.push(entry);
  }
  return merged.sort((left, right) => String(left.id ?? left.exclusion_id ?? left.layer_id)
    .localeCompare(String(right.id ?? right.exclusion_id ?? right.layer_id)));
};

const makeListenerRows = ({ dispositions, snapshotId }) => {
  const rows = new Map();
  for (const disposition of dispositions.filter((entry) => entry.disposition === 'product-surface' && entry.row_namespace === 'listener')) {
    const candidate = { path: disposition.candidate_path, patterns: disposition.detected_listener_patterns ?? [] };
    const routes = extractProductRoutes(disposition, { rootDir: repoRoot });
    for (const route of routes) {
      const id = canonicalRowId(route.id);
      const exposureTargets = disposition.listener_id === 'worker-health'
        ? [
            'local-process',
            'railway-worker-capital-call-status',
            'railway-worker-fund-scenario-calc',
          ].map((deployment) => ({ deployment, runtime: 'service_listener' }))
        : [{ deployment: 'ml-service-local', runtime: 'service_listener' }];
      rows.set(id, makeRow({
        id,
        seam: disposition.listener_id,
        interface: 'http-api',
        reachability: disposition.listener_id === 'worker-health' ? 'railway' : 'local',
        proven_reachability: 'none',
        exposures: exposureTargets.map(({ deployment, runtime }) => makeExposure({
          deployment,
          runtime,
          mountEvidence: `${disposition.candidate_path}:${route.line}`,
          definitions: [definitionFromSite(`${route.file}:${route.line}`, 'handler', route.line)],
          ingresses: [{
            external_path: route.path,
            express_path: route.path,
            rewrite_evidence: `${disposition.candidate_path} listener`,
          }],
          snapshotId,
        })),
        evidence: [
          `${route.file}:${route.line}`,
          ...candidate.patterns.map((pattern) => `${candidate.path}:${pattern.line}`),
        ],
        source_mapping: { listener_id: disposition.listener_id, candidate_path: disposition.candidate_path },
      }));
    }
  }
  return rows;
};

const functionRouteFromPath = (filePath) => `/api/${filePath.replace(/^api\//, '').replace(/\.ts$/, '')}`;

const makeVercelFunctionRows = ({ snapshotId }) => {
  const rows = new Map();
  for (const filePath of trackedFiles().filter((file) => file.startsWith('api/') && file.endsWith('.ts'))) {
    if (filePath.endsWith('.disabled') || filePath === 'api/[...slug].ts' || filePath === 'api/_types.ts') continue;
    const routePath = functionRouteFromPath(filePath);
    const id = canonicalRowId(`api-fn:ANY:${routePath}`);
    rows.set(id, makeRow({
      id,
      seam: 'vercel-functions',
      interface: 'vercel-function',
      reachability: 'vercel',
      proven_reachability: 'none',
      exposures: [makeExposure({
        deployment: 'vercel-api',
        runtime: 'vercel_function',
        mountEvidence: `${filePath}:default export`,
        definitions: [definitionFromSite(`${filePath}:default export`, 'handler', 0)],
        ingresses: [{
          external_path: routePath,
          express_path: routePath,
          rewrite_evidence: routePath.startsWith('/api/')
            ? 'vercel function-before-rewrite precedence'
            : 'vercel filesystem function route',
        }],
        snapshotId,
      })],
      evidence: [
        `${filePath}:default export`,
        `${filePath}:filesystem function route ${routePath}`,
      ],
      source_mapping: { function_file: filePath, route_path: routePath, method_dispatch: 'ANY' },
    }));
  }
  return rows;
};

const makeDormantRows = ({ candidates, inventory }) => {
  const paths = new Set([
    ...(inventory.entries ?? []).filter((entry) => entry.disposition === 'promote').map((entry) => entry.path),
    ...trackedFiles().filter((file) => file.startsWith('client/src/pages/v2/') && !TEST_OR_FIXTURE_SUFFIX.test(file)),
  ]);
  const rows = new Map();
  for (const filePath of [...paths].sort((left, right) => left.localeCompare(right))) {
    const id = canonicalRowId(`dormant:${filePath}`);
    const candidate = candidates.find((entry) => entry.path === filePath);
    rows.set(id, makeRow({
      id,
      seam: 'dormant-ui',
      interface: 'dormant-ui',
      reachability: 'dormant',
      proven_reachability: 'none',
      exposures: [],
      evidence: sortedUnique([
        filePath,
        ...(candidate?.importer_evidence ?? []).map((entry) => `${entry.importer}:${entry.line}`),
      ]),
      source_mapping: {
        candidate_path: filePath,
        importer_evidence: candidate?.importer_evidence ?? [],
        inventory: candidate ? 'dormant-candidates.json' : 'dormant-inventory.json',
      },
      machine_suggestions: { disposition: 'not-surface' },
    }));
  }
  return rows;
};

const addOrphanRows = (rows, orphanDocument, snapshotId) => {
  for (const orphan of orphanDocument ?? []) {
    if (orphan.resolution !== 'retained') continue;
    const replacement = orphan.replacement_row ?? orphan.replacement ?? orphan.row;
    if (!replacement?.id) continue;
    const id = canonicalRowId(replacement.id);
    if (!rows.has(id)) rows.set(id, makeRow({
      ...replacement,
      id,
      decision_status: 'proposed',
      evidence: replacement.evidence ?? [`orphan:${orphan.id}`],
      machine_suggestions: { reentered_from_orphan: orphan.id },
      exposures: (replacement.exposures ?? []).map((exposure) => ({
        ...exposure,
        boot_status: 'unproven',
        boot_evidence: { ...exposure.boot_evidence, observed_at: snapshotId, result: 'not-yet-executed' },
      })),
    }));
  }
};

const rowRoutePath = (row) => row.id.startsWith('client:')
  ? row.source_mapping?.route_path || row.id.slice('client:'.length)
  : row.id.match(/^api:[A-Z]+:(.*)$/)?.[1];

const isAnonymousSharingPath = (row) => {
  const routePath = String(rowRoutePath(row) ?? '');
  return /^(?:\/shared(?:\/|$)|\/portal(?:\/|$)|\/api\/public\/shares(?:\/|$))/.test(routePath);
};

const hasDocumentedAnonymousPolicyException = (row) => {
  const routePath = String(rowRoutePath(row) ?? '');
  if (row.interface === 'client-route') {
    return governanceByPath.get(routePath)?.surface === 'public-contract';
  }
  const manifestIds = row.source_mapping?.manifest_ids ?? [];
  return manifestIds.some((id) => COMMON_API_ROUTE_MANIFEST.find((entry) => entry.id === id)?.authBoundary === 'public');
};

const applyInternalOnlyDefaults = (rows) => {
  for (const row of rows.values()) {
    const routePath = String(rowRoutePath(row) ?? '');
    const lpApi = row.interface === 'http-api'
      && /^\/api\/lp(?:\/|$)/.test(routePath)
      && !hasDocumentedAnonymousPolicyException(row);
    const anonymousSharing = isAnonymousSharingPath(row)
      && !hasDocumentedAnonymousPolicyException(row);
    if (!lpApi && !anonymousSharing) {
      if (isAnonymousSharingPath(row)) {
        row.machine_suggestions = {
          ...row.machine_suggestions,
          anonymous_policy_exception: true,
        };
      }
      continue;
    }

    row.machine_suggestions = {
      ...row.machine_suggestions,
      internal_only_default: true,
      internal_only_reason: lpApi
        ? 'LP API surface is disabled by default with enable_lp_reporting=false; anonymous reachability is excluded.'
        : 'Anonymous sharing surface has no documented public-policy exception.',
    };
    row.behavior_flags = sortedUnique([...(row.behavior_flags ?? []), 'internal-only-default']);
    // Preserve structural route evidence while making the anonymous/default
    // exposure state explicit for downstream authoring and review.
    row.anonymous_reachability = 'excluded-unreachable';
  }
};

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const fileMatches = (filePath, pattern) => {
  const normalized = repoPath(filePath);
  if (pattern === 'server/routes/**/*.ts') return normalized.startsWith('server/routes/') && normalized.endsWith('.ts');
  if (pattern === 'api/**/*.ts') return normalized.startsWith('api/') && normalized.endsWith('.ts');
  if (pattern === 'workers/**') return normalized.startsWith('workers/');
  if (pattern === 'server/workers/**') return normalized.startsWith('server/workers/');
  if (pattern === 'ml-service/**') return normalized.startsWith('ml-service/');
  return false;
};

const isExcludedSource = (filePath) => TEST_OR_FIXTURE_SEGMENT.test(filePath) || TEST_OR_FIXTURE_SUFFIX.test(filePath);

// The inventory cannot record a hash of itself: seeding rewrites
// source-inventory.json after the projection hashed its pre-seed bytes, so a
// merged self-entry is stale by construction and fails every rehash audit.
export const INVENTORY_SELF_PATH = 'audit/surface-contract-matrix/source-inventory.json';

export const mergeManifestSourceHashes = (inventorySourceHashes = {}, manifestSourceHashes = {}) => {
  const merged = { ...inventorySourceHashes, ...manifestSourceHashes };
  delete merged[INVENTORY_SELF_PATH];
  return merged;
};

const sourceHashes = ({ nodes, snapshotId, manifestSourceHashes = {} }) => {
  const membership = new Map();
  const include = (filePath, category, allowUntracked = false) => {
    if (!filePath || (!allowUntracked && !trackedSet.has(filePath)) || isExcludedSource(filePath)) return;
    const categories = membership.get(filePath) ?? new Set();
    categories.add(category);
    membership.set(filePath, categories);
  };
  for (const node of nodes.values()) include(node.source_path, 'kg-attributed-route-source');
  const registryFiles = [
    'shared/routes/api-route-manifest.ts',
    'shared/routes/api-runtime-specific-manifest.ts',
    'server/route-policy/api-route-policy-registry.ts',
    'shared/routes/route-governance-registry.ts',
  ];
  for (const file of registryFiles) include(file, 'registry');
  for (const file of [
    'server/app.ts', 'server/server.ts', 'server/routes.ts', 'server/routes/mount-common-routes.ts',
    'api/[...slug].ts', 'scripts/build-vercel-api.mjs', 'server/bootstrap.ts', 'scripts/build-server.mjs',
    'scripts/build-workers.mjs', 'vercel.json', '.vercelignore', '.dockerignore', 'package.json',
    'package-lock.json', 'client/index.html', 'client/src/main.tsx', 'client/src/App.tsx', 'vite.config.ts',
  ]) include(file, 'runtime-composition-and-deployment');
  for (const file of trackedFiles().filter((candidate) => /^Dockerfile(?:\..*)?$/.test(candidate) || /^railway(?:\..*)?\.toml$/.test(candidate))) {
    include(file, 'deployment-entrypoint');
  }
  for (const pattern of RUNTIME_SOURCE_UNIVERSE) {
    for (const file of trackedFiles().filter((candidate) => fileMatches(candidate, pattern))) include(file, `universe:${pattern}`);
  }
  for (const file of trackedFiles().filter((candidate) => AUTH_TRUTH_SOURCE_PATTERNS.some((pattern) =>
    pattern.endsWith('/**') ? candidate.startsWith(pattern.slice(0, -3)) : candidate === pattern))) {
    include(file, 'auth-truth');
  }
  for (const file of fs.readdirSync(path.join(matrixDir, 'scripts'))
    .filter((candidate) => candidate.endsWith('.mjs'))
    .map((candidate) => `audit/surface-contract-matrix/scripts/${candidate}`)) {
    include(file, 'authoring-tooling', true);
  }
  include('audit/surface-contract-matrix/matrix-schema.mjs', 'authoring-tooling', true);
  include('audit/surface-contract-matrix/boot-proofs.json', 'boot-proof-output', true);
  for (const file of trackedFiles().filter((candidate) => candidate.startsWith('client/src/pages/v2/'))) {
    include(file, 'client-pages-v2');
  }
  const sourceHashesMap = {};
  const sourceMembership = {};
  for (const [filePath, categories] of [...membership.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    sourceHashesMap[filePath] = sha256(fs.readFileSync(path.join(repoRoot, filePath)));
    for (const category of categories) {
      const files = sourceMembership[category] ?? [];
      files.push(filePath);
      sourceMembership[category] = files;
    }
  }
  const packageJson = readJson(path.join(repoRoot, 'package.json'), {});
  sourceHashesMap['package.json#scripts'] = sha256(JSON.stringify(Object.fromEntries(
    Object.entries(packageJson.scripts ?? {}).sort(([left], [right]) => left.localeCompare(right)),
  )));
  sourceMembership['normalized-package-scripts'] = ['package.json#scripts'];
  const registryExports = {
    'shared/routes/api-route-manifest.ts': COMMON_API_ROUTE_MANIFEST,
    'shared/routes/api-runtime-specific-manifest.ts': API_RUNTIME_SPECIFIC_MANIFEST,
    'server/route-policy/api-route-policy-registry.ts': API_ROUTE_POLICY_REGISTRY,
    'shared/routes/route-governance-registry.ts': ROUTE_GOVERNANCE_REGISTRY,
  };
  for (const [file, value] of Object.entries(registryExports)) {
    const fingerprintPath = `${file}#normalized-runtime-export`;
    sourceHashesMap[fingerprintPath] = sha256(JSON.stringify(stableJson(value)));
    sourceMembership['normalized-registry-exports'] = [
      ...(sourceMembership['normalized-registry-exports'] ?? []),
      fingerprintPath,
    ];
  }
  sourceMembership['kg-snapshot'] = [snapshotId];
  return {
    sourceHashesMap: mergeManifestSourceHashes(sourceHashesMap, manifestSourceHashes),
    sourceMembership,
  };
};

const definingSourceHashesForRow = (row, sourceHashesMap, rowToSources = {}) => {
  const values = [];
  const mapping = row.source_mapping ?? {};
  const dependentSources = new Set(rowToSources[row.id] ?? []);
  const explicitSources = [
    mapping.function_file,
    mapping.candidate_path,
    mapping.source_file,
    mapping.registration,
  ].filter(Boolean).map((value) => String(value).split(':')[0]);
  for (const [key, hash] of Object.entries(sourceHashesMap)) {
    if (key.includes('#')) continue;
    if (explicitSources.includes(key)
      || dependentSources.has(key)
      || (row.evidence ?? []).some((evidence) => String(evidence).startsWith(`${key}:`))) {
      values.push(`${key}=${hash}`);
    }
  }
  return values.sort((left, right) => left.localeCompare(right));
};

const applyDefiningSourceHashes = (rows, sourceHashesMap, rowToSources) => {
  for (const row of rows.values()) row.approved_source_hashes = definingSourceHashesForRow(row, sourceHashesMap, rowToSources);
};

const clearUnapprovedSourceHashes = (rows) => {
  for (const row of rows) {
    if (row.decision_status !== 'approved') row.approved_source_hashes = [];
  }
};

const mergeSeededMatrix = (previousDocument, seededDocument) => {
  const matrix = mergeMatrix(previousDocument, seededDocument);
  clearUnapprovedSourceHashes(matrix.rows);
  return matrix;
};

const sourcePathCandidatesForRow = (row) => [
  row.source_mapping?.source_file,
  row.source_mapping?.function_file,
  row.source_mapping?.candidate_path,
  row.source_mapping?.registration,
  row.source_mapping?.source_module ? manifestSourcePath(row.source_mapping.source_module) : undefined,
  ...(row.evidence ?? []),
  ...(row.exposures ?? []).flatMap((exposure) => (exposure.definitions ?? []).map((definition) => definition.site)),
  ...(row.queue_roles?.producers ?? []).map((role) => role.site),
  ...(row.queue_roles?.consumers ?? []).map((role) => role.site),
].flatMap((value) => {
  const text = String(value ?? '');
  return [...trackedSet].filter((filePath) => text === filePath || text.startsWith(`${filePath}:`));
});

const testLayerForPath = (filePath) => filePath.startsWith('tests/e2e/') ? 'e2e'
  : filePath.startsWith('tests/integration/') ? 'integration'
    : filePath.startsWith('tests/smoke/') ? 'smoke' : 'unit';

const derivedTestEvidence = async (rows) => {
  const testsFile = path.join(kgOutDir, 'tests.jsonl');
  if (!fs.existsSync(testsFile)) return;
  const rowsBySource = new Map();
  for (const row of rows.values()) {
    for (const source of sourcePathCandidatesForRow(row)) {
      const ids = rowsBySource.get(source) ?? [];
      ids.push(row.id);
      rowsBySource.set(source, ids);
    }
  }
  const derivedByRow = new Map();
  for await (const edge of jsonLines(testsFile)) {
    if (edge.record !== 'edge' || edge.type !== 'TESTS') continue;
    const testFile = String(edge.source_path ?? '').replace(/\\/g, '/');
    const targetFile = String(edge.to ?? '').replace(/^file:/, '').replace(/\\/g, '/');
    if (!testFile || !targetFile || !trackedSet.has(testFile)) continue;
    for (const rowId of rowsBySource.get(targetFile) ?? []) {
      const row = rows.get(rowId);
      if (!row) continue;
      const entries = derivedByRow.get(rowId) ?? [];
      for (const exposure of row.exposures ?? []) {
        entries.push({
          row: rowId,
          deployment: exposure.deployment,
          runtime: exposure.runtime,
          layer: testLayerForPath(testFile),
          assertion_evidence: `${testFile}:${edge.line_start ?? 1}`,
          assertion_confirmed: false,
          test_file_sha256: sha256(fs.readFileSync(path.join(repoRoot, testFile))),
        });
      }
      derivedByRow.set(rowId, entries);
    }
  }
  for (const row of rows.values()) {
    const entries = derivedByRow.get(row.id) ?? [];
    row.test_evidence = {
      ...row.test_evidence,
      derived: dedupeBy(entries, (entry) => `${entry.row}|${entry.deployment}|${entry.runtime}|${entry.assertion_evidence}`)
        .sort((left, right) => `${left.row}|${left.deployment}|${left.runtime}|${left.assertion_evidence}`.localeCompare(`${right.row}|${right.deployment}|${right.runtime}|${right.assertion_evidence}`)),
    };
  }
};

const mergeOrphanEntries = (left, right) => {
  const byId = new Map();
  for (const orphan of [...left, ...right]) byId.set(canonicalRowId(orphan.id), orphan);
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
};

const pruneStaleDormantOrphans = (orphans, freshRows) => {
  const currentIds = new Set([...freshRows.keys()].map(canonicalRowId));
  return orphans.map((orphan) => {
    const vanished = orphan.vanished_row;
    if (orphan.resolution !== 'unresolved'
      || orphan.decision_status === 'approved'
      || vanished?.interface !== 'dormant-ui'
      || currentIds.has(canonicalRowId(orphan.id))) return orphan;
    const pruned = {
      ...orphan,
      resolution: 'pruned',
      resolution_evidence: 'Mechanical cleanup of stale dormant row from this uncommitted seed lane; no approval was attached.',
      decision_status: orphan.decision_status ?? 'proposed',
    };
    return { ...pruned, resolution_fingerprint: orphanResolutionFingerprint(pruned) };
  });
};

const sourceMappings = ({ rows, commonManifest, runtimeManifest, policyRegistry, governanceRegistry, queueCatalog }) => {
  const sourceToRows = {};
  const rowToSources = {};
  const add = (source, rowId) => {
    if (!source || !rowId) return;
    const sourceRows = sourceToRows[source] ?? [];
    if (!sourceRows.includes(rowId)) sourceRows.push(rowId);
    sourceToRows[source] = sourceRows;
    const rowSources = rowToSources[rowId] ?? [];
    if (!rowSources.includes(source)) rowSources.push(source);
    rowToSources[rowId] = rowSources;
  };
  const authTruthFiles = new Set([...trackedSet].filter((filePath) => AUTH_TRUTH_SOURCE_PATTERNS.some((pattern) =>
    pattern.endsWith('/**') ? filePath.startsWith(pattern.slice(0, -3)) : filePath === pattern)));
  const authTruthDependenciesForRow = (row) => {
    const exposures = row.exposures ?? [];
    const authEvidence = [
      ...(row.auth_evidence ?? []),
      ...exposures.flatMap((exposure) => exposure.auth_evidence ?? []),
    ];
    const roles = row.auth_roles ?? [];
    const protectedAuth = roles.some((role) => role !== 'public')
      || authEvidence.some((entry) => entry.boundary && entry.boundary !== 'public');
    const dependencies = new Set();
    for (const entry of authEvidence) {
      const source = String(entry.file ?? '').replace(/:\d+$/, '');
      if (trackedSet.has(source)) dependencies.add(source);
    }
    if (protectedAuth) {
      for (const source of [
        'shared/auth/effective-roles.ts',
        'server/lib/auth/jwt.ts',
        'server/lib/auth/revocation.ts',
      ]) {
        if (authTruthFiles.has(source)) dependencies.add(source);
      }
    }
    // Every API auth decision evaluates the public-path exemption before its
    // protected branch, so both public and protected API rows depend on this
    // boundary implementation.
    if (row.interface === 'http-api' && (authEvidence.length > 0 || roles.length > 0)
      && authTruthFiles.has('server/lib/public-api-boundary.ts')) {
      dependencies.add('server/lib/public-api-boundary.ts');
    }
    if (row.interface === 'websocket' || authEvidence.some((entry) => String(entry.file ?? '').startsWith('server/websocket/'))) {
      for (const source of authTruthFiles) if (source.startsWith('server/websocket/')) dependencies.add(source);
    }
    return dependencies;
  };
  const policyRowId = (entry) => entry.id?.startsWith('client:')
    ? canonicalRowId(entry.id)
    : canonicalRowId(`api:${entry.method}:${entry.path}`);
  for (const [rowId, row] of rows) {
    for (const source of row.evidence ?? []) add(source.split(':')[0], rowId);
    for (const source of row.source_mapping?.kg_node ? [row.source_mapping.kg_node] : []) add(source, rowId);
    for (const source of row.source_mapping?.function_file ? [row.source_mapping.function_file] : []) add(source, rowId);
    for (const source of row.source_mapping?.candidate_path ? [row.source_mapping.candidate_path] : []) add(source, rowId);
    for (const source of row.source_mapping?.registration ? [row.source_mapping.registration] : []) add(source, rowId);
    for (const source of authTruthDependenciesForRow(row)) add(source, rowId);
  }
  for (const entry of commonManifest) {
    const source = manifestSourcePath(entry.sourceModule);
    for (const row of rows.values()) if (row.interface === 'http-api' && row.source_mapping?.source_module === entry.sourceModule) add(`manifest:${entry.id}`, row.id);
    if (source) add(`manifest-source:${source}`, [...rows.values()].find((row) => row.source_mapping?.source_module === entry.sourceModule)?.id);
  }
  for (const entry of runtimeManifest) {
    const rowIds = entry.id === 'register-routes-websocket-setup'
      ? [...rows.values()]
        .filter((row) => row.interface === 'websocket')
        .map((row) => row.id)
      : [[...rows.values()].find((row) => row.source_mapping?.runtime_specific_ids?.includes(entry.id))?.id]
        .filter(Boolean);
    if (rowIds.length === 0) throw new Error(`Runtime manifest entry has no canonical matrix row: ${entry.id}`);
    for (const rowId of rowIds) add(`runtime-manifest:${entry.id}`, rowId);
    const source = manifestSourcePath(entry.sourceModule);
    for (const rowId of rowIds) if (source) add(`runtime-source:${source}`, rowId);
  }
  for (const entry of policyRegistry) {
    const id = policyRowId(entry);
    if (!rows.has(id)) throw new Error(`Policy registry entry has no canonical matrix row: ${entry.id} -> ${id}`);
    add(`policy:${entry.id}`, id);
  }
  for (const entry of governanceRegistry) {
    const id = canonicalRowId(`client:${entry.path}`);
    if (!rows.has(id)) throw new Error(`Governance registry entry has no canonical matrix row: ${entry.path} -> ${id}`);
    add(`governance:${entry.path}`, id);
  }
  for (const entry of queueCatalog) {
    const rowId = canonicalRowId(`worker:${entry.queueName}`);
    if (rows.has(rowId)) add(`QUEUE_CATALOG:${entry.key}`, rowId);
  }
  for (const values of Object.values(sourceToRows)) values.sort((left, right) => left.localeCompare(right));
  for (const values of Object.values(rowToSources)) values.sort((left, right) => left.localeCompare(right));
  return { sourceToRows, rowToSources };
};

const emptyOrphanDocument = () => [];

const buildRows = ({ kg, runtimeDocuments, listenerDispositions, dormantCandidates, dormantInventory, orphanDocument }) => {
  const runtimeIndex = createRuntimeIndex(runtimeDocuments);
  const rows = new Map();
  const apiRows = makeApiRows({ nodes: kg.nodes, edges: kg.edges, runtimeIndex, snapshotId: kg.manifest.snapshot_id });
  const backgroundRows = makeBackgroundRows(kg.manifest.snapshot_id);
  for (const group of [
    apiRows,
    makeClientRows({ nodes: kg.nodes, snapshotId: kg.manifest.snapshot_id }),
    makeWorkerRows({
      nodes: kg.nodes,
      findings: scanBullmqConstructors({ rootDir: repoRoot }),
      snapshotId: kg.manifest.snapshot_id,
      httpRows: [...apiRows.values()],
      backgroundRows: [...backgroundRows.values()],
    }),
    backgroundRows,
    makeListenerRows({ dispositions: listenerDispositions, snapshotId: kg.manifest.snapshot_id }),
    makeVercelFunctionRows({ snapshotId: kg.manifest.snapshot_id }),
    makeDormantRows({ candidates: dormantCandidates, inventory: dormantInventory }),
  ]) {
    for (const [id, row] of group) {
      const current = rows.get(id);
      if (!current) rows.set(id, row);
      else {
        current.exposures = [...current.exposures, ...row.exposures];
        current.evidence = sortedUnique([...current.evidence, ...row.evidence]);
        current.queue_roles = {
          producers: [...current.queue_roles.producers, ...row.queue_roles.producers],
          consumers: [...current.queue_roles.consumers, ...row.queue_roles.consumers],
        };
        current.contract_fingerprint = contractFingerprint(current);
      }
    }
  }
  addOrphanRows(rows, orphanDocument, kg.manifest.snapshot_id);
  return rows;
};

const seed = async () => {
  const kg = await readKnowledgeGraph();
  const bootProofDocument = BootProofDocumentSchema.parse(readJson(bootProofPath, undefined));
  const gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot }).toString().trim();
  assertBootProofSourceSha(bootProofDocument, kg.manifest, gitHead);
  const candidates = discoverHttpListenerCandidates({ rootDir: repoRoot });
  const previousListenerDispositions = readJson(listenerDispositionPath, []);
  const listenerDispositions = mergeListenerDispositions(
    previousListenerDispositions,
    makeListenerDispositions(candidates),
    candidates,
  );
  const dormantCandidates = discoverDormantCandidates({ rootDir: repoRoot });
  const previousDormantCandidates = readJson(dormantCandidatesPath, []);
  const mergedDormantCandidates = mergeDormantCandidates(previousDormantCandidates, dormantCandidates);
  const dormantInventory = readJson(dormantInventoryPath, {
    schema_version: '1.0.0',
    entries: [{
      path: 'client/src/components/investments/portfolio-company-detail.tsx',
      disposition: 'promote',
      evidence: 'Known dead-wired edit surface from WS3 inventory.',
    }],
  });
  for (const entry of dormantInventory.entries ?? []) {
    if (!entry.path || !trackedSet.has(entry.path)) {
      throw new Error(`Curated dormant inventory path is not a tracked file: ${entry.path}`);
    }
  }
  const previous = readJson(matrixPath, undefined);
  const orphanDocument = mergeOrphanEntries(readJson(orphansPath, emptyOrphanDocument()), []);
  const runtimeDocuments = collectRuntimeDocuments();
  const rows = buildRows({
    kg,
    runtimeDocuments,
    listenerDispositions,
    dormantCandidates: mergedDormantCandidates,
    dormantInventory,
    orphanDocument,
  });
  applyInternalOnlyDefaults(rows);
  applyBootProofs(rows, bootProofDocument);
  const hashes = sourceHashes({
    nodes: kg.nodes,
    snapshotId: kg.manifest.snapshot_id,
    manifestSourceHashes: kg.manifest.source_hashes,
  });
  const definingMappings = sourceMappings({
    rows,
    commonManifest: COMMON_API_ROUTE_MANIFEST,
    runtimeManifest: API_RUNTIME_SPECIFIC_MANIFEST,
    policyRegistry: API_ROUTE_POLICY_REGISTRY,
    governanceRegistry: ROUTE_GOVERNANCE_REGISTRY,
    queueCatalog: QUEUE_CATALOG,
  });
  applyDefiningSourceHashes(rows, hashes.sourceHashesMap, definingMappings.rowToSources);
  // KG TESTS edges are import-level evidence only. They seed derived[] with
  // assertion_confirmed:false; classification or G1 review must confirm any
  // item before it can satisfy an exposure coverage gate.
  await derivedTestEvidence(rows);
  const prunedOrphans = pruneStaleDormantOrphans(orphanDocument, rows);
  const seededDocument = SurfaceMatrixDocumentSchema.parse({
    schema_version: MATRIX_SCHEMA_VERSION,
    phase: previous?.phase === 'closed' ? 'closed' : 'authoring',
    provenance: {
      git_head: kg.manifest.repo_head || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot }).toString().trim(),
      snapshot_id: kg.manifest.snapshot_id,
    },
    rows: [...rows.values()].sort((left, right) => left.id.localeCompare(right.id)),
    coverage_review: {},
  });
  const previousForMerge = previous ? { ...previous, orphans: prunedOrphans } : undefined;
  const matrix = mergeSeededMatrix(previousForMerge || SurfaceMatrixDocumentSchema.parse({
    schema_version: MATRIX_SCHEMA_VERSION,
    phase: 'authoring',
    provenance: seededDocument.provenance,
    rows: [],
    coverage_review: {},
  }), seededDocument);
  const matrixArtifact = { ...matrix };
  delete matrixArtifact.orphans;
  const mappings = sourceMappings({
    rows: new Map(matrix.rows.map((row) => [row.id, row])),
    commonManifest: COMMON_API_ROUTE_MANIFEST,
    runtimeManifest: API_RUNTIME_SPECIFIC_MANIFEST,
    policyRegistry: API_ROUTE_POLICY_REGISTRY,
    governanceRegistry: ROUTE_GOVERNANCE_REGISTRY,
    queueCatalog: QUEUE_CATALOG,
  });
  const inventory = {
    schema_version: SOURCE_INVENTORY_SCHEMA_VERSION,
    snapshot_id: kg.manifest.snapshot_id,
    row_ids: matrix.rows.map((row) => row.id).sort((left, right) => left.localeCompare(right)),
    source_hashes: hashes.sourceHashesMap,
    source_to_rows: mappings.sourceToRows,
    row_to_sources: mappings.rowToSources,
    source_membership: hashes.sourceMembership,
    kg_counts: kg.manifest.node_type_counts,
    runtime_observation_profiles: allProfiles(),
    listener_candidate_paths: candidates.map((candidate) => candidate.path).sort((left, right) => left.localeCompare(right)),
  };

  writeJson(listenerDispositionPath, listenerDispositions);
  writeJson(dormantCandidatesPath, mergedDormantCandidates);
  writeJson(dormantInventoryPath, dormantInventory);
  writeJson(runtimeExclusionsPath, mergeRuntimeExclusions(
    readJson(runtimeExclusionsPath, []),
    makeRuntimeExclusions(),
  ));
  writeJson(conditionOverridesPath, readJson(conditionOverridesPath, {}));
  writeJson(definitionOverridesPath, readJson(definitionOverridesPath, {}));
  writeJson(orphansPath, matrix.orphans ?? []);
  writeJson(inventoryPath, inventory);
  writeJson(matrixPath, matrixArtifact);

  const counts = {};
  for (const row of matrix.rows) counts[row.interface] = (counts[row.interface] || 0) + 1;
  process.stderr.write(`${JSON.stringify({
    snapshot_id: kg.manifest.snapshot_id,
    row_counts: counts,
    kg_expected: kg.manifest.node_type_counts,
    listener_candidates: candidates.length,
    listener_dispositions: listenerDispositions.length,
    listener_product_routes: [...rows.values()].filter((row) => row.seam === 'worker-health' || row.seam === 'ml-reserve').length,
    pages_v2: [...rows.values()].filter((row) => row.id.includes('pages/v2/')).length,
    schedulers: [...rows.values()].filter((row) => row.interface === 'scheduler').length,
    event_handlers: [...rows.values()].filter((row) => row.interface === 'event-handler').length,
    websockets: [...rows.values()].filter((row) => row.interface === 'websocket').length,
  }, null, 2)}\n`);
};

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('seed-matrix.mjs')) {
  seed().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

export { seed };
