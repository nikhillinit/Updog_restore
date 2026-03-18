// REFLECTION_ID: REFL-027
// This test is linked to: docs/skills/REFL-027-redundant-any-on-inferred-callbacks.md
// Do not rename without updating the reflection's test_file field.

import { describe, expect, it } from 'vitest';

interface Company {
  name: string;
  valuation: number;
  category: string;
}

const companies: Company[] = [
  { name: 'Alpha', valuation: 10, category: 'seed' },
  { name: 'Beta', valuation: 25, category: 'series-a' },
];

function sumValuationsWithInference(items: Company[]): number {
  return items.reduce((sum, company) => sum + company.valuation, 0);
}

function groupByCategoryWithInference(items: Company[]): Record<string, number> {
  return items.reduce(
    (acc, item) => {
      acc[item.category] = (acc[item.category] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
}

function hasRedundantAnyCallback(source: string): boolean {
  return /(?:map|reduce|filter|Array\.from)\s*\(\s*\((?:[^)]*:\s*any[^)]*)\)/.test(source);
}

describe('REFL-027: Redundant any on Inferred Callback Parameters', () => {
  it('detects explicit any annotations on typed callback parameters as the anti-pattern', () => {
    const source = `
      const total = companies.reduce((sum: any, company: any) => sum + company.valuation, 0);
      const names = items.map((item: any) => item.name);
    `;

    expect(hasRedundantAnyCallback(source)).toBe(true);
  });

  it('shows the inferred callback version preserves behavior without any annotations', () => {
    expect(sumValuationsWithInference(companies)).toBe(35);
  });

  it('supports object accumulators when the initial value carries the type', () => {
    expect(groupByCategoryWithInference(companies)).toEqual({
      seed: 1,
      'series-a': 1,
    });
  });

  it('does not flag callbacks that rely on inference instead of explicit any', () => {
    const source = `
      const total = companies.reduce((sum, company) => sum + company.valuation, 0);
      const names = items.map((item) => item.name);
    `;

    expect(hasRedundantAnyCallback(source)).toBe(false);
  });
});
