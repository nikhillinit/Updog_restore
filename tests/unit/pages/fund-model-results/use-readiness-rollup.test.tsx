/**
 * Container-hook tests for useReadinessRollup (Plan 9 Wave 9B2 fix round F8).
 *
 * Pins the fail-closed fund-scope guard around the FundContext-sourced
 * allocations hook (match / mismatch / unresolved-loading / unresolved-settled),
 * the invalid-route-fund fallback, and the query-state -> input mapping. All
 * data-source modules are mocked at the module boundary; the derivation runs
 * for real.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { AllocationsResponse } from '../../../../client/src/components/portfolio/tabs/types';

interface QueryLikeMock {
  isSuccess: boolean;
  isError: boolean;
  data: unknown;
  error: unknown;
}

const mocks = vi.hoisted(() => {
  const errorQuery = (message: string) => ({
    isSuccess: false,
    isError: true,
    data: undefined,
    error: new Error(message),
  });
  return {
    errorQuery,
    forecast: errorQuery('dual forecast unavailable') as QueryLikeMock,
    reserves: errorQuery('rankings unavailable') as QueryLikeMock,
    allocations: errorQuery('allocations unavailable') as QueryLikeMock,
    scenarioSetList: errorQuery('scenario set list unavailable') as QueryLikeMock,
    fundContext: { fundId: 42 as number | null, isLoading: false },
  };
});

vi.mock('@/hooks/useDualForecast', () => ({ useDualForecast: () => mocks.forecast }));
vi.mock('@/hooks/use-moic', () => ({ useFundMoicRankingsV2: () => mocks.reserves }));
vi.mock('@/hooks/use-scenario-set-list', () => ({
  useScenarioSetList: () => mocks.scenarioSetList,
}));
vi.mock('@/components/portfolio/tabs/hooks/useLatestAllocations', () => ({
  useLatestAllocations: () => mocks.allocations,
}));
vi.mock('@/contexts/FundContext', () => ({ useFundContext: () => mocks.fundContext }));

import { useReadinessRollup } from '../../../../client/src/pages/fund-model-results/use-readiness-rollup';
import type {
  ReadinessSourceInput,
  ScenariosSection,
} from '../../../../client/src/pages/fund-model-results/readiness-rollup';

const SCENARIOS_LOADING: ReadinessSourceInput<ScenariosSection> = { kind: 'loading' };

function allocationsData(): AllocationsResponse {
  return {
    companies: [],
    metadata: {
      total_planned_cents: 0,
      total_deployed_cents: 0,
      companies_count: 2,
      last_updated_at: null,
      actuals_drift_summary: {
        facts_status: 'available',
        drifted_company_count: 0,
        material_company_count: 0,
        degraded_company_count: 0,
        facts_input_hash: null,
        as_of_date: '2026-07-02',
      },
    },
  };
}

function successQuery(data: unknown): QueryLikeMock {
  return { isSuccess: true, isError: false, data, error: null };
}

function renderRollup(routeFundId: string | null) {
  return renderHook(() => useReadinessRollup(routeFundId, SCENARIOS_LOADING)).result.current;
}

function portfolioRow(routeFundId: string | null) {
  const row = renderRollup(routeFundId).rows.find(
    (candidate) => candidate.key === 'portfolio-actuals'
  );
  if (row === undefined) throw new Error('missing portfolio-actuals row');
  return row;
}

beforeEach(() => {
  mocks.forecast = mocks.errorQuery('dual forecast unavailable');
  mocks.reserves = mocks.errorQuery('rankings unavailable');
  mocks.allocations = mocks.errorQuery('allocations unavailable');
  mocks.scenarioSetList = mocks.errorQuery('scenario set list unavailable');
  mocks.fundContext = { fundId: 42, isLoading: false };
});

describe('useReadinessRollup fund-scope guard (allocations)', () => {
  it('renders allocations data when the context fund IS the route fund', () => {
    mocks.allocations = successQuery(allocationsData());

    const row = portfolioRow('42');
    expect(row.state).toBe('actionable');
    expect(row.asOfDate).toBe('2026-07-02');
  });

  it('never renders a mismatched context fund, even with successful data', () => {
    mocks.fundContext = { fundId: 7, isLoading: false };
    mocks.allocations = successQuery(allocationsData());

    const row = portfolioRow('42');
    expect(row.state).toBe('not_actionable');
    expect(row.stateLabel).toBe('Facts unavailable');
    expect(row.primaryReason).toBe('Allocation facts are not resolved for this fund');
    // No foreign-fund fact leaks through any field.
    expect(row.asOfDate).toBeNull();
    expect(row.blockedSummary).toBeNull();
  });

  it('reads a still-initializing fund context as a loading row', () => {
    mocks.fundContext = { fundId: null, isLoading: true };
    mocks.allocations = successQuery(allocationsData());

    const row = portfolioRow('42');
    expect(row.loading).toBe(true);
    expect(row.state).toBe('not_actionable');
  });

  it('fails closed once the fund context settles without resolving the fund', () => {
    mocks.fundContext = { fundId: null, isLoading: false };
    mocks.allocations = successQuery(allocationsData());

    const row = portfolioRow('42');
    expect(row.loading).toBe(false);
    expect(row.state).toBe('not_actionable');
    expect(row.primaryReason).toBe('Allocation facts are not resolved for this fund');
  });
});

describe('useReadinessRollup route-fund fallback and query mapping', () => {
  it('fails every data row closed on an invalid route fund', () => {
    for (const routeFundId of [null, 'latest', '0', '007']) {
      const model = renderRollup(routeFundId);
      for (const row of model.rows) {
        expect(row.state).toBe('not_actionable');
        expect(row.loading).toBe(false);
      }
      const forecast = model.rows.find((row) => row.key === 'forecast');
      expect(forecast?.primaryReason).toBe('No fund is resolved on this route');
      // Fund-scoped links gate with the workspace reason (D-C).
      const reserves = model.rows.find((row) => row.key === 'reserves');
      expect(reserves?.href).toBeNull();
      expect(reserves?.hrefDisabledReason).toBe('Select a fund to open this view');
    }
  });

  it('maps errored queries to Facts unavailable rows with the short cause', () => {
    const model = renderRollup('42');
    const forecast = model.rows.find((row) => row.key === 'forecast');
    expect(forecast?.state).toBe('not_actionable');
    expect(forecast?.stateLabel).toBe('Facts unavailable');
    expect(forecast?.primaryReason).toBe('dual forecast unavailable');
  });

  it('maps pending queries to loading rows', () => {
    mocks.forecast = { isSuccess: false, isError: false, data: undefined, error: null };

    const model = renderRollup('42');
    const forecast = model.rows.find((row) => row.key === 'forecast');
    expect(forecast?.loading).toBe(true);
  });
});
