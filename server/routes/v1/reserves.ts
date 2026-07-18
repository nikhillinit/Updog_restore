import type { Request, Response } from 'express';
import { Router } from 'express';
import { validateReserveInput } from '../../../shared/schemas.js';
import { ConstrainedReserveEngine } from '../../../shared/core/reserves/ConstrainedReserveEngine.js';
import { CONSTRAINED_RESERVE_CALCULATION_KEY } from '../../../shared/core/reserves/constrained-reserve-substrate-adapter.js';
import logger from '../../utils/logger.js';
import { isSafeReadMethod, resolveFundScope } from '../../lib/auth/fund-scope.js';
import { isTeamMemberUser, principalFromUser } from '../../lib/auth/principal.js';
import { serveConstrainedReserveCalculation } from '../../services/constrained-reserve-substrate-promotion.js';
import { readConstrainedReserveShadowReconciliations } from '../../services/substrate-shadow-reconciliation-reader.js';

export const reservesV1Router = Router();
const engine = new ConstrainedReserveEngine();

/**
 * @swagger
 * /api/v1/reserves/calculate:
 *   post:
 *     summary: Calculate reserve allocations
 *     security:
 *       - cookieAuth: []
 *         csrfToken: []
 *       - bearerAuth: []
 *     description: |
 *       Calculates optimal reserve allocations based on input constraints.
 *       Uses the ConstrainedReserveEngine to distribute reserves across
 *       categories while respecting priority and conservation rules.
 *     tags: [Reserves]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReserveInput'
 *           example:
 *             totalReserve: 1000000
 *             allocations:
 *               - category: "Follow-on investments"
 *                 amount: 600000
 *                 priority: 1
 *               - category: "New investments"
 *                 amount: 300000
 *                 priority: 2
 *               - category: "Operating expenses"
 *                 amount: 100000
 *                 priority: 3
 *     responses:
 *       200:
 *         description: Successfully calculated reserve allocations
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReserveOutput'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       500:
 *         description: Internal server error or conservation failure
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
reservesV1Router.post('/calculate', async (req: Request, res: Response) => {
  const rid = (req as Request & { requestId?: string }).requestId || 'unknown';
  try {
    const val = validateReserveInput(req.body);
    if (!val.ok)
      return res.status(val.status).json({ error: 'validation', issues: val.issues, rid });

    const out = engine.calculate(val.data);
    if (!out.conservationOk) return res.status(500).json({ error: 'conservation_failed', rid });

    // Mode-gated substrate serving (ADR-052) behind the ?fundId opt-in: the
    // promotion service serves the substrate result ONLY when the fund is
    // configured `on` (kill switch inactive) AND the substrate verified
    // cents-exact against the legacy output for THIS request; every other
    // outcome (off/shadow/kill/failed/mismatch, or any throw) fail-safes to
    // the legacy response and non-`on` modes keep the exact ADR-048/049/050
    // shadow behavior, so the envelope shape, status codes, and the no-fundId
    // path are unchanged. No fund-scope guard is needed: the response branches
    // only on per-fund OPERATOR CONFIG (the mode registry), never on per-fund
    // stored portfolio data, and a served substrate value is cents-identical
    // to the legacy computation of the caller-supplied ReserveInput.
    const rawFundId = req.query['fundId'];
    if (typeof rawFundId === 'string' && /^[1-9]\d*$/.test(rawFundId)) {
      const outcome = await serveConstrainedReserveCalculation({
        fundId: Number(rawFundId),
        input: val.data,
        legacyResult: out,
      });
      return res.json({
        allocations: outcome.response.allocations,
        totalAllocated: outcome.response.totalAllocated,
        remaining: outcome.response.remaining,
        rid,
      });
    }

    res.json({
      allocations: out.allocations,
      totalAllocated: out.totalAllocated,
      remaining: out.remaining,
      rid,
    });
  } catch (e: unknown) {
    logger.error('Reserve calculation error', e instanceof Error ? e : new Error(String(e)), {
      requestId: rid,
    });
    const status =
      e && typeof e === 'object' && 'status' in e && typeof e.status === 'number' ? e.status : 500;
    const message =
      e && typeof e === 'object' && 'message' in e && typeof e.message === 'string'
        ? e.message
        : 'internal';
    res.status(status).json({ error: message, rid });
  }
});

/**
 * @swagger
 * /api/v1/reserves/config:
 *   get:
 *     summary: Get reserve configuration
 *     description: |
 *       Returns configuration information for the reserves service,
 *       including health check endpoints and service URLs.
 *     tags: [Reserves]
 *     responses:
 *       200:
 *         description: Reserve service configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 /healthz:
 *                   type: string
 *                   description: Health check endpoint URL
 *                   example: "http://localhost:3001"
 *                 /readyz:
 *                   type: string
 *                   description: Readiness check endpoint URL
 *                   example: "http://localhost:3001"
 */
