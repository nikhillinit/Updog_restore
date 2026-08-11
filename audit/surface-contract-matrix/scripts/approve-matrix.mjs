import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  AUTH_IDENTITY_PERSONA_MAPPING,
  DormantCandidatesSchema,
  G1ReviewManifestSchema,
  ListenerDispositionsSchema,
  OrphansSchema,
  RequirementsDocumentSchema,
  RuntimeExclusionsSchema,
  SourceInventorySchema,
  SurfaceMatrixDocumentSchema,
  absenceEvidenceFingerprint,
  assertAuthRoleMappingExhaustive,
  canonicalRowId,
  contractFingerprint,
  discoverAuthRoleEvidence,
  discoverHttpListenerCandidates,
  dormantCandidateFingerprint,
  listenerDispositionFingerprint,
  orphanResolutionFingerprint,
  runtimeExclusionFingerprint,
} from '../matrix-schema.mjs';
import {
  closureReport,
  coverageObligations,
  matchRequirementFamilies,
  validateClosedPhaseInvariants,
  validateMatrix,
  validateOffRowFingerprints,
  validateRowIntegrity,
} from './validate-matrix.mjs';
import { renderMatrix } from './render-matrix.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const matrixDir = path.resolve(path.dirname(scriptPath), '..');
const repoRoot = path.resolve(matrixDir, '../..');
const files = {
  matrix: path.join(matrixDir, 'matrix.json'),
  inventory: path.join(matrixDir, 'source-inventory.json'),
  requirements: path.join(matrixDir, 'requirements.json'),
  listeners: path.join(matrixDir, 'listener-dispositions.json'),
  candidates: path.join(matrixDir, 'dormant-candidates.json'),
  exclusions: path.join(matrixDir, 'runtime-exclusions.json'),
  orphans: path.join(matrixDir, 'orphans.json'),
  render: path.join(matrixDir, 'MATRIX.md'),
  authOverrides: path.join(matrixDir, 'auth-overrides.json'),
  review: path.join(matrixDir, 'g1-review.json'),
};

const readJson = (filePath, fallback, fsApi = fs) => fsApi.existsSync(filePath)
  ? JSON.parse(fsApi.readFileSync(filePath, 'utf8'))
  : fallback;

