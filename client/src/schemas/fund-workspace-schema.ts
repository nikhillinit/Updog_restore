import { z } from 'zod';
import { EconomicsAssumptionsV1Schema } from '@shared/contracts/economics-v1.contract';
import {
  FundDraftETagSchema,
  FundWorkflowKeySchema,
} from '@shared/contracts/fund-workflow-v1.contract';

const number = z.number().finite();
const idName = { id: z.string(), name: z.string() };
const fundId = number.int().positive().safe();
const command = {
  key: FundWorkflowKeySchema,
  bodySignature: z.string().refine((body) => {
    try {
      const value: unknown = JSON.parse(body);
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    } catch {
      return false;
    }
  }, 'Command body must be a JSON object'),
  dispatchedAt: z.string().datetime({ offset: true }),
};
const draftCommand = {
  ...command,
  targetFundId: fundId,
  expectedETag: FundDraftETagSchema.nullable(),
};
const pendingCommand = z
  .discriminatedUnion('operation', [
    z
      .object({
        ...command,
        operation: z.literal('create'),
        targetFundId: z.null(),
        expectedETag: z.null(),
      })
      .strict(),
    z.object({ ...draftCommand, operation: z.literal('save_draft') }).strict(),
    z.object({ ...draftCommand, operation: z.literal('publish_draft') }).strict(),
    z
      .object({
        ...draftCommand,
        operation: z.literal('finalize'),
        targetFundId: fundId.nullable(),
      })
      .strict(),
  ])
  .refine((value) => value.targetFundId !== null || value.expectedETag === null);

// Recovery accepts unfinished form values. Business validation belongs to save/publish.
export const FundWorkspaceEnvelopeSchema = z
  .object({
    envelope: z.literal('fund-workspace/1'),
    workspaceActorId: z.string().min(1).nullable(),
    sessionId: FundWorkflowKeySchema,
    creationKey: FundWorkflowKeySchema.nullable(),
    draftFundId: fundId.nullable(),
    draftServerReady: z.boolean(),
    draftETag: FundDraftETagSchema.nullable(),
    pendingCommand: pendingCommand.nullable(),
    fundName: z.string().optional(),
    establishmentDate: z.string().optional(),
    modelInputsAsOfDate: z.string().optional(),
    vintageYear: number.optional(),
    isEvergreen: z.boolean().optional(),
    fundLife: number.optional(),
    investmentPeriod: number.optional(),
    fundSize: number.optional(),
    managementFeeRate: number.optional(),
    carriedInterest: number.optional(),
    gpCommitment: number.optional(),
    fundedFromFeesPct: number,
    lpClasses: z.array(
      z
        .object({
          ...idName,
          targetAllocation: number,
          managementFeeRate: number.optional(),
          carriedInterest: number.optional(),
          preferredReturn: number.optional(),
        })
        .strict()
    ),
    lps: z.array(
      z
        .object({
          ...idName,
          commitment: number,
          lpClassId: z.string().optional(),
          type: z.enum(['institutional', 'family-office', 'fund-of-funds', 'individual', 'other']),
        })
        .strict()
    ),
    stages: z.array(
      z.object({ ...idName, graduate: number, exit: number, months: number }).strict()
    ),
    sectorProfiles: z.array(
      z.object({ ...idName, targetPercentage: number, description: z.string().optional() }).strict()
    ),
    allocations: z.array(
      z
        .object({
          id: z.string(),
          category: z.string(),
          percentage: number,
          description: z.string().optional(),
        })
        .strict()
    ),
    followOnChecks: z.object({ A: number, B: number, C: number }).strict(),
    capitalStageAllocations: z.array(
      z.object({ id: z.string(), label: z.string(), pct: number }).strict()
    ),
    capitalPlanAllocations: z.array(
      z
        .object({
          ...idName,
          sectorProfileId: z.string().optional(),
          entryRound: z.string(),
          capitalAllocationPct: number,
          initialCheckStrategy: z.enum(['amount', 'ownership']),
          initialCheckAmount: number.optional(),
          initialOwnershipPct: number.optional(),
          followOnStrategy: z.enum(['amount', 'maintain_ownership']),
          followOnAmount: number.optional(),
          followOnParticipationPct: number,
          investmentHorizonMonths: number,
        })
        .strict()
    ),
    pipelineProfiles: z.array(
      z
        .object({
          ...idName,
          stages: z.array(
            z
              .object({
                ...idName,
                roundSize: number,
                valuation: number,
                valuationType: z.enum(['pre', 'post']),
                esopPct: number,
                graduationRate: number,
                exitRate: number,
                exitValuation: number,
                monthsToGraduate: number,
                monthsToExit: number,
              })
              .strict()
          ),
        })
        .strict()
    ),
    waterfallType: z.enum(['american', 'hybrid']).optional(),
    waterfallTiers: z.array(
      z
        .object({
          ...idName,
          preferredReturn: number.optional(),
          catchUp: number.optional(),
          gpSplit: number,
          lpSplit: number,
          condition: z.enum(['irr', 'moic', 'none']).optional(),
          conditionValue: number.optional(),
        })
        .strict()
    ),
    recyclingEnabled: z.boolean().optional(),
    recyclingType: z.enum(['exits', 'fees', 'both']).optional(),
    recyclingCap: number.optional(),
    recyclingPeriod: number.optional(),
    exitRecyclingRate: number.optional(),
    mgmtFeeRecyclingRate: number.optional(),
    allowFutureRecycling: z.boolean().optional(),
    feeProfiles: z.array(
      z
        .object({
          ...idName,
          feeTiers: z.array(
            z
              .object({
                ...idName,
                percentage: number,
                feeBasis: z.enum([
                  'committed_capital',
                  'called_capital_period',
                  'gross_cumulative_called',
                  'net_cumulative_called',
                  'cumulative_invested',
                  'fair_market_value',
                  'unrealized_investments',
                ]),
                startMonth: number,
                endMonth: number.optional(),
                recyclingPercentage: number.optional(),
              })
              .strict()
          ),
        })
        .strict()
    ),
    fundExpenses: z.array(
      z
        .object({
          id: z.string(),
          category: z.string(),
          monthlyAmount: number,
          startMonth: number,
          endMonth: number.optional(),
        })
        .strict()
    ),
    economicsAssumptions: EconomicsAssumptionsV1Schema.optional(),
  })
  .strict()
  .refine(
    (value) => value.draftFundId !== null || (!value.draftServerReady && value.draftETag === null)
  )
  .refine(
    (value) =>
      value.pendingCommand == null ||
      value.pendingCommand.targetFundId == null ||
      value.pendingCommand.targetFundId === value.draftFundId
  );
