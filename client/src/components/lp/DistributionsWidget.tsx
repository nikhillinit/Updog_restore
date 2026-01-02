/**
 * Distributions Widget
 *
 * Dashboard widget showing recent distributions and YTD summary.
 *
 * @module client/components/lp/DistributionsWidget
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useLPDistributionsSummary } from '@/hooks/useLPDistributions';
import { Banknote, TrendingUp, ArrowRight, Calendar } from 'lucide-react';
import { useLocation } from 'wouter';

// ============================================================================
// COMPONENT
// ============================================================================

export function DistributionsWidget() {
  const { data: summary, isLoading } = useLPDistributionsSummary();
  const [, navigate] = useLocation();

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

  const getDistributionTypeBadge = (type: string) => {
    switch (type) {
      case 'special':
        return (
          <Badge variant="default" className="bg-purple-500">
            Special
          </Badge>
        );
      case 'final':
        return <Badge variant="destructive">Final</Badge>;
      case 'return_of_capital':
        return <Badge variant="secondary">ROC</Badge>;
      default:
        return <Badge variant="outline">Regular</Badge>;
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
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const ytdAmount = BigInt(summary?.ytdDistributed || '0');
  const currentYear = new Date().getFullYear();

  return (
    <Card className="bg-white rounded-xl border border-[#E0D8D1] shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-inter text-[#292929]">
          <Banknote className="h-5 w-5 text-green-600" />
          Distributions
        </CardTitle>
        <CardDescription className="font-poppins text-[#292929]/70">
          {summary?.pendingDistributions
            ? `${summary.pendingDistributions} pending distribution${summary.pendingDistributions > 1 ? 's' : ''}`
            : 'Recent and upcoming distributions'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* YTD Summary */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="p-4 bg-green-50 rounded-lg text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <span className="text-xs text-green-600/70 font-poppins">YTD {currentYear}</span>
            </div>
            <div className="text-xl font-bold text-green-700 font-inter">
              {ytdAmount > 0n ? formatCurrency(summary?.ytdDistributed || '0') : '$0'}
            </div>
          </div>
          <div className="p-4 bg-blue-50 rounded-lg text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Banknote className="h-4 w-4 text-blue-600" />
              <span className="text-xs text-blue-600/70 font-poppins">Total Received</span>
            </div>
            <div className="text-xl font-bold text-blue-700 font-inter">
              {summary?.totalDistributed ? formatCurrency(summary.totalDistributed) : '$0'}
            </div>
          </div>
        </div>

        {/* Recent Distributions */}
        {summary?.recentDistributions && summary.recentDistributions.length > 0 ? (
          <div className="space-y-3">
            <div className="text-sm font-medium text-[#292929]/70 font-poppins">
              Recent Distributions
            </div>
            {summary.recentDistributions.map((dist) => (
              <div
                key={dist.id}
                className="flex items-center justify-between p-3 border border-[#E0D8D1] rounded-lg hover:bg-gray-50 cursor-pointer"
                onClick={() => navigate(`/lp/distributions/${dist.id}`)}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium font-inter text-sm">{dist.fundName}</span>
                    {getDistributionTypeBadge(dist.distributionType)}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#292929]/60 font-poppins mt-1">
                    <Calendar className="h-3 w-3" />
                    <span>{formatDate(dist.distributionDate)}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold font-inter text-green-600">
                    {formatCurrency(dist.netAmount)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-[#292929]/60 font-poppins">
            <Banknote className="h-10 w-10 mx-auto mb-2 text-[#292929]/30" />
            <p>No distributions yet</p>
          </div>
        )}

        {/* View All Button */}
        <Button
          variant="ghost"
          className="w-full mt-4 font-poppins"
          onClick={() => navigate('/lp/distributions')}
        >
          View All Distributions
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </CardContent>
    </Card>
  );
}

export default DistributionsWidget;
