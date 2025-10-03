import React from 'react';
import Papa from 'papaparse';

export function ExportCsvButton({
  rows, filename = 'export.csv'
}: { rows: Array<Record<string, unknown>>; filename?: string }) {
  const onExport = () => {
    if (!rows?.length) return;
    const csv = Papa.unparse(rows, { header: true });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };
  return <button onClick={onExport} style={{ padding:'6px 10px', border:'1px solid #ddd', borderRadius:6 }}>Export CSV</button>;
}
