/**
 * Sanitize cell value to prevent CSV/formula injection.
 * Handles leading control characters and whitespace properly.
 * Values starting with =, +, -, @ are prefixed with a single quote AFTER leading whitespace.
 */
function sanitizeCell(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const leading = value.match(/^[\u0000-\u001F\s]*/)?.[0] ?? '';
  const rest = value.slice(leading.length);
  if (/^[=+\-@]/.test(rest)) {
    return `${leading}'${rest}`;
  }
  return value;
}

/**
 * Sanitize all cells in a row object to prevent injection attacks.
 */
function sanitizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    sanitized[key] = sanitizeCell(value);
  }
  return sanitized;
}

// On-demand imports to keep initial bundle small (papaparse ~45KB; xlsx ~180KB)
export async function exportCsv(rows: unknown[], filename = "results.csv") {
  const { unparse } = await import("papaparse");
  const sanitizedRows = (rows as Record<string, unknown>[]).map(sanitizeRow);
  const csv = unparse(sanitizedRows, { quotes: true });
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), filename);
}

export async function exportXlsx(rows: unknown[], filename = "results.xlsx") {
  const XLSX = await import("xlsx");
  const sanitizedRows = (rows as Record<string, unknown>[]).map(sanitizeRow);
  const ws = XLSX.utils.json_to_sheet(sanitizedRows);

  // Force all cells to be treated as strings to prevent formula injection
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[cellAddress];
      if (cell && cell.t !== 's') {
        cell.t = 's'; // Force cell type to string
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Results");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  downloadBlob(new Blob([out]), filename);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
