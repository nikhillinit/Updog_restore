import type { DualForecastCurrentForecastV2 } from '@shared/contracts/dual-forecast/dual-forecast-response.contract';
import { buildHeldNotice } from '@/lib/dual-forecast-display';

/**
 * Held-serving disclosure (PLAN_61 Task 13.2, R24/D9): the current-forecast
 * plane is serving the pinned reference forecast, not a live calculation.
 * Renders only for a held block, with the typed incident reason and the age
 * of the pinned result; muted styling per DESIGN.md - state disclosure, not
 * an alarm surface.
 */
export function CurrentForecastHeldNotice({
  block,
}: {
  block: DualForecastCurrentForecastV2 | null | undefined;
}) {
  const notice = buildHeldNotice(block);
  if (notice === null) {
    return null;
  }

  return (
    <div role="status" className="mb-3 rounded-md border border-beige-200 bg-white px-3 py-2">
      <p className="text-sm font-medium text-pov-charcoal">{notice.headline}</p>
      <p className="mt-1 text-xs text-charcoal-600">
        {notice.body} {notice.reason} {notice.age}. {notice.escalation}
      </p>
    </div>
  );
}
