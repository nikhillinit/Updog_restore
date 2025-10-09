/**
 * KPI ADAPTER LAYER
 *
 * Maps Zod-validated API responses to selector input format.
 * Keeps UI selectors decoupled from Zod schemas.
 *
 * Architecture: API (Zod) -> Adapter -> Selectors (Pure) -> UI
 */

import type { z } from 'zod';
import type { KPIRawFactsResponseSchema } from '@shared/contracts/kpi-raw-facts.contract';
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
    capitalCalls: apiResponse.capitalCalls.map(call => ({
      date: call.date,
      amount: call.amount,
    })),
    distributions: apiResponse.distributions.map(dist => ({
      date: dist.date,
      amount: dist.amount,
    })),
    navSeries: apiResponse.navSeries.map(nav => ({
      date: nav.date,
      value: nav.value,
    })),
    investments: apiResponse.investments.map(inv => {
      const baseInvestment = {
        id: inv.id ?? `inv-${Date.now()}`, // Generate if missing
        companyName: inv.companyName,
        initialAmount: inv.initialAmount,
      };

      return {
        ...baseInvestment,
        ...(inv.followOns !== undefined ? { followOns: inv.followOns } : {}),
        ...(inv.realized !== undefined ? { realized: inv.realized } : {}),
        ...(inv.nav !== undefined ? { nav: inv.nav } : {}),
        ...(inv.cashflows !== undefined ? { cashflows: inv.cashflows } : {}),
      };
    }),
  };
}

/**
 * Type guard for API response validation
 */
export function isValidKpiResponse(
  data: unknown
): data is KPIApiResponse {
  try {
    const { KPIRawFactsResponseSchema } = require('@shared/contracts/kpi-raw-facts.contract');
    KPIRawFactsResponseSchema.parse(data);
    return true;
  } catch {
    return false;
  }
}

