/**
 * useCohortAnalysis Hook
 *
 * Hook for fetching and managing cohort analysis data.
 * Provides access to cohort analysis results, unmapped sectors, and definitions.
 *
 * @module client/hooks/useCohortAnalysis
 */

import type { UseQueryResult, UseMutationResult } from '@tanstack/react-query';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CohortAnalyzeRequest,
  CohortAnalyzeResponse,
  VintageGranularity,
  CohortUnit,
} from '@shared/types';
import { useFundContext } from '@/contexts/FundContext';

// ============================================================================
// Types
// ============================================================================

interface CohortDefinition {
  id: number;
  fundId: number;
  name: string;
  vintageGranularity: VintageGranularity;
  sectorTaxonomyVersion: string;
  unit: CohortUnit;
  isDefault: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface UnmappedSector {
  rawValue: string;
  rawValueNormalized: string;
  companyCount: number;
}

interface UnmappedSectorsResponse {
  fundId: number;
  taxonomyVersion: string;
  unmappedCount: number;
  unmapped: UnmappedSector[];
}

interface CohortDefinitionsResponse {
  fundId: number;
  count: number;
  definitions: CohortDefinition[];
}

interface SectorMappingInput {
  rawValue: string;
  canonicalSectorId: string;
  confidenceScore?: number;
}

interface BulkMappingsRequest {
  fundId: number;
  taxonomyVersion: string;
  mappings: SectorMappingInput[];
}

interface BulkMappingsResult {
  created: number;
  updated: number;
  errors: Array<{ rawValue: string; error: string }>;
}

interface UseCohortAnalysisOptions {
  /** Cohort definition ID to use (UUID string) */
  cohortDefinitionId?: string | undefined;
  /** Filter by sector IDs (UUID strings) */
  sectorIds?: string[] | undefined;
  /** Date range for analysis */
  dateRange?: {
    start?: string | undefined;
    end?: string | undefined;
  } | undefined;
  /** Filter by investment stages */
  stages?: string[] | undefined;
  /** Enable/disable the query */
  enabled?: boolean;
}

// ============================================================================
// Main Hook - Cohort Analysis
// ============================================================================

/**
 * Hook for running cohort analysis
 *
 * @example
 * ```tsx
 * function CohortDashboard() {
 *   const { data, isLoading, error } = useCohortAnalysis();
 *
 *   if (isLoading) return <LoadingSpinner />;
 *   if (error) return <ErrorMessage error={error} />;
 *
 *   return (
 *     <CohortHeatMap
 *       rows={data.rows}
 *       vintageOrder={data.vintageOrder}
 *       sectorOrder={data.sectorOrder}
 *     />
 *   );
 * }
 * ```
 */
export function useCohortAnalysis(
  options: UseCohortAnalysisOptions = {}
): UseQueryResult<CohortAnalyzeResponse, Error> {
  const { fundId } = useFundContext();
  const {
    cohortDefinitionId,
    sectorIds,
    dateRange,
    stages,
    enabled = true,
  } = options;

  return useQuery<CohortAnalyzeResponse, Error>({
    queryKey: [
      'cohort-analysis',
      fundId,
      {
        cohortDefinitionId,
        sectorIds,
        dateRange,
        stages,
      },
    ],
    queryFn: async () => {
      if (!fundId) {
        throw new Error('No fund ID available');
      }

      const request: CohortAnalyzeRequest = {
        fundId,
        cohortDefinitionId,
        sectorIds,
        dateRange,
        stages,
      };

      const response = await fetch('/api/cohorts/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `HTTP ${response.status}: Failed to run cohort analysis`
        );
      }

      return response.json();
    },
    enabled: enabled && !!fundId,
    staleTime: 60_000, // Consider data fresh for 1 minute
    gcTime: 600_000, // Keep in cache for 10 minutes
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });
}

// ============================================================================
// Unmapped Sectors Hook
// ============================================================================

/**
 * Hook for fetching unmapped sectors
 */
