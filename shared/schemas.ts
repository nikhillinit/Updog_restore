import { z } from 'zod';

export const StageSchema = z.enum(['preseed', 'seed', 'series_a', 'series_b', 'series_c', 'series_dplus']);
export const Dollars = z.number().min(0).finite();
export const Percent = z.number().min(0).max(1);

export const CompanySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  stage: StageSchema,
  invested: z.number().min(0),
  ownership: Percent,
  reserveCap: z.number().min(0).optional()
});

export const StagePolicySchema = z.object({
  stage: StageSchema,
  reserveMultiple: z.number().positive(),
  weight: z.number().positive().default(1),
});

export const ConstraintsSchema = z.object({
  minCheck: z.number().min(0).default(0),
  maxPerCompany: z.number().min(0).default(Number.POSITIVE_INFINITY),
  maxPerStage: z.record(StageSchema, z.number().min(0)).default({}),
  discountRateAnnual: z.number().min(0).max(1).default(0.12),
  graduationYears: z.record(StageSchema, z.number().positive()).default({preseed:8,seed:7,series_a:6,series_b:5,series_c:4,series_dplus:3}),
  graduationProb: z.record(StageSchema, z.number().min(0).max(1)).default({preseed:0.1,seed:0.2,series_a:0.35,series_b:0.5,series_c:0.65,series_dplus:0.8})
}).partial();

export const ReserveInputSchema = z.object({
  availableReserves: z.number().min(0),
  companies: z.array(CompanySchema).min(0),
  stagePolicies: z.array(StagePolicySchema).min(1),
  constraints: ConstraintsSchema.optional()
});

export type ReserveInput = z.infer<typeof ReserveInputSchema>;

export function validateReserveInput(raw: unknown) {
  const parsed = ReserveInputSchema.safeParse(raw);
  if (!parsed.success) return { ok:false as const, status:400, issues:[{code:'schema', message:parsed.error.message}] };
  const v = parsed.data;

  const issues: any[] = [];
  const stages = new Set(v.stagePolicies.map(p=>p.stage));
  for (const c of v.companies) {
    if (!stages.has(c.stage)) issues.push({code:'stage_policy', companyId:c.id, stage:c.stage});
  }
  if (issues.length) return { ok:false as const, status:422, issues };
  return { ok:true as const, data:v };
}