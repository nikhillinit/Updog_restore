/**
 * LP Reporting -- Import dry-run and commit routes.
 *
 * Dry-run endpoints remain read-only. Commit endpoints re-run parsing from
 * the original payload and require a matching dry-run preview hash before
 * inserting eligible rows.
 *
 *   POST /api/funds/:fundId/imports/ledger/dry-run
 *   POST /api/funds/:fundId/imports/valuation-marks/dry-run
 *   POST /api/funds/:fundId/imports/ledger/commit
 *   POST /api/funds/:fundId/imports/valuation-marks/commit
 *
 * Middleware chain (existing primitives only):
 *   requireAuth() -> requireFundAccess -> rateLimit(20/hour/user)
 *   -> handler
 *
 * Dry-run body: JSON `{ sourceType: "csv" | "notion", payload: <base64> }`.
 * Commit body adds `previewHash`.
 * Valuation mark dry-runs support `csv` only until a Notion mark mapping exists.
 * The JSON wrapper keeps base64-encoded file content in the same transport
 * shape for dry-run and commit.
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
  ImportCommitRequestSchema,
  ImportCommitResponseSchema,
  ImportDryRunRequestSchema,
  ImportDryRunResponseSchema,
} from '@shared/contracts/lp-reporting';
import {
  runLedgerDryRun,
  runValuationMarkDryRun,
} from '../../services/lp-reporting/import-reconciliation-service';
import {
  commitLedgerImport,
  commitValuationMarkImport,
  ImportCommitError,
} from '../../services/lp-reporting/import-commit-service';
import { invalidateH9Artifacts } from '../../services/h9-artifact-invalidation-service';

const router = Router();

const valuationMarkImportBodySchema = ImportDryRunRequestSchema.extend({
  sourceType: z.literal('csv'),
});
const valuationMarkCommitBodySchema = ImportCommitRequestSchema.extend({
  sourceType: z.literal('csv'),
});

const importLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: 'LP reporting imports are limited to 20 requests per hour per user.',
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

function parseFundId(req: Request): number {
  const fundId = Number.parseInt(firstString(req.params['fundId']) ?? '', 10);
  if (!Number.isFinite(fundId) || fundId <= 0) {
    throw new ImportCommitError(400, 'INVALID_FUND_ID', 'fundId must be a positive integer.');
  }
  return fundId;
}

function numericIdentity(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  return null;
}

function resolveAuthenticatedUserId(req: Request): number {
  const userWithLegacyId = req.user as (Express.User & { userId?: unknown }) | undefined;
  const userId =
    numericIdentity(userWithLegacyId?.userId) ??
    numericIdentity(req.user?.id) ??
    numericIdentity(req.user?.sub);
  if (userId === null) {
    throw new ImportCommitError(
      401,
      'AUTH_USER_ID_UNRESOLVED',
      'Authenticated user could not be resolved to a numeric users.id.'
    );
  }
  return userId;
}

function sendCommitError(res: Response, err: unknown): Response {
  if (err instanceof ImportCommitError) {
    return res.status(err.status).json({
      error: err.code,
      message: err.message,
      ...(err.details !== undefined && { details: err.details }),
    });
  }
  const message = err instanceof Error ? err.message : 'Unknown error';
  return res.status(500).json({
    error: 'IMPORT_COMMIT_FAILED',
    message,
  });
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

router.post(
  '/api/funds/:fundId/imports/ledger/commit',
  requireAuth(),
  requireFundAccess,
  importLimiter,
  async (req: Request, res: Response) => {
    const parsedBody = ImportCommitRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'INVALID_BODY',
        message: 'Body must contain sourceType, payload, and previewHash.',
        issues: parsedBody.error.issues,
      });
    }

    try {
      const result = await commitLedgerImport({
        fundId: parseFundId(req),
        userId: resolveAuthenticatedUserId(req),
        ...parsedBody.data,
      });
      const validated = ImportCommitResponseSchema.parse(result);
      if (validated.insertedCount > 0) {
        await invalidateH9Artifacts(parseFundId(req));
      }
      return res.status(validated.insertedCount > 0 ? 201 : 200).json(validated);
    } catch (err) {
      return sendCommitError(res, err);
    }
  }
);

router.post(
  '/api/funds/:fundId/imports/valuation-marks/commit',
  requireAuth(),
  requireFundAccess,
  importLimiter,
  async (req: Request, res: Response) => {
    const parsedBody = valuationMarkCommitBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'INVALID_BODY',
        message: 'Body must contain sourceType, payload, and previewHash.',
        issues: parsedBody.error.issues,
      });
    }

    try {
      const result = await commitValuationMarkImport({
        fundId: parseFundId(req),
        userId: resolveAuthenticatedUserId(req),
        ...parsedBody.data,
      });
      const validated = ImportCommitResponseSchema.parse(result);
      if (validated.insertedCount > 0) {
        await invalidateH9Artifacts(parseFundId(req));
      }
      return res.status(validated.insertedCount > 0 ? 201 : 200).json(validated);
    } catch (err) {
      return sendCommitError(res, err);
    }
  }
);

export default router;
