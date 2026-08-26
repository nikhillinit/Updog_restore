import { z } from 'zod';

import { Decimal } from '../../lib/decimal-config';
import { MoneyDecimalStringSchema } from '../../lib/decimal-string';

export const FUND_ACCOUNTING_STATE_OBSERVATION_VERSION_1_1_0 =
  'fund-accounting-state-observation/1.1.0' as const;

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

const FundAccountingStateObservationV1_1BaseSchema = z
  .object({
    contractVersion: z.literal(FUND_ACCOUNTING_STATE_OBSERVATION_VERSION_1_1_0),
    cutoverInstant: z.string().datetime(),
    currency: z.literal('USD'),
    cashBalanceUsd: NonnegativeMoneyDecimalStringSchema,
    cumulativeLpPaidInUsd: NonnegativeMoneyDecimalStringSchema,
    cumulativeGpPaidInUsd: NonnegativeMoneyDecimalStringSchema,
    gpUnreturnedContributedCapitalUsd: NonnegativeMoneyDecimalStringSchema,
    /**
     * Actual LP return-of-capital cash, net of recycling and recallables.
     * Recycled and recallable balances are separate and are not added back.
     */
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
  .strict();

export const FundAccountingStateObservationV1_1Schema =
  FundAccountingStateObservationV1_1BaseSchema.superRefine((value, ctx) => {
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
  })
    .transform((value) => ({
      ...value,
      lpUnreturnedContributedCapitalUsd: new Decimal(value.cumulativeLpPaidInUsd)
        .minus(value.lpDistributionsReturnOfCapitalUsd)
        .toFixed(6),
    }))
    .superRefine((value, ctx) => {
      if (new Decimal(value.lpUnreturnedContributedCapitalUsd).lt(0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lpUnreturnedContributedCapitalUsd'],
          message: 'Derived lpUnreturnedContributedCapitalUsd must not be negative.',
        });
      }
    });

export const FundAccountingStateSnapshotRefV1_1Schema = z
  .object({
    sourceArtifactId: z.number().int().positive(),
    sourceArtifactSha256: z.string().regex(/^[a-f0-9]{64}$/),
    sourceArtifactCreatedAt: z.string().datetime(),
    attestedByActorId: z.number().int().positive(),
    observation: FundAccountingStateObservationV1_1Schema,
  })
  .strict();

export type FundAccountingStateObservationV1_1 = z.infer<
  typeof FundAccountingStateObservationV1_1Schema
>;
export type FundAccountingStateSnapshotRefV1_1 = z.infer<
  typeof FundAccountingStateSnapshotRefV1_1Schema
>;
