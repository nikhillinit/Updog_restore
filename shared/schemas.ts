import { z } from 'zod';
import { nonNegative, bounded01 } from './schema-helpers';

export const StageSchema = z.enum(['preseed', 'seed', 'series_a', 'series_b', 'series_c', 'series_dplus']);
export const Dollars = nonNegative().finite();
export const Percent = bounded01();

export const CompanySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  stage: StageSchema,
  invested: nonNegative(),
  ownership: Percent,
  reserveCap: nonNegative().optional()
});

export const StagePolicySchema = z.object({
  stage: StageSchema,
  reserveMultiple: z.number().positive(),
  weight: z.number().positive().default(1),
});

export const ConstraintsSchema = z.object({
  minCheck: nonNegative().default(0),
  maxPerCompany: nonNegative().default(Number.POSITIVE_INFINITY),
  maxPerStage: z.record(StageSchema, nonNegative()).default({}),
  discountRateAnnual: bounded01().default(0.12),
  graduationYears: z.record(StageSchema, z.number().positive()).default({preseed:8,seed:7,series_a:6,series_b:5,series_c:4,series_dplus:3}),
  graduationProb: z.record(StageSchema, bounded01()).default({preseed:0.1,seed:0.2,series_a:0.35,series_b:0.5,series_c:0.65,series_dplus:0.8})
}).partial();

export const ReserveInputSchema = z.object({
  availableReserves: nonNegative(),
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

// Dual approval system for reserve strategy changes
export const ReserveStrategyApprovalSchema = z.object({
  id: z.string().uuid(),
  strategyId: z.string(),
  requestedBy: z.string().email(),
  requestedAt: z.date(),
  changes: z.object({
    action: z.enum(['create', 'update', 'delete']),
    strategyData: z.record(z.unknown()),
    reason: z.string().min(10),
    impact: z.object({
      affectedFunds: z.array(z.string()),
      estimatedAmount: z.number(),
      riskLevel: z.enum(['low', 'medium', 'high'])
    })
  }),
  approvals: z.array(z.object({
    partnerEmail: z.string().email(),
    approvedAt: z.date(),
    signature: z.string(), // Digital signature or approval token
    ipAddress: z.string().ip(),
    userAgent: z.string().optional()
  })),
  status: z.enum(['pending', 'approved', 'rejected', 'expired']),
  expiresAt: z.date(),
  metadata: z.object({
    calculationHash: z.string().optional(), // For determinism verification
    auditTrail: z.array(z.object({
      timestamp: z.date(),
      action: z.string(),
      actor: z.string().email(),
      details: z.record(z.unknown())
    }))
  })
});

export type ReserveStrategyApproval = z.infer<typeof ReserveStrategyApprovalSchema>;