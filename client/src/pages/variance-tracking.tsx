import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { useFundContext } from '@/contexts/FundContext';
import { computeRemainingCapital } from '@/lib/variance-remaining-capital';
import {
  useVarianceDashboard,
  useBaselines,
  useActiveAlerts,
  useVarianceReports,
  useVarianceReport,
  useCreateBaseline,
  useSetDefaultBaseline,
  useDeactivateBaseline,
  useCreateAlertRule,
  useAcknowledgeAlert,
  useResolveAlert,
  usePerformVarianceAnalysis,
  useGenerateVarianceReport,
  type Alert,
  type Baseline,
  type VarianceReport,
} from '@/hooks/useVarianceData';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  DashboardLoadingState,
  ErrorState,
  ApiErrorState,
  StatCard,
  StatCardGrid,
} from '@/components/analytics';
import {
  AlertTriangle,
  BarChart3,
  Plus,
  TrendingUp,
  Bell,
  CheckCircle,
  XCircle,
  Target,
  Clock,
  AlertCircle,
  FileText,
  Loader2,
  Zap,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { spreadIfDefined } from '@/lib/ts/spreadIfDefined';
import { loadFromStorage, saveToStorage } from '@/lib/storage';
import { useFundMetrics } from '@/hooks/useFundMetrics';
import {
  ALERT_METRIC_GROUPS,
  ALERT_METRIC_LABELS,
  type AlertMetricName,
} from '@shared/variance-validation';

type VarianceTab = 'overview' | 'baselines' | 'alerts' | 'reports' | 'settings';

const VARIANCE_SETTINGS_STORAGE_KEY = 'variance-tracking-settings';

const varianceSettingsSchema = z.object({
  emailNotifications: z.boolean(),
  realtimeAlerts: z.boolean(),
  dailyDigest: z.boolean(),
  defaultVarianceThreshold: z.string(),
  analysisFrequency: z.enum(['realtime', 'hourly', 'daily', 'weekly']),
});

const persistedVarianceSettingsSchema = z.object({
  byFundId: z.record(z.string(), varianceSettingsSchema),
});

type VarianceSettings = z.infer<typeof varianceSettingsSchema>;
type PersistedVarianceSettings = z.infer<typeof persistedVarianceSettingsSchema>;

const DEFAULT_VARIANCE_SETTINGS: VarianceSettings = {
  emailNotifications: true,
  realtimeAlerts: true,
  dailyDigest: false,
  defaultVarianceThreshold: '10',
  analysisFrequency: 'daily',
};

function loadVarianceSettings(fundId: number | undefined): VarianceSettings {
  if (fundId == null) {
    return DEFAULT_VARIANCE_SETTINGS;
  }

  const persisted = loadFromStorage(VARIANCE_SETTINGS_STORAGE_KEY, persistedVarianceSettingsSchema);

  return persisted?.byFundId[String(fundId)] ?? DEFAULT_VARIANCE_SETTINGS;
}

function getInitialVarianceTab(): VarianceTab {
  if (typeof window === 'undefined') {
    return 'overview';
  }

  const params = new URLSearchParams(window.location.search);
  const reportId = params.get('reportId');
  if (reportId) {
    return 'reports';
  }

  const requestedTab = params.get('tab');
  if (
    requestedTab === 'overview' ||
    requestedTab === 'baselines' ||
    requestedTab === 'alerts' ||
    requestedTab === 'reports' ||
    requestedTab === 'settings'
  ) {
    return requestedTab;
  }

  return 'overview';
}

function getInitialSelectedReportId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return new URLSearchParams(window.location.search).get('reportId');
}

