import React from "react";

export type ReserveRow = {
  companyId: string;
  company?: string;
  plannedReserve: number;
  expectedExitMOIC: number; // "Exit MOIC on planned reserves"
  rationale?: string;
};

export type ReserveSummary = {
  totalAvailable: number;
  totalPlanned: number;
  unallocated: number;
};

export function ReserveOpportunityTable({
  rows,
  summary,
  top = 20,
}: {
  rows: ReserveRow[];
  summary: ReserveSummary;
  top?: number;
}) {
  const sorted = [...rows].sort((a, b) => b.expectedExitMOIC - a.expectedExitMOIC).slice(0, top);

  return (
    <section className="space-y-3">
      <div className="text-sm">
        <strong>Available:</strong> ${summary.totalAvailable.toLocaleString()}
        <strong className="ml-3">Planned:</strong> ${summary.totalPlanned.toLocaleString()}
        <strong className="ml-3">Unallocated:</strong> ${summary.unallocated.toLocaleString()}
      </div>

      <table className="w-full text-sm bg-white rounded-lg overflow-hidden">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left px-3 py-2">#</th>
            <th className="text-left px-3 py-2">Company</th>
            <th className="text-right px-3 py-2">Planned Reserve</th>
            <th className="text-right px-3 py-2">Exit MOIC (Next $)</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.companyId} className="border-t">
              <td className="px-3 py-2">{i + 1}</td>
              <td className="px-3 py-2">{r.company ?? r.companyId}</td>
              <td className="px-3 py-2 text-right">${Math.round(r.plannedReserve).toLocaleString()}</td>
              <td className="px-3 py-2 text-right">{r.expectedExitMOIC.toFixed(2)}×</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-xs text-gray-500">
        Ranked by expected <strong>Exit MOIC on planned reserves</strong>.
      </p>
    </section>
  );
}
