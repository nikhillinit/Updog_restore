import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * The single generic renderer for decision-state badges (design decision D-G).
 * Knows nothing about MOIC/FMV/facts semantics: domain surfaces map their own
 * vocabulary (labels, remediation copy) onto these three generic states.
 */
export type DecisionState = 'actionable' | 'indicative' | 'not_actionable';

export interface DecisionStateBadgeProps {
  state: DecisionState;
  /** Domain label override; defaults to the canonical state label. */
  label?: string;
  /** Remediation/reason copy shown in a keyboard-reachable tooltip, in order. */
  details?: readonly string[];
  ariaLabel?: string;
  /** Prefix for data-testid hooks (`<prefix>-dot`). */
  testIdPrefix?: string;
}

const CANONICAL_LABELS: Record<DecisionState, string> = {
  actionable: 'Actionable',
  indicative: 'Indicative',
  not_actionable: 'Not actionable',
};

export function DecisionStateBadge({
  state,
  label,
  details,
  ariaLabel,
  testIdPrefix = 'decision-state',
}: DecisionStateBadgeProps) {
  const resolvedLabel = label ?? CANONICAL_LABELS[state];
  // D-A quiet badge: actionable = full ink; everything else = muted label.
  const labelClass = state === 'actionable' ? 'text-pov-charcoal' : 'text-presson-textMuted';
  const hasDetails = details !== undefined && details.length > 0;

  const badge = (
    <span
      {...(hasDetails ? { tabIndex: 0 } : {})}
      {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
      className={`inline-flex items-center gap-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal-400 focus-visible:ring-offset-2 ${labelClass}`}
    >
      {state === 'indicative' ? (
        <span
          aria-hidden="true"
          data-testid={`${testIdPrefix}-dot`}
          className="h-2 w-2 rounded-full border border-warning/50 bg-warning/10"
        />
      ) : state === 'not_actionable' ? (
        <span
          aria-hidden="true"
          data-testid={`${testIdPrefix}-dot`}
          className="h-2 w-2 rounded-full border border-charcoal-400 bg-transparent"
        />
      ) : null}
      {resolvedLabel}
    </span>
  );

  if (!hasDetails) {
    return badge;
  }

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent className="max-w-sm motion-reduce:animate-none motion-reduce:transition-none">
          <ul className="space-y-1">
            {details.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
