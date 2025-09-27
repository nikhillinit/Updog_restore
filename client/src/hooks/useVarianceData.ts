import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

export interface Baseline {
  id: string;
  fundId: number;
  name: string;
  description?: string;
  baselineType: 'initial' | 'quarterly' | 'annual' | 'milestone' | 'custom';
  periodStart: string;
  periodEnd: string;
  isDefault: boolean;
  isActive: boolean;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}

export interface VarianceReport {
  id: string;
  fundId: number;
  baselineId: string;
  reportName: string;
  reportType: 'periodic' | 'milestone' | 'ad_hoc' | 'alert_triggered';
  reportPeriod?: 'monthly' | 'quarterly' | 'annual';
  asOfDate: string;
  generatedBy?: number;
  generatedAt: string;
  summary: {
    totalVariances: number;
    significantVariances: number;
    criticalVariances: number;
  };
  variances: any[];
}

export interface AlertRule {
  id: string;
  fundId: number;
  name: string;
  description?: string;
  ruleType: 'threshold' | 'trend' | 'deviation' | 'pattern';
  metricName: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'between';
  thresholdValue: number;
  secondaryThreshold?: number;
  severity: 'info' | 'warning' | 'critical' | 'urgent';
  category: 'performance' | 'risk' | 'operational' | 'compliance';
  checkFrequency: 'realtime' | 'hourly' | 'daily' | 'weekly';
  isActive: boolean;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

export interface Alert {
  id: string;
  fundId: number;
  ruleId: string;
  ruleName: string;
  severity: 'info' | 'warning' | 'critical' | 'urgent';
  category: 'performance' | 'risk' | 'operational' | 'compliance';
  message: string;
  details: any;
  status: 'active' | 'acknowledged' | 'resolved';
  triggeredAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: number;
  resolvedAt?: string;
  resolvedBy?: number;
  notes?: string;
}

export interface VarianceDashboard {
  defaultBaseline: Baseline | null;
  recentBaselines: Baseline[];
  activeAlerts: Alert[];
  alertsByseverity: {
    critical: number;
    warning: number;
    info: number;
  };
  summary: {
    totalBaselines: number;
    totalActiveAlerts: number;
    lastAnalysisDate: string | null;
  };
}

/**
 * Hook to fetch baselines for a fund
 */
export function useBaselines(
  fundId: number,
  options: {
    baselineType?: string;
    isDefault?: boolean;
    limit?: number;
  } = {}
) {
  return useQuery<{ success: boolean; data: Baseline[]; count: number }>({
    queryKey: ['/api/funds', fundId, 'baselines', options],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (options.baselineType) searchParams.set('baselineType', options.baselineType);
      if (options.isDefault !== undefined) searchParams.set('isDefault', options.isDefault.toString());
      if (options.limit) searchParams.set('limit', options.limit.toString());

      const url = `/api/funds/${fundId}/baselines${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
      const response = await apiRequest('GET', url);
      return response.json();
    },
    enabled: !!fundId,
    staleTime: 60000, // 1 minute
  });
}

/**
 * Hook to fetch variance reports for a fund
 */
export function useVarianceReports(fundId: number) {
  return useQuery<{ success: boolean; data: VarianceReport[]; count: number }>({
    queryKey: ['/api/funds', fundId, 'variance-reports'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/funds/${fundId}/variance-reports`);
      return response.json();
    },
    enabled: !!fundId,
    staleTime: 60000, // 1 minute
  });
}

/**
 * Hook to fetch specific variance report
 */
