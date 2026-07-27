/**
 * Investment ledger -- canonical financing events and versioned tranches.
 *
 *   POST /api/funds/:fundId/investment-ledger/financing-events
 *   POST /api/funds/:fundId/investment-ledger/financing-events/:eventId/tranches
 *   POST /api/funds/:fundId/investment-ledger/tranches/:trancheId/corrections
 *   POST /api/funds/:fundId/investment-ledger/tranches/:trancheId/participations
 *   POST /api/funds/:fundId/investment-ledger/tranches/:trancheId/ledger-corrections
 *   POST /api/funds/:fundId/investment-ledger/position-events
 *   POST /api/funds/:fundId/investment-ledger/position-conversions
 *   POST /api/funds/:fundId/investment-ledger/position-corrections
 *   GET  /api/funds/:fundId/investment-ledger/financing-events/:eventId
 *
 * Middleware chain (existing primitives only):
 *   ledgerIngressLimiter -> requireAuth() -> validateFundIdParam -> requireFundAccess -> ledgerWriteLimiter
 *
 * Every write requires an `Idempotency-Key`; the header is parsed before the body so
 * a malformed command is rejected without touching the contract. Persistence stays
 * behind the service: this module never imports `../db`
 * (`guard:route-imports:check`).
 *
 * @module server/routes/investment-ledger
 */

import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { ZodError, z } from 'zod';

import { requireAuth, requireFundAccess } from '../lib/auth/jwt';
import { parseETag } from '../lib/http-preconditions';
import { firstString } from '../lib/request-values';
import {
  correctFinancingTranche,
  createFinancingEvent,
  loadFinancingEventDetail,
  recordFinancingTranche,
} from '../services/investment-ledger/financing-event-service';
import { correctVehicleParticipationLedger } from '../services/investment-ledger/ledger-correction-service';
import { createVehicleFinancingParticipation } from '../services/investment-ledger/participation-service';
import { convertPosition } from '../services/investment-ledger/position-conversion-service';
import { listCurrentPositions } from '../services/investment-ledger/current-position-service';
import {
  createOwnershipSnapshot,
  listOwnershipSnapshots,
} from '../services/investment-ledger/ownership-snapshot-service';
import {
  recordDirectPositionValuation,
  selectPositionValuation,
} from '../services/investment-ledger/position-valuation-service';
import {
  correctPosition,
  recordPositionEvent,
} from '../services/investment-ledger/position-service';

const router = Router();

const ledgerIngressLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: 'Investment ledger requests are limited to 300 requests per hour per client.',
  },
});

const ledgerWriteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: 'Investment ledger writes are limited to 100 requests per hour per user.',
  },
  keyGenerator: (req: Request) => {
    // Runs after requireAuth, so req.user.id is set. If it is somehow missing,
    // bucket every such request under one shared key so the cap still binds
    // (per-IP would invite an IPv4 vs. IPv6 bypass).
    const userId = req.user?.id;
    return userId !== undefined ? `investment-ledger:${userId}` : 'investment-ledger:anon';
  },
});

const idempotencyKeySchema = z.string().min(1).max(128);
const isoDateQuerySchema = z.string().date();
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const POSTGRES_INT_MAX = 2_147_483_647;

class LedgerRouteError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'LedgerRouteError';
  }
}

function parsePositiveParam(req: Request, name: string, code: string): number {
  const raw = firstString(req.params[name]) ?? '';
  const parsed = Number(raw);
  if (!POSITIVE_INTEGER.test(raw) || !Number.isSafeInteger(parsed) || parsed > POSTGRES_INT_MAX) {
    throw new LedgerRouteError(400, code, `${name} must be a positive integer.`);
  }
  return parsed;
}

function parseOptionalPositiveQuery(req: Request, name: string, code: string): number | undefined {
  const raw = firstString(req.query[name]);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!POSITIVE_INTEGER.test(raw) || !Number.isSafeInteger(parsed) || parsed > POSTGRES_INT_MAX) {
    throw new LedgerRouteError(400, code, `${name} must be a positive integer.`);
  }
  return parsed;
}

function parseRequiredPositiveQuery(req: Request, name: string, code: string): number {
  const value = parseOptionalPositiveQuery(req, name, code);
  if (value === undefined) {
    throw new LedgerRouteError(400, code, `${name} must be a positive integer.`);
  }
  return value;
}

function parseOptionalDateQuery(req: Request, name: string, code: string): string | undefined {
  const raw = firstString(req.query[name]);
  if (raw === undefined) return undefined;
  if (!isoDateQuerySchema.safeParse(raw).success) {
    throw new LedgerRouteError(400, code, `${name} must be an ISO date.`);
  }
  return raw;
}

