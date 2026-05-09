/**
 * LP Reporting -- Import dry-run + commit routes.
 *
 * Four protected POST endpoints:
 *   POST /api/funds/:fundId/imports/ledger/dry-run
 *   POST /api/funds/:fundId/imports/valuation-marks/dry-run
 *   POST /api/funds/:fundId/imports/ledger/commit            (Phase 1c.2)
 *   POST /api/funds/:fundId/imports/valuation-marks/commit   (Phase 1c.2)
 *
 * Middleware chain:
 *   requireAuth() -> requireFundAccess -> rateLimit(20/hour/user)
 *   [-> auditLog -> idempotency -> handler]  (commit endpoints only)
 *
 * Body: JSON `{ sourceType: "csv" | "notion", payload: <base64>, ... }`.
 * Valuation mark imports support `csv` only until a Notion mark mapping exists.
 *
 * @module server/routes/lp-reporting/imports
 * @see docs/adr/ADR-011-decimal-string-api-convention.md
 */

import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import { requireAuth, requireFundAccess } from '../../lib/auth/jwt';
import { firstString } from '../../lib/request-values';
import { auditLog } from '../../middleware/auditLog';
import { idempotency } from '../../middleware/idempotency';
import { db } from '../../db';
import {
  ImportDryRunRequestSchema,
  ImportDryRunResponseSchema,
  LedgerImportCommitRequestSchema,
  ValuationMarkImportCommitRequestSchema,
} from '@shared/contracts/lp-reporting';
import {
  runLedgerDryRun,
  runValuationMarkDryRun,
} from '../../services/lp-reporting/import-reconciliation-service';
import {
  commitLedgerImport,
  commitValuationMarkImport,
  EmptyPayloadError,
  PreviewDriftError,
  type DrizzleDb,
} from '../../services/lp-reporting/import-commit-service';

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

/**
 * Resolve the authenticated user's id as an integer for createdBy. The
 * JWT user.id is a string ('sub'); legacy mocks set a numeric userId.
 * Falls back to NaN -> 0 for environments where neither is populated;
 * in production both branches are populated by requireAuth().
 */
function resolveUserIdInt(req: Request): number {
  const u = req.user as (typeof req.user & { userId?: number }) | undefined;
  if (u?.userId !== undefined && Number.isFinite(u.userId)) {
    return u.userId;
  }
  if (u?.id !== undefined) {
    const parsed = Number.parseInt(String(u.id), 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
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

// ---------------------------------------------------------------------------
// Commit endpoints (Phase 1c.2)
// ---------------------------------------------------------------------------

router.post(
  '/api/funds/:fundId/imports/ledger/commit',
  requireAuth(),
  requireFundAccess,
  importLimiter,
  auditLog({ includeBody: false }),
  // 24h TTL: long enough that an LP-facing client can replay after a
  // browser restart, short enough to bound the dedup window.
  idempotency({ ttl: 86400, prefix: 'lp-reporting:ledger-commit' }),
  async (req: Request, res: Response, next: NextFunction) => {
    const fundId = Number.parseInt(firstString(req.params['fundId']) ?? '', 10);

    const parsedBody = LedgerImportCommitRequestSchema.safeParse({
      ...(req.body as Record<string, unknown>),
      fundId,
    });
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'INVALID_BODY',
        message: 'Body must conform to LedgerImportCommitRequestSchema.',
        issues: parsedBody.error.issues,
      });
    }

    try {
      const result = await commitLedgerImport(parsedBody.data, {
        db: db as unknown as DrizzleDb,
        userId: resolveUserIdInt(req),
      });
      return res.status(200).json(result);
    } catch (err) {
      if (err instanceof PreviewDriftError) {
        return res.status(409).json(err.toJSON());
      }
      if (err instanceof EmptyPayloadError) {
        return res.status(400).json({
          error: 'EMPTY_PAYLOAD',
          message: 'Decoded CSV contains no rows.',
        });
      }
      if (err instanceof Error && err.message.startsWith('MALFORMED_PAYLOAD')) {
        return res.status(400).json({
          error: 'MALFORMED_PAYLOAD',
          message: err.message,
        });
      }
      return next(err);
    }
  }
);

router.post(
  '/api/funds/:fundId/imports/valuation-marks/commit',
  requireAuth(),
  requireFundAccess,
  importLimiter,
  auditLog({ includeBody: false }),
  idempotency({ ttl: 86400, prefix: 'lp-reporting:valuation-mark-commit' }),
  async (req: Request, res: Response, next: NextFunction) => {
    const fundId = Number.parseInt(firstString(req.params['fundId']) ?? '', 10);

    const parsedBody = ValuationMarkImportCommitRequestSchema.safeParse({
      ...(req.body as Record<string, unknown>),
      fundId,
    });
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'INVALID_BODY',
        message: 'Body must conform to ValuationMarkImportCommitRequestSchema.',
        issues: parsedBody.error.issues,
      });
    }

    try {
      const result = await commitValuationMarkImport(parsedBody.data, {
        db: db as unknown as DrizzleDb,
        userId: resolveUserIdInt(req),
      });
      return res.status(200).json(result);
    } catch (err) {
      if (err instanceof PreviewDriftError) {
        return res.status(409).json(err.toJSON());
      }
      if (err instanceof EmptyPayloadError) {
        return res.status(400).json({
          error: 'EMPTY_PAYLOAD',
          message: 'Decoded CSV contains no rows.',
        });
      }
      if (err instanceof Error && err.message.startsWith('MALFORMED_PAYLOAD')) {
        return res.status(400).json({
          error: 'MALFORMED_PAYLOAD',
          message: err.message,
        });
      }
      return next(err);
    }
  }
);

export default router;