export function useVarianceReport(fundId: number, reportId: string) {
  return useQuery<{ success: boolean; data: VarianceReport | null }>({
    queryKey: ['/api/funds', fundId, 'variance-reports', reportId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/funds/${fundId}/variance-reports/${reportId}`);
      return response.json();
    },
    enabled: !!fundId && !!reportId,
    staleTime: 300000, // 5 minutes
  });
}

/**
 * Hook to fetch active alerts for a fund
 */
export function useActiveAlerts(
  fundId: number,
  options: {
    severity?: string[];
    category?: string[];
    limit?: number;
  } = {}
) {
  return useQuery<{ success: boolean; data: Alert[]; count: number }>({
    queryKey: ['/api/funds', fundId, 'alerts', options],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (options.severity) searchParams.set('severity', options.severity.join(','));
      if (options.category) searchParams.set('category', options.category.join(','));
      if (options.limit) searchParams.set('limit', options.limit.toString());

      const url = `/api/funds/${fundId}/alerts${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
      const response = await apiRequest('GET', url);
      return response.json();
    },
    enabled: !!fundId,
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refresh every minute for active alerts
  });
}

/**
 * Hook to fetch variance dashboard data
 */
export function useVarianceDashboard(fundId: number) {
  return useQuery<{ success: boolean; data: VarianceDashboard }>({
    queryKey: ['/api/funds', fundId, 'variance-dashboard'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/funds/${fundId}/variance-dashboard`);
      return response.json();
    },
    enabled: !!fundId,
    staleTime: 60000, // 1 minute
    refetchInterval: 300000, // Refresh every 5 minutes
  });
}

/**
 * Mutation to create a new baseline
 */
export function useCreateBaseline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      fundId: number;
      name: string;
      description?: string;
      baselineType: 'initial' | 'quarterly' | 'annual' | 'milestone' | 'custom';
      periodStart: string;
      periodEnd: string;
      tags?: string[];
    }) => {
      const response = await apiRequest('POST', `/api/funds/${params.fundId}/baselines`, {
        name: params.name,
        description: params.description,
        baselineType: params.baselineType,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        tags: params.tags || [],
      });
      return response.json();
    },
    onSuccess: (data, variables) => {
      // Invalidate baselines queries
      queryClient.invalidateQueries({
        queryKey: ['/api/funds', variables.fundId, 'baselines'],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/funds', variables.fundId, 'variance-dashboard'],
      });
    },
  });
}

/**
 * Mutation to set default baseline
 */
export function useSetDefaultBaseline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      fundId: number;
      baselineId: string;
    }) => {
      const response = await apiRequest('POST', `/api/funds/${params.fundId}/baselines/${params.baselineId}/set-default`, {});
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['/api/funds', variables.fundId, 'baselines'],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/funds', variables.fundId, 'variance-dashboard'],
      });
    },
  });
}

/**
 * Mutation to deactivate a baseline
 */
export function useDeactivateBaseline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      fundId: number;
      baselineId: string;
    }) => {
      const response = await apiRequest('DELETE', `/api/funds/${params.fundId}/baselines/${params.baselineId}`, {});
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['/api/funds', variables.fundId, 'baselines'],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/funds', variables.fundId, 'variance-dashboard'],
      });
    },
  });
}

/**
 * Mutation to generate variance report
 */
export function useGenerateVarianceReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      fundId: number;
      baselineId?: string;
      reportName: string;
      reportType: 'periodic' | 'milestone' | 'ad_hoc' | 'alert_triggered';
      reportPeriod?: 'monthly' | 'quarterly' | 'annual';
      asOfDate?: string;
    }) => {
      const response = await apiRequest('POST', `/api/funds/${params.fundId}/variance-reports`, params);
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['/api/funds', variables.fundId, 'variance-reports'],
      });
    },
  });
}

/**
 * Mutation to create alert rule
 */
export function useCreateAlertRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      fundId: number;
      name: string;
      description?: string;
      ruleType: 'threshold' | 'trend' | 'deviation' | 'pattern';
      metricName: string;
      operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'between';
      thresholdValue: number;
      secondaryThreshold?: number;
      severity?: 'info' | 'warning' | 'critical' | 'urgent';
      category?: 'performance' | 'risk' | 'operational' | 'compliance';
      checkFrequency?: 'realtime' | 'hourly' | 'daily' | 'weekly';
    }) => {
      const response = await apiRequest('POST', `/api/funds/${params.fundId}/alert-rules`, params);
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['/api/funds', variables.fundId, 'alerts'],
      });
    },
  });
}

/**
 * Mutation to acknowledge an alert
 */
export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      alertId: string;
      notes?: string;
    }) => {
      const response = await apiRequest('POST', `/api/alerts/${params.alertId}/acknowledge`, {
        notes: params.notes,
      });
      return response.json();
    },
    onSuccess: () => {
      // Invalidate all alert queries
      queryClient.invalidateQueries({
        queryKey: ['/api/funds'],
        predicate: (query) => query.queryKey.includes('alerts'),
      });
    },
  });
}

/**
 * Mutation to resolve an alert
 */
export function useResolveAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      alertId: string;
      notes?: string;
    }) => {
      const response = await apiRequest('POST', `/api/alerts/${params.alertId}/resolve`, {
        notes: params.notes,
      });
      return response.json();
    },
    onSuccess: () => {
      // Invalidate all alert queries
      queryClient.invalidateQueries({
        queryKey: ['/api/funds'],
        predicate: (query) => query.queryKey.includes('alerts'),
      });
    },
  });
}

/**
 * Mutation to perform complete variance analysis
 */
export function usePerformVarianceAnalysis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      fundId: number;
      baselineId?: string;
      reportName?: string;
    }) => {
      const response = await apiRequest('POST', `/api/funds/${params.fundId}/variance-analysis`, params);
      return response.json();
    },
    onSuccess: (data, variables) => {
      // Invalidate all variance-related queries
      queryClient.invalidateQueries({
        queryKey: ['/api/funds', variables.fundId, 'variance-reports'],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/funds', variables.fundId, 'alerts'],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/funds', variables.fundId, 'variance-dashboard'],
      });
    },
  });
}