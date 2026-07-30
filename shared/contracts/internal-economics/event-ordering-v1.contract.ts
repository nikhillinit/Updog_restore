import { z } from 'zod';

export const INTERNAL_ECONOMICS_EVENT_ORDERING_VERSION =
  'internal-economics-event-ordering/1.0.0' as const;

export const InternalEconomicsEventTypeV1Schema = z.enum([
  'lp_capital_call',
  'portfolio_investment',
  'fund_expense',
  'realized_proceeds',
  'lp_distribution',
  'recallable_distribution',
]);

export type InternalEconomicsEventTypeV1 = z.infer<typeof InternalEconomicsEventTypeV1Schema>;

export const InternalEconomicsForecastEventTypeV1Schema = z.literal(
  'forecast_quarterly_distribution'
);

export type InternalEconomicsForecastEventTypeV1 = z.infer<
  typeof InternalEconomicsForecastEventTypeV1Schema
>;

export const INTERNAL_ECONOMICS_EVENT_CLASS_PRIORITY = {
  lp_capital_call: 1,
  portfolio_investment: 2,
  fund_expense: 3,
  realized_proceeds: 4,
  lp_distribution: 5,
  recallable_distribution: 6,
} as const satisfies Record<InternalEconomicsEventTypeV1, number>;

const PositiveIntegerIdSchema = z.number().int().positive();
const CanonicalDateSchema = z.string().date();
const CanonicalUtcInstantSchema = z.string().datetime({ offset: false, precision: 3 });
const EventClassPriorityV1Schema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

export const FactsStableSourceIdV1Schema = z
  .string()
  .regex(/^facts:[1-9]\d*:cash_flow_event:[1-9]\d*$/);

export const ForecastStableSourceIdV1Schema = z.string().superRefine((value, ctx) => {
  const match = /^forecast:([1-9]\d*):quarter:([^:]+):(forecast_quarterly_distribution)$/.exec(
    value
  );
  if (
    !match ||
    !CanonicalDateSchema.safeParse(match[2]).success ||
    !InternalEconomicsForecastEventTypeV1Schema.safeParse(match[3]).success
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Invalid canonical forecast stable source ID.',
    });
  }
});

export const InternalEconomicsStableSourceIdV1Schema = z.union([
  FactsStableSourceIdV1Schema,
  ForecastStableSourceIdV1Schema,
]);

export const InternalEconomicsEventOrderKeyV1Schema = z
  .object({
    effectiveAt: CanonicalUtcInstantSchema,
    eventClassPriority: EventClassPriorityV1Schema,
    stableSourceId: InternalEconomicsStableSourceIdV1Schema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const forecastMatch =
      /^forecast:[1-9]\d*:quarter:([^:]+):forecast_quarterly_distribution$/.exec(
        value.stableSourceId
      );
    if (!forecastMatch) return;

    if (value.eventClassPriority !== 4) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['eventClassPriority'],
        message: 'Forecast quarterly distributions must use event class priority 4.',
      });
    }

    const expectedEffectiveAt = `${forecastMatch[1]}T23:59:59.999Z`;
    if (value.effectiveAt !== expectedEffectiveAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['effectiveAt'],
        message: 'Forecast effectiveAt must equal its canonical UTC period-end instant.',
      });
    }
  });

export type InternalEconomicsEventOrderKeyV1 = z.infer<
  typeof InternalEconomicsEventOrderKeyV1Schema
>;

const FactsEventOrderKeyInputV1Schema = z
  .object({
    factsSnapshotId: PositiveIntegerIdSchema,
    eventId: PositiveIntegerIdSchema,
    eventType: InternalEconomicsEventTypeV1Schema,
    effectiveAt: CanonicalUtcInstantSchema,
  })
  .strict();

export type FactsEventOrderKeyInputV1 = z.infer<typeof FactsEventOrderKeyInputV1Schema>;

const ForecastEventOrderKeyInputV1Schema = z
  .object({
    forecastSnapshotId: PositiveIntegerIdSchema,
    periodEnd: CanonicalDateSchema,
    eventType: InternalEconomicsForecastEventTypeV1Schema,
  })
  .strict();

export type ForecastEventOrderKeyInputV1 = z.infer<typeof ForecastEventOrderKeyInputV1Schema>;

export function buildFactsStableSourceId(factsSnapshotId: number, eventId: number): string {
  const parsedFactsSnapshotId = PositiveIntegerIdSchema.parse(factsSnapshotId);
  const parsedEventId = PositiveIntegerIdSchema.parse(eventId);
  return `facts:${parsedFactsSnapshotId}:cash_flow_event:${parsedEventId}`;
}

export function buildForecastStableSourceId(
  forecastSnapshotId: number,
  periodEnd: string,
  eventType: InternalEconomicsForecastEventTypeV1
): string {
  const parsedForecastSnapshotId = PositiveIntegerIdSchema.parse(forecastSnapshotId);
  const parsedPeriodEnd = CanonicalDateSchema.parse(periodEnd);
  const parsedEventType = InternalEconomicsForecastEventTypeV1Schema.parse(eventType);
  return `forecast:${parsedForecastSnapshotId}:quarter:${parsedPeriodEnd}:${parsedEventType}`;
}

export function deriveFactsEventOrderKey(
  input: FactsEventOrderKeyInputV1
): InternalEconomicsEventOrderKeyV1 {
  const parsed = FactsEventOrderKeyInputV1Schema.parse(input);
  return {
    effectiveAt: parsed.effectiveAt,
    eventClassPriority: INTERNAL_ECONOMICS_EVENT_CLASS_PRIORITY[parsed.eventType],
    stableSourceId: buildFactsStableSourceId(parsed.factsSnapshotId, parsed.eventId),
  };
}

export function deriveForecastEventOrderKey(
  input: ForecastEventOrderKeyInputV1
): InternalEconomicsEventOrderKeyV1 {
  const parsed = ForecastEventOrderKeyInputV1Schema.parse(input);
  return {
    effectiveAt: `${parsed.periodEnd}T23:59:59.999Z`,
    eventClassPriority: 4,
    stableSourceId: buildForecastStableSourceId(
      parsed.forecastSnapshotId,
      parsed.periodEnd,
      parsed.eventType
    ),
  };
}

function compareCanonicalStrings(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function compareEventOrderKeys(
  left: InternalEconomicsEventOrderKeyV1,
  right: InternalEconomicsEventOrderKeyV1
): number {
  const effectiveAtComparison = compareCanonicalStrings(left.effectiveAt, right.effectiveAt);
  if (effectiveAtComparison !== 0) return effectiveAtComparison;

  const priorityComparison = left.eventClassPriority - right.eventClassPriority;
  if (priorityComparison !== 0) return priorityComparison;

  return compareCanonicalStrings(left.stableSourceId, right.stableSourceId);
}
