import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL, fileURLToPath } from 'node:url';

import {
  AUTH_IDENTITY_PERSONA_MAPPING,
  AUTH_ROLE_PERSONA_MAPPING,
  DormantCandidatesSchema,
  OrphansSchema,
  RequirementsDocumentSchema,
  RuntimeExclusionsSchema,
  ListenerDispositionsSchema,
  SurfaceMatrixDocumentSchema,
  SourceInventorySchema,
  canonicalRowId,
  contractFingerprint,
  absenceEvidenceFingerprint,
  discoverDormantCandidates,
  discoverHttpListenerCandidates,
  dormantCandidateFingerprint,
  listenerDispositionFingerprint,
  orphanResolutionFingerprint,
  runtimeExclusionFingerprint,
  scanBullmqConstructors,
} from '../matrix-schema.mjs';

const thisFile = fileURLToPath(import.meta.url);
export const matrixDir = path.resolve(path.dirname(thisFile), '..');
export const repoRoot = path.resolve(matrixDir, '../..');
const kgDir = path.join(repoRoot, 'audit/knowledge-graph/out');
const matrixFile = path.join(matrixDir, 'matrix.json');
const inventoryFile = path.join(matrixDir, 'source-inventory.json');
const requirementsFile = path.join(matrixDir, 'requirements.json');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableValue(entry)]));
  }
  return value;
};
const stableJson = (value) => JSON.stringify(stableValue(value));
const repoPath = (value) => value.split(path.sep).join('/');
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const trackedFiles = () => execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot })
  .toString().split('\0').filter(Boolean).map(repoPath).sort((left, right) => left.localeCompare(right));

const fail = (messages) => {
  if (messages.length > 0) throw new Error(messages.join('\n'));
};

const fileMatches = (filePath, pattern) => {
  const normalized = repoPath(filePath);
  if (pattern === 'server/routes/**/*.ts') return normalized.startsWith('server/routes/') && normalized.endsWith('.ts');
  if (pattern === 'api/**/*.ts') return normalized.startsWith('api/') && normalized.endsWith('.ts');
  if (pattern === 'workers/**') return normalized.startsWith('workers/');
  if (pattern === 'server/workers/**') return normalized.startsWith('server/workers/');
  if (pattern === 'ml-service/**') return normalized.startsWith('ml-service/');
  return false;
};

const excludedSource = (filePath) => /(?:^|\/)(?:__tests__|tests?|specs?|fixtures?)(?:\/|$)/i.test(filePath)
  || /\.(?:test|spec|stories)\.[^.]+$/i.test(filePath);

const sourcePathForHash = (key) => key.includes('#') ? key.slice(0, key.indexOf('#')) : key;

const registryModules = {
  'shared/routes/api-route-manifest.ts#normalized-runtime-export': ['shared/routes/api-route-manifest.ts', 'COMMON_API_ROUTE_MANIFEST'],
  'shared/routes/api-runtime-specific-manifest.ts#normalized-runtime-export': ['shared/routes/api-runtime-specific-manifest.ts', 'API_RUNTIME_SPECIFIC_MANIFEST'],
  'server/route-policy/api-route-policy-registry.ts#normalized-runtime-export': ['server/route-policy/api-route-policy-registry.ts', 'API_ROUTE_POLICY_REGISTRY'],
  'shared/routes/route-governance-registry.ts#normalized-runtime-export': ['shared/routes/route-governance-registry.ts', 'ROUTE_GOVERNANCE_REGISTRY'],
};

async function recomputeSourceHashes(inventory) {
  const hashes = {};
  const packageData = readJson(path.join(repoRoot, 'package.json'));
  for (const [key] of Object.entries(inventory.source_hashes)) {
    if (key.startsWith('snapshot:')) {
      hashes[key] = key;
      continue;
    }
    if (key === 'package.json#scripts') {
      hashes[key] = sha256(stableJson(Object.fromEntries(
        Object.entries(packageData.scripts ?? {}).sort(([left], [right]) => left.localeCompare(right)),
      )));
      continue;
    }
    if (registryModules[key]) {
      const [relativePath, exportName] = registryModules[key];
      const moduleUrl = pathToFileURL(path.join(repoRoot, relativePath)).href;
      const imported = await import(moduleUrl);
      hashes[key] = sha256(stableJson(imported[exportName]));
      continue;
    }
    const sourcePath = sourcePathForHash(key);
    const absolutePath = path.join(repoRoot, sourcePath);
    if (!fs.existsSync(absolutePath)) throw new Error(`Source-hash file is missing: ${sourcePath}`);
    hashes[key] = sha256(fs.readFileSync(absolutePath));
  }
  return hashes;
}

