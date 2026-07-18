import type { Request, Response } from 'express';
import { Router } from 'express';
import { validateReserveInput } from '../../../shared/schemas.js';
import { ConstrainedReserveEngine } from '../../../shared/core/reserves/ConstrainedReserveEngine.js';
import logger from '../../utils/logger.js';
import { observeConstrainedReserveSubstrateShadow } from '../../services/constrained-reserve-substrate-shadow.js';

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

    // Best-effort, mode-gated substrate shadow (ADR-048): opt-in via ?fundId,
    // computed and logged server-side only. The helper never throws, so it
    // cannot affect the response body or status code; the response is
    // byte-identical with or without ?fundId. No fund-scope guard is needed:
    // the response never branches on fundId or mode, so there is no existence
    // oracle and no per-fund stored data is read (only the caller-supplied
    // ReserveInput is computed).
    const rawFundId = req.query['fundId'];
    if (typeof rawFundId === 'string' && /^[1-9]\d*$/.test(rawFundId)) {
      await observeConstrainedReserveSubstrateShadow({
        fundId: Number(rawFundId),
        input: val.data,
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
