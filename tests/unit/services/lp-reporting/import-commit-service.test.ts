/**
 * Service tests for import-commit-service (LP Reporting Phase 1c.2).
 *
 * Verifies:
 *   - Happy path: returns the expected response shape; db.transaction
 *     called exactly once per commit; INSERTs include importBatchId,
 *     sourceHash, status='draft', createdBy=userId.
 *   - Drift on previewHash mismatch: throws PreviewDriftError with a
 *     non-empty diff envelope.
 *   - Decimal.js used for any money math (no parseFloat in service file).
 *   - Per-row sourceHash deterministic across two consecutive runs.
 *   - Both ledger AND valuation-mark variants.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  LedgerImportCommitResponseSchema,
  ValuationMarkImportCommitResponseSchema,
} from '@shared/contracts/lp-reporting';
import {
  commitLedgerImport,
  commitValuationMarkImport,
  computeRowSourceHash,
  PreviewDriftError,
} from '../../../../server/services/lp-reporting/import-commit-service';
import {
  computePreviewHash,
  parseLedgerCsv,
  parseValuationMarksCsv,
} from '../../../../server/services/lp-reporting/import-reconciliation-service';

const FIXTURES_DIR = path.join(process.cwd(), 'tests', 'fixtures', 'lp-reporting');

function loadFixture(name: string): Buffer {
  return fs.readFileSync(path.join(FIXTURES_DIR, name));
}

function toBase64(buffer: Buffer): string {
  return buffer.toString('base64');
}

const VALID_BATCH_ID = '11111111-1111-4111-8111-111111111111';

interface InsertSpy {
  table: unknown;
  values: ReadonlyArray<Record<string, unknown>>;
  returning: ReadonlyArray<string>;
}

interface MockDbHandle {
  inserts: InsertSpy[];
  transactionCount: number;
  db: Parameters<typeof commitLedgerImport>[1]['db'];
}

/**
 * Build a mock Drizzle db that captures inserts and returns deterministic
 * IDs. The shape mirrors the chain `tx.insert(table).values(rows).returning({ id: ... })`.
 */
function buildMockDb(): MockDbHandle {
  const inserts: InsertSpy[] = [];
  let transactionCount = 0;
  let nextId = 1000;

  const insertChain = (table: unknown) => ({
    values: (rows: ReadonlyArray<Record<string, unknown>>) => ({
      returning: (selection: Record<string, unknown>) => {
        inserts.push({ table, values: rows, returning: Object.keys(selection) });
        return Promise.resolve(rows.map(() => ({ id: nextId++ })));
      },
    }),
  });

  const tx = { insert: vi.fn(insertChain) };

  const db = {
    transaction: vi.fn(async (cb: (txArg: typeof tx) => Promise<unknown>) => {
      transactionCount++;
      return cb(tx);
    }),
  } as unknown as Parameters<typeof commitLedgerImport>[1]['db'];

  return {
    inserts,
    db,
    get transactionCount() {
      return transactionCount;
    },
  };
}

// ---------------------------------------------------------------------------
// Ledger commit
// ---------------------------------------------------------------------------

