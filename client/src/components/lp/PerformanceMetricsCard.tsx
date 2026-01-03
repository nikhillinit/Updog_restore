/**
 * PerformanceMetricsCard Component
 *
 * Displays IRR, MOIC, DPI, TVPI metrics in a grid layout.
 *
 * @module client/components/lp/PerformanceMetricsCard
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown } from 'lucide-react';

// ============================================================================
// COMPONENT
// ============================================================================

interface PerformanceMetricsCardProps {
  irr: number;
  tvpi: number;
  dpi: number;
  rvpi?: number;
  moic?: number;
  className?: string;
}

export default function PerformanceMetricsCard({
  irr,
  tvpi,
  dpi,
  rvpi,
  moic,
  className = '',
}: PerformanceMetricsCardProps) {
  const formatPercent = (value: number) => `${(value * 100).toFixed(2)}%`;
  const formatMultiple = (value: number) => `${value.toFixed(2)}x`;

  const irrVariant = irr >= 0.15 ? 'default' : irr >= 0 ? 'secondary' : 'destructive';
  const tvpiVariant = tvpi >= 2 ? 'default' : tvpi >= 1 ? 'secondary' : 'outline';

  return (
    <Card className={`bg-white rounded-xl border border-[#E0D8D1] shadow-md ${className}`}>
      <CardHeader>
        <CardTitle className="font-inter text-lg text-[#292929]">Performance Metrics</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {/* IRR */}
          <div className="text-center">
            <div className="text-xs font-poppins text-[#292929]/50 mb-2">IRR</div>
            <Badge variant={irrVariant} className="text-lg px-3 py-1">
              {formatPercent(irr)}
            </Badge>
            <div className="mt-2">
              {irr >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-600 mx-auto" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600 mx-auto" />
              )}
            </div>
          </div>

          {/* TVPI */}
          <div className="text-center">
            <div className="text-xs font-poppins text-[#292929]/50 mb-2">TVPI</div>
            <Badge variant={tvpiVariant} className="text-lg px-3 py-1">
              {formatMultiple(tvpi)}
            </Badge>
            <div className="text-xs font-poppins text-[#292929]/70 mt-2">Total Value / Paid-In</div>
          </div>

          {/* DPI */}
          <div className="text-center">
            <div className="text-xs font-poppins text-[#292929]/50 mb-2">DPI</div>
            <div className="text-2xl font-bold font-inter text-[#292929]">
              {formatMultiple(dpi)}
            </div>
            <div className="text-xs font-poppins text-[#292929]/70 mt-2">Distributions / Paid-In</div>
          </div>

          {/* RVPI or MOIC */}
          <div className="text-center">
            <div className="text-xs font-poppins text-[#292929]/50 mb-2">
              {rvpi !== undefined ? 'RVPI' : 'MOIC'}
            </div>
            <div className="text-2xl font-bold font-inter text-[#292929]">
              {rvpi !== undefined ? formatMultiple(rvpi) : moic !== undefined ? formatMultiple(moic) : 'N/A'}
            </div>
            <div className="text-xs font-poppins text-[#292929]/70 mt-2">
              {rvpi !== undefined ? 'Residual Value / Paid-In' : 'Multiple on Invested Capital'}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
