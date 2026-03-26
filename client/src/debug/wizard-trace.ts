import { logger } from '@/lib/logger';

const MAX_SERIALIZED_DETAIL = 140;

export function traceWizard(
  event: string,
  detail?: unknown,
  opts?: { component?: string }
) {
  if (import.meta.env['VITE_WIZARD_DEBUG'] !== '1') return;
  const entry = {
    ts: new Date().toISOString(),
    t: Math.round(performance.now()), // ms since navigationStart
    event,
    component: opts?.component,
    detail: sanitize(detail),
  };
  logger.debug('WIZARD', entry);
}

function sanitize(v: unknown) {
  try {
    const serialized = JSON.stringify(v);
    if (!serialized || serialized.length <= MAX_SERIALIZED_DETAIL) {
      return v;
    }

    return `${serialized.slice(0, MAX_SERIALIZED_DETAIL - 3)}...`;
  } catch {
    return String(v);
  }
}
