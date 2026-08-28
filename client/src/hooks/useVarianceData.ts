import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiRequest } from '@/lib/queryClient';
import { toast } from '@/hooks/use-toast';
import {
  ConstructionReconciliationLatestResponseSchema,
  ConstructionReconciliationPresentationEnvelopeSchema,
  type ConstructionReconciliationLatestResponse,
  type ConstructionReconciliationPresentationEnvelope,
} from '@shared/contracts/construction-reconciliation-v1.contract';
import type {
  AlertMetricName,
  BaselineResponse as Baseline,
  ClientAlertResponse as Alert,
  VarianceDashboardResponse as VarianceDashboard,
  VarianceReportClientResponse as VarianceReport,
} from '@shared/variance-validation';

export type { Alert, Baseline, VarianceDashboard, VarianceReport };

export const constructionReconciliationLatestQueryKey = (fundId: number | undefined) =>
  ['/api/funds', fundId ?? null, 'construction-reconciliation', 'latest'] as const;

export interface ConstructionReconciliationRunVariables {
  currentPlanVersionId: number;
}

export function useConstructionReconciliation(fundId: number | undefined) {
  const latest = useQuery<ConstructionReconciliationLatestResponse, Error>({
    queryKey: constructionReconciliationLatestQueryKey(fundId),
    queryFn: async () => {
      const response = await apiRequest<unknown>(
        'GET',
        `/api/funds/${fundId}/construction-reconciliation/latest`
      );
      return ConstructionReconciliationLatestResponseSchema.parse(response);
    },
    enabled: fundId != null,
    staleTime: 60000,
  });

  const run = useMutation<
    ConstructionReconciliationPresentationEnvelope,
    Error,
    ConstructionReconciliationRunVariables
  >({
    mutationFn: async (variables) => {
      if (fundId == null) {
        throw new Error('No fund ID available');
      }

      // The server resolves the current facts snapshot head; the client never
      // supplies financialFactsSnapshotId (a pinned-plan id would go stale).
      const response = await apiRequest<unknown>(
        'POST',
        `/api/funds/${fundId}/construction-reconciliation/runs`,
        {
          contractVersion: 'construction-reconciliation/1.0.0',
          fundId,
          ...variables,
        },
        {
          headers: {
            'Idempotency-Key': crypto.randomUUID(),
          },
        }
      );
      return ConstructionReconciliationPresentationEnvelopeSchema.parse(response);
    },
  });

  return { latest, run };
}

export interface AlertRule {
  id: string;
  fundId: number;
  name: string;
  description?: string;
  ruleType: 'threshold';
  metricName: AlertMetricName;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'between';
  thresholdValue: number;
  secondaryThreshold?: number;
  severity: 'info' | 'warning' | 'critical' | 'urgent';
  category: 'performance' | 'risk' | 'operational' | 'compliance';
  checkFrequency: 'realtime' | 'hourly' | 'daily' | 'weekly';
  suppressionPeriod: number;
  notificationChannels: Array<'email' | 'slack' | 'webhook'>;
  isActive: boolean;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
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
      if (options.isDefault !== undefined)
        searchParams.set('isDefault', options.isDefault.toString());
      if (options.limit) searchParams.set('limit', options.limit.toString());

