/**
 * useLPCapitalCalls Hook
 *
 * Data fetching hook for LP capital calls with pagination and filtering.
 *
 * @module client/hooks/useLPCapitalCalls
 */

import { useQuery } from '@tanstack/react-query';
import { useLPContext } from '@/contexts/LPContext';

// ============================================================================
// TYPES
// ============================================================================

export interface CapitalCall {
  id: string;
  fundId: number;
  fundName: string;
  callNumber: number;
  callAmount: string; // Cents as string
  dueDate: string;
  callDate: string;
  purpose: string | null;
  status: 'pending' | 'due' | 'overdue' | 'paid' | 'partial';
  paidAmount: string;
}

export interface CapitalCallsResponse {
  calls: CapitalCall[];
  nextCursor: string | null;
  hasMore: boolean;
  totalPending: number;
  totalPendingAmount: string;
}

interface UseLPCapitalCallsOptions {
  status?: 'pending' | 'due' | 'overdue' | 'paid' | 'partial';
  fundId?: number;
  limit?: number;
  enabled?: boolean;
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook for fetching LP capital calls
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useLPCapitalCalls({
 *   status: 'pending',
 *   limit: 5,
 * });
 * ```
 */
export function useLPCapitalCalls(options: UseLPCapitalCallsOptions = {}) {
  const { lpId } = useLPContext();
  const { status, fundId, limit = 10, enabled = true } = options;

  return useQuery<CapitalCallsResponse, Error>({
    queryKey: ['lp-capital-calls', lpId, status, fundId, limit],
    queryFn: async () => {
      if (!lpId) {
        throw new Error('No LP ID available');
      }

      const params = new URLSearchParams();
      params.append('lpId', lpId.toString());
      if (status) params.append('status', status);
      if (fundId) params.append('fundId', fundId.toString());
      params.append('limit', limit.toString());

      const response = await fetch(`/api/lp/capital-calls?${params.toString()}`);

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(
          errorData.message || `HTTP ${response.status}: Failed to fetch capital calls`
        );
      }

      return response.json() as Promise<CapitalCallsResponse>;
    },
    enabled: enabled && !!lpId,
    staleTime: 60_000, // 1 minute - capital calls change frequently
    gcTime: 300_000, // 5 minutes
    refetchOnWindowFocus: true,
    retry: 2,
  });
}

/**
 * Hook for fetching capital call summary metrics (for dashboard widget)
 */
export function useLPCapitalCallsSummary(options: { enabled?: boolean } = {}) {
  const { lpId } = useLPContext();
  const { enabled = true } = options;

  return useQuery<{
    totalPending: number;
    totalPendingAmount: string;
    totalDue: number;
    totalDueAmount: string;
    totalOverdue: number;
    totalOverdueAmount: string;
    nextDueDate: string | null;
  }>({
    queryKey: ['lp-capital-calls-summary', lpId],
    queryFn: async () => {
      if (!lpId) {
        throw new Error('No LP ID available');
      }

      // Fetch pending calls to get summary
      const response = await fetch(`/api/lp/capital-calls?lpId=${lpId}&limit=100`);

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(
          errorData.message || `HTTP ${response.status}: Failed to fetch capital calls summary`
        );
      }

      const data = (await response.json()) as CapitalCallsResponse;

      // Calculate summary from calls
      const pending = data.calls.filter((c) => c.status === 'pending');
      const due = data.calls.filter((c) => c.status === 'due');
      const overdue = data.calls.filter((c) => c.status === 'overdue');

      const sumAmount = (calls: CapitalCall[]) =>
        calls.reduce((sum, c) => sum + BigInt(c.callAmount) - BigInt(c.paidAmount), 0n);

      // Find next due date from pending/due calls
      const activeCalls = [...pending, ...due].sort(
        (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      );

      return {
        totalPending: pending.length,
        totalPendingAmount: sumAmount(pending).toString(),
        totalDue: due.length,
        totalDueAmount: sumAmount(due).toString(),
        totalOverdue: overdue.length,
        totalOverdueAmount: sumAmount(overdue).toString(),
        nextDueDate: activeCalls[0]?.dueDate || null,
      };
    },
    enabled: enabled && !!lpId,
    staleTime: 60_000,
    gcTime: 300_000,
    refetchOnWindowFocus: true,
    retry: 2,
  });
}
