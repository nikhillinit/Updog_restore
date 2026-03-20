/* eslint-disable @typescript-eslint/no-explicit-any */ // Fund CRUD routes

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import idempotency from '../middleware/idempotency';
import { z } from 'zod';
import { positiveInt, percent100 } from '@shared/schema-helpers';
import { engineResultsSchema } from '@shared/schemas/engine-results-schema';
import { hashPayload } from '../lib/hash';
import { idem } from '../shared/idempotency-instance';
import { getOrStart } from '../lib/inflight-server';
import { EnhancedFundModel } from '../core/enhanced-fund-model';
import { calcDurationMs } from '../metrics';
import { storage } from '../storage';

import { sendApiError } from '../lib/apiError';
import { detectPostFormat, parseCanonical } from '../adapters/fund-create-adapter';

const router = Router();

/**
 * @deprecated Use FundCreateV1Schema (canonical format) for new callers.
 * Retained for legacy-basics format support during migration.
 */
const CreateFundSchema = z.object({
  name: z.string().min(1, 'Fund name is required'),
  size: z.number().positive('Fund size must be positive'),
  managementFee: z.number().min(0).max(0.1).default(0.02),
  carryPercentage: z.number().min(0).max(0.5).default(0.2),
  vintageYear: z
    .number()
    .int()
    .min(2000)
    .max(2100)
    .default(() => new Date().getFullYear()),
  engineResults: engineResultsSchema.nullable().optional(),
  basics: z
    .object({
      name: z.string().min(1),
      size: z.number().positive(),
      modelVersion: z.literal('reserves-ev1').optional(),
    })
    .optional(),
  strategy: z
    .object({
      stages: z.array(
        z.object({
          name: z.string().min(1),
          graduate: percent100(),
          exit: percent100(),
          months: positiveInt(),
        })
      ),
    })
    .optional(),
});

// Local fund calculation DTO for this endpoint
const FundCalculationSchema = z.object({
  fundSize: z.coerce.number().positive().int().default(100_000_000),
});
type FundCalculationDTO = z.infer<typeof FundCalculationSchema>;

router['post']('/funds', idempotency, async (req: Request, res: Response) => {
  const format = detectPostFormat(req.body);

  // Unknown format -- reject
  if (format === 'unknown') {
    return sendApiError(res, 400, {
      error: 'Request must include either a top-level "name" (canonical) or "basics" (legacy) key',
      code: 'FUND_NO_MARKERS',
    });
  }

  // Canonical format (FundCreateV1)
  if (format === 'canonical') {
    const parsed = parseCanonical(req.body);
    if (!parsed.ok) {
      return sendApiError(res, 400, {
        error: 'Validation failed',
        code: 'FUND_CREATE_VALIDATION_ERROR',
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      });
    }

    try {
      const data = parsed.data;
      const fundData = {
        name: data.name,
        size: String(data.size),
        managementFee: String(data.managementFee),
        carryPercentage: String(data.carryPercentage),
        vintageYear: data.vintageYear,
        ...(data.engineResults != null && { engineResults: data.engineResults }),
      };

      const fund = await storage.createFund(fundData);
      console.warn('create-canonical', { fundId: fund.id });

      res['status'](201);
      return res['json']({
        success: true,
        data: {
          id: fund.id,
          name: fund.name,
          size: fund.size,
          managementFee: fund.managementFee,
          carryPercentage: fund.carryPercentage,
          vintageYear: fund.vintageYear,
          status: fund.status,
          engineResults: fund.engineResults ?? null,
          createdAt: fund.createdAt,
        },
        message: 'Fund created successfully',
      });
    } catch (error) {
      console.error('Fund creation error:', error);
      res['status'](500);
      return res['json']({
        error: 'Failed to create fund',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Legacy-basics format (existing behavior)
  const parsed = CreateFundSchema.safeParse(req.body);
  if (!parsed.success) {
    res['status'](400);
    return res['json']({ error: parsed.error.format() });
  }

  try {
    const data = parsed.data;
    const size = data.size || data.basics?.size || 0;
    const managementFee = data.managementFee ?? 0.02;
    const carryPercentage = data.carryPercentage ?? 0.2;
    const fundData = {
      name: data.name || data.basics?.name || '',
      size: String(size),
      managementFee: String(managementFee),
      carryPercentage: String(carryPercentage),
      vintageYear: data.vintageYear ?? new Date().getFullYear(),
      ...(data.engineResults != null && { engineResults: data.engineResults }),
    };

    const fund = await storage.createFund(fundData);
    console.warn('create-legacy-basics', { fundId: fund.id });

    res['status'](201);
    return res['json']({
      success: true,
      data: {
        id: fund.id,
        name: fund.name,
        size: fund.size,
        managementFee: fund.managementFee,
        carryPercentage: fund.carryPercentage,
        vintageYear: fund.vintageYear,
        status: fund.status,
        engineResults: fund.engineResults ?? null,
        createdAt: fund.createdAt,
      },
      message: 'Fund created successfully',
    });
  } catch (error) {
    console.error('Fund creation error:', error);
    res['status'](500);
    return res['json']({
      error: 'Failed to create fund',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router['post']('/funds/calculate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dto = FundCalculationSchema.parse(req.body as FundCalculationDTO);
    const idemHeader = String(req.header('Idempotency-Key') || '');
    const hasClientKey = idemHeader.trim().length > 0;
    const key = idemHeader || `calc:${hashPayload(dto)}`;

    const endTimer = calcDurationMs.startTimer();
    const { status, promise } = await getOrStart(
      idem,
      key,
      async (_signal: any) => {
        const model = new EnhancedFundModel(dto);
        const out = await model.calculate();
        return out;
      },
      60_000
    );

    if (status === 'created') {
      res['setHeader']('Idempotency-Status', 'created');
      const result = await promise;
      endTimer();
      return res['status'](201)['json'](result);
    }

    // joined path:
    // - For derived keys (no explicit client key), return cached results immediately when available.
    // - For explicit client keys, preserve async operation semantics with 202 + Location.
    if (!hasClientKey) {
      try {
        const result = await promise;
        res['setHeader']('Idempotency-Status', 'joined');
        endTimer();
        return res['status'](200)['json'](result);
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'in-progress') {
          throw error;
        }
      }
    }

    // In-memory store cannot share in-flight work across processes; surface operation endpoint.
    // Avoid unhandled rejection by detaching:
    promise.catch(() => void 0);
    res['setHeader']('Idempotency-Status', 'joined');
    res['setHeader']('Retry-After', '2');
    res['setHeader']('Location', `/api/operations/${encodeURIComponent(key)}`);
    endTimer();
    return res['status'](202)['json']({ status: 'in-progress', key });
  } catch (err) {
    next(err);
  }
});

export default router;
