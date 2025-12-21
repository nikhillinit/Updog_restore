import { z } from 'zod';

const percentageSchema = z.number().min(0).max(100);
const decimalPercentageSchema = z.number().min(0).max(1);

const pacingPeriodSchema = z.object({
  id: z.string().min(1),
  startMonth: z.number().int().min(0).max(120),
  endMonth: z.number().int().min(0).max(120),
  allocationPercent: percentageSchema
}).superRefine((data, ctx) => {
  if (data.endMonth <= data.startMonth) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'End month must be after start month',
      path: ['endMonth']
    });
  }
});

const capitalAllocationSchema = z.object({
  entryStrategy: z.enum(['amount-based', 'ownership-based']).default('amount-based'),
  initialCheckSize: z.number().positive().refine(val => val >= 0.1).refine(val => val <= 50),
  followOnStrategy: z.object({
    reserveRatio: decimalPercentageSchema.refine(val => val >= 0.3 && val <= 0.7),
    stageAllocations: z.array(z.any())
  }),
  pacingModel: z.object({
    investmentsPerYear: z.number().int().min(1).max(50),
    deploymentCurve: z.enum(['linear', 'front-loaded', 'back-loaded'])
  }),
  pacingHorizon: z.array(pacingPeriodSchema).min(1)
});

const minimalData = {
  entryStrategy: 'amount-based',
  initialCheckSize: 1.0,
  followOnStrategy: {
    reserveRatio: 0.5,
    stageAllocations: []
  },
  pacingModel: {
    investmentsPerYear: 10,
    deploymentCurve: 'linear'
  },
  pacingHorizon: [
    {
      id: 'p1',
      startMonth: 0,
      endMonth: 12,
      allocationPercent: 100
    }
  ]
};

const result = capitalAllocationSchema.safeParse(minimalData);
console.log('Success:', result.success);
if (!result.success) {
  console.log('Errors:', JSON.stringify(result.error.errors, null, 2));
}
