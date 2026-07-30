import { z } from 'zod';

import { Decimal } from '../../lib/decimal-config';
import { MoneyDecimalStringSchema } from '../../lib/decimal-string';

export const FUND_ACCOUNTING_STATE_OBSERVATION_VERSION =
  'fund-accounting-state-observation/1.0.0' as const;

const NonnegativeMoneyDecimalStringSchema = MoneyDecimalStringSchema.pipe(
  z
    .string()
    .refine(
      (value) => !value.startsWith('-') && new Decimal(value).gte(0),
      'Money must be a canonical nonnegative decimal string.'
    )
);

function normalizeRfc3339UtcInstant(value: string): string {
  const match = /^(.*:\d{2})(?:\.(\d+))?Z$/.exec(value);
  if (!match) return value;

  const fractionalSeconds = (match[2] ?? '').replace(/0+$/, '');
  return `${match[1]}${fractionalSeconds ? `.${fractionalSeconds}` : ''}Z`;
}

export const FundAccountingStateObservationV1Schema = z
  .object({
    contractVersion: z.literal(FUND_ACCOUNTING_STATE_OBSERVATION_VERSION),
    cutoverInstant: z.string().datetime(),
    currency: z.literal('USD'),
    cashBalanceUsd: NonnegativeMoneyDecimalStringSchema,
    cumulativeLpPaidInUsd: NonnegativeMoneyDecimalStringSchema,
    cumulativeGpPaidInUsd: NonnegativeMoneyDecimalStringSchema,
    lpUnreturnedContributedCapitalUsd: NonnegativeMoneyDecimalStringSchema,
    gpUnreturnedContributedCapitalUsd: NonnegativeMoneyDecimalStringSchema,
    lpDistributionsReturnOfCapitalUsd: NonnegativeMoneyDecimalStringSchema,
    lpDistributionsProfitUsd: NonnegativeMoneyDecimalStringSchema,
    actualLpDistributionsCumulativeUsd: NonnegativeMoneyDecimalStringSchema,
    gpInvestmentDistributionsPaidUsd: NonnegativeMoneyDecimalStringSchema,
    gpCarryPaidUsd: NonnegativeMoneyDecimalStringSchema,
    accruedPreferredReturnUsd: NonnegativeMoneyDecimalStringSchema,
    accruedPreferredReturnThroughInstant: z.string().datetime(),
    recallableDistributionsCumulativeUsd: NonnegativeMoneyDecimalStringSchema,
    recallableDistributionsOutstandingUsd: NonnegativeMoneyDecimalStringSchema,
    recycledProceedsCumulativeUsd: NonnegativeMoneyDecimalStringSchema,
    realizedProceedsCumulativeUsd: NonnegativeMoneyDecimalStringSchema,
    methodologyVersion: z.string().min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    const actualLpDistributionsCumulativeUsd = new Decimal(
      value.actualLpDistributionsCumulativeUsd
    );
    const expectedLpDistributionsCumulativeUsd = new Decimal(
      value.lpDistributionsReturnOfCapitalUsd
    ).plus(value.lpDistributionsProfitUsd);

    if (!actualLpDistributionsCumulativeUsd.eq(expectedLpDistributionsCumulativeUsd)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['actualLpDistributionsCumulativeUsd'],
        message: 'actualLpDistributionsCumulativeUsd must equal return of capital plus profit.',
      });
    }

    if (
      !new Decimal(value.recallableDistributionsOutstandingUsd).lte(
        value.recallableDistributionsCumulativeUsd
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recallableDistributionsOutstandingUsd'],
        message:
          'recallableDistributionsOutstandingUsd must not exceed cumulative recallable distributions.',
      });
    }

    if (
      normalizeRfc3339UtcInstant(value.accruedPreferredReturnThroughInstant) !==
      normalizeRfc3339UtcInstant(value.cutoverInstant)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['accruedPreferredReturnThroughInstant'],
        message: 'accruedPreferredReturnThroughInstant must equal cutoverInstant.',
      });
    }
  });

export const FundAccountingStateSnapshotRefV1Schema = z
  .object({
    sourceArtifactId: z.number().int().positive(),
    sourceArtifactSha256: z.string().regex(/^[a-f0-9]{64}$/),
    sourceArtifactCreatedAt: z.string().datetime(),
    attestedByActorId: z.number().int().positive(),
    observation: FundAccountingStateObservationV1Schema,
  })
  .strict();

export type FundAccountingStateObservationV1 = z.infer<
  typeof FundAccountingStateObservationV1Schema
>;
export type FundAccountingStateSnapshotRefV1 = z.infer<
  typeof FundAccountingStateSnapshotRefV1Schema
>;
