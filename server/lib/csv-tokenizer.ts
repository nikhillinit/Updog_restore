/**
 * Shared CSV tokenizer.
 *
 * Single hand-rolled CSV tokenizer consumed by BOTH the V1 import lane
 * (`server/services/lp-reporting/import-reconciliation-service.ts`) and the V2
 * financial-observations normalization adapters. Extracted from the V1 service
 * without behavior change (PLAN_61 Wave C, Task 5a, defect D10): there is
 * exactly one tokenizer and no `csv-parse` dependency.
 *
 * The V1 lane trims every cell (`splitCsvLine`). The V2 lane must NOT inherit
 * implicit trimming, so it consumes the raw variants and decides whitespace
 * handling only through declared mapping transforms.
 *
 * @module server/lib/csv-tokenizer
 */

const BOM_CHAR = String.fromCharCode(0xfeff);

/**
 * Split a single CSV line into raw cells. Handles double-quoted fields and
 * escaped quotes (`""`). Does NOT trim cells — callers decide.
 */
export function splitCsvLineRaw(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

/**
 * V1 line splitter: raw split with every cell trimmed. Byte-identical to the
 * original `import-reconciliation-service.ts` behavior.
 */
export function splitCsvLine(line: string): string[] {
  return splitCsvLineRaw(line).map((c) => c.trim());
}

/**
 * V1 buffer parser: strips an optional UTF-8 BOM, splits on CRLF/LF, drops
 * empty lines, snake_cases the header, trims every cell. Byte-identical to the
 * original V1 implementation.
 */
export function parseCsvBuffer(buffer: Buffer): { header: string[]; rows: string[][] } {
  const raw = buffer.toString('utf8');
  const text = raw.startsWith(BOM_CHAR) ? raw.slice(1) : raw;
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { header: [], rows: [] };
  }
  const header = splitCsvLine(lines[0]!).map((h) => h.toLowerCase().replace(/[\s-]/g, '_'));
  const rows = lines.slice(1).map((l) => splitCsvLine(l));
  return { header, rows };
}

/**
 * V2 buffer parser: identical pipeline and header canonicalization as
 * `parseCsvBuffer`, but ROW cells are left untrimmed so the normalization layer
 * controls whitespace exclusively through declared transforms.
 */
export function parseCsvBufferRaw(buffer: Buffer): { header: string[]; rows: string[][] } {
  const raw = buffer.toString('utf8');
  const text = raw.startsWith(BOM_CHAR) ? raw.slice(1) : raw;
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { header: [], rows: [] };
  }
  const header = splitCsvLine(lines[0]!).map((h) => h.toLowerCase().replace(/[\s-]/g, '_'));
  const rows = lines.slice(1).map((l) => splitCsvLineRaw(l));
  return { header, rows };
}

/**
 * Map header tokens through an alias table. Used by the V1 Notion export path.
 */
export function normalizeHeaders(header: string[], mapping: Record<string, string>): string[] {
  return header.map((h) => mapping[h] ?? h);
}

/**
 * Canonicalize a single lookup token to the same snake_case form the header
 * receives inside `parseCsvBuffer`. Lets a mapping profile's display-text
 * `sourceColumn` (e.g. "Company Name") resolve against a normalized header.
 */
export function normalizeHeaderToken(token: string): string {
  return token.trim().toLowerCase().replace(/[\s-]/g, '_');
}

/** Count double-quote characters in a physical line. */
export function countQuoteChars(line: string): number {
  let count = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      count++;
    }
  }
  return count;
}

/**
 * True when any physical line (after BOM strip + newline split, non-empty) has
 * an odd number of quote characters, i.e. a quoted field spans a newline. The
 * V1 tokenizer silently mis-splits such input; the V2 lane rejects it.
 */
export function hasEmbeddedQuotedNewline(buffer: Buffer): boolean {
  const raw = buffer.toString('utf8');
  const text = raw.startsWith(BOM_CHAR) ? raw.slice(1) : raw;
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  return lines.some((line) => countQuoteChars(line) % 2 === 1);
}
