import React from 'react';

export function ExportCsvButton({
  rows,
  filename = 'export.csv',
}: {
  rows: Array<Record<string, unknown>>;
  filename?: string;
}) {
  const onExport = async () => {
    if (!rows?.length) return;

    // Lazy load papaparse only when needed (~45KB bundle savings)
    const { unparse } = await import('papaparse').then((m) => m.default || m);

    const csv = unparse(rows, { header: true });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button
      onClick={onExport}
      className="border border-beige-200 bg-white text-pov-charcoal hover:bg-pov-gray"
      style={{ padding: '6px 10px', borderRadius: 6 }}
    >
      Export CSV
    </button>
  );
}
