/**
 * Zod schemas for runtime validation of reserves data
 * Ensures type safety and data integrity at runtime boundaries
 */

import { z } from 'zod';

// Company schema with validation rules
export const CompanySchema = z.object({
  id: z.string().min(1, 'Company ID is required'),
  name: z.string().min(1, 'Company name is required'),
  invested_cents: z.number()
    .int('Investment must be in integer cents')
    .nonnegative('Investment cannot be negative')
    .max(Number.MAX_SAFE_INTEGER, 'Investment exceeds maximum safe integer'),
  exit_moic_bps: z.number()
    .int('Exit MOIC must be in basis points')
    .nonnegative('Exit MOIC cannot be negative')
    .max(1000000, 'Exit MOIC exceeds reasonable bounds (100x)'),
  stage: z.string().optional(),
  sector: z.string().optional(),
  ownership_pct: z.number()
    .min(0, 'Ownership cannot be negative')
    .max(1, 'Ownership cannot exceed 100%')
    .optional(),
  metadata: z.record(z.unknown()).optional()
});

// Cap policy schemas
export const FixedCapPolicySchema = z.object({
  kind: z.literal('fixed_percent'),
  default_percent: z.number()
    .min(0, 'Cap percentage cannot be negative')
    .max(10, 'Cap percentage exceeds reasonable bounds (1000%)')
    .optional()
});

export const StageBasedCapPolicySchema = z.object({
  kind: z.literal('stage_based'),
  default_percent: z.number()
    .min(0, 'Default cap percentage cannot be negative')
    .max(10, 'Default cap percentage exceeds reasonable bounds')
    .optional(),
  stage_caps: z.record(
    z.string(),
    z.number().min(0).max(10)
  ).optional()
});

export const CustomCapPolicySchema = z.object({
  kind: z.literal('custom'),
  custom_fn: z.function()
    .args(CompanySchema)
    .returns(z.number())
    .optional()
});

export const CapPolicySchema = z.discriminatedUnion('kind', [
  FixedCapPolicySchema,
  StageBasedCapPolicySchema,
  CustomCapPolicySchema
]);

// Reserves configuration schema
export const ReservesConfigSchema = z.object({
  reserve_bps: z.number()
    .int('Reserve percentage must be in basis points')
    .min(0, 'Reserve percentage cannot be negative')
    .max(10000, 'Reserve percentage cannot exceed 100%'),
  remain_passes: z.union([z.literal(0), z.literal(1)]),
  cap_policy: CapPolicySchema,
  audit_level: z.enum(['basic', 'detailed', 'debug'])
});

// Reserves input schema
export const ReservesInputSchema = z.object({
  companies: z.array(CompanySchema)
    .min(0, 'Companies array cannot be null')
    .max(10000, 'Too many companies (max 10,000)'),
  fund_size_cents: z.number()
    .int('Fund size must be in integer cents')
    .nonnegative('Fund size cannot be negative')
    .max(Number.MAX_SAFE_INTEGER, 'Fund size exceeds maximum safe integer'),
  quarter_index: z.number()
    .int('Quarter index must be an integer')
    .min(1900 * 4, 'Quarter index before year 1900')
    .max(2100 * 4 + 3, 'Quarter index after year 2100')
});

// Allocation decision schema
export const AllocationDecisionSchema = z.object({
  company_id: z.string().min(1),
  planned_cents: z.number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER),
  reason: z.string(),
  cap_cents: z.number()
    .int()
    .nonnegative(),
  iteration: z.number()
    .int()
    .positive()
    .max(10)
});

// Reserves output schema
export const ReservesOutputSchema = z.object({
  allocations: z.array(AllocationDecisionSchema),
  remaining_cents: z.number()
    .int()
    .nonnegative(),
  metadata: z.object({
    total_available_cents: z.number().int().nonnegative(),
    total_allocated_cents: z.number().int().nonnegative(),
    companies_funded: z.number().int().nonnegative(),
    max_iterations: z.number().int().positive(),
    conservation_check: z.boolean(),
    exit_moic_ranking: z.array(z.string())
  })
});

// Reserves result schema
export const ReservesResultSchema = z.object({
  ok: z.boolean(),
  data: ReservesOutputSchema.optional(),
  error: z.string().optional(),
  warnings: z.array(z.string()).optional(),
  metrics: z.object({
    duration_ms: z.number().nonnegative(),
    company_count: z.number().int().nonnegative(),
    policy_type: z.string()
  }).optional()
});

// Type exports
export type Company = z.infer<typeof CompanySchema>;
export type ReservesConfig = z.infer<typeof ReservesConfigSchema>;
export type ReservesInput = z.infer<typeof ReservesInputSchema>;
export type ReservesOutput = z.infer<typeof ReservesOutputSchema>;
export type ReservesResult = z.infer<typeof ReservesResultSchema>;

// Validation helpers
export function validateCompany(data: unknown): Company {
  return CompanySchema.parse(data);
}

export function validateCompanies(data: unknown[]): Company[] {
  return z.array(CompanySchema).parse(data);
}

export function validateConfig(data: unknown): ReservesConfig {
  return ReservesConfigSchema.parse(data);
}

export function validateInput(data: unknown): ReservesInput {
  return ReservesInputSchema.parse(data);
}

export function validateOutput(data: unknown): ReservesOutput {
  return ReservesOutputSchema.parse(data);
}

export function validateResult(data: unknown): ReservesResult {
  return ReservesResultSchema.parse(data);
}

// Safe validation with error handling
export function safeValidateCompany(data: unknown): { success: true; data: Company } | { success: false; error: z.ZodError } {
  const result = CompanySchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, error: result.error };
  }
}

export function safeValidateConfig(data: unknown): { success: true; data: ReservesConfig } | { success: false; error: z.ZodError } {
  const result = ReservesConfigSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, error: result.error };
  }
}

// Adapter with validation
export function adaptAndValidateCompanies(rawData: unknown[]): {
  valid: Company[];
  invalid: Array<{ index: number; errors: string[] }>;
} {
  const valid: Company[] = [];
  const invalid: Array<{ index: number; errors: string[] }> = [];
  
  rawData.forEach((item, index) => {
    const result = CompanySchema.safeParse(item);
    if (result.success) {
      valid.push(result.data);
    } else {
      invalid.push({
        index,
        errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
      });
    }
  });
  
  return { valid, invalid };
}

// Money utilities with validation
export function dollarsToCentsValidated(dollars: unknown): number {
  const parsed = z.number().safeParse(dollars);
  if (!parsed.success) return 0;
  
  const cents = Math.floor(parsed.data * 100);
  if (cents < 0) return 0;
  if (cents > Number.MAX_SAFE_INTEGER) {
    throw new Error('Amount exceeds maximum safe integer');
  }
  
  return cents;
}

export function percentToBpsValidated(percent: unknown): number {
  const parsed = z.number().safeParse(percent);
  if (!parsed.success) return 0;
  
  const bps = Math.round(parsed.data * 100);
  if (bps < 0) return 0;
  if (bps > 10000) return 10000; // Cap at 100%
  
  return bps;
}