import { cn } from '@/lib/utils';
import type { DualForecastTrustCounts } from '@shared/contracts/dual-forecast/dual-forecast-response.contract';
import {
  BLENDED_NAV_LABEL,
  formatChipAriaLabel,
  formatDecimalMillions,
  TRUST_FILTER_KEYS,
  TRUST_STATE_COPY,
  type TrustFilterKey,
} from '@/lib/dual-forecast-display';

/**
 * DR1 calm-Partial ramp: muted tinted pills extending the SourceBadge idiom.
 * Partial is the dominant expected state on sparse-marks funds, so it reads
 * neutral sand; warning gold is reserved for the currency-blocked state that
 * actually withholds money. Shared with the attribution table cells so the
 * chip vocabulary stays identical across the page.
 */
export const TRUST_CHIP_CLASSES: Record<TrustFilterKey, string> = {
  LIVE: 'bg-success/10 text-success-dark border-success/50',
  PARTIAL: 'bg-presson-highlight/60 text-pov-charcoal border-beige-200',
  UNAVAILABLE: 'bg-warning/10 text-warning-dark border-warning/50',
  FAILED: 'bg-presson-negative/10 text-presson-negative border-presson-negative/40',
  NO_FACTS: 'bg-transparent text-presson-textMuted border-beige-200',
};

interface TrustStateCountsProps {
  blendedNav: string;
  counts: DualForecastTrustCounts;
  noFactsCount: number;
  activeFilter: TrustFilterKey | null;
  onFilterChange: (filter: TrustFilterKey | null) => void;
}

export function TrustStateCounts({
  blendedNav,
  counts,
  noFactsCount,
  activeFilter,
  onFilterChange,
}: TrustStateCountsProps) {
  const chipCounts: Record<TrustFilterKey, number> = {
    LIVE: counts.LIVE,
    PARTIAL: counts.PARTIAL,
    UNAVAILABLE: counts.UNAVAILABLE,
    FAILED: counts.FAILED,
    NO_FACTS: noFactsCount,
  };

  return (
    <div>
      <p className="flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums text-pov-charcoal">
          {formatDecimalMillions(blendedNav)}
        </span>
        <span className="text-sm text-charcoal-600">{BLENDED_NAV_LABEL}</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Trust state filters">
        {TRUST_FILTER_KEYS.map((key) => {
          const count = chipCounts[key];
          const isActive = activeFilter === key;

          return (
            <button
              key={key}
              type="button"
              disabled={count === 0}
              aria-pressed={isActive}
              aria-label={formatChipAriaLabel(count, key)}
              onClick={() => onFilterChange(isActive ? null : key)}
              className={cn(
                'inline-flex min-h-[44px] items-center rounded-full border px-2.5 text-xs font-medium transition-colors sm:min-h-0 sm:py-0.5',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-presson-accent/30 focus-visible:ring-offset-2',
                TRUST_CHIP_CLASSES[key],
                isActive && 'border-presson-accent ring-1 ring-presson-accent/60',
                count === 0 && 'opacity-50'
              )}
            >
              {count} {TRUST_STATE_COPY[key].label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
