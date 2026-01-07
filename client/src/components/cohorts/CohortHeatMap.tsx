/**
 * Cohort Heat Map Component
 *
 * Displays a matrix of cohort data (vintage x sector) with color-coded metrics.
 * Supports DPI, TVPI, and IRR metric selection.
 */

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TrendingUp, TrendingDown, Minus, Download } from 'lucide-react';
import type { CohortRow } from '@shared/types';

type MetricType = 'dpi' | 'tvpi' | 'irr';

interface CohortHeatMapProps {
  /** Array of cohort rows */
  rows: CohortRow[];
  /** Ordered list of vintage keys */
  vintageOrder: string[];
  /** Ordered list of sector IDs */
  sectorOrder: string[];
  /** Whether data includes residual values for TVPI */
  hasResidualData?: boolean;
  /** Callback when a cell is clicked */
  onCellClick?: (row: CohortRow) => void;
  /** Loading state */
  isLoading?: boolean;
}

/**
 * Gets the display color for a metric value
 */
function getMetricColor(value: number | null, metric: MetricType): string {
  if (value === null) {
    return 'bg-gray-100 text-gray-400';
  }

  if (metric === 'irr') {
    // IRR is a percentage
    if (value >= 0.25) return 'bg-green-500 text-white';
    if (value >= 0.15) return 'bg-green-400 text-white';
    if (value >= 0.1) return 'bg-green-300 text-gray-800';
    if (value >= 0.05) return 'bg-yellow-300 text-gray-800';
    if (value >= 0) return 'bg-yellow-200 text-gray-800';
    if (value >= -0.1) return 'bg-orange-300 text-gray-800';
    return 'bg-red-500 text-white';
  }

  // DPI and TVPI are multiples
  if (value >= 3) return 'bg-green-500 text-white';
  if (value >= 2) return 'bg-green-400 text-white';
  if (value >= 1.5) return 'bg-green-300 text-gray-800';
  if (value >= 1) return 'bg-yellow-300 text-gray-800';
  if (value >= 0.75) return 'bg-orange-300 text-gray-800';
  if (value >= 0.5) return 'bg-orange-400 text-white';
  return 'bg-red-500 text-white';
}

/**
 * Formats a metric value for display
 */
function formatMetric(value: number | null, metric: MetricType): string {
  if (value === null) return '-';

  if (metric === 'irr') {
    return `${(value * 100).toFixed(1)}%`;
  }

  return `${value.toFixed(2)}x`;
}

/**
 * Gets trend indicator for metric comparison
 * Reserved for future trend comparison feature
 */
