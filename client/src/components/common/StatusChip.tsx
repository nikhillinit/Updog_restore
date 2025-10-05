import React from "react";

export type Status = "complete" | "partial" | "fallback";

export function StatusChip({ status }: { status: Status }) {
  const cls =
    status === "complete"
      ? "bg-green-100 text-green-700 ring-green-200"
      : status === "partial"
      ? "bg-amber-100 text-amber-700 ring-amber-200"
      : "bg-gray-100 text-gray-700 ring-gray-200";

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ring-1 ${cls}`}
      aria-label={`status: ${status}`}
    >
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${
          status === "complete"
            ? "bg-green-600"
            : status === "partial"
            ? "bg-amber-600"
            : "bg-gray-500"
        }`}
      />
      {status}
    </span>
  );
}
