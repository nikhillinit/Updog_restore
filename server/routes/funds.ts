/* eslint-disable @typescript-eslint/no-explicit-any */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { idempotency } from '../middleware/idempotency';
import { z } from 'zod';
import { positiveInt, percent100 } from '@shared/schema-helpers';
import { hashPayload } from '../lib/hash';
import { idem } from '../shared/idempotency-instance';
import { getOrStart } from '../lib/inflight-server';
import { EnhancedFundModel } from '../core/enhanced-fund-model';
import { calcDurationMs } from '../metrics';
import { db } from '../db';
import { fundConfigs, funds } from '@shared/schema';
import type { InsertFund, InsertFundConfig } from '@shared/schema';

const router = Router();

const LegacyFundSchema = z.object({
  basics: z.object({
    name: z.string().min(1),
    size: z.number().positive(),
    modelVersion: z.literal('reserves-ev1'),
  }),
  strategy: z.object({
    stages: z.array(
      z.object({
        name: z.string().min(1),
        graduate: percent100(),
        exit: percent100(),
        months: positiveInt(),
      })
    ),
  }),
});

const FundGeneralInfoSchema = z.object({
  fundName: z.string().min(1),
  fundSize: z.number().positive(),
  vintageYear: z.number().int(),
  establishmentDate: z
    .string()
    .refine((value) => {
      if (!value) return true;
      return !Number.isNaN(Date.parse(value));
    }, 'establishmentDate must be an ISO-8601 date string')
    .optional(),
  fundLife: z.number().int().positive().optional(),
  investmentPeriod: z.number().int().positive().optional(),
  isEvergreen: z.boolean().optional(),
});

const FundFeesSchema = z
  .object({
    managementFee: z.object({
      rate: z.number().min(0).max(5),
    }),
    carriedInterest: z
      .object({
        enabled: z.boolean().optional(),
        rate: z.number().min(0).max(30).optional(),
      })
      .optional(),
  })
  .partial();

const WizardFundSchema = z
  .object({
    generalInfo: FundGeneralInfoSchema,
    feesExpenses: FundFeesSchema.optional(),
  })
  .passthrough();

const CreateFundSchema = z.union([LegacyFundSchema, WizardFundSchema]);

type FundRecord = { id: number };

interface FundInsertBuilder {
  returning(selection: Record<string, unknown>): Promise<FundRecord[]>;
}

interface FundTransaction {
  insert(table: typeof funds): {
    values(values: InsertFund): FundInsertBuilder;
  };
  insert(table: typeof fundConfigs): {
    values(values: InsertFundConfig): Promise<unknown>;
  };
}

interface FundDatabase {
  transaction<T>(fn: (tx: FundTransaction) => Promise<T>): Promise<T>;
}

// Local fund calculation DTO for this endpoint
const FundCalculationDTO = z.object({
  fundSize: z.coerce.number().positive().int().default(100_000_000),
});

router.post('/funds', idempotency, async (req: Request, res: Response, next: NextFunction) => {
  const parsed = CreateFundSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400);
    return res.json({ error: parsed.error.format() });
  }

  try {
    if ('generalInfo' in parsed.data) {
      const { generalInfo, feesExpenses } = parsed.data;

      const managementFeeRate = feesExpenses?.managementFee?.rate ?? 2;
      const carryRate =
        feesExpenses?.carriedInterest && feesExpenses.carriedInterest.enabled === false
          ? 0
          : (feesExpenses?.carriedInterest?.rate ?? 20);

      const database = db as FundDatabase;

      const establishmentDate = generalInfo.establishmentDate
        ? new Date(generalInfo.establishmentDate)
        : undefined;

      const fundValues: InsertFund = {
        name: generalInfo.fundName,
        size: generalInfo.fundSize.toString(),
        managementFee: (managementFeeRate / 100).toFixed(4),
        carryPercentage: (carryRate / 100).toFixed(4),
        vintageYear: generalInfo.vintageYear,
        establishmentDate,
        status: 'active',
      } satisfies InsertFund;

      const insertedFund = await database.transaction(async (tx) => {
        const [fundRecord] = await tx.insert(funds).values(fundValues).returning({ id: funds.id });

        if (!fundRecord) {
          throw new Error('Failed to persist fund');
        }

        const configValues: InsertFundConfig = {
          fundId: fundRecord.id,
          config: parsed.data,
          isDraft: true,
          isPublished: false,
        } satisfies InsertFundConfig;

        await tx.insert(fundConfigs).values(configValues);

        return fundRecord;
      });

      res.status(201);
      return res.json({ id: insertedFund.id });
    }

    // Legacy fallback keeps previous behaviour (non-persistent strategy storage)
    const legacyFundId = `fund_${Math.random().toString(36).slice(2)}`;
    res.status(201);
    return res.json({ id: legacyFundId });
  } catch (error) {
    return next(error);
  }
});

router.post('/api/funds/calculate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dto = FundCalculationDTO.parse(req.body);
    const idemHeader = String(req.header('Idempotency-Key') || '');
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
      return res.status(201).json(result);
    }

    // === joined path (memory store cannot share promise across processes) ===
    // Avoid unhandled rejection by detaching:
    promise.catch(() => void 0);
    res['setHeader']('Idempotency-Status', 'joined');
    res['setHeader']('Retry-After', '2');
    res['setHeader']('Location', `/api/operations/${encodeURIComponent(key)}`);
    endTimer();
    return res.status(202).json({ status: 'in-progress', key });
  } catch (err) {
    next(err);
  }
});

export default router;
