import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  ListenerDispositionsSchema,
  RuntimeExclusionsSchema,
  SurfaceMatrixDocumentSchema,
} from '../matrix-schema.mjs';

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
  const requirementDocument = requirements ?? json('requirements.json', { families: [] });
  const listenerDocument = listeners ?? json('listener-dispositions.json', []);
  const candidateDocument = candidates ?? json('dormant-candidates.json', []);
  const exclusionDocument = RuntimeExclusionsSchema.parse(exclusions ?? json('runtime-exclusions.json', []));
  // orphans.json is authoritative. Matrix rows never carry a second orphan copy.
  const orphanDocument = orphans ?? json('orphans.json', []);
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
