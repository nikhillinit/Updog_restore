import { context, trace } from '@opentelemetry/api';

export function annotateCircuitSpan(state: string, details: Record<string, unknown> = {}) {
  const span = trace.getSpan(context.active());
  if (span) {
    span.setAttribute('cb.state', state);
    Object.entries(details).forEach(([k, v]) => span.setAttribute(`cb.${k}`, String(v)));
  }
}