const validateSourceHashes = async (inventory, errors) => {
  const actual = await recomputeSourceHashes(inventory);
  for (const [key, expected] of Object.entries(inventory.source_hashes)) {
    if (actual[key] !== expected) errors.push(`source hash mismatch: ${key}`);
  }
  for (const [category, files] of Object.entries(inventory.source_membership ?? {})) {
    for (const file of files) {
      if (file.startsWith('snapshot:')) {
        if (file !== inventory.snapshot_id) errors.push(`membership snapshot mismatch: ${file}`);
        continue;
      }
      const sourcePath = sourcePathForHash(file);
      if (!fs.existsSync(path.join(repoRoot, sourcePath))) errors.push(`membership missing (${category}): ${file}`);
      if (!inventory.source_hashes[file]) errors.push(`membership has no source hash (${category}): ${file}`);
    }
  }
  const tracked = trackedFiles();
  for (const [category, files] of Object.entries(inventory.source_membership ?? {})) {
    if (!category.startsWith('universe:')) continue;
    const pattern = category.slice('universe:'.length);
    const expected = tracked.filter((file) => fileMatches(file, pattern) && !excludedSource(file));
    if (stableJson(files) !== stableJson(expected)) errors.push(`universe membership mismatch: ${category}`);
  }
  const clientV2 = tracked.filter((file) => file.startsWith('client/src/pages/v2/'));
  if (stableJson(inventory.source_membership?.['client-pages-v2'] ?? []) !== stableJson(clientV2)) errors.push('client-pages-v2 membership mismatch');
};

const validateMappings = (document, inventory, errors) => {
  const rowIds = document.rows.map((row) => canonicalRowId(row.id));
  const unique = new Set(rowIds);
  if (unique.size !== rowIds.length) errors.push('matrix contains duplicate canonical ids');
  const inventoryIds = [...inventory.row_ids].sort((left, right) => left.localeCompare(right));
  const sortedRowIds = [...unique].sort((left, right) => left.localeCompare(right));
  if (stableJson(inventoryIds) !== stableJson(sortedRowIds)) errors.push('matrix and source-inventory row id sets differ');
  const reverse = {};
  for (const [source, ids] of Object.entries(inventory.source_to_rows ?? {})) {
    for (const id of ids) {
      if (!unique.has(canonicalRowId(id))) errors.push(`source-to-row references missing row: ${source} -> ${id}`);
      reverse[id] = [...(reverse[id] ?? []), source];
    }
  }
  for (const [id, sources] of Object.entries(inventory.row_to_sources ?? {})) {
    if (!unique.has(canonicalRowId(id))) errors.push(`row-to-source references missing row: ${id}`);
    const expected = [...new Set(reverse[id] ?? [])].sort((left, right) => left.localeCompare(right));
    const actual = [...new Set(sources)].sort((left, right) => left.localeCompare(right));
    if (stableJson(expected) !== stableJson(actual)) errors.push(`source mapping is not bidirectional for ${id}`);
  }
};

const validateRegistryMappings = ({ inventory, rows, policyRegistry, governanceRegistry, errors }) => {
  const rowIds = new Set(rows.map((row) => canonicalRowId(row.id)));
  for (const entry of policyRegistry) {
    const id = entry.id?.startsWith('client:')
      ? canonicalRowId(entry.id)
      : canonicalRowId(`api:${entry.method}:${entry.path}`);
    if (!rowIds.has(id)) errors.push(`policy registry row missing: ${entry.id} -> ${id}`);
    if (stableJson(inventory.source_to_rows?.[`policy:${entry.id}`] ?? []) !== stableJson([id])) {
      errors.push(`policy registry source mapping missing: ${entry.id}`);
    }
  }
  for (const entry of governanceRegistry) {
    const id = canonicalRowId(`client:${entry.path}`);
    if (!rowIds.has(id)) errors.push(`governance registry row missing: ${entry.path} -> ${id}`);
    if (stableJson(inventory.source_to_rows?.[`governance:${entry.path}`] ?? []) !== stableJson([id])) {
      errors.push(`governance registry source mapping missing: ${entry.path}`);
    }
  }
};

