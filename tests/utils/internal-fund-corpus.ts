// Default import on purpose: node-setup.ts vi.mock('fs') stubs the NAMED
// readFileSync/existsSync exports, but its ...actual spread preserves
// `default` as the real fs module - same pattern as reconcile-prod-schema.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

import {
  cashFlowEvents,
  funds,
  investmentLots,
  investmentRoundModelOverrides,
  investmentRounds,
  investments,
  portfolioCompanies,
  valuationMarks,
  vehicles,
} from '@shared/schema';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CORPUS_ROOT = path.resolve(__dirname, '../fixtures/internal-fund-corpus');

const AuthoritySurfaceSchema = z.enum([
  'fund_company_actuals',
  'financial_facts_snapshot',
  'actual_metrics',
  'portfolio_overview',
  'lot_service',
]);

const ManifestCaseSchema = z
  .object({
    caseId: z.string().min(1),
    description: z.string().min(1),
    authoritySurface: AuthoritySurfaceSchema,
    inputFiles: z.array(z.string().min(1)).min(1),
    expectedFile: z.string().min(1),
    contractOrService: z.string().min(1),
    assertions: z.array(z.string().min(1)).min(1),
    knownLimitations: z.array(z.string().min(1)),
  })
  .strict();

const ManifestSchema = z
  .object({
    schemaVersion: z.literal('internal-fund-legacy-corpus/1'),
    generatedFrom: z
      .object({
        repositoryCommit: z.string().regex(/^[a-f0-9]{40}$/),
        factsPolicyVersion: z.literal('financial-facts-policy/1.0.1'),
      })
      .strict(),
    fixedClock: z.string().datetime(),
    asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    baseCurrency: z.literal('USD'),
    cases: z.array(ManifestCaseSchema).min(1),
  })
  .strict();

export type InternalFundCorpusManifest = z.infer<typeof ManifestSchema>;

const timestampFields = new Set(['createdAt', 'updatedAt', 'investmentDate', 'eventDate']);
const bigintFields = new Set(['sharePriceCents', 'costBasisCents', 'version']);

