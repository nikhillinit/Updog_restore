/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import SensitivityAnalysis from "@/components/sensitivity/sensitivity-analysis";

export default function SensitivityAnalysisPage() {
  return (
    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
      <SensitivityAnalysis />
    </div>
  );
}
