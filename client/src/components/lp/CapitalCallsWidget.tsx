/**
 * Capital Calls Widget
 *
 * Dashboard widget showing pending capital calls summary and urgent items.
 *
 * @module client/components/lp/CapitalCallsWidget
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useLPCapitalCallsSummary, useLPCapitalCalls } from '@/hooks/useLPCapitalCalls';
import { DollarSign, AlertTriangle, Clock, ArrowRight } from 'lucide-react';
import { useLocation } from 'wouter';

// ============================================================================
// COMPONENT
// ============================================================================

export function CapitalCallsWidget() {
  const { data: summary, isLoading: summaryLoading } = useLPCapitalCallsSummary();
  const { data: calls, isLoading: callsLoading } = useLPCapitalCalls({ limit: 3 });
  const [, navigate] = useLocation();

  const isLoading = summaryLoading || callsLoading;

  const formatCurrency = (cents: string) => {
    const value = Number(cents) / 100;
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
    return `$${value.toLocaleString()}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'overdue':
        return (
          <Badge variant="destructive" className="ml-2">
            Overdue
          </Badge>
        );
      case 'due':
        return (
          <Badge variant="default" className="ml-2 bg-orange-500">
            Due
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="secondary" className="ml-2">
            Pending
          </Badge>
        );
      case 'partial':
        return (
          <Badge variant="outline" className="ml-2">
            Partial
          </Badge>
        );
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <Card className="bg-white rounded-xl border border-[#E0D8D1] shadow-md">
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const hasUrgentCalls = (summary?.totalOverdue ?? 0) > 0 || (summary?.totalDue ?? 0) > 0;
  const totalPendingAmount =
    BigInt(summary?.totalPendingAmount || '0') +
    BigInt(summary?.totalDueAmount || '0') +
    BigInt(summary?.totalOverdueAmount || '0');

  return (
    <Card className="bg-white rounded-xl border border-[#E0D8D1] shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-inter text-[#292929]">
          <DollarSign className="h-5 w-5 text-blue-600" />
          Capital Calls
          {hasUrgentCalls && <AlertTriangle className="h-4 w-4 text-orange-500" />}
        </CardTitle>
        <CardDescription className="font-poppins text-[#292929]/70">
          {totalPendingAmount > 0n
            ? `${formatCurrency(totalPendingAmount.toString())} total outstanding`
            : 'No outstanding capital calls'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Summary Stats */}
        {(summary?.totalOverdue ?? 0) > 0 ||
        (summary?.totalDue ?? 0) > 0 ||
        (summary?.totalPending ?? 0) > 0 ? (
          <>
            <div className="grid grid-cols-3 gap-4 mb-4">
              {(summary?.totalOverdue ?? 0) > 0 && (
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{summary?.totalOverdue}</div>
                  <div className="text-xs text-red-600/70 font-poppins">Overdue</div>
                </div>
              )}
              {(summary?.totalDue ?? 0) > 0 && (
                <div className="text-center p-3 bg-orange-50 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">{summary?.totalDue}</div>
                  <div className="text-xs text-orange-600/70 font-poppins">Due Now</div>
                </div>
              )}
              {(summary?.totalPending ?? 0) > 0 && (
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{summary?.totalPending}</div>
                  <div className="text-xs text-blue-600/70 font-poppins">Upcoming</div>
                </div>
              )}
            </div>

            {/* Recent Calls */}
            <div className="space-y-3">
              {calls?.calls.slice(0, 3).map((call) => (
                <div
                  key={call.id}
                  className="flex items-center justify-between p-3 border border-[#E0D8D1] rounded-lg hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/lp/capital-calls/${call.id}`)}
                >
                  <div>
                    <div className="flex items-center">
                      <span className="font-medium font-inter text-sm">{call.fundName}</span>
                      {getStatusBadge(call.status)}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[#292929]/60 font-poppins mt-1">
                      <Clock className="h-3 w-3" />
                      <span>Due: {formatDate(call.dueDate)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold font-inter">{formatCurrency(call.callAmount)}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-6 text-[#292929]/60 font-poppins">
            <DollarSign className="h-10 w-10 mx-auto mb-2 text-[#292929]/30" />
            <p>No pending capital calls</p>
          </div>
        )}

        {/* View All Button */}
        <Button
          variant="ghost"
          className="w-full mt-4 font-poppins"
          onClick={() => navigate('/lp/capital-calls')}
        >
          View All Capital Calls
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </CardContent>
    </Card>
  );
}

export default CapitalCallsWidget;