async function* jsonLines(filePath) {
  const input = fs.createReadStream(filePath, { encoding: 'utf8' });
  const lines = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) if (line.trim()) yield JSON.parse(line);
  } finally {
    lines.close();
    input.destroy();
  }
}

export async function reconcileKnowledgeGraph(document, inventory) {
  const manifest = readJson(path.join(kgDir, 'manifest.json'));
  const counts = {};
  const expectedIds = new Map([
    ['APIEndpoint', new Set()],
    ['ClientRoute', new Set()],
    ['WorkerJob', new Set()],
  ]);
  for await (const record of jsonLines(path.join(kgDir, 'nodes-routes.jsonl'))) {
    if (!expectedIds.has(record.type)) continue;
    counts[record.type] = (counts[record.type] ?? 0) + 1;
    if (record.type === 'APIEndpoint') expectedIds.get(record.type).add(canonicalRowId(record.id));
    else if (record.type === 'ClientRoute') expectedIds.get(record.type).add(`client:${record.path}`);
    else expectedIds.get(record.type).add(canonicalRowId(record.id));
  }
  const rowIds = new Set(document.rows.map((row) => canonicalRowId(row.id)));
  const missing = {};
  for (const [type, ids] of expectedIds) missing[type] = [...ids].filter((id) => !rowIds.has(id)).sort((left, right) => left.localeCompare(right));
  const inventoryCounts = inventory.kg_counts ?? {};
  for (const type of expectedIds.keys()) {
    if (counts[type] !== inventoryCounts[type]) throw new Error(`KG ${type} count mismatch: ${counts[type]} vs ${inventoryCounts[type]}`);
  }
  return { snapshot_id: manifest.snapshot_id, counts, missing };
}

export function scanSchedulerRegistrations() {
  const source = fs.readFileSync(path.join(repoRoot, 'server/routes.ts'), 'utf8');
  const registrations = [];
  for (const match of source.matchAll(/\b(?:varianceAlertAutomationService|artifactRetentionService|internalAnalysisCheckpointService)\.start\s*\(\s*\)/g)) {
    registrations.push({
      id: match[0].split('.')[0],
      site: `server/routes.ts:${source.slice(0, match.index).split('\n').length}`,
    });
  }
  return registrations;
}

const selectorIds = (selector, rows) => {
  const canonicalRows = rows.map((row) => ({ row, id: canonicalRowId(row.id) }));
  if (selector.kind === 'seam') return canonicalRows.filter(({ row }) => row.seam === selector.value).map(({ id }) => id).sort();
  if (selector.kind === 'explicit') return [...new Set(selector.ids ?? [])].map(canonicalRowId).sort();
  if (selector.kind === 'pattern') {
    if (!selector.pattern?.startsWith('^') || !selector.pattern?.endsWith('$')) throw new Error(`Requirement pattern must be anchored: ${selector.pattern}`);
    const expression = new RegExp(selector.pattern);
    return canonicalRows.filter(({ id }) => expression.test(id)).map(({ id }) => id).sort();
  }
  throw new Error(`Unknown requirement selector kind: ${selector.kind}`);
};

export function matchRequirementFamilies(requirements, rows) {
  return (requirements.families ?? []).map((family) => {
    const matchedIds = selectorIds(family.selector, rows);
    if (family.selector.kind === 'explicit') {
      const known = new Set(rows.map((row) => canonicalRowId(row.id)));
      for (const id of matchedIds) if (!known.has(id)) throw new Error(`Requirement ${family.id} names missing row ${id}`);
    }
    return { ...family, matched_ids: matchedIds };
  });
}

