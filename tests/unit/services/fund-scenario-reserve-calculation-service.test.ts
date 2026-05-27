import { describe, expect, it } from 'vitest';

import { createReserveScenarioInputHash } from '../../../server/services/fund-scenario-reserve-calculation-service';

describe('fund scenario reserve calculation service', () => {
  it('creates a stable input hash regardless of equivalent variant ordering', () => {
    const first = createReserveScenarioInputHash({
      fundId: 1,
      scenarioSetId: '00000000-0000-0000-0000-000000000111',
      sourceConfigId: 12,
      sourceConfigVersion: 4,
      calcVersion: 'fund-scenarios-v1',
      calculationMode: 'async_reserve_allocation',
      variants: [
        { id: 'variant-b', override: { payload: { items: [{ companyId: 2 }] } } },
        { id: 'variant-a', override: { payload: { items: [{ companyId: 1 }] } } },
      ],
    });

    const second = createReserveScenarioInputHash({
      fundId: 1,
      scenarioSetId: '00000000-0000-0000-0000-000000000111',
      sourceConfigId: 12,
      sourceConfigVersion: 4,
      calcVersion: 'fund-scenarios-v1',
      calculationMode: 'async_reserve_allocation',
      variants: [
        { id: 'variant-a', override: { payload: { items: [{ companyId: 1 }] } } },
        { id: 'variant-b', override: { payload: { items: [{ companyId: 2 }] } } },
      ],
    });

    expect(first).toBe(second);
  });
});
