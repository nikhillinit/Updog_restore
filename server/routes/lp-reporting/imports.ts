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
import {
  ARTIFACT_RAW_MEDIA_TYPES,
  createSourceArtifact,
  SourceArtifactJsonEnvelopeSchema,
  SourceArtifactResponseSchema,
} from '../../services/financial-observations/source-artifact-service';
import {
  createMappingProfileVersion,
  MappingProfileResponseSchema,
} from '../../services/financial-observations/mapping-profile-service';
import {
  FINANCIAL_OBSERVATION_DOMAINS,
  FINANCIAL_OBSERVATION_SOURCES,
  MappingRuleV1Schema,
} from '@shared/contracts/financial-observations';

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

const importArtifactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: 'Artifact and mapping-profile imports are limited to 100 requests per hour per user.',
  },
  keyGenerator: (req: Request) => {
    const userId = req.user?.id;
    return userId !== undefined ? `lp-reporting-artifact:${userId}` : 'lp-reporting-artifact:anon';
  },
});

const idempotencyKeySchema = z.string().min(1).max(128);
const rawArtifactSourceTypeSchema = z.enum(['csv', 'xlsx']);
const rawArtifactMediaTypes = new Set<string>(ARTIFACT_RAW_MEDIA_TYPES);
const mappingProfileBodySchema = z
  .object({
    name: z.string().min(1),
    sourceType: z.enum(FINANCIAL_OBSERVATION_SOURCES),
    domain: z.enum(FINANCIAL_OBSERVATION_DOMAINS),
    mappings: z.array(MappingRuleV1Schema),
    supersedesProfileId: z.number().int().positive().nullable(),
  })
  .strict();

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

function requestHeader(req: Request, name: string): string | undefined {
  return firstString(req.headers[name.toLowerCase()]);
}

function parseIdempotencyKey(req: Request): z.SafeParseReturnType<string, string> {
  return idempotencyKeySchema.safeParse(requestHeader(req, 'idempotency-key'));
}

function decodeArtifactFileName(req: Request): string | null {
  const rawFileName = requestHeader(req, 'x-artifact-file-name');
  if (rawFileName === undefined) return null;

  const encodedFileName = rawFileName.replace(/^UTF-8''/i, '');
  try {
    return decodeURIComponent(encodedFileName);
  } catch {
    throw new ImportCommitError(
      400,
      'INVALID_ARTIFACT_FILE_NAME',
      'X-Artifact-File-Name must use valid RFC 8187 percent-encoding.'
    );
  }
}

function baseMediaType(req: Request): string {
  return (requestHeader(req, 'content-type') ?? '').split(';', 1)[0]!.trim().toLowerCase();
}

function sendV2ImportError(res: Response, error: unknown): Response {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { status?: unknown; statusCode?: unknown; code?: unknown };
    const status =
      typeof candidate.status === 'number'
        ? candidate.status
        : typeof candidate.statusCode === 'number'
          ? candidate.statusCode
          : null;
    if (status !== null) {
      return res.status(status).json({
        error: typeof candidate.code === 'string' ? candidate.code : 'IMPORT_REQUEST_FAILED',
        message: error instanceof Error ? error.message : 'Import request failed.',
      });
    }
  }

  return res.status(500).json({
    error: 'IMPORT_REQUEST_FAILED',
    message: error instanceof Error ? error.message : 'Unknown error',
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

router.post(
  '/api/funds/:fundId/imports/artifacts',
  requireAuth(),
  requireFundAccess,
  importArtifactLimiter,
  async (req: Request, res: Response) => {
    const parsedIdempotencyKey = parseIdempotencyKey(req);
    if (!parsedIdempotencyKey.success) {
      return res.status(400).json({
        error: 'INVALID_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key must contain 1 to 128 characters.',
      });
    }

    try {
      let mediaType = baseMediaType(req);
      let sourceType: (typeof FINANCIAL_OBSERVATION_SOURCES)[number];
      let fileName: string | null;
      let payload: Buffer;

      if (rawArtifactMediaTypes.has(mediaType)) {
        const parsedSourceType = rawArtifactSourceTypeSchema.safeParse(
          requestHeader(req, 'x-artifact-source-type')
        );
        if (!parsedSourceType.success) {
          return res.status(400).json({
            error: 'INVALID_ARTIFACT_SOURCE_TYPE',
            message: 'X-Artifact-Source-Type must be csv or xlsx.',
          });
        }
        if (!Buffer.isBuffer(req.body)) {
          return res.status(400).json({
            error: 'INVALID_ARTIFACT_BODY',
            message: 'Raw artifact requests must contain byte payloads.',
          });
        }
        sourceType = parsedSourceType.data;
        fileName = decodeArtifactFileName(req);
        payload = req.body;
      } else {
        // The contract caps characters at 200,000. The upstream JSON parser
        // separately enforces its byte limit, so multibyte envelopes can fail earlier.
        const parsedBody = SourceArtifactJsonEnvelopeSchema.safeParse(req.body);
        if (!parsedBody.success) {
          return res.status(400).json({
            error: 'INVALID_ARTIFACT_BODY',
            message: 'JSON artifact body is invalid.',
            issues: parsedBody.error.issues,
          });
        }
        sourceType = parsedBody.data.sourceType;
        fileName = parsedBody.data.fileName;
        mediaType = 'application/json';
        payload = Buffer.from(parsedBody.data.content, 'utf8');
      }

      const result = SourceArtifactResponseSchema.parse(
        await createSourceArtifact({
          fundId: parseFundId(req),
          sourceType,
          fileName,
          mediaType,
          payload,
          actorId: resolveAuthenticatedUserId(req),
          idempotencyKey: parsedIdempotencyKey.data,
        })
      );
      const { replayed, ...response } = result;
      return res.status(replayed ? 200 : 201).json(response);
    } catch (error) {
      return sendV2ImportError(res, error);
    }
  }
);

router.post(
  '/api/funds/:fundId/imports/mapping-profiles',
  requireAuth(),
  requireFundAccess,
  importArtifactLimiter,
  async (req: Request, res: Response) => {
    const parsedIdempotencyKey = parseIdempotencyKey(req);
    if (!parsedIdempotencyKey.success) {
      return res.status(400).json({
        error: 'INVALID_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key must contain 1 to 128 characters.',
      });
    }

    const parsedBody = mappingProfileBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'INVALID_MAPPING_PROFILE_BODY',
        message: 'Mapping-profile body is invalid.',
        issues: parsedBody.error.issues,
      });
    }

    try {
      const result = MappingProfileResponseSchema.parse(
        await createMappingProfileVersion({
          fundId: parseFundId(req),
          ...parsedBody.data,
          actorId: resolveAuthenticatedUserId(req),
          idempotencyKey: parsedIdempotencyKey.data,
        })
      );
      const { replayed, ...response } = result;
      return res.status(replayed ? 200 : 201).json(response);
    } catch (error) {
      return sendV2ImportError(res, error);
    }
  }
);

export default router;
