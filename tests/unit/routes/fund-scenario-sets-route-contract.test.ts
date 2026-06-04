import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function readRepoFile(relativePath: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

describe('fund scenario set route contract', () => {
  it('keeps every fund-scoped scenario-set route protected by route-local auth and fund access', async () => {
    const source = await readRepoFile('server/routes/fund-scenario-sets.ts');

    const guardedRoutes = [
      {
        literal: "'/funds/:fundId/scenario-sets'",
        handlerMarker: 'listFundScenarioSets',
      },
      {
        literal: "'/funds/:fundId/scenario-sets/:scenarioSetId'",
        handlerMarker: 'getFundScenarioSet',
      },
      {
        literal: "'/funds/:fundId/scenario-sets'",
        occurrence: 2,
        handlerMarker: 'createFundScenarioSet',
      },
      {
        literal: "'/funds/:fundId/scenario-sets/reserve-optimization'",
        handlerMarker: 'createReserveOptimizationScenarioSet',
        expectedBeforeAuth: 'scenarioSetWriteLimiter',
      },
      {
        literal: "'/funds/:fundId/scenario-sets/:scenarioSetId/calculate'",
        handlerMarker: 'calculateFundScenarioSet',
      },
      {
        literal: "'/funds/:fundId/scenario-sets/:scenarioSetId/calculate-reserve'",
        handlerMarker: 'enqueueReserveScenarioCalculation',
      },
      {
        literal: "'/funds/:fundId/scenario-sets/:scenarioSetId/calculation-status'",
        handlerMarker: 'getFundScenarioCalculationStatus',
      },
      {
        literal: "'/funds/:fundId/scenario-sets/:scenarioSetId/comparison'",
        handlerMarker: 'getFundScenarioComparison',
      },
      {
        literal: "'/funds/:fundId/scenario-sets/:scenarioSetId/results'",
        handlerMarker: 'getScenarioResults',
      },
      {
        literal: "'/funds/:fundId/scenario-sets/:scenarioSetId/archive'",
        handlerMarker: 'archiveFundScenarioSet',
      },
    ] as const;

    for (const route of guardedRoutes) {
      const slice = routeSliceForHandler(
        source,
        route.literal,
        route.handlerMarker,
        route.occurrence ?? 1
      );
      expectInOrder(slice, route.literal, 'requireAuth()', route.handlerMarker);
      expectInOrder(slice, route.literal, 'requireFundAccess', route.handlerMarker);
      expectInOrder(slice, 'requireAuth()', 'requireFundAccess', route.handlerMarker);

      if (route.expectedBeforeAuth) {
        expectInOrder(slice, route.expectedBeforeAuth, 'requireAuth()', route.handlerMarker);
      }
    }

    expect(source).toContain('getIdempotencyKey(req)');
    expect(source).toContain('CreateReserveOptimizationScenarioSetV1Schema.safeParse');
    expect(source).toContain('FundScenarioReserveCalculationRequestV1Schema.safeParse');
  });

  it('keeps calculation-status scoped to reserve scenario calculations', async () => {
    const routeSource = await readRepoFile('server/routes/fund-scenario-sets.ts');
    const statusServiceSource = await readRepoFile(
      'server/services/fund-scenario-calculation-status-service.ts'
    );

    const calculationStatusRoute = routeSlice(
      routeSource,
      "'/funds/:fundId/scenario-sets/:scenarioSetId/calculation-status'",
      "'/funds/:fundId/scenario-sets/:scenarioSetId/comparison'"
    );

    expect(calculationStatusRoute).toContain('getFundScenarioCalculationStatus');
    expect(statusServiceSource).toContain('getReserveScenarioCalculationIdentity');
    expect(statusServiceSource).toContain(
      "metadata ->> 'calculation_mode' = 'async_reserve_allocation'"
    );
    expect(statusServiceSource).toContain("calculationMode: 'async_reserve_allocation'");
  });
});

function routeSlice(source: string, routeStart: string, nextRouteStart: string): string {
  const start = source.indexOf(routeStart);
  const end = source.indexOf(nextRouteStart, start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return source.slice(start, end);
}

function nthIndexOf(source: string, search: string, occurrence: number): number {
  let index = -1;
  for (let current = 0; current < occurrence; current += 1) {
    index = source.indexOf(search, index + 1);
    if (index === -1) return -1;
  }
  return index;
}

function routeSliceForHandler(
  source: string,
  routeStart: string,
  handlerMarker: string,
  occurrence: number
): string {
  const start = nthIndexOf(source, routeStart, occurrence);
  const handler = source.indexOf(handlerMarker, start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(handler).toBeGreaterThan(start);

  return source.slice(start, handler + handlerMarker.length);
}

function expectInOrder(source: string, first: string, second: string, third: string): void {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  const thirdIndex = source.indexOf(third);

  expect(firstIndex).toBeGreaterThanOrEqual(0);
  expect(secondIndex).toBeGreaterThan(firstIndex);
  expect(thirdIndex).toBeGreaterThan(secondIndex);
}
