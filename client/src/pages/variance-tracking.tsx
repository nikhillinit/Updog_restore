import { useState } from 'react';
import { useFundContext } from '@/contexts/FundContext';
import {
  useVarianceDashboard,
  useBaselines,
  useActiveAlerts,
  useVarianceReports,
  useCreateBaseline,
  useSetDefaultBaseline,
  useDeactivateBaseline,
  useCreateAlertRule,
  useAcknowledgeAlert,
  useResolveAlert,
  usePerformVarianceAnalysis,
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
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
  Zap,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { spreadIfDefined } from '@/lib/ts/spreadIfDefined';

export default function VarianceTrackingPage() {
  const { currentFund } = useFundContext();
  const [createBaselineDialogOpen, setCreateBaselineDialogOpen] = useState(false);
  const [createAlertDialogOpen, setCreateAlertDialogOpen] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [alertActionDialogOpen, setAlertActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<'acknowledge' | 'resolve'>('acknowledge');
  const [actionNotes, setActionNotes] = useState('');

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
    ruleType: 'threshold' as 'threshold' | 'trend' | 'deviation' | 'pattern',
    metricName: '',
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
  } = useActiveAlerts(currentFund?.id || 0);

  const {
    data: reportsData,
    isLoading: reportsLoading,
    error: _reportsError,
  } = useVarianceReports(currentFund?.id || 0);

  // Mutations
  const createBaselineMutation = useCreateBaseline();
  const setDefaultBaselineMutation = useSetDefaultBaseline();
  const deactivateBaselineMutation = useDeactivateBaseline();
  const createAlertRuleMutation = useCreateAlertRule();
  const acknowledgeAlertMutation = useAcknowledgeAlert();
  const resolveAlertMutation = useResolveAlert();
  const performAnalysisMutation = usePerformVarianceAnalysis();

  const reports = reportsData?.data ?? [];
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
  const analysisStatus = !lastAnalysisDate
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
        ruleType: alertRuleForm.ruleType,
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
        metricName: '',
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
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to create alert rule. Please try again.',
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

      {/* Dashboard Stats */}
      <StatCardGrid>
        <StatCard
          title="Active Alerts"
          value={dashboardData?.data?.summary?.totalActiveAlerts || 0}
          icon={AlertTriangle}
          badge={{
            text: `${dashboardData?.data?.alertsByseverity?.critical || 0} Critical`,
            variant:
              (dashboardData?.data?.alertsByseverity?.critical || 0) > 0
                ? 'destructive'
                : 'secondary',
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

      {/* Alert Summary by Severity */}
      {dashboardData?.data?.alertsByseverity && (
        <Card>
          <CardHeader>
            <CardTitle>Alert Summary</CardTitle>
            <CardDescription>Breakdown of active alerts by severity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-lg">
                <div>
                  <div className="text-sm font-medium text-red-800">Critical</div>
                  <div className="text-2xl font-bold text-red-900">
                    {dashboardData.data.alertsByseverity.critical}
                  </div>
                </div>
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <div className="flex items-center justify-between p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div>
                  <div className="text-sm font-medium text-yellow-800">Warning</div>
                  <div className="text-2xl font-bold text-yellow-900">
                    {dashboardData.data.alertsByseverity.warning}
                  </div>
                </div>
                <AlertTriangle className="w-8 h-8 text-yellow-600" />
              </div>
              <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div>
                  <div className="text-sm font-medium text-blue-800">Info</div>
                  <div className="text-2xl font-bold text-blue-900">
                    {dashboardData.data.alertsByseverity.info}
                  </div>
                </div>
                <Bell className="w-8 h-8 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="baselines">Baselines</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
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
                <Button onClick={handlePerformAnalysis}>Run Variance Analysis</Button>
              </CardContent>
            </Card>
          )}

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
                      <Input
                        value={alertRuleForm.metricName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setAlertRuleForm((prev) => ({ ...prev, metricName: e.target.value }))
                        }
                        placeholder="Enter metric name..."
                      />
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
                      <Label>Rule Type</Label>
                      <Select
                        value={alertRuleForm.ruleType}
                        onValueChange={(value: 'threshold' | 'trend' | 'deviation' | 'pattern') =>
                          setAlertRuleForm((prev) => ({ ...prev, ruleType: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="threshold">Threshold</SelectItem>
                          <SelectItem value="trend">Trend</SelectItem>
                          <SelectItem value="deviation">Deviation</SelectItem>
                          <SelectItem value="pattern">Pattern</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
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
                    disabled={createAlertRuleMutation.isPending || !alertRuleForm.name.trim()}
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
              <CardTitle>Active Alerts</CardTitle>
              <CardDescription>Current variance alerts requiring attention</CardDescription>
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
                          <div className="text-xs text-gray-500 mt-1">
                            {format(parseISO(alert.triggeredAt), 'MMM dd, yyyy HH:mm')}
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
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Active Alerts</h3>
                  <p className="text-gray-600">
                    Your fund performance is within acceptable variance ranges.
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
                    <div key={report.id} className="p-6 flex items-center justify-between">
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
                  <Button onClick={handlePerformAnalysis}>Run Analysis</Button>
                </div>
              )}
            </CardContent>
          </Card>
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
                  <Label className="text-base">Email Notifications</Label>
                  <p className="text-sm text-gray-600">Receive alerts via email</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Real-time Alerts</Label>
                  <p className="text-sm text-gray-600">
                    Immediate notifications for critical alerts
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Daily Digest</Label>
                  <p className="text-sm text-gray-600">Summary of variance activity</p>
                </div>
                <Switch />
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
                <Label>Default Variance Threshold (%)</Label>
                <Input type="number" defaultValue="10" className="mt-1" />
                <p className="text-sm text-gray-600 mt-1">
                  Default threshold for triggering variance alerts
                </p>
              </div>
              <div>
                <Label>Analysis Frequency</Label>
                <Select defaultValue="daily">
                  <SelectTrigger className="mt-1">
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
