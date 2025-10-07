import { Router } from "express";

export function makeHealthRouter(opts: {
  dbAvailable: boolean;
  cache: "memory" | "redis" | "valkey" | "none";
  queuesEnabled: boolean;
}) {
  const router = Router();

  router.get("/healthz", (_req, res) => {
    res.json({
      up: true,
      db: opts.dbAvailable ? "ok" : "skipped",
      cache: opts.cache,
      queues: opts.queuesEnabled ? "enabled" : "disabled",
      ts: new Date().toISOString(),
    });
  });

  router.get("/readyz", (_req, res) => {
    const ready = opts.queuesEnabled ? opts.dbAvailable : true;
    res.status(ready ? 200 : 503).json({
      ready,
      needsDb: opts.queuesEnabled,
      dbAvailable: opts.dbAvailable,
      ts: new Date().toISOString(),
    });
  });

  return router;
}
