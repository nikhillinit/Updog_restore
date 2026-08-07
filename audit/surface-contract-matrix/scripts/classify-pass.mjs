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
 * Persistence rule: handler-effect evidence decides. PERSISTS_TO/db-write
 * edges along a handler chain prove writes. Missing edges do not prove
 * reads-only; only explicit pure-calculation evidence with no side-effecting
 * calls can classify a mutation route as reads-only. Destructive rule: DELETE
 * is destructive only with hard-delete evidence; soft archive/revoke is soft,
 * and otherwise remains unknown. Background interfaces use the same evidence
 * path; no interface receives a blanket writes classification.
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
const knowledgeGraphOutDir = path.join(repoRoot, 'audit', 'knowledge-graph', 'out');
const effectGraphFiles = ['coding-edges.jsonl', 'edges-routes.jsonl'];

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const readJsonLinesIfPresent = (file) => {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
};
const writeJsonAtomic = (file, value) => {
  const temporary = `${file}.classify.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
};
const sortedUnique = (values) => [...new Set(values)].sort((left, right) => left.localeCompare(right));
const dedupeBy = (values, keyFor) => {
  const seen = new Set();
  return values.filter((value) => {
    const key = keyFor(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
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

const graphReference = (value) => {
  let reference = String(value ?? '').replaceAll('\\', '/');
  if (reference.startsWith('file:')) reference = reference.slice('file:'.length);
  if (reference.startsWith('sym:')) reference = reference.slice('sym:'.length);
  if (reference.startsWith('api:') || reference.startsWith('dbtable:')) return undefined;
  const hashIndex = reference.indexOf('#');
  const symbol = hashIndex >= 0 ? reference.slice(hashIndex + 1) : undefined;
  if (hashIndex >= 0) reference = reference.slice(0, hashIndex);
  const lineMatch = reference.match(/^(.*?):\d+(?:\b|$)/);
  if (lineMatch) reference = lineMatch[1];
  if (!reference.includes('/') || !/\.[A-Za-z0-9]+$/.test(reference)) return undefined;
  return { source: reference, ...(symbol ? { symbol } : {}) };
};

const referenceKey = (reference) => reference?.symbol
  ? `${reference.source}#${reference.symbol}`
  : reference?.source;
const referenceText = (reference) => reference?.symbol
  ? `${reference.source}#${reference.symbol}`
  : reference?.source;
const normalizeReference = (value) => value && typeof value === 'object' && typeof value.source === 'string'
  ? value
  : graphReference(value);
const uniqueReferences = (values) => {
  const references = [...new Map(values
  .map(normalizeReference)
  .filter(Boolean)
  .map((reference) => [referenceKey(reference), reference])).values()];
  const symbolSources = new Set(references.filter((reference) => reference.symbol).map((reference) => reference.source));
  return references
    .filter((reference) => reference.symbol || !symbolSources.has(reference.source))
    .sort((left, right) => referenceKey(left).localeCompare(referenceKey(right)));
};
const rowDefinitionReference = (definition) => graphReference(definition?.site)
  || graphReference(definition?.file);

const rowEffectRoots = (row) => uniqueReferences([
  ...(!['worker-job', 'scheduler', 'event-handler', 'websocket'].includes(row.interface)
    ? (row.exposures ?? []).flatMap((exposure) => (exposure.definitions ?? [])
      .filter((definition) => definition.role === 'handler')
      .map(rowDefinitionReference))
    : []),
  row.source_mapping?.function_file,
  row.source_mapping?.source_file,
  row.source_mapping?.handler_file,
  ...(row.interface === 'worker-job'
    ? (row.queue_roles?.consumers ?? []).map((entry) => entry.site)
    : ['scheduler', 'event-handler', 'websocket'].includes(row.interface) ? [] : row.evidence ?? []),
  ...(row.interface !== 'worker-job' ? [row.seam] : []),
]);

const rowHandlerRoots = (row) => uniqueReferences([
  ...(row.exposures ?? []).flatMap((exposure) => (exposure.definitions ?? [])
    .filter((definition) => definition.role === 'handler')
    .map(rowDefinitionReference)),
  row.source_mapping?.handler_file,
  ...(row.interface === 'worker-job'
    ? (row.queue_roles?.consumers ?? []).map((entry) => entry.site)
    : []),
  ...(['scheduler', 'event-handler', 'websocket'].includes(row.interface)
    ? [row.source_mapping?.source_file]
    : []),
]);

const canonicalGraphRowId = (value) => {
  if (!String(value ?? '').startsWith('api:')) return undefined;
  try {
    return canonicalRowId(value);
  } catch {
    return undefined;
  }
};

const graphSource = (edge) => graphReference(edge.from) || graphReference(edge.source_path);
const graphTarget = (edge) => graphReference(edge.to);
const graphTargetRange = (edge) => {
  const candidate = edge.target_range ?? edge.to_range;
  const start = Number.isInteger(candidate?.start)
    ? candidate.start
    : edge.target_line_start ?? edge.to_line_start ?? edge.target_line;
  if (!Number.isInteger(start)) return undefined;
  const end = Number.isInteger(candidate?.end)
    ? candidate.end
    : edge.target_line_end ?? edge.to_line_end ?? start;
  return { start, end };
};

const routeDefinitionRanges = (edges) => {
  const ranges = new Map();
  for (const edge of edges) {
    if (edge.type !== 'DEFINES') continue;
    const rowId = canonicalGraphRowId(edge.to);
    const source = graphSource(edge);
    if (!rowId || !source || !Number.isInteger(edge.line_start)) continue;
    const entries = ranges.get(rowId) ?? [];
    entries.push({
      source: source.source,
      symbol: source.symbol,
      start: edge.line_start,
      end: Number.isInteger(edge.line_end) ? edge.line_end : edge.line_start,
    });
    ranges.set(rowId, entries);
  }
  return ranges;
};

const sourceTextForRange = (sourcePath, range) => {
  if (!sourcePath) return '';
  const absolutePath = path.join(repoRoot, sourcePath);
  if (!fs.existsSync(absolutePath)) return '';
  const lines = fs.readFileSync(absolutePath, 'utf8').split('\n');
  if (!range) return lines.join('\n');
  return lines.slice(Math.max(0, range.start - 1), range.end).join('\n');
};

const graphEffectIndex = (edges) => {
  const callsBySource = new Map();
  const callsBySymbol = new Map();
  const writesBySource = new Map();
  const writesBySymbol = new Map();
  const symbolDefinitionRanges = new Map();
  const symbolEffectSources = new Set();
  for (const edge of edges) {
    const source = graphSource(edge);
    const targetReference = graphTarget(edge);
    if (edge.type === 'DEFINES' && source && targetReference?.symbol && Number.isInteger(edge.line_start)) {
      const ranges = symbolDefinitionRanges.get(referenceKey(targetReference)) ?? [];
      ranges.push({
        source: source.source,
        symbol: targetReference.symbol,
        start: edge.line_start,
        end: Number.isInteger(edge.line_end) ? edge.line_end : edge.line_start,
      });
      symbolDefinitionRanges.set(referenceKey(targetReference), ranges);
    }
    if (source && isWriteEdge(edge)) {
      if (source.symbol) symbolEffectSources.add(source.source);
      const index = source.symbol ? writesBySymbol : writesBySource;
      const key = source.symbol ? referenceKey(source) : source.source;
      const writes = index.get(key) ?? [];
      writes.push(edge);
      index.set(key, writes);
    }
    if (edge.type !== 'CALLS') continue;
    if (!source || !targetReference) continue;
    const index = source.symbol ? callsBySymbol : callsBySource;
    if (source.symbol) symbolEffectSources.add(source.source);
    const key = source.symbol ? referenceKey(source) : source.source;
    const calls = index.get(key) ?? [];
    calls.push({
      edge,
      source,
      target: targetReference,
      targetSource: targetReference.source,
      targetSymbol: targetReference.symbol,
      targetRange: graphTargetRange(edge),
    });
    index.set(key, calls);
  }
  return {
    callsBySource,
    callsBySymbol,
    writesBySource,
    writesBySymbol,
    definitionRanges: routeDefinitionRanges(edges),
    symbolDefinitionRanges,
    symbolEffectSources,
  };
};

const isWriteEdge = (edge) => {
  const type = String(edge.type ?? '').toUpperCase().replaceAll('-', '_');
  return type === 'PERSISTS_TO' || type === 'DB_WRITE';
};

const HARD_SIDE_EFFECT_PATTERN = /(?:database|dbtable|storage|repository|redis|cache|queue|enqueue|publish|send|fetch|axios|filesystem|file-system|fs\.|write|insert|update|delete|remove|archive|revoke|transaction)/i;
const HARMLESS_CALL_SYMBOLS = new Set([
  'apiError',
  'authenticateHealthDiagnostics',
  'createErrorBody',
  'error',
  'errorHandler',
  'handlePreconditionError',
  'info',
  'log',
  'logger',
  'metricsMiddleware',
  'recordHttpMetrics',
  'requestLoggingMiddleware',
  'requireApiAuth',
  'requireAuth',
  'requireHealthKeyOrAuth',
  'requireLPAccess',
  'requireLPFundAccess',
  'requireSecureContext',
  'warn',
]);

const callSymbolName = (value) => String(value ?? '')
  .replace(/^sym:/, '')
  .split('#').pop()
  .split(/::|[./]/).pop()
  .replace(/[^A-Za-z0-9_$].*$/, '');

const isSideEffectingCall = ({ edge, target }) => {
  const targetValue = typeof target === 'object' ? referenceText(target) : target;
  const text = `${targetValue ?? ''} ${edge.to ?? ''} ${edge.call_name ?? ''} ${edge.callee ?? ''}`;
  if (HARD_SIDE_EFFECT_PATTERN.test(text)) return true;
  const knownHarmless = [
    targetValue,
    edge.to,
    edge.call_name,
    edge.callee,
    edge.symbol,
  ].some((value) => HARMLESS_CALL_SYMBOLS.has(callSymbolName(value)));
  if (knownHarmless) return false;
  // Non-hard, non-whitelisted calls are not positive side-effect evidence;
  // traversal completeness still prevents them from proving purity alone.
  return false;
};

const pureCalculationSource = (source) => /(?:calculat|comput|analys|forecast|metric|cohort|normalize|transform|aggregate|summar)/i.test(source)
  && !/(?:\bdb\b|database|storage|repository|redis|cache|queue|enqueue|publish|send|fetch|axios|filesystem|\bfs\b|\.write|\.insert|\.update|\.delete|archive|revoke|transaction)/i.test(source);

const sourceCallNames = (source) => {
  const sourceText = String(source ?? '');
  return [...sourceText.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)]
    .filter((match) => !/function\s*$/.test(sourceText.slice(0, match.index).slice(-24)))
    .map((match) => match[1])
    .filter((name) => !['if', 'for', 'while', 'switch', 'catch'].includes(name));
};