export function useUnmappedSectors(
  taxonomyVersion = 'v1'
): UseQueryResult<UnmappedSectorsResponse, Error> {
  const { fundId } = useFundContext();

  return useQuery<UnmappedSectorsResponse, Error>({
    queryKey: ['unmapped-sectors', fundId, taxonomyVersion],
    queryFn: async () => {
      if (!fundId) {
        throw new Error('No fund ID available');
      }

      const params = new URLSearchParams({
        fundId: String(fundId),
        taxonomyVersion,
      });

      const response = await fetch(`/api/cohorts/unmapped?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `HTTP ${response.status}: Failed to fetch unmapped sectors`
        );
      }

      return response.json();
    },
    enabled: !!fundId,
    staleTime: 30_000,
    gcTime: 300_000,
  });
}

// ============================================================================
// Cohort Definitions Hook
// ============================================================================

interface UseCohortDefinitionsOptions {
  unit?: CohortUnit | undefined;
  includeArchived?: boolean;
}

/**
 * Hook for fetching cohort definitions
 */
export function useCohortDefinitions(
  options: UseCohortDefinitionsOptions = {}
): UseQueryResult<CohortDefinitionsResponse, Error> {
  const { fundId } = useFundContext();
  const { unit, includeArchived = false } = options;

  return useQuery<CohortDefinitionsResponse, Error>({
    queryKey: ['cohort-definitions', fundId, { unit, includeArchived }],
    queryFn: async () => {
      if (!fundId) {
        throw new Error('No fund ID available');
      }

      const params = new URLSearchParams({
        fundId: String(fundId),
        includeArchived: String(includeArchived),
      });

      if (unit) {
        params.append('unit', unit);
      }

      const response = await fetch(`/api/cohorts/definitions?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `HTTP ${response.status}: Failed to fetch cohort definitions`
        );
      }

      return response.json();
    },
    enabled: !!fundId,
    staleTime: 60_000,
    gcTime: 300_000,
  });
}

// ============================================================================
// Mutations
// ============================================================================

/**
 * Hook for bulk upserting sector mappings
 */
export function useUpsertSectorMappings(): UseMutationResult<
  BulkMappingsResult,
  Error,
  BulkMappingsRequest
> {
  const queryClient = useQueryClient();
  const { fundId } = useFundContext();

  return useMutation<BulkMappingsResult, Error, BulkMappingsRequest>({
    mutationFn: async (request) => {
      const response = await fetch('/api/cohorts/sector-mappings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `HTTP ${response.status}: Failed to update sector mappings`
        );
      }

      return response.json();
    },
    onSuccess: (_data, variables) => {
      // Invalidate related queries
      if (fundId) {
        queryClient.invalidateQueries({
          queryKey: ['unmapped-sectors', fundId],
        });
        queryClient.invalidateQueries({
          queryKey: ['cohort-analysis', fundId],
        });
      }
    },
  });
}

/**
 * Hook for creating a cohort definition
 */
export function useCreateCohortDefinition(): UseMutationResult<
  CohortDefinition,
  Error,
  {
    name: string;
    vintageGranularity?: VintageGranularity;
    sectorTaxonomyVersion?: string;
    unit?: CohortUnit;
    isDefault?: boolean;
  }
> {
  const queryClient = useQueryClient();
  const { fundId } = useFundContext();

  return useMutation<
    CohortDefinition,
    Error,
    {
      name: string;
      vintageGranularity?: VintageGranularity;
      sectorTaxonomyVersion?: string;
      unit?: CohortUnit;
      isDefault?: boolean;
    }
  >({
    mutationFn: async (input) => {
      if (!fundId) {
        throw new Error('No fund ID available');
      }

      const response = await fetch('/api/cohorts/definitions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fundId,
          ...input,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `HTTP ${response.status}: Failed to create cohort definition`
        );
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate definitions query
      if (fundId) {
        queryClient.invalidateQueries({
          queryKey: ['cohort-definitions', fundId],
        });
      }
    },
  });
}

/**
 * Hook for seeding cohort normalization data
 */
export function useSeedCohortData(): UseMutationResult<
  {
    message: string;
    fundId: number;
    taxonomyVersion: string;
    sectorsCreated: number;
    mappingsCreated: number;
    definitionsCreated: number;
  },
  Error,
  void
> {
  const queryClient = useQueryClient();
  const { fundId } = useFundContext();

  return useMutation({
    mutationFn: async () => {
      if (!fundId) {
        throw new Error('No fund ID available');
      }

      const response = await fetch('/api/cohorts/seed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fundId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `HTTP ${response.status}: Failed to seed cohort data`
        );
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate all cohort queries
      if (fundId) {
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey[0];
            return (
              typeof key === 'string' &&
              (key.startsWith('cohort-') || key === 'unmapped-sectors')
            );
          },
        });
      }
    },
  });
}

// ============================================================================
// Utility Hooks
// ============================================================================

/**
 * Hook for invalidating cohort analysis cache
 */
export function useInvalidateCohortAnalysis() {
  const queryClient = useQueryClient();
  const { fundId } = useFundContext();

  const invalidate = async () => {
    if (!fundId) return;

    await queryClient.invalidateQueries({
      queryKey: ['cohort-analysis', fundId],
    });
  };

  return { invalidate };
}
