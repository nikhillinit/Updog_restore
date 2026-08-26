/**
 * Sanitize cell value to prevent CSV/formula injection.
 * Handles leading control characters and whitespace properly.
 * Values starting with =, +, -, @ are prefixed with a single quote AFTER leading whitespace.
 */
function sanitizeCell(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  // eslint-disable-next-line no-control-regex
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

// On-demand imports to keep initial bundle small (papaparse ~45KB; exceljs is large)
export async function exportCsv(rows: unknown[], filename = 'results.csv') {
  const { unparse } = await import('papaparse');
  const sanitizedRows = (rows as Record<string, unknown>[]).map(sanitizeRow);
  const csv = unparse(sanitizedRows, { quotes: true });
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename);
}

export async function exportXlsx(rows: unknown[], filename = 'results.xlsx') {
  const { Workbook, ValueType } = await import('exceljs');
  const sanitizedRows = (rows as Record<string, unknown>[]).map(sanitizeRow);

  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet('Results');

  const firstRow = sanitizedRows[0];
  const headers = firstRow ? Object.keys(firstRow) : [];
  if (headers.length > 0) {
    worksheet.addRow(headers);
    const dataRows = sanitizedRows.map((row) => headers.map((header) => row[header]));
    worksheet.addRows(dataRows);
  }

  // Force all cells to be treated as strings to prevent formula injection
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      if (cell.type !== ValueType.String) {
        cell.value = cell.value == null ? '' : String(cell.value);
      }
      cell.numFmt = '@';
    });
  });

  const out = await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([out]), filename);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