export default function VarianceTrackingPage() {
  const { currentFund } = useFundContext();
  const [activeTab, setActiveTab] = useState<VarianceTab>(getInitialVarianceTab);
  const [createBaselineDialogOpen, setCreateBaselineDialogOpen] = useState(false);
  const [createAlertDialogOpen, setCreateAlertDialogOpen] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [alertActionDialogOpen, setAlertActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<'acknowledge' | 'resolve'>('acknowledge');
  const [actionNotes, setActionNotes] = useState('');
  const [alertBaselineScope, setAlertBaselineScope] = useState<'current' | 'all'>('current');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(
    getInitialSelectedReportId
  );
  const [generateReportDialogOpen, setGenerateReportDialogOpen] = useState(false);
  const [reportForm, setReportForm] = useState({
    reportName: '',
    reportType: 'periodic' as 'periodic' | 'milestone' | 'ad_hoc' | 'alert_triggered',
    reportPeriod: '' as '' | 'monthly' | 'quarterly' | 'annual',
  });
  const [varianceSettings, setVarianceSettings] = useState<VarianceSettings>(() =>
    loadVarianceSettings(currentFund?.id)
  );
  const [settingsSaveMessage, setSettingsSaveMessage] = useState<string | null>(null);
  const settingsDraftsByFundId = useRef<Record<string, VarianceSettings>>({});

  // Form states
  const [baselineForm, setBaselineForm] = useState({
    name: '',
    description: '',
    baselineType: 'quarterly' as 'initial' | 'quarterly' | 'annual' | 'milestone' | 'custom',
    periodStart: '',
    periodEnd: '',
    tags: [] as string[],
  });

  const [alertRuleForm, setAlertRuleForm] = useState({
    name: '',
    description: '',
    ruleType: 'threshold' as const,
    metricName: 'irr' as AlertMetricName,
    operator: 'gt' as 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'between',
    thresholdValue: 0,
    secondaryThreshold: undefined as number | undefined,
    severity: 'warning' as 'info' | 'warning' | 'critical' | 'urgent',
    category: 'performance' as 'performance' | 'risk' | 'operational' | 'compliance',
    checkFrequency: 'daily' as 'realtime' | 'hourly' | 'daily' | 'weekly',
    suppressionPeriod: 60,
    notificationChannels: ['email'] as Array<'email' | 'slack' | 'webhook'>,
  });

  // Hooks
  const {
    data: dashboardData,
    isLoading: dashboardLoading,
    error: dashboardError,
    refetch: refetchDashboard,
  } = useVarianceDashboard(currentFund?.id || 0);

  const {
    data: baselinesData,
    isLoading: baselinesLoading,
    error: _baselinesError,
    refetch: refetchBaselines,
  } = useBaselines(currentFund?.id || 0);

  const {
    data: alertsData,
    isLoading: alertsLoading,
    error: _alertsError,
    refetch: refetchAlerts,
  } = useActiveAlerts(currentFund?.id || 0, {
    baselineScope: alertBaselineScope,
  });

  const {
    data: reportsData,
    isLoading: reportsLoading,
    error: _reportsError,
  } = useVarianceReports(currentFund?.id || 0);
  const { data: unifiedMetrics, isLoading: metricsLoading } = useFundMetrics({
    enabled: activeTab === 'overview' && !!currentFund?.id,
    skipProjections: true,
  });

  // Mutations
  const createBaselineMutation = useCreateBaseline();
  const setDefaultBaselineMutation = useSetDefaultBaseline();
  const deactivateBaselineMutation = useDeactivateBaseline();
  const createAlertRuleMutation = useCreateAlertRule();
  const acknowledgeAlertMutation = useAcknowledgeAlert();
  const resolveAlertMutation = useResolveAlert();
  const performAnalysisMutation = usePerformVarianceAnalysis();
  const generateReportMutation = useGenerateVarianceReport();

  useEffect(() => {
    const fundKey = currentFund?.id == null ? null : String(currentFund.id);
    const draft = fundKey == null ? undefined : settingsDraftsByFundId.current[fundKey];
    setVarianceSettings(draft ?? loadVarianceSettings(currentFund?.id));
    setSettingsSaveMessage(draft ? 'Unsaved changes.' : null);
  }, [currentFund?.id]);

  // Report detail query (only fires when a report is selected)
  const { data: reportDetailData, isLoading: reportDetailLoading } = useVarianceReport(
    currentFund?.id || 0,
    selectedReportId || ''
  );

  const reports = reportsData?.data ?? [];
  const currentDefaultBaseline =
    baselinesData?.data?.find((baseline: Baseline) => baseline.isDefault) ?? null;
  const latestReport =
    reports.length > 0
      ? [...reports].sort(
          (left, right) =>
            new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime()
        )[0]
      : null;
  const hasReports = reports.length > 0;
  const totalActiveAlerts = dashboardData?.data?.summary?.totalActiveAlerts || 0;
  const lastAnalysisDate = dashboardData?.data?.summary?.lastAnalysisDate;
  const alertCounts =
    dashboardData?.data?.alertsBySeverity ?? dashboardData?.data?.alertsByseverity;
  const isAnalysisRunning = performAnalysisMutation.isPending;
  const analysisStatus = isAnalysisRunning
    ? {
        value: 'Running',
        description: 'Variance analysis is in progress',
        badgeText: 'In progress',
        badgeVariant: 'secondary' as const,
      }
    : !lastAnalysisDate
      ? {
          value: 'Not Run',
          description: 'Run analysis to generate the first report',
          badgeText: 'No report',
          badgeVariant: 'secondary' as const,
        }
      : totalActiveAlerts > 0
        ? {
            value: 'Attention',
            description: 'Active alerts need review',
            badgeText: `${totalActiveAlerts} active`,
            badgeVariant: 'destructive' as const,
          }
        : {
            value: 'Stable',
            description: hasReports
              ? 'Driven by latest variance report'
              : 'Most recent analysis completed',
            badgeText: 'No active alerts',
            badgeVariant: 'default' as const,
          };

  // Handle baseline creation
  const handleCreateBaseline = async () => {
    if (!currentFund) return;

    try {
      await createBaselineMutation.mutateAsync({
        fundId: currentFund.id,
        ...baselineForm,
      });

      toast({
        title: 'Baseline Created',
        description: 'New baseline has been created successfully.',
      });

      setCreateBaselineDialogOpen(false);
      setBaselineForm({
        name: '',
        description: '',
        baselineType: 'quarterly',
        periodStart: '',
        periodEnd: '',
        tags: [],
      });
      refetchBaselines();
      refetchDashboard();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to create baseline. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Handle alert rule creation
  const handleCreateAlertRule = async () => {
    if (!currentFund) return;

    try {
      await createAlertRuleMutation.mutateAsync({
        fundId: currentFund.id,
        name: alertRuleForm.name,
        description: alertRuleForm.description,
        ruleType: 'threshold',
        metricName: alertRuleForm.metricName,
        operator: alertRuleForm.operator,
        thresholdValue: alertRuleForm.thresholdValue,
        severity: alertRuleForm.severity,
        category: alertRuleForm.category,
        checkFrequency: alertRuleForm.checkFrequency,
        suppressionPeriod: alertRuleForm.suppressionPeriod,
        notificationChannels: alertRuleForm.notificationChannels,
        ...spreadIfDefined('secondaryThreshold', alertRuleForm.secondaryThreshold),
      });

      toast({
        title: 'Alert Rule Created',
        description: 'New alert rule has been created successfully.',
      });

      setCreateAlertDialogOpen(false);
      setAlertRuleForm({
        name: '',
        description: '',
        ruleType: 'threshold',
        metricName: 'irr',
        operator: 'gt',
        thresholdValue: 0,
        secondaryThreshold: undefined,
        severity: 'warning',
        category: 'performance',
        checkFrequency: 'daily',
        suppressionPeriod: 60,
        notificationChannels: ['email'],
      });
      refetchAlerts();
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to create alert rule. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Handle alert actions
  const handleAlertAction = async () => {
    if (!selectedAlert) return;

    try {
      if (actionType === 'acknowledge') {
        await acknowledgeAlertMutation.mutateAsync({
          alertId: selectedAlert.id,
          notes: actionNotes,
        });
        toast({
          title: 'Alert Acknowledged',
          description: 'The alert has been acknowledged.',
        });
      } else {
        await resolveAlertMutation.mutateAsync({
          alertId: selectedAlert.id,
          notes: actionNotes,
        });
        toast({
          title: 'Alert Resolved',
          description: 'The alert has been resolved.',
        });
      }

      setAlertActionDialogOpen(false);
      setSelectedAlert(null);
      setActionNotes('');
      refetchAlerts();
      refetchDashboard();
    } catch {
      toast({
        title: 'Error',
        description: `Failed to ${actionType} alert. Please try again.`,
        variant: 'destructive',
      });
    }
  };

  // Handle variance analysis
  const handlePerformAnalysis = async () => {
    if (!currentFund) return;

    try {
      const result = await performAnalysisMutation.mutateAsync({
        fundId: currentFund.id,
      });

      toast({
        title: 'Analysis Complete',
        description: `Variance analysis completed. ${result.data.alertsGenerated.length} alerts generated.`,
      });

      refetchDashboard();
      refetchAlerts();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to perform variance analysis. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const updateVarianceSetting = <K extends keyof VarianceSettings>(
    key: K,
    value: VarianceSettings[K]
  ) => {
    setVarianceSettings((current) => {
      const next = { ...current, [key]: value };
      if (currentFund?.id != null) {
        settingsDraftsByFundId.current[String(currentFund.id)] = next;
      }
      return next;
    });
    setSettingsSaveMessage('Unsaved changes.');
  };

  const handleSaveSettings = () => {
    if (!currentFund) return;

    const persisted =
      loadFromStorage(VARIANCE_SETTINGS_STORAGE_KEY, persistedVarianceSettingsSchema) ??
      ({
        byFundId: {},
      } satisfies PersistedVarianceSettings);
    const saved = saveToStorage(
      VARIANCE_SETTINGS_STORAGE_KEY,
      {
        byFundId: {
          ...persisted.byFundId,
          [String(currentFund.id)]: varianceSettings,
        },
      },
      persistedVarianceSettingsSchema
    );

    if (!saved) {
      setSettingsSaveMessage('Settings could not be saved in this browser.');
      toast({
        title: 'Settings not saved',
        description: 'Variance tracking settings could not be saved in this browser.',
        variant: 'destructive',
      });
      return;
    }

    setSettingsSaveMessage('Settings saved in this browser.');
    delete settingsDraftsByFundId.current[String(currentFund.id)];
    toast({
      title: 'Settings saved',
      description: 'Variance tracking settings have been saved in this browser workspace.',
    });
  };

  // Handle generate variance report
  const handleGenerateReport = async () => {
    if (!currentFund) return;

    try {
      await generateReportMutation.mutateAsync({
        fundId: currentFund.id,
        reportName: reportForm.reportName,
        reportType: reportForm.reportType,
        ...(reportForm.reportPeriod ? { reportPeriod: reportForm.reportPeriod } : {}),
      });

      toast({
        title: 'Report Generated',
        description: 'Variance report has been generated successfully.',
      });

      setGenerateReportDialogOpen(false);
      setReportForm({ reportName: '', reportType: 'periodic', reportPeriod: '' });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to generate variance report. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const reportDetail = reportDetailData?.data ?? null;
  const reportHasSupplementalAnalysis =
    !!reportDetail &&
    !!(
      reportDetail.portfolioVariances ||
      reportDetail.sectorVariances ||
      reportDetail.stageVariances ||
      reportDetail.reserveVariances ||
      reportDetail.pacingVariances
    );
  const isHistoricalReportDetail =
    !!reportDetail &&
    parseISO(reportDetail.asOfDate).getTime() < parseISO(reportDetail.generatedAt).getTime();
  const showHistoricalPortfolioAnalysisNotice =
    reportHasSupplementalAnalysis && isHistoricalReportDetail;
  const showHistoricalPortfolioAnalysisUnavailableNotice =
    !!reportDetail && isHistoricalReportDetail && !reportHasSupplementalAnalysis;
  const companyVariances = reportDetail?.portfolioVariances?.companyVariances ?? [];
  const sectorVarianceEntries = Object.entries(reportDetail?.sectorVariances ?? {});
  const stageVarianceEntries = Object.entries(reportDetail?.stageVariances ?? {});
  const reserveMetricEntries = Object.entries(reportDetail?.reserveVariances?.metricDeltas ?? {});
  const reserveChangeEntries = Object.entries(reportDetail?.reserveVariances?.changes ?? {});
  const pacingMetricEntries = Object.entries(reportDetail?.pacingVariances?.metricDeltas ?? {});
  const pacingChangeEntries = Object.entries(reportDetail?.pacingVariances?.changes ?? {});

  if (!currentFund) {
    return (
      <div className="container mx-auto p-6">
        <ErrorState
          title="No Fund Selected"
          message="Please select a fund to view variance tracking."
          onGoHome={() => (window.location.href = '/fund-setup')}
        />
      </div>
    );
  }

  if (dashboardError) {
    return (
      <div className="container mx-auto p-6">
        <ApiErrorState error={dashboardError} onRetry={() => refetchDashboard()} />
      </div>
    );
  }

  if (dashboardLoading) {
    return (
      <div className="container mx-auto p-6">
        <DashboardLoadingState />
      </div>
    );
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'urgent':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'info':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatCurrency = (value: string | number | null | undefined) => {
    if (value == null) return '-';
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return String(value);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(numeric);
  };

  const formatSignedNumber = (value: number | null | undefined, digits = 0) => {
    if (value == null) return '-';
    const prefix = value > 0 ? '+' : '';
    return `${prefix}${value.toFixed(digits)}`;
  };

  const formatSignedPercent = (value: number | string | null | undefined) => {
    if (value == null) return '-';
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return String(value);
    const prefix = numeric > 0 ? '+' : '';
    return `${prefix}${(numeric * 100).toFixed(1)}%`;
  };

  const renderChangeValue = (value: unknown) => {
    if (value == null) return '-';
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
      return String(value);
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };

  const actualCommitted = unifiedMetrics?.actual?.totalCommitted ?? null;
  const actualDeployed = unifiedMetrics?.actual?.totalDeployed ?? null;
  const targetDeployed = unifiedMetrics?.variance?.deploymentVariance?.target ?? null;
  const { remainingDeployableCapital, plannedRemainingDeployableCapital, remainingDeployableGap } =
    computeRemainingCapital({ actualCommitted, actualDeployed, targetDeployed });
  const deploymentPlanStatus =
    unifiedMetrics?._status?.engines?.target === 'success' &&
    unifiedMetrics?._status?.engines?.variance === 'success';

  const varianceOverviewMetrics = (
    <>
      <StatCardGrid>
        <StatCard
          title="Active Alerts"
          value={dashboardData?.data?.summary?.totalActiveAlerts || 0}
          icon={AlertTriangle}
          badge={{
            text: `${alertCounts?.critical || 0} Critical`,
            variant: (alertCounts?.critical || 0) > 0 ? 'destructive' : 'secondary',
          }}
        />
        <StatCard
          title="Total Baselines"
          value={dashboardData?.data?.summary?.totalBaselines || 0}
          icon={Target}
          description="Active baseline configurations"
        />
        <StatCard
          title="Last Analysis"
          value={
            dashboardData?.data?.summary?.lastAnalysisDate
              ? format(parseISO(dashboardData.data.summary.lastAnalysisDate), 'MMM dd')
              : 'Never'
          }
          icon={Clock}
          description="Most recent variance analysis"
        />
        <StatCard
          title="Analysis Status"
          value={analysisStatus.value}
          icon={TrendingUp}
          badge={{
            text: analysisStatus.badgeText,
            variant: analysisStatus.badgeVariant,
          }}
          description={analysisStatus.description}
        />
      </StatCardGrid>

      {alertCounts && (
        <Card>
          <CardHeader>
            <CardTitle>Alert Summary</CardTitle>
            <CardDescription>Breakdown of active alerts by severity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-lg">
                <div>
                  <div className="text-sm font-medium text-red-800">Critical</div>
                  <div className="text-2xl font-bold text-red-900">{alertCounts.critical}</div>
                </div>
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <div className="flex items-center justify-between p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div>
                  <div className="text-sm font-medium text-yellow-800">Warning</div>
                  <div className="text-2xl font-bold text-yellow-900">{alertCounts.warning}</div>
                </div>
                <AlertTriangle className="w-8 h-8 text-yellow-600" />
              </div>
              <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div>
                  <div className="text-sm font-medium text-blue-800">Info</div>
                  <div className="text-2xl font-bold text-blue-900">{alertCounts.info}</div>
                </div>
                <Bell className="w-8 h-8 text-blue-600" />
              </div>
              <div className="flex items-center justify-between p-4 bg-rose-50 border border-rose-200 rounded-lg">
                <div>
                  <div className="text-sm font-medium text-rose-800">Urgent</div>
                  <div className="text-2xl font-bold text-rose-900">{alertCounts.urgent}</div>
                </div>
                <AlertTriangle className="w-8 h-8 text-rose-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Variance Tracking</h1>
          <p className="text-gray-600 mt-2">
            Monitor fund performance against baselines and manage alerts.
          </p>
        </div>

        <div className="flex items-center space-x-4">
          <Button
            onClick={handlePerformAnalysis}
            disabled={performAnalysisMutation.isPending}
            className="flex items-center space-x-2"
          >
            <Zap className="w-4 h-4" />
            <span>{performAnalysisMutation.isPending ? 'Analyzing...' : 'Run Analysis'}</span>
          </Button>
        </div>
      </div>

      {/* Main Content Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as VarianceTab)}
        className="space-y-6"
      >
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="baselines">Baselines</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {varianceOverviewMetrics}

          {reportsLoading ? (
            <Card>
              <CardContent className="p-12 text-center">
                <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Loading Latest Report</h3>
                <p className="text-gray-600">Fetching variance report data for this fund.</p>
              </CardContent>
            </Card>
          ) : latestReport ? (
            <Card>
              <CardHeader>
                <CardTitle>Latest Variance Report</CardTitle>
                <CardDescription>
                  {latestReport.reportName} • generated{' '}
                  {format(parseISO(latestReport.generatedAt), 'MMM dd, yyyy')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="rounded-lg border p-4">
                    <div className="text-sm font-medium text-gray-600">Total Variances</div>
                    <div className="mt-1 text-2xl font-semibold text-gray-900">
                      {latestReport.summary.totalVariances}
                    </div>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="text-sm font-medium text-gray-600">Significant</div>
                    <div className="mt-1 text-2xl font-semibold text-yellow-700">
                      {latestReport.summary.significantVariances}
                    </div>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="text-sm font-medium text-gray-600">Critical</div>
                    <div className="mt-1 text-2xl font-semibold text-red-700">
                      {latestReport.summary.criticalVariances}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-12 text-center">
                <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Variance Data Yet</h3>
                <p className="text-gray-600 mb-4">
                  Create a baseline and run a variance analysis to generate the first report.
                </p>
                <Button onClick={handlePerformAnalysis} disabled={isAnalysisRunning}>
                  {isAnalysisRunning ? 'Analyzing...' : 'Run Variance Analysis'}
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Deployable Capital vs Plan</CardTitle>
              <CardDescription>
                Remaining deployable capital compared with the current deployment plan. Uncalled
                capital is shown separately because it measures callable, not deployable, capacity.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {metricsLoading ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="rounded-lg border p-4">
                      <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
                      <div className="mt-3 h-7 w-40 animate-pulse rounded bg-gray-200" />
                    </div>
                  ))}
                </div>
              ) : !deploymentPlanStatus ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  Deployment-plan context is not available from the unified metrics response right
                  now, so this card is intentionally withheld instead of showing fallback values.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="rounded-lg border p-4">
                    <div className="text-sm font-medium text-gray-600">Remaining deployable</div>
                    <div className="mt-1 text-2xl font-semibold text-gray-900">
                      {formatCurrency(remainingDeployableCapital)}
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                      Actual committed capital minus capital already deployed.
                    </div>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="text-sm font-medium text-gray-600">Plan remaining</div>
                    <div className="mt-1 text-2xl font-semibold text-gray-900">
                      {formatCurrency(plannedRemainingDeployableCapital)}
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                      Current deployment plan implied by target deployed capital for this fund age.
                    </div>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="text-sm font-medium text-gray-600">Gap vs plan</div>
                    <div
                      className={cn(
                        'mt-1 text-2xl font-semibold',
                        (remainingDeployableGap ?? 0) > 0 ? 'text-blue-700' : 'text-amber-700'
                      )}
                    >
                      {remainingDeployableGap == null
                        ? '-'
                        : `${remainingDeployableGap > 0 ? '+' : ''}${formatCurrency(remainingDeployableGap)}`}
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                      Positive means more undeployed capital remains than the plan expects today.
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-medium text-slate-700">Uncalled capital</div>
                <div className="mt-1 text-xl font-semibold text-slate-900">
                  {formatCurrency(unifiedMetrics?.actual?.totalUncalled)}
                </div>
                <div className="mt-2 text-xs text-slate-600">
                  Capital that has been committed but not yet called from LPs. This is not the same
                  as remaining deployable capital.
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Recent Alerts</CardTitle>
                <CardDescription>Latest variance alerts and notifications</CardDescription>
              </CardHeader>
              <CardContent>
                {alertsData?.data?.length ? (
                  <div className="space-y-3">
                    {alertsData.data.slice(0, 5).map((alert: Alert) => (
                      <div
                        key={alert.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div className="flex items-center space-x-3">
                          <AlertTriangle
                            className={cn(
                              'w-5 h-5',
                              alert.severity === 'critical' && 'text-red-600',
                              alert.severity === 'warning' && 'text-yellow-600',
                              alert.severity === 'info' && 'text-blue-600'
                            )}
                          />
                          <div>
                            <div className="font-medium text-sm">{alert.ruleName}</div>
                            <div className="text-xs text-gray-600">{alert.message}</div>
                          </div>
                        </div>
                        <Badge variant="outline" className={getSeverityColor(alert.severity)}>
                          {alert.severity}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-gray-500">No recent alerts</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Active Baselines</CardTitle>
                <CardDescription>Current baseline configurations</CardDescription>
              </CardHeader>
              <CardContent>
                {baselinesData?.data?.length ? (
                  <div className="space-y-3">
                    {baselinesData.data.slice(0, 5).map((baseline: Baseline) => (
                      <div
                        key={baseline.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div>
                          <div className="font-medium text-sm">{baseline.name}</div>
                          <div className="text-xs text-gray-600">
                            {baseline.baselineType} •{' '}
                            {format(parseISO(baseline.createdAt), 'MMM dd, yyyy')}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {baseline.isDefault && <Badge variant="default">Default</Badge>}
                          <Badge variant="outline">{baseline.baselineType}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-gray-500">No baselines configured</div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="baselines" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Baseline Management</h2>
              <p className="text-gray-600">Configure and manage performance baselines</p>
            </div>

            <Dialog open={createBaselineDialogOpen} onOpenChange={setCreateBaselineDialogOpen}>
              <DialogTrigger asChild>
                <Button className="flex items-center space-x-2">
                  <Plus className="w-4 h-4" />
                  <span>Create Baseline</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create New Baseline</DialogTitle>
                  <DialogDescription>
                    Set up a new performance baseline for variance tracking.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Baseline Name</Label>
                      <Input
                        value={baselineForm.name}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setBaselineForm((prev) => ({ ...prev, name: e.target.value }))
                        }
                        placeholder="Enter baseline name..."
                      />
                    </div>
                    <div>
                      <Label>Baseline Type</Label>
                      <Select
                        value={baselineForm.baselineType}
                        onValueChange={(
                          value: 'initial' | 'quarterly' | 'annual' | 'milestone' | 'custom'
                        ) => setBaselineForm((prev) => ({ ...prev, baselineType: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="initial">Initial</SelectItem>
                          <SelectItem value="quarterly">Quarterly</SelectItem>
                          <SelectItem value="annual">Annual</SelectItem>
                          <SelectItem value="milestone">Milestone</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Textarea
                      value={baselineForm.description}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                        setBaselineForm((prev) => ({ ...prev, description: e.target.value }))
                      }
                      placeholder="Enter baseline description..."
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Period Start</Label>
                      <Input
                        type="date"
                        value={baselineForm.periodStart}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setBaselineForm((prev) => ({ ...prev, periodStart: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label>Period End</Label>
                      <Input
                        type="date"
                        value={baselineForm.periodEnd}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setBaselineForm((prev) => ({ ...prev, periodEnd: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateBaselineDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateBaseline}
                    disabled={createBaselineMutation.isPending || !baselineForm.name.trim()}
                  >
                    {createBaselineMutation.isPending ? 'Creating...' : 'Create Baseline'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Baselines List */}
          <Card>
            <CardContent className="p-0">
              {baselinesLoading ? (
                <div className="p-6">
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i: number) => (
                      <div
                        key={i}
                        className="animate-pulse flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div className="space-y-2">
                          <div className="h-4 w-48 bg-gray-200 rounded" />
                          <div className="h-3 w-32 bg-gray-200 rounded" />
                        </div>
                        <div className="w-24 h-8 bg-gray-200 rounded" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : baselinesData?.data?.length ? (
                <div className="divide-y">
                  {baselinesData.data.map((baseline: Baseline) => (
                    <div key={baseline.id} className="p-6 flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="font-medium text-gray-900">{baseline.name}</h3>
                          {baseline.isDefault && <Badge variant="default">Default</Badge>}
                          <Badge variant="outline">{baseline.baselineType}</Badge>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{baseline.description}</p>
                        <div className="text-xs text-gray-500">
                          {format(parseISO(baseline.periodStart), 'MMM dd, yyyy')} -{' '}
                          {format(parseISO(baseline.periodEnd), 'MMM dd, yyyy')}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {!baseline.isDefault && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setDefaultBaselineMutation.mutate({
                                fundId: currentFund.id,
                                baselineId: baseline.id,
                              })
                            }
                          >
                            Set Default
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            deactivateBaselineMutation.mutate({
                              fundId: currentFund.id,
                              baselineId: baseline.id,
                            })
                          }
                          className="text-red-600 border-red-200 hover:bg-red-50"
                        >
                          Deactivate
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center">
                  <Target className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Baselines</h3>
                  <p className="text-gray-600 mb-4">
                    Create your first baseline to start tracking variance.
                  </p>
                  <Button onClick={() => setCreateBaselineDialogOpen(true)}>
                    Create First Baseline
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Alert Management</h2>
              <p className="text-gray-600">Monitor and manage variance alerts</p>
            </div>

            <Dialog open={createAlertDialogOpen} onOpenChange={setCreateAlertDialogOpen}>
              <DialogTrigger asChild>
                <Button className="flex items-center space-x-2">
                  <Plus className="w-4 h-4" />
                  <span>Create Alert Rule</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create Alert Rule</DialogTitle>
                  <DialogDescription>
                    Set up automatic alerts for variance monitoring.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Rule Name</Label>
                      <Input
                        value={alertRuleForm.name}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setAlertRuleForm((prev) => ({ ...prev, name: e.target.value }))
                        }
                        placeholder="Enter rule name..."
                      />
                    </div>
                    <div>
                      <Label>Metric Name</Label>
                      <Select
                        value={alertRuleForm.metricName}
                        onValueChange={(value: AlertMetricName) =>
                          setAlertRuleForm((prev) => ({ ...prev, metricName: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ALERT_METRIC_GROUPS.map((group) => (
                            <SelectGroup key={group.label}>
                              <SelectLabel>{group.label}</SelectLabel>
                              {group.options.map((metricName) => (
                                <SelectItem key={metricName} value={metricName}>
                                  {ALERT_METRIC_LABELS[metricName]}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="mt-1 text-xs text-gray-500">
                        Alert rules currently support threshold checks over the canonical fund-level
                        variance metrics only.
                      </p>
                    </div>
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Textarea
                      value={alertRuleForm.description}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                        setAlertRuleForm((prev) => ({ ...prev, description: e.target.value }))
                      }
                      placeholder="Enter rule description..."
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>Operator</Label>
                      <Select
                        value={alertRuleForm.operator}
                        onValueChange={(value: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'between') =>
                          setAlertRuleForm((prev) => ({ ...prev, operator: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gt">Greater Than</SelectItem>
                          <SelectItem value="lt">Less Than</SelectItem>
                          <SelectItem value="eq">Equal To</SelectItem>
                          <SelectItem value="gte">Greater Than or Equal</SelectItem>
                          <SelectItem value="lte">Less Than or Equal</SelectItem>
                          <SelectItem value="between">Between</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Threshold Value</Label>
                      <Input
                        type="number"
                        value={alertRuleForm.thresholdValue}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setAlertRuleForm((prev) => ({
                            ...prev,
                            thresholdValue: parseFloat(e.target.value),
                          }))
                        }
                        placeholder="0"
                      />
                    </div>
                  </div>
                  {alertRuleForm.operator === 'between' && (
                    <div>
                      <Label>Secondary Threshold</Label>
                      <Input
                        type="number"
                        value={alertRuleForm.secondaryThreshold ?? ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setAlertRuleForm((prev) => ({
                            ...prev,
                            secondaryThreshold:
                              e.target.value === '' ? undefined : parseFloat(e.target.value),
                          }))
                        }
                        placeholder="Upper or lower bound"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        The alert triggers only when the selected metric falls between the primary
                        and secondary thresholds.
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>Severity</Label>
                      <Select
                        value={alertRuleForm.severity}
                        onValueChange={(value: 'info' | 'warning' | 'critical' | 'urgent') =>
                          setAlertRuleForm((prev) => ({ ...prev, severity: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="info">Info</SelectItem>
                          <SelectItem value="warning">Warning</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Category</Label>
                      <Select
                        value={alertRuleForm.category}
                        onValueChange={(
                          value: 'performance' | 'risk' | 'operational' | 'compliance'
                        ) => setAlertRuleForm((prev) => ({ ...prev, category: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="performance">Performance</SelectItem>
                          <SelectItem value="risk">Risk</SelectItem>
                          <SelectItem value="operational">Operational</SelectItem>
                          <SelectItem value="compliance">Compliance</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Check Frequency</Label>
                      <Select
                        value={alertRuleForm.checkFrequency}
                        onValueChange={(value: 'realtime' | 'hourly' | 'daily' | 'weekly') =>
                          setAlertRuleForm((prev) => ({ ...prev, checkFrequency: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="realtime">Real-time</SelectItem>
                          <SelectItem value="hourly">Hourly</SelectItem>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateAlertDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateAlertRule}
                    disabled={
                      createAlertRuleMutation.isPending ||
                      !alertRuleForm.name.trim() ||
                      Number.isNaN(alertRuleForm.thresholdValue) ||
                      (alertRuleForm.operator === 'between' &&
                        alertRuleForm.secondaryThreshold === undefined)
                    }
                  >
                    {createAlertRuleMutation.isPending ? 'Creating...' : 'Create Rule'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Active Alerts */}
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <CardTitle>Active Alerts</CardTitle>
                  <CardDescription>
                    {alertBaselineScope === 'current'
                      ? 'Current-baseline incidents requiring attention'
                      : 'All open incidents, including older baseline snapshots'}
                  </CardDescription>
                </div>
                <div className="w-full md:w-56">
                  <Label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Alert Scope
                  </Label>
                  <Select
                    value={alertBaselineScope}
                    onValueChange={(value: 'current' | 'all') => setAlertBaselineScope(value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="current">Current baseline</SelectItem>
                      <SelectItem value="all">All open incidents</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {alertsLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i: number) => (
                    <div
                      key={i}
                      className="animate-pulse flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="space-y-2">
                        <div className="h-4 w-48 bg-gray-200 rounded" />
                        <div className="h-3 w-32 bg-gray-200 rounded" />
                      </div>
                      <div className="w-24 h-8 bg-gray-200 rounded" />
                    </div>
                  ))}
                </div>
              ) : alertsData?.data?.length ? (
                <div className="space-y-4">
                  {alertsData.data.map((alert: Alert) => (
                    <div
                      key={alert.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center space-x-4">
                        <AlertTriangle
                          className={cn(
                            'w-6 h-6',
                            alert.severity === 'critical' && 'text-red-600',
                            alert.severity === 'urgent' && 'text-red-600',
                            alert.severity === 'warning' && 'text-yellow-600',
                            alert.severity === 'info' && 'text-blue-600'
                          )}
                        />
                        <div>
                          <div className="font-medium text-gray-900">{alert.ruleName}</div>
                          <div className="text-sm text-gray-600">{alert.message}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                            <span>{format(parseISO(alert.triggeredAt), 'MMM dd, yyyy HH:mm')}</span>
                            {alertBaselineScope === 'all' && alert.baselineName ? (
                              <span>Baseline: {alert.baselineName}</span>
                            ) : null}
                            {alertBaselineScope === 'all' &&
                            currentDefaultBaseline?.id &&
                            alert.baselineId &&
                            alert.baselineId !== currentDefaultBaseline.id ? (
                              <Badge variant="outline" className="text-amber-700 border-amber-200">
                                Older baseline
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <Badge variant="outline" className={getSeverityColor(alert.severity)}>
                          {alert.severity}
                        </Badge>
                        <Badge variant="outline">{alert.category}</Badge>
                        <div className="flex items-center space-x-2">
                          {alert.status === 'active' && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedAlert(alert);
                                  setActionType('acknowledge');
                                  setAlertActionDialogOpen(true);
                                }}
                              >
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Acknowledge
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedAlert(alert);
                                  setActionType('resolve');
                                  setAlertActionDialogOpen(true);
                                }}
                                className="text-green-600 border-green-200 hover:bg-green-50"
                              >
                                <XCircle className="w-4 h-4 mr-1" />
                                Resolve
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Bell className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    {alertBaselineScope === 'current'
                      ? 'No Current-Baseline Alerts'
                      : 'No Open Alerts'}
                  </h3>
                  <p className="text-gray-600">
                    {alertBaselineScope === 'current'
                      ? 'The current default baseline is within acceptable variance ranges.'
                      : 'There are no open incidents across current or historical baselines.'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Alert Action Dialog */}
          <Dialog open={alertActionDialogOpen} onOpenChange={setAlertActionDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {actionType === 'acknowledge' ? 'Acknowledge' : 'Resolve'} Alert
                </DialogTitle>
                <DialogDescription>
                  {actionType === 'acknowledge'
                    ? 'Acknowledge this alert to indicate you are aware of the issue.'
                    : 'Mark this alert as resolved once the underlying issue has been addressed.'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {selectedAlert && (
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="font-medium">{selectedAlert.ruleName}</div>
                    <div className="text-sm text-gray-600">{selectedAlert.message}</div>
                  </div>
                )}
                <div>
                  <Label>Notes (Optional)</Label>
                  <Textarea
                    value={actionNotes}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                      setActionNotes(e.target.value)
                    }
                    placeholder={`Add notes about ${actionType === 'acknowledge' ? 'acknowledging' : 'resolving'} this alert...`}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAlertActionDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleAlertAction}
                  disabled={
                    actionType === 'acknowledge'
                      ? acknowledgeAlertMutation.isPending
                      : resolveAlertMutation.isPending
                  }
                >
                  {(
                    actionType === 'acknowledge'
                      ? acknowledgeAlertMutation.isPending
                      : resolveAlertMutation.isPending
                  )
                    ? `${actionType === 'acknowledge' ? 'Acknowledging' : 'Resolving'}...`
                    : actionType === 'acknowledge'
                      ? 'Acknowledge Alert'
                      : 'Resolve Alert'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="reports" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Variance Reports</h2>
              <p className="text-gray-600">Generated variance analysis reports</p>
            </div>
            <Button
              className="flex items-center space-x-2"
              onClick={() => setGenerateReportDialogOpen(true)}
            >
              <Plus className="w-4 h-4" />
              <span>Generate Report</span>
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {reportsLoading ? (
                <div className="p-6">
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i: number) => (
                      <div
                        key={i}
                        className="animate-pulse flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div className="space-y-2">
                          <div className="h-4 w-48 bg-gray-200 rounded" />
                          <div className="h-3 w-32 bg-gray-200 rounded" />
                        </div>
                        <div className="w-24 h-8 bg-gray-200 rounded" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : reportsData?.data?.length ? (
                <div className="divide-y">
                  {reportsData.data.map((report: VarianceReport) => (
                    <div
                      key={report.id}
                      className="p-6 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => setSelectedReportId(report.id)}
                    >
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="font-medium text-gray-900">{report.reportName}</h3>
                          <Badge variant="outline">{report.reportType}</Badge>
                        </div>
                        <div className="text-sm text-gray-600 mb-1">
                          {report.summary.totalVariances} variances
                          {report.summary.criticalVariances > 0 && (
                            <span className="text-red-600 ml-2">
                              ({report.summary.criticalVariances} critical)
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">
                          Generated {format(parseISO(report.generatedAt), 'MMM dd, yyyy')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center">
                  <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Reports Generated</h3>
                  <p className="text-gray-600 mb-4">
                    Run a variance analysis to generate your first report.
                  </p>
                  <Button onClick={handlePerformAnalysis} disabled={isAnalysisRunning}>
                    {isAnalysisRunning ? 'Analyzing...' : 'Run Analysis'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Report Detail Sheet */}
          <Sheet
            open={selectedReportId !== null}
            onOpenChange={(open) => {
              if (!open) setSelectedReportId(null);
            }}
          >
            <SheetContent className="sm:max-w-lg overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Report Details</SheetTitle>
                <SheetDescription>Variance report summary and breakdown</SheetDescription>
              </SheetHeader>
              {reportDetailLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
              ) : reportDetail ? (
                <div className="space-y-6 mt-6">
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-500">Report Name</div>
                    <div className="text-gray-900">{reportDetail.reportName}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm font-medium text-gray-500">Type</div>
                      <Badge variant="outline" className="mt-1">
                        {reportDetail.reportType}
                      </Badge>
                    </div>
                    {reportDetail.reportPeriod && (
                      <div>
                        <div className="text-sm font-medium text-gray-500">Period</div>
                        <Badge variant="outline" className="mt-1">
                          {reportDetail.reportPeriod}
                        </Badge>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm font-medium text-gray-500">As Of Date</div>
                      <div className="text-gray-900">
                        {format(parseISO(reportDetail.asOfDate), 'MMM dd, yyyy')}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-500">Generated At</div>
                      <div className="text-gray-900">
                        {format(parseISO(reportDetail.generatedAt), 'MMM dd, yyyy HH:mm')}
                      </div>
                    </div>
                  </div>

                  {showHistoricalPortfolioAnalysisUnavailableNotice && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                          Historical portfolio, reserve, and pacing analysis is unavailable for this
                          report because point-in-time portfolio snapshots are not yet stored.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Summary cards */}
                  <div>
                    <div className="text-sm font-medium text-gray-500 mb-2">Summary</div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-lg border p-3 text-center">
                        <div className="text-lg font-semibold text-gray-900">
                          {reportDetail.summary.totalVariances}
                        </div>
                        <div className="text-xs text-gray-500">Total</div>
                      </div>
                      <div className="rounded-lg border p-3 text-center">
                        <div className="text-lg font-semibold text-yellow-700">
                          {reportDetail.summary.significantVariances}
                        </div>
                        <div className="text-xs text-gray-500">Significant</div>
                      </div>
                      <div className="rounded-lg border p-3 text-center">
                        <div className="text-lg font-semibold text-red-700">
                          {reportDetail.summary.criticalVariances}
                        </div>
                        <div className="text-xs text-gray-500">Critical</div>
                      </div>
                    </div>
                  </div>

                  {/* Supplemental variance analysis */}
                  {reportHasSupplementalAnalysis && (
                    <div>
                      <div className="text-sm font-medium text-gray-500 mb-2">
                        Portfolio Analysis
                      </div>
                      {showHistoricalPortfolioAnalysisNotice && (
                        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                            <div>
                              Portfolio, reserve, and pacing analysis currently reflect the latest
                              available state. Historical point-in-time portfolio snapshots are not
                              yet available for this report.
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                        {reportDetail.portfolioVariances && (
                          <>
                            <div className="p-2 bg-gray-50 rounded">
                              <span className="text-gray-500">Portfolio Count Change</span>
                              <span className="block font-medium">
                                {formatSignedNumber(
                                  reportDetail.portfolioVariances.portfolioCountVariance
                                )}
                              </span>
                            </div>
                            <div className="p-2 bg-gray-50 rounded">
                              <span className="text-gray-500">Companies Analyzed</span>
                              <span className="block font-medium">{companyVariances.length}</span>
                            </div>
                          </>
                        )}
                        {reportDetail.sectorVariances && (
                          <div className="p-2 bg-gray-50 rounded">
                            <span className="text-gray-500">Sectors Tracked</span>
                            <span className="block font-medium">
                              {Object.keys(reportDetail.sectorVariances).length}
                            </span>
                          </div>
                        )}
                        {reportDetail.stageVariances && (
                          <div className="p-2 bg-gray-50 rounded">
                            <span className="text-gray-500">Stages Tracked</span>
                            <span className="block font-medium">
                              {Object.keys(reportDetail.stageVariances).length}
                            </span>
                          </div>
                        )}
                        {reportDetail.reserveVariances && (
                          <div className="p-2 bg-gray-50 rounded">
                            <span className="text-gray-500">Reserve Metrics Changed</span>
                            <span className="block font-medium">
                              {reserveMetricEntries.length + reserveChangeEntries.length}
                            </span>
                          </div>
                        )}
                        {reportDetail.pacingVariances && (
                          <div className="p-2 bg-gray-50 rounded">
                            <span className="text-gray-500">Pacing Metrics Changed</span>
                            <span className="block font-medium">
                              {pacingMetricEntries.length + pacingChangeEntries.length}
                            </span>
                          </div>
                        )}
                      </div>

                      {companyVariances.length > 0 && (
                        <div className="mt-4">
                          <div className="text-sm font-medium text-gray-500 mb-2">
                            Company Variances
                          </div>
                          <div className="border rounded-lg overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-gray-50 border-b">
                                  <th className="text-left p-2 font-medium text-gray-600">
                                    Company
                                  </th>
                                  <th className="text-left p-2 font-medium text-gray-600">
                                    Change
                                  </th>
                                  <th className="text-right p-2 font-medium text-gray-600">
                                    Baseline
                                  </th>
                                  <th className="text-right p-2 font-medium text-gray-600">
                                    Current
                                  </th>
                                  <th className="text-right p-2 font-medium text-gray-600">
                                    Invested
                                  </th>
                                  <th className="text-right p-2 font-medium text-gray-600">
                                    Delta
                                  </th>
                                  <th className="text-right p-2 font-medium text-gray-600">
                                    Delta %
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {companyVariances.map((company) => (
                                  <tr
                                    key={`${company.companyId}-${company.changeType ?? 'matched'}`}
                                  >
                                    <td className="p-2 align-top">
                                      <div className="font-medium text-gray-900">
                                        {company.companyName}
                                      </div>
                                      <div className="text-xs text-gray-500">
                                        {[company.sector, company.stage]
                                          .filter(Boolean)
                                          .join(' • ') || 'Unclassified'}
                                      </div>
                                    </td>
                                    <td className="p-2 align-top">
                                      <div className="flex flex-col gap-1">
                                        <Badge
                                          variant="outline"
                                          className={cn(
                                            'w-fit',
                                            company.changeType === 'added' &&
                                              'border-emerald-200 bg-emerald-50 text-emerald-700',
                                            company.changeType === 'removed' &&
                                              'border-rose-200 bg-rose-50 text-rose-700',
                                            (!company.changeType ||
                                              company.changeType === 'matched') &&
                                              'border-slate-200 bg-slate-50 text-slate-700'
                                          )}
                                        >
                                          {company.changeType ?? 'matched'}
                                        </Badge>
                                        <Badge
                                          variant="outline"
                                          className={cn(
                                            'w-fit',
                                            company.riskLevel === 'critical' &&
                                              'border-red-200 bg-red-50 text-red-700',
                                            company.riskLevel === 'high' &&
                                              'border-orange-200 bg-orange-50 text-orange-700',
                                            company.riskLevel === 'medium' &&
                                              'border-yellow-200 bg-yellow-50 text-yellow-700',
                                            company.riskLevel === 'low' &&
                                              'border-emerald-200 bg-emerald-50 text-emerald-700'
                                          )}
                                        >
                                          {company.riskLevel}
                                        </Badge>
                                      </div>
                                    </td>
                                    <td className="p-2 text-right text-gray-700">
                                      {formatCurrency(company.baselineValuation)}
                                    </td>
                                    <td className="p-2 text-right text-gray-700">
                                      {formatCurrency(company.currentValuation)}
                                    </td>
                                    <td className="p-2 text-right text-gray-700">
                                      <div>{formatCurrency(company.currentInvestedCapital)}</div>
                                      <div className="text-xs text-gray-500">
                                        base {formatCurrency(company.baselineInvestedCapital)}
                                      </div>
                                    </td>
                                    <td className="p-2 text-right text-gray-700">
                                      {formatCurrency(company.valuationVariance)}
                                    </td>
                                    <td className="p-2 text-right text-gray-700">
                                      {formatSignedPercent(company.valuationVariancePct)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {sectorVarianceEntries.length > 0 && (
                        <div className="mt-4">
                          <div className="text-sm font-medium text-gray-500 mb-2">
                            Sector Distribution
                          </div>
                          <div className="border rounded-lg overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-gray-50 border-b">
                                  <th className="text-left p-2 font-medium text-gray-600">
                                    Sector
                                  </th>
                                  <th className="text-right p-2 font-medium text-gray-600">
                                    Current
                                  </th>
                                  <th className="text-right p-2 font-medium text-gray-600">
                                    Baseline
                                  </th>
                                  <th className="text-right p-2 font-medium text-gray-600">
                                    Count Delta
                                  </th>
                                  <th className="text-right p-2 font-medium text-gray-600">
                                    Share Delta
                                  </th>
                                  <th className="text-right p-2 font-medium text-gray-600">
                                    Share Delta %
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {sectorVarianceEntries.map(([sector, row]) => (
                                  <tr key={sector}>
                                    <td className="p-2 text-gray-900">{sector}</td>
                                    <td className="p-2 text-right text-gray-700">{row.current}</td>
                                    <td className="p-2 text-right text-gray-700">{row.baseline}</td>
                                    <td className="p-2 text-right text-gray-700">
                                      {formatSignedNumber(row.delta)}
                                    </td>
                                    <td className="p-2 text-right text-gray-700">
                                      {formatSignedPercent(row.countShareDelta)}
                                    </td>
                                    <td className="p-2 text-right text-gray-700">
                                      {formatSignedPercent(row.countShareDeltaPct)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {stageVarianceEntries.length > 0 && (
                        <div className="mt-4">
                          <div className="text-sm font-medium text-gray-500 mb-2">
                            Stage Distribution
                          </div>
                          <div className="border rounded-lg overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-gray-50 border-b">
                                  <th className="text-left p-2 font-medium text-gray-600">Stage</th>
                                  <th className="text-right p-2 font-medium text-gray-600">
                                    Current
                                  </th>
                                  <th className="text-right p-2 font-medium text-gray-600">
                                    Baseline
                                  </th>
                                  <th className="text-right p-2 font-medium text-gray-600">
                                    Count Delta
                                  </th>
                                  <th className="text-right p-2 font-medium text-gray-600">
                                    Share Delta
                                  </th>
                                  <th className="text-right p-2 font-medium text-gray-600">
                                    Share Delta %
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {stageVarianceEntries.map(([stage, row]) => (
                                  <tr key={stage}>
                                    <td className="p-2 text-gray-900">{stage}</td>
                                    <td className="p-2 text-right text-gray-700">{row.current}</td>
                                    <td className="p-2 text-right text-gray-700">{row.baseline}</td>
                                    <td className="p-2 text-right text-gray-700">
                                      {formatSignedNumber(row.delta)}
                                    </td>
                                    <td className="p-2 text-right text-gray-700">
                                      {formatSignedPercent(row.countShareDelta)}
                                    </td>
                                    <td className="p-2 text-right text-gray-700">
                                      {formatSignedPercent(row.countShareDeltaPct)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {(reportDetail.reserveVariances || reportDetail.pacingVariances) && (
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          {reportDetail.reserveVariances && (
                            <div>
                              <div className="text-sm font-medium text-gray-500 mb-2">
                                Reserve Variances
                              </div>
                              <div className="space-y-2">
                                {reserveMetricEntries.map(([metric, delta]) => (
                                  <div
                                    key={metric}
                                    className="rounded-lg border bg-gray-50 p-3 text-sm"
                                  >
                                    <div className="font-medium text-gray-900">{metric}</div>
                                    <div className="mt-1 text-gray-600">
                                      {renderChangeValue(delta.baseline)} to{' '}
                                      {renderChangeValue(delta.current)}
                                    </div>
                                    <div className="text-gray-700">
                                      delta {formatSignedNumber(delta.delta, 2)} | pct{' '}
                                      {formatSignedPercent(delta.deltaPct)}
                                    </div>
                                  </div>
                                ))}
                                {reserveChangeEntries.map(([metric, change]) => (
                                  <div key={metric} className="rounded-lg border p-3 text-sm">
                                    <div className="font-medium text-gray-900">{metric}</div>
                                    <div className="text-gray-600">
                                      {renderChangeValue(change.baseline)} to{' '}
                                      {renderChangeValue(change.current)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {reportDetail.pacingVariances && (
                            <div>
                              <div className="text-sm font-medium text-gray-500 mb-2">
                                Pacing Variances
                              </div>
                              <div className="space-y-2">
                                {pacingMetricEntries.map(([metric, delta]) => (
                                  <div
                                    key={metric}
                                    className="rounded-lg border bg-gray-50 p-3 text-sm"
                                  >
                                    <div className="font-medium text-gray-900">{metric}</div>
                                    <div className="mt-1 text-gray-600">
                                      {renderChangeValue(delta.baseline)} to{' '}
                                      {renderChangeValue(delta.current)}
                                    </div>
                                    <div className="text-gray-700">
                                      delta {formatSignedNumber(delta.delta, 2)} | pct{' '}
                                      {formatSignedPercent(delta.deltaPct)}
                                    </div>
                                  </div>
                                ))}
                                {pacingChangeEntries.map(([metric, change]) => (
                                  <div key={metric} className="rounded-lg border p-3 text-sm">
                                    <div className="font-medium text-gray-900">{metric}</div>
                                    <div className="text-gray-600">
                                      {renderChangeValue(change.baseline)} to{' '}
                                      {renderChangeValue(change.current)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Variances table */}
                  {reportDetail.variances.length > 0 && (
                    <div>
                      <div className="text-sm font-medium text-gray-500 mb-2">Variances</div>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 border-b">
                              <th className="text-left p-2 font-medium text-gray-600">Metric</th>
                              <th className="text-right p-2 font-medium text-gray-600">Value</th>
                              <th className="text-right p-2 font-medium text-gray-600">Pct</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {reportDetail.variances.map((v: unknown, idx: number) => {
                              const row = v as Record<string, unknown>;
                              return (
                                <tr key={idx} className="hover:bg-gray-50">
                                  <td className="p-2 text-gray-900">
                                    {String(row['metric'] ?? row['metricName'] ?? '-')}
                                  </td>
                                  <td className="p-2 text-right text-gray-700">
                                    {String(row['value'] ?? row['variance'] ?? '-')}
                                  </td>
                                  <td className="p-2 text-right text-gray-700">
                                    {(() => {
                                      const raw = row['pct'] ?? row['percentChange'];
                                      if (raw == null) return '-';
                                      const num = Number(raw);
                                      return isNaN(num)
                                        ? `${String(raw)}%`
                                        : `${(num * 100).toFixed(1)}%`;
                                    })()}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">Report not found.</div>
              )}
            </SheetContent>
          </Sheet>

          {/* Generate Report Dialog */}
          <Dialog open={generateReportDialogOpen} onOpenChange={setGenerateReportDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Generate Variance Report</DialogTitle>
                <DialogDescription>
                  Configure and generate a new variance analysis report.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Report Name</Label>
                  <Input
                    value={reportForm.reportName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setReportForm((prev) => ({ ...prev, reportName: e.target.value }))
                    }
                    placeholder="Enter report name..."
                  />
                </div>
                <div>
                  <Label>Report Type</Label>
                  <Select
                    value={reportForm.reportType}
                    onValueChange={(
                      value: 'periodic' | 'milestone' | 'ad_hoc' | 'alert_triggered'
                    ) => setReportForm((prev) => ({ ...prev, reportType: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="periodic">Periodic</SelectItem>
                      <SelectItem value="milestone">Milestone</SelectItem>
                      <SelectItem value="ad_hoc">Ad Hoc</SelectItem>
                      <SelectItem value="alert_triggered">Alert Triggered</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Report Period (optional)</Label>
                  <Select
                    value={reportForm.reportPeriod}
                    onValueChange={(value: '' | 'monthly' | 'quarterly' | 'annual') =>
                      setReportForm((prev) => ({ ...prev, reportPeriod: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select period..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setGenerateReportDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerateReport}
                  disabled={generateReportMutation.isPending || !reportForm.reportName.trim()}
                >
                  {generateReportMutation.isPending ? 'Generating...' : 'Generate Report'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Variance Settings</h2>
            <p className="text-gray-600">Configure variance tracking preferences</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Notification Settings</CardTitle>
              <CardDescription>Configure how you receive variance alerts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="variance-email-notifications" className="text-base">
                    Email Notifications
                  </Label>
                  <p className="text-sm text-gray-600">Receive alerts via email</p>
                </div>
                <Switch
                  id="variance-email-notifications"
                  checked={varianceSettings.emailNotifications}
                  onCheckedChange={(checked) =>
                    updateVarianceSetting('emailNotifications', checked)
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="variance-realtime-alerts" className="text-base">
                    Real-time Alerts
                  </Label>
                  <p className="text-sm text-gray-600">
                    Immediate notifications for critical alerts
                  </p>
                </div>
                <Switch
                  id="variance-realtime-alerts"
                  checked={varianceSettings.realtimeAlerts}
                  onCheckedChange={(checked) => updateVarianceSetting('realtimeAlerts', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="variance-daily-digest" className="text-base">
                    Daily Digest
                  </Label>
                  <p className="text-sm text-gray-600">Summary of variance activity</p>
                </div>
                <Switch
                  id="variance-daily-digest"
                  checked={varianceSettings.dailyDigest}
                  onCheckedChange={(checked) => updateVarianceSetting('dailyDigest', checked)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Analysis Settings</CardTitle>
              <CardDescription>Configure variance analysis parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label htmlFor="variance-default-threshold">Default Variance Threshold (%)</Label>
                <Input
                  id="variance-default-threshold"
                  type="number"
                  value={varianceSettings.defaultVarianceThreshold}
                  onChange={(event) =>
                    updateVarianceSetting('defaultVarianceThreshold', event.target.value)
                  }
                  className="mt-1"
                />
                <p className="text-sm text-gray-600 mt-1">
                  Default threshold for triggering variance alerts
                </p>
              </div>
              <div>
                <Label htmlFor="variance-analysis-frequency">Analysis Frequency</Label>
                <Select
                  value={varianceSettings.analysisFrequency}
                  onValueChange={(value: VarianceSettings['analysisFrequency']) =>
                    updateVarianceSetting('analysisFrequency', value)
                  }
                >
                  <SelectTrigger id="variance-analysis-frequency" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="realtime">Real-time</SelectItem>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-600" aria-live="polite">
              {settingsSaveMessage ??
                'Save settings after changing alert delivery or analysis cadence.'}
            </p>
            <Button onClick={handleSaveSettings}>Save Settings</Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