function parseRequiredDateQuery(req: Request, name: string, code: string): string {
  const value = parseOptionalDateQuery(req, name, code);
  if (value === undefined) {
    throw new LedgerRouteError(400, code, `${name} must be an ISO date.`);
  }
  return value;
}

function assertNoKnowledgeCutoffQuery(req: Request): void {
  if (firstString(req.query['knowledgeCutoff']) !== undefined) {
    throw new LedgerRouteError(
      400,
      'KNOWLEDGE_CUTOFF_NOT_ACCEPTED',
      'knowledgeCutoff is assigned by the server and is not accepted on public reads.'
    );
  }
}

function parseIdempotencyKey(req: Request): string {
  const parsed = idempotencyKeySchema.safeParse(firstString(req.headers['idempotency-key']));
  if (!parsed.success) {
    throw new LedgerRouteError(
      400,
      'INVALID_IDEMPOTENCY_KEY',
      'Idempotency-Key must contain 1 to 128 characters.'
    );
  }
  return parsed.data;
}

function numericIdentity(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && POSITIVE_INTEGER.test(value)) {
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
    throw new LedgerRouteError(
      401,
      'AUTH_USER_ID_UNRESOLVED',
      'Authenticated user could not be resolved to a numeric users.id.'
    );
  }
  return userId;
}

function sendLedgerError(res: Response, error: unknown): Response {
  if (error instanceof LedgerRouteError) {
    return res.status(error.status).json({ error: error.code, message: error.message });
  }
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: 'INVALID_BODY',
      message: 'The request body does not satisfy the investment-ledger contract.',
      issues: error.issues,
    });
  }
  if (typeof error === 'object' && error !== null) {
    const candidate = error as {
      status?: unknown;
      statusCode?: unknown;
      code?: unknown;
      details?: unknown;
    };
    const status =
      typeof candidate.status === 'number'
        ? candidate.status
        : typeof candidate.statusCode === 'number'
          ? candidate.statusCode
          : null;
    if (status !== null && typeof candidate.code === 'string') {
      return res.status(status).json({
        error: candidate.code,
        message: error instanceof Error ? error.message : 'Investment ledger request failed.',
        ...(candidate.details !== undefined && { details: candidate.details }),
      });
    }
  }

  return res.status(500).json({
    error: 'LEDGER_REQUEST_FAILED',
    message: 'The investment ledger request failed.',
  });
}

function validateFundIdParam(req: Request, res: Response, next: NextFunction): void | Response {
  try {
    parsePositiveParam(req, 'fundId', 'INVALID_FUND_ID');
    return next();
  } catch (error) {
    return sendLedgerError(res, error);
  }
}

const writeChain = [
  ledgerIngressLimiter,
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  ledgerWriteLimiter,
] as const;

const readChain = [
  ledgerIngressLimiter,
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  ledgerWriteLimiter,
] as const;

// Create (or resolve) the canonical financing event for a company identity.
router.post(
  '/api/funds/:fundId/investment-ledger/financing-events',
  ...writeChain,
  async (req: Request, res: Response) => {
    try {
      const idempotencyKey = parseIdempotencyKey(req);
      const fundId = parsePositiveParam(req, 'fundId', 'INVALID_FUND_ID');
      const result = await createFinancingEvent({
        fundId,
        actorId: resolveAuthenticatedUserId(req),
        idempotencyKey,
        request: req.body,
      });
      return res.status(result.replayed ? 200 : 201).json(result.value);
    } catch (error) {
      return sendLedgerError(res, error);
    }
  }
);

// Record an independent closing (tranche version 1) on an existing event.
router.post(
  '/api/funds/:fundId/investment-ledger/financing-events/:eventId/tranches',
  ...writeChain,
  async (req: Request, res: Response) => {
    try {
      const idempotencyKey = parseIdempotencyKey(req);
      const fundId = parsePositiveParam(req, 'fundId', 'INVALID_FUND_ID');
      const eventId = parsePositiveParam(req, 'eventId', 'INVALID_EVENT_ID');
      const result = await recordFinancingTranche({
        fundId,
        eventId,
        actorId: resolveAuthenticatedUserId(req),
        idempotencyKey,
        request: req.body,
      });
      return res.status(result.replayed ? 200 : 201).json(result.value);
    } catch (error) {
      return sendLedgerError(res, error);
    }
  }
);

// Correct a tranche by superseding its head with a new version row.
router.post(
  '/api/funds/:fundId/investment-ledger/tranches/:trancheId/corrections',
  ...writeChain,
  async (req: Request, res: Response) => {
    try {
      const idempotencyKey = parseIdempotencyKey(req);
      const fundId = parsePositiveParam(req, 'fundId', 'INVALID_FUND_ID');
      const trancheId = parsePositiveParam(req, 'trancheId', 'INVALID_TRANCHE_ID');
      const result = await correctFinancingTranche({
        fundId,
        trancheId,
        actorId: resolveAuthenticatedUserId(req),
        idempotencyKey,
        request: req.body,
      });
      return res.status(result.replayed ? 200 : 201).json(result.value);
    } catch (error) {
      return sendLedgerError(res, error);
    }
  }
);

