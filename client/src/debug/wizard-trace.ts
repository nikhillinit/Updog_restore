export function traceWizard(
  event: string,
  detail?: unknown,
  opts?: { component?: string }
) {
  const env = import.meta.env as Record<string, string | undefined>;
  if (env['VITE_WIZARD_DEBUG'] !== '1') return;
  const entry = {
    ts: new Date().toISOString(),
    t: Math.round(performance.now()), // ms since navigationStart
    event,
    component: opts?.component,
    detail: sanitize(detail),
  };
  // Log a single JSON object for easy copy/paste/parse
  // Use `WIZARD` marker so it's easy to filter in Console
  console.log('WIZARD', entry);
}

function sanitize(v: unknown) {
  try {
    const s = JSON.stringify(v);
    if (!s) {
      return v;
    }
    if (s.length <= 140) {
      return JSON.parse(s);
    }
    return `${s.slice(0, 140)}…`;
  } catch {
    return String(v);
  }
}