export function closureReport({ document, requirements, listeners, candidates, exclusions, orphans, discoveredRoles, inventory } = {}) {
  const rows = document.rows;
  const matchedFamilies = matchRequirementFamilies(requirements, rows);
  const unknownRequired = rows.filter((row) => row.classification === 'classified' && (
    row.personas.includes('unknown') || ['unknown', 'unassigned'].includes(row.persistence)
    || ['unknown', 'unassigned'].includes(row.destructive) || row.environment === 'unknown' || row.owner === 'unassigned'
  )).map((row) => row.id);
  const proposedRows = rows.filter((row) => row.decision_status === 'proposed').map((row) => row.id);
  const unclassifiedRows = rows.filter((row) => row.classification === 'unclassified').map((row) => row.id);
  const unresolvedListeners = (listeners ?? []).filter((entry) => lifecycle(entry) !== 'approved').map((entry) => entry.listener_id);
  const unresolvedCandidates = (candidates ?? []).filter((entry) => !['not-surface', 'promote'].includes(entry.disposition) || lifecycle(entry) !== 'approved').map((entry) => entry.path);
  const unresolvedOrphans = (orphans ?? []).filter((entry) => !['pruned', 'retained'].includes(entry.resolution) || lifecycle(entry) !== 'approved').map((entry) => entry.id);
  const unresolvedExclusions = (exclusions ?? []).filter((entry) => lifecycle(entry) !== 'approved').map((entry) => entry.id ?? entry.exclusion_id ?? entry.layer_id);
  const undecidedRoles = (discoveredRoles ?? Object.keys(AUTH_ROLE_PERSONA_MAPPING)).filter((role) => AUTH_IDENTITY_PERSONA_MAPPING[role]?.decided !== true);
  const missingClosureFields = rows.filter((row) => row.decision === 'keep-and-prove' && row.proven_reachability === 'none' && (
    !row.closure_owner || !row.closure_gate || !row.closure_acceptance
  )).map((row) => row.id);
  const coverageGaps = coverageObligations(document)
    .filter((obligation) => obligation.status === 'gap')
    .map((obligation) => obligation.key);
  const unresolvedRoles = rows.flatMap((row) => (row.auth_roles ?? [])
    .filter((role) => role === 'unresolved' || AUTH_IDENTITY_PERSONA_MAPPING[role]?.decided !== true)
    .map((role) => `${row.id}:${role}`));
  const unresolvedDispositions = [
    ...unresolvedListeners,
    ...unresolvedCandidates,
    ...unresolvedOrphans,
    ...unresolvedExclusions,
  ].sort((left, right) => left.localeCompare(right));
  const familyIssues = matchedFamilies.filter((family) => {
    if (family.matched_ids.length === 0) return !(family.optional_when_absent && family.absence_evidence?.status === 'approved');
    return family.matched_ids.some((id) => document.rows.find((row) => row.id === id)?.decision_status !== 'approved');
  }).map((family) => family.id);
  const issues = {
    unclassified: unclassifiedRows,
    proposed: proposedRows,
    unknown_required: unknownRequired,
    unresolved_listeners: unresolvedListeners,
    unresolved_candidates: unresolvedCandidates,
    unresolved_orphans: unresolvedOrphans,
    unresolved_exclusions: unresolvedExclusions,
    dispositions: unresolvedDispositions,
    undecided_persona_roles: undecidedRoles,
    roles: unresolvedRoles,
    requirement_families: familyIssues,
    missing_closure_fields: missingClosureFields,
    coverage_obligations: coverageGaps,
    source_fingerprints: validateApprovedSourceFingerprints(document, inventory),
  };
  return { passed: Object.values(issues).every((values) => values.length === 0), issues, families: matchedFamilies };
}

const lifecycle = (artifact) => artifact?.decision_status ?? artifact?.status ?? 'proposed';