      const url = `/api/funds/${fundId}/baselines${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
      return apiRequest<{ success: boolean; data: Baseline[]; count: number }>('GET', url);
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
      return apiRequest<{ success: boolean; data: VarianceReport[]; count: number }>(
        'GET',
        `/api/funds/${fundId}/variance-reports`
      );
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
      return apiRequest<{ success: boolean; data: VarianceReport | null }>(
        'GET',
        `/api/funds/${fundId}/variance-reports/${reportId}`
      );
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
    baselineScope?: 'all' | 'current';
    limit?: number;
  } = {}
) {
  return useQuery<{ success: boolean; data: Alert[]; count: number }>({
    queryKey: ['/api/funds', fundId, 'alerts', options],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (options.severity) searchParams.set('severity', options.severity.join(','));
      if (options.category) searchParams.set('category', options.category.join(','));
      if (options.baselineScope) searchParams.set('baselineScope', options.baselineScope);
      if (options.limit) searchParams.set('limit', options.limit.toString());

      const url = `/api/funds/${fundId}/alerts${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
      return apiRequest<{ success: boolean; data: Alert[]; count: number }>('GET', url);
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
      return apiRequest<{ success: boolean; data: VarianceDashboard }>(
        'GET',
        `/api/funds/${fundId}/variance-dashboard`
      );
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
      return apiRequest<{ success: boolean; data: Baseline }>(
        'POST',
        `/api/funds/${params.fundId}/baselines`,
        {
          name: params.name,
          description: params.description,
          baselineType: params.baselineType,
          periodStart: params.periodStart,
          periodEnd: params.periodEnd,
          tags: params.tags || [],
        }
      );
    },
    onSuccess: (_data, variables) => {
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
    mutationFn: async (params: { fundId: number; baselineId: string }) => {
      return apiRequest<{ success: boolean; data: Baseline }>(
        'POST',
        `/api/funds/${params.fundId}/baselines/${params.baselineId}/set-default`,
        {}
      );
    },
    onError: (error: unknown) => {
      toast({
        title: 'Could not set default baseline',
        description:
          error instanceof ApiError && error.status === 403
            ? 'Setting the default baseline requires a partner or admin role.'
            : 'The default baseline was not changed. Try again or contact an admin.',
        variant: 'destructive',
      });
    },
    onSuccess: (_data, variables) => {
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
    mutationFn: async (params: { fundId: number; baselineId: string }) => {
      return apiRequest<{ success: boolean; message: string }>(
        'DELETE',
        `/api/funds/${params.fundId}/baselines/${params.baselineId}`,
        {}
      );
    },
    onSuccess: (_data, variables) => {
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
      return apiRequest<{ success: boolean; data: VarianceReport }>(
        'POST',
        `/api/funds/${params.fundId}/variance-reports`,
        params
      );
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['/api/funds', variables.fundId, 'variance-reports'],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/funds', variables.fundId, 'variance-dashboard'],
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
      ruleType: 'threshold';
      metricName: AlertMetricName;
      operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'between';
      thresholdValue: number;
      secondaryThreshold?: number;
      severity?: 'info' | 'warning' | 'critical' | 'urgent';
      category?: 'performance' | 'risk' | 'operational' | 'compliance';
      checkFrequency?: 'realtime' | 'hourly' | 'daily' | 'weekly';
      suppressionPeriod?: number;
      notificationChannels?: Array<'email' | 'slack' | 'webhook'>;
    }) => {
      return apiRequest<{ success: boolean; data: AlertRule }>(
        'POST',
        `/api/funds/${params.fundId}/alert-rules`,
        params
      );
    },
    onSuccess: (_data, variables) => {
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
    mutationFn: async (params: { alertId: string; notes?: string }) => {
      return apiRequest<{ success: boolean; data: Alert }>(
        'POST',
        `/api/alerts/${params.alertId}/acknowledge`,
        {
          notes: params.notes,
        }
      );
    },
    onSuccess: () => {
      // Invalidate all alert queries
      queryClient.invalidateQueries({
        queryKey: ['/api/funds'],
        predicate: (query) => {
          const key = query.queryKey as unknown[];
          return key.includes('alerts');
        },
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
    mutationFn: async (params: { alertId: string; notes?: string }) => {
      return apiRequest<{ success: boolean; data: Alert }>(
        'POST',
        `/api/alerts/${params.alertId}/resolve`,
        {
          notes: params.notes,
        }
      );
    },
    onSuccess: () => {
      // Invalidate all alert queries
      queryClient.invalidateQueries({
        queryKey: ['/api/funds'],
        predicate: (query) => {
          const key = query.queryKey as unknown[];
          return key.includes('alerts');
        },
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
    mutationFn: async (params: { fundId: number; baselineId?: string; reportName?: string }) => {
      return apiRequest<{
        success: boolean;
        data: { report: VarianceReport; alertsGenerated: Alert[]; alertCount: number };
      }>('POST', `/api/funds/${params.fundId}/variance-analysis`, params);
    },
    onSuccess: (_data, variables) => {
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
