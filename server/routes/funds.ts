import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import idempotency from '../middleware/idempotency';
import { z } from 'zod';
import { funds as persistedFunds } from '@shared/schema';
import type { ApiError } from '@shared/types';
import { toNumber } from '@shared/number';
import { hashPayload } from '../lib/hash';
import { db } from '../db';
import { idem } from '../shared/idempotency-instance';
import { getOrStart } from '../lib/inflight-server';
import { EnhancedFundModel } from '../core/enhanced-fund-model';
import { calcDurationMs } from '../metrics';
import { storage } from '../storage';

import { fundPersistenceService } from '../services/fund-persistence-service';
import { sendApiError } from '../lib/apiError';
import { FundCreateV1Schema } from '@shared/contracts/fund-create-v1.contract';
import { logger } from '../lib/logger.js';
import { enforceProvidedFundScope } from '../lib/auth/provided-fund-scope';
import { handleNumberParseError } from '../lib/number-parse-error';

const router = Router();

type PersistedFund = typeof persistedFunds.$inferSelect;
type StoredFund = Awaited<ReturnType<typeof storage.getAllFunds>>[number];
type FundDateValue = Date | string | null | undefined;
type FundDecimalValue = string | number | null | undefined;

export interface ClientFundRow {
  id: number;
  name: string;
  size: FundDecimalValue;
  deployedCapital?: FundDecimalValue;
  managementFee: FundDecimalValue;
  carryPercentage: FundDecimalValue;
  vintageYear: number;
  status: string;
  engineResults: PersistedFund['engineResults'] | null;
  createdAt: FundDateValue;
  establishmentDate?: FundDateValue;
  isActive?: boolean | null;
}

export interface ClientFund {
  id: number;
  name: string;
  size: number;
  deployedCapital: number;
  managementFee: number;
  carryPercentage: number;
  vintageYear: number;
  status: string;
  engineResults: PersistedFund['engineResults'] | null;
  createdAt: string | null;
  establishmentDate: string | null;
  isActive: boolean;
}

class FundBoundaryTransformError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FundBoundaryTransformError';
  }
}

function decimalToNumber(
  value: FundDecimalValue,
  field: keyof Pick<ClientFund, 'size' | 'deployedCapital' | 'managementFee' | 'carryPercentage'>,
  fallback?: number
): number {
  if (value === null || value === undefined) {
    if (fallback !== undefined) {
      return fallback;
    }
    throw new FundBoundaryTransformError(`${field} is required`);
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new FundBoundaryTransformError(`${field} must be a finite number`);
  }
  return parsed;
}

function fundDateToString(value: FundDateValue): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : value;
}

export function toClientFund(fund: ClientFundRow): ClientFund {
  return {
    id: fund.id,
    name: fund.name,
    size: decimalToNumber(fund.size, 'size'),
    deployedCapital: decimalToNumber(fund.deployedCapital, 'deployedCapital', 0),
    managementFee: decimalToNumber(fund.managementFee, 'managementFee'),
    carryPercentage: decimalToNumber(fund.carryPercentage, 'carryPercentage'),
    vintageYear: fund.vintageYear,
    status: fund.status,
    engineResults: fund.engineResults ?? null,
    createdAt: fundDateToString(fund.createdAt),
    establishmentDate: fundDateToString(fund.establishmentDate),
    isActive: fund.isActive ?? true,
  };
}

function normalizeStoredFund(fund: StoredFund): PersistedFund {
  return {
    ...fund,
    establishmentDate: (fund as Partial<PersistedFund>).establishmentDate ?? null,
    isActive: (fund as Partial<PersistedFund>).isActive ?? true,
    baseCurrency: (fund as Partial<PersistedFund>).baseCurrency ?? 'USD',
  };
}

async function getCanonicalFunds(): Promise<PersistedFund[]> {
  const [dbFunds, memoryFunds] = await Promise.all([
    db.select().from(persistedFunds),
    storage.getAllFunds(),
  ]);

  const mergedFunds = new Map<number, PersistedFund>();

  for (const fund of memoryFunds) {
    mergedFunds.set(fund.id, normalizeStoredFund(fund));
  }

  for (const fund of dbFunds) {
    mergedFunds.set(fund.id, fund);
  }

  return [...mergedFunds.values()].sort((left, right) => left.id - right.id);
}

