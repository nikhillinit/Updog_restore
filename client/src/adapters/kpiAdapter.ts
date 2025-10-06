/**
 * KPI ADAPTER LAYER
 *
 * Maps Zod-validated API responses to selector input format.
 * Keeps UI selectors decoupled from Zod schemas.
 *
 * Architecture: API (Zod) → Adapter → Selectors (Pure) → UI
 */

import type { z } from 'zod';
import type { KPIRawFactsResponseSchema } from '@shared/contracts/kpi-selector.contract';
import type { FundRawData } from '@/core/types/fund';

type KPIApiResponse = z.infer<typeof KPIRawFactsResponseSchema>;

/**
 * Adapts API response to selector input format
 * @param apiResponse - Zod-validated API response
 * @returns Selector-compatible raw data
 */
export function mapKpiResponseToSelectorInput(
  apiResponse: KPIApiResponse
): FundRawData {
  return {
    fundId: apiResponse.fundId,
    asOf: apiResponse.asOf,
    committed: apiResponse.committed,
    // Schema only has scalar 'called', not 'capitalCalls' array - create single-element array
    capitalCalls: [{
      date: apiResponse.asOf,
      amount: apiResponse.called,
    }],
    // Schema has 'distributions' as a number, not an array - create single-element array
    distributions: [{
      date: apiResponse.asOf,
      amount: apiResponse.distributions,
    }],
    // Schema only has scalar 'nav', not 'navSeries' array - create single-element array
    navSeries: [{
      date: apiResponse.asOf,
      value: apiResponse.nav,
    }],
    // Schema doesn't include investments array - return empty
    investments: [],
  };
}

/**
 * Type guard for API response validation
 */
export function isValidKpiResponse(
  data: unknown
): data is KPIApiResponse {
  try {
    const { KPIRawFactsResponseSchema } = require('@shared/contracts/kpi-selector.contract');
    KPIRawFactsResponseSchema.parse(data);
    return true;
  } catch {
    return false;
  }
}
