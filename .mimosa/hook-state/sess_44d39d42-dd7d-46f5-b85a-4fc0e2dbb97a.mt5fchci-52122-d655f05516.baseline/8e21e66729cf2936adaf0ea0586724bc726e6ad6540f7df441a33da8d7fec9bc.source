import type { ContextRailItem, ContextRailSection } from './context-rail-types';

export interface ContextRailInput {
  /** ISO timestamp from the unified metrics layer (`metrics.actual.asOfDate`). */
  asOfDate?: string | null;
}

/** "As of Apr 24, 2026" in UTC; null when the timestamp is missing/invalid. */
function formatFreshness(asOfDate: string): string | null {
  const date = new Date(asOfDate);
  if (Number.isNaN(date.getTime())) return null;
  const formatted = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return `As of ${formatted}`;
}

/**
 * Build the canonical rail sections from the data available today. Only
 * freshness can be honestly populated; attention/activity stay explicit empty
 * states until their backends land (do not fabricate items).
 */
export function buildContextRailSections(input: ContextRailInput): ContextRailSection[] {
  const freshnessItems: ContextRailItem[] = [];
  if (input.asOfDate) {
    const detail = formatFreshness(input.asOfDate);
    if (detail) {
      freshnessItems.push({
        id: 'freshness-metrics',
        kind: 'freshness',
        label: 'Fund metrics',
        detail,
      });
    }
  }

  return [
    {
      id: 'freshness',
      title: 'Freshness',
      items: freshnessItems,
      emptyText: 'No freshness signal yet.',
    },
    {
      id: 'attention',
      title: 'Needs attention',
      items: [],
      emptyText: 'No blockers or due items surfaced yet.',
    },
    {
      id: 'activity',
      title: 'Recent activity',
      items: [],
      emptyText: 'No recent activity yet.',
    },
  ];
}