export function validateOffRowFingerprints({ listeners, candidates, exclusions, orphans, requirements, discoveredListeners = [] } = {}) {
  const errors = [];
  const candidateByPath = new Map(discoveredListeners.map((candidate) => [candidate.path, candidate]));
  for (const listener of listeners ?? []) {
    const candidate = candidateByPath.get(listener.candidate_path);
    const expected = listenerDispositionFingerprint(listener, candidate);
    if (!listener.fingerprint) errors.push(`listener disposition fingerprint missing: ${listener.listener_id}`);
    else if (listener.fingerprint !== expected) errors.push(`listener disposition fingerprint mismatch: ${listener.listener_id}`);
  }
  for (const candidate of candidates ?? []) {
    const expected = dormantCandidateFingerprint(candidate);
    const stored = candidate.contract_fingerprint ?? candidate.fingerprint;
    if (candidate.decision_status === 'approved' && !stored) errors.push(`dormant candidate fingerprint missing: ${candidate.path}`);
    else if (stored && stored !== expected) errors.push(`dormant candidate fingerprint mismatch: ${candidate.path}`);
  }
  for (const orphan of orphans ?? []) {
    const expected = orphanResolutionFingerprint(orphan);
    const stored = orphan.resolution_fingerprint ?? (orphan.decision_status === 'approved' ? orphan.contract_fingerprint : undefined);
    if (orphan.decision_status === 'approved' && !stored) errors.push(`orphan resolution fingerprint missing: ${orphan.id}`);
    else if (stored && stored !== expected) errors.push(`orphan resolution fingerprint mismatch: ${orphan.id}`);
  }
  for (const exclusion of Array.isArray(exclusions) ? exclusions : Object.values(exclusions ?? {})) {
    const expected = runtimeExclusionFingerprint(exclusion);
    const stored = exclusion.contract_fingerprint ?? exclusion.fingerprint;
    const id = exclusion.id ?? exclusion.exclusion_id ?? exclusion.layer_id;
    if (exclusion.decision_status === 'approved' && !stored) errors.push(`runtime exclusion fingerprint missing: ${id}`);
    else if (stored && stored !== expected) errors.push(`runtime exclusion fingerprint mismatch: ${id}`);
  }
  for (const family of requirements?.families ?? []) {
    const evidence = family.absence_evidence;
    const stored = evidence?.fingerprint ?? evidence?.contract_fingerprint;
    if (evidence?.status === 'approved' && !stored) errors.push(`absence evidence fingerprint missing: ${family.id}`);
    else if (stored && stored !== absenceEvidenceFingerprint(family)) errors.push(`absence evidence fingerprint mismatch: ${family.id}`);
  }
  return errors;
}

const ABSENCE_DECLARATION = /\b(?:absent|deleted|removed|retired|no longer (?:exists|present|tracked)|not (?:present|tracked))\b/i;
const EVIDENCE_SOURCE_EXTENSIONS = new Set([
  '.cjs', '.css', '.cts', '.env', '.html', '.js', '.json', '.jsx', '.lock', '.md', '.mjs',
  '.mts', '.ps1', '.py', '.sh', '.sql', '.toml', '.ts', '.tsx', '.txt', '.yaml', '.yml',
]);
const EVIDENCE_HIDDEN_FILES = new Set(['.dockerignore', '.gitignore', '.gitleaksignore', '.nvmrc', '.vercelignore']);

