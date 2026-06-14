/**
 * Impact display semantics.
 *
 * Maps a financial impact (direction + severity) to canonical token classes.
 * Trust rule: adverse impact is never styled favorable (green). Consumers pair
 * these classes with a non-color cue (a lucide TrendingUp/TrendingDown icon
 * and/or a signed value) so impact is never conveyed by color alone.
 */

export type ImpactDirection = 'favorable' | 'unfavorable' | 'neutral';
export type ImpactSeverity = 'low' | 'medium' | 'high';

export type ImpactDisplay = {
  direction: ImpactDirection;
  severity: ImpactSeverity;
};

/** Text color for an impact value. */
export function getImpactTextClass({ direction, severity }: ImpactDisplay): string {
  if (direction === 'favorable') return 'text-presson-positive';
  if (direction === 'unfavorable' && severity === 'high') return 'text-presson-negative';
  if (direction === 'unfavorable') return 'text-presson-warning';
  return 'text-charcoal-900';
}

/** Badge/chip styling keyed to severity (not direction). */
export function getImpactBadgeClass(severity: ImpactSeverity): string {
  if (severity === 'high') return 'border-error/40 bg-error/10 text-error-dark';
  if (severity === 'medium') return 'border-warning/40 bg-warning/10 text-warning-dark';
  return 'border-charcoal-200 bg-pov-gray text-charcoal-700';
}