reservesV1Router.get('/config', (_req: Request, res: Response) => {
  res.json({
    '/healthz': 'http://localhost:3001',
    '/readyz': 'http://localhost:3001',
  });
});

/** Positive-integer query parameter (`/^[1-9]\d*$/`), mirroring the fund-moic idiom. */
function parsePositiveIntParam(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * @swagger
 * /api/v1/reserves/constrained/reconciliations:
 *   get:
 *     summary: Read persisted constrained-reserve substrate shadow reconciliations
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Returns the most recent constrained-reserve substrate shadow
 *       reconciliation observations persisted for one fund (ADR-050 ledger),
 *       newest first. Read-only and fund-scoped; before the ledger table is
 *       provisioned to an environment the endpoint returns an empty list.
 *     tags: [Reserves]
 *     parameters:
 *       - in: query
 *         name: fundId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: limit
 *         required: false
 *         schema: { type: integer, minimum: 1, maximum: 200, default: 50 }
 *     responses:
 *       200:
 *         description: Reconciliation observations, newest first
 *       400:
 *         description: Missing or non-conforming fundId/limit
 *       401:
 *         description: Missing or invalid credential
 *       403:
 *         description: Caller lacks access to the requested fund
 */
reservesV1Router.get('/constrained/reconciliations', async (req: Request, res: Response) => {
  const rid = (req as Request & { requestId?: string }).requestId || 'unknown';
  try {
    const fundId = parsePositiveIntParam(req.query['fundId']);
    if (fundId === null) {
      return res.status(400).json({
        error: 'invalid_fund_id',
        message: 'fundId must be a positive integer query parameter',
        rid,
      });
    }

    const rawLimit = req.query['limit'];
    let limit: number | undefined;
    if (rawLimit !== undefined) {
      const parsedLimit = parsePositiveIntParam(rawLimit);
      if (parsedLimit === null) {
        return res.status(400).json({
          error: 'invalid_limit',
          message: 'limit must be a positive integer query parameter',
          rid,
        });
      }
      limit = parsedLimit;
    }

    // Fund-scope authorization (UNLIKE POST /calculate, which never reads
    // per-fund stored data): this endpoint returns fund-scoped ledger rows, so
    // it IS an existence oracle and must be guarded in the handler (RLS does
    // not enforce prod fund scope). Mirrors requireFundAccess: universal READ
    // for authenticated non-LP team members on safe methods, else the strict
    // fail-closed fund-grant check.
    if (
      !(isSafeReadMethod(req.method) && isTeamMemberUser(req.user)) &&
      resolveFundScope(principalFromUser(req.user), fundId) !== 'allow'
    ) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `You do not have access to fund ${fundId}`,
        rid,
      });
    }

    const observations = await readConstrainedReserveShadowReconciliations({
      fundId,
      ...(limit !== undefined && { limit }),
    });

    res.json({
      fundId,
      calculationKey: CONSTRAINED_RESERVE_CALCULATION_KEY,
      observations,
      rid,
    });
  } catch (e: unknown) {
    logger.error(
      'Reserve reconciliation read error',
      e instanceof Error ? e : new Error(String(e)),
      {
        requestId: rid,
      }
    );
    res.status(500).json({ error: 'internal', rid });
  }
});
