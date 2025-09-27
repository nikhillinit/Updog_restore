import { Router } from "express";
import { cspMetrics } from "../../telemetry";

export const cspReportRoute = Router().post("/csp-violations", (req, res) => {
  try {
    // Requests may be JSON with { "csp-report": { ... } } or Report-To batch
    const body = (req.body ?? {}) as any;
    console.warn("[CSP] violation", body);
    cspMetrics.violations.inc?.();
    // TODO: forward to logs/metrics sink
  } catch {}
  res.sendStatus(204);
});