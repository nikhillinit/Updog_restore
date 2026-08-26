import type { InternalEconomicsEventOrderKeyV1 } from '../../shared/contracts/internal-economics/event-ordering-v1.contract';
import { compareEventOrderKeys } from '../../shared/contracts/internal-economics/event-ordering-v1.contract';

export function generatePermutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  const result: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const current = items[i]!;
    const remaining = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const perm of generatePermutations(remaining)) {
      result.push([current, ...perm]);
    }
  }
  return result;
}

export interface EventOrderingPermutationFixture {
  canonical: InternalEconomicsEventOrderKeyV1[];
  expectedStableSourceIds: string[];
  permutations: InternalEconomicsEventOrderKeyV1[][];
}

export function buildOrderKeyPermutationFixtures(
  keys: InternalEconomicsEventOrderKeyV1[]
): EventOrderingPermutationFixture {
  const canonical = [...keys].sort(compareEventOrderKeys);
  const expectedStableSourceIds = canonical.map((k) => k.stableSourceId);
  const permutations = generatePermutations(keys);

  return { canonical, expectedStableSourceIds, permutations };
}