const runtimeEvidencePath = (entry) => {
  if (typeof entry !== 'string') return undefined;
  const trimmed = entry.trim();
  const markdownLink = trimmed.match(/^\[[^\]]+\]\(\s*(?:<([^>]+)>|([^\s)]+))/);
  let token = markdownLink?.[1] ?? markdownLink?.[2] ?? (trimmed.split(/\s+/, 1)[0] ?? '');
  for (let index = 0; index < 3; index += 1) {
    const normalizedToken = token
      .replace(/^[`"'([{<]+/, '')
      .replace(/[.,:;]+$/, '')
      .replace(/[`"')\]}>]+$/, '')
      .replace(/[.,:;]+$/, '');
    if (normalizedToken === token) break;
    token = normalizedToken;
  }
  const candidate = token.split('#', 1)[0]
    .replace(/:\d+(?:-\d+)?$/, '')
    .replace(/:$/, '');
  if (!candidate || candidate.includes('://')) return undefined;
  const basename = path.posix.basename(candidate);
  const pathLike = basename.startsWith('Dockerfile')
    || basename === '.env'
    || basename.startsWith('.env.')
    || EVIDENCE_HIDDEN_FILES.has(basename)
    || EVIDENCE_SOURCE_EXTENSIONS.has(path.posix.extname(basename).toLowerCase());
  const normalized = path.posix.normalize(candidate);
  const invalid = candidate.includes('\\')
    || path.posix.isAbsolute(candidate)
    || path.win32.isAbsolute(candidate)
    || path.win32.parse(candidate).root !== ''
    || normalized === '..'
    || normalized.startsWith('../');
  if (!invalid && !pathLike) return undefined;
  return { path: repoPath(normalized), invalid };
};

export function validateRuntimeExclusionEvidence({ exclusions, trackedPaths = new Set(trackedFiles()) } = {}) {
  const tracked = trackedPaths instanceof Set ? trackedPaths : new Set(trackedPaths ?? []);
  const errors = [];
  for (const exclusion of Array.isArray(exclusions) ? exclusions : Object.values(exclusions ?? {})) {
    const id = exclusion.id ?? exclusion.exclusion_id ?? exclusion.layer_id;
    const evidenceEntries = Array.isArray(exclusion.evidence) ? exclusion.evidence : [exclusion.evidence];
    for (const entry of evidenceEntries) {
      const evidencePath = runtimeEvidencePath(entry);
      if (!evidencePath) continue;
      if (evidencePath.invalid) {
        errors.push(`runtime exclusion evidence path invalid: ${id}/${evidencePath.path}`);
        continue;
      }
      if (tracked.has(evidencePath.path) || ABSENCE_DECLARATION.test(String(entry))) continue;
      errors.push(`runtime exclusion evidence path missing without absence declaration: ${id}/${evidencePath.path}`);
    }
  }
  return errors;
}

const confirmedExposureEvidence = (row, exposure) => {
  const items = [...(row.test_evidence?.derived ?? []), ...(row.test_evidence?.manual ?? [])];
  return items.some((item) => item.assertion_confirmed === true
    && item.deployment === exposure.deployment
    && item.runtime === exposure.runtime
    && typeof item.assertion_evidence === 'string'
    && item.assertion_evidence.length > 0
    && /^[0-9a-f]{64}$/i.test(String(item.test_file_sha256 ?? '')));
};

const hasStableTestHash = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);

const hasCoverageAttestation = (document, row, exposure) =>
  document.coverage_review?.[`${row.id}|${exposure.deployment}|${exposure.runtime}`]?.test_coverage === 'none-reviewed'
  && document.coverage_review?.[`${row.id}|${exposure.deployment}|${exposure.runtime}`]?.contract_fingerprint === contractFingerprint(row)
  && typeof document.coverage_review?.[`${row.id}|${exposure.deployment}|${exposure.runtime}`]?.evidence === 'string'
  && document.coverage_review[`${row.id}|${exposure.deployment}|${exposure.runtime}`].evidence.length > 0;

export const coverageObligations = (document) => (document?.rows ?? []).flatMap((row) => (row.exposures ?? []).map((exposure) => {
  const key = `${row.id}|${exposure.deployment}|${exposure.runtime}`;
  const review = document.coverage_review?.[key];
  const evidence = [...(row.test_evidence?.derived ?? []), ...(row.test_evidence?.manual ?? [])]
    .filter((item) => item.assertion_confirmed === true
      && item.deployment === exposure.deployment
      && item.runtime === exposure.runtime
      && typeof item.assertion_evidence === 'string'
      && item.assertion_evidence.length > 0
      && hasStableTestHash(item.test_file_sha256));
  const confirmed = evidence.length > 0;
  const attested = hasCoverageAttestation(document, row, exposure);
  return {
    key,
    row_id: row.id,
    deployment: exposure.deployment,
    runtime: exposure.runtime,
    contract_fingerprint: review?.contract_fingerprint ?? contractFingerprint(row),
    status: confirmed ? 'confirmed' : attested ? 'none-reviewed' : 'gap',
    attestation: review?.test_coverage ?? 'unreviewed',
    evidence,
    review_evidence: review?.evidence,
  };
}));

