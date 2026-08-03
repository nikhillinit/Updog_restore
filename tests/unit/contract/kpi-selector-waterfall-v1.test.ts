import { describe, expect, it } from 'vitest';

import {
  FundLedgerSchema,
  KPI_SELECTOR_V1_FORBIDDEN_KEYS_TYPECHECK,
  KPIResponseSchema,
  WaterfallTypeSchema,
} from '@shared/contracts/kpi-selector.contract';

describe('KPI selector frozen v1 waterfall contract', () => {
  it('keeps its exported waterfall schema American-only', () => {
    expect(WaterfallTypeSchema.parse('american')).toBe('american');
    expect(() => WaterfallTypeSchema.parse('european')).toThrow();
  });

  it('does not widen ledger input or waterfall preview transitively', () => {
    const ledgerWaterfallType = FundLedgerSchema.shape.waterfallType;
    const previewWaterfallType = KPIResponseSchema.shape.waterfall.unwrap().shape.type;

    expect(ledgerWaterfallType.parse('american')).toBe('american');
    expect(previewWaterfallType.parse('american')).toBe('american');
    expect(() => ledgerWaterfallType.parse('european')).toThrow();
    expect(() => previewWaterfallType.parse('european')).toThrow();
  });

  it('loads the typecheck-evaluated forbidden-key assertion', () => {
    expect(KPI_SELECTOR_V1_FORBIDDEN_KEYS_TYPECHECK).toBe(true);
  });
});
