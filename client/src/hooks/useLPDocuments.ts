/**
 * useLPDocuments Hook
 *
 * Data fetching hook for LP documents with filtering and search.
 *
 * @module client/hooks/useLPDocuments
 */

import { useQuery } from '@tanstack/react-query';
import { useLPContext } from '@/contexts/LPContext';

// ============================================================================
// TYPES
// ============================================================================

export type DocumentType =
  | 'k1'
  | 'capital_statement'
  | 'quarterly_report'
  | 'annual_report'
  | 'subscription_agreement'
  | 'side_letter'
  | 'legal'
  | 'tax'
  | 'other';

export interface LPDocument {
  id: string;
  fundId: number;
  fundName: string;
  documentType: DocumentType;
  title: string;
  description: string | null;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  reportingPeriod: string | null;
  taxYear: number | null;
  isConfidential: boolean;
  createdAt: string;
  downloadUrl: string;
}

export interface DocumentsResponse {
  documents: LPDocument[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number;
}

interface UseLPDocumentsOptions {
  fundId?: number;
  documentType?: DocumentType;
  search?: string;
  limit?: number;
  enabled?: boolean;
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook for fetching LP documents
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useLPDocuments({
 *   documentType: 'k1',
 *   limit: 10,
 * });
 * ```
 */
export function useLPDocuments(options: UseLPDocumentsOptions = {}) {
  const { lpId } = useLPContext();
  const { fundId, documentType, search, limit = 10, enabled = true } = options;

  return useQuery<DocumentsResponse, Error>({
    queryKey: ['lp-documents', lpId, fundId, documentType, search, limit],
    queryFn: async () => {
      if (!lpId) {
        throw new Error('No LP ID available');
      }

      const params = new URLSearchParams();
      params.append('lpId', lpId.toString());
      if (fundId) params.append('fundId', fundId.toString());
      if (documentType) params.append('documentType', documentType);
      if (search) params.append('search', search);
      params.append('limit', limit.toString());

      const response = await fetch(`/api/lp/documents?${params.toString()}`);

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(errorData.message || `HTTP ${response.status}: Failed to fetch documents`);
      }

      return response.json() as Promise<DocumentsResponse>;
    },
    enabled: enabled && !!lpId,
    staleTime: 300_000, // 5 minutes
    gcTime: 600_000, // 10 minutes
    refetchOnWindowFocus: false,
    retry: 2,
  });
}

/**
 * Hook for fetching recent documents for dashboard widget
 */
export function useLPRecentDocuments(options: { limit?: number; enabled?: boolean } = {}) {
  const { lpId } = useLPContext();
  const { limit = 5, enabled = true } = options;

  return useQuery<{
    recentDocuments: LPDocument[];
    totalDocuments: number;
    hasNewDocuments: boolean;
  }>({
    queryKey: ['lp-recent-documents', lpId, limit],
    queryFn: async () => {
      if (!lpId) {
        throw new Error('No LP ID available');
      }

      const response = await fetch(`/api/lp/documents?lpId=${lpId}&limit=${limit}`);

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(
          errorData.message || `HTTP ${response.status}: Failed to fetch recent documents`
        );
      }

      const data = (await response.json()) as DocumentsResponse;

      // Check if any documents are from the last 7 days
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const hasNewDocs = data.documents.some((d) => new Date(d.createdAt) > oneWeekAgo);

      return {
        recentDocuments: data.documents,
        totalDocuments: data.totalCount,
        hasNewDocuments: hasNewDocs,
      };
    },
    enabled: enabled && !!lpId,
    staleTime: 300_000,
    gcTime: 600_000,
    refetchOnWindowFocus: false,
    retry: 2,
  });
}
