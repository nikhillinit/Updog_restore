import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { readJournaledMigrationFiles } from './migration-ledger';

export type DdlObject = {
  kind: 'table' | 'column' | 'constraint' | 'index';
  name: string;
  table?: string;
};

export interface DivergenceRow {
  severity: 'info';
  code: string;
  file: string;
  message: string;
}

export interface DetectorError {
  severity: 'error';
  code: string;
  file?: string;
  message: string;
}

export interface DualLedgerDivergenceResult {
  ok: boolean;
  divergences: DivergenceRow[];
  errors: DetectorError[];
  summary: {
    serverForwardFiles: number;
    uniqueObjectFiles: number;
    duplicateFiles: number;
    activeConsumerFiles: number;
  };
}

type ParseDiagnostic = {
  kind: 'note' | 'error';
  message: string;
};

type ParsedDdlObjects = {
  objects: DdlObject[];
  diagnostics: ParseDiagnostic[];
};

const IDENTIFIER_PATTERN = String.raw`(?:(?:"(?:""|[^"])+"|[a-zA-Z_][a-zA-Z0-9_$]*)\s*\.\s*)?(?:"(?:""|[^"])+"|[a-zA-Z_][a-zA-Z0-9_$]*)`;

const TABLE_PATTERN = new RegExp(
  String.raw`\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(${IDENTIFIER_PATTERN})(?=\s|\()`,
  'i'
);

const ALTER_ADD_COLUMN_PATTERN = new RegExp(
  String.raw`\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(${IDENTIFIER_PATTERN})\s+add\s+column\s+(?:if\s+not\s+exists\s+)?(${IDENTIFIER_PATTERN})(?=\s|,|;)`,
  'i'
);

const CONSTRAINT_PATTERN = new RegExp(
  String.raw`\b(?:add\s+)?constraint\s+(?:if\s+not\s+exists\s+)?(${IDENTIFIER_PATTERN})(?=\s)`,
  'gi'
);

const INDEX_PATTERN = new RegExp(
  String.raw`\bcreate\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?(${IDENTIFIER_PATTERN})\s+on\b`,
  'i'
);

const ACTIVE_CONSUMER_FILES = [
  'scripts/quality-gates.ts',
  'scripts/schema-drift-active-surfaces.ts',
  'tests/helpers/apply-investment-round-constraints.ts',
  'tests/integration/allocation-scenario-apply.test.ts',
  'tests/integration/lp-reporting-foundation-migration.test.ts',
  'tests/unit/schema/lp-reporting-evidence-schema.test.ts',
  'tests/unit/schema/schema-drift-active-surfaces.test.ts',
  'server/services/sensitivity-run-service.ts',
] as const;

const ACTIVE_CONSUMER_GLOBS = [
  { dir: 'shared/contracts/lp-reporting', suffix: '.contract.ts' },
  { dir: 'shared/schema', suffix: '.ts' },
] as const;

export function extractDdlObjects(sql: string): DdlObject[] {
  return parseDdlObjects(sql).objects;
}

