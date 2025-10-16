import { Router } from "express";
import { cspMetrics } from "../../telemetry";

const router = Router();

router["post"]("/csp-violations", (req: any, res: any) => {
  try {
    // Requests may be JSON with { "csp-report": { ... } } or Report-To batch
    const body = (req.body ?? {}) as any;
    console.warn("[CSP] violation", body);
    cspMetrics.violations.inc?.();
    // TODO: forward to logs/metrics sink
  } catch {}
  res.sendStatus(204);
});

export const cspReportRoute = router;