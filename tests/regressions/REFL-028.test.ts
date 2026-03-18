// REFLECTION_ID: REFL-028
// This test is linked to: docs/skills/REFL-028-duck-type-context-access.md
// Do not rename without updating the reflection's test_file field.

import { describe, expect, it } from 'vitest';

interface FundContextType {
  fundId: number;
  name: string;
}

interface KpiBlock {
  tvpi?: number;
  dpi?: number;
}

function readKpisUnsafe(ctx: any): number {
  return ctx.kpis?.tvpi ?? 0;
}

function readKpisSafe(ctx: FundContextType): number {
  const kpis = (ctx as Record<string, unknown>)['kpis'] as KpiBlock | undefined;
  return kpis?.tvpi ?? 0;
}

function readSelectorSafe(ctx: FundContextType): KpiBlock | undefined {
  const selectFundKpis = (ctx as Record<string, unknown>)['selectFundKpis'] as
    | (() => KpiBlock | undefined)
    | undefined;
  return selectFundKpis?.();
}

describe('REFL-028: Duck-Type Context Access with Typed Bracket Notation', () => {
  it('detects the anti-pattern of casting the entire context to any', () => {
    const source = `
      const ctx: any = useFundContext?.() ?? {};
      const tvpi = ctx.kpis?.tvpi;
      const select = ctx.selectFundKpis;
    `;

    expect(/const\s+\w+:\s*any\s*=/.test(source)).toBe(true);
  });

  it('reads undeclared duck-typed properties safely through Record access', () => {
    const ctx = {
      fundId: 1,
      name: 'Fund I',
      kpis: { tvpi: 2.3, dpi: 0.9 },
    } as FundContextType;

    expect(readKpisSafe(ctx)).toBe(2.3);
  });

  it('handles missing duck-typed properties without widening the whole context to any', () => {
    const ctx = {
      fundId: 1,
      name: 'Fund I',
    } as FundContextType;

    expect(readKpisSafe(ctx)).toBe(0);
    expect(readSelectorSafe(ctx)).toBeUndefined();
  });

  it('preserves the expected runtime behavior while isolating the unsafe edge to a local assertion', () => {
    const ctx = {
      fundId: 1,
      name: 'Fund I',
      kpis: { tvpi: 1.8 },
      selectFundKpis: () => ({ tvpi: 1.8 }),
    } as FundContextType;

    expect(readKpisUnsafe(ctx)).toBe(1.8);
    expect(readKpisSafe(ctx)).toBe(1.8);
    expect(readSelectorSafe(ctx)).toEqual({ tvpi: 1.8 });
  });
});