export function detectDualLedgerDivergence(rootDir: string): DualLedgerDivergenceResult {
  const resolvedRoot = path.resolve(rootDir);
  const divergences: DivergenceRow[] = [];
  const errors: DetectorError[] = [];
  const journalObjects = new Map<string, DdlObject>();

  try {
    for (const migration of readJournaledMigrationFiles(resolvedRoot)) {
      addObjectsToMap(journalObjects, parseDdlForDetector(migration.sql, migration.file, errors));
    }
  } catch (error) {
    errors.push({
      severity: 'error',
      code: 'journal-read-error',
      message: errorMessage(error, 'Failed to read journaled migration files.'),
    });
  }

  for (const sharedFile of listSharedMigrationFiles(resolvedRoot, errors)) {
    const relativePath = normalizePath(path.relative(resolvedRoot, sharedFile));
    try {
      const sql = fs.readFileSync(sharedFile, 'utf8');
      addObjectsToMap(journalObjects, parseDdlForDetector(sql, relativePath, errors));
    } catch (error) {
      errors.push({
        severity: 'error',
        code: 'shared-file-read-error',
        file: relativePath,
        message: errorMessage(error, `Failed to read shared migration file ${relativePath}.`),
      });
    }
  }

  const serverForwardFiles = listServerMigrationFiles(resolvedRoot, errors).filter(
    (file) => !file.endsWith('.down.sql')
  );

  for (const file of serverForwardFiles) {
    const absolutePath = path.join(resolvedRoot, 'server', 'migrations', file);
    const relativePath = normalizePath(path.relative(resolvedRoot, absolutePath));
    let objects: DdlObject[];

    try {
      const sql = fs.readFileSync(absolutePath, 'utf8');
      objects = parseDdlForDetector(sql, relativePath, errors);
    } catch (error) {
      errors.push({
        severity: 'error',
        code: 'server-file-read-error',
        file: relativePath,
        message: errorMessage(error, `Failed to read server migration file ${relativePath}.`),
      });
      continue;
    }

    const objectKeys = uniqueSorted(objects.map(objectKey));
    const missingObjectKeys = objectKeys.filter((key) => !journalObjects.has(key));
    if (missingObjectKeys.length > 0) {
      divergences.push({
        severity: 'info',
        code: 'server-unique-content',
        file: relativePath,
        message: `Server forward migration creates objects absent from the journal/shared ledger: ${missingObjectKeys.join(', ')}`,
      });
    }

    const tableObjectKeys = uniqueSorted(
      objects.filter((object) => object.kind === 'table').map(objectKey)
    );
    if (tableObjectKeys.length > 0 && tableObjectKeys.every((key) => journalObjects.has(key))) {
      divergences.push({
        severity: 'info',
        code: 'server-shape-duplicate',
        file: relativePath,
        message: `All server-created table objects are already present in the journal/shared ledger: ${tableObjectKeys.join(', ')}`,
      });
    }
  }

  const activeConsumerRows = detectActiveConsumerFiles(resolvedRoot, errors);
  divergences.push(...activeConsumerRows);

  return {
    ok: errors.length === 0,
    divergences,
    errors,
    summary: {
      serverForwardFiles: serverForwardFiles.length,
      uniqueObjectFiles: countRows(divergences, 'server-unique-content'),
      duplicateFiles: countRows(divergences, 'server-shape-duplicate'),
      activeConsumerFiles: activeConsumerRows.length,
    },
  };
}

