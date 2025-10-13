
import type { FundRawData } from '@core/types';
export async function fetchFundData(fundId: string, asOf?: string): Promise<FundRawData> {
  const url = new URL(`/api/funds/${fundId}/kpis`, window.location.origin);
  if (asOf) url.searchParams.set('asOf', asOf);
  const res = await fetch(url.toString(), { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`fetchFundData failed ${res.status}`);
  return res.json() as Promise<FundRawData>;
}
