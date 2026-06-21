import { z } from 'zod';

import {
  DecimalStringSchema,
  MoneyStringSchema,
} from '@shared/contracts/lp-reporting/cash-flow-event.contract';

const CurrencySchema = z.string().regex(/^[A-Z]{3}$/);
const NullableDecimalStringSchema = DecimalStringSchema.nullable();

export const SecurityTypeSchema = z.enum([
  'equity',
  'convertible_note',
  'safe',
  'warrant',
  'other',
]);

export const InvestmentRoundCreateSchema = z
  .object({
    fundId: z.number().int().positive(),
    roundName: z.string().trim().min(1).max(120),
    securityType: SecurityTypeSchema,
    roundDate: z.string().date(),
    currency: CurrencySchema.default('USD'),
    investmentAmount: MoneyStringSchema,
    roundSize: MoneyStringSchema.optional(),
    preMoneyValuation: MoneyStringSchema.optional(),
    supersedesRoundId: z.number().int().positive().optional(),
  })
  .strict();

export const InvestmentRoundResponseSchema = z
  .object({
    id: z.number().int().positive(),
    investmentId: z.number().int().positive(),
    fundId: z.number().int().positive(),
    roundName: z.string().min(1).max(120),
    securityType: SecurityTypeSchema,
    roundDate: z.string().date(),
    currency: CurrencySchema,
    investmentAmount: MoneyStringSchema,
    roundSize: NullableDecimalStringSchema,
    preMoneyValuation: NullableDecimalStringSchema,
    supersedesRoundId: z.number().int().positive().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    etag: z.string().min(1),
  })
  .strict();

export const InvestmentRoundListResponseSchema = z
  .object({
    data: z.array(InvestmentRoundResponseSchema),
  })
  .strict();

export type SecurityType = z.infer<typeof SecurityTypeSchema>;
export type InvestmentRoundCreate = z.infer<typeof InvestmentRoundCreateSchema>;
export type InvestmentRoundResponse = z.infer<typeof InvestmentRoundResponseSchema>;
export type InvestmentRoundListResponse = z.infer<typeof InvestmentRoundListResponseSchema>;
