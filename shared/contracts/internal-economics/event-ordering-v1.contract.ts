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
  const match = /^forecast:([1-9]\d*):quarter:([^:]+):([^:]+)$/.exec(value);
  if (
    !match ||
    !CanonicalDateSchema.safeParse(match[2]).success ||
    !InternalEconomicsEventTypeV1Schema.safeParse(match[3]).success
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
  .strict();

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

export function buildFactsStableSourceId(factsSnapshotId: number, eventId: number): string {
  const parsedFactsSnapshotId = PositiveIntegerIdSchema.parse(factsSnapshotId);
  const parsedEventId = PositiveIntegerIdSchema.parse(eventId);
  return `facts:${parsedFactsSnapshotId}:cash_flow_event:${parsedEventId}`;
}

export function buildForecastStableSourceId(
  forecastSnapshotId: number,
  periodEnd: string,
  eventType: InternalEconomicsEventTypeV1
): string {
  const parsedForecastSnapshotId = PositiveIntegerIdSchema.parse(forecastSnapshotId);
  const parsedPeriodEnd = CanonicalDateSchema.parse(periodEnd);
  const parsedEventType = InternalEconomicsEventTypeV1Schema.parse(eventType);
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