const clone = (value) => globalThis.structuredClone(value);

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
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const nonEmpty = (value, name) => {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${name} must be a non-empty string`);
  return value;
};

const requiredValue = (argv, index, flag) => {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
};

const pathNodeExists = (target, fsApi = fs) => {
  if (fsApi.existsSync(target)) return true;
  if (typeof fsApi.lstatSync !== 'function') return false;
  try {
    return fsApi.lstatSync(target).isSymbolicLink();
  } catch {
    return false;
  }
};

const canonicalPath = (target, fsApi = fs) => {
  const absolute = path.resolve(target);
  if (typeof fsApi.realpathSync !== 'function') return absolute;
  let current = absolute;
  const suffix = [];
  while (!pathNodeExists(current, fsApi)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    suffix.unshift(path.basename(current));
    current = parent;
  }
  try {
    return path.join(fsApi.realpathSync(current), ...suffix);
  } catch (error) {
    throw new Error(`Unable to canonicalize path ${target}: ${error.message}`, { cause: error });
  }
};

const assertContainedPath = (target, baseDir, fsApi = fs, label = 'Atomic target') => {
  const absoluteBase = path.resolve(baseDir);
  const canonicalBase = canonicalPath(absoluteBase, fsApi);
  if (typeof fsApi.realpathSync === 'function'
    && pathNodeExists(absoluteBase, fsApi)
    && canonicalBase !== absoluteBase) {
    throw new Error(`${label} base directory resolves through symlink: ${baseDir}`);
  }
  const absoluteTarget = path.resolve(target);
  const canonicalTarget = canonicalPath(absoluteTarget, fsApi);
  const canonicalRelative = path.relative(canonicalBase, canonicalTarget);
  if (canonicalRelative.startsWith('..') || path.isAbsolute(canonicalRelative)) {
    throw new Error(`${label} resolves outside ${baseDir}: ${target}`);
  }
  return path.relative(absoluteBase, absoluteTarget);
};

const assertReviewFileSafe = ({ reviewFile, fileSet = files, baseDir = matrixDir, fsApi = fs } = {}) => {
  if (!reviewFile) return;
  assertContainedPath(reviewFile, baseDir, fsApi, 'Review file');
  const reviewCanonical = canonicalPath(reviewFile, fsApi);
  const reserved = {
    matrix: fileSet.matrix,
    inventory: fileSet.inventory,
    requirements: fileSet.requirements,
    listeners: fileSet.listeners,
    candidates: fileSet.candidates,
    exclusions: fileSet.exclusions,
    orphans: fileSet.orphans,
    render: fileSet.render,
    authOverrides: fileSet.authOverrides,
  };
  for (const [name, target] of Object.entries(reserved)) {
    if (target && reviewCanonical === canonicalPath(target, fsApi)) {
      throw new Error(`Review file collides with reserved artifact ${name}`);
    }
  }
};

export function parseArgs(
  argv,
  {
    matrixDir: reviewRoot = matrixDir,
    defaultReviewFile = files.review,
    pathRoot = repoRoot,
    fsApi = fs,
  } = {},
) {
  const values = {
    command: argv[0] === 'init-review' ? 'init-review' : 'approve',
    dryRun: false,
    closeG1: false,
    fresh: false,
    reviewFile: defaultReviewFile,
  };
  const start = values.command === 'init-review' ? 1 : 0;
  for (let index = start; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') values.dryRun = true;
    else if (argument === '--close-g1') values.closeG1 = true;
    else if (argument === '--fresh') values.fresh = true;
    else if (argument === '--review-file') values.reviewFile = path.resolve(pathRoot, requiredValue(argv, index, argument));
    else if (argument === '--approver') values.approver = requiredValue(argv, index, argument);
    else if (argument === '--evidence') values.evidence = requiredValue(argv, index, argument);
    else throw new Error(`Unknown argument: ${argument}`);
    if (['--review-file', '--approver', '--evidence'].includes(argument)) index += 1;
  }

  if (!values.reviewFile.startsWith(`${reviewRoot}${path.sep}`) && values.reviewFile !== reviewRoot) {
    throw new Error(`--review-file must be inside ${reviewRoot}`);
  }
  assertContainedPath(values.reviewFile, reviewRoot, fsApi, 'Review file');
  if (values.command === 'init-review' && (values.closeG1 || values.fresh || values.approver || values.evidence)) {
    throw new Error('init-review accepts only --review-file and --dry-run');
  }
  if (values.command === 'approve' && values.closeG1 && values.fresh) {
    throw new Error('--fresh cannot be combined with --close-g1');
  }
  if (values.command === 'approve' && !values.fresh) {
    nonEmpty(values.approver, '--approver');
    nonEmpty(values.evidence, '--evidence');
  }
  return values;
}

const relativeTarget = (target, baseDir = matrixDir, fsApi = fs) => {
  const relative = assertContainedPath(target, baseDir, fsApi);
  return relative || path.basename(path.resolve(target));
};

const serialized = (value) => typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`;

/**
 * Swap a complete artifact set with rollback. `fsApi.renameSync` is the
 * deliberate injection seam for failure-injection tests.
 */
export function atomicWriteSet({ writes = [], deletes = [], fsApi = fs, baseDir = matrixDir } = {}) {
  const entries = new Map();
  const addEntry = (target, entry) => {
    const relative = relativeTarget(target, baseDir, fsApi);
    const canonical = canonicalPath(target, fsApi);
    if (entries.has(relative) || [...entries.values()].some((existing) => existing.canonical === canonical)) {
      throw new Error(`Atomic transaction target collision: ${relative}`);
    }
    entries.set(relative, { ...entry, canonical });
  };
  for (const [target, value] of writes) addEntry(target, { value });
  for (const target of deletes) addEntry(target, { delete: true });
  const stage = fsApi.mkdtempSync(path.join(baseDir, '.g1-stage-'));
  const backup = fsApi.mkdtempSync(path.join(baseDir, '.g1-backup-'));
  const moved = [];
  const installed = [];

  try {
    for (const [relative, entry] of entries) {
      if (entry.delete) continue;
      const stagedPath = path.join(stage, relative);
      fsApi.mkdirSync(path.dirname(stagedPath), { recursive: true });
      fsApi.writeFileSync(stagedPath, serialized(entry.value));
    }

    for (const relative of entries.keys()) {
      assertContainedPath(path.join(baseDir, relative), baseDir, fsApi);
    }

    for (const relative of entries.keys()) {
      const targetPath = path.join(baseDir, relative);
      assertContainedPath(targetPath, baseDir, fsApi);
      if (!fsApi.existsSync(targetPath)) continue;
      const backupPath = path.join(backup, relative);
      fsApi.mkdirSync(path.dirname(backupPath), { recursive: true });
      fsApi.renameSync(targetPath, backupPath);
      moved.push({ relative, targetPath, backupPath });
    }

    for (const [relative, entry] of entries) {
      if (entry.delete) continue;
      const stagedPath = path.join(stage, relative);
      const targetPath = path.join(baseDir, relative);
      assertContainedPath(targetPath, baseDir, fsApi);
      fsApi.renameSync(stagedPath, targetPath);
      installed.push({ targetPath });
    }

    fsApi.rmSync(stage, { recursive: true, force: true });
    fsApi.rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    // Remove only replacements installed during this transaction. Targets
    // that were never backed up must remain untouched when staging or backup
    // fails before installation begins.
    for (const entry of installed.reverse()) {
      if (fsApi.existsSync(entry.targetPath)) fsApi.rmSync(entry.targetPath, { force: true });
    }
    for (const entry of moved.reverse()) {
      if (fsApi.existsSync(entry.backupPath)) {
        fsApi.mkdirSync(path.dirname(entry.targetPath), { recursive: true });
        fsApi.renameSync(entry.backupPath, entry.targetPath);
      }
    }
    fsApi.rmSync(stage, { recursive: true, force: true });
    fsApi.rmSync(backup, { recursive: true, force: true });
    throw new Error(`Atomic matrix transaction rolled back: ${error.message}`, { cause: error });
  }
}

const sourceFingerprintsForRow = (row, inventory) => {
  const sources = new Set([
    ...(inventory.row_to_sources?.[row.id] ?? []),
    row.source_mapping?.source_file,
    row.source_mapping?.function_file,
    row.source_mapping?.handler_file,
  ].filter(Boolean));
  return [...sources]
    .sort((left, right) => left.localeCompare(right))
    .map((source) => inventory.source_hashes?.[source] ? `${source}=${inventory.source_hashes[source]}` : undefined)
    .filter(Boolean);
};

const collectionEntries = (collection, fallbackKey = 'row_id') => {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection.map((entry) => [entry?.[fallbackKey], entry]);
  return Object.entries(collection);
};

const rowEntries = (manifest) => collectionEntries(manifest.rows).map(([key, entry]) => {
  const rowId = entry?.row_id ?? key;
  return [canonicalRowId(rowId), entry];
});

const allowedRowReviewFields = new Set([
  'personas',
  'persistence',
  'destructive',
  'environment',
  'owner',
  'seam_override',
  'classification',
  'decision',
  'decision_override',
  'decision_status',
  'decision_evidence',
  'closure_owner',
  'closure_gate',
  'closure_acceptance',
  'dormant_disposition',
  'anonymous_reachability',
  'effective_auth',
]);

const reviewFields = (entry) => ({
  ...(entry?.reviewed_fields ?? {}),
  ...(entry?.semantic_fields ?? {}),
  ...Object.fromEntries([...allowedRowReviewFields]
    .filter((field) => entry?.[field] !== undefined)
    .map((field) => [field, entry[field]])),
});

const evidenceForReview = (entry, fallback) => {
  const value = Array.isArray(entry?.evidence) ? entry.evidence[0] : entry?.evidence;
  return value ?? fallback;
};

const completeClassification = (row) => row.personas?.length > 0
  && !row.personas.includes('unknown')
  && !['unknown', 'unassigned'].includes(row.persistence)
  && !['unknown', 'unassigned'].includes(row.destructive)
  && row.environment !== 'unknown'
  && row.owner !== 'unassigned';

const applyRowReview = (row, entry, globalEvidence, inventory) => {
  const fields = reviewFields(entry);
  for (const field of Object.keys(fields)) {
    if (!allowedRowReviewFields.has(field)) throw new Error(`Unsupported reviewed row field ${row.id}:${field}`);
    row[field] = clone(fields[field]);
  }
  if (fields.decision !== undefined) {
    row.decision_override = fields.decision;
    row.decision = fields.decision;
  }
  if (fields.decision_override !== undefined) row.decision = fields.decision_override;
  if (fields.decision_status === 'approved') {
    row.decision_evidence = fields.decision_evidence ?? evidenceForReview(entry, globalEvidence);
    row.approved_source_hashes = sourceFingerprintsForRow(row, inventory);
  } else if (fields.decision_status === 'proposed') {
    delete row.decision_evidence;
    row.approved_source_hashes = [];
  }
  if (fields.classification === undefined && completeClassification(row)) row.classification = 'classified';
};

const sourceDerivedInvariant = (row) => {
  const value = clone(row);
  for (const field of [
    'id',
    'personas',
    'persistence',
    'destructive',
    'environment',
    'owner',
    'seam_override',
    'classification',
    'decision',
    'decision_override',
    'decision_status',
    'decision_evidence',
    'closure_owner',
    'closure_gate',
    'closure_acceptance',
    'dormant_disposition',
    'approved_source_hashes',
    'contract_fingerprint',
    'test_evidence',
  ]) delete value[field];
  return stableJson(value);
};

const cohortEntries = (manifest) => Object.entries(manifest.cohorts ?? {}).map(([cohortId, value]) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid cohort ${cohortId}`);
  const rowIds = value.row_ids ?? value.rows;
  if (!Array.isArray(rowIds) || rowIds.length === 0) throw new Error(`Cohort ${cohortId} requires row_ids`);
  return [cohortId, { ...value, row_ids: rowIds.map(canonicalRowId) }];
});

const reviewedMappings = (manifest) => {
  const mappings = { ...(manifest.role_mappings ?? {}) };
  for (const [role, value] of Object.entries(manifest.persona_mappings ?? {})) {
    if (mappings[role] !== undefined && stableJson(mappings[role]) !== stableJson(value)) {
      throw new Error(`Conflicting role and persona mappings for ${role}`);
    }
    mappings[role] = value;
  }
  return mappings;
};

const assertLockedPersonaMappings = (manifest) => {
  const mappings = reviewedMappings(manifest);
  const expectedRoles = Object.keys(AUTH_IDENTITY_PERSONA_MAPPING).sort((left, right) => left.localeCompare(right));
  const actualRoles = Object.keys(mappings).sort((left, right) => left.localeCompare(right));
  if (stableJson(actualRoles) !== stableJson(expectedRoles)) {
    throw new Error('Persona mappings must be complete and match the locked G1 persona table');
  }
  for (const role of expectedRoles) {
    if (stableJson(mappings[role]) !== stableJson(AUTH_IDENTITY_PERSONA_MAPPING[role])) {
      throw new Error(`Persona mapping differs from locked G1 persona table: ${role}`);
    }
  }
  return mappings;
};

export const verifyManifestKeys = (manifest, state, args) => {
  if (manifest.snapshot_id !== state.inventory.snapshot_id
    || stableJson(manifest.source_fingerprints ?? {}) !== stableJson(state.inventory.source_hashes ?? {})) {
    throw new Error('Review manifest source fingerprints or snapshot are stale; regenerate g1-review.json');
  }
  if (manifest.approver_id !== args.approver) throw new Error('--approver does not match manifest approver_id');
  if (manifest.evidence_ref !== args.evidence) throw new Error('--evidence does not match manifest evidence_ref');

  const rowsById = new Map(state.matrix.rows.map((row) => [canonicalRowId(row.id), row]));
  const seen = new Set();
  for (const [rowId, entry] of rowEntries(manifest)) {
    if (!entry || typeof entry !== 'object') throw new Error(`Invalid review entry for ${rowId}`);
    if (seen.has(rowId)) throw new Error(`Duplicate review entry for ${rowId}`);
    seen.add(rowId);
    const row = rowsById.get(rowId);
    if (!row) throw new Error(`Review manifest names unknown row ${rowId}`);
    if (entry.contract_fingerprint !== contractFingerprint(row)) {
      throw new Error(`Review manifest contract fingerprint is stale for ${rowId}`);
    }
    if (stableJson(entry.source_fingerprints ?? []) !== stableJson(sourceFingerprintsForRow(row, state.inventory))) {
      throw new Error(`Review manifest source fingerprints are stale for ${rowId}`);
    }
  }
  const manifestRows = new Map(rowEntries(manifest));
  for (const [cohortId, cohort] of cohortEntries(manifest)) {
    const cohortRows = cohort.row_ids.map((rowId) => {
      const row = rowsById.get(rowId);
      if (!row) throw new Error(`Cohort names unknown row ${rowId}`);
      const entry = manifestRows.get(rowId);
      if (!entry || entry.cohort_id !== cohortId) {
        throw new Error(`Cohort ${cohortId} requires matching per-row fingerprint entry for ${rowId}`);
      }
      return row;
    });
    const invariants = new Set(cohortRows.map(sourceDerivedInvariant));
    if (invariants.size !== 1) throw new Error(`Cohort source-derived invariants differ: ${cohort.row_ids.join(', ')}`);
  }
  assertLockedPersonaMappings(manifest);
  return { rowsById, reviewedRowIds: seen };
};

const applyPersonaMappings = (rows, manifest) => {
  const mappings = reviewedMappings(manifest);
  for (const row of rows) {
    const personas = (row.auth_roles ?? [])
      .map((role) => mappings[role])
      .map((value) => typeof value === 'string' ? value : value?.persona)
      .filter(Boolean);
    if (personas.length > 0) row.personas = [...new Set(personas)].sort((left, right) => left.localeCompare(right));
  }
};

const applyCoverageAttestation = (document, row, key, attestation, globalEvidence) => {
  if (!attestation || typeof attestation !== 'object') throw new Error(`Invalid coverage attestation ${row.id}:${key}`);
  const parts = key.includes('|') ? key.split('|') : key.split(':');
  const deployment = parts.length >= 2 ? parts.at(-2) : undefined;
  const runtime = parts.length >= 2 ? parts.at(-1) : undefined;
  const exposure = row.exposures?.find((entry) => entry.deployment === deployment && entry.runtime === runtime);
  if (!exposure) throw new Error(`Coverage attestation does not match exposure ${row.id}:${key}`);
  const obligationKey = `${row.id}|${deployment}|${runtime}`;
  const status = attestation.test_coverage ?? attestation.status;
  if (status === 'none-reviewed') {
    const evidence = attestation.evidence ?? attestation.evidence_ref ?? globalEvidence;
    nonEmpty(evidence, `coverage evidence ${obligationKey}`);
    document.coverage_review[obligationKey] = {
      test_coverage: 'none-reviewed',
      contract_fingerprint: contractFingerprint(row),
      evidence,
    };
    return obligationKey;
  }
  if (status !== 'confirmed') throw new Error(`Coverage attestation must be confirmed or none-reviewed: ${obligationKey}`);
  const evidenceItems = attestation.test_evidence ?? attestation.evidence_items ?? [];
  if (!Array.isArray(evidenceItems) || evidenceItems.length === 0) throw new Error(`Confirmed coverage needs test evidence: ${obligationKey}`);
  const evidenceByValue = new Map();
  for (const evidence of [...(row.test_evidence?.manual ?? []), ...evidenceItems]) {
    const serializedEvidence = stableJson(evidence);
    if (!evidenceByValue.has(serializedEvidence)) evidenceByValue.set(serializedEvidence, evidence);
  }
  row.test_evidence = {
    ...row.test_evidence,
    manual: [...evidenceByValue.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, evidence]) => clone(evidence)),
  };
  delete document.coverage_review[obligationKey];
  return obligationKey;
};

const applyRowReviews = (state, manifest, args) => {
  const rowsById = new Map(state.matrix.rows.map((row) => [canonicalRowId(row.id), row]));
  const reviewed = new Set();
  const coverageKeys = new Set();
  for (const [rowId, entry] of rowEntries(manifest)) {
    const row = rowsById.get(rowId);
    applyRowReview(row, entry, args.evidence, state.inventory);
    for (const [key, attestation] of Object.entries(entry.exposure_attestations ?? {})) {
      const obligationKey = applyCoverageAttestation(state.matrix, row, key, attestation, args.evidence);
      if (obligationKey) coverageKeys.add(obligationKey);
    }
    reviewed.add(rowId);
  }
  for (const [, cohort] of cohortEntries(manifest)) {
    const fields = {
      ...(cohort.reviewed_fields ?? {}),
      ...(cohort.semantic_fields ?? {}),
      ...(cohort.decision ? { decision: cohort.decision } : {}),
    };
    for (const rowId of cohort.row_ids) {
      const row = rowsById.get(rowId);
      applyRowReview(row, { ...cohort, reviewed_fields: fields }, args.evidence, state.inventory);
      reviewed.add(rowId);
    }
  }
  for (const [key, attestation] of Object.entries(manifest.exposure_attestations ?? {})) {
    const [rowId, ...rest] = key.split('|');
    const row = rowsById.get(canonicalRowId(rowId));
    if (!row) throw new Error(`Coverage attestation names unknown row ${rowId}`);
    const obligationKey = applyCoverageAttestation(state.matrix, row, rest.join('|'), attestation, args.evidence);
    if (obligationKey) coverageKeys.add(obligationKey);
  }
  return {
    reviewedRowIds: [...reviewed].sort((left, right) => left.localeCompare(right)),
    coverageKeys,
  };
};

const bindCoverageFingerprints = (state, coverageKeys) => {
  const rowsById = new Map(state.matrix.rows.map((row) => [canonicalRowId(row.id), row]));
  for (const key of coverageKeys) {
    const review = state.matrix.coverage_review?.[key];
    if (!review) continue;
    const row = rowsById.get(canonicalRowId(key.split('|')[0]));
    if (row) review.contract_fingerprint = contractFingerprint(row);
  }
};

const reviewEntryByKey = (collection) => new Map(collectionEntries(collection).map(([key, value]) => [String(key), value]));

const offRowFingerprint = (state, category, item) => {
  if (category === 'listeners') {
    return listenerDispositionFingerprint(
      item,
      state.listenerCandidates.find((candidate) => candidate.path === item.candidate_path),
    );
  }
  if (category === 'candidates') return dormantCandidateFingerprint(item);
  if (category === 'exclusions') return runtimeExclusionFingerprint(item);
  if (category === 'orphans') return orphanResolutionFingerprint(item);
  return absenceEvidenceFingerprint(item);
};

const mapReviewCollection = (collection, update) => {
  if (Array.isArray(collection)) return collection.map((entry, index) => update(entry, String(index)));
  if (!collection || typeof collection !== 'object') return collection;
  return Object.fromEntries(Object.entries(collection).map(([key, entry]) => [key, update(entry, key)]));
};

export const rebindReviewManifest = (manifest, state) => {
  const rebound = clone(manifest);
  rebound.snapshot_id = state.inventory.snapshot_id;
  rebound.source_fingerprints = clone(state.inventory.source_hashes);
  const rowsById = new Map(state.matrix.rows.map((row) => [canonicalRowId(row.id), row]));
  const rowForReview = (entry, key) => {
    const rowId = entry?.row_id ?? key;
    if (!rowId) throw new Error('Review manifest row entry requires row_id');
    const row = rowsById.get(canonicalRowId(String(rowId)));
    if (!row) throw new Error(`Review manifest names unknown row ${rowId}`);
    return row;
  };
  const rebindRowEntry = (entry, key) => {
    const row = rowForReview(entry, key);
    const fingerprint = contractFingerprint(row);
    const next = {
      ...entry,
      row_id: entry.row_id ?? row.id,
      contract_fingerprint: fingerprint,
      source_fingerprints: sourceFingerprintsForRow(row, state.inventory),
    };
    if (next.exposure_attestations && typeof next.exposure_attestations === 'object') {
      next.exposure_attestations = Object.fromEntries(
        Object.entries(next.exposure_attestations).map(([coverageKey, attestation]) => [
          coverageKey,
          attestation && typeof attestation === 'object'
            ? { ...attestation, contract_fingerprint: fingerprint }
            : attestation,
        ])
      );
    }
    return next;
  };
  if (rebound.rows) rebound.rows = mapReviewCollection(rebound.rows, rebindRowEntry);

  const rebindCoverageEntry = (entry, key) => {
    const [rowId] = String(key).split('|', 1);
    const row = rowsById.get(canonicalRowId(rowId));
    if (!row) throw new Error(`Review manifest names unknown row ${rowId}`);
    if (!entry || typeof entry !== 'object') return entry;
    return { ...entry, contract_fingerprint: contractFingerprint(row) };
  };
  if (rebound.exposure_attestations) {
    rebound.exposure_attestations = mapReviewCollection(rebound.exposure_attestations, rebindCoverageEntry);
  }

  const stateCollections = {
    listeners: state.listeners ?? [],
    candidates: state.candidates ?? [],
    exclusions: state.exclusions ?? [],
    orphans: state.orphans ?? [],
    requirements: state.requirements?.families ?? [],
  };
  const idFor = {
    listeners: (item) => item.listener_id,
    candidates: (item) => item.path,
    exclusions: (item) => item.id ?? item.exclusion_id ?? item.layer_id,
    orphans: (item) => item.id,
    requirements: (item) => item.id,
  };
  const rebindOffRowCollection = (category, collection) => {
    if (!collection) return collection;
    const byId = new Map((stateCollections[category] ?? []).map((item) => [String(idFor[category](item)), item]));
    return mapReviewCollection(collection, (entry, key) => {
      const id = String(entry?.id ?? entry?.listener_id ?? entry?.path ?? entry?.row_id ?? key);
      const item = byId.get(id);
      if (!item) throw new Error(`Off-row manifest names unknown ${category} entry ${id}`);
      const fingerprint = offRowFingerprint(state, category, item);
      if (category === 'listeners') return { ...entry, fingerprint };
      if (category === 'orphans') return {
        ...entry,
        resolution_fingerprint: fingerprint,
        contract_fingerprint: fingerprint,
      };
      return { ...entry, contract_fingerprint: fingerprint };
    });
  };
  if (rebound.off_row_dispositions) {
    for (const category of Object.keys(stateCollections)) {
      if (rebound.off_row_dispositions[category]) {
        rebound.off_row_dispositions[category] = rebindOffRowCollection(
          category,
          rebound.off_row_dispositions[category],
        );
      }
    }
  }
  return G1ReviewManifestSchema.parse(rebound);
};

const reviewedOffRowFingerprint = (category, review) => category === 'listeners'
  ? review?.fingerprint
  : category === 'orphans'
    ? review?.resolution_fingerprint ?? review?.contract_fingerprint
    : review?.contract_fingerprint ?? review?.fingerprint;

const applyOffRowCollection = (state, category, collection) => {
  const entries = reviewEntryByKey(collection);
  if (entries.size === 0) return [];
  const selected = [];
  const target = category === 'listeners' ? state.listeners
    : category === 'candidates' ? state.candidates
      : category === 'exclusions' ? state.exclusions
        : category === 'orphans' ? state.orphans
          : state.requirements.families;
  const values = Array.isArray(target) ? target : Object.values(target ?? {});
  const idFor = (item) => category === 'listeners' ? item.listener_id
    : category === 'candidates' ? item.path
      : category === 'orphans' ? item.id
        : category === 'requirements' ? item.id
          : item.id ?? item.exclusion_id ?? item.layer_id;
  const byId = new Map(values.map((item) => [String(idFor(item)), item]));
  for (const [key, review] of entries) {
    const id = String(review?.id ?? review?.listener_id ?? review?.path ?? review?.row_id ?? key);
    const item = byId.get(id);
    if (!item) throw new Error(`Off-row manifest names unknown ${category} entry ${id}`);
    if (!review || typeof review !== 'object') throw new Error(`Invalid off-row review ${category}:${id}`);
    const reviewedFingerprint = reviewedOffRowFingerprint(category, review);
    if (typeof reviewedFingerprint !== 'string' || reviewedFingerprint.length === 0) {
      throw new Error(`Off-row manifest fingerprint missing ${category}:${id}`);
    }
    const currentFingerprint = offRowFingerprint(state, category, item);
    if (reviewedFingerprint !== currentFingerprint) {
      throw new Error(`Off-row manifest fingerprint is stale ${category}:${id}`);
    }
    if (category === 'requirements') {
      if (review.absence_evidence) item.absence_evidence = clone(review.absence_evidence);
      if (item.absence_evidence?.status === 'approved') item.absence_evidence.fingerprint = absenceEvidenceFingerprint(item);
    } else {
      for (const field of ['disposition', 'resolution', 'decision_status', 'decision_evidence', 'resolution_evidence']) {
        if (review[field] !== undefined) item[field] = clone(review[field]);
      }
      if (category === 'listeners') item.fingerprint = listenerDispositionFingerprint(item, state.listenerCandidates.find((candidate) => candidate.path === item.candidate_path));
      if (category === 'candidates') item.contract_fingerprint = dormantCandidateFingerprint(item);
      if (category === 'exclusions') item.contract_fingerprint = runtimeExclusionFingerprint(item);
      if (category === 'orphans') {
        item.resolution_fingerprint = orphanResolutionFingerprint(item);
        item.contract_fingerprint = item.resolution_fingerprint;
      }
    }
    selected.push(`${category}:${id}`);
  }
  return selected;
};

const applyOffRowReviews = (state, manifest) => {
  const dispositions = manifest.off_row_dispositions ?? {};
  return [
    ...applyOffRowCollection(state, 'listeners', dispositions.listeners),
    ...applyOffRowCollection(state, 'candidates', dispositions.candidates),
    ...applyOffRowCollection(state, 'exclusions', dispositions.exclusions),
    ...applyOffRowCollection(state, 'orphans', dispositions.orphans),
    ...applyOffRowCollection(state, 'requirements', dispositions.requirements),
  ];
};

const applyClosureReviews = (state, manifest) => {
  const closure = manifest.closure ?? {};
  const rowReviews = closure.rows ?? closure.row_fields ?? {};
  const rowsById = new Map(state.matrix.rows.map((row) => [canonicalRowId(row.id), row]));
  for (const [key, value] of Object.entries(rowReviews)) {
    const row = rowsById.get(canonicalRowId(key));
    if (!row) throw new Error(`Closure manifest names unknown row ${key}`);
    for (const field of ['closure_owner', 'closure_gate', 'closure_acceptance']) {
      if (value?.[field] !== undefined) row[field] = value[field];
    }
  }
};

const loadState = ({ fileSet = files, fsApi = fs, rootDir = repoRoot } = {}) => {
  const matrix = SurfaceMatrixDocumentSchema.parse(readJson(fileSet.matrix, undefined, fsApi));
  const inventory = SourceInventorySchema.parse(readJson(fileSet.inventory, undefined, fsApi));
  const listeners = ListenerDispositionsSchema.parse(readJson(fileSet.listeners, [], fsApi));
  const exclusions = RuntimeExclusionsSchema.parse(readJson(fileSet.exclusions, [], fsApi));
  const state = {
    matrix,
    inventory,
    requirements: RequirementsDocumentSchema.parse(readJson(fileSet.requirements, { families: [] }, fsApi)),
    listeners,
    candidates: readJson(fileSet.candidates, [], fsApi),
    exclusions,
    orphans: readJson(fileSet.orphans, [], fsApi),
    listenerCandidates: discoverHttpListenerCandidates({ rootDir }),
  };
  return state;
};

const resetRowReview = (row) => {
  const suggestions = row.machine_suggestions ?? {};
  row.personas = Array.isArray(suggestions.personas) && suggestions.personas.length > 0 ? clone(suggestions.personas) : ['unknown'];
  row.persistence = suggestions.persistence ?? 'unknown';
  row.destructive = suggestions.destructive ?? 'unknown';
  row.environment = suggestions.environment ?? 'unknown';
  row.owner = suggestions.owner ?? 'unassigned';
  row.classification = 'unclassified';
  row.decision = row.decision_suggestion;
  row.decision_status = 'proposed';
  row.approved_source_hashes = [];
  row.test_evidence = { ...row.test_evidence, manual: [] };
  delete row.decision_override;
  delete row.decision_evidence;
  delete row.seam_override;
  delete row.closure_owner;
  delete row.closure_gate;
  delete row.closure_acceptance;
  delete row.dormant_disposition;
  delete row.anonymous_reachability;
  delete row.effective_auth;
  row.contract_fingerprint = contractFingerprint(row);
};

const freshState = (state) => {
  const next = clone(state);
  next.matrix.rows.forEach(resetRowReview);
  next.matrix.phase = 'authoring';
  next.matrix.coverage_review = {};
  delete next.matrix.g1_closure;
  // Listener dispositions are regenerated from discovery after --fresh. An
  // empty, schema-valid artifact prevents stale human choices from surviving
  // the reset while preserving the required regeneration order.
  next.listeners = [];
  for (const entry of next.candidates) {
    entry.decision_status = 'proposed';
    delete entry.decision_evidence;
    delete entry.disposition_evidence;
    delete entry.resolution_evidence;
    delete entry.disposition;
    delete entry.contract_fingerprint;
  }
  for (const entry of next.exclusions) {
    entry.decision_status = 'proposed';
    delete entry.decision_evidence;
    delete entry.disposition;
    delete entry.resolution;
    delete entry.disposition_evidence;
    delete entry.resolution_evidence;
    delete entry.contract_fingerprint;
    delete entry.fingerprint;
  }
  for (const entry of next.orphans) {
    entry.decision_status = 'proposed';
    delete entry.decision_evidence;
    delete entry.disposition;
    delete entry.disposition_evidence;
    delete entry.resolution;
    delete entry.resolution_evidence;
    delete entry.last_contract_fingerprint;
    delete entry.resolution_fingerprint;
    delete entry.contract_fingerprint;
  }
  // Absence evidence carries an authored proposal (selector, result, evidence)
  // plus review state (status, fingerprint). Fresh discards only the review
  // state; deleting the whole block would make validate-matrix reject every
  // empty optional family before init-review can restore it.
  for (const family of next.requirements.families ?? []) {
    if (!family.absence_evidence) continue;
    family.absence_evidence.status = 'proposed';
    delete family.absence_evidence.fingerprint;
    delete family.absence_evidence.contract_fingerprint;
  }
  return next;
};

const validateCandidate = async (
  state,
  candidate,
  { closeG1 = false, resetSafe = false, rootDir = repoRoot } = {},
) => {
  const errors = [];
  let baseline;
  if (!resetSafe) {
    try {
      // This is read-only and covers source hashes, inventory mappings, registry
      // coverage, KG reconciliation, scheduler/listener discovery, and the
      // current off-row integrity baseline before candidate validation.
      baseline = await validateMatrix({ writeMetadata: false });
    } catch (error) {
      errors.push(`source/inventory validation: ${error.message}`);
    }
  }
  try {
    SurfaceMatrixDocumentSchema.parse(candidate);
    SourceInventorySchema.parse(state.inventory);
    ListenerDispositionsSchema.parse(state.listeners);
    DormantCandidatesSchema.parse(state.candidates);
    RuntimeExclusionsSchema.parse(state.exclusions);
    OrphansSchema.parse(state.orphans);
    RequirementsDocumentSchema.parse(state.requirements);
  } catch (error) {
    errors.push(`candidate/off-row schema validation: ${error.message}`);
  }
  const discoveredRoles = resetSafe ? [] : discoverAuthRoleEvidence({ rootDir }).roles;
  if (!resetSafe) {
    try {
      assertAuthRoleMappingExhaustive(discoveredRoles, AUTH_IDENTITY_PERSONA_MAPPING);
    } catch (error) {
      errors.push(`role validation: ${error.message}`);
    }
    errors.push(...validateOffRowFingerprints({
      listeners: state.listeners,
      candidates: state.candidates,
      exclusions: state.exclusions,
      orphans: state.orphans,
      requirements: state.requirements,
      discoveredListeners: state.listenerCandidates,
    }));
    errors.push(...validateRowIntegrity({ document: candidate, inventory: state.inventory }));
  }
  let families = [];
  try {
    families = matchRequirementFamilies(state.requirements, candidate.rows);
  } catch (error) {
    errors.push(`requirement validation: ${error.message}`);
  }
  const closure = resetSafe ? { passed: true, issues: {}, families } : closureReport({
    document: candidate,
    requirements: state.requirements,
    listeners: state.listeners,
    candidates: state.candidates,
    exclusions: state.exclusions,
    orphans: state.orphans,
    discoveredRoles,
    inventory: state.inventory,
  });
  if (closeG1 && !resetSafe) {
    if (!closure.passed) errors.push(`G1 closure blockers: ${JSON.stringify(closure.issues)}`);
    const closedErrors = validateClosedPhaseInvariants({ document: candidate, requirements: state.requirements, families });
    errors.push(...closedErrors);
  }
  return { errors, baseline, closure, coverage: coverageObligations(candidate) };
};

const renderState = (state) => renderMatrix({
  matrix: state.matrix,
  requirements: state.requirements,
  listeners: state.listeners,
  candidates: state.candidates,
  exclusions: state.exclusions,
  orphans: state.orphans,
});

const writeState = (
  state,
  rendered,
  {
    reviewFile,
    reviewManifest,
    deleteReview = false,
    fileSet = files,
    matrixDir: targetMatrixDir = matrixDir,
    fsApi = fs,
  } = {},
) => {
  SurfaceMatrixDocumentSchema.parse(state.matrix);
  SourceInventorySchema.parse(state.inventory);
  ListenerDispositionsSchema.parse(state.listeners);
  DormantCandidatesSchema.parse(state.candidates);
  RuntimeExclusionsSchema.parse(state.exclusions);
  OrphansSchema.parse(state.orphans);
  RequirementsDocumentSchema.parse(state.requirements);
  const matrixArtifact = { ...state.matrix };
  delete matrixArtifact.orphans;
  const writes = [
    [fileSet.matrix, matrixArtifact],
    [fileSet.requirements, state.requirements],
    [fileSet.listeners, state.listeners],
    [fileSet.candidates, state.candidates],
    [fileSet.exclusions, state.exclusions],
    [fileSet.orphans, state.orphans],
    [fileSet.render, rendered],
  ];
  if (reviewFile && reviewManifest) writes.push([reviewFile, reviewManifest]);
  const deletes = [fileSet.authOverrides];
  if (deleteReview && reviewFile) deletes.push(reviewFile);
  assertReviewFileSafe({ reviewFile, fileSet, baseDir: targetMatrixDir, fsApi });
  atomicWriteSet({ writes, deletes, fsApi, baseDir: targetMatrixDir });
};

const initReview = async (
  args,
  { fileSet = files, fsApi = fs, rootDir = repoRoot, matrixDir: targetMatrixDir = matrixDir } = {},
) => {
  const state = loadState({ fileSet, fsApi, rootDir });
  const validation = await validateCandidate(state, state.matrix, { rootDir });
  if (validation.errors.length > 0) throw new Error(`Review initialization validation failed:\n${validation.errors.join('\n')}`);
  const rows = Object.fromEntries(state.matrix.rows
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((row) => [row.id, {
      row_id: row.id,
      contract_fingerprint: contractFingerprint(row),
      source_fingerprints: sourceFingerprintsForRow(row, state.inventory),
      reviewed_fields: {},
      exposure_attestations: Object.fromEntries((row.exposures ?? []).map((exposure) => [
        `${exposure.deployment}|${exposure.runtime}`,
        {
          test_coverage: 'unreviewed',
          contract_fingerprint: contractFingerprint(row),
        },
      ])),
    }]));
  const offRow = {
    listeners: Object.fromEntries(state.listeners.map((entry) => [entry.listener_id, {
      listener_id: entry.listener_id,
      candidate_path: entry.candidate_path,
      disposition: entry.disposition,
      decision_status: entry.decision_status ?? 'proposed',
      fingerprint: entry.fingerprint,
    }])),
    candidates: Object.fromEntries(state.candidates.map((entry) => [entry.path, {
      path: entry.path,
      disposition: entry.disposition,
      decision_status: entry.decision_status ?? 'proposed',
      contract_fingerprint: entry.contract_fingerprint ?? entry.fingerprint,
    }])),
    exclusions: Object.fromEntries(state.exclusions.map((entry) => [entry.id ?? entry.exclusion_id ?? entry.layer_id, {
      ...entry,
      decision_status: entry.decision_status ?? 'proposed',
    }])),
    orphans: Object.fromEntries(state.orphans.map((entry) => [entry.id, {
      id: entry.id,
      resolution: entry.resolution,
      decision_status: entry.decision_status ?? 'proposed',
      resolution_fingerprint: entry.resolution_fingerprint ?? orphanResolutionFingerprint(entry),
    }])),
    requirements: Object.fromEntries((state.requirements.families ?? []).map((entry) => [entry.id, {
      id: entry.id,
      absence_evidence: entry.absence_evidence,
      contract_fingerprint: absenceEvidenceFingerprint(entry),
    }])),
  };
  const review = {
    schema_version: '1.0.0',
    review_id: 'g1',
    snapshot_id: state.inventory.snapshot_id,
    source_fingerprints: state.inventory.source_hashes,
    rows,
    persona_mappings: AUTH_IDENTITY_PERSONA_MAPPING,
    off_row_dispositions: offRow,
    closure: { rows: {} },
    approver_id: 'REQUIRED',
    evidence_ref: 'REQUIRED',
  };
  G1ReviewManifestSchema.parse(review);
  const result = {
    command: 'init-review',
    dry_run: args.dryRun,
    review_file: args.reviewFile,
    rows: Object.keys(rows).length,
    source_fingerprints: Object.keys(review.source_fingerprints).length,
    coverage_obligations: validation.coverage.length,
  };
  if (!args.dryRun) atomicWriteSet({
    writes: [[args.reviewFile, review]],
    deletes: [fileSet.authOverrides],
    fsApi,
    baseDir: targetMatrixDir,
  });
  return result;
};

export async function approveMatrix(argv = process.argv.slice(2), options = {}) {
  const fileSet = options.files ?? files;
  const targetMatrixDir = options.matrixDir ?? path.dirname(fileSet.matrix);
  const rootDir = options.repoRoot ?? repoRoot;
  const fsApi = options.fsApi ?? fs;
  const args = parseArgs(argv, {
    matrixDir: targetMatrixDir,
    defaultReviewFile: fileSet.review,
    pathRoot: rootDir,
    fsApi,
  });
  assertReviewFileSafe({ reviewFile: args.reviewFile, fileSet, baseDir: targetMatrixDir, fsApi });
  if (args.command === 'init-review') return initReview(args, {
    fileSet,
    fsApi,
    rootDir,
    matrixDir: targetMatrixDir,
  });

  let state = loadState({ fileSet, fsApi, rootDir });
  if (args.fresh) {
    state = freshState(state);
    const validation = await validateCandidate(state, state.matrix, { resetSafe: true, rootDir });
    if (validation.errors.length > 0) throw new Error(`Fresh reset validation failed:\n${validation.errors.join('\n')}`);
    const rendered = renderState(state);
    const result = {
      command: 'fresh',
      dry_run: args.dryRun,
      phase: state.matrix.phase,
      rows_reset: state.matrix.rows.length,
      coverage_obligations: validation.coverage.length,
      render_sha256: sha256(rendered),
    };
    if (!args.dryRun) writeState(state, rendered, {
      reviewFile: args.reviewFile,
      deleteReview: true,
      fileSet,
      matrixDir: targetMatrixDir,
      fsApi,
    });
    return result;
  }

  const manifest = G1ReviewManifestSchema.parse(readJson(args.reviewFile, undefined, fsApi));
  const { reviewedRowIds } = verifyManifestKeys(manifest, state, args);
  const candidateState = clone(state);
  applyPersonaMappings(candidateState.matrix.rows, manifest);
  const { reviewedRowIds: selectedRows, coverageKeys } = applyRowReviews(candidateState, manifest, args);
  const selectedOffRows = applyOffRowReviews(candidateState, manifest);
  applyClosureReviews(candidateState, manifest);
  candidateState.matrix.rows.forEach((row) => {
    row.contract_fingerprint = contractFingerprint(row);
    if (row.decision_status === 'approved') row.approved_source_hashes = sourceFingerprintsForRow(row, candidateState.inventory);
  });
  bindCoverageFingerprints(candidateState, coverageKeys);

  if (args.closeG1) {
    if (candidateState.matrix.phase === 'closed') throw new Error('Matrix phase is already closed');
    candidateState.matrix.phase = 'closed';
    candidateState.matrix.g1_closure = {
      owner: manifest.closure?.owner ?? manifest.closure?.closure_owner,
      gate: manifest.closure?.gate ?? manifest.closure?.closure_gate,
      acceptance: manifest.closure?.acceptance ?? manifest.closure?.closure_acceptance,
      approver_id: manifest.approver_id,
      evidence_ref: manifest.evidence_ref,
      source_fingerprints: manifest.source_fingerprints,
      requirements_sha256: sha256(stableJson(candidateState.requirements)),
      families: Object.fromEntries(matchRequirementFamilies(candidateState.requirements, candidateState.matrix.rows)
        .map((family) => [family.id, family.matched_ids])),
    };
  }
  const validation = await validateCandidate(candidateState, candidateState.matrix, {
    closeG1: args.closeG1,
    rootDir,
  });
  if (validation.errors.length > 0) throw new Error(`Approval validation failed:\n${validation.errors.join('\n')}`);
  const rendered = renderState(candidateState);
  const result = {
    command: 'approve',
    dry_run: args.dryRun,
    close_g1: args.closeG1,
    phase: candidateState.matrix.phase,
    reviewed_rows: selectedRows.length,
    manifest_rows: reviewedRowIds.size,
    reviewed_off_rows: selectedOffRows.length,
    coverage_obligations: validation.coverage.length,
    coverage_gaps: validation.coverage.filter((obligation) => obligation.status === 'gap').length,
    closure: {
      passed: validation.closure.passed,
      issue_counts: Object.fromEntries(Object.entries(validation.closure.issues)
        .map(([key, values]) => [key, values.length])),
    },
    render_sha256: sha256(rendered),
  };
  if (!args.dryRun) {
    const reviewManifest = args.closeG1 ? undefined : rebindReviewManifest(manifest, candidateState);
    writeState(candidateState, rendered, {
      reviewFile: reviewManifest ? args.reviewFile : undefined,
      reviewManifest,
      fileSet,
      matrixDir: targetMatrixDir,
      fsApi,
    });
  }
  return result;
}

export const approveMatrixInWorkspace = (argv = process.argv.slice(2), options = {}) => approveMatrix(argv, options);

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  approveMatrix().then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
