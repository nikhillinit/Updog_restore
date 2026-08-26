import type { QueryClient } from '@tanstack/react-query';

/**
 * Invalidate every cache entry that depends on a fund's portfolio company rows.
 *
 * Any mutation that creates/edits/deletes companies or changes their amounts
 * must call this so the server-computed portfolio overview (KPIs) cannot go
 * stale alongside the companies list. Centralised so future mutation sites stay
 * covered by construction.
 *
 * TanStack Query matches query keys by prefix, so passing a `fundId` also
 * invalidates the asOf-scoped overview variants (`['portfolio-overview', fundId, asOf]`).
 */
export function invalidatePortfolioData(queryClient: QueryClient, fundId?: number): void {
  queryClient.invalidateQueries({ queryKey: ['portfolio-companies'] });
  queryClient.invalidateQueries({
    queryKey: fundId === undefined ? ['portfolio-overview'] : ['portfolio-overview', fundId],
  });
  queryClient.invalidateQueries({
    queryKey: fundId === undefined ? ['allocations', 'latest'] : ['allocations', 'latest', fundId],
  });
}
