import React from 'react';
import { useLocation, useSearch } from 'wouter';
import { PORTFOLIO_METRICS_BASIS } from '@/lib/fund-header-metric-calculations';
import { useFundContext } from '@/contexts/FundContext';
import {
  buildDashboardHref,
  resolveDashboardView,
  type DashboardTab,
  type DashboardView,
} from '@/lib/fund-routes';
import { FundWorkspace } from '@/components/workspace/FundWorkspace';
import { PremiumCard } from '@/components/ui/PremiumCard';
import { POVBrandHeader } from '@/components/ui/POVLogo';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity, Share2 } from 'lucide-react';
import CashflowDashboard from '@/components/dashboard/CashflowDashboard';
import ShareConfigModal from '@/components/sharing/ShareConfigModal';
import type { CreateShareLinkRequest } from '@shared/sharing-schema';
import type { PublicShareSnapshotPayload } from '@shared/contracts/public-share-snapshot.contract';
import { useFundMetrics } from '@/hooks/useFundMetrics';
import { dollarsToCents, formatCents } from '@/lib/units';
import type { UnifiedFundMetrics } from '@shared/types/metrics';
import { getErrorMessage } from '@/lib/http-response';
import { useFlag } from '@/shared/useFlags';
import { ContextRail } from '@/components/context-rail/ContextRail';
import { ContextRailTrigger } from '@/components/context-rail/ContextRailTrigger';
import { buildContextRailSections } from '@/components/context-rail/context-rail-view-model';

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
      <p className="mt-1 text-xs text-presson-textMuted">{detail}</p>
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

