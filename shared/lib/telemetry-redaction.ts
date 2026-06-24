import { z } from 'zod';

export const MONETARY_FIELD_DENYLIST = Object.freeze([
  'amount',
  'investmentAmount',
  'investment_amount',
  'preMoneyValuation',
  'pre_money_valuation',
  'postMoneyValuation',
  'post_money_valuation',
  'roundSize',
  'round_size',
  'valuation',
  'ownershipPercentage',
  'ownership_percentage',
] as const);

const monetaryFields = new Set<string>(MONETARY_FIELD_DENYLIST);

export const TelemetryEventSchema = z
  .object({
    event: z.string(),
    fundId: z.number().optional(),
    investmentId: z.number().optional(),
    roundId: z.number().optional(),
    eventKind: z.string().optional(),
    count: z.number().optional(),
    occurredAt: z.string().optional(),
    outcome: z.string().optional(),
  })
  .strict();

export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function assertNoMonetaryFieldsInValue(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertNoMonetaryFieldsInValue(item, `${path}[${index}]`);
    });
    return;
  }

  if (!isPlainObject(value)) {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const currentPath = path ? `${path}.${key}` : key;
    if (monetaryFields.has(key)) {
      throw new Error(`Telemetry event contains monetary field: ${currentPath}`);
    }
    assertNoMonetaryFieldsInValue(nestedValue, currentPath);
  }
}

export function assertNoMonetaryFields(event: Record<string, unknown>): void {
  assertNoMonetaryFieldsInValue(event, '');
}

export function redactTelemetryEvent(event: Record<string, unknown>): TelemetryEvent {
  const parsed = TelemetryEventSchema.parse(event);
  assertNoMonetaryFields(parsed);
  return parsed;
}
