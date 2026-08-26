import React from 'react';

export type Status = 'complete' | 'partial' | 'fallback';

export function StatusChip({ status }: { status: Status }) {
  const cls =
    status === 'complete'
      ? 'bg-success/10 text-success-dark border-success/50'
      : status === 'partial'
        ? 'bg-warning/10 text-warning-dark border-warning/50'
        : 'bg-pov-gray text-charcoal-700 border-charcoal/7';

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${cls}`}
      aria-label={`status: ${status}`}
    >
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${
          status === 'complete'
            ? 'bg-success'
            : status === 'partial'
              ? 'bg-warning'
              : 'bg-charcoal-500'
        }`}
      />
      {status}
    </span>
  );
}
