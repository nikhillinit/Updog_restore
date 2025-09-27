import { z } from 'zod';
import { zBooleanish } from './booleans';

// HTTP DTOs with coercers for boundary parsing
export const FundInputDTO = z.object({
  name: z.string().min(1),
  size: z.coerce.number().positive(),
  deployedCapital: z.coerce.number().nonnegative().optional(),
  managementFee: z.coerce.number().min(0).max(1),
  carryPercentage: z.coerce.number().min(0).max(1),
  vintageYear: z.coerce.number().int().min(2000).max(2030),
  status: z.string().optional()
});
export type FundInputDTO = z.infer<typeof FundInputDTO>;

export const FundConfigDTO = z.object({
  isActive: zBooleanish,
  isEvergreen: zBooleanish,
  fundSize: z.coerce.number().int().positive(),
  strategy: z.string().max(256).optional()
});
export type FundConfigDTO = z.infer<typeof FundConfigDTO>;

// Domain models (strict types)
export const FundInput = z.object({
  name: z.string().min(1),
  size: z.number().positive(),
  deployedCapital: z.number().nonnegative().optional(),
  managementFee: z.number().min(0).max(1),
  carryPercentage: z.number().min(0).max(1),
  vintageYear: z.number().int().min(2000).max(2030),
  status: z.string().optional()
});
export type FundInput = z.infer<typeof FundInput>;

export const FundConfig = z.object({
  isActive: z.boolean(),
  isEvergreen: z.boolean(),
  fundSize: z.number().int().positive(),
  strategy: z.string().max(256).optional()
});
export type FundConfig = z.infer<typeof FundConfig>;

// Conversion functions
export const toDomainFundInput = (dto: FundInputDTO): FundInput => FundInput.parse(dto);
export const toDomainFundConfig = (dto: FundConfigDTO): FundConfig => FundConfig.parse(dto);