function CapitalProgressBar({ metrics }: { metrics: UnifiedFundMetrics }) {
  const { totalCommitted, totalCalled, totalDeployed } = metrics.actual;
  const calledPct = totalCommitted > 0 ? (totalCalled / totalCommitted) * 100 : 0;
  const deployedPct = totalCommitted > 0 ? (totalDeployed / totalCommitted) * 100 : 0;

  return (
    <div className="space-y-3">
      <div className="relative h-4 w-full overflow-hidden rounded-full bg-pov-gray">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-beige transition-all"
          style={{ width: `${calledPct}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-pov-charcoal transition-all"
          style={{ width: `${deployedPct}%` }}
        />
      </div>
      <div className="flex items-center gap-6 text-xs text-presson-textMuted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-pov-charcoal" />
          Deployed {deployedPct.toFixed(1)}%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-beige" />
          Called {calledPct.toFixed(1)}%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-pov-gray" />
          Uncalled {(100 - calledPct).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

function CapitalStructurePanel({
  metrics,
  isLoading,
  error,
}: {
  metrics: UnifiedFundMetrics | undefined;
  isLoading: boolean;
  error: Error | null | undefined;
}) {
  if (isLoading || error || !metrics) return null;

  const { totalCommitted, totalCalled, totalDeployed, totalUncalled, totalDistributions } =
    metrics.actual;

  return (
    <div className="space-y-6">
      <CapitalProgressBar metrics={metrics} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricTile
          label="Committed"
          value={formatDollars(totalCommitted)}
          detail="Total LP + GP commitments"
        />
        <MetricTile
          label="Called"
          value={formatDollars(totalCalled)}
          detail="Capital called from LPs"
        />
        <MetricTile
          label="Deployed"
          value={formatDollars(totalDeployed)}
          detail="Invested into companies"
        />
        <MetricTile
          label="Dry powder"
          value={formatDollars(totalUncalled)}
          detail="Remaining uncalled capital"
        />
        <MetricTile
          label="Distributions"
          value={formatDollars(totalDistributions)}
          detail="Cash returned to LPs"
        />
      </div>
    </div>
  );
}

function PortfolioCompositionPanel({
  metrics,
  isLoading,
  error,
}: {
  metrics: UnifiedFundMetrics | undefined;
  isLoading: boolean;
  error: Error | null | undefined;
}) {
  if (isLoading || error || !metrics) return null;

  const {
    activeCompanies,
    exitedCompanies,
    writtenOffCompanies,
    totalCompanies,
    averageCheckSize,
  } = metrics.actual;

  const segments = [
    { label: 'Active', count: activeCompanies, color: 'bg-pov-charcoal' },
    { label: 'Exited', count: exitedCompanies, color: 'bg-success' },
    { label: 'Written off', count: writtenOffCompanies, color: 'bg-presson-textMuted' },
  ].filter((s) => s.count > 0);

  return (
    <div className="space-y-6">
      {totalCompanies > 0 && (
        <div className="relative flex h-4 w-full overflow-hidden rounded-full">
          {segments.map((seg) => (
            <div
              key={seg.label}
              className={`${seg.color} transition-all`}
              style={{ width: `${(seg.count / totalCompanies) * 100}%` }}
            />
          ))}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {segments.map((seg) => (
          <MetricTile
            key={seg.label}
            label={seg.label}
            value={String(seg.count)}
            detail={`${((seg.count / totalCompanies) * 100).toFixed(0)}% of portfolio`}
          />
        ))}
        <MetricTile
          label="Avg check size"
          value={formatDollars(averageCheckSize)}
          detail={`Across ${totalCompanies} companies`}
        />
      </div>
    </div>
  );
}

function PerformanceSnapshotPanel({
  metrics,
  isLoading,
  error,
}: {
  metrics: UnifiedFundMetrics | undefined;
  isLoading: boolean;
  error: Error | null | undefined;
}) {
  if (isLoading || error || !metrics) return null;

  const { totalValue, currentNAV, totalDeployed } = metrics.actual;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricTile
        label="Total value"
        value={formatDollars(totalValue)}
        detail="NAV + distributions"
      />
      <MetricTile
        label="TVPI"
        value={formatMultiple(metrics.actual.tvpi)}
        detail="Total value / paid-in"
      />
      <MetricTile
        label="Net IRR"
        value={formatRate(
          metrics.actual.availability?.irr?.status === 'unavailable' ? null : metrics.actual.irr
        )}
        detail={metrics.actual.availability?.irr?.message ?? 'Investment and valuation basis'}
      />
      <MetricTile
        label="Unrealized gain"
        value={formatDollars(currentNAV - totalDeployed)}
        detail={
          totalDeployed > 0
            ? `${(((currentNAV - totalDeployed) / totalDeployed) * 100).toFixed(1)}% on deployed`
            : 'No capital deployed'
        }
      />
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
          label="IRR estimate"
          value={formatRate(
            metrics.actual.availability?.irr?.status === 'unavailable' ? null : metrics.actual.irr
          )}
          detail={
            metrics.actual.availability?.irr?.message ?? 'Dated investment and valuation basis'
          }
        />
        <MetricTile
          label="TVPI estimate"
          value={formatMultiple(metrics.actual.tvpi)}
          detail="Total value to recorded investment capital"
        />
        <MetricTile
          label="DPI estimate"
          value={formatMultiple(metrics.actual.dpi)}
          detail="Recorded distributions to investment capital"
        />
        <MetricTile
          label="RVPI estimate"
          value={formatMultiple(metrics.actual.rvpi)}
          detail="Residual value to recorded investment capital"
        />
      </div>
      <p className="text-sm text-charcoal-600">{PORTFOLIO_METRICS_BASIS}</p>
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
  const [location, navigate] = useLocation();
  const search = useSearch();
  const view = resolveDashboardView(location, search);

  // Unknown or duplicate tab: normalize to the Workspace, retaining a valid fundId.
  React.useEffect(() => {
    if (view && !view.normalized) {
      navigate(
        buildDashboardHref(null, view.fundId.kind === 'valid' ? view.fundId.id : null, search),
        { replace: true }
      );
    }
  }, [navigate, search, view]);

  if (!view || view.view === 'workspace') {
    return <FundWorkspace selection={view?.fundId ?? { kind: 'absent' }} />;
  }
  return <AnalyticsDashboard view={view} search={search} />;
}

function AnalyticsDashboard({
  view,
  search,
}: {
  view: Extract<DashboardView, { view: 'analytics' }>;
  search: string;
}) {
  const [, navigate] = useLocation();
  const { currentFund, isLoading } = useFundContext();
  const activeView = view.tab;
  const setActiveView = (tab: string) =>
    navigate(buildDashboardHref(tab as DashboardTab, currentFund?.id ?? null, search));
  const metricsQuery = useFundMetrics({ enabled: Boolean(currentFund) });
  const contextRailEnabled = useFlag('enable_context_rail');
  const contextRailSections = buildContextRailSections({
    asOfDate: metricsQuery.data?.actual.asOfDate ?? null,
  });

  const handleCreateShare = async (
    config: CreateShareLinkRequest
  ): Promise<{ shareUrl: string; shareId: string; snapshot?: PublicShareSnapshotPayload }> => {
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
      throw new Error(getErrorMessage(body, response.status) ?? 'Failed to create share link');
    }

    const typed = body as {
      share?: { id?: string; shareUrl?: string };
      snapshot?: PublicShareSnapshotPayload;
    };
    const share = typed.share;
    if (!share?.id || !share.shareUrl) {
      throw new Error('Share API returned an invalid response');
    }

    return {
      shareId: share.id,
      shareUrl: `${window.location.origin}${share.shareUrl}`,
      ...(typed.snapshot ? { snapshot: typed.snapshot } : {}),
    };
  };

  if (!isLoading && !currentFund) {
    return (
      <div className="min-h-screen bg-pov-gray">
        <POVBrandHeader
          title="Analytics"
          subtitle="Choose a fund to view analytics"
          variant="light"
        />
        <div className="max-w-7xl mx-auto px-6 py-8" data-testid="analytics-select-fund">
          <p className="text-sm text-presson-text">No fund is selected.</p>
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={() => navigate(buildDashboardHref(null, null, search))}
          >
            Choose a fund in the workspace
          </Button>
        </div>
      </div>
    );
  }

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

  const dashboardTabs = (
    <>
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

        <PremiumCard
          title="Capital structure"
          subtitle="Commitment, deployment, and distribution lifecycle"
        >
          <CapitalStructurePanel
            metrics={metricsQuery.data}
            isLoading={metricsQuery.isLoading}
            error={metricsQuery.error}
          />
        </PremiumCard>

        <PremiumCard
          title="Portfolio composition"
          subtitle="Company status breakdown and investment sizing"
        >
          <PortfolioCompositionPanel
            metrics={metricsQuery.data}
            isLoading={metricsQuery.isLoading}
            error={metricsQuery.error}
          />
        </PremiumCard>

        <PremiumCard
          title="Performance snapshot"
          subtitle="Key return metrics from the unified layer"
        >
          <PerformanceSnapshotPanel
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
        <CashflowDashboard fundId={String(currentFund?.id || 'default')} className="max-w-none" />
      </TabsContent>
    </>
  );

  return (
    <div className="min-h-screen bg-pov-gray">
      <POVBrandHeader
        title="Dashboard"
        subtitle="Fund workspace and truthful live surfaces"
        variant="light"
      />

      {/* Main Content */}
      <Tabs
        value={activeView}
        onValueChange={setActiveView}
        className="max-w-7xl mx-auto px-6 py-8"
      >
        {/* Top Controls */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div className="flex items-center space-x-4">
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
          </div>

          <div className="flex items-center space-x-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => navigate(buildDashboardHref(null, currentFund.id, search))}
              data-testid="analytics-workspace-action"
            >
              Workspace
            </Button>
            {contextRailEnabled && (
              <ContextRailTrigger sections={contextRailSections} className="xl:hidden" />
            )}
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

        {contextRailEnabled ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="min-w-0">{dashboardTabs}</section>
            <ContextRail sections={contextRailSections} className="hidden xl:block" />
          </div>
        ) : (
          dashboardTabs
        )}
      </Tabs>
    </div>
  );
}
