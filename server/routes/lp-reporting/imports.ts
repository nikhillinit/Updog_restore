/**
 * LP Reporting -- Import dry-run routes.
 *
 * Two protected POST endpoints. NO commit endpoints (Phase 1 work).
 * NO database writes anywhere on this code path.
 *
 *   POST /api/funds/:fundId/imports/ledger/dry-run
 *   POST /api/funds/:fundId/imports/valuation-marks/dry-run
 *
 * Middleware chain (existing primitives only):
 *   requireAuth() -> requireFundAccess -> rateLimit(20/hour/user)
 *   -> handler
 *
 * Body: JSON `{ sourceType: "csv" | "notion", payload: <base64> }`.
 * Valuation mark dry-runs support `csv` only until a Notion mark mapping exists.
 * Phase 0 uses a JSON wrapper with base64-encoded file content rather than
 * multipart/form-data so we don't drag in a multipart parser as a Phase 0
 * dependency. Phase 1 (commit endpoint) can switch to multipart if needed.
 *
 * @module server/routes/lp-reporting/imports
 * @see docs/adr/ADR-011-decimal-string-api-convention.md
 */

import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import { requireAuth, requireFundAccess } from '../../lib/auth/jwt';
import { firstString } from '../../lib/request-values';
import {
  ImportDryRunRequestSchema,
  ImportDryRunResponseSchema,
} from '@shared/contracts/lp-reporting';
import {
  runLedgerDryRun,
  runValuationMarkDryRun,
} from '../../services/lp-reporting/import-reconciliation-service';

const router = Router();

const valuationMarkImportBodySchema = ImportDryRunRequestSchema.extend({
  sourceType: z.literal('csv'),
});

const importLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: 'LP reporting imports are limited to 20 dry-runs per hour per user.',
  },
  keyGenerator: (req: Request) => {
    // Rate limiter runs after requireAuth; req.user.id is always set
    // on a request that reaches here. If somehow it's missing, bucket all
    // such requests under a single shared key so the limiter still
    // enforces the cap (rather than per-IP, which would invite IPv4 vs.
    // IPv6 bypass per express-rate-limit's ipKeyGenerator guidance).
    const userId = req.user?.id;
    return userId !== undefined ? `lp-reporting-import:${userId}` : 'lp-reporting-import:anon';
  },
});

function decodePayload(payload: string): Buffer {
  return Buffer.from(payload, 'base64');
}

router.post(
  '/api/funds/:fundId/imports/ledger/dry-run',
  requireAuth(),
  requireFundAccess,
  importLimiter,
  async (req: Request, res: Response) => {
    const parsedBody = ImportDryRunRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'INVALID_BODY',
        message: 'Body must contain sourceType and payload.',
        issues: parsedBody.error.issues,
      });
    }

    const fundId = Number.parseInt(firstString(req.params['fundId']) ?? '', 10);
    const buffer = decodePayload(parsedBody.data.payload);

    try {
      const result = runLedgerDryRun(buffer, parsedBody.data.sourceType, fundId);
      const validated = ImportDryRunResponseSchema.parse(result);
      return res.status(200).json(validated);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return res.status(500).json({
        error: 'IMPORT_DRY_RUN_FAILED',
        message,
      });
    }
  }
);

router.post(
  '/api/funds/:fundId/imports/valuation-marks/dry-run',
  requireAuth(),
  requireFundAccess,
  importLimiter,
  async (req: Request, res: Response) => {
    const parsedBody = valuationMarkImportBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'INVALID_BODY',
        message: 'Body must contain sourceType and payload.',
        issues: parsedBody.error.issues,
      });
    }

    const fundId = Number.parseInt(firstString(req.params['fundId']) ?? '', 10);
    const buffer = decodePayload(parsedBody.data.payload);

    try {
      const result = runValuationMarkDryRun(buffer, parsedBody.data.sourceType, fundId);
      const validated = ImportDryRunResponseSchema.parse(result);
      return res.status(200).json(validated);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return res.status(500).json({
        error: 'IMPORT_DRY_RUN_FAILED',
        message,
      });
    }
  }
);

export default router;
