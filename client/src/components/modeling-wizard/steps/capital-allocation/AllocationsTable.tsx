/**
 * AllocationsTable Component
 *
 * Displays detailed reserve allocations by company with:
 * - Company name, sector, stage
 * - Initial investment and follow-on reserves
 * - Performance badges (MOIC with arrows)
 * - Total allocation and percentage of portfolio
 * - Zebra striping for readability
 * - Export functionality
 */

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Download, TrendingUp, TrendingDown, Minus, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CompanyAllocation {
  id: string;
  name: string;
  sector: string;
  stage: 'Seed' | 'Series A' | 'Series B' | 'Series C' | 'Growth';
  initialInvestment: number;
  reserveAllocated: number;
  totalAllocation: number;
  percentOfPortfolio: number;
  moic?: number; // Multiple on Invested Capital (optional, for performance)
  status: 'active' | 'exited' | 'written-off';
}

export interface AllocationsTableProps {
  allocations: CompanyAllocation[];
  totalFundSize: number;
  onExport?: () => void;
  className?: string;
}

export function AllocationsTable({
  allocations,
  totalFundSize,
  onExport,
  className,
}: AllocationsTableProps) {
  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Format percentage
  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(2)}%`;
  };

  // Calculate totals
  const totals = useMemo(() => {
    return {
      initialInvestment: allocations.reduce((sum, a) => sum + a.initialInvestment, 0),
      reserveAllocated: allocations.reduce((sum, a) => sum + a.reserveAllocated, 0),
      totalAllocation: allocations.reduce((sum, a) => sum + a.totalAllocation, 0),
    };
  }, [allocations]);

  // Get MOIC badge with arrow
  const getMoicBadge = (moic?: number) => {
    if (moic === undefined) {
      return (
        <Badge variant="secondary" className="bg-gray-100 text-gray-600 border-gray-200">
          <Minus className="h-3 w-3 mr-1" />
          N/A
        </Badge>
      );
    }

    if (moic >= 3) {
      return (
        <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200">
          <ArrowUp className="h-3 w-3 mr-1" />
          {moic.toFixed(1)}x
        </Badge>
      );
    }

    if (moic >= 1) {
      return (
        <Badge variant="secondary" className="bg-blue-100 text-blue-700 border-blue-200">
          <TrendingUp className="h-3 w-3 mr-1" />
          {moic.toFixed(1)}x
        </Badge>
      );
    }

    return (
      <Badge variant="secondary" className="bg-red-100 text-red-700 border-red-200">
        <ArrowDown className="h-3 w-3 mr-1" />
        {moic.toFixed(1)}x
      </Badge>
    );
  };

  // Get stage badge
  const getStageBadge = (stage: string) => {
    const badges: Record<string, { className: string }> = {
      Seed: { className: 'bg-green-100 text-green-700 border-green-200' },
      'Series A': { className: 'bg-blue-100 text-blue-700 border-blue-200' },
      'Series B': { className: 'bg-purple-100 text-purple-700 border-purple-200' },
      'Series C': { className: 'bg-orange-100 text-orange-700 border-orange-200' },
      Growth: { className: 'bg-pink-100 text-pink-700 border-pink-200' },
    };

    return (
      <Badge variant="secondary" className={badges[stage]?.className || ''}>
        {stage}
      </Badge>
    );
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    const badges: Record<string, { className: string; label: string }> = {
      active: { className: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Active' },
      exited: { className: 'bg-green-100 text-green-700 border-green-200', label: 'Exited' },
      'written-off': {
        className: 'bg-red-100 text-red-700 border-red-200',
        label: 'Written Off',
      },
    };

    const badge = badges[status] || { className: '', label: status };
    return (
      <Badge variant="secondary" className={badge.className}>
        {badge.label}
      </Badge>
    );
  };

  // Handle export
  const handleExport = () => {
    if (onExport) {
      onExport();
    } else {
      // Default export to CSV
      const headers = [
        'Company',
        'Sector',
        'Stage',
        'Status',
        'Initial Investment',
        'Reserve Allocated',
        'Total Allocation',
        '% of Portfolio',
        'MOIC',
      ];
      const rows = allocations.map((a) => [
        a.name,
        a.sector,
        a.stage,
        a.status,
        a.initialInvestment.toFixed(2),
        a.reserveAllocated.toFixed(2),
        a.totalAllocation.toFixed(2),
        (a.percentOfPortfolio * 100).toFixed(2),
        a.moic?.toFixed(2) || 'N/A',
      ]);

      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'reserve-allocations.csv';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="font-inter font-bold text-charcoal">
            Reserve Allocations by Company
          </CardTitle>
          <Button
            onClick={handleExport}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-poppins">Company</TableHead>
                <TableHead className="font-poppins">Sector</TableHead>
                <TableHead className="font-poppins">Stage</TableHead>
                <TableHead className="font-poppins">Status</TableHead>
                <TableHead className="font-poppins text-right">Initial</TableHead>
                <TableHead className="font-poppins text-right">Reserves</TableHead>
                <TableHead className="font-poppins text-right">Total</TableHead>
                <TableHead className="font-poppins text-right">% Portfolio</TableHead>
                <TableHead className="font-poppins text-center">Performance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocations.map((allocation, idx) => (
                <TableRow
                  key={allocation.id}
                  className={cn(
                    'font-poppins',
                    idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                  )}
                >
                  <TableCell className="font-medium text-charcoal">
                    {allocation.name}
                  </TableCell>
                  <TableCell className="text-charcoal/70">{allocation.sector}</TableCell>
                  <TableCell>{getStageBadge(allocation.stage)}</TableCell>
                  <TableCell>{getStatusBadge(allocation.status)}</TableCell>
                  <TableCell className="text-right font-medium text-charcoal">
                    {formatCurrency(allocation.initialInvestment)}M
                  </TableCell>
                  <TableCell className="text-right font-medium text-charcoal">
                    {formatCurrency(allocation.reserveAllocated)}M
                  </TableCell>
                  <TableCell className="text-right font-bold text-charcoal">
                    {formatCurrency(allocation.totalAllocation)}M
                  </TableCell>
                  <TableCell className="text-right text-charcoal/70">
                    {formatPercent(allocation.percentOfPortfolio)}
                  </TableCell>
                  <TableCell className="text-center">
                    {getMoicBadge(allocation.moic)}
                  </TableCell>
                </TableRow>
              ))}

              {/* Totals Row */}
              <TableRow className="bg-charcoal/5 font-bold border-t-2 border-charcoal/20">
                <TableCell colSpan={4} className="font-inter font-bold text-charcoal">
                  TOTAL
                </TableCell>
                <TableCell className="text-right font-inter font-bold text-charcoal">
                  {formatCurrency(totals.initialInvestment)}M
                </TableCell>
                <TableCell className="text-right font-inter font-bold text-charcoal">
                  {formatCurrency(totals.reserveAllocated)}M
                </TableCell>
                <TableCell className="text-right font-inter font-bold text-charcoal">
                  {formatCurrency(totals.totalAllocation)}M
                </TableCell>
                <TableCell className="text-right font-inter font-bold text-charcoal">
                  {formatPercent(totals.totalAllocation / totalFundSize)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </div>

        {/* Summary Stats */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
          <div>
            <div className="text-sm text-charcoal/60 font-poppins">Total Companies</div>
            <div className="text-2xl font-inter font-bold text-charcoal">
              {allocations.length}
            </div>
          </div>
          <div>
            <div className="text-sm text-charcoal/60 font-poppins">Avg Allocation</div>
            <div className="text-2xl font-inter font-bold text-charcoal">
              {formatCurrency(totals.totalAllocation / allocations.length)}M
            </div>
          </div>
          <div>
            <div className="text-sm text-charcoal/60 font-poppins">Reserve Ratio</div>
            <div className="text-2xl font-inter font-bold text-charcoal">
              {formatPercent(
                totals.reserveAllocated /
                  (totals.initialInvestment + totals.reserveAllocated)
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Compact version of the allocations table for smaller displays
 */
export function AllocationsTableCompact({
  allocations,
  className,
}: Omit<AllocationsTableProps, 'totalFundSize' | 'onExport'>) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value);
  };

  return (
    <div className={cn('space-y-3', className)}>
      {allocations.map((allocation, idx) => (
        <Card
          key={allocation.id}
          className={cn(idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50')}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h4 className="font-inter font-bold text-charcoal">
                  {allocation.name}
                </h4>
                <p className="text-sm text-charcoal/60 font-poppins">
                  {allocation.sector} • {allocation.stage}
                </p>
              </div>
              {allocation.moic !== undefined && (
                <Badge
                  variant="secondary"
                  className={cn(
                    allocation.moic >= 3
                      ? 'bg-green-100 text-green-700'
                      : allocation.moic >= 1
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-red-100 text-red-700'
                  )}
                >
                  {allocation.moic.toFixed(1)}x
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <div className="text-charcoal/60 font-poppins">Initial</div>
                <div className="font-medium text-charcoal">
                  {formatCurrency(allocation.initialInvestment)}M
                </div>
              </div>
              <div>
                <div className="text-charcoal/60 font-poppins">Reserves</div>
                <div className="font-medium text-charcoal">
                  {formatCurrency(allocation.reserveAllocated)}M
                </div>
              </div>
              <div>
                <div className="text-charcoal/60 font-poppins">Total</div>
                <div className="font-bold text-charcoal">
                  {formatCurrency(allocation.totalAllocation)}M
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
