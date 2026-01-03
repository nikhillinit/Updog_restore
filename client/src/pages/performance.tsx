/**
 * Performance Page
 *
 * Comprehensive portfolio performance analysis with:
 * - Time-series IRR, TVPI, DPI charts
 * - Breakdown by sector/stage/company
 * - Point-in-time comparisons
 *
 * @module client/pages/performance
 */

import PerformanceDashboard from '@/components/performance/PerformanceDashboard';
import { POVBrandHeader } from '@/components/ui/POVLogo';
import { useFundContext } from '@/contexts/FundContext';

export default function Performance() {
  const { currentFund, isLoading: fundLoading } = useFundContext();

  if (fundLoading) {
    return (
      <div className="min-h-screen bg-slate-100">
        <POVBrandHeader
          title="Fund Performance"
          subtitle="Comprehensive performance analysis"
          variant="light"
        />
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-32 bg-white rounded-lg shadow-card" />
            <div className="h-96 bg-white rounded-lg shadow-card" />
          </div>
        </div>
      </div>
    );
  }

  if (!currentFund) {
    return (
      <div className="min-h-screen bg-slate-100">
        <POVBrandHeader
          title="Fund Performance"
          subtitle="Comprehensive performance analysis"
          variant="light"
        />
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="text-center py-12 text-[#292929]/70">
            Please select a fund to view performance metrics.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <POVBrandHeader
        title="Fund Performance"
        subtitle={`Performance analysis for ${currentFund.name}`}
        variant="light"
      />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <PerformanceDashboard />
      </div>
    </div>
  );
}
