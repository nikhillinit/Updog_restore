/**
 * Truthful alert-summary state for the variance dashboard.
 *
 * The page previously used `dashboardData?.data?.summary?.totalActiveAlerts || 0`,
 * which collapses an API failure (undefined) into a valid-looking `0` and renders
 * "Stable" / "No active alerts". For an LP/GP-facing surface that is a fabricated
 * fact. This module makes the distinction explicit so the UI can render LOADING /
 * FAILED / UNAVAILABLE instead of a fake zero.
 */
export type AlertSummaryState =
  | { state: 'LOADING' }
  | { state: 'FAILED'; message: string }
  | { state: 'UNAVAILABLE'; reason: string }
  | { state: 'LIVE'; count: number };

export interface AlertSummaryInput {
  isLoading: boolean;
  isError: boolean;
  totalActiveAlerts: number | null | undefined;
}

export function deriveAlertSummaryState(input: AlertSummaryInput): AlertSummaryState {
  if (input.isLoading) {
    return { state: 'LOADING' };
  }
  if (input.isError) {
    return { state: 'FAILED', message: 'Unable to load alert summary.' };
  }
  if (typeof input.totalActiveAlerts !== 'number' || !Number.isFinite(input.totalActiveAlerts)) {
    return { state: 'UNAVAILABLE', reason: 'No alert summary available yet.' };
  }
  return { state: 'LIVE', count: input.totalActiveAlerts };
}
