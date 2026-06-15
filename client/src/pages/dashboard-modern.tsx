import React, { useState } from 'react';
import { useFundContext } from '@/contexts/FundContext';
import { PremiumCard } from '@/components/ui/PremiumCard';
import { POVBrandHeader } from '@/components/ui/POVLogo';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity, Share2 } from 'lucide-react';
import CashflowDashboard from '@/components/dashboard/CashflowDashboard';
import ShareConfigModal from '@/components/sharing/ShareConfigModal';
import type { CreateShareLinkRequest } from '@shared/sharing-schema';
import { useFundMetrics } from '@/hooks/useFundMetrics';
import { dollarsToCents, formatCents } from '@/lib/units';
import type { UnifiedFundMetrics } from '@shared/types/metrics';
import { getErrorMessage } from '@/lib/http-response';

function formatDollars(value: number): string {
  return formatCents(dollarsToCents(value), { compact: true });
}

function formatRate(value: number | null | undefined): string {
  return value == null ? 'N/A' : `${(value * 100).toFixed(1)}%`;
}

function formatMultiple(value: number | null | undefined): string {
  return value == null ? 'N/A' : `${value.toFixed(2)}x`;
}

function MetricTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-md border border-pov-beige bg-white p-4">
      <p className="text-sm text-charcoal-600">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-pov-charcoal">{value}</p>
      <p className="mt-1 text-xs text-charcoal-500">{detail}</p>
    </div>
  );
}

function MetricsUnavailable({ error }: { error: Error | null | undefined }) {
  return (
    <div className="rounded-md border border-warning/30 bg-warning-light p-4 text-sm text-warning-dark">
      <p className="font-medium">Dashboard metrics are temporarily unavailable.</p>
      <p className="mt-1">
        {error?.message || 'The unified metrics layer did not return a supported snapshot.'}
      </p>
    </div>
  );
}

function OverviewMetricsPanel({
  metrics,
  isLoading,
  error,
}: {
  metrics: UnifiedFundMetrics | undefined;
  isLoading: boolean;
  error: Error | null | undefined;
}) {
  if (isLoading) {
    return <p className="text-sm text-charcoal-600">Loading dashboard metrics...</p>;
  }

  if (error || !metrics) {
    return <MetricsUnavailable error={error} />;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricTile
        label="Total committed"
        value={formatDollars(metrics.actual.totalCommitted)}
        detail="Fund commitments from the unified metrics layer"
      />
      <MetricTile
        label="Capital deployed"
        value={formatDollars(metrics.actual.totalDeployed)}
        detail={`${metrics.actual.deploymentRate.toFixed(1)}% deployment rate`}
      />
      <MetricTile
        label="Current NAV"
        value={formatDollars(metrics.actual.currentNAV)}
        detail="Reported portfolio fair value"
      />
      <MetricTile
        label="Active companies"
        value={String(metrics.actual.activeCompanies)}
        detail={`${metrics.actual.totalCompanies} total companies tracked`}
      />
    </div>
  );
}

function PerformanceMetricsPanel({
  metrics,
  isLoading,
  error,
}: {
  metrics: UnifiedFundMetrics | undefined;
  isLoading: boolean;
  error: Error | null | undefined;
}) {
  if (isLoading) {
    return <p className="text-sm text-charcoal-600">Loading dashboard metrics...</p>;
  }

  if (error || !metrics) {
    return <MetricsUnavailable error={error} />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="IRR"
          value={formatRate(metrics.actual.irr)}
          detail={`Target ${formatRate(metrics.variance.performanceVariance.targetIRR)}`}
        />
        <MetricTile
          label="TVPI"
          value={formatMultiple(metrics.actual.tvpi)}
          detail="Total value to paid-in"
        />
        <MetricTile
          label="DPI"
          value={formatMultiple(metrics.actual.dpi)}
          detail="Distributions to paid-in"
        />
        <MetricTile
          label="RVPI"
          value={formatMultiple(metrics.actual.rvpi)}
          detail="Residual value to paid-in"
        />
      </div>
      <div className="rounded-md border border-pov-beige bg-pov-gray p-4 text-sm text-charcoal-700">
        <p className="font-medium text-pov-charcoal">Benchmark and attribution unavailable</p>
        <p className="mt-1">
          Public benchmark rank, attribution, and quartile claims remain hidden until an
          authoritative benchmark source is wired.
        </p>
      </div>
    </div>
  );
}

