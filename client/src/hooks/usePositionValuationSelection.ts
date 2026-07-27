import { useQuery } from '@tanstack/react-query';

import type { PositionValuationSelectionV1 } from '@shared/contracts/investment-ledger/current-position.contract';
import { useFundContext } from '@/contexts/FundContext';
import {
  buildErrorMessage,
  readApiErrorBody,
  readJsonResponse,
} from '@/components/portfolio/tabs/hooks/jsonResponse';

export interface UsePositionValuationSelectionOptions {
  vehicleId?: number | undefined;
  companyIdentityId?: number | undefined;
  companyId?: number | undefined;
  asOfDate?: string | undefined;
  enabled?: boolean;
}

export interface PositionValuationSelectionQueryInput {
  vehicleId: number;
  companyIdentityId: number;
  companyId: number;
  asOfDate: string;
}

function buildValuationSelectionUrl(fundId: number, query: PositionValuationSelectionQueryInput): string {
  const params = new URLSearchParams({
    vehicleId: String(query.vehicleId),
    companyIdentityId: String(query.companyIdentityId),
    companyId: String(query.companyId),
    asOfDate: query.asOfDate,
  });
  return `/api/funds/${fundId}/investment-ledger/position-valuations?${params.toString()}`;
}

export function usePositionValuationSelection(options: UsePositionValuationSelectionOptions = {}) {
  const { fundId } = useFundContext();
  const {
    vehicleId,
    companyIdentityId,
    companyId,
    asOfDate,
    enabled = true,
  } = options;

  const shouldRun =
    enabled &&
    !!fundId &&
    vehicleId !== undefined &&
    companyIdentityId !== undefined &&
    companyId !== undefined &&
    asOfDate !== undefined;

  return useQuery<PositionValuationSelectionV1, Error>({
    queryKey: [
      'investment-ledger',
      'position-valuation',
      fundId,
      { vehicleId, companyIdentityId, companyId, asOfDate },
    ],
    queryFn: async () => {
      if (!fundId) {
        throw new Error('Fund ID is required.');
      }
      if (
        vehicleId === undefined ||
        companyIdentityId === undefined ||
        companyId === undefined ||
        asOfDate === undefined
      ) {
        throw new Error('Complete position valuation scope is required.');
      }

      const response = await fetch(
        buildValuationSelectionUrl(fundId, {
          vehicleId,
          companyIdentityId,
          companyId,
          asOfDate,
        })
      );

      if (!response.ok) {
        const errorData = await readApiErrorBody(response, 'Failed to fetch position valuation');
        throw new Error(buildErrorMessage(errorData, 'Failed to fetch position valuation'));
      }

      return readJsonResponse<PositionValuationSelectionV1>(
        response,
        'Failed to fetch position valuation'
      );
    },
    enabled: shouldRun,
    staleTime: 60_000,
  });
}

export type { PositionValuationSelectionV1 };
