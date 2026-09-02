/**
 * Construction reconciliation v1 contract (C1A).
 *
 * The persisted calculation uses the calc-substrate vocabulary. API
 * presentation adds the ADR-042 warning and dataset-trust vocabulary without
 * merging either vocabulary into the other.
 *
 * CalcBasis values service will use (documentation only; no duplicated
 * runtime constants):
 * - contractVersion: 'calc-substrate/1.0.0'
 * - calculationKey: 'construction-reconciliation'
 * - configuredMode: 'on'
 * - effectiveMode: 'on'
 * - killSwitchActive: false
 * - engineVersion: 'construction-rec-v1'
 * - methodologyVersion: 'construction-reconciliation/1.0.0'
 * - inputHash: canonical-JSON SHA-256 of
 *   { fundId, currentPlanVersionId, financialFactsSnapshotId, snapshotInputHash }
 * - assumptionsHash: current_plan_versions.assumptionsHash
 */

import { z } from 'zod';

import { createCalcResultSchema, toDatasetTrustState } from '../core/calc-substrate/calc-result';
import { MoneyDecimalStringSchema } from '../lib/decimal-string';
import { DatasetTrustStateSchema, StructuredWarningSchema } from './provenance-envelope.contract';

const PositiveIdSchema = z.number().int().positive();
const IsoDateSchema = z.string().date();
const NonnegativeMoneyDecimalStringSchema = MoneyDecimalStringSchema.refine(
  (value) => !value.startsWith('-'),
  'must be a nonnegative 6-decimal money string'
);

export const ConstructionReconciliationRequestSchema = z
  .object({
    contractVersion: z.literal('construction-reconciliation/1.0.0'),
    fundId: PositiveIdSchema,
    currentPlanVersionId: PositiveIdSchema,
    // Optional: when absent the server resolves the fund's current
    // non-superseded facts snapshot inside the locked transaction and records
    // the resolved id in the persisted snapshot metadata (the same snapshot-
    // resolution pattern used by current-forecast computation services).
    financialFactsSnapshotId: PositiveIdSchema.optional(),
  })
  .strict();

export const ConstructionReconciliationValueSchema = z
  .object({
    deployableCapitalUsd: NonnegativeMoneyDecimalStringSchema,
    plannedInitialUsd: NonnegativeMoneyDecimalStringSchema,
    plannedFollowOnUsd: NonnegativeMoneyDecimalStringSchema,
    plannedTotalUsd: NonnegativeMoneyDecimalStringSchema,
    plannedCapitalOverDeployableUsd: NonnegativeMoneyDecimalStringSchema,
    actualInitialUsd: NonnegativeMoneyDecimalStringSchema,
    actualFollowOnUsd: NonnegativeMoneyDecimalStringSchema,
    actualTotalEquityUsd: NonnegativeMoneyDecimalStringSchema,
    excludedNonEquityUsd: NonnegativeMoneyDecimalStringSchema,
    remainingDeployableUsd: NonnegativeMoneyDecimalStringSchema,
    plannedRemainingUsd: NonnegativeMoneyDecimalStringSchema,
    remainingDeployableGapUsd: MoneyDecimalStringSchema,
    asOfDate: IsoDateSchema,
    currency: z.literal('USD'),
  })
  .strict();

export const ConstructionReconciliationResultSchema = createCalcResultSchema(
  ConstructionReconciliationValueSchema
);

function validateTrustState(
  result: z.infer<typeof ConstructionReconciliationResultSchema>,
  trustState: z.infer<typeof DatasetTrustStateSchema>,
  ctx: z.RefinementCtx
): void {
  const expectedTrustState = toDatasetTrustState(result.state);
  if (trustState !== expectedTrustState) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['trustState'],
      message: `trustState must match result state via toDatasetTrustState (${expectedTrustState})`,
    });
  }
}

export const ConstructionReconciliationPresentationEnvelopeSchema = z
  .object({
    result: ConstructionReconciliationResultSchema,
    structuredWarnings: z.array(StructuredWarningSchema),
    trustState: DatasetTrustStateSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    validateTrustState(value.result, value.trustState, ctx);
  });

export const ConstructionReconciliationPersistedPresentationEnvelopeSchema = z
  .object({
    state: z.literal('persisted'),
    result: ConstructionReconciliationResultSchema,
    structuredWarnings: z.array(StructuredWarningSchema),
    trustState: DatasetTrustStateSchema,
    currentPlanVersionId: PositiveIdSchema,
    financialFactsSnapshotId: PositiveIdSchema,
    asOfDate: IsoDateSchema,
  })
  .strict();

export const ConstructionReconciliationNoPersistedReconciliationSchema = z
  .object({
    state: z.literal('no_persisted_reconciliation'),
  })
  .strict();

export const ConstructionReconciliationLatestResponseSchema = z
  .discriminatedUnion('state', [
    ConstructionReconciliationPersistedPresentationEnvelopeSchema,
    ConstructionReconciliationNoPersistedReconciliationSchema,
  ])
  .superRefine((value, ctx) => {
    if (value.state !== 'persisted') return;

    validateTrustState(value.result, value.trustState, ctx);

    if (value.result.state !== 'available' && value.result.state !== 'indicative') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['result', 'state'],
        message: 'persisted reconciliation must be available or indicative',
      });
      return;
    }

    if (value.asOfDate !== value.result.value.asOfDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['asOfDate'],
        message: 'asOfDate label must match persisted reconciliation value',
      });
    }
  });

export type ConstructionReconciliationRequest = z.infer<
  typeof ConstructionReconciliationRequestSchema
>;
export type ConstructionReconciliationValue = z.infer<typeof ConstructionReconciliationValueSchema>;
export type ConstructionReconciliationResult = z.infer<
  typeof ConstructionReconciliationResultSchema
>;
export type ConstructionReconciliationPresentationEnvelope = z.infer<
  typeof ConstructionReconciliationPresentationEnvelopeSchema
>;
export type ConstructionReconciliationPersistedPresentationEnvelope = z.infer<
  typeof ConstructionReconciliationPersistedPresentationEnvelopeSchema
>;
export type ConstructionReconciliationNoPersistedReconciliation = z.infer<
  typeof ConstructionReconciliationNoPersistedReconciliationSchema
>;
export type ConstructionReconciliationLatestResponse = z.infer<
  typeof ConstructionReconciliationLatestResponseSchema
>;