// Record one vehicle participation and all compatibility/provenance rows atomically.
router.post(
  '/api/funds/:fundId/investment-ledger/tranches/:trancheId/participations',
  ...writeChain,
  async (req: Request, res: Response) => {
    try {
      const idempotencyKey = parseIdempotencyKey(req);
      const fundId = parsePositiveParam(req, 'fundId', 'INVALID_FUND_ID');
      const trancheId = parsePositiveParam(req, 'trancheId', 'INVALID_TRANCHE_ID');
      const result = await createVehicleFinancingParticipation({
        fundId,
        trancheId,
        actorId: resolveAuthenticatedUserId(req),
        idempotencyKey,
        request: req.body,
      });
      return res.status(result.replayed ? 200 : 201).json(result.value);
    } catch (error) {
      return sendLedgerError(res, error);
    }
  }
);

// Correct a tranche and its complete dependent participation set in one command.
router.post(
  '/api/funds/:fundId/investment-ledger/tranches/:trancheId/ledger-corrections',
  ...writeChain,
  async (req: Request, res: Response) => {
    try {
      const idempotencyKey = parseIdempotencyKey(req);
      const fundId = parsePositiveParam(req, 'fundId', 'INVALID_FUND_ID');
      const trancheId = parsePositiveParam(req, 'trancheId', 'INVALID_TRANCHE_ID');
      const result = await correctVehicleParticipationLedger({
        fundId,
        trancheId,
        actorId: resolveAuthenticatedUserId(req),
        idempotencyKey,
        request: req.body,
      });
      return res.status(result.replayed ? 200 : 201).json(result.value);
    } catch (error) {
      return sendLedgerError(res, error);
    }
  }
);

// Read current positions by exact fund/vehicle/company identity as of server knowledge.
router.get(
  '/api/funds/:fundId/investment-ledger/positions',
  ...readChain,
  async (req: Request, res: Response) => {
    try {
      assertNoKnowledgeCutoffQuery(req);
      const fundId = parsePositiveParam(req, 'fundId', 'INVALID_FUND_ID');
      const result = await listCurrentPositions({
        fundId,
        query: {
          vehicleId: parseOptionalPositiveQuery(req, 'vehicleId', 'INVALID_VEHICLE_ID'),
          companyIdentityId: parseOptionalPositiveQuery(
            req,
            'companyIdentityId',
            'INVALID_COMPANY_IDENTITY_ID'
          ),
          asOfDate: parseOptionalDateQuery(req, 'asOfDate', 'INVALID_AS_OF_DATE'),
        },
      });
      return res.status(200).json(result);
    } catch (error) {
      return sendLedgerError(res, error);
    }
  }
);

// Record a manual position event without wiring corrections or conversions.
router.post(
  '/api/funds/:fundId/investment-ledger/position-events',
  ...writeChain,
  async (req: Request, res: Response) => {
    try {
      const idempotencyKey = parseIdempotencyKey(req);
      const fundId = parsePositiveParam(req, 'fundId', 'INVALID_FUND_ID');
      const result = await recordPositionEvent({
        fundId,
        actorId: resolveAuthenticatedUserId(req),
        idempotencyKey,
        request: req.body,
      });
      return res.status(result.replayed ? 200 : 201).json(result.value);
    } catch (error) {
      return sendLedgerError(res, error);
    }
  }
);

// Read terminal ownership snapshot heads by exact fund/vehicle/company identity.
router.get(
  '/api/funds/:fundId/investment-ledger/ownership-snapshots',
  ...readChain,
  async (req: Request, res: Response) => {
    try {
      assertNoKnowledgeCutoffQuery(req);
      const fundId = parsePositiveParam(req, 'fundId', 'INVALID_FUND_ID');
      const vehicleId = parseOptionalPositiveQuery(req, 'vehicleId', 'INVALID_VEHICLE_ID');
      const companyIdentityId = parseOptionalPositiveQuery(
        req,
        'companyIdentityId',
        'INVALID_COMPANY_IDENTITY_ID'
      );
      const asOfDate = parseOptionalDateQuery(req, 'asOfDate', 'INVALID_AS_OF_DATE');
      const result = await listOwnershipSnapshots({
        fundId,
        ...(vehicleId !== undefined && { vehicleId }),
        ...(companyIdentityId !== undefined && { companyIdentityId }),
        ...(asOfDate !== undefined && { asOfDate }),
      });
      return res.status(200).json(result);
    } catch (error) {
      return sendLedgerError(res, error);
    }
  }
);

