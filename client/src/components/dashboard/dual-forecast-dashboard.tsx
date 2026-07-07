import { LineChart } from 'recharts/es6/chart/LineChart';
import { Line } from 'recharts/es6/cartesian/Line';
import { XAxis } from 'recharts/es6/cartesian/XAxis';
import { YAxis } from 'recharts/es6/cartesian/YAxis';
import { CartesianGrid } from 'recharts/es6/cartesian/CartesianGrid';
import { Tooltip } from 'recharts/es6/component/Tooltip';
import { Legend } from 'recharts/es6/component/Legend';
import { LazyResponsiveContainer as ResponsiveContainer } from '@/components/charts/LazyResponsiveContainer';
import { BarChart } from 'recharts/es6/chart/BarChart';
import { Bar } from 'recharts/es6/cartesian/Bar';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, DollarSign, Target, PieChart } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import type { DashboardKpiEvidence, DashboardSummary } from '@/types/fund';
import { useFundContext } from '@/contexts/FundContext';
import { useDualForecast } from '@/hooks/useDualForecast';
import { presson } from '@/theme/presson.tokens';
import {
  buildAttributionRows,
  buildAttributionSummary,
  buildForecastChartPoints,
  countNoFactsRows,
  formatForecastSeriesName,
  formatMillionValue,
  formatSignedMillion,
  formatSignedPercent,
  getLatestForecastDrift,
  SUMMARY_UNAVAILABLE_NOTICE_COPY,
  type ForecastChartPoint,
  type ForecastMetricDrift,
  type TrustFilterKey,
} from '@/lib/dual-forecast-display';
import { CurrentProjectionNotice } from '@/components/dashboard/CurrentProjectionNotice';
import { FactsUnavailableNotice } from '@/components/dashboard/FactsUnavailableNotice';
import { NavAttributionTable } from '@/components/dashboard/NavAttributionTable';
import { TrustStateCounts } from '@/components/dashboard/TrustStateCounts';

const MILLION = 1_000_000;
const FORECAST_SERIES_COLORS = [
  presson.color.text,
  presson.color.positive,
  presson.color.info,
] as const;

interface PortfolioChartPoint {
  name: string;
  value: number;
  investment: number;
  sector: string;
  stage: string;
}

function parseNumericValue(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function formatSeriesName(name: NameType | undefined): string {
  return name === 'value' ? 'Recorded Value' : 'Investment';
}

function formatEvidenceDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return value.slice(0, 10);
}

function evidenceTimestampSegment(evidence: DashboardKpiEvidence): string {
  const asOfDate = formatEvidenceDate(evidence.asOfDate);
  if (asOfDate) {
    return `as of ${asOfDate}`;
  }

  const calculatedAt = formatEvidenceDate(evidence.calculatedAt);
  if (calculatedAt) {
    return `calculated ${calculatedAt}`;
  }

  if (evidence.freshness === 'source_unavailable') {
    return 'source unavailable';
  }

  return 'timestamp unavailable';
}

function KpiEvidenceLine({ evidence }: { evidence: DashboardKpiEvidence }) {
  const needsNote = evidence.status !== 'available' || evidence.freshness !== 'timestamped';

  return (
    <div className="mt-2 space-y-0.5 text-[11px] leading-snug text-charcoal-600">
      <p>
        {evidence.source} · fund {evidence.fundId} · {evidenceTimestampSegment(evidence)}
      </p>
      <p>
        {evidence.readModel} · {evidence.sourceEndpoint}
        {needsNote ? ` · ${evidence.note}` : ''}
      </p>
    </div>
  );
}

function PortfolioAllocationEvidenceRail({
  evidence,
}: {
  evidence: DashboardSummary['evidence']['portfolioAllocation'];
}) {
  return (
    <div
      role="note"
      aria-label="Portfolio allocation evidence"
      className="mb-4 rounded-md border border-beige-200 bg-beige-50 px-3 py-2 text-xs leading-relaxed text-charcoal-700"
    >
      <p>
        Source: {evidence.source} · fund {evidence.fundId} · {evidence.companyCount} companies ·{' '}
        {evidence.valuedCompanyCount} valued
      </p>
      <p>Valuation freshness unavailable: {evidence.valuationFreshness.reason}</p>
      <p>
        {evidence.readModel} · {evidence.sourceEndpoint}
      </p>
    </div>
  );
}

