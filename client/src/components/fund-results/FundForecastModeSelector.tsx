import { Button } from '@/components/ui/button';
import type { ForecastBasis, ScenarioOverlay } from './financial-evidence';

const BASIS_LABELS: Record<ForecastBasis, string> = {
  construction: 'Construction',
  current: 'Current',
};

const BASES: readonly ForecastBasis[] = ['construction', 'current'];

export interface ForecastBasisControlProps {
  value: ForecastBasis;
  onChange?: (basis: ForecastBasis) => void;
  /** Per-basis disable reason; a disabled basis always shows its reason (D-C). */
  disabledBases?: Partial<Record<ForecastBasis, string>>;
  /** Locked by an applied scenario overlay; shows the lock reason. */
  locked?: boolean;
  /** 'indicator' renders the static "Basis: <x>" form for single-basis surfaces. */
  variant?: 'segmented' | 'indicator';
}

/**
 * Ink-only segmented control for the two-axis forecast model (D-E). Selected
 * state uses the charcoal accent, never a status hue. Controlled and pure --
 * URL/data wiring happens in Wave 9B1.
 */
export function ForecastBasisControl({
  value,
  onChange,
  disabledBases,
  locked = false,
  variant = 'segmented',
}: ForecastBasisControlProps) {
  if (variant === 'indicator') {
    return (
      <p className="text-xs font-medium text-pov-charcoal">{`Basis: ${BASIS_LABELS[value]}`}</p>
    );
  }

  const disabledReasons = BASES.flatMap((basis) => {
    const reason = disabledBases?.[basis];
    return reason === undefined ? [] : [{ basis, reason }];
  });

  return (
    <div>
      <span className="text-xs uppercase text-presson-textMuted">Forecast basis</span>
      <div
        role="radiogroup"
        aria-label="Forecast basis"
        className="mt-1 inline-flex items-center gap-0.5 rounded-md border border-beige-200 p-0.5"
      >
        {BASES.map((basis) => {
          const selected = value === basis;
          const disabled = locked || disabledBases?.[basis] !== undefined;
          return (
            <button
              key={basis}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => {
                if (!selected) {
                  onChange?.(basis);
                }
              }}
              className={`rounded px-3 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                selected
                  ? 'bg-pov-charcoal text-pov-white'
                  : 'text-presson-textMuted hover:text-pov-charcoal'
              }`}
            >
              {BASIS_LABELS[basis]}
            </button>
          );
        })}
      </div>
      {locked ? (
        <p className="mt-1 text-xs text-presson-textMuted">Locked by selected scenario</p>
      ) : null}
      {disabledReasons.map(({ basis, reason }) => (
        <p key={basis} className="mt-1 text-xs text-presson-textMuted">
          {`${BASIS_LABELS[basis]}: ${reason}`}
        </p>
      ))}
    </div>
  );
}

export interface ScenarioOverlayControlProps {
  overlay: ScenarioOverlay;
  onClear: () => void;
}

/**
 * Discloses the applied saved-scenario overlay (D-E). NEVER renders a scenario
 * without its basis label; renders nothing when no overlay is applied.
 */
export function ScenarioOverlayControl({ overlay, onClear }: ScenarioOverlayControlProps) {
  if (overlay.kind !== 'saved') {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-xs text-presson-textMuted">
        {`Scenario: ${overlay.name} — based on ${BASIS_LABELS[overlay.baseBasis]} · as of `}
        <span className="tabular-nums">{overlay.baseAsOfDate}</span>
      </p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-pov-charcoal motion-reduce:transition-none"
        aria-label={`Clear scenario ${overlay.name}`}
        onClick={onClear}
      >
        Clear
      </Button>
    </div>
  );
}
