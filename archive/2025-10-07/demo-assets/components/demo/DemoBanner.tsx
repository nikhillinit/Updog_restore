/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { Eye } from "lucide-react";
import { useFundContext } from "@/contexts/FundContext";

export default function DemoBanner() {
  const { currentFund } = useFundContext();

  // Only show in demo mode
  const isDemoMode = import.meta.env.DEMO_MODE === 'true' ||
                     (typeof window !== 'undefined' && window.location.search.includes('DEMO_MODE'));

  if (!isDemoMode) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-2 flex items-center justify-center gap-2 text-sm font-medium shadow-md">
      <Eye className="h-4 w-4" />
      <span>
        🎯 <strong>DEMO MODE</strong> - Showing sample data
        {currentFund ? ` for ${currentFund.name}` : ''}
      </span>
      <span className="ml-2 px-2 py-0.5 bg-white/20 rounded text-xs">
        Press Escape to exit
      </span>
    </div>
  );
}