function formatRechartsMillionValue(value: ValueType | undefined): string {
  if (value == null) {
    return formatMillionValue(undefined);
  }

  if (typeof value === 'number' || typeof value === 'string') {
    return formatMillionValue(value);
  }

  return formatMillionValue([...value]);
}

function DriftCallout({
  metricLabel,
  drift,
}: {
  metricLabel: string;
  drift: ForecastMetricDrift | null;
}) {
  if (!drift) return null;

  const percentPhrase = formatSignedPercent(drift.deltaPct);

  return (
    <div className="rounded-md border border-beige-200 bg-white px-3 py-2 text-sm">
      <p className="font-medium text-pov-charcoal">
        {drift.label} {metricLabel} drift
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-pov-charcoal">
        {formatSignedMillion(drift.delta)}
      </p>
      {percentPhrase ? (
        <p className="text-xs text-charcoal-600">
          Current forecast is {percentPhrase} construction plan.
        </p>
      ) : null}
    </div>
  );
}

interface ForecastTooltipPayloadItem {
  name?: NameType;
  dataKey?: NameType;
  value?: ValueType;
  color?: string;
  payload?: ForecastChartPoint;
}

function ForecastTooltip({
  active,
  label,
  payload,
  metric,
}: {
  active?: boolean;
  label?: string;
  payload?: ForecastTooltipPayloadItem[];
  metric: 'nav' | 'calledCapital';
}) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload;
  const delta = metric === 'nav' ? point?.navDelta : point?.calledCapitalDelta;
  const deltaPct = metric === 'nav' ? point?.navDeltaPct : point?.calledCapitalDeltaPct;
  const percentPhrase = formatSignedPercent(deltaPct ?? null);

  return (
    <div className="rounded-md border border-beige-200 bg-white p-3 text-xs shadow-md">
      <p className="mb-2 font-medium text-pov-charcoal">{label}</p>
      <div className="space-y-1">
        {payload.map((item) => (
          <div
            key={String(item.dataKey ?? item.name)}
            className="flex items-center justify-between gap-4"
          >
            <span className="text-charcoal-600">
              {formatForecastSeriesName(item.dataKey ?? item.name)}
            </span>
            <span className="font-medium tabular-nums text-pov-charcoal">
              {formatRechartsMillionValue(item.value)}
            </span>
          </div>
        ))}
      </div>
      {delta != null ? (
        <p className="mt-2 border-t border-beige-200 pt-2 font-medium text-pov-charcoal">
          Delta vs construction: {formatSignedMillion(delta)}
          {percentPhrase ? ` (${percentPhrase})` : ''}
        </p>
      ) : null}
    </div>
  );
}

