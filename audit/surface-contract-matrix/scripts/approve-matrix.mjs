import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  AUTH_ROLE_PERSONA_MAPPING,
  absenceEvidenceFingerprint,
  dormantCandidateFingerprint,
  SurfaceMatrixDocumentSchema,
  canonicalRowId,
  contractFingerprint,
  listenerDispositionFingerprint,
  orphanResolutionFingerprint,
  runtimeExclusionFingerprint,
} from '../matrix-schema.mjs';
import {
  closureReport,
  validateClosedPhaseInvariants,
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
};

const readJson = (filePath, fallback) => fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : fallback;
const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, stableValue(entry)]));
  return value;
};
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const sourceHash = (source, inventory) => {
  const hash = inventory.source_hashes?.[source];
  return hash ? `${source}=${hash}` : undefined;
};

const parseArgs = (argv) => {
  const result = { rows: [], seams: [], exclusions: [], candidates: [], listeners: [], orphans: [], absences: [], dryRun: false, closeG1: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') result.dryRun = true;
    else if (argument === '--close-g1') result.closeG1 = true;
    else if (argument === '--evidence') result.evidence = argv[++index];
    else if (argument === '--row') result.rows.push(argv[++index]);
    else if (argument === '--seam') result.seams.push(argv[++index]);
    else if (argument === '--exclusion') result.exclusions.push(argv[++index]);
    else if (argument === '--candidate') result.candidates.push(argv[++index]);
    else if (argument === '--listener') result.listeners.push(argv[++index]);
    else if (argument === '--orphan') result.orphans.push(argv[++index]);
    else if (argument === '--absence') result.absences.push(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!result.evidence) throw new Error('--evidence is required');
  if (!result.closeG1 && result.rows.length + result.seams.length + result.exclusions.length + result.candidates.length + result.listeners.length + result.orphans.length + result.absences.length === 0) throw new Error('Select rows, seams, or an off-row artifact');
  return result;
};

const approvedSourceHashes = (row, inventory) => [...new Set([
  ...(inventory.row_to_sources?.[row.id] ?? []),
  ...(row.source_mapping?.source_file ? [row.source_mapping.source_file] : []),
  ...(row.source_mapping?.function_file ? [row.source_mapping.function_file] : []),
])].map((source) => sourceHash(source, inventory)).filter(Boolean).sort();

const findOrFail = (items, predicate, description) => {
  const item = items.find(predicate);
  if (!item) throw new Error(`No ${description} matched selector`);
  return item;
};

const approvalFields = (evidence, fingerprint) => ({ decision_status: 'approved', decision_evidence: evidence, ...(fingerprint ? { contract_fingerprint: fingerprint } : {}) });

const buildChanges = (argumentsValue, state) => {
  const selectedRows = new Set(argumentsValue.rows.map(canonicalRowId));
  for (const seam of argumentsValue.seams) for (const row of state.matrix.rows) if (row.seam === seam) selectedRows.add(row.id);
  const selected = [];
  for (const row of state.matrix.rows) {
    if (!selectedRows.has(row.id)) continue;
    const updated = { ...row, ...approvalFields(argumentsValue.evidence, contractFingerprint(row)) };
    updated.approved_source_hashes = approvedSourceHashes(updated, state.inventory);
    state.matrix.rows[state.matrix.rows.indexOf(row)] = updated;
    selected.push({ kind: 'row', id: row.id });
  }
  for (const selector of argumentsValue.listeners) {
    const listener = findOrFail(state.listeners, (entry) => entry.listener_id === selector, `listener ${selector}`);
    const candidate = state.listenerCandidates.find((entry) => entry.path === listener.candidate_path);
    Object.assign(listener, approvalFields(argumentsValue.evidence), {
      fingerprint: listenerDispositionFingerprint(listener, candidate),
    });
    selected.push({ kind: 'listener', id: selector });
  }
  for (const selector of argumentsValue.candidates) {
    const candidate = findOrFail(state.candidates, (entry) => entry.path === selector, `candidate ${selector}`);
    candidate.disposition = candidate.disposition ?? 'not-surface';
    Object.assign(candidate, approvalFields(argumentsValue.evidence, dormantCandidateFingerprint(candidate)));
    selected.push({ kind: 'candidate', id: selector });
  }
  for (const selector of argumentsValue.exclusions) {
    const exclusion = Array.isArray(state.exclusions)
      ? findOrFail(state.exclusions, (entry) => (entry.id ?? entry.exclusion_id ?? entry.layer_id) === selector, `exclusion ${selector}`)
      : state.exclusions[selector];
    if (!exclusion) throw new Error(`No exclusion ${selector} matched selector`);
    Object.assign(exclusion, approvalFields(argumentsValue.evidence, runtimeExclusionFingerprint(exclusion)));
    selected.push({ kind: 'exclusion', id: selector });
  }
  for (const selector of argumentsValue.orphans) {
    const orphan = findOrFail(state.orphans, (entry) => entry.id === selector, `orphan ${selector}`);
    orphan.resolution = orphan.resolution === 'retained' ? 'retained' : 'pruned';
    orphan.resolution_evidence = argumentsValue.evidence;
    Object.assign(orphan, approvalFields(argumentsValue.evidence, orphanResolutionFingerprint(orphan)));
    orphan.resolution_fingerprint = orphan.contract_fingerprint;
    selected.push({ kind: 'orphan', id: selector });
  }
  for (const selector of argumentsValue.absences) {
    const family = findOrFail(state.requirements.families, (entry) => entry.id === selector, `absence family ${selector}`);
    family.absence_evidence = { status: 'approved', evidence: argumentsValue.evidence, search_selector: family.selector };
    family.absence_evidence.fingerprint = absenceEvidenceFingerprint(family);
    selected.push({ kind: 'absence', id: selector });
  }
  return selected;
};

const closureState = (state) => closureReport({
  document: state.matrix,
  requirements: state.requirements,
  listeners: state.listeners,
  candidates: state.candidates,
  exclusions: state.exclusions,
  orphans: state.orphans,
  discoveredRoles: state.discoveredRoles ?? Object.keys(AUTH_ROLE_PERSONA_MAPPING),
});

const closureSummary = (closure) => ({
  passed: closure.passed,
  issue_counts: Object.fromEntries(Object.entries(closure.issues).map(([key, values]) => [key, values.length])),
  requirement_match_counts: Object.fromEntries(closure.families.map((family) => [family.id, family.matched_ids.length])),
});

export function validateTentativeClosedState(state, evidence) {
  const closure = closureState(state);
  if (!closure.passed) throw new Error(`G1 closure checks failed:\n${JSON.stringify(closure.issues, null, 2)}`);
  const normalizedRequirementsHash = sha256(JSON.stringify(stableValue(state.requirements)));
  const tentative = {
    ...state.matrix,
    phase: 'closed',
    g1_closure: {
      evidence,
      requirements_sha256: normalizedRequirementsHash,
      families: Object.fromEntries(closure.families.map((family) => [family.id, family.matched_ids])),
    },
  };
  const errors = [
    ...validateOffRowFingerprints({
      listeners: state.listeners,
      candidates: state.candidates,
      exclusions: state.exclusions,
      orphans: state.orphans,
      requirements: state.requirements,
      discoveredListeners: state.listenerCandidates,
    }),
    ...validateRowIntegrity({ document: tentative }),
    ...validateClosedPhaseInvariants({
      document: tentative,
      requirements: state.requirements,
      families: closure.families,
    }),
  ];
  if (errors.length > 0) throw new Error(`G1 closed-phase validation failed:\n${errors.join('\n')}`);
  return { tentative, closure };
}

const atomicWrites = (writes) => {
  const temporary = [];
  try {
    for (const [filePath, value] of writes) {
      const temporaryPath = `${filePath}.tmp-${process.pid}`;
      fs.writeFileSync(temporaryPath, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
      temporary.push([temporaryPath, filePath]);
    }
    for (const [temporaryPath, filePath] of temporary) fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    for (const [temporaryPath] of temporary) if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    throw error;
  }
};

export async function approveMatrix(argv = process.argv.slice(2)) {
  const argumentsValue = parseArgs(argv);
  const state = {
    matrix: SurfaceMatrixDocumentSchema.parse(readJson(files.matrix)),
    inventory: readJson(files.inventory),
    requirements: readJson(files.requirements),
    listeners: readJson(files.listeners, []),
    candidates: readJson(files.candidates, []),
    exclusions: readJson(files.exclusions, []),
    orphans: readJson(files.orphans, []),
    listenerCandidates: [],
  };
  const { discoverHttpListenerCandidates } = await import('../matrix-schema.mjs');
  state.listenerCandidates = discoverHttpListenerCandidates({ rootDir: repoRoot });
  const selected = buildChanges(argumentsValue, state);
  if (argumentsValue.closeG1) {
    if (state.matrix.phase === 'closed') throw new Error('Matrix phase is already closed');
    const closed = validateTentativeClosedState(state, argumentsValue.evidence);
    state.matrix = closed.tentative;
  }
  const rendered = renderMatrix({ matrix: state.matrix, requirements: state.requirements, listeners: state.listeners, candidates: state.candidates, exclusions: state.exclusions, orphans: state.orphans });
  const result = { dry_run: argumentsValue.dryRun, selected, close_g1: argumentsValue.closeG1, phase: state.matrix.phase, closure: closureSummary(closureState(state)), render_sha256: sha256(rendered) };
  if (!argumentsValue.dryRun) {
    const matrixArtifact = { ...state.matrix };
    delete matrixArtifact.orphans;
    atomicWrites([
      [files.matrix, matrixArtifact],
      [files.requirements, state.requirements],
      [files.listeners, state.listeners],
      [files.candidates, state.candidates],
      [files.exclusions, state.exclusions],
      [files.orphans, state.orphans],
      [files.render, rendered],
    ]);
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  approveMatrix().then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