describe('commitLedgerImport', () => {
  it('happy path: opens a single transaction and returns a valid response', async () => {
    const buffer = loadFixture('sample-ledger.csv');
    // The dry-run computes the previewHash from parsed.rows; recompute the
    // same way so the commit handshake matches.
    const parsed = parseLedgerCsv(buffer, 1);
    const previewHash = computePreviewHash(parsed.rows);

    const handle = buildMockDb();

    const response = await commitLedgerImport(
      {
        fundId: 1,
        sourceType: 'csv',
        payload: toBase64(buffer),
        previewHash,
        importBatchId: VALID_BATCH_ID,
      },
      { db: handle.db, userId: 7 }
    );

    // Schema-validated response shape.
    expect(() => LedgerImportCommitResponseSchema.parse(response)).not.toThrow();

    expect(response.importBatchId).toBe(VALID_BATCH_ID);
    expect(response.previewHash).toBe(previewHash);
    expect(response.rowCount).toBe(parsed.rows.length);
    expect(response.persistedEventIds.length).toBe(parsed.rows.length);

    // Single transaction.
    expect(handle.transactionCount).toBe(1);
    expect(handle.inserts.length).toBe(1);

    const insertedRows = handle.inserts[0]!.values;
    expect(insertedRows.length).toBe(parsed.rows.length);

    for (const row of insertedRows) {
      expect(row['fundId']).toBe(1);
      expect(row['status']).toBe('draft');
      expect(row['createdBy']).toBe(7);
      expect(row['importBatchId']).toBe(VALID_BATCH_ID);
      expect(typeof row['sourceHash']).toBe('string');
      expect(row['sourceHash']).toMatch(/^[a-f0-9]{64}$/);
      expect(row['importedFrom']).toBe('csv');
      // money is a string (decimal), not a JS number.
      expect(typeof row['amount']).toBe('string');
    }
  });

  it('throws PreviewDriftError when previewHash does not match recomputed hash', async () => {
    const buffer = loadFixture('sample-ledger.csv');
    const handle = buildMockDb();

    await expect(
      commitLedgerImport(
        {
          fundId: 1,
          sourceType: 'csv',
          payload: toBase64(buffer),
          previewHash: 'a'.repeat(64), // deliberately wrong
          importBatchId: VALID_BATCH_ID,
        },
        { db: handle.db, userId: 7 }
      )
    ).rejects.toBeInstanceOf(PreviewDriftError);

    // No transaction should have been opened on drift.
    expect(handle.transactionCount).toBe(0);
  });

  it('PreviewDriftError carries a populated diff envelope', async () => {
    const buffer = loadFixture('sample-ledger.csv');
    const handle = buildMockDb();

    try {
      await commitLedgerImport(
        {
          fundId: 1,
          sourceType: 'csv',
          payload: toBase64(buffer),
          previewHash: 'b'.repeat(64),
          importBatchId: VALID_BATCH_ID,
        },
        { db: handle.db, userId: 7 }
      );
      throw new Error('expected PreviewDriftError');
    } catch (err) {
      expect(err).toBeInstanceOf(PreviewDriftError);
      const json = (err as PreviewDriftError).toJSON();
      expect(json.code).toBe('PREVIEW_DRIFT');
      expect(json.expectedPreviewHash).toBe('b'.repeat(64));
      expect(json.actualPreviewHash).toMatch(/^[a-f0-9]{64}$/);
      expect(Array.isArray(json.diff.addedSourceIds)).toBe(true);
      expect(Array.isArray(json.diff.removedSourceIds)).toBe(true);
      // Drift against an unrelated hash always reports rows as "added"
      // (server has rows; client claimed none).
      expect(json.diff.addedSourceIds.length).toBeGreaterThan(0);
    }
  });

  it('rejects empty CSV payload before opening a transaction', async () => {
    const handle = buildMockDb();
    const emptyCsv = Buffer.from('event_type,amount,currency,event_date,perspective\n', 'utf8');
    const previewHash = computePreviewHash([]); // empty rows hash

    await expect(
      commitLedgerImport(
        {
          fundId: 1,
          sourceType: 'csv',
          payload: toBase64(emptyCsv),
          previewHash,
          importBatchId: VALID_BATCH_ID,
        },
        { db: handle.db, userId: 7 }
      )
    ).rejects.toThrow(/EMPTY_PAYLOAD/);

    expect(handle.transactionCount).toBe(0);
  });

  it('per-row sourceHash is deterministic across runs', async () => {
    const buffer = loadFixture('sample-ledger.csv');
    const parsed = parseLedgerCsv(buffer, 1);
    const row = parsed.rows[0]!;

    const h1 = computeRowSourceHash(row);
    const h2 = computeRowSourceHash(row);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('service file does not use parseFloat for money math', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'server', 'services', 'lp-reporting', 'import-commit-service.ts'),
      'utf8'
    );
    expect(src).not.toMatch(/parseFloat\s*\(/);
    // Confidence: Decimal is imported (or no money math is done in this file).
    // The service is a thin orchestrator -- if it does ANY arithmetic on
    // amount strings, it must go through Decimal.
    if (/amount\s*[+\-*/]/.test(src)) {
      expect(src).toMatch(/from\s+['"]@shared\/lib\/decimal-config['"]/);
    }
  });
});

// ---------------------------------------------------------------------------
// Valuation-mark commit
// ---------------------------------------------------------------------------

describe('commitValuationMarkImport', () => {
  it('happy path: opens a single transaction and returns a valid response', async () => {
    const buffer = loadFixture('sample-valuation-marks.csv');
    const parsed = parseValuationMarksCsv(buffer, 1);
    const previewHash = computePreviewHash(parsed.rows);

    const handle = buildMockDb();

    const response = await commitValuationMarkImport(
      {
        fundId: 1,
        sourceType: 'csv',
        payload: toBase64(buffer),
        previewHash,
        importBatchId: VALID_BATCH_ID,
      },
      { db: handle.db, userId: 11 }
    );

    expect(() => ValuationMarkImportCommitResponseSchema.parse(response)).not.toThrow();
    expect(response.importBatchId).toBe(VALID_BATCH_ID);
    expect(response.previewHash).toBe(previewHash);
    expect(response.rowCount).toBe(parsed.rows.length);
    expect(response.persistedMarkIds.length).toBe(parsed.rows.length);

    expect(handle.transactionCount).toBe(1);
    expect(handle.inserts.length).toBe(1);

    const insertedRows = handle.inserts[0]!.values;
    for (const row of insertedRows) {
      expect(row['fundId']).toBe(1);
      expect(row['status']).toBe('draft');
      expect(row['createdBy']).toBe(11);
      expect(row['importBatchId']).toBe(VALID_BATCH_ID);
      expect(row['sourceHash']).toMatch(/^[a-f0-9]{64}$/);
      expect(row['importedFrom']).toBe('csv');
      expect(typeof row['fairValue']).toBe('string');
    }
  });

  it('throws PreviewDriftError when previewHash mismatches', async () => {
    const buffer = loadFixture('sample-valuation-marks.csv');
    const handle = buildMockDb();

    await expect(
      commitValuationMarkImport(
        {
          fundId: 1,
          sourceType: 'csv',
          payload: toBase64(buffer),
          previewHash: 'c'.repeat(64),
          importBatchId: VALID_BATCH_ID,
        },
        { db: handle.db, userId: 11 }
      )
    ).rejects.toBeInstanceOf(PreviewDriftError);

    expect(handle.transactionCount).toBe(0);
  });

  it('rejects empty valuation-marks payload', async () => {
    const handle = buildMockDb();
    const emptyCsv = Buffer.from(
      'company_id,mark_date,as_of_date,fair_value,currency,mark_source,confidence_level,valuation_method\n',
      'utf8'
    );
    const previewHash = computePreviewHash([]);

    await expect(
      commitValuationMarkImport(
        {
          fundId: 1,
          sourceType: 'csv',
          payload: toBase64(emptyCsv),
          previewHash,
          importBatchId: VALID_BATCH_ID,
        },
        { db: handle.db, userId: 11 }
      )
    ).rejects.toThrow(/EMPTY_PAYLOAD/);

    expect(handle.transactionCount).toBe(0);
  });
});