function _TrendIndicator({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  if (trend === 'up') {
    return <TrendingUp className="h-3 w-3 text-green-600" />;
  }
  if (trend === 'down') {
    return <TrendingDown className="h-3 w-3 text-red-600" />;
  }
  return <Minus className="h-3 w-3 text-gray-400" />;
}

export function CohortHeatMap({
  rows,
  vintageOrder,
  sectorOrder,
  hasResidualData = false,
  onCellClick,
  isLoading = false,
}: CohortHeatMapProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('tvpi');

  // Build lookup map for quick access
  const rowMap = useMemo(() => {
    const map = new Map<string, CohortRow>();
    for (const row of rows) {
      map.set(`${row.cohortKey}:${row.sectorId}`, row);
    }
    return map;
  }, [rows]);

  // Calculate sector totals for each vintage
  const vintageTotals = useMemo(() => {
    const totals: Record<string, { paidIn: number; distributions: number; residual: number }> = {};

    for (const vintage of vintageOrder) {
      totals[vintage] = { paidIn: 0, distributions: 0, residual: 0 };
      for (const sector of sectorOrder) {
        const row = rowMap.get(`${vintage}:${sector}`);
        if (row) {
          totals[vintage].paidIn += row.exposure.paidIn;
          totals[vintage].distributions += row.exposure.distributions;
          totals[vintage].residual += row.exposure.residualValue ?? 0;
        }
      }
    }

    return totals;
  }, [vintageOrder, sectorOrder, rowMap]);

  // Get unique sector names
  const sectorNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (const row of rows) {
      names[row.sectorId] = row.sectorName;
    }
    return names;
  }, [rows]);

  const handleExport = () => {
    // Generate CSV
    const headers = ['Vintage', ...sectorOrder.map((s) => sectorNames[s] || s)];
    const csvRows = [headers.join(',')];

    for (const vintage of vintageOrder) {
      const rowData = [vintage];
      for (const sector of sectorOrder) {
        const row = rowMap.get(`${vintage}:${sector}`);
        const value = row?.performance?.[selectedMetric] ?? null;
        rowData.push(formatMetric(value, selectedMetric));
      }
      csvRows.push(rowData.join(','));
    }

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cohort-${selectedMetric}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cohort Heat Map</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 animate-pulse bg-gray-100 rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg font-semibold">Cohort Heat Map</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={selectedMetric} onValueChange={(v) => setSelectedMetric(v as MetricType)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dpi">DPI</SelectItem>
              <SelectItem value="tvpi" disabled={!hasResidualData}>
                TVPI {!hasResidualData && '(needs marks)'}
              </SelectItem>
              <SelectItem value="irr">IRR</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={handleExport}>
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <TooltipProvider>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="p-2 text-left text-sm font-medium text-gray-500 border-b">
                    Vintage
                  </th>
                  {sectorOrder.map((sectorId) => (
                    <th
                      key={sectorId}
                      className="p-2 text-center text-sm font-medium text-gray-500 border-b min-w-[80px]"
                    >
                      {sectorNames[sectorId] || sectorId}
                    </th>
                  ))}
                  <th className="p-2 text-center text-sm font-medium text-gray-500 border-b min-w-[80px]">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {vintageOrder.map((vintage) => {
                  const total = vintageTotals[vintage];
                  const totalDpi = total.paidIn > 0 ? total.distributions / total.paidIn : null;
                  const totalTvpi =
                    total.paidIn > 0 ? (total.distributions + total.residual) / total.paidIn : null;

                  return (
                    <tr key={vintage} className="border-b border-gray-100">
                      <td className="p-2 text-sm font-medium text-gray-700">{vintage}</td>
                      {sectorOrder.map((sectorId) => {
                        const row = rowMap.get(`${vintage}:${sectorId}`);
                        const value = row?.performance?.[selectedMetric] ?? null;
                        const colorClass = getMetricColor(value, selectedMetric);

                        return (
                          <td key={sectorId} className="p-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  className={`w-full h-10 rounded text-sm font-medium transition-colors ${colorClass} ${
                                    row && onCellClick
                                      ? 'cursor-pointer hover:ring-2 hover:ring-blue-400'
                                      : 'cursor-default'
                                  }`}
                                  onClick={() => row && onCellClick?.(row)}
                                  disabled={!row}
                                >
                                  {formatMetric(value, selectedMetric)}
                                </button>
                              </TooltipTrigger>
                              {row && (
                                <TooltipContent className="max-w-xs">
                                  <div className="space-y-1">
                                    <div className="font-medium">
                                      {row.sectorName} - {row.cohortKey}
                                    </div>
                                    <div className="text-xs space-y-0.5">
                                      <div>
                                        Companies: {row.counts.companies} | Investments:{' '}
                                        {row.counts.investments}
                                      </div>
                                      <div>Paid-In: ${(row.exposure.paidIn / 1e6).toFixed(2)}M</div>
                                      <div>
                                        Distributions: $
                                        {(row.exposure.distributions / 1e6).toFixed(2)}M
                                      </div>
                                      {row.exposure.residualValue !== undefined && (
                                        <div>
                                          Residual: ${(row.exposure.residualValue / 1e6).toFixed(2)}
                                          M
                                        </div>
                                      )}
                                      <div className="pt-1 border-t border-gray-200">
                                        DPI: {formatMetric(row.performance?.dpi ?? null, 'dpi')} |
                                        TVPI: {formatMetric(row.performance?.tvpi ?? null, 'tvpi')}{' '}
                                        | IRR: {formatMetric(row.performance?.irr ?? null, 'irr')}
                                      </div>
                                    </div>
                                  </div>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </td>
                        );
                      })}
                      <td className="p-1">
                        <div
                          className={`w-full h-10 rounded text-sm font-medium flex items-center justify-center ${
                            selectedMetric === 'irr'
                              ? 'bg-gray-200 text-gray-600'
                              : getMetricColor(
                                  selectedMetric === 'dpi' ? totalDpi : totalTvpi,
                                  selectedMetric
                                )
                          }`}
                        >
                          {selectedMetric === 'irr'
                            ? '-'
                            : formatMetric(
                                selectedMetric === 'dpi' ? totalDpi : totalTvpi,
                                selectedMetric
                              )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TooltipProvider>
        </div>

        {/* Legend */}
        <div className="mt-4 flex items-center justify-center gap-4 text-xs text-gray-500">
          <span className="font-medium">Legend:</span>
          {selectedMetric === 'irr' ? (
            <>
              <span className="flex items-center gap-1">
                <div className="w-4 h-4 bg-red-500 rounded" /> {'<0%'}
              </span>
              <span className="flex items-center gap-1">
                <div className="w-4 h-4 bg-yellow-300 rounded" /> 0-10%
              </span>
              <span className="flex items-center gap-1">
                <div className="w-4 h-4 bg-green-300 rounded" /> 10-15%
              </span>
              <span className="flex items-center gap-1">
                <div className="w-4 h-4 bg-green-500 rounded" /> {'>25%'}
              </span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1">
                <div className="w-4 h-4 bg-red-500 rounded" /> {'<0.5x'}
              </span>
              <span className="flex items-center gap-1">
                <div className="w-4 h-4 bg-orange-300 rounded" /> 0.5-1x
              </span>
              <span className="flex items-center gap-1">
                <div className="w-4 h-4 bg-yellow-300 rounded" /> 1-1.5x
              </span>
              <span className="flex items-center gap-1">
                <div className="w-4 h-4 bg-green-400 rounded" /> 1.5-2x
              </span>
              <span className="flex items-center gap-1">
                <div className="w-4 h-4 bg-green-500 rounded" /> {'>3x'}
              </span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default CohortHeatMap;