const validateApprovedSourceFingerprints = (document, inventory) => {
  if (!inventory) return [];
  const errors = [];
  for (const row of document?.rows ?? []) {
    if (row.decision_status !== 'approved') continue;
    for (const entry of row.approved_source_hashes ?? []) {
      const match = String(entry).match(/^(.*)=([0-9a-f]{64})$/i);
      if (!match) {
        errors.push(`approved source fingerprint malformed: ${row.id}:${entry}`);
        continue;
      }
      const [sourcePath, expectedHash] = match.slice(1);
      const currentHash = inventory.source_hashes?.[sourcePath];
      if (!currentHash) errors.push(`approved source fingerprint missing from inventory: ${row.id}:${sourcePath}`);
      else if (currentHash !== expectedHash) errors.push(`approved source fingerprint stale: ${row.id}:${sourcePath}`);
    }
  }
  return errors;
};

export function validateRowIntegrity({ document, inventory } = {}) {
  const errors = [];
  errors.push(...validateApprovedSourceFingerprints(document, inventory));
  for (const [key, review] of Object.entries(document?.coverage_review ?? {})) {
    const [rowId, deployment, runtime, ...extra] = key.split('|');
    const row = document.rows.find((entry) => entry.id === rowId);
    const exposure = row?.exposures?.find((entry) => entry.deployment === deployment && entry.runtime === runtime);
    if (extra.length > 0 || !row || !exposure || review.contract_fingerprint !== contractFingerprint(row)) {
      errors.push(`coverage review fingerprint mismatch: ${key}`);
    }
  }
  for (const row of document?.rows ?? []) {
    if (row.decision_status === 'approved' && row.contract_fingerprint !== contractFingerprint(row)) errors.push(`approved fingerprint mismatch: ${row.id}`);
    for (const evidence of [...(row.test_evidence?.derived ?? []), ...(row.test_evidence?.manual ?? [])]) {
      if (!evidence.assertion_confirmed) continue;
      const filePath = String(evidence.assertion_evidence ?? '').split(':', 1)[0];
      if (!evidence.deployment || !evidence.runtime || !filePath || !hasStableTestHash(evidence.test_file_sha256)) {
        errors.push(`confirmed test evidence fields incomplete: ${row.id}`);
        continue;
      }
      if (!fs.existsSync(path.join(repoRoot, filePath)) || sha256(fs.readFileSync(path.join(repoRoot, filePath))) !== evidence.test_file_sha256) {
        errors.push(`confirmed test evidence hash mismatch: ${filePath}`);
      }
    }
  }
  return errors;
}

export function validateClosedPhaseInvariants({ document, requirements, families } = {}) {
  if (document?.phase !== 'closed') return [];
  const errors = [];
  const normalizedRequirementsHash = sha256(stableJson(requirements));
  if (document.g1_closure?.requirements_sha256 !== normalizedRequirementsHash) errors.push('closed matrix requirements content hash mismatch');
  const storedFamilies = document.g1_closure?.families ?? {};
  for (const family of families ?? []) {
    if (stableJson(storedFamilies[family.id] ?? []) !== stableJson(family.matched_ids)) {
      errors.push(`closed matrix requirement match set mismatch: ${family.id}`);
    }
  }
  for (const row of document.rows ?? []) {
    for (const exposure of row.exposures ?? []) {
      if (!confirmedExposureEvidence(row, exposure) && !hasCoverageAttestation(document, row, exposure)) {
        errors.push(`closed exposure lacks confirmed test evidence or none-reviewed attestation: ${row.id}/${exposure.deployment}/${exposure.runtime}`);
      }
    }
  }
  return errors;
}