async function getCanonicalFundById(id: number): Promise<PersistedFund | undefined> {
  const [fund] = await db.select().from(persistedFunds).where(eq(persistedFunds.id, id));
  if (fund) {
    return fund;
  }

  const storedFund = await storage.getFund(id);
  return storedFund ? normalizeStoredFund(storedFund) : undefined;
}

// Local fund calculation DTO for this endpoint
const FundCalculationSchema = z.object({
  fundSize: z.coerce.number().positive().int().default(100_000_000),
});
type FundCalculationDTO = z.infer<typeof FundCalculationSchema>;

router['get']('/funds', async (_req: Request, res: Response) => {
  try {
    const funds = await getCanonicalFunds();
    return res.json(funds.map(toClientFund));
  } catch (error) {
    const apiError: ApiError = {
      error: 'Database query failed',
      message: error instanceof Error ? error.message : 'Failed to fetch funds',
    };
    return res.status(500).json(apiError);
  }
});

router['get']('/funds/:id', async (req: Request, res: Response) => {
  try {
    const idParam = req.params['id'];
    const id = toNumber(idParam, 'ID');

    if (id <= 0) {
      const error: ApiError = {
        error: 'Invalid fund ID',
        message: `Fund ID must be a positive integer, received: ${idParam}`,
      };
      return res.status(400).json(error);
    }

    if (!(await enforceProvidedFundScope(req, res, id))) {
      return;
    }

    const fund = await getCanonicalFundById(id);
    if (!fund) {
      const error: ApiError = {
        error: 'Fund not found',
        message: `No fund exists with ID: ${id}`,
      };
      return res.status(404).json(error);
    }

    return res.json(toClientFund(fund));
  } catch (error) {
    if (handleNumberParseError(error, res, 'Invalid fund ID')) {
      return;
    }

    const apiError: ApiError = {
      error: 'Database query failed',
      message: error instanceof Error ? error.message : 'Failed to fetch fund',
    };
    return res.status(500).json(apiError);
  }
});

router['post']('/funds', idempotency, async (req: Request, res: Response) => {
  const parsed = FundCreateV1Schema.safeParse(req.body);
  if (!parsed.success) {
    return sendApiError(res, 400, {
      error: 'Validation failed',
      code: 'FUND_CREATE_VALIDATION_ERROR',
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
    });
  }

  try {
    const data = parsed.data;
    const fundInput = {
      name: data.name,
      size: String(data.size),
      managementFee: String(data.managementFee),
      carryPercentage: String(data.carryPercentage),
      vintageYear: data.vintageYear,
      ...(data.engineResults != null && { engineResults: data.engineResults }),
    };

    // Atomic create: fund + initial draft in one transaction
    const { fund } = await fundPersistenceService.createFundWithInitialDraft(fundInput);
    logger.info({ fundId: fund.id }, 'fund.created');

    res.status(201);
    return res.json({
      success: true,
      data: toClientFund(fund),
      message: 'Fund created successfully',
    });
  } catch (error) {
    logger.error({ err: error }, 'fund.create.failed');
    res.status(500);
    return res.json({
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
      async (_signal: unknown) => {
        const model = new EnhancedFundModel(dto);
        const out = await model.calculate();
        return out;
      },
      60_000
    );

    if (status === 'created') {
      res.setHeader('Idempotency-Status', 'created');
      const result = await promise;
      endTimer();
      return res.status(201).json(result);
    }

    // joined path:
    // - For derived keys (no explicit client key), return cached results immediately when available.
    // - For explicit client keys, preserve async operation semantics with 202 + Location.
    if (!hasClientKey) {
      try {
        const result = await promise;
        res.setHeader('Idempotency-Status', 'joined');
        endTimer();
        return res.status(200).json(result);
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'in-progress') {
          throw error;
        }
      }
    }

    // In-memory store cannot share in-flight work across processes; surface operation endpoint.
    // Avoid unhandled rejection by detaching:
    promise.catch(() => void 0);
    res.setHeader('Idempotency-Status', 'joined');
    res.setHeader('Retry-After', '2');
    res.setHeader('Location', `/api/operations/${encodeURIComponent(key)}`);
    endTimer();
    return res.status(202).json({ status: 'in-progress', key });
  } catch (err) {
    next(err);
  }
});

export default router;