function corpusPath(relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Corpus path must be relative: ${relativePath}`);
  }
  const resolved = path.resolve(CORPUS_ROOT, relativePath);
  const relativeToRoot = path.relative(CORPUS_ROOT, resolved);
  if (relativeToRoot === '' || relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    throw new Error(`Corpus path escapes root: ${relativePath}`);
  }
  return resolved;
}

function readJson(relativePath: string): unknown {
  return JSON.parse(fs.readFileSync(corpusPath(relativePath), 'utf8')) as unknown;
}

function hydrateValue(key: string, value: unknown): unknown {
  if (typeof value === 'string' && timestampFields.has(key)) {
    return new Date(value);
  }
  if (typeof value === 'string' && bigintFields.has(key)) {
    return BigInt(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => hydrateValue('', item));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        hydrateValue(childKey, childValue),
      ])
    );
  }
  return value;
}

function hydrateJson(relativePath: string): unknown {
  return hydrateValue('', readJson(relativePath));
}

function listExpectedFiles(): string[] {
  const roots = ['expected-facts', 'expected-cash-flows', 'expected-valuations', 'expected-lots'];
  const files: string[] = [];
  for (const root of roots) {
    const absoluteRoot = corpusPath(root);
    const walk = (directory: string): void => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absoluteEntry = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          walk(absoluteEntry);
        } else if (entry.isFile()) {
          files.push(path.relative(CORPUS_ROOT, absoluteEntry).replaceAll(path.sep, '/'));
        }
      }
    };
    walk(absoluteRoot);
  }
  return files;
}

export function loadInternalFundCorpusManifest(): InternalFundCorpusManifest {
  const manifest = ManifestSchema.parse(readJson('corpus-manifest.json'));
  const expectedOwners = new Map<string, string>();
  for (const entry of manifest.cases) {
    for (const inputFile of entry.inputFiles) {
      if (!fs.existsSync(corpusPath(inputFile))) {
        throw new Error(`Manifest references missing input file: ${inputFile}`);
      }
    }
    if (expectedOwners.has(entry.expectedFile)) {
      throw new Error(
        `Expected file has multiple authority owners: ${entry.expectedFile} (${expectedOwners.get(
          entry.expectedFile
        )}, ${entry.caseId})`
      );
    }
    expectedOwners.set(entry.expectedFile, entry.caseId);
  }

  const expectedFiles = listExpectedFiles();
  for (const expectedFile of expectedFiles) {
    if (!expectedOwners.has(expectedFile)) {
      throw new Error(`Expected file has no manifest authority owner: ${expectedFile}`);
    }
  }
  for (const expectedFile of expectedOwners.keys()) {
    if (!expectedFiles.includes(expectedFile)) {
      throw new Error(`Manifest references missing expected file: ${expectedFile}`);
    }
  }

  return manifest;
}

/**
 * Review R1 (#1196): every legacy-input row validates against the REAL
 * drizzle row shape after hydration. `.partial()` because fixtures carry
 * only the columns the characterized services read; `.strict()` so a
 * misspelled or nonexistent column can never freeze behavior on rows
 * production tables cannot produce.
 */
type RowSchema = { parse: (value: unknown) => unknown };

const legacyInputRowSchemas: Record<string, RowSchema> = {
  'legacy-inputs/funds.json': createSelectSchema(funds).partial().strict(),
  'legacy-inputs/portfolio-companies.json': createSelectSchema(portfolioCompanies)
    .partial()
    .strict(),
  'legacy-inputs/investments.json': createSelectSchema(investments).partial().strict(),
  'legacy-inputs/investment-rounds.json': createSelectSchema(investmentRounds).partial().strict(),
  'legacy-inputs/investment-round-overrides.json': createSelectSchema(investmentRoundModelOverrides)
    .partial()
    .strict(),
  'legacy-inputs/investment-lots.json': createSelectSchema(investmentLots).partial().strict(),
  'legacy-inputs/valuation-marks.json': createSelectSchema(valuationMarks).partial().strict(),
  'legacy-inputs/cash-flow-events.json': createSelectSchema(cashFlowEvents).partial().strict(),
  'legacy-inputs/vehicles.json': createSelectSchema(vehicles).partial().strict(),
};

export function loadCorpusInput<T>(relativePath: string): T {
  const hydrated = hydrateJson(relativePath);
  const rowSchema = legacyInputRowSchemas[relativePath];
  if (rowSchema === undefined) {
    if (relativePath.startsWith('legacy-inputs/')) {
      throw new Error(`Legacy input has no drizzle row schema registered: ${relativePath}`);
    }
    return hydrated as T;
  }
  if (!Array.isArray(hydrated)) {
    throw new Error(`Legacy input must be a row array: ${relativePath}`);
  }
  // Parse per row: drizzle-zod emits zod-v4-core schemas, which must not be
  // wrapped in this file's zod-v3 combinators (mixing the two throws).
  hydrated.forEach((row, index) => {
    try {
      rowSchema.parse(row);
    } catch (error) {
      throw new Error(
        `Legacy input row failed its drizzle row shape: ${relativePath}[${index}]: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  });
  return hydrated as T;
}

export function loadCorpusExpected<T>(relativePath: string): T {
  return readJson(relativePath) as T;
}

export function serializeCorpusValue(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(serializeCorpusValue);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, serializeCorpusValue(child)])
    );
  }
  return value;
}

const manifest = loadInternalFundCorpusManifest();

export const INTERNAL_FUND_CORPUS = {
  fundId: 101,
  otherFundId: 202,
  actorId: 7001,
  fixedClock: new Date(manifest.fixedClock),
  asOfDate: manifest.asOfDate,
  baseCurrency: manifest.baseCurrency,
} as const;