export async function validateMatrix({ writeMetadata = true } = {}) {
  const document = SurfaceMatrixDocumentSchema.parse(readJson(matrixFile));
  const inventory = SourceInventorySchema.parse(readJson(inventoryFile));
  const requirements = RequirementsDocumentSchema.parse(readJson(requirementsFile));
  const policyModule = await import(pathToFileURL(path.join(repoRoot, 'server/route-policy/api-route-policy-registry.ts')).href);
  const governanceModule = await import(pathToFileURL(path.join(repoRoot, 'shared/routes/route-governance-registry.ts')).href);
  const listeners = ListenerDispositionsSchema.parse(readJson(path.join(matrixDir, 'listener-dispositions.json')));
  const candidates = DormantCandidatesSchema.parse(readJson(path.join(matrixDir, 'dormant-candidates.json')));
  const exclusions = RuntimeExclusionsSchema.parse(readJson(path.join(matrixDir, 'runtime-exclusions.json')));
  const orphans = OrphansSchema.parse(readJson(path.join(matrixDir, 'orphans.json')));
  const errors = [];
  if (Object.prototype.hasOwnProperty.call(document, 'orphans')) errors.push('matrix.json must not embed orphans; orphans.json is authoritative');
  validateMappings(document, inventory, errors);
  validateRegistryMappings({
    inventory,
    rows: document.rows,
    policyRegistry: policyModule.API_ROUTE_POLICY_REGISTRY,
    governanceRegistry: governanceModule.ROUTE_GOVERNANCE_REGISTRY,
    errors,
  });
  await validateSourceHashes(inventory, errors);
  const kg = await reconcileKnowledgeGraph(document, inventory);
  if (kg.missing.APIEndpoint.length || kg.missing.ClientRoute.length || kg.missing.WorkerJob.length) errors.push(`KG rows missing from matrix: ${JSON.stringify(kg.missing)}`);
  const schedulers = scanSchedulerRegistrations();
  if (schedulers.length !== document.rows.filter((row) => row.interface === 'scheduler').length) errors.push('scheduler registration count does not match scheduler rows');
  const discoveredListeners = discoverHttpListenerCandidates({ rootDir: repoRoot });
  errors.push(...validateOffRowFingerprints({ listeners, candidates, exclusions, orphans, requirements, discoveredListeners }));
  errors.push(...validateRuntimeExclusionEvidence({ exclusions }));
  const dispositionPaths = new Set(listeners.map((entry) => entry.candidate_path));
  for (const candidate of discoveredListeners) if (!dispositionPaths.has(candidate.path)) errors.push(`listener candidate has no disposition: ${candidate.path}`);
  const discoveredDormant = discoverDormantCandidates({ rootDir: repoRoot });
  if (stableJson(discoveredDormant.map((candidate) => candidate.path)) !== stableJson(candidates.map((candidate) => candidate.path).sort((left, right) => left.localeCompare(right)))) errors.push('dormant candidate set drift');
  const queueFindings = scanBullmqConstructors({ rootDir: repoRoot });
  for (const finding of queueFindings) if (!document.rows.some((row) => row.id === canonicalRowId(`worker:${finding.queue_name}`))) errors.push(`BullMQ constructor missing row: ${finding.queue_name}`);
  errors.push(...validateRowIntegrity({ document, inventory }));
  const families = matchRequirementFamilies(requirements, document.rows);
  for (const family of families) if (family.matched_ids.length === 0 && !(family.optional_when_absent && family.absence_evidence)) errors.push(`requirement family is empty: ${family.id}`);
  const closure = closureReport({ document, requirements, listeners, candidates, exclusions, orphans, inventory });
  if (document.phase === 'closed') {
    for (const [issue, values] of Object.entries(closure.issues)) {
      if (values.length > 0) errors.push(`closed matrix closure ${issue}: ${values.join(', ')}`);
    }
    errors.push(...validateClosedPhaseInvariants({ document, requirements, families }));
    if (errors.some((message) => message.includes('fingerprint mismatch'))) {
      errors.push('closed off-row fingerprint gate failed');
    }
  }
  fail(errors);
  const validation = {
    passed: true,
    kg: { snapshot_id: kg.snapshot_id, counts: kg.counts },
    scheduler_registrations: schedulers,
    discovery: {
      listener_candidates: discoveredListeners.length,
      dormant_candidates: discoveredDormant.length,
      bullmq_constructors: queueFindings.length,
    },
    requirement_match_counts: Object.fromEntries(families.map((family) => [family.id, family.matched_ids.length])),
  };
  if (writeMetadata) {
    const updated = { ...document, validation };
    fs.writeFileSync(matrixFile, `${JSON.stringify(updated, null, 2)}\n`);
  }
  return { document: { ...document, validation }, inventory, validation, closure };
}

if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  validateMatrix().then((result) => {
    const closure_counts = Object.fromEntries(Object.entries(result.closure.issues).map(([key, values]) => [key, values.length]));
    process.stdout.write(`${JSON.stringify({
      validation: result.validation,
      closure: { passed: result.closure.passed, issue_counts: closure_counts },
    }, null, 2)}\n`);
  }).catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
