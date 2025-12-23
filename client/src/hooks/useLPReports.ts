/**
 * useLPReports Hook
 *
 * Data fetching and mutation hooks for LP report generation and retrieval.
 *
 * @module client/hooks/useLPReports
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLPContext } from '@/contexts/LPContext';
import type {
  ReportListResponse,
  ReportGenerationRequest,
  ReportGenerationResponse,
  GeneratedReport,
  ReportType,
} from '@shared/types/lp-api';

// ============================================================================
// LIST HOOK
// ============================================================================

interface UseLPReportsOptions {
  fundId?: number;
  reportType?: ReportType;
  startDate?: string;
  endDate?: string;
  limit?: number;
  enabled?: boolean;
}

/**
 * Hook for fetching list of generated LP reports
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useLPReports({
 *   fundId: 1,
 *   reportType: 'quarterly_statement',
 *   limit: 10,
 * });
 * ```
 */
export function useLPReports(options: UseLPReportsOptions = {}) {
  const { lpId } = useLPContext();
  const { fundId, reportType, startDate, endDate, limit = 20, enabled = true } = options;

  return useQuery<ReportListResponse, Error>({
    queryKey: ['lp-reports', lpId, fundId, reportType, startDate, endDate, limit],
    queryFn: async () => {
      if (!lpId) {
        throw new Error('No LP ID available');
      }

      const params = new URLSearchParams({ limit: limit.toString() });
      if (fundId) params.append('fundId', fundId.toString());
      if (reportType) params.append('reportType', reportType);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const response = await fetch(`/api/lp/reports?lpId=${lpId}&${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: Failed to fetch reports`);
      }

      return response.json();
    },
    enabled: enabled && !!lpId,
    staleTime: 60_000, // 1 minute
    gcTime: 300_000, // 5 minutes
    refetchOnWindowFocus: false,
    retry: 2,
  });
}

// ============================================================================
// GENERATION HOOK
// ============================================================================

/**
 * Hook for generating new LP reports
 *
 * @example
 * ```tsx
 * const { mutate, isPending } = useGenerateLPReport();
 *
 * mutate({
 *   reportType: 'quarterly_statement',
 *   format: 'pdf',
 *   fundIds: [1, 2],
 *   startDate: '2024-01-01',
 *   endDate: '2024-03-31',
 * });
 * ```
 */
export function useGenerateLPReport() {
  const { lpId } = useLPContext();
  const queryClient = useQueryClient();

  return useMutation<ReportGenerationResponse, Error, ReportGenerationRequest>({
    mutationFn: async (request: ReportGenerationRequest) => {
      if (!lpId) {
        throw new Error('No LP ID available');
      }

      const response = await fetch(`/api/lp/reports/generate?lpId=${lpId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: Failed to generate report`);
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate reports list to show the new report
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0] as string;
          return key === 'lp-reports' && query.queryKey[1] === lpId;
        },
      });
    },
  });
}

// ============================================================================
// REPORT STATUS HOOK
// ============================================================================

interface UseLPReportStatusOptions {
  reportId: string;
  enabled?: boolean;
  pollInterval?: number;
}

/**
 * Hook for polling LP report generation status
 *
 * Automatically polls until report is ready or failed.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useLPReportStatus({
 *   reportId: 'abc123',
 *   pollInterval: 2000, // Poll every 2 seconds
 * });
 * ```
 */
export function useLPReportStatus(options: UseLPReportStatusOptions) {
  const { lpId } = useLPContext();
  const { reportId, enabled = true, pollInterval = 3000 } = options;

  return useQuery<GeneratedReport, Error>({
    queryKey: ['lp-report-status', lpId, reportId],
    queryFn: async () => {
      if (!lpId) {
        throw new Error('No LP ID available');
      }

      const response = await fetch(`/api/lp/reports/${reportId}/status?lpId=${lpId}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: Failed to fetch report status`);
      }

      return response.json();
    },
    enabled: enabled && !!lpId && !!reportId,
    refetchInterval: (query) => {
      // Stop polling when report is ready or failed
      const status = query.state.data?.status;
      if (status === 'ready' || status === 'failed') {
        return false;
      }
      return pollInterval;
    },
    staleTime: 0, // Always fetch fresh status
    retry: 2,
  });
}

// ============================================================================
// DOWNLOAD HOOK
// ============================================================================

/**
 * Hook for downloading generated LP reports
 *
 * @example
 * ```tsx
 * const { mutate: downloadReport, isPending } = useDownloadLPReport();
 *
 * downloadReport('abc123');
 * ```
 */
export function useDownloadLPReport() {
  const { lpId } = useLPContext();

  return useMutation<Blob, Error, string>({
    mutationFn: async (reportId: string) => {
      if (!lpId) {
        throw new Error('No LP ID available');
      }

      const response = await fetch(`/api/lp/reports/${reportId}/download?lpId=${lpId}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: Failed to download report`);
      }

      return response.blob();
    },
    onSuccess: (blob, reportId) => {
      // Trigger browser download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${reportId}.pdf`; // Default filename
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
  });
}
