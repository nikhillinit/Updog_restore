import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  AUTH_IDENTITY_PERSONA_MAPPING,
  CONTRACT_FINGERPRINT_FIELDS,
  DormantCandidatesSchema,
  ListenerDispositionsSchema,
  OrphansSchema,
  RequirementsDocumentSchema,
  RuntimeExclusionsSchema,
  SurfaceMatrixDocumentSchema,
  contractFingerprintPayload,
} from '../matrix-schema.mjs';
import { coverageObligations } from './validate-matrix.mjs';

const scriptPath = fileURLToPath(import.meta.url);
export const matrixDir = path.resolve(path.dirname(scriptPath), '..');
export const matrixPath = path.join(matrixDir, 'matrix.json');
export const renderPath = path.join(matrixDir, 'MATRIX.md');

const json = (fileName, fallback) => {
  const filePath = path.join(matrixDir, fileName);
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

const markdownCell = (value) => String(value ?? '—')
  .replaceAll('|', '\\|')
  .replaceAll('\n', '<br>');

const evidenceText = (value) => {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
};

const lifecycle = (artifact) => artifact?.decision_status ?? artifact?.status ?? 'proposed';

const rowEvidence = (row) => (row.evidence ?? []).map(evidenceText).join('; ') || '—';

const fingerprintFieldValue = (payload, field) => {
  const segments = field.split('.');
  const select = (value, remaining) => {
    if (remaining.length === 0) return value;
    const [segment, ...rest] = remaining;
    if (segment.endsWith('[]')) {
      const collection = value?.[segment.slice(0, -2)];
      return Array.isArray(collection) ? collection.map((entry) => select(entry, rest)) : [];
    }
    return select(value?.[segment], rest);
  };
  return select(payload, segments);
};

const renderFingerprintPayload = (rows) => {
  const lines = [
    '## Contract fingerprint payload',
    '',
    `Schema-defined fingerprint fields: **${CONTRACT_FINGERPRINT_FIELDS.length}**.`,
    '',
    '| Row | Fingerprint field | Value |',
    '| --- | --- | --- |',
  ];
  for (const row of [...rows].sort((left, right) => left.id.localeCompare(right.id))) {
    const payload = contractFingerprintPayload(row);
    for (const field of CONTRACT_FINGERPRINT_FIELDS) {
      lines.push(`| ${markdownCell(row.id)} | ${markdownCell(field)} | ${markdownCell(evidenceText(fingerprintFieldValue(payload, field)))} |`);
    }
  }
  lines.push('');
  return lines;
};

const renderApprovalFields = (rows) => {
  const lines = [
    '## Approval and closure fields',
    '',
    '| Row | Seam override | Personas | Persistence | Destructive | Environment | Classification | Decision override | Decision | Decision status | Decision evidence | Owner | Closure owner | Closure gate | Closure acceptance | Dormant disposition | Anonymous reachability | Effective auth | Row auth evidence | Exposure auth evidence | Manual test evidence | Contract fingerprint | Approved source hashes |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const row of [...rows].sort((left, right) => left.id.localeCompare(right.id))) {
    const exposureAuth = (row.exposures ?? [])
      .map((exposure) => `${exposure.deployment}/${exposure.runtime}: ${evidenceText(exposure.auth_evidence ?? [])}`)
      .join('<br>');
    lines.push(`| ${markdownCell(row.id)} | ${markdownCell(row.seam_override)} | ${markdownCell((row.personas ?? []).join(', '))} | ${markdownCell(row.persistence)} | ${markdownCell(row.destructive)} | ${markdownCell(row.environment)} | ${markdownCell(row.classification)} | ${markdownCell(row.decision_override)} | ${markdownCell(row.decision)} | ${markdownCell(row.decision_status)} | ${markdownCell(evidenceText(row.decision_evidence))} | ${markdownCell(row.owner)} | ${markdownCell(row.closure_owner)} | ${markdownCell(row.closure_gate)} | ${markdownCell(row.closure_acceptance)} | ${markdownCell(evidenceText(row.dormant_disposition))} | ${markdownCell(row.anonymous_reachability)} | ${markdownCell(evidenceText(row.effective_auth))} | ${markdownCell(evidenceText(row.auth_evidence ?? []))} | ${markdownCell(exposureAuth)} | ${markdownCell((row.test_evidence?.manual ?? []).map(evidenceText).join('<br>'))} | ${markdownCell(row.contract_fingerprint)} | ${markdownCell((row.approved_source_hashes ?? []).join('<br>'))} |`);
  }
  lines.push('');
  return lines;
};

const renderCoverageObligations = (document) => {
  const obligations = coverageObligations(document);
  const counts = Object.fromEntries(['confirmed', 'none-reviewed', 'gap'].map((status) => [
    status,
    obligations.filter((obligation) => obligation.status === status).length,
  ]));
  const lines = [
    '## Coverage obligations',
    '',
    `Exposure obligations: **${obligations.length}** (confirmed: **${counts.confirmed}**, none-reviewed: **${counts['none-reviewed']}**, gaps: **${counts.gap}**).`,
    '',
    '| Row | Deployment | Runtime | Status | Attestation | Contract fingerprint | Test evidence / review evidence |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const obligation of obligations.sort((left, right) => left.key.localeCompare(right.key))) {
    const evidence = obligation.evidence.map((item) => `${item.assertion_evidence} (${item.test_file_sha256})`);
    if (obligation.review_evidence) evidence.push(`review: ${evidenceText(obligation.review_evidence)}`);
    lines.push(`| ${markdownCell(obligation.row_id)} | ${markdownCell(obligation.deployment)} | ${markdownCell(obligation.runtime)} | ${markdownCell(obligation.status)} | ${markdownCell(obligation.attestation)} | ${markdownCell(obligation.contract_fingerprint)} | ${markdownCell(evidence.join('<br>'))} |`);
  }
  lines.push('');
  return lines;
};

const renderPersonaMapping = () => {
  const lines = [
    '## Persona mapping',
    '',
    '| Auth identity | Matrix persona | Decided | Evidence |',
    '| --- | --- | --- | --- |',
  ];
  for (const [role, mapping] of Object.entries(AUTH_IDENTITY_PERSONA_MAPPING).sort(([left], [right]) => left.localeCompare(right))) {
    lines.push(`| ${markdownCell(role)} | ${markdownCell(mapping.persona)} | ${markdownCell(mapping.decided ? 'yes' : 'no')} | ${markdownCell(mapping.evidence)} |`);
  }
  lines.push('');
  return lines;
};

const renderClassificationCompleteness = (rows) => {
  const count = (predicate) => rows.filter(predicate).length;
  const counters = [
    ['Rows', rows.length],
    ['Classified', count((row) => row.classification === 'classified')],
    ['Unclassified', count((row) => row.classification === 'unclassified')],
    ['Proposed decisions', count((row) => row.decision_status === 'proposed')],
    ['Approved decisions', count((row) => row.decision_status === 'approved')],
    ['Unknown personas', count((row) => (row.personas ?? []).includes('unknown'))],
    ['Unknown persistence', count((row) => ['unknown', 'unassigned'].includes(row.persistence))],
    ['Unknown destructive state', count((row) => ['unknown', 'unassigned'].includes(row.destructive))],
    ['Unknown environment', count((row) => row.environment === 'unknown')],
    ['Unassigned owners', count((row) => row.owner === 'unassigned')],
    ['Missing closure fields', count((row) => row.decision === 'keep-and-prove' && row.proven_reachability === 'none'
      && (!row.closure_owner || !row.closure_gate || !row.closure_acceptance))],
  ];
  return [
    '## Classification completeness',
    '',
    '| Counter | Count |',
    '| --- | ---: |',
    ...counters.map(([label, value]) => `| ${label} | ${value} |`),
    '',
  ];
};

const renderCoverageGaps = (document) => {
  const gaps = coverageObligations(document).filter((obligation) => obligation.status === 'gap');
  const lines = [
    '## Coverage gaps',
    '',
    'This standing section is evaluated during ordinary authoring as well as tentative closure.',
    '',
    `Unresolved exposure obligations: **${gaps.length}**.`,
    '',
  ];
  if (gaps.length === 0) {
    lines.push('- None.', '');
    return lines;
  }
  lines.push('| Row | Deployment | Runtime | Required resolution |', '| --- | --- | --- | --- |');
  for (const gap of gaps.sort((left, right) => left.key.localeCompare(right.key))) {
    lines.push(`| ${markdownCell(gap.row_id)} | ${markdownCell(gap.deployment)} | ${markdownCell(gap.runtime)} | Confirmed test evidence with stable hash or reviewed none-reviewed attestation |`);
  }
  lines.push('');
  return lines;
};

const renderRows = (rows) => {
  const groups = new Map();
  for (const row of [...rows].sort((left, right) => left.id.localeCompare(right.id))) {
    const group = row.seam || 'unseamed';
    groups.set(group, [...(groups.get(group) ?? []), row]);
  }
  const output = [];
  for (const [seam, seamRows] of [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    output.push(`### ${seam}`, '', '| ID | Interface | Reachability | Personas | Owner | Decision | Status | Evidence |', '| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const row of seamRows) {
      output.push(`| ${markdownCell(row.id)} | ${markdownCell(row.interface)} | ${markdownCell(row.reachability)} / ${markdownCell(row.proven_reachability)} | ${markdownCell((row.personas ?? []).join(', '))} | ${markdownCell(row.owner)} | ${markdownCell(row.decision_override ?? row.decision)} | ${markdownCell(row.decision_status)} | ${markdownCell(rowEvidence(row))} |`);
    }
    output.push('');
  }
  return output;
};

const artifactLine = (kind, id, artifact) => {
  const evidence = artifact?.decision_evidence ?? artifact?.evidence ?? artifact?.rationale ?? '—';
  return `- **${kind}** \`${id}\` — lifecycle: **${lifecycle(artifact)}** — evidence: ${markdownCell(evidenceText(evidence))}`;
};

const renderOffRowDecisions = ({ matrix, requirements, listeners, candidates, exclusions, orphans }) => {
  const lines = ['## Decisions required', '', 'Every proposed row and every exclusion/disposition below requires evidenced approval before G1 closes.', ''];
  const proposedRows = matrix.rows.filter((row) => row.decision_status === 'proposed');
  lines.push(`### Proposed rows (${proposedRows.length})`, '');
  for (const row of proposedRows.sort((left, right) => left.id.localeCompare(right.id))) {
    lines.push(artifactLine('row', row.id, row));
  }
  if (proposedRows.length === 0) lines.push('- None.');
  lines.push('', '### Runtime exclusions', '');
  const exclusionEntries = Array.isArray(exclusions)
    ? exclusions.map((value) => [value.id ?? value.exclusion_id ?? value.layer_id ?? JSON.stringify(value), value])
    : Object.entries(exclusions ?? {});
  for (const [id, value] of exclusionEntries.sort(([left], [right]) => left.localeCompare(right))) lines.push(artifactLine('runtime exclusion', id, value));
  if (exclusionEntries.length === 0) lines.push('- None.');
  lines.push('', '### Listener dispositions', '');
  const parsedListeners = ListenerDispositionsSchema.parse(listeners ?? []);
  for (const listener of parsedListeners.sort((left, right) => left.listener_id.localeCompare(right.listener_id))) {
    lines.push(artifactLine(`listener ${listener.disposition}`, listener.listener_id, listener));
  }
  if (parsedListeners.length === 0) lines.push('- None.');
  lines.push('', '### Dormant candidate dispositions', '');
  const candidateEntries = candidates ?? [];
  for (const candidate of candidateEntries.sort((left, right) => left.path.localeCompare(right.path))) lines.push(artifactLine('dormant candidate', candidate.path, candidate));
  if (candidateEntries.length === 0) lines.push('- None.');
  lines.push('', '### Orphan resolutions', '');
  const orphanEntries = orphans ?? [];
  for (const orphan of orphanEntries.sort((left, right) => left.id.localeCompare(right.id))) lines.push(artifactLine('orphan', orphan.id, orphan));
  if (orphanEntries.length === 0) lines.push('- None.');
  lines.push('', '### Optional absence evidence', '');
  const absenceEntries = (requirements?.families ?? []).filter((family) => family.optional_when_absent && family.absence_evidence);
  for (const family of absenceEntries.sort((left, right) => left.id.localeCompare(right.id))) lines.push(artifactLine('absence', family.id, family.absence_evidence));
  if (absenceEntries.length === 0) lines.push('- None.');
  lines.push('');
  return lines;
};

export function renderMatrix({ matrix, requirements, listeners, candidates, exclusions, orphans } = {}) {
  const document = SurfaceMatrixDocumentSchema.parse(matrix ?? json('matrix.json', undefined));
  const requirementDocument = RequirementsDocumentSchema.parse(requirements ?? json('requirements.json', { families: [] }));
  const listenerDocument = listeners ?? json('listener-dispositions.json', []);
  const candidateDocument = DormantCandidatesSchema.parse(candidates ?? json('dormant-candidates.json', []));
  const exclusionDocument = RuntimeExclusionsSchema.parse(exclusions ?? json('runtime-exclusions.json', []));
  // orphans.json is authoritative. Matrix rows never carry a second orphan copy.
  const orphanDocument = OrphansSchema.parse(orphans ?? json('orphans.json', []));
  const lines = [
    '# Surface Contract Matrix',
    '',
    `Phase: **${document.phase}**`,
    `Schema: **${document.schema_version}**`,
    `Provenance: git **${document.provenance.git_head}**, KG snapshot **${document.provenance.snapshot_id}**`,
    '',
    '## Contract rows',
    '',
    ...renderRows(document.rows),
    ...renderApprovalFields(document.rows),
    ...renderFingerprintPayload(document.rows),
    ...renderCoverageObligations(document),
    ...renderPersonaMapping(),
    ...renderClassificationCompleteness(document.rows),
    ...renderCoverageGaps(document),
    ...renderOffRowDecisions({
      matrix: document,
      requirements: requirementDocument,
      listeners: listenerDocument,
      candidates: candidateDocument,
      exclusions: exclusionDocument,
      orphans: orphanDocument,
    }),
  ];
  return `${lines.join('\n').replaceAll(/[ \t]+\n/g, '\n').trimEnd()}\n`;
}

export function writeRenderedMatrix(options = {}) {
  const output = renderMatrix(options);
  fs.writeFileSync(options.outputPath ?? renderPath, output);
  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  writeRenderedMatrix();
}
