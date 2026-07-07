import type { DualForecastCurrentProjection } from '@shared/contracts/dual-forecast/dual-forecast-response.contract';
import { CURRENT_PROJECTION_NOTICE_COPY } from '@/lib/dual-forecast-display';

/**
 * Degraded-state disclosure for the Current-projection fallback (PRD #1020
 * PR-3): renders only when the projection engine failed and default
 * projections filled the future quarters. fallbackReason is nullable — the
 * null-reason copy never leaks the word "null".
 */
export function CurrentProjectionNotice({
  projection,
}: {
  projection: DualForecastCurrentProjection;
}) {
  if (projection.status !== 'fallback_default') {
    return null;
  }

  const reason =
    projection.fallbackReason != null
      ? `${CURRENT_PROJECTION_NOTICE_COPY.reasonPrefix}${projection.fallbackReason}`
      : CURRENT_PROJECTION_NOTICE_COPY.nullReason;

  return (
    <div role="status" className="mb-3 rounded-md border border-beige-200 bg-white px-3 py-2">
      <p className="text-sm font-medium text-pov-charcoal">
        {CURRENT_PROJECTION_NOTICE_COPY.headline}
      </p>
      <p className="mt-1 text-xs text-charcoal-600">
        {CURRENT_PROJECTION_NOTICE_COPY.body} {reason} {CURRENT_PROJECTION_NOTICE_COPY.escalation}
      </p>
    </div>
  );
}
