import { useQuery } from '@tanstack/react-query';

import type {
  CurrentPositionListV1,
  CurrentPositionListV1 as CurrentPositionList,
  CurrentPositionQuery,
} from '@shared/contracts/investment-ledger/current-position.contract';
import { useFundContext } from '@/contexts/FundContext';
import {
  buildErrorMessage,
  readApiErrorBody,
  readJsonResponse,
} from '@/components/portfolio/tabs/hooks/jsonResponse';

export interface UseCurrentPositionsOptions {
  vehicleId?: number | undefined;
  companyIdentityId?: number | undefined;
  asOfDate?: string | undefined;
  enabled?: boolean;
}

function buildCurrentPositionsUrl(fundId: number, query: CurrentPositionQuery): string {
  const params = new URLSearchParams();

  if (query.vehicleId !== undefined) {
    params.set('vehicleId', String(query.vehicleId));
  }

  if (query.companyIdentityId !== undefined) {
    params.set('companyIdentityId', String(query.companyIdentityId));
  }

  if (query.asOfDate !== undefined) {
    params.set('asOfDate', query.asOfDate);
  }

  const queryString = params.toString();
  return `/api/funds/${fundId}/investment-ledger/positions${queryString ? `?${queryString}` : ''}`;
}

export function useCurrentPositions(options: UseCurrentPositionsOptions = {}) {
  const { fundId } = useFundContext();
  const {
    vehicleId,
    companyIdentityId,
    asOfDate,
    enabled = true,
  } = options;

  return useQuery<CurrentPositionListV1, Error>({
    queryKey: ['investment-ledger', 'positions', fundId, { vehicleId, companyIdentityId, asOfDate }],
    queryFn: async () => {
      if (!fundId) {
        throw new Error('Fund ID is required.');
      }

      const response = await fetch(
        buildCurrentPositionsUrl(fundId, {
          ...(vehicleId !== undefined ? { vehicleId } : {}),
          ...(companyIdentityId !== undefined ? { companyIdentityId } : {}),
          ...(asOfDate !== undefined ? { asOfDate } : {}),
        })
      );

      if (!response.ok) {
        const errorData = await readApiErrorBody(response, 'Failed to fetch current positions');
        throw new Error(buildErrorMessage(errorData, 'Failed to fetch current positions'));
      }

      return readJsonResponse<CurrentPositionList>(response, 'Failed to fetch current positions');
    },
    enabled: enabled && !!fundId,
    staleTime: 60_000,
  });
}

export type { CurrentPositionListV1 as CurrentPositionListResponse };