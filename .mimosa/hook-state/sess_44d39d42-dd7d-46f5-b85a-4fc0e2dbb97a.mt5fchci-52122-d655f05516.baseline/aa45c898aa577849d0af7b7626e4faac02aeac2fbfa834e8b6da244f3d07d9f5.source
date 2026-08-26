/**
 * LP Fund Detail Page
 *
 * Fund-specific view combining capital account and performance data.
 *
 * @module client/pages/lp/fund-detail
 */

import { useRoute } from 'wouter';
import { useLPFundDetail } from '@/hooks/useLPFundDetail';
import PerformanceMetricsCard from '@/components/lp/PerformanceMetricsCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Building2, Calendar } from 'lucide-react';

// ============================================================================
// COMPONENT
// ============================================================================

export default function LPFundDetail() {
  const [, params] = useRoute('/lp/fund-detail/:fundId');
  const fundId = params?.fundId ? parseInt(params.fundId) : 0;

  const { data: detailData, isLoading } = useLPFundDetail({
    fundId,
    enabled: !!fundId,
  });

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!detailData) {
    return (
      <div className="p-8 text-center">
        <p className="text-charcoal-600 font-poppins">Fund not found</p>
      </div>
    );
  }

  const formatCurrency = (value: number) => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
    return `$${value.toLocaleString()}`;
  };

  const formatPercent = (value: number) => `${(value * 100).toFixed(2)}%`;

  const { fundDetail } = detailData;

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold font-inter text-pov-charcoal">
              {fundDetail.fundName}
            </h1>
            <Badge variant="outline">{fundDetail.vintageYear}</Badge>
          </div>
          <p className="text-charcoal-600 font-poppins mt-1">
            As of {new Date(fundDetail.asOfDate).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Fund Overview */}
      <Card className="bg-white rounded-xl border border-beige-200 shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-inter text-lg text-pov-charcoal">
            <Building2 className="h-5 w-5 text-pov-charcoal" />
            Fund Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="text-sm font-poppins text-charcoal-400 mb-1">Your Commitment</div>
              <div className="text-2xl font-bold font-inter text-pov-charcoal">
                {formatCurrency(fundDetail.commitment)}
              </div>
              <div className="text-xs font-poppins text-charcoal-600 mt-1">
                {formatPercent(fundDetail.percentOfFund)} of fund
              </div>
            </div>

            <div>
              <div className="text-sm font-poppins text-charcoal-400 mb-1">Fund Size</div>
              <div className="text-2xl font-bold font-inter text-pov-charcoal">
                {formatCurrency(fundDetail.fundSize)}
              </div>
            </div>

            <div>
              <div className="text-sm font-poppins text-charcoal-400 mb-1">Capital Called</div>
              <div className="text-2xl font-bold font-inter text-pov-charcoal">
                {formatCurrency(fundDetail.called)}
              </div>
              <div className="text-xs font-poppins text-charcoal-600 mt-1">
                {formatPercent(fundDetail.percentCalled)} of commitment
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance Metrics */}
      <PerformanceMetricsCard
        irr={fundDetail.irr}
        tvpi={fundDetail.tvpi}
        dpi={fundDetail.dpi}
        rvpi={fundDetail.rvpi}
      />

      {/* Value Breakdown */}
      <Card className="bg-white rounded-xl border border-beige-200 shadow-md">
        <CardHeader>
          <CardTitle className="font-inter text-lg text-pov-charcoal">Value Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="text-center p-4 bg-pov-gray rounded-lg">
              <div className="text-2xl font-bold font-inter text-pov-charcoal">
                {formatCurrency(fundDetail.distributed)}
              </div>
              <div className="text-sm font-poppins text-charcoal-600 mt-1">Total Distributed</div>
            </div>

            <div className="text-center p-4 bg-pov-gray rounded-lg">
              <div className="text-2xl font-bold font-inter text-pov-charcoal">
                {formatCurrency(fundDetail.nav)}
              </div>
              <div className="text-sm font-poppins text-charcoal-600 mt-1">Current NAV</div>
            </div>

            <div className="text-center p-4 bg-pov-gray rounded-lg">
              <div className="text-2xl font-bold font-inter text-presson-positive">
                {formatCurrency(fundDetail.realizedValue)}
              </div>
              <div className="text-sm font-poppins text-charcoal-600 mt-1">Realized Value</div>
            </div>

            <div className="text-center p-4 bg-pov-gray rounded-lg">
              <div className="text-2xl font-bold font-inter text-presson-info">
                {formatCurrency(fundDetail.unrealizedValue)}
              </div>
              <div className="text-sm font-poppins text-charcoal-600 mt-1">Unrealized Value</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Transactions */}
      {detailData.recentTransactions.length > 0 && (
        <Card className="bg-white rounded-xl border border-beige-200 shadow-md">
          <CardHeader>
            <CardTitle className="font-inter text-lg text-pov-charcoal">
              Recent Transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {detailData.recentTransactions.slice(0, 5).map((txn) => (
                <div
                  key={txn.id}
                  className="flex items-center justify-between p-3 border border-beige-200 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-charcoal-400" />
                    <div>
                      <div className="font-inter font-medium text-pov-charcoal">
                        {txn.description}
                      </div>
                      <div className="text-sm font-poppins text-charcoal-600">
                        {new Date(txn.transactionDate).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div
                    className={`font-mono text-sm font-bold ${txn.amount < 0 ? 'text-presson-negative' : 'text-presson-positive'}`}
                  >
                    {formatCurrency(txn.amount)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
