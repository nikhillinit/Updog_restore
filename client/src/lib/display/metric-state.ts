/**
 * Metric availability state.
 *
 * A metric tile must show a number, an explicit zero, or a stable `—` — never a
 * clipped explanatory sentence. The reason for unavailability lives in `detail`
 * (surfaced via tooltip/title by the consumer), not in the value slot.
 */

export type MetricState =
  | { kind: 'available'; value: number | string; detail?: string }
  | { kind: 'zero'; value: number | string; detail?: string }
  | { kind: 'not_applicable'; detail: string }
  | { kind: 'insufficient_history'; detail: string }
  | { kind: 'stale'; value: number | string; detail: string }
  | { kind: 'error'; detail: string };

/** The value to render in the tile. Unavailable states render an em dash. */
export function metricDisplayValue(state: MetricState): string {
  if (state.kind === 'available' || state.kind === 'zero' || state.kind === 'stale') {
    return String(state.value);
  }
  return '—';
}

/** The explanatory detail (for tooltip/title), if any. */
export function metricDisplayDetail(state: MetricState): string | undefined {
  return 'detail' in state ? state.detail : undefined;
}
