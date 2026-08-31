import type { ReactNode } from 'react';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useSearch } from 'wouter';
import { z } from 'zod';
import type {
  FinancialFactsPayloadV1,
  FinancialFactsPayloadV4,
} from '@shared/contracts/financial-facts-snapshot-v1.contract';
import { getErrorMessage } from '@/lib/http-response';
import { useDualForecast } from '@/hooks/useDualForecast';

export type WorkspaceViewPreset = 'gp' | 'analyst' | 'operations';

export interface FundWorkspaceContextValue {
  fundId: number;
  vehicleId: string | null;
  asOfDate: string | null;
  currentPlanVersionId: string | null;
  viewPreset: WorkspaceViewPreset;
  setViewPreset: (preset: WorkspaceViewPreset) => void;
}

const VIEW_PRESET_PARAM = 'viewPreset';

// Persisted policy 1.0.x payloads carry (always-empty) string term refs;
// policy 1.1.0+ payloads carry structured refs. The ingress union must accept
// every persisted contract variant. The imports above are TYPE-ONLY so the
// Node-only shared contract never reaches the client bundle; the annotation
// pins this schema's output inside the shared contract's ref union at
// typecheck time, and the parity suite
// (tests/unit/contract/financial-facts-latest-parity.test.tsx) runtime-parses
// every persisted policy version through this ingress.
type PersistedParticipationTermRef =
  | FinancialFactsPayloadV1['participationTermRefs'][number]
  | FinancialFactsPayloadV4['participationTermRefs'][number];

const ParticipationTermRefReadSchema: z.ZodType<PersistedParticipationTermRef> = z.union([
  z.string().min(1),
  z
    .object({
      participationId: z.number().int().positive(),
      participationVersion: z.number().int().positive(),
      financingTrancheId: z.number().int().positive(),
      trancheVersion: z.number().int().positive(),
    })
    .passthrough(),
]);

const FinancialFactsLatestReadSchema = z
  .object({
    asOfDate: z.string().date(),
    snapshotInputHash: z.string().regex(/^[a-f0-9]{64}$/),
    payload: z
      .object({
        sourceObservationIds: z.array(z.union([z.number().int().positive(), z.string().min(1)])),
        participationTermRefs: z.array(ParticipationTermRefReadSchema),
        vehicleRoster: z.array(
          z
            .object({
              vehicleId: z.number().int().positive(),
              vehicleType: z.enum(['main_fund', 'spv', 'co_invest']),
            })
            .passthrough()
        ),
      })
      .passthrough(),
  })
  .passthrough();

export type FinancialFactsLatestRead = z.infer<typeof FinancialFactsLatestReadSchema>;

export const DEFAULT_FUND_WORKSPACE_CONTEXT: FundWorkspaceContextValue = {
  fundId: 0,
  vehicleId: null,
  asOfDate: null,
  currentPlanVersionId: null,
  viewPreset: 'gp',
  setViewPreset: () => undefined,
};

const FundWorkspaceContext = createContext<FundWorkspaceContextValue>(
  DEFAULT_FUND_WORKSPACE_CONTEXT
);

export const financialFactsLatestQueryKey = (fundId: number | null) =>
  ['financial-facts-latest', fundId] as const;

export async function fetchLatestFinancialFactsSnapshot(
  fundId: number
): Promise<FinancialFactsLatestRead | null> {
  const response = await fetch(`/api/funds/${fundId}/financial-facts/latest`, {
    credentials: 'include',
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorData: unknown = await response.json().catch(() => null);
    throw new Error(
      getErrorMessage(errorData) || `HTTP ${response.status}: Failed to fetch financial facts`
    );
  }

  return FinancialFactsLatestReadSchema.parse(await response.json());
}

function parseViewPreset(value: string | null): WorkspaceViewPreset {
  if (value === 'analyst' || value === 'operations') {
    return value;
  }
  return 'gp';
}

function normalizeSearch(search: string): string {
  return search.startsWith('?') ? search.slice(1) : search;
}

export function FundWorkspaceProvider({
  fundId,
  children,
}: {
  /**
   * Resolved route fund id for the mounting surface — null when the route
   * fund is missing, invalid, or rejected by the page's own scope check.
   * The provider never reads the ambient FundContext fund: a route-scoped
   * page rejecting one fund must not surface another fund's rail.
   */
  fundId: number | null;
  children: ReactNode;
}) {
  const [location, setLocation] = useLocation();
  const search = useSearch();
  const urlViewPreset = parseViewPreset(
    new URLSearchParams(normalizeSearch(search)).get(VIEW_PRESET_PARAM)
  );
  const [viewPreset, setViewPresetState] = useState<WorkspaceViewPreset>(urlViewPreset);

  const dualForecastQuery = useDualForecast(fundId);
  const factsQuery = useQuery<FinancialFactsLatestRead | null, Error>({
    queryKey: financialFactsLatestQueryKey(fundId),
    enabled: fundId != null,
    queryFn: async () => {
      if (fundId == null) {
        return null;
      }
      return fetchLatestFinancialFactsSnapshot(fundId);
    },
    staleTime: 60_000,
    gcTime: 600_000,
    retry: false,
  });

  useEffect(() => {
    setViewPresetState(urlViewPreset);
  }, [urlViewPreset]);

  const setViewPreset = useCallback(
    (preset: WorkspaceViewPreset) => {
      setViewPresetState(preset);

      const nextSearch = new URLSearchParams(normalizeSearch(search));
      if (preset === 'gp') {
        nextSearch.delete(VIEW_PRESET_PARAM);
      } else {
        nextSearch.set(VIEW_PRESET_PARAM, preset);
      }

      const serializedSearch = nextSearch.toString();
      if (serializedSearch === normalizeSearch(search)) {
        return;
      }

      setLocation(serializedSearch ? `${location}?${serializedSearch}` : location);
    },
    [location, search, setLocation]
  );

  const vehicleId = useMemo(() => {
    const mainFundVehicles = (factsQuery.data?.payload.vehicleRoster ?? []).filter(
      (vehicle) => vehicle.vehicleType === 'main_fund'
    );

    return mainFundVehicles.length === 1 ? String(mainFundVehicles[0]!.vehicleId) : null;
  }, [factsQuery.data]);

  const value = useMemo<FundWorkspaceContextValue>(
    () => ({
      fundId: fundId ?? DEFAULT_FUND_WORKSPACE_CONTEXT.fundId,
      vehicleId,
      asOfDate: dualForecastQuery.data?.currentForecastV2?.asOfDate ?? null,
      currentPlanVersionId: dualForecastQuery.data?.currentForecastV2?.currentPlanVersionId ?? null,
      viewPreset,
      setViewPreset,
    }),
    [dualForecastQuery.data, fundId, setViewPreset, vehicleId, viewPreset]
  );

  return <FundWorkspaceContext.Provider value={value}>{children}</FundWorkspaceContext.Provider>;
}

export function useFundWorkspaceContext(): FundWorkspaceContextValue {
  return useContext(FundWorkspaceContext);
}
