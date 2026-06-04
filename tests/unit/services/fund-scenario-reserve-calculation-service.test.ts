import { describe, expect, it } from 'vitest';

import { createReserveScenarioInputHash } from '../../../server/services/fund-scenario-reserve-calculation-service';

describe('fund scenario reserve calculation service', () => {
  it('creates a stable input hash regardless of equivalent variant ordering', () => {
    const first = createReserveScenarioInputHash({
      fundId: 1,
      scenarioSetId: '11111111-1111-4111-8111-111111111111',
      sourceConfigId: 2,
      sourceConfigVersion: 3,
      calcVersion: 'fund-scenarios-v1',
      calculationMode: 'async_reserve_allocation',
      variants: [
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          sortOrder: 1,
          override: { b: 2, a: 1 },
        },
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          sortOrder: 2,
          override: { amountCents: 1000 },
        },
      ],
    });

    const second = createReserveScenarioInputHash({
      fundId: 1,
      scenarioSetId: '11111111-1111-4111-8111-111111111111',
      sourceConfigId: 2,
      sourceConfigVersion: 3,
      calcVersion: 'fund-scenarios-v1',
      calculationMode: 'async_reserve_allocation',
      variants: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          sortOrder: 2,
          override: { amountCents: 1000 },
        },
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          sortOrder: 1,
          override: { a: 1, b: 2 },
        },
      ],
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });
});
