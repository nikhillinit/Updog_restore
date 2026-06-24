/**
 * Shared portfolio-company status helpers.
 *
 * `isExitedStatus` is the single source of truth for "is this company exited?".
 * Lifted from the former inline copy in
 * `client/src/components/portfolio/tabs/OverviewTab.tsx` so the server-side
 * overview aggregator and the client render the exact same classification
 * (parity by construction). Behaviour is intentionally case-insensitive and
 * whitespace-trimming, matching the original inline logic.
 */

const EXITED_STATUSES = new Set(['exited', 'closed', 'liquidated']);

export function isExitedStatus(status: string): boolean {
  return EXITED_STATUSES.has(status.trim().toLowerCase());
}
