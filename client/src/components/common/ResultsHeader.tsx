import React from "react";
import { useQueryParam } from "@/utils/useQueryParam";
import { StatusChip, Status } from "@/components/common/StatusChip";

const ALLOWED = new Set(["construction", "current"]);

export function ResultsHeader({
  status,
  title = "Results",
}: {
  status: Status;
  title?: string;
}) {
  const [view, setView] = useQueryParam("view", "current");
  const safeView = ALLOWED.has(view) ? view : "current";

  const next = safeView === "current" ? "construction" : "current";

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold">{title} ({safeView})</h2>
        <StatusChip status={status} />
      </div>
      <button
        type="button"
        onClick={() => setView(next)}
        className="px-3 py-1 rounded border bg-white hover:bg-gray-50 text-sm"
        aria-label={`switch to ${next}`}
      >
        {safeView === "current" ? "Switch to Construction" : "Switch to Current"}
      </button>
    </div>
  );
}
