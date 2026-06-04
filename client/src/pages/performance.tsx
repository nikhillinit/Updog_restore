/**
 * Performance Page
 *
 * Current portfolio performance analysis with:
 * - Time-series IRR, TVPI, DPI charts
 * - Current-state breakdown by sector/stage/company
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
      <div className="min-h-screen bg-pov-gray">
        <POVBrandHeader
          title="Fund Performance"
          subtitle="Current trends and portfolio breakdowns"
          variant="light"
        />
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-32 bg-pov-white rounded-lg shadow-card" />
            <div className="h-96 bg-pov-white rounded-lg shadow-card" />
          </div>
        </div>
      </div>
    );
  }

  if (!currentFund) {
    return (
      <div className="min-h-screen bg-pov-gray">
        <POVBrandHeader
          title="Fund Performance"
          subtitle="Current trends and portfolio breakdowns"
          variant="light"
        />
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="text-center py-12 text-pov-charcoal/70">
            Please select a fund to view performance metrics.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pov-gray">
      <POVBrandHeader
        title="Fund Performance"
        subtitle={`Current performance trends and breakdowns for ${currentFund.name}`}
        variant="light"
      />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <PerformanceDashboard />
      </div>
    </div>
  );
}
