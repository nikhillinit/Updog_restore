/**
 * Sensitivity routes -- Phase 1A
 *
 * Fund-scoped endpoints that drive the one-way sensitivity workflow:
 *   POST /api/funds/:id/sensitivity/one-way   -- run a sweep
 *   GET  /api/funds/:id/sensitivity/runs      -- paginated history
 *   GET  /api/funds/:id/sensitivity/runs/:runId -- single run by id
 *
 * Service and engine modules are loaded via dynamic import inside each
 * handler so unit tests can substitute them with `vi.mock(...)` against
 * the resolved specifier and so the router has no top-level side effects.
 *
 * @module server/routes/sensitivity
 */

import { Router, type Request, type Response } from 'express';
import {
  OneWayAnalysisRequestV1Schema,
  SensitivityRunKindSchema,
} from '@shared/contracts/sensitivity-run-v1.contract';

/**
 * Maps SensitivityEngineError codes to HTTP status codes.
 * Unknown codes (including ENGINE_FAILURE catch-all) fall back to 500.
 *
 * When adding a new SensitivityEngineError code, add an entry HERE
 * AND a row to tests/unit/routes/sensitivity-routes-error-mapping.test.ts.
 * Codes without an entry silently fall through to 500.
 */
const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  NO_PUBLISHED_CONFIG: 409, // resource not in publishable form
  INVALID_PUBLISHED_CONFIG: 422, // resource exists but unprocessable
  UNSUPPORTED_VARIABLE_PATH: 400, // client requested unmappable path
  METRIC_PATH_NOT_FOUND: 500, // engine output mismatch (server bug)
  METRIC_NOT_NUMBER: 500, // engine output mismatch (server bug)
  ENGINE_FAILURE: 500, // catch-all
};

const router = Router();

router.post('/funds/:id/sensitivity/one-way', async (req: Request, res: Response) => {
  const fundId = parseInt(String(req.params['id'] ?? ''), 10);
  if (!Number.isInteger(fundId) || fundId <= 0) {
    return res.status(400).json({
      code: 'INVALID_FUND_ID',
      message: 'fund id must be a positive integer',
    });
  }

  const parsed = OneWayAnalysisRequestV1Schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      code: 'INVALID_PARAMS',
      message: 'request body failed validation',
      issues: parsed.error.issues,
    });
  }

  const { sensitivityRunService } = await import('../services/sensitivity-run-service');
  const { oneWaySensitivityEngine, SensitivityEngineError } =
    await import('../services/one-way-sensitivity-engine');

  const userId = (req as Request & { user?: { id?: number } }).user?.id ?? 0;
  const startedAt = Date.now();

  const run = await sensitivityRunService.createPending(fundId, 'one_way', parsed.data, userId);

  try {
    const result = await oneWaySensitivityEngine.runOneWaySensitivity(fundId, parsed.data);
    const durationMs = Date.now() - startedAt;
    const completedRun = await sensitivityRunService.markCompleted(run.id, result, durationMs);
    return res.status(200).json({ run: completedRun, result });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const code = err instanceof SensitivityEngineError ? err.code : 'ENGINE_FAILURE';
    const message = err instanceof Error ? err.message : 'Unknown engine failure';
    await sensitivityRunService.markFailed(run.id, code, message, durationMs);
    const status = STATUS_BY_CODE[code] ?? 500;
    return res.status(status).json({ code, message });
  }
});

router.get('/funds/:id/sensitivity/runs', async (req: Request, res: Response) => {
  const fundId = parseInt(String(req.params['id'] ?? ''), 10);
  if (!Number.isInteger(fundId) || fundId <= 0) {
    return res.status(400).json({
      code: 'INVALID_FUND_ID',
      message: 'fund id must be a positive integer',
    });
  }

  const kindParam = req.query['kind'];
  const kindParse = kindParam ? SensitivityRunKindSchema.safeParse(kindParam) : null;
  if (kindParse && !kindParse.success) {
    return res.status(400).json({
      code: 'INVALID_KIND',
      message: 'kind must be one_way, two_way, or stress',
    });
  }

  const limitRaw = parseInt(String(req.query['limit'] ?? '20'), 10);
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20;

  let cursor: { createdAt: string; id: number } | undefined;
  if (req.query['cursorCreatedAt'] && req.query['cursorId']) {
    const cursorId = parseInt(String(req.query['cursorId']), 10);
    if (Number.isInteger(cursorId)) {
      cursor = { createdAt: String(req.query['cursorCreatedAt']), id: cursorId };
    }
  }

  const { sensitivityRunService } = await import('../services/sensitivity-run-service');

  // Build the options object explicitly so exactOptionalPropertyTypes is happy.
  const opts: {
    kind?: 'one_way' | 'two_way' | 'stress';
    limit: number;
    cursor?: { createdAt: string; id: number };
  } = { limit };
  if (kindParse?.success) opts.kind = kindParse.data;
  if (cursor) opts.cursor = cursor;

  const runs = await sensitivityRunService.getHistoryByFund(fundId, opts);
  return res.status(200).json({ runs });
});

router.get('/funds/:id/sensitivity/runs/:runId', async (req: Request, res: Response) => {
  const fundId = parseInt(String(req.params['id'] ?? ''), 10);
  const runId = parseInt(String(req.params['runId'] ?? ''), 10);
  if (!Number.isInteger(fundId) || fundId <= 0) {
    return res.status(400).json({ code: 'INVALID_FUND_ID' });
  }
  if (!Number.isInteger(runId) || runId <= 0) {
    return res.status(400).json({ code: 'INVALID_RUN_ID' });
  }

  const { sensitivityRunService } = await import('../services/sensitivity-run-service');
  const run = await sensitivityRunService.getById(fundId, runId);
  if (!run) {
    return res.status(404).json({ code: 'RUN_NOT_FOUND' });
  }
  return res.status(200).json({ run });
});

export default router;
