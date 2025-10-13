import React from "react";
import { ReserveOpportunityTable, type ReserveRow, type ReserveSummary } from "@/components/reserves/ReserveOpportunityTable";

/**
 * Type guard to safely coerce values to number
 */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

export function OptimalReservesCard() {
  // TODO: Integrate with proper reserves state management when available
  // Mock implementation to allow compilation
  const state = {
    reserveAnalysis: {
      ranking: [] as Array<Record<string, unknown>>,
      summary: { totalAvailable: 0, totalPlanned: 0, unallocated: 0 }
    }
  };
  const calculateReserveOptimization = () => {
    console.log('Reserve optimization not yet implemented - integrate with reserves engine');
  };

  const ranking = state.reserveAnalysis.ranking;
  const summary = state.reserveAnalysis.summary as ReserveSummary;

  const rows: ReserveRow[] = ranking.map((r) => ({
    companyId: String(r['id'] ?? r['companyId'] ?? r['company'] ?? 'unknown'),
    company: String(r['company'] ?? r['name'] ?? ''),
    plannedReserve: toNumber(r['plannedReserves'] ?? r['plannedReserve']),
    expectedExitMOIC: toNumber(r['exitMoicOnPlanned'] ?? r['expectedExitMOIC']),
    ...(r['rationale'] ? { rationale: String(r['rationale']) } : {})
  }));

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">Optimal Reserves Ranking</h3>
        <button
          onClick={calculateReserveOptimization}
          className="px-3 py-1.5 text-sm rounded bg-gray-900 text-white"
        >
          Recalculate
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Expected Exit MOIC on planned reserves (next $ deployed).
      </p>
      <ReserveOpportunityTable rows={rows} summary={summary} />
    </div>
  );
}