// Append an immutable ownership snapshot with exact observation provenance.
router.post(
  '/api/funds/:fundId/investment-ledger/ownership-snapshots',
  ...writeChain,
  async (req: Request, res: Response) => {
    try {
      const idempotencyKey = parseIdempotencyKey(req);
      const fundId = parsePositiveParam(req, 'fundId', 'INVALID_FUND_ID');
      const result = await createOwnershipSnapshot({
        fundId,
        actorId: resolveAuthenticatedUserId(req),
        idempotencyKey,
        request: req.body,
      });
      return res.status(result.replayed ? 200 : 201).json(result.value);
    } catch (error) {
      return sendLedgerError(res, error);
    }
  }
);

// Record an accepted direct position FMV mark scoped to one vehicle/company identity.
router.get(
  '/api/funds/:fundId/investment-ledger/position-valuations',
  ...readChain,
  async (req: Request, res: Response) => {
    try {
      assertNoKnowledgeCutoffQuery(req);
      const fundId = parsePositiveParam(req, 'fundId', 'INVALID_FUND_ID');
      const result = await selectPositionValuation({
        fundId,
        vehicleId: parseRequiredPositiveQuery(req, 'vehicleId', 'INVALID_VEHICLE_ID'),
        companyIdentityId: parseRequiredPositiveQuery(
          req,
          'companyIdentityId',
          'INVALID_COMPANY_IDENTITY_ID'
        ),
        companyId: parseRequiredPositiveQuery(req, 'companyId', 'INVALID_COMPANY_ID'),
        asOfDate: parseRequiredDateQuery(req, 'asOfDate', 'INVALID_AS_OF_DATE'),
      });
      return res.status(200).json(result);
    } catch (error) {
      return sendLedgerError(res, error);
    }
  }
);

router.post(
  '/api/funds/:fundId/investment-ledger/position-valuations',
  ...writeChain,
  async (req: Request, res: Response) => {
    try {
      const idempotencyKey = parseIdempotencyKey(req);
      const fundId = parsePositiveParam(req, 'fundId', 'INVALID_FUND_ID');
      const result = await recordDirectPositionValuation({
        fundId,
        actorId: resolveAuthenticatedUserId(req),
        idempotencyKey,
        request: req.body,
      });
      return res.status(result.replayed ? 200 : 201).json(result.value);
    } catch (error) {
      return sendLedgerError(res, error);
    }
  }
);

// Convert a full SAFE/note participation into one priced-equity participation.
router.post(
  '/api/funds/:fundId/investment-ledger/position-conversions',
  ...writeChain,
  async (req: Request, res: Response) => {
    try {
      const idempotencyKey = parseIdempotencyKey(req);
      const fundId = parsePositiveParam(req, 'fundId', 'INVALID_FUND_ID');
      const result = await convertPosition({
        fundId,
        actorId: resolveAuthenticatedUserId(req),
        idempotencyKey,
        request: req.body,
      });
      return res.status(result.replayed ? 200 : 201).json(result.value);
    } catch (error) {
      return sendLedgerError(res, error);
    }
  }
);

// Correct one append-only position event through reversal and replacement lineage.
router.post(
  '/api/funds/:fundId/investment-ledger/position-corrections',
  ...writeChain,
  async (req: Request, res: Response) => {
    try {
      const idempotencyKey = parseIdempotencyKey(req);
      const fundId = parsePositiveParam(req, 'fundId', 'INVALID_FUND_ID');
      const ifMatch = firstString(req.headers['if-match']);
      if (!ifMatch) {
        throw new LedgerRouteError(428, 'precondition_required', 'If-Match header is required');
      }
      const result = await correctPosition({
        fundId,
        actorId: resolveAuthenticatedUserId(req),
        idempotencyKey,
        ifMatch: parseETag(ifMatch),
        request: req.body,
      });
      return res.status(result.replayed ? 200 : 201).json(result.value);
    } catch (error) {
      return sendLedgerError(res, error);
    }
  }
);

// Read an event with its current tranche heads and full version history.
router.get(
  '/api/funds/:fundId/investment-ledger/financing-events/:eventId',
  ledgerIngressLimiter,
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  ledgerWriteLimiter,
  async (req: Request, res: Response) => {
    try {
      const fundId = parsePositiveParam(req, 'fundId', 'INVALID_FUND_ID');
      const eventId = parsePositiveParam(req, 'eventId', 'INVALID_EVENT_ID');
      const detail = await loadFinancingEventDetail(fundId, eventId);
      return res.status(200).json(detail);
    } catch (error) {
      return sendLedgerError(res, error);
    }
  }
);

export default router;
