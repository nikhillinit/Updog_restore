import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { useLocation } from 'wouter';
import { useFundContext } from '@/contexts/FundContext';
import {
  useGenerateVarianceReport,
  useVarianceDashboard,
  useVarianceReport,
  useVarianceReports,
} from '@/hooks/useVarianceData';
import { ApiError } from '@/lib/queryClient';
import { toast } from '@/hooks/use-toast';
import { EmptyState, ErrorState, StatCard, StatCardGrid } from '@/components/analytics';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Bell,
  CheckCircle2,
  Clock,
  FileText,
  FolderKanban,
  Loader2,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';

type SurfaceStatus = 'live' | 'tab' | 'planned';

interface ReportSurface {
  id: string;
  title: string;
  description: string;
  helperText: string;
  status: SurfaceStatus;
  icon: LucideIcon;
}

const REPORT_SURFACES: ReportSurface[] = [
  {
    id: 'variance-analysis',
    title: 'Variance Analysis',
    description: 'Live baseline-vs-current reporting with alerts and detailed variance breakdowns.',
    helperText: 'Backed by live variance report APIs today.',
    status: 'live',
    icon: BarChart3,
  },
  {
    id: 'performance-dashboard',
    title: 'Fund Performance',
    description: 'Live IRR, TVPI, DPI, and portfolio breakdown charts for the active fund.',
    helperText: 'Backed by the live performance dashboard route.',
    status: 'live',
    icon: TrendingUp,
  },
  {
    id: 'tear-sheets',
    title: 'Portfolio Tear Sheets',
    description: 'Company tear sheets and PDF export flow for portfolio review packs.',
    helperText: 'Available in the Tear Sheets tab above.',
    status: 'tab',
    icon: FileText,
  },
  {
    id: 'fund-report-pack',
    title: 'Fund Reporting Pack',
    description: 'Board and LP-style summary reporting outside the variance surface.',
    helperText: 'Planned for a future reporting workflow.',
    status: 'planned',
    icon: FolderKanban,
  },
];

// Tear Sheets are a DEV-only surface (gated in client/src/pages/reports.tsx). Drop the
// entry in production so the Reporting Surfaces list does not advertise a tab that is
// build-excluded and not rendered.
const SHOW_TEAR_SHEETS = import.meta.env.DEV;
const VISIBLE_REPORT_SURFACES = REPORT_SURFACES.filter(
  (surface) => SHOW_TEAR_SHEETS || surface.id !== 'tear-sheets'
);

function formatMetricLabel(metric: string): string {
  switch (metric) {
    case 'totalValue':
      return 'Total Value';
    case 'irr':
      return 'IRR';
    case 'multiple':
      return 'Multiple';
    case 'dpi':
      return 'DPI';
    case 'tvpi':
      return 'TVPI';
    default:
      return metric;
  }
}

function formatMetricValue(metric: string, value: string | null): string {
  if (value == null) {
    return '-';
  }

  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return value;
  }

  if (metric === 'totalValue') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(numeric);
  }

  if (metric === 'irr') {
    const prefix = numeric > 0 ? '+' : '';
    return `${prefix}${(numeric * 100).toFixed(1)}%`;
  }

  const prefix = numeric > 0 ? '+' : '';
  return `${prefix}${numeric.toFixed(3)}`;
}

function formatMetricPercent(value: string | null): string | null {
  if (value == null) {
    return null;
  }

  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return value;
  }

  const prefix = numeric > 0 ? '+' : '';
  return `${prefix}${(numeric * 100).toFixed(1)}%`;
}

function formatTimestamp(timestamp: string | null): string {
  if (!timestamp) {
    return 'Never';
  }

  return format(parseISO(timestamp), 'MMM dd, yyyy HH:mm');
}