export default function DualForecastDashboard() {
  const { currentFund, isLoading: isFundLoading, needsSetup, isDemoMode } = useFundContext();
  const fundId = currentFund?.id ?? null;

  const {
    data: dashboardData,
    isLoading,
    error,
  } = useQuery<DashboardSummary>({
    queryKey: [`/api/dashboard-summary/${fundId}`],
    enabled: fundId != null && !isDemoMode,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const {
    data: dualForecast,
    isLoading: isForecastLoading,
    error: forecastError,
  } = useDualForecast(fundId, {
    enabled: fundId != null && !isDemoMode,
    refetchInterval: 60000,
  });

  const [trustFilter, setTrustFilter] = useState<TrustFilterKey | null>(null);
  const attributionRef = useRef<HTMLDivElement | null>(null);

  const forecastData: ForecastChartPoint[] = useMemo(
    () => buildForecastChartPoints(dualForecast?.series ?? []),
    [dualForecast]
  );

  // Filter keys on trustState value, not row index: the 60s refetch can
  // reorder/regrow the companies array under an open filter.
  const attributionRows = useMemo(
    () =>
      buildAttributionRows(dualForecast?.navAnchoring ?? null, dualForecast?.actualsFacts ?? null),
    [dualForecast]
  );

  const clearTrustFilter = useCallback(() => setTrustFilter(null), []);

  const handleTrustFilterChange = useCallback((filter: TrustFilterKey | null) => {
    setTrustFilter(filter);
    if (filter == null) {
      return;
    }

    const node = attributionRef.current;
    if (!node || typeof node.scrollIntoView !== 'function') {
      return;
    }

    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    node.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
  }, []);

  if (isFundLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <p className="font-medium">Loading active fund context…</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isDemoMode) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <p className="font-medium">Forecasting unavailable in demo mode</p>
            <p className="text-muted-foreground mt-2">
              Load live fund data before using the deterministic forecast surface.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (needsSetup || fundId == null) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <p className="font-medium">Select or create a fund to view forecasting data</p>
            <p className="text-muted-foreground mt-2">
              Forecasting stays unavailable until an active fund context exists.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading || isForecastLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="animate-pulse">
          <CardHeader>
            <div className="h-6 bg-pov-gray rounded w-3/4"></div>
          </CardHeader>
          <CardContent>
            <div className="h-48 bg-pov-gray rounded"></div>
          </CardContent>
        </Card>
        <Card className="animate-pulse">
          <CardHeader>
            <div className="h-6 bg-pov-gray rounded w-3/4"></div>
          </CardHeader>
          <CardContent>
            <div className="h-48 bg-pov-gray rounded"></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // CP1 decoupling (ADR-028): the two sources fail independently. Summary
  // failure degrades the header cards + Portfolio Allocation behind one
  // notice; forecast failure blocks only the forecast region.
  const summaryFailed = Boolean(error) || !dashboardData;
  const forecastFailed = Boolean(forecastError) || !dualForecast;

  if (summaryFailed && forecastFailed) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <p className="text-error-dark font-medium">Unable to load forecast data</p>
            <p className="text-muted-foreground mt-2">Please check API connectivity</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Transform real data for forecasting charts
  const currentMetrics = dashboardData?.metrics;
  const baseValue =
    currentMetrics?.totalValue != null ? parseNumericValue(currentMetrics.totalValue) : null;
  const currentIRR = currentMetrics?.irr != null ? parseNumericValue(currentMetrics.irr) : null;
  const latestDrift = getLatestForecastDrift(forecastData);
  const navAnchoring = dualForecast?.navAnchoring ?? null;
  const noFactsCount = countNoFactsRows(attributionRows);
  const attributionSummary = navAnchoring
    ? buildAttributionSummary(navAnchoring.countsByTrustState, attributionRows.length)
    : null;

  // Portfolio allocation data from real API
  const portfolioData: PortfolioChartPoint[] = (dashboardData?.portfolioCompanies ?? []).map(
    (company) => ({
      name: company.name,
      value: Math.round(parseNumericValue(company.currentValuation) / MILLION),
      investment: Math.round(parseNumericValue(company.investmentAmount) / MILLION),
      sector: company.sector,
      stage: company.stage,
    })
  );

  return (
    <div className="space-y-6">
      {/* Live Metrics Header (degrades behind one notice on summary failure) */}
      {summaryFailed || !dashboardData ? (
        <div role="status" className="rounded-md border border-beige-200 bg-white px-3 py-2">
          <p className="text-sm font-medium text-pov-charcoal">
            {SUMMARY_UNAVAILABLE_NOTICE_COPY.headline}
          </p>
          <p className="mt-1 text-xs text-charcoal-600">{SUMMARY_UNAVAILABLE_NOTICE_COPY.body}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Current AUM</p>
                  <p className="text-2xl font-bold">
                    {baseValue === null ? 'Unavailable' : `$${(baseValue / MILLION).toFixed(1)}M`}
                  </p>
                  <KpiEvidenceLine evidence={dashboardData.evidence.kpis.currentAum} />
                </div>
                <DollarSign className="h-8 w-8 text-charcoal-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Dashboard IRR</p>
                  <p className="text-2xl font-bold">
                    {currentIRR === null ? 'Unavailable' : `${(currentIRR * 100).toFixed(1)}%`}
                  </p>
                  <KpiEvidenceLine evidence={dashboardData.evidence.kpis.irr} />
                </div>
                <TrendingUp className="h-8 w-8 text-charcoal-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Portfolio Cos</p>
                  <p className="text-2xl font-bold">{dashboardData.portfolioCompanies.length}</p>
                  <KpiEvidenceLine evidence={dashboardData.evidence.kpis.portfolioCompanies} />
                </div>
                <PieChart className="h-8 w-8 text-charcoal-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Deployment</p>
                  <p className="text-2xl font-bold">
                    {dashboardData.summary.deploymentRate.toFixed(0)}%
                  </p>
                  <KpiEvidenceLine evidence={dashboardData.evidence.kpis.deployment} />
                </div>
                <Target className="h-8 w-8 text-charcoal-600" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Dual Forecast Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Value Projection Chart (forecast failure blocks only this region) */}
        {forecastFailed || !dualForecast ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-8">
                <p className="text-error-dark font-medium">Unable to load forecast data</p>
                <p className="text-muted-foreground mt-2">Please check API connectivity</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Fund Value Forecast</CardTitle>
              {navAnchoring ? (
                <TrustStateCounts
                  blendedNav={navAnchoring.blendedNav}
                  counts={navAnchoring.countsByTrustState}
                  noFactsCount={noFactsCount}
                  activeFilter={trustFilter}
                  onFilterChange={handleTrustFilterChange}
                />
              ) : (
                <FactsUnavailableNotice />
              )}
              <CardDescription>
                Quarterly NAV comparison from the published plan, blended actuals, and current
                forecast.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CurrentProjectionNotice projection={dualForecast.currentProjection} />
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={forecastData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis label={{ value: 'NAV ($M)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip content={<ForecastTooltip metric="nav" />} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="constructionNav"
                    stroke={FORECAST_SERIES_COLORS[0]}
                    strokeWidth={3}
                    dot={{ r: 3 }}
                    name="Construction Plan"
                  />
                  <Line
                    type="monotone"
                    dataKey="actualNav"
                    stroke={FORECAST_SERIES_COLORS[1]}
                    strokeWidth={3}
                    dot={{ r: 4 }}
                    name="Actuals"
                  />
                  <Line
                    type="monotone"
                    dataKey="currentForecastNav"
                    stroke={FORECAST_SERIES_COLORS[2]}
                    strokeWidth={3}
                    dot={{ r: 3 }}
                    name="Current Forecast"
                  />
                </LineChart>
              </ResponsiveContainer>
              <div className="mt-3" aria-label="Forecast drift summary">
                <DriftCallout metricLabel="NAV" drift={latestDrift?.nav ?? null} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Portfolio Allocation (CP2: un-provenanced legacy valuations, ADR-029) */}
        {!summaryFailed && dashboardData ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Portfolio Allocation
                <Badge variant="outline" className="text-xs">
                  Recorded valuations
                </Badge>
              </CardTitle>
              <CardDescription>
                Recorded (unverified) valuation vs invested capital by company
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PortfolioAllocationEvidenceRail
                evidence={dashboardData.evidence.portfolioAllocation}
              />
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={portfolioData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis label={{ value: 'Value ($M)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip
                    formatter={(value: ValueType | undefined, name: NameType | undefined) => [
                      formatRechartsMillionValue(value),
                      formatSeriesName(name),
                    ]}
                  />
                  <Legend />
                  <Bar dataKey="investment" fill={FORECAST_SERIES_COLORS[0]} name="Investment" />
                  <Bar dataKey="value" fill={FORECAST_SERIES_COLORS[1]} name="Recorded Value" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* NAV Attribution (ADR-030 mandatory adjacent attribution) */}
      {!forecastFailed && dualForecast && navAnchoring ? (
        <div ref={attributionRef}>
          <NavAttributionTable
            rows={attributionRows}
            activeFilter={trustFilter}
            onClearFilter={clearTrustFilter}
            summary={attributionSummary}
            freshness={
              dualForecast.actualsFacts
                ? {
                    asOfDate: dualForecast.actualsFacts.asOfDate,
                    inputHash: dualForecast.actualsFacts.inputHash,
                  }
                : null
            }
          />
        </div>
      ) : null}

      {/* Deployment Timeline */}
      {!forecastFailed && dualForecast ? (
        <Card>
          <CardHeader>
            <CardTitle>Capital Deployment Forecast</CardTitle>
            <CardDescription>Cumulative called capital by quarter.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={forecastData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis label={{ value: 'Called ($M)', angle: -90, position: 'insideLeft' }} />
                <Tooltip content={<ForecastTooltip metric="calledCapital" />} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="constructionCalledCapital"
                  stroke={FORECAST_SERIES_COLORS[0]}
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  name="Construction Plan"
                />
                <Line
                  type="monotone"
                  dataKey="actualCalledCapital"
                  stroke={FORECAST_SERIES_COLORS[1]}
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  name="Actuals"
                />
                <Line
                  type="monotone"
                  dataKey="currentForecastCalledCapital"
                  stroke={FORECAST_SERIES_COLORS[2]}
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  name="Current Forecast"
                />
              </LineChart>
            </ResponsiveContainer>
            <div className="mt-3" aria-label="Called capital drift summary">
              <DriftCallout
                metricLabel="called capital"
                drift={latestDrift?.calledCapital ?? null}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
