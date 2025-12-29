import { logger } from "@/lib/logger";

export function emitWizard(event: Record<string, unknown>) {
  const enriched = {
    ...event,
    timestamp: Date.now(),
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : undefined,
    viewport:
      typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : undefined,
  };

  try {
    const body = JSON.stringify(enriched);
    const beaconsSupported =
      typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function';
    const ok = beaconsSupported
      ? navigator.sendBeacon('/api/telemetry/wizard', new Blob([body], { type: 'application/json' }))
      : false;

    if (!ok) {
      fetch('/api/telemetry/wizard', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true,
      }).catch((fetchError) => {
        // Log telemetry failures for observability but don't block user flow
        logger.debug("wizard_telemetry_fetch_failed", { error: fetchError instanceof Error ? fetchError.message : String(fetchError) });
      });
    }

    logger.info("wizard_telemetry", enriched);
  } catch (err) {
    logger.error("wizard_telemetry_error", err instanceof Error ? err : new Error(String(err)));
  }
}