export default function Reports() {
  const { currentFund, isLoading } = useFundContext();
  const [, setLocation] = useLocation();
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  const {
    data: reportsData,
    isLoading: reportsLoading,
    error: reportsError,
    refetch: refetchReports,
  } = useVarianceReports(currentFund?.id || 0);
  const {
    data: dashboardData,
    isLoading: dashboardLoading,
    error: dashboardError,
    refetch: refetchDashboard,
  } = useVarianceDashboard(currentFund?.id || 0);
  const { data: reportDetailData, isLoading: reportDetailLoading } = useVarianceReport(
    currentFund?.id || 0,
    selectedReportId || ''
  );
  const generateReportMutation = useGenerateVarianceReport();

  if (isLoading || !currentFund) {
    return (
      <div className="space-y-6">
        <div className="h-36 animate-pulse rounded-xl bg-pov-gray" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-xl bg-pov-gray" />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-xl bg-pov-gray" />
      </div>
    );
  }

  const reports = reportsData?.data ?? [];
  const latestReport = reports[0] ?? null;
  const defaultBaseline = dashboardData?.data?.defaultBaseline ?? null;
  const totalActiveAlerts = dashboardData?.data?.summary.totalActiveAlerts ?? 0;
  const reportDetail = reportDetailData?.data ?? null;
  const hasReportData = reports.length > 0;
  const reportLoadError = reportsError ?? dashboardError;

  const openVarianceWorkspace = (reportId?: string) => {
    const searchParams = new URLSearchParams();
    searchParams.set('tab', 'reports');
    if (reportId) {
      searchParams.set('reportId', reportId);
    }

    setLocation(`/variance-tracking?${searchParams.toString()}`);
  };

  const handleGenerateVarianceReport = async () => {
    try {
      const response = await generateReportMutation.mutateAsync({
        fundId: currentFund.id,
        reportName: `${currentFund.name} Variance Report ${format(new Date(), 'MMM d, yyyy HH:mm')}`,
        reportType: 'ad_hoc',
        asOfDate: new Date().toISOString(),
      });

      toast({
        title: 'Variance report generated',
        description: 'The new report is ready to review.',
      });

      setSelectedReportId(response.data.id);
      await Promise.all([refetchReports(), refetchDashboard()]);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Failed to generate variance report.';

      toast({
        title: 'Unable to generate report',
        description: message,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-beige-200">
        <CardContent className="flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-presson-info/30 bg-presson-info/10 text-presson-info">
                Live Reporting
              </Badge>
              <Badge
                variant={defaultBaseline ? 'secondary' : 'destructive'}
                className={defaultBaseline ? 'bg-success/10 text-success-dark' : ''}
              >
                {defaultBaseline ? 'Default Baseline Ready' : 'Baseline Required'}
              </Badge>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-pov-charcoal">Fund reporting hub</h2>
              <p className="mt-1 max-w-2xl text-sm text-charcoal-600">
                Variance reports use the current fund baseline. Planned reporting surfaces stay
                clearly labeled until they are backed by fund data and export rules.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button variant="outline" onClick={() => openVarianceWorkspace()}>
              <ArrowUpRight className="mr-2 h-4 w-4" />
              Open Variance Tracking
            </Button>
            <Button
              onClick={handleGenerateVarianceReport}
              disabled={generateReportMutation.isPending || dashboardLoading || !defaultBaseline}
            >
              {generateReportMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {generateReportMutation.isPending ? 'Generating...' : 'Generate Variance Report'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {!defaultBaseline && !dashboardLoading && (
        <Card className="border-warning/50 bg-warning/10">
          <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-warning-dark">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium">Variance report generation is blocked</span>
              </div>
              <p className="text-sm text-warning-dark">
                Create or assign a default baseline in Variance Tracking before generating reports
                from this page.
              </p>
            </div>
            <Button
              variant="outline"
              className="border-pov-charcoal bg-pov-white text-pov-charcoal hover:bg-pov-gray"
              onClick={() => openVarianceWorkspace()}
            >
              Set Up Baseline
            </Button>
          </CardContent>
        </Card>
      )}

      <StatCardGrid>
        <StatCard
          title="Generated Reports"
          value={reports.length}
          icon={FileText}
          description="Live variance reports available for this fund"
          loading={reportsLoading}
        />
        <StatCard
          title="Latest Report"
          value={latestReport ? format(parseISO(latestReport.generatedAt), 'MMM dd') : 'None'}
          icon={Clock}
          description={latestReport ? latestReport.reportName : 'Generate a report to populate this hub'}
          loading={reportsLoading}
        />
        <StatCard
          title="Active Alerts"
          value={totalActiveAlerts}
          icon={Bell}
          badge={{
            text: totalActiveAlerts > 0 ? 'Needs review' : 'Stable',
            variant: totalActiveAlerts > 0 ? 'destructive' : 'secondary',
          }}
          description="Pulled from the live variance dashboard"
          loading={dashboardLoading}
        />
        <StatCard
          title="Default Baseline"
          value={defaultBaseline ? 'Ready' : 'Missing'}
          icon={Target}
          badge={{
            text: defaultBaseline ? defaultBaseline.baselineType : 'Action required',
            variant: defaultBaseline ? 'secondary' : 'destructive',
          }}
          description={
            defaultBaseline
              ? `Updated ${formatTimestamp(defaultBaseline.updatedAt)}`
              : 'Variance generation needs a default baseline'
          }
          loading={dashboardLoading}
        />
      </StatCardGrid>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Generated Variance Reports</CardTitle>
            <CardDescription>
              Live report history for {currentFund.name}. Open a summary here or jump into the full
              variance workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {reportLoadError && !hasReportData ? (
              <ErrorState
                title="Reports unavailable"
                message="We could not load variance reports for this fund. Try again once the reporting service is available."
                onRetry={() => {
                  void refetchReports();
                  void refetchDashboard();
                }}
              />
            ) : reportsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-28 animate-pulse rounded-lg border border-beige-200 bg-pov-gray"
                  />
                ))}
              </div>
            ) : !hasReportData ? (
              <EmptyState
                title="No live reports yet"
                message={
                  defaultBaseline
                    ? 'Generate the first variance report from this page or from Variance Tracking.'
                    : 'Set a default baseline before generating the first variance report.'
                }
                actionLabel={defaultBaseline ? 'Generate First Report' : 'Open Variance Tracking'}
                onAction={
                  defaultBaseline ? handleGenerateVarianceReport : () => openVarianceWorkspace()
                }
              />
            ) : (
              <div className="space-y-3">
                {reports.map((report) => (
                  <div
                    key={report.id}
                    className="rounded-xl border border-beige-200 p-4 transition-colors hover:border-charcoal-300 hover:bg-pov-gray"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-medium text-pov-charcoal">{report.reportName}</h3>
                          <Badge variant="outline">{report.reportType}</Badge>
                          {report.reportPeriod && (
                            <Badge variant="secondary" className="bg-pov-gray text-charcoal-700">
                              {report.reportPeriod}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-charcoal-600">
                          Generated {formatTimestamp(report.generatedAt)}
                        </p>
                        <div className="flex flex-wrap gap-2 text-xs text-charcoal-600">
                          <Badge variant="secondary" className="bg-pov-gray text-charcoal-700">
                            {report.summary.totalVariances} total variances
                          </Badge>
                          <Badge variant="secondary" className="bg-warning/10 text-warning-dark">
                            {report.summary.significantVariances} significant
                          </Badge>
                          <Badge
                            variant={
                              report.summary.criticalVariances > 0 ? 'destructive' : 'secondary'
                            }
                          >
                            {report.summary.criticalVariances} critical
                          </Badge>
                        </div>
                        {report.variances.length > 0 && (
                          <div className="flex flex-wrap gap-3 text-sm text-charcoal-600">
                            {report.variances.slice(0, 3).map((variance) => (
                              <span key={`${report.id}-${variance.metric}`}>
                                <span className="font-medium text-pov-charcoal">
                                  {formatMetricLabel(variance.metric)}:
                                </span>{' '}
                                {formatMetricValue(variance.metric, variance.value)}
                                {formatMetricPercent(variance.pct) && (
                                  <span className="ml-1 text-charcoal-500">
                                    ({formatMetricPercent(variance.pct)})
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
                        <Button variant="outline" onClick={() => setSelectedReportId(report.id)}>
                          <TrendingUp className="mr-2 h-4 w-4" />
                          View Summary
                        </Button>
                        <Button onClick={() => openVarianceWorkspace(report.id)}>
                          <ArrowUpRight className="mr-2 h-4 w-4" />
                          Open Workspace
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reporting Surfaces</CardTitle>
            <CardDescription>
              Only implemented surfaces are interactive. Planned surfaces stay labeled, not
              simulated.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {VISIBLE_REPORT_SURFACES.map((surface, index) => {
              const Icon = surface.icon;
              const statusVariant =
                surface.status === 'live'
                  ? 'secondary'
                  : surface.status === 'tab'
                    ? 'outline'
                    : 'secondary';
              const statusLabel =
                surface.status === 'live'
                  ? 'Live'
                  : surface.status === 'tab'
                    ? 'In this page'
                    : 'Planned';

              return (
                <div key={surface.id} className="space-y-4">
                  <div className="flex gap-3">
                    <div className="rounded-lg bg-pov-gray p-2">
                      <Icon className="h-5 w-5 text-charcoal-700" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium text-pov-charcoal">{surface.title}</h3>
                        <Badge variant={statusVariant}>{statusLabel}</Badge>
                      </div>
                      <p className="text-sm text-charcoal-600">{surface.description}</p>
                      <p className="text-xs text-charcoal-500">{surface.helperText}</p>

                      {surface.id === 'variance-analysis' && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openVarianceWorkspace()}
                          >
                            Open
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleGenerateVarianceReport}
                            disabled={
                              generateReportMutation.isPending || dashboardLoading || !defaultBaseline
                            }
                          >
                            Generate
                          </Button>
                        </div>
                      )}

                      {surface.id === 'performance-dashboard' && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button size="sm" variant="outline" onClick={() => setLocation('/performance')}>
                            Open Performance
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {index < VISIBLE_REPORT_SURFACES.length - 1 && <Separator />}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Sheet
        open={selectedReportId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedReportId(null);
          }
        }}
      >
        <SheetContent className="overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Report Summary</SheetTitle>
            <SheetDescription>
              Review live variance report output here, or open the full variance workspace for the
              complete analysis flow.
            </SheetDescription>
          </SheetHeader>

          {reportDetailLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-charcoal-400" />
            </div>
          ) : reportDetail ? (
            <div className="mt-6 space-y-6">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xl font-semibold text-pov-charcoal">{reportDetail.reportName}</h3>
                  <Badge variant="outline">{reportDetail.reportType}</Badge>
                  {reportDetail.reportPeriod && (
                    <Badge variant="secondary" className="bg-pov-gray text-charcoal-700">
                      {reportDetail.reportPeriod}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-charcoal-600">
                  Generated {formatTimestamp(reportDetail.generatedAt)} for as-of{' '}
                  {format(parseISO(reportDetail.asOfDate), 'MMM dd, yyyy')}
                </p>
              </div>

              <StatCardGrid className="lg:grid-cols-3">
                <StatCard
                  title="Total Variances"
                  value={reportDetail.summary.totalVariances}
                  icon={BarChart3}
                />
                <StatCard
                  title="Significant"
                  value={reportDetail.summary.significantVariances}
                  icon={AlertTriangle}
                />
                <StatCard
                  title="Critical"
                  value={reportDetail.summary.criticalVariances}
                  icon={Bell}
                  badge={{
                    text:
                      reportDetail.summary.criticalVariances > 0 ? 'Escalated' : 'No critical drift',
                    variant:
                      reportDetail.summary.criticalVariances > 0 ? 'destructive' : 'secondary',
                  }}
                />
              </StatCardGrid>

              <Card>
                <CardHeader>
                  <CardTitle>Variance Metrics</CardTitle>
                  <CardDescription>Client-facing metric deltas returned by the live API.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {reportDetail.variances.length === 0 ? (
                    <p className="text-sm text-charcoal-600">No variance metrics were emitted.</p>
                  ) : (
                    reportDetail.variances.map((variance) => (
                      <div
                        key={variance.metric}
                        className="flex items-center justify-between rounded-lg border border-beige-200 px-3 py-2"
                      >
                        <div>
                          <div className="font-medium text-pov-charcoal">
                            {formatMetricLabel(variance.metric)}
                          </div>
                          {formatMetricPercent(variance.pct) && (
                            <div className="text-sm text-charcoal-500">
                              {formatMetricPercent(variance.pct)}
                            </div>
                          )}
                        </div>
                        <div className="text-right font-medium text-pov-charcoal">
                          {formatMetricValue(variance.metric, variance.value)}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Supplemental Analysis Coverage</CardTitle>
                  <CardDescription>
                    Additional live analysis captured with the report payload.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-beige-200 p-3">
                    <div className="text-sm text-charcoal-500">Company Rows</div>
                    <div className="mt-1 text-lg font-semibold text-pov-charcoal">
                      {reportDetail.portfolioVariances?.companyVariances.length ?? 0}
                    </div>
                  </div>
                  <div className="rounded-lg border border-beige-200 p-3">
                    <div className="text-sm text-charcoal-500">Sector Buckets</div>
                    <div className="mt-1 text-lg font-semibold text-pov-charcoal">
                      {Object.keys(reportDetail.sectorVariances ?? {}).length}
                    </div>
                  </div>
                  <div className="rounded-lg border border-beige-200 p-3">
                    <div className="text-sm text-charcoal-500">Stage Buckets</div>
                    <div className="mt-1 text-lg font-semibold text-pov-charcoal">
                      {Object.keys(reportDetail.stageVariances ?? {}).length}
                    </div>
                  </div>
                  <div className="rounded-lg border border-beige-200 p-3">
                    <div className="text-sm text-charcoal-500">Reserve / Pacing Signals</div>
                    <div className="mt-1 text-lg font-semibold text-pov-charcoal">
                      {(reportDetail.reserveVariances?.hasData ? 1 : 0) +
                        (reportDetail.pacingVariances?.hasData ? 1 : 0)}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button onClick={() => openVarianceWorkspace(reportDetail.id)}>
                  <ArrowUpRight className="mr-2 h-4 w-4" />
                  Open In Variance Tracking
                </Button>
                <Button variant="outline" onClick={() => setSelectedReportId(null)}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Close Summary
                </Button>
              </div>
            </div>
          ) : (
            <EmptyState
              title="Report unavailable"
              message="The selected report could not be loaded from the live variance API."
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