export default function ModernDashboard() {
  const { currentFund, isLoading } = useFundContext();
  const [activeView, setActiveView] = useState('overview');
  const metricsQuery = useFundMetrics({ enabled: Boolean(currentFund) });

  const handleCreateShare = async (
    config: CreateShareLinkRequest
  ): Promise<{ shareUrl: string; shareId: string }> => {
    const response = await fetch('/api/shares', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify(config),
    });

    const body = (await response.json()) as unknown;
    if (!response.ok) {
      throw new Error(getErrorMessage(body) ?? 'Failed to create share link');
    }

    const share = (body as { share?: { id?: string; shareUrl?: string } }).share;
    if (!share?.id || !share.shareUrl) {
      throw new Error('Share API returned an invalid response');
    }

    return {
      shareId: share.id,
      shareUrl: `${window.location.origin}${share.shareUrl}`,
    };
  };

  if (isLoading || !currentFund) {
    return (
      <div className="min-h-screen bg-pov-gray">
        <POVBrandHeader
          title="Dashboard"
          subtitle="Real-time fund performance and portfolio analytics"
          variant="light"
        />
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="animate-pulse space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="h-32 bg-pov-white rounded-lg shadow-card"></div>
              ))}
            </div>
            <div className="h-96 bg-pov-white rounded-lg shadow-card"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pov-gray">
      <POVBrandHeader
        title="Dashboard"
        subtitle="Fund workspace and truthful live surfaces"
        variant="light"
      />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Top Controls */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div className="flex items-center space-x-4">
            <Tabs value={activeView} onValueChange={setActiveView} className="w-full">
              <TabsList className="bg-pov-white border border-pov-gray">
                <TabsTrigger
                  value="overview"
                  className="data-[state=active]:bg-pov-charcoal data-[state=active]:text-pov-white"
                >
                  Overview
                </TabsTrigger>
                <TabsTrigger
                  value="performance"
                  className="data-[state=active]:bg-pov-charcoal data-[state=active]:text-pov-white"
                >
                  Performance
                </TabsTrigger>
                <TabsTrigger
                  value="cashflow"
                  className="data-[state=active]:bg-pov-charcoal data-[state=active]:text-pov-white"
                >
                  <Activity className="h-4 w-4 mr-2" />
                  Cashflow
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex items-center space-x-3">
            <ShareConfigModal
              fundId={String(currentFund.id || 'demo-fund')}
              fundName={currentFund.name || 'Demo Fund'}
              onCreateShare={handleCreateShare}
            >
              <Button
                variant="outline"
                size="sm"
                className="border-pov-gray hover:bg-pov-charcoal hover:text-pov-white"
              >
                <Share2 className="h-4 w-4 mr-2" />
                Share with LPs
              </Button>
            </ShareConfigModal>
          </div>
        </div>

        <Tabs value={activeView} className="space-y-8">
          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-8">
            <PremiumCard
              title="Supported overview metrics"
              subtitle="Backed by the unified metrics layer for the selected fund"
            >
              <OverviewMetricsPanel
                metrics={metricsQuery.data}
                isLoading={metricsQuery.isLoading}
                error={metricsQuery.error}
              />
            </PremiumCard>
          </TabsContent>

          {/* Performance Tab */}
          <TabsContent value="performance" className="space-y-8">
            <PremiumCard
              title="Supported performance metrics"
              subtitle="Current fund performance from supported metrics contracts"
            >
              <PerformanceMetricsPanel
                metrics={metricsQuery.data}
                isLoading={metricsQuery.isLoading}
                error={metricsQuery.error}
              />
            </PremiumCard>
          </TabsContent>

          {/* Cashflow Management Tab */}
          <TabsContent value="cashflow" className="space-y-8">
            <CashflowDashboard
              fundId={String(currentFund?.id || 'default')}
              className="max-w-none"
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
