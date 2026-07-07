import { FACTS_UNAVAILABLE_NOTICE_COPY } from '@/lib/dual-forecast-display';

/**
 * Disclosed unblended state (ADR-028 disclose-not-block): the facts fetch
 * failed, so the series falls back to the legacy calculator NAV. Replaces
 * the blended-NAV figure + trust chips slot in the Fund Value Forecast
 * header; render never blocks.
 */
export function FactsUnavailableNotice() {
  return (
    <div role="status" className="rounded-md border border-beige-200 bg-white px-3 py-2">
      <p className="text-sm font-medium text-pov-charcoal">
        {FACTS_UNAVAILABLE_NOTICE_COPY.headline}
      </p>
      <p className="mt-1 text-xs text-charcoal-600">{FACTS_UNAVAILABLE_NOTICE_COPY.body}</p>
    </div>
  );
}
