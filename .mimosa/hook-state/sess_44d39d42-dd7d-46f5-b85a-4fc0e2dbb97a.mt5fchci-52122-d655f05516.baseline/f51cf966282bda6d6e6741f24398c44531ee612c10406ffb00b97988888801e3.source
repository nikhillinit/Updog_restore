import { describe, expect, it } from 'vitest';

import {
  FundLedgerSchema,
  KPI_SELECTOR_V1_FORBIDDEN_KEYS_TYPECHECK,
  KPIResponseSchema,
  WaterfallTypeSchema,
} from '@shared/contracts/kpi-selector.contract';

describe('KPI selector frozen v1 waterfall contract', () => {
  it('preserves legacy European input coercion to American', () => {
    expect(WaterfallTypeSchema.parse('american')).toBe('american');
    expect(WaterfallTypeSchema.parse('european')).toBe('american');
  });

  it('keeps ledger input and waterfall preview American-semantic without transitive widening', () => {
    const ledgerWaterfallType = FundLedgerSchema.shape.waterfallType;
    const previewWaterfallType = KPIResponseSchema.shape.waterfall.unwrap().shape.type;

    expect(ledgerWaterfallType.parse('american')).toBe('american');
    expect(previewWaterfallType.parse('american')).toBe('american');
    expect(ledgerWaterfallType.parse('european')).toBe('american');
    expect(previewWaterfallType.parse('european')).toBe('american');
    expect(() => ledgerWaterfallType.parse('hybrid')).toThrow();
    expect(() => previewWaterfallType.parse('hybrid')).toThrow();
  });

  it('loads the typecheck-evaluated forbidden-key assertion', () => {
    expect(KPI_SELECTOR_V1_FORBIDDEN_KEYS_TYPECHECK).toBe(true);
  });
});
