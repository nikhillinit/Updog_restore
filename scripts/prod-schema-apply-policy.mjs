import fs from 'node:fs';
import path from 'node:path';

import { ReconcileError, splitSqlStatements } from './reconcile-prod-schema.mjs';

const DANGEROUS_STATEMENT_PATTERNS = [
  {
    kind: 'drop-table',
    pattern: /\bDROP\s+TABLE\b/i,
  },
  {
    kind: 'drop-column',
    pattern: /\bDROP\s+COLUMN\b/i,
  },
  {
    kind: 'drop-index',
    pattern: /\bDROP\s+INDEX\b/i,
  },
  {
    kind: 'drop-schema',
    pattern: /\bDROP\s+SCHEMA\b/i,
  },
  {
    kind: 'drop-type',
    pattern: /\bDROP\s+TYPE\b/i,
  },
  {
    kind: 'drop-view',
    pattern: /\bDROP\s+(?:MATERIALIZED\s+)?VIEW\b/i,
  },
  {
    kind: 'truncate',
    pattern: /\bTRUNCATE\b/i,
  },
  {
    kind: 'delete-from',
    pattern: /\bDELETE\s+FROM\b/i,
  },
  {
    kind: 'set-not-null',
    pattern: /\bSET\s+NOT\s+NULL\b/i,
  },
];

export function assertApplyPolicyForManifests({
  manifests,
  applyingManifestNames,
  rootDir = process.cwd(),
}) {
  const applying = new Set(applyingManifestNames);
  const violations = [];

  for (const manifest of manifests) {
    if (!applying.has(manifest.name)) continue;
    for (const sqlFile of manifest.sqlFiles ?? []) {
      const sql = fs.readFileSync(path.resolve(rootDir, sqlFile), 'utf8');
      violations.push(...validateSqlApplyPolicy({ manifest, sqlFile, sql }));
    }
    if ((manifest.dropObjects ?? []).length > 0) {
      violations.push({
        manifest: manifest.name,
        file: '<dropObjects>',
        kind: 'drop-objects',
        statement: 'dropObjects',
        reason: 'dropObjects are explicit removals and cannot run in additive-safe production apply',
      });
    }
  }

  if (violations.length > 0) {
    throw new ReconcileError(
      `Pre-apply audit selected manifest SQL outside additive-safe policy: ${violations
        .map((violation) => `${violation.manifest}:${violation.file}:${violation.kind}`)
        .join(', ')}`,
      { kind: 'apply-policy-violation', violations }
    );
  }
}

export function validateSqlApplyPolicy({ manifest, sqlFile, sql }) {
  const statements = splitSqlStatements(sql)
    .map((statement) => stripSqlComments(statement).trim())
    .filter(Boolean);
  return statements.flatMap((statement) =>
    validateStatementApplyPolicy({ manifest, sqlFile, statement })
  );
}

function validateStatementApplyPolicy({ manifest, sqlFile, statement }) {
  const violations = [];

  for (const { kind, pattern } of DANGEROUS_STATEMENT_PATTERNS) {
    if (pattern.test(statement)) {
      violations.push({
        manifest: manifest.name,
        file: sqlFile,
        kind,
        statement,
        reason: `${kind} is not additive-safe`,
      });
    }
  }

  const recognizedDropSpans = [];
  const dropConstraintNames = extractDropConstraintNames(statement);
  recognizedDropSpans.push(...dropConstraintNames.map((drop) => drop.span));
  for (const drop of dropConstraintNames) {
    if (!isAllowedConstraintReplacement(manifest.applyPolicy, drop)) {
      violations.push({
        manifest: manifest.name,
        file: sqlFile,
        kind: 'drop-constraint',
        statement,
        reason: `${drop.table}.${drop.name} is not declared as a safe same-name constraint replacement`,
      });
    }
    if (!addsConstraintToTable(statement, drop.table, drop.name)) {
      violations.push({
        manifest: manifest.name,
        file: sqlFile,
        kind: 'unpaired-drop-constraint',
        statement,
        reason: `${drop.table}.${drop.name} is dropped without a same-statement replacement`,
      });
    }
  }

  const dropNotNulls = extractDropNotNulls(statement);
  recognizedDropSpans.push(...dropNotNulls.map((drop) => drop.span));
  for (const drop of dropNotNulls) {
    if (!isAllowedDropNotNull(manifest.applyPolicy, drop)) {
      violations.push({
        manifest: manifest.name,
        file: sqlFile,
        kind: 'drop-not-null',
        statement,
        reason: `${drop.table}.${drop.column} is not declared as an expected nullable-column widening`,
      });
    }
  }

  for (const dropToken of findDropTokens(statement)) {
    if (!recognizedDropSpans.some((span) => dropToken.index >= span.start && dropToken.index < span.end)) {
      violations.push({
        manifest: manifest.name,
        file: sqlFile,
        kind: 'unknown-drop',
        statement,
        reason: 'DROP is not one of the declared additive-safe widening forms',
      });
    }
  }

  return violations;
}

function isAllowedConstraintReplacement(applyPolicy, drop) {
  return (applyPolicy?.allowConstraintReplacements ?? []).some(
    (allowed) => allowed.table === drop.table && allowed.name === drop.name
  );
}

function isAllowedDropNotNull(applyPolicy, drop) {
  return (applyPolicy?.allowDropNotNull ?? []).some(
    (allowed) => allowed.table === drop.table && allowed.column === drop.column
  );
}

function addsConstraintToTable(statement, tableName, constraintName) {
  return new RegExp(
    String.raw`\bALTER\s+TABLE\s+"?${escapeRegExp(tableName)}"?\s+ADD\s+CONSTRAINT\s+"?${escapeRegExp(constraintName)}"?\b`,
    'i'
  ).test(statement);
}

function extractDropConstraintNames(statement) {
  const drops = [];

  const direct = [
    ...statement.matchAll(
      /\bALTER\s+TABLE\s+"?([a-z_][a-z0-9_]*)"?\s+DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi
    ),
  ];
  drops.push(
    ...direct.map((match) => ({
      table: match[1],
      name: match[2],
      span: { start: match.index, end: match.index + match[0].length },
    }))
  );

  const tableName = statement.match(/\bALTER\s+TABLE\s+"?([a-z_][a-z0-9_]*)"?/i)?.[1];
  if (!tableName) return drops;

  for (const match of statement.matchAll(
    /\bDROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi
  )) {
    const name = match[1];
    if (!drops.some((drop) => drop.table === tableName && drop.name === name)) {
      drops.push({
        table: tableName,
        name,
        span: { start: match.index, end: match.index + match[0].length },
      });
    }
  }

  return drops;
}

function extractDropNotNulls(statement) {
  const tableName = statement.match(/\bALTER\s+TABLE\s+"?([a-z_][a-z0-9_]*)"?/i)?.[1];
  if (!tableName) return [];

  return [
    ...statement.matchAll(
      /\bALTER\s+COLUMN\s+"?([a-z_][a-z0-9_]*)"?\s+DROP\s+NOT\s+NULL\b/gi
    ),
  ].map((match) => ({
    table: tableName,
    column: match[1],
    span: { start: match.index, end: match.index + match[0].length },
  }));
}

function findDropTokens(statement) {
  return [...statement.matchAll(/\bDROP\b/gi)].map((match) => ({ index: match.index }));
}

function stripSqlComments(sql) {
  return sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
