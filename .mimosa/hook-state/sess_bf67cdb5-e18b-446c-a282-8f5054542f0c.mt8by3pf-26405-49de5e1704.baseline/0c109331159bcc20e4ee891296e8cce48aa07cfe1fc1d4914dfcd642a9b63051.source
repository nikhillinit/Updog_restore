import { describe, expect, it } from 'vitest';
import {
  assertNoMonetaryFields,
  MONETARY_FIELD_DENYLIST,
  redactTelemetryEvent,
  TelemetryEventSchema,
} from '@shared/lib/telemetry-redaction';

describe('telemetry-redaction', () => {
  it('passes clean events through the denylist check and schema', () => {
    const event = {
      event: 'investment_round_created',
      fundId: 1,
      investmentId: 2,
      roundId: 3,
      eventKind: 'round',
      count: 1,
      occurredAt: '2026-06-23T00:00:00.000Z',
      outcome: 'created',
    };

    expect(() => assertNoMonetaryFields(event)).not.toThrow();
    expect(TelemetryEventSchema.parse(event)).toEqual(event);
    expect(redactTelemetryEvent(event)).toEqual(event);
  });

  it('throws for every monetary field at top level and nested inside objects and arrays', () => {
    for (const field of MONETARY_FIELD_DENYLIST) {
      expect(() => assertNoMonetaryFields({ event: 'blocked', [field]: 1 })).toThrow(field);
      expect(() => assertNoMonetaryFields({ event: 'blocked', nested: { [field]: 1 } })).toThrow(
        field
      );
      expect(() =>
        assertNoMonetaryFields({ event: 'blocked', nested: [{ safe: true }, { [field]: 1 }] })
      ).toThrow(field);
    }
  });

  it('rejects unknown monetary fields through the strict schema', () => {
    expect(() =>
      TelemetryEventSchema.parse({
        event: 'investment_round_created',
        investmentAmount: '1000000',
      })
    ).toThrow();
  });

  it('throws from redactTelemetryEvent on a monetary payload', () => {
    expect(() =>
      redactTelemetryEvent({
        event: 'investment_round_created',
        investmentAmount: '1000000',
      })
    ).toThrow();
  });
});
