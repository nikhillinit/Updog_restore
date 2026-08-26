/**
 * D4 boundary guard: internal-economics lane source-level constraints.
 *
 * Reads .ts files from shared/lib/internal-economics/ and
 * shared/contracts/internal-economics/ and asserts forbidden patterns
 * are absent. No engine code is executed.
 *
 * Rules enforced:
 *  1. No WaterfallTypeSchema import
 *  2. No import from shared/contracts/economics-v1.contract.ts
 *  3. No Date.now / new Date() / Math.random (purity)
 *  4. No direct american-ledger import except through D3 (ledger-allocation-v1.ts)
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const LIB_DIR = 'shared/lib/internal-economics';
const CONTRACTS_DIR = 'shared/contracts/internal-economics';
const V1_SCHEMA_PATH = `${CONTRACTS_DIR}/lp-economics-run-v1.contract.ts`;
const V1_1_SCHEMA_PATH = `${CONTRACTS_DIR}/lp-economics-run-v1.1.contract.ts`;
const HASH_HELPER_PATH = `${CONTRACTS_DIR}/lp-economics-run-v1.hash.ts`;
const RECEIPT_PATH = `${CONTRACTS_DIR}/lp-economics-run-receipt-v1.contract.ts`;
const RUN_SERVICE_PATH = 'server/services/internal-economics/lp-economics-run-service.ts';

const readSource = (relPath: string): string =>
  fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf8');

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const resolveRuntimeImport = (fromPath: string, specifier: string): string | undefined => {
  if (!specifier.startsWith('.')) return undefined;
  const basePath = path.resolve(process.cwd(), path.dirname(fromPath), specifier);
  const candidates = [`${basePath}.ts`, `${basePath}.tsx`, path.join(basePath, 'index.ts')];
  const resolved = candidates.find((candidate) => fs.existsSync(candidate));
  return resolved === undefined ? undefined : path.relative(process.cwd(), resolved);
};

const collectRuntimeImportGraph = (entryPaths: readonly string[]): Map<string, string> => {
  const graph = new Map<string, string>();
  const visit = (relPath: string): void => {
    if (graph.has(relPath)) return;
    const source = stripComments(readSource(relPath));
    graph.set(relPath, source);

    const runtimeImportPattern = /import\s+(?!type\b)(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g;
    for (const match of source.matchAll(runtimeImportPattern)) {
      const resolved = resolveRuntimeImport(relPath, match[1]!);
      if (resolved !== undefined) visit(resolved);
    }
  };

  for (const entryPath of entryPaths) visit(entryPath);
  return graph;
};

const readDir = (relDir: string): Array<{ name: string; source: string }> => {
  const abs = path.resolve(process.cwd(), relDir);
  return fs
    .readdirSync(abs)
    .filter((f) => f.endsWith('.ts'))
    .map((name) => ({
      name,
      source: fs.readFileSync(path.join(abs, name), 'utf8'),
    }));
};

const allFiles = [...readDir(LIB_DIR), ...readDir(CONTRACTS_DIR)];

describe('internal-economics boundary (D4)', () => {
  it('no file imports WaterfallTypeSchema', () => {
    for (const { name, source } of allFiles) {
      expect(source, `${name} imports WaterfallTypeSchema`).not.toMatch(/WaterfallTypeSchema/);
    }
  });

  it('no file imports from shared/contracts/economics-v1.contract', () => {
    for (const { name, source } of allFiles) {
      expect(source, `${name} imports from legacy economics-v1.contract`).not.toMatch(
        /economics-v1\.contract/
      );
    }
  });

  it('no file uses Date.now, new Date(), or Math.random (purity)', () => {
    for (const { name, source } of allFiles) {
      expect(source, `${name} contains Date.now`).not.toMatch(/\bDate\.now\b/);
      expect(source, `${name} contains new Date()`).not.toMatch(/\bnew\s+Date\s*\(/);
      expect(source, `${name} contains Math.random`).not.toMatch(/\bMath\.random\b/);
    }
  });

  it('no lib file imports american-ledger except ledger-allocation-v1.ts', () => {
    const libFiles = readDir(LIB_DIR).filter((f) => f.name !== 'ledger-allocation-v1.ts');
    for (const { name, source } of libFiles) {
      expect(source, `${name} imports american-ledger directly (must go through D3)`).not.toMatch(
        /american-ledger/
      );
    }
  });

  it('keeps V1.0 and V1.1 schema and receipt-result imports outside the Node crypto graph', () => {
    const graph = collectRuntimeImportGraph([V1_SCHEMA_PATH, V1_1_SCHEMA_PATH, RECEIPT_PATH]);
    for (const [modulePath, source] of graph) {
      expect(source, `${modulePath} imports node:crypto`).not.toMatch(/node:crypto/);
      expect(source, `${modulePath} imports canonical-hash`).not.toMatch(/canonical-hash/);
      expect(source, `${modulePath} references canonicalSha256`).not.toMatch(/canonicalSha256/);
    }
  });

  it('keeps public service signatures free of persisted Drizzle run rows', () => {
    const runServiceSource = stripComments(readSource(RUN_SERVICE_PATH));
    const executionType = runServiceSource.match(
      /export type LpEconomicsRunExecution = Readonly<\{([\s\S]*?)\}>;/
    );
    expect(executionType?.[1]).toMatch(/receipt:[\s\S]*replayed:/);
    expect(executionType?.[1]).not.toMatch(/InternalLpEconomicsRunRow/);
    expect(runServiceSource).toMatch(
      /getLpEconomicsRunReceipt\([\s\S]{0,120}Promise<InternalLpEconomicsRunReceiptV1>/
    );
  });

  it('gives hash-only helpers one dedicated owner and direct server consumers', () => {
    const hashSource = stripComments(readSource(HASH_HELPER_PATH));
    const v1SchemaSource = stripComments(readSource(V1_SCHEMA_PATH));
    const v1_1SchemaSource = stripComments(readSource(V1_1_SCHEMA_PATH));
    const runServiceSource = stripComments(readSource(RUN_SERVICE_PATH));

    expect(hashSource).toMatch(/import\s+\{\s*canonicalSha256\s*\}\s+from\s+['"]\.\.\/\.\.\/lib\/canonical-hash['"]/);
    expect(hashSource).toMatch(/export function sortAndDedupeLpEconomicsReasonsV1/);
    expect(hashSource).toMatch(/export function buildLpEconomicsEventIdV1/);

    for (const schemaSource of [v1SchemaSource, v1_1SchemaSource]) {
      expect(schemaSource).not.toMatch(/sortAndDedupeLpEconomicsReasonsV1/);
      expect(schemaSource).not.toMatch(/buildLpEconomicsEventIdV1/);
    }

    expect(runServiceSource).toMatch(
      /from\s+['"]\.\.\/\.\.\/\.\.\/shared\/contracts\/internal-economics\/lp-economics-run-v1\.hash['"]/
    );
  });
});
