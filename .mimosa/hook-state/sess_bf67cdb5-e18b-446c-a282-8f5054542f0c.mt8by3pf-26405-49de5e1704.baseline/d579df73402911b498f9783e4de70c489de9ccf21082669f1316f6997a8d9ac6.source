/**
 * LP Reporting -- Mark confidence mix (Phase 1b.4).
 *
 * Surfaces the `markConfidenceMix` block of `LpMetricRunResults` as
 * three labeled badges (high / medium / low) with a footnote
 * explaining the LP-side import policy:
 *
 *   "Imported marks default to confidence=low (design 8.6)."
 *
 * Pure presentation -- no formatting state, no data fetching.
 *
 * @module client/components/lp-reporting/MarkConfidenceMix
 */

import { Badge } from '@/components/ui/badge';
import type { MarkConfidenceMix as MarkConfidenceMixData } from '@shared/contracts/lp-reporting';

export interface MarkConfidenceMixProps {
  mix: MarkConfidenceMixData;
}

interface BucketMeta {
  key: 'high' | 'medium' | 'low';
  label: string;
  variant: 'default' | 'secondary' | 'outline';
  testId: string;
}

const BUCKETS: ReadonlyArray<BucketMeta> = [
  { key: 'high', label: 'High', variant: 'default', testId: 'confidence-mix-high' },
  { key: 'medium', label: 'Medium', variant: 'secondary', testId: 'confidence-mix-medium' },
  { key: 'low', label: 'Low', variant: 'outline', testId: 'confidence-mix-low' },
];

export function MarkConfidenceMix({ mix }: MarkConfidenceMixProps) {
  const total = mix.high + mix.medium + mix.low;

  return (
    <div
      data-testid="mark-confidence-mix"
      className="rounded-md border border-input bg-background p-4 space-y-3"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold font-inter text-charcoal">Mark confidence mix</h3>
        <span className="text-xs text-charcoal/60 font-poppins" data-testid="confidence-mix-total">
          {total} mark{total === 1 ? '' : 's'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3" data-testid="confidence-mix-bars">
        {BUCKETS.map((bucket) => {
          const count = mix[bucket.key];
          return (
            <div
              key={bucket.key}
              data-testid={bucket.testId}
              className="flex flex-col items-center gap-1 rounded-md bg-secondary/30 p-3"
            >
              <Badge variant={bucket.variant}>{bucket.label}</Badge>
              <span
                className="text-2xl font-bold font-inter text-charcoal"
                data-testid={`${bucket.testId}-count`}
              >
                {count}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-charcoal/60 font-poppins" data-testid="confidence-mix-footnote">
        Imported marks default to confidence=low (design 8.6).
      </p>
    </div>
  );
}

export default MarkConfidenceMix;
