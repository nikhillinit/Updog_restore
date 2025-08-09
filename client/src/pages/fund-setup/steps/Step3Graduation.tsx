import React from "react";
// Replace with your actual components; minimal HTML used for safety
import { useFundStore } from "../../../state/useFundStore";
import { useGraduationReserves } from "../../../core/reserves/useGraduationReserves";

export default function Step3Graduation() {
  const fund = useFundStore((s: any) => s.fundData);
  const updateGraduationRate = useFundStore((s: any) => s.updateGraduationRate);
  const res = useGraduationReserves();

  const rows = [
    { key: "seedToA", label: "Seed → Series A" },
    { key: "aToB", label: "Series A → Series B" },
    { key: "bToC", label: "Series B → Series C" },
  ] as const;

  const invalid = rows.some((r) => {
    const rr = (fund.graduationRates as any)[r.key];
    const sum =
      Number(rr.graduate || 0) +
      Number(rr.fail || 0) +
      Number(rr.remain || 0);
    return sum !== 100;
  });

  const setGrad = (
    key: (typeof rows)[number]["key"],
    field: "graduate" | "fail" | "remain" | "months",
    value: number
  ) => {
    updateGraduationRate(key, field, Number(value));
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border p-4" data-testid="graduation-grid">
        <h3 className="font-semibold mb-3">Portfolio Evolution – Graduation Rates</h3>
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">Transition</th>
              <th>Graduate %</th>
              <th>Fail %</th>
              <th>Remain %</th>
              <th>Avg Months</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const rr = (fund.graduationRates as any)[r.key];
              return (
                <tr key={r.key} className="border-b">
                  <td className="py-2 font-medium">{r.label}</td>
                  {(["graduate", "fail", "remain"] as const).map((f) => (
                    <td key={f} className="py-2">
                      <input
                        data-testid={`${r.key}-${f}`}
                        type="number"
                        className="w-24 px-2 py-1 border rounded"
                        value={rr[f]}
                        onChange={(e) => setGrad(r.key, f, Number(e.target.value))}
                      />
                    </td>
                  ))}
                  <td className="py-2">
                    <input
                      type="number"
                      className="w-24 px-2 py-1 border rounded"
                      value={rr.months}
                      onChange={(e) => setGrad(r.key, "months", Number(e.target.value))}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {invalid && (
          <div
            className="bg-red-50 text-red-700 p-3 rounded-lg mt-3"
            data-testid="graduation-error"
          >
            ⚠️ Each row must sum to 100%
          </div>
        )}
      </div>

      <div className="rounded-2xl border p-4" data-testid="reserves-card">
        <h3 className="font-semibold mb-3">Projected Follow-On Requirements</h3>
        {!res.valid ? (
          <div className="text-sm text-red-600">Fix validation errors to compute reserves.</div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-gray-500">Stage A</div>
                <div className="text-lg font-bold">
                  ${Number(res.aggregateByStage?.A || 0).toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Stage B</div>
                <div className="text-lg font-bold">
                  ${Number(res.aggregateByStage?.B || 0).toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Stage C</div>
                <div className="text-lg font-bold">
                  ${Number(res.aggregateByStage?.C || 0).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 bg-gray-50 rounded">
              <span className="text-sm text-gray-600 mr-2">Calculated Reserve Ratio:</span>
              <span className="text-2xl font-bold">{res.reserveRatioPct.toFixed(1)}%</span>
              {/* raw numeric for e2e */}
              <div className="sr-only" data-testid="reserve-ratio">
                {res.reserveRatioPct.toFixed(1)}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex justify-end">
        <button className="btn-primary" data-testid="wizard-next" disabled={invalid}>
          Next
        </button>
      </div>
    </div>
  );
}
