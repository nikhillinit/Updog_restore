import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import type { DynamicReserveIntelligenceRunV1 } from '@shared/contracts/dynamic-reserve-intelligence-v1.contract';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const centsSchema = z.number().int().safe();
const nullableCentsSchema = centsSchema.nullable();
const decimalStringSchema = z.string().regex(/^-?\d+(?:\.\d+)?$/);

const warningSchema = z
  .object({
    code: z.string().min(1),
    severity: z.string().min(1),
    message: z.string().min(1),
  })
  .passthrough();

const companyFactSchema = z
  .object({
    companyId: z.number().int().positive(),
    companyName: z.string().min(1),
    planningFmvStatus: z.string().min(1),
    currencyStatus: z.string().min(1),
    latestPlanningFmvDate: z.string().nullable(),
    warnings: z.array(warningSchema),
    inputHash: sha256Schema,
    provenance: z
      .object({
        trustState: z.string().min(1),
        core: z
          .object({
            sourceKind: z.string().min(1),
            sourceEngine: z.string().min(1).optional(),
            engineVersion: z.string().min(1).optional(),
            assumptionsHash: z.string().min(1).optional(),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

const financialFactsWarningSchema = z
  .object({
    code: z.string().min(1),
    severity: z.string().min(1),
    message: z.string().min(1),
  })
  .passthrough();

const consumerEvaluationSchema = z
  .object({
    consumer: z.string().min(1),
    status: z.enum(['accepted', 'blocked']),
    reasons: z.array(z.string().min(1)),
    details: z
      .array(
        z
          .object({
            code: z.string().min(1),
            message: z.string().min(1).optional(),
          })
          .passthrough()
      )
      .optional(),
  })
  .passthrough();

const factsSnapshotSchema = z
  .object({
    policyVersion: z.enum([
      'financial-facts-policy/1.0.0',
      'financial-facts-policy/1.0.1',
      'financial-facts-policy/1.1.0',
    ]),
    asOfDate: z.string().date(),
    snapshotInputHash: sha256Schema,
    consumerEvaluations: z.array(consumerEvaluationSchema),
    payload: z
      .object({
        companyActuals: z
          .object({
            facts: z.array(companyFactSchema),
          })
          .passthrough(),
        cashFlowSeries: z
          .object({
            warnings: z.array(financialFactsWarningSchema),
          })
          .passthrough(),
        marksSeries: z
          .object({
            warnings: z.array(financialFactsWarningSchema),
            periodNav: z.array(
              z
                .object({
                  warnings: z.array(financialFactsWarningSchema),
                })
                .passthrough()
            ),
          })
          .passthrough(),
        participationTermRefs: z.array(z.union([z.string(), z.object({}).passthrough()])),
        valuationRefs: z
          .array(
            z
              .object({
                basis: z.enum(['direct', 'derived', 'unavailable']),
              })
              .passthrough()
          )
          .optional(),
      })
      .passthrough(),
  })
  .passthrough();

const reserveIntelligenceRunSchema = z
  .object({
    snapshotId: z.number().int().positive(),
    createdAt: z.string().datetime(),
    result: z
      .object({
        contractVersion: z.literal('dynamic-reserve-intelligence-v1'),
        fundId: z.number().int().positive(),
        actionability: z.enum(['actionable', 'non_actionable']),
        companies: z.array(
          z
            .object({
              companyId: z.number().int().positive(),
              name: z.string().min(1),
              canonicalStage: z.enum([
                'pre_seed',
                'seed',
                'series_a',
                'series_b',
                'series_c',
                'series_d',
                'growth',
                'late_stage',
              ]),
              status: z.enum(['actionable', 'indicative', 'unavailable']),
              rank: z.number().int().positive().nullable(),
              marginalMoic: decimalStringSchema.nullable(),
              systemAllocatedCents: centsSchema.nonnegative(),
              overlayPlannedCents: nullableCentsSchema,
              deltaCents: nullableCentsSchema,
              concentration: decimalStringSchema.nullable(),
            })
            .passthrough()
        ),
        fund: z
          .object({
            totalSystemAllocatedCents: centsSchema.nonnegative(),
            totalOverlayPlannedCents: nullableCentsSchema,
            totalDeltaCents: nullableCentsSchema,
            followOnCapacityCents: centsSchema,
            failSafe: z.boolean(),
            failSafeReason: z.string().nullable(),
            excluded: z.array(
              z
                .object({
                  companyId: z.number().int().positive(),
                  reason: z.enum(['unavailable', 'indicative']),
                })
                .passthrough()
            ),
            disclosedDefaults: z.array(z.string()),
          })
          .passthrough(),
        constraintFindings: z.array(
          z
            .object({
              code: z.literal('overlay_unknown_company'),
              companyId: z.number().int().positive(),
            })
            .passthrough()
        ),
        provenance: z
          .object({
            financialFactsSnapshotId: z.number().int().positive(),
            assumptionsHash: sha256Schema,
            effectiveMode: z.enum(['shadow', 'on']),
            h9Actionability: z.string().min(1),
            overlayProvenance: z
              .object({
                suppliedBy: z.number().int().positive().nullable(),
                suppliedAt: z.string().datetime(),
              })
              .passthrough(),
            overlay: z
              .array(
                z
                  .object({
                    companyId: z.number().int().positive(),
                    plannedReserveCents: centsSchema.nonnegative(),
                  })
                  .passthrough()
              )
              .nullable(),
            calcVersion: z.string().min(1),
            asOfDate: z.string().date(),
            factsSnapshot: factsSnapshotSchema,
            marginalNonFactsSources: z
              .object({
                approvedAllocations: z.array(
                  z
                    .object({
                      companyId: z.number().int().positive(),
                      decisionType: z.string(),
                      decisionStatus: z.string(),
                      finalPlannedReservesCents: z
                        .string()
                        .regex(/^-?\d+$/)
                        .nullable(),
                      liveAllocationVersion: z.number().int().nullable(),
                      decidedAt: z.string().datetime().nullable(),
                    })
                    .passthrough()
                ),
              })
              .passthrough(),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

export type ReserveIntelligenceHookError = Error & {
  code?: 'CONTRACT_PARSE_ERROR';
  status?: number;
};

export type ReserveIntelligenceQueryResult =
  | { kind: 'feature-disabled' }
  | { kind: 'no-run' }
  | { kind: 'ready'; run: DynamicReserveIntelligenceRunV1 };

function isReserveIntelligenceRun(value: unknown): value is DynamicReserveIntelligenceRunV1 {
  return reserveIntelligenceRunSchema.safeParse(value).success;
}

function getErrorCode(response: unknown): string | null {
  if (typeof response !== 'object' || response === null || !('error' in response)) {
    return null;
  }
  const error = (response as { error?: unknown }).error;
  return typeof error === 'string' ? error : null;
}

function getErrorMessage(response: unknown): string {
  if (typeof response === 'object' && response !== null && 'message' in response) {
    const message = (response as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }
  return 'Failed to load reserve intelligence';
}

function buildContractError(status?: number): ReserveIntelligenceHookError {
  const error = new Error(
    'Reserve intelligence contract parse failed'
  ) as ReserveIntelligenceHookError;
  error.code = 'CONTRACT_PARSE_ERROR';
  if (status !== undefined) {
    error.status = status;
  }
  return error;
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => {
    throw buildContractError(response.status);
  });
}

export function useReserveIntelligence(fundId: number | null) {
  const validFundId = fundId !== null && Number.isInteger(fundId) && fundId > 0 ? fundId : null;

  return useQuery<ReserveIntelligenceQueryResult, ReserveIntelligenceHookError>({
    queryKey: ['reserve-intelligence-latest', validFundId],
    queryFn: async () => {
      if (validFundId === null) {
        throw new Error('A positive fund ID is required') as ReserveIntelligenceHookError;
      }

      const response = await fetch(`/api/funds/${validFundId}/moic/reserve-intelligence/latest`, {
        credentials: 'include',
      });

      if (response.status === 404) {
        const body: unknown = await response.json().catch(() => ({}));
        return getErrorCode(body) === 'RESERVE_INTELLIGENCE_RUN_NOT_FOUND'
          ? { kind: 'no-run' }
          : { kind: 'feature-disabled' };
      }

      if (!response.ok) {
        const body: unknown = await response.json().catch(() => ({}));
        const error = new Error(getErrorMessage(body)) as ReserveIntelligenceHookError;
        error.status = response.status;
        throw error;
      }

      const raw = await readJson(response);
      if (!isReserveIntelligenceRun(raw)) {
        throw buildContractError(response.status);
      }
      return { kind: 'ready', run: raw };
    },
    enabled: validFundId !== null,
    retry: (failureCount, error) =>
      error.status !== 404 && error.code !== 'CONTRACT_PARSE_ERROR' && failureCount < 2,
  });
}
