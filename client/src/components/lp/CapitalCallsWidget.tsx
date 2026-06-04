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
          <Badge variant="default" className="ml-2 bg-warning text-pov-white">
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
      <Card className="bg-pov-white rounded-xl border border-beige-200 shadow-md">
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
    <Card className="bg-pov-white rounded-xl border border-beige-200 shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-inter text-pov-charcoal">
          <DollarSign className="h-5 w-5 text-presson-info" />
          Capital Calls
          {hasUrgentCalls && <AlertTriangle className="h-4 w-4 text-warning" />}
        </CardTitle>
        <CardDescription className="font-poppins text-pov-charcoal/70">
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
                <div className="text-center p-3 bg-error/10 rounded-lg">
                  <div className="text-2xl font-bold text-error-dark">{summary?.totalOverdue}</div>
                  <div className="text-xs text-error-dark/70 font-poppins">Overdue</div>
                </div>
              )}
              {(summary?.totalDue ?? 0) > 0 && (
                <div className="text-center p-3 bg-warning/10 rounded-lg">
                  <div className="text-2xl font-bold text-warning-dark">{summary?.totalDue}</div>
                  <div className="text-xs text-warning-dark/70 font-poppins">Due Now</div>
                </div>
              )}
              {(summary?.totalPending ?? 0) > 0 && (
                <div className="text-center p-3 bg-presson-info/10 rounded-lg">
                  <div className="text-2xl font-bold text-presson-info">
                    {summary?.totalPending}
                  </div>
                  <div className="text-xs text-presson-info/70 font-poppins">Upcoming</div>
                </div>
              )}
            </div>

            {/* Recent Calls */}
            <div className="space-y-3">
              {calls?.calls.slice(0, 3).map((call) => (
                <div
                  key={call.id}
                  className="flex items-center justify-between p-3 border border-beige-200 rounded-lg hover:bg-pov-gray cursor-pointer"
                  onClick={() => navigate(`/lp/capital-calls/${call.id}`)}
                >
                  <div>
                    <div className="flex items-center">
                      <span className="font-medium font-inter text-sm">{call.fundName}</span>
                      {getStatusBadge(call.status)}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-pov-charcoal/60 font-poppins mt-1">
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
          <div className="text-center py-6 text-pov-charcoal/60 font-poppins">
            <DollarSign className="h-10 w-10 mx-auto mb-2 text-pov-charcoal/30" />
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