const effectEvidenceForRow = (row, effectEdges, effectIndex) => {
  if (row.interface === 'dormant-ui' || row.interface === 'client-route') {
    return { writes: [], side_effecting_calls: [], pure_calculation: [], hard_delete: [], soft_archive: [], ambiguous_calls: [], handlers: [] };
  }
  const ranges = effectIndex.definitionRanges.get(row.id) ?? [];
  const promoteRowSymbol = (reference) => {
    if (reference?.symbol) return reference;
    const symbols = [...new Set(ranges
      .filter((range) => range.source === reference?.source && range.symbol)
      .map((range) => range.symbol))];
    return symbols.length === 1 ? { source: reference.source, symbol: symbols[0] } : reference;
  };
  const roots = rowEffectRoots(row).map(promoteRowSymbol);
  const handlerRoots = rowHandlerRoots(row).map(promoteRowSymbol);
  const requiresSymbolIdentity = (reference, rangeOverride) => !reference?.symbol
    && !rangeOverride
    && !ranges.some((range) => range.source === reference?.source && !range.symbol)
    && (effectIndex.symbolEffectSources.has(reference?.source)
      || ranges.some((range) => range.source === reference?.source && range.symbol));
  const rangeForReference = (reference, rangeOverride) => rangeOverride
    || ranges.find((range) => range.source === reference?.source
      && (!reference.symbol ? !range.symbol : range.symbol === reference.symbol))
    || (reference?.symbol ? effectIndex.symbolDefinitionRanges.get(referenceKey(reference))?.[0] : undefined);
  const writesForReference = (reference, rangeOverride) => {
    if (requiresSymbolIdentity(reference, rangeOverride)) return [];
    const writes = reference?.symbol
      ? effectIndex.writesBySymbol.get(referenceKey(reference)) ?? []
      : effectIndex.writesBySource.get(reference?.source) ?? [];
    return rangeOverride
      ? writes.filter((edge) => Number.isInteger(edge.line_start)
        && edge.line_start >= rangeOverride.start
        && edge.line_start <= rangeOverride.end)
      : writes;
  };
  const callsForReference = (reference, rangeOverride) => {
    if (requiresSymbolIdentity(reference, rangeOverride)) return [];
    const calls = reference?.symbol
      ? effectIndex.callsBySymbol.get(referenceKey(reference)) ?? []
      : effectIndex.callsBySource.get(reference?.source) ?? [];
    return rangeOverride
      ? calls.filter((call) => Number.isInteger(call.edge.line_start)
        && call.edge.line_start >= rangeOverride.start
        && call.edge.line_start <= rangeOverride.end)
      : calls;
  };
  const queue = roots.map((reference) => ({ reference }));
  const visited = new Map();
  const writes = [];
  const sideEffectingCalls = [];
  const ambiguousCalls = [];
  const handlers = [];
  while (queue.length > 0) {
    const { reference: source, rangeOverride } = queue.shift();
    const sourceKey = referenceKey(source);
    const visitKey = `${sourceKey}|${rangeOverride?.start ?? ''}-${rangeOverride?.end ?? ''}`;
    if (!source || !sourceKey || visited.has(visitKey)) continue;
    visited.set(visitKey, { reference: source, rangeOverride });
    const range = rangeForReference(source, rangeOverride);
    handlers.push(source);
    for (const edge of writesForReference(source, rangeOverride)) {
      if (range && (!Number.isInteger(edge.line_start)
        || edge.line_start < range.start || edge.line_start > range.end)) continue;
      writes.push({
        kind: 'handler-effect',
        effect: 'writes',
        edge_type: edge.type,
        file: referenceText(source),
        line: edge.line_start,
        target: edge.to,
        evidence: `${referenceText(source)}:${edge.line_start ?? 1} ${edge.type} -> ${edge.to}`,
      });
    }
    for (const call of callsForReference(source, rangeOverride)) {
      if (range && (!Number.isInteger(call.edge.line_start)
        || call.edge.line_start < range.start || call.edge.line_start > range.end)) continue;
      if (isSideEffectingCall(call)) sideEffectingCalls.push({
        kind: 'handler-effect',
        effect: 'side-effecting-call',
        file: referenceText(source),
        line: call.edge.line_start,
        target: call.edge.to,
        evidence: `${referenceText(source)}:${call.edge.line_start ?? 1} CALLS ${call.edge.to}`,
      });
      // Caller scope cannot make an unbounded file-only target safe: without
      // target identity, traversal would associate every effect in that file.
      if (!call.target.symbol && !call.targetRange) {
        ambiguousCalls.push({
          kind: 'handler-effect',
          effect: 'ambiguous-call-target',
          file: referenceText(source),
          line: call.edge.line_start,
          target: call.edge.to,
          evidence: `${referenceText(source)}:${call.edge.line_start ?? 1} CALLS file-only target without symbol/range identity`,
        });
        continue;
      }
      queue.push({ reference: call.target, rangeOverride: call.targetRange });
    }
  }

  const handlerRange = handlerRoots.map((root) => rangeForReference(root)).find(Boolean);
  const visitedReference = (reference) => [...visited.values()]
    .some((entry) => referenceKey(entry.reference) === referenceKey(reference));
  const traversedHandler = handlerRoots.some((root) => rangeForReference(root)
    && visitedReference(root));
  const handlerSource = handlerRange ? sourceTextForRange(handlerRange.source, handlerRange) : handlerRoots
    .filter((root) => visitedReference(root))
    .map((root) => sourceTextForRange(root.source, rangeForReference(root)))
    .join('\n');
  // A calculation keyword is only useful after every syntactic call in the
  // traversed handler chain has a corresponding KG CALLS edge. This keeps
  // an incomplete graph from turning an unexamined helper into read-only
  // proof.
  const callTraversalComplete = ambiguousCalls.length === 0
    && traversedHandler
    && [...visited.values()].every(({ reference: source, rangeOverride }) => {
    if (!source) return false;
    if (requiresSymbolIdentity(source, rangeOverride)) return false;
    const sourceRange = rangeForReference(source, rangeOverride);
    const sourceText = sourceTextForRange(source.source, sourceRange);
    const syntacticCalls = sourceCallNames(sourceText);
    const traversedCalls = callsForReference(source, rangeOverride).filter((call) => {
      if (!sourceRange) return true;
      return Number.isInteger(call.edge.line_start)
        && call.edge.line_start >= sourceRange.start
        && call.edge.line_start <= sourceRange.end;
    });
    const unmatched = [...traversedCalls];
    for (const name of syntacticCalls) {
      const targetName = (call) => call.targetSymbol?.split(/::|[./]/).pop()
        || call.edge.call_name
        || call.edge.callee
        || call.edge.symbol;
      const matchIndex = unmatched.findIndex((call) => {
        const candidateName = targetName(call);
        // File-level edges may reconcile one call when KG has no symbol
        // identity. Symbol-bearing calls must match each syntactic call by
        // callee name; count-only association would leak sibling effects.
        return candidateName ? candidateName === name : (!source.symbol || call.targetRange) && unmatched.length === 1;
      });
      if (matchIndex < 0) return false;
      unmatched.splice(matchIndex, 1);
    }
    return unmatched.length === 0;
  });
  const pureCalculation = writes.length === 0
    && sideEffectingCalls.length === 0
    && callTraversalComplete
    && pureCalculationSource(handlerSource)
    ? [{
      kind: 'handler-effect',
      effect: 'pure-calculation',
      file: handlerRange?.source ?? handlerRoots[0]?.source,
      line: handlerRange?.start,
      evidence: 'handler source is calculation-oriented and has no side-effecting calls',
    }]
    : [];
  const hardDelete = [];
  const softArchive = [];
  // Syntax-based destructive evidence is valid only for an exact symbol
  // definition range or a row-bounded file handler. Never scan whole files:
  // sibling handlers may contain unrelated delete/archive operations.
  const deletionSource = handlerRange ? sourceTextForRange(handlerRange.source, handlerRange) : '';
  if (/(?:\bdelete\s+from\b|(?<!router)\.\s*delete\s*\(|\bhard[- ]delete\b|\bdestroy\s*\()/i.test(deletionSource)) {
    hardDelete.push({ kind: 'handler-effect', effect: 'hard-delete', file: handlerRange?.source ?? handlerRoots[0]?.source, line: handlerRange?.start, evidence: 'handler contains hard-delete operation' });
  }
  if (/(?:soft[- ]archive|\b(?:archive|revoke|mark[A-Za-z]*Revoked)\s*\(|isActive\s*:\s*false|deletedAt\s*:)/i.test(deletionSource)) {
    softArchive.push({ kind: 'handler-effect', effect: 'soft-archive', file: handlerRange?.source ?? handlerRoots[0]?.source, line: handlerRange?.start, evidence: 'handler contains archive/revoke state transition' });
  }
  return {
    writes: dedupeBy(writes, (entry) => JSON.stringify(entry)),
    side_effecting_calls: dedupeBy(sideEffectingCalls, (entry) => JSON.stringify(entry)),
    pure_calculation: pureCalculation,
    hard_delete: hardDelete,
    soft_archive: softArchive,
    ambiguous_calls: dedupeBy(ambiguousCalls, (entry) => JSON.stringify(entry)),
    handlers: sortedUnique(handlers.map(referenceText).filter(Boolean)),
  };
};

const loadHandlerEffectEdges = () => effectGraphFiles.flatMap((file) => readJsonLinesIfPresent(path.join(knowledgeGraphOutDir, file)))
  .filter((entry) => entry?.record === 'edge');

const persistenceForRow = (row, effectEvidence) => {
  if (row.interface === 'dormant-ui') return 'unknown';
  if (row.interface === 'client-route') return 'reads-only';
  if ((effectEvidence?.writes ?? []).length > 0) return 'writes';
  if ((effectEvidence?.pure_calculation ?? []).length > 0
    && (effectEvidence?.side_effecting_calls ?? []).length === 0) return 'reads-only';
  return 'unknown';
};

const destructiveForRow = (row, persistence, effectEvidence) => {
  if ((effectEvidence?.hard_delete ?? []).length > 0) return 'destructive';
  if ((effectEvidence?.soft_archive ?? []).length > 0) return 'soft';
  if (persistence === 'reads-only') return 'none';
  if (persistence === 'unknown') return 'unknown';
  if (methodForRow(row) === 'DELETE') return 'unknown';
  return 'soft';
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
  // Persistence/destructive suggestions from the old method heuristic are not
  // decision evidence. Recompute both from the current handler-effect graph.
  next.persistence = 'unknown';
  next.destructive = 'unknown';
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

export function classifyDocument(document, { dockerIds = new Set(), effectEdges = loadHandlerEffectEdges() } = {}) {
  const discoveredRoles = discoverAuthRoleEvidence({ rootDir: repoRoot });
  assertAuthRoleMappingExhaustive(discoveredRoles.roles);
  const seeded = SurfaceMatrixDocumentSchema.parse(document);
  const merged = mergeMatrix(seeded, seeded);
  const effectIndex = graphEffectIndex(effectEdges);
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
    const effectEvidence = effectEvidenceForRow(row, effectEdges, effectIndex);
    const persistence = persistenceForRow(row, effectEvidence);
    if (row.persistence === 'unknown') row.persistence = persistence;
    const destructive = destructiveForRow(row, row.persistence, effectEvidence);
    if (row.destructive === 'unknown') row.destructive = destructive;
    row.machine_suggestions = {
      ...row.machine_suggestions,
      persistence: row.persistence,
      persistence_evidence: effectEvidence,
      destructive: row.destructive,
    };
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