export function formatDualLedgerReport(result: DualLedgerDivergenceResult): string {
  const lines = [
    '# Dual Ledger Divergence Report',
    '',
    `ok=${String(result.ok)}`,
    `serverForwardFiles=${result.summary.serverForwardFiles}`,
    `uniqueObjectFiles=${result.summary.uniqueObjectFiles}`,
    `duplicateFiles=${result.summary.duplicateFiles}`,
    `activeConsumerFiles=${result.summary.activeConsumerFiles}`,
    `errors=${result.errors.length}`,
    '',
  ];

  if (result.errors.length > 0) {
    lines.push('## Detector Errors', '');
    for (const error of result.errors) {
      const file = error.file ? ` file=${error.file}` : '';
      lines.push(`- ERROR code=${error.code}${file}`);
      lines.push(`  ${error.message}`);
    }
    lines.push('');
  }

  if (result.divergences.length === 0) {
    lines.push('## Divergences', '', 'No report-only divergence rows.');
    return lines.join('\n');
  }

  lines.push('## Divergences', '');
  for (const [code, rows] of groupRowsByCode(result.divergences)) {
    lines.push(`### ${code}`, '');
    for (const row of rows) {
      lines.push(`- ${row.file}`);
      lines.push(`  ${row.message}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

function parseDdlForDetector(sql: string, file: string, errors: DetectorError[]): DdlObject[] {
  const parsed = parseDdlObjects(sql);
  for (const diagnostic of parsed.diagnostics) {
    if (diagnostic.kind === 'error') {
      errors.push({
        severity: 'error',
        code: 'sql-parse-error',
        file,
        message: diagnostic.message,
      });
    }
  }
  return parsed.objects;
}

function parseDdlObjects(sql: string): ParsedDdlObjects {
  const objects = new Map<string, DdlObject>();
  const diagnostics: ParseDiagnostic[] = [];

  for (const statement of splitSqlStatements(sql)) {
    const normalizedStatement = stripSqlComments(statement).trim();
    if (normalizedStatement.length === 0 || !shouldParseStatement(normalizedStatement)) {
      continue;
    }

    if (hasUnclosedQuotedIdentifier(normalizedStatement)) {
      diagnostics.push({
        kind: 'error',
        message: `Could not parse DDL statement with an unclosed quoted identifier: ${previewStatement(normalizedStatement)}`,
      });
      continue;
    }

    const objectsBefore = objects.size;
    collectCreateTableObject(normalizedStatement, objects);
    collectAlterAddColumnObject(normalizedStatement, objects);
    collectConstraintObjects(normalizedStatement, objects);
    collectCreateIndexObject(normalizedStatement, objects);

    if (objects.size === objectsBefore) {
      diagnostics.push({
        kind: 'note',
        message: `No supported DDL object was extracted from: ${previewStatement(normalizedStatement)}`,
      });
    }
  }

  return {
    objects: Array.from(objects.values()).sort((left, right) =>
      objectKey(left).localeCompare(objectKey(right))
    ),
    diagnostics,
  };
}

function collectCreateTableObject(statement: string, objects: Map<string, DdlObject>): void {
  const match = TABLE_PATTERN.exec(statement);
  const identifier = match?.[1];
  if (!identifier) return;
  addObject(objects, { kind: 'table', name: normalizeIdentifier(identifier) });
}

function collectAlterAddColumnObject(statement: string, objects: Map<string, DdlObject>): void {
  const match = ALTER_ADD_COLUMN_PATTERN.exec(statement);
  const tableIdentifier = match?.[1];
  const columnIdentifier = match?.[2];
  if (!tableIdentifier || !columnIdentifier) return;

  addObject(objects, {
    kind: 'column',
    table: normalizeIdentifier(tableIdentifier),
    name: normalizeIdentifier(columnIdentifier),
  });
}

function collectConstraintObjects(statement: string, objects: Map<string, DdlObject>): void {
  for (const match of statement.matchAll(CONSTRAINT_PATTERN)) {
    const identifier = match[1];
    if (!identifier) continue;
    addObject(objects, { kind: 'constraint', name: normalizeIdentifier(identifier) });
  }
}

function collectCreateIndexObject(statement: string, objects: Map<string, DdlObject>): void {
  const match = INDEX_PATTERN.exec(statement);
  const identifier = match?.[1];
  if (!identifier) return;
  addObject(objects, { kind: 'index', name: normalizeIdentifier(identifier) });
}

function addObject(objects: Map<string, DdlObject>, object: DdlObject): void {
  objects.set(objectKey(object), object);
}

function addObjectsToMap(target: Map<string, DdlObject>, objects: readonly DdlObject[]): void {
  for (const object of objects) {
    target.set(objectKey(object), object);
  }
}

function objectKey(object: DdlObject): string {
  if (object.kind === 'column') {
    return `${object.kind}:${object.table ?? 'unknown'}.${object.name}`;
  }
  return `${object.kind}:${object.name}`;
}

function shouldParseStatement(statement: string): boolean {
  return (
    /\bcreate\s+table\b/i.test(statement) ||
    /\bcreate\s+(?:unique\s+)?index\b/i.test(statement) ||
    (/\balter\s+table\b/i.test(statement) && /\badd\s+(?:column|constraint)\b/i.test(statement))
  );
}

function hasUnclosedQuotedIdentifier(statement: string): boolean {
  let quoteCount = 0;
  for (let index = 0; index < statement.length; index += 1) {
    const char = statement[index];
    if (char !== '"') continue;

    if (statement[index + 1] === '"') {
      index += 1;
      continue;
    }

    quoteCount += 1;
  }
  return quoteCount % 2 !== 0;
}

function normalizeIdentifier(identifier: string): string {
  const parts = splitIdentifierParts(identifier.trim());
  const lastPart = parts.at(-1) ?? identifier;
  return stripIdentifierQuotes(lastPart).toLowerCase();
}

function splitIdentifierParts(identifier: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotedIdentifier = false;

  for (let index = 0; index < identifier.length; index += 1) {
    const char = identifier[index];
    if (char === '"') {
      current += char;
      if (identifier[index + 1] === '"') {
        current += identifier[index + 1];
        index += 1;
      } else {
        inQuotedIdentifier = !inQuotedIdentifier;
      }
      continue;
    }

    if (char === '.' && !inQuotedIdentifier) {
      parts.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim().length > 0) {
    parts.push(current.trim());
  }

  return parts;
}

function stripIdentifierQuotes(identifier: string): string {
  const trimmed = identifier.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"');
  }
  return trimmed;
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let state: 'normal' | 'single-quote' | 'double-quote' | 'line-comment' | 'block-comment' =
    'normal';
  let dollarQuoteTag: string | null = null;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (dollarQuoteTag) {
      current += char;
      if (sql.startsWith(dollarQuoteTag, index)) {
        current += sql.slice(index + 1, index + dollarQuoteTag.length);
        index += dollarQuoteTag.length - 1;
        dollarQuoteTag = null;
      }
      continue;
    }

    if (state === 'line-comment') {
      current += char;
      if (char === '\n') state = 'normal';
      continue;
    }

    if (state === 'block-comment') {
      current += char;
      if (char === '*' && next === '/') {
        current += next;
        index += 1;
        state = 'normal';
      }
      continue;
    }

    if (state === 'single-quote') {
      current += char;
      if (char === "'" && next === "'") {
        current += next;
        index += 1;
      } else if (char === "'") {
        state = 'normal';
      }
      continue;
    }

    if (state === 'double-quote') {
      current += char;
      if (char === '"' && next === '"') {
        current += next;
        index += 1;
      } else if (char === '"') {
        state = 'normal';
      }
      continue;
    }

    if (char === '-' && next === '-') {
      current += char + next;
      index += 1;
      state = 'line-comment';
      continue;
    }

    if (char === '/' && next === '*') {
      current += char + next;
      index += 1;
      state = 'block-comment';
      continue;
    }

    if (char === "'") {
      current += char;
      state = 'single-quote';
      continue;
    }

    if (char === '"') {
      current += char;
      state = 'double-quote';
      continue;
    }

    if (char === '$') {
      const tag = readDollarQuoteTag(sql, index);
      if (tag) {
        current += tag;
        index += tag.length - 1;
        dollarQuoteTag = tag;
        continue;
      }
    }

    if (char === ';') {
      if (current.trim().length > 0) {
        statements.push(current);
      }
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim().length > 0) {
    statements.push(current);
  }

  return statements;
}

function stripSqlComments(sql: string): string {
  let output = '';
  let state: 'normal' | 'single-quote' | 'double-quote' | 'line-comment' | 'block-comment' =
    'normal';
  let dollarQuoteTag: string | null = null;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (dollarQuoteTag) {
      output += char;
      if (sql.startsWith(dollarQuoteTag, index)) {
        output += sql.slice(index + 1, index + dollarQuoteTag.length);
        index += dollarQuoteTag.length - 1;
        dollarQuoteTag = null;
      }
      continue;
    }

    if (state === 'line-comment') {
      if (char === '\n') {
        output += char;
        state = 'normal';
      }
      continue;
    }

    if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        output += ' ';
        index += 1;
        state = 'normal';
      }
      continue;
    }

    if (state === 'single-quote') {
      output += char;
      if (char === "'" && next === "'") {
        output += next;
        index += 1;
      } else if (char === "'") {
        state = 'normal';
      }
      continue;
    }

    if (state === 'double-quote') {
      output += char;
      if (char === '"' && next === '"') {
        output += next;
        index += 1;
      } else if (char === '"') {
        state = 'normal';
      }
      continue;
    }

    if (char === '-' && next === '-') {
      index += 1;
      state = 'line-comment';
      continue;
    }

    if (char === '/' && next === '*') {
      index += 1;
      state = 'block-comment';
      continue;
    }

    if (char === "'") {
      output += char;
      state = 'single-quote';
      continue;
    }

    if (char === '"') {
      output += char;
      state = 'double-quote';
      continue;
    }

    if (char === '$') {
      const tag = readDollarQuoteTag(sql, index);
      if (tag) {
        output += tag;
        index += tag.length - 1;
        dollarQuoteTag = tag;
        continue;
      }
    }

    output += char;
  }

  return output;
}

function readDollarQuoteTag(sql: string, startIndex: number): string | null {
  const rest = sql.slice(startIndex);
  const match = /^\$[a-zA-Z_][a-zA-Z0-9_]*\$|^\$\$/.exec(rest);
  return match?.[0] ?? null;
}

function previewStatement(statement: string): string {
  const compact = statement.replace(/\s+/g, ' ').trim();
  return compact.length > 140 ? `${compact.slice(0, 137)}...` : compact;
}

function listSharedMigrationFiles(rootDir: string, errors: DetectorError[]): string[] {
  const sharedDir = path.join(rootDir, 'shared', 'migrations');
  if (!fs.existsSync(sharedDir)) {
    return [];
  }

  try {
    return fs
      .readdirSync(sharedDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
      .map((entry) => path.join(sharedDir, entry.name))
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    errors.push({
      severity: 'error',
      code: 'shared-dir-read-error',
      file: normalizePath(path.relative(rootDir, sharedDir)),
      message: errorMessage(error, 'Failed to list shared migrations.'),
    });
    return [];
  }
}

function listServerMigrationFiles(rootDir: string, errors: DetectorError[]): string[] {
  const serverMigrationsDir = path.join(rootDir, 'server', 'migrations');
  try {
    return fs
      .readdirSync(serverMigrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    errors.push({
      severity: 'error',
      code: 'server-dir-read-error',
      file: normalizePath(path.relative(rootDir, serverMigrationsDir)),
      message: errorMessage(error, 'Failed to list server migrations.'),
    });
    return [];
  }
}

function detectActiveConsumerFiles(rootDir: string, errors: DetectorError[]): DivergenceRow[] {
  const rows: DivergenceRow[] = [];
  const files = uniqueSorted([...ACTIVE_CONSUMER_FILES, ...expandConsumerGlobs(rootDir)]);

  for (const file of files) {
    const absolutePath = path.join(rootDir, ...file.split('/'));
    if (!fs.existsSync(absolutePath)) {
      continue;
    }

    try {
      const contents = fs.readFileSync(absolutePath, 'utf8');
      if (contents.includes('server/migrations')) {
        rows.push({
          severity: 'info',
          code: 'server-migrations-active-consumer',
          file,
          message:
            'Active code or tests still reference server/migrations; reviewer data for PR-2b, non-gating.',
        });
      }
    } catch (error) {
      errors.push({
        severity: 'error',
        code: 'consumer-file-read-error',
        file,
        message: errorMessage(error, `Failed to read active consumer file ${file}.`),
      });
    }
  }

  return rows;
}

function expandConsumerGlobs(rootDir: string): string[] {
  const files: string[] = [];

  for (const glob of ACTIVE_CONSUMER_GLOBS) {
    const absoluteDir = path.join(rootDir, ...glob.dir.split('/'));
    if (!fs.existsSync(absoluteDir)) {
      continue;
    }

    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(glob.suffix)) {
        files.push(`${glob.dir}/${entry.name}`);
      }
    }
  }

  return files;
}

function groupRowsByCode(rows: readonly DivergenceRow[]): [string, DivergenceRow[]][] {
  const grouped = new Map<string, DivergenceRow[]>();
  for (const row of rows) {
    const existingRows = grouped.get(row.code) ?? [];
    existingRows.push(row);
    grouped.set(row.code, existingRows);
  }

  return Array.from(grouped.entries()).sort(([left], [right]) => left.localeCompare(right));
}

function countRows(rows: readonly DivergenceRow[], code: string): number {
  return rows.filter((row) => row.code === code).length;
}

function uniqueSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function isCliInvocation(): boolean {
  const invokedPath = process.argv[1];
  return (
    typeof invokedPath === 'string' && path.resolve(invokedPath) === fileURLToPath(import.meta.url)
  );
}

if (isCliInvocation()) {
  const result = detectDualLedgerDivergence(process.cwd());
  console.log(formatDualLedgerReport(result));
  process.exit(result.ok ? 0 : 1);
}
