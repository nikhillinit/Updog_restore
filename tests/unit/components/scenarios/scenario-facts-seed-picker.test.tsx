import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScenarioCaseSeedV1Schema } from '../../../../shared/contracts/scenarios/scenario-case-seed-v1.contract';
import { ScenarioFactsSeedPicker } from '../../../../client/src/components/scenarios/ScenarioFactsSeedPicker';

const pickerState = vi.hoisted(() => ({
  flagEnabled: true,
  seedHookResult: {
    seeds: [] as unknown[],
    response: undefined as unknown,
    isLoading: false,
    error: null as Error | null,
  },
  companyHookResult: {
    scenarios: [] as unknown[],
    isLoading: false,
    isFetching: false,
    error: null as Error | null,
  },
}));

vi.mock('@/core/flags/flagAdapter', () => ({
  useFeatureFlag: () => pickerState.flagEnabled,
}));

vi.mock('@/hooks/useFundScenarioSeeds', () => ({
  useFundScenarioSeeds: () => pickerState.seedHookResult,
}));

vi.mock('@/hooks/useCompanyScenarios', () => ({
  useCompanyScenarios: () => pickerState.companyHookResult,
}));

const SCENARIO_ID = '00000000-0000-4000-8000-000000000101';
const SCENARIO_CASE_ID = '00000000-0000-4000-8000-000000000201';

function makeScenario(
  overrides: Partial<{
    id: string;
    name: string;
    version: number;
    updatedAt: string;
    isLocked: boolean;
    caseCount: number;
  }> = {}
) {
  return {
    id: SCENARIO_ID,
    name: 'Base scenario',
    version: 4,
    updatedAt: '2026-07-15T10:00:00.000Z',
    isLocked: false,
    caseCount: 2,
    ...overrides,
  };
}

function makeLiveSeed() {
  return ScenarioCaseSeedV1Schema.parse({
    contractVersion: 'scenario-case-seed-v1',
    fundId: 7,
    companyId: 101,
    asOfDate: '2026-07-13',
    factsInputHash: 'c'.repeat(64),
    trustState: 'LIVE',
    currencyStatus: 'base_currency',
    fields: {
      investment: {
        status: 'seeded',
        value: '500000.000000',
        source: 'investment_rounds',
      },
      followOns: {
        status: 'seeded',
        value: '250000.000000',
        source: 'investment_rounds',
      },
      fmv: {
        status: 'seeded',
        value: '14000000.000000',
        source: 'approved_planning_fmv',
      },
      exitValuation: {
        status: 'user_required',
        value: null,
        marketReference: '12000000.000000',
      },
      probability: { status: 'user_required', value: null },
      ownershipAtExit: { status: 'user_required', value: null },
    },
    warnings: [],
  });
}

function makePartialSeed() {
  return ScenarioCaseSeedV1Schema.parse({
    ...makeLiveSeed(),
    companyId: 102,
    factsInputHash: 'd'.repeat(64),
    trustState: 'PARTIAL',
    fields: {
      ...makeLiveSeed().fields,
      followOns: { status: 'unavailable', value: null, reason: 'facts_unavailable' },
      fmv: { status: 'unavailable', value: null, reason: 'no_active_fmv' },
    },
  });
}

function makeCurrencyBlockedSeed() {
  return ScenarioCaseSeedV1Schema.parse({
    ...makeLiveSeed(),
    companyId: 103,
    factsInputHash: 'e'.repeat(64),
    trustState: 'UNAVAILABLE',
    currencyStatus: 'mismatch_blocked',
    fields: {
      ...makeLiveSeed().fields,
      investment: { status: 'unavailable', value: null, reason: 'currency_blocked' },
      followOns: { status: 'unavailable', value: null, reason: 'currency_blocked' },
      fmv: { status: 'unavailable', value: null, reason: 'currency_blocked' },
    },
  });
}

function availableResponse(seeds = [makeLiveSeed()]) {
  return {
    fundId: 7,
    asOfDate: '2026-07-13',
    factsStatus: 'available' as const,
    factsInputHash: '9'.repeat(64),
    seeds,
  };
}

function failedResponse() {
  return {
    fundId: 7,
    asOfDate: '2026-07-13',
    factsStatus: 'failed' as const,
    factsInputHash: null,
    seeds: [],
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface RenderPickerOptions {
  createdFromFactsHash?: string;
  initialSelectedCompanyId?: string;
}

function renderPicker(options: RenderPickerOptions = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const onOpenChange = vi.fn();

  const picker = () => (
    <QueryClientProvider client={queryClient}>
      <ScenarioFactsSeedPicker
        fundId="7"
        open
        onOpenChange={onOpenChange}
        createdFromFactsHash={options.createdFromFactsHash}
        {...(options.initialSelectedCompanyId !== undefined
          ? { initialSelectedCompanyId: options.initialSelectedCompanyId }
          : {})}
      />
    </QueryClientProvider>
  );
  const result = render(picker());

  return {
    ...result,
    queryClient,
    invalidateSpy,
    onOpenChange,
    rerenderPicker: () => result.rerender(picker()),
  };
}

async function selectLiveSeedAndFillRequiredInputs(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('radio', { name: /company 101/i }));
  await user.click(screen.getByRole('radio', { name: /base scenario/i }));
  await user.type(screen.getByLabelText(/case name/i), 'Base case');
  await user.type(screen.getByLabelText(/probability/i), '0.4');
  await user.type(screen.getByLabelText(/^exit valuation/i), '20000000');
  await user.type(screen.getByLabelText(/ownership at exit/i), '0.2');
  await user.type(screen.getByLabelText(/months to exit/i), '36');
}

describe('ScenarioFactsSeedPicker', () => {
  beforeEach(() => {
    pickerState.flagEnabled = true;
    const response = availableResponse();
    pickerState.seedHookResult = {
      seeds: response.seeds,
      response,
      isLoading: false,
      error: null,
    };
    pickerState.companyHookResult = {
      scenarios: [makeScenario()],
      isLoading: false,
      isFetching: false,
      error: null,
    };
    globalThis.fetch = vi.fn();
  });

  it('validates LIVE, PARTIAL, and currency-blocked fixtures with the shared contract', () => {
    expect(ScenarioCaseSeedV1Schema.parse(makeLiveSeed()).trustState).toBe('LIVE');
    expect(ScenarioCaseSeedV1Schema.parse(makePartialSeed()).trustState).toBe('PARTIAL');
    expect(ScenarioCaseSeedV1Schema.parse(makeCurrencyBlockedSeed()).currencyStatus).toBe(
      'mismatch_blocked'
    );
  });

  it('preselects the deep-linked company once its seed is disclosed (review P2-3)', async () => {
    const response = availableResponse([makeLiveSeed(), makePartialSeed()]);
    pickerState.seedHookResult = {
      seeds: response.seeds,
      response,
      isLoading: false,
      error: null,
    };
    renderPicker({ initialSelectedCompanyId: '102' });

    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /company 102/i })).toBeChecked();
    });
    expect(screen.getByRole('radio', { name: /company 101/i })).not.toBeChecked();
  });

  it('ignores a deep-linked company that is not among the disclosed seeds', async () => {
    const response = availableResponse([makeLiveSeed(), makePartialSeed()]);
    pickerState.seedHookResult = {
      seeds: response.seeds,
      response,
      isLoading: false,
      error: null,
    };
    renderPicker({ initialSelectedCompanyId: '999' });

    expect(
      await screen.findByRole('dialog', { name: /start case from portfolio actuals/i })
    ).toBeVisible();
    expect(screen.getByRole('radio', { name: /company 101/i })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /company 102/i })).not.toBeChecked();
  });

  it('does not override a manual choice when the deep-linked seed arrives after a refetch', async () => {
    const firstResponse = availableResponse([makeLiveSeed()]);
    pickerState.seedHookResult = {
      seeds: firstResponse.seeds,
      response: firstResponse,
      isLoading: false,
      error: null,
    };
    const user = userEvent.setup();
    const { rerenderPicker } = renderPicker({ initialSelectedCompanyId: '102' });

    await user.click(screen.getByRole('radio', { name: /company 101/i }));
    expect(screen.getByRole('radio', { name: /company 101/i })).toBeChecked();

    const refetchedResponse = availableResponse([makeLiveSeed(), makePartialSeed()]);
    pickerState.seedHookResult = {
      seeds: refetchedResponse.seeds,
      response: refetchedResponse,
      isLoading: false,
      error: null,
    };
    rerenderPicker();

    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /company 101/i })).toBeChecked();
    });
    expect(screen.getByRole('radio', { name: /company 102/i })).not.toBeChecked();
  });

  it('renders disclosed LIVE facts, market-reference copy, and snapshot provenance', () => {
    renderPicker();

    expect(
      screen.getByRole('dialog', { name: /start case from portfolio actuals/i })
    ).toBeVisible();
    expect(screen.getByText('Company 101')).toBeInTheDocument();
    expect(screen.getByText('Live')).toHaveClass('bg-beige-100', 'text-charcoal-600');
    expect(screen.getByText('Live')).not.toHaveClass('bg-success/10', 'text-success-dark');
    expect(screen.getByText('500000.000000')).toHaveClass('tabular-nums');
    expect(screen.getByText('250000.000000')).toHaveClass('tabular-nums');
    expect(screen.getByText('14000000.000000')).toHaveClass('tabular-nums');
    expect(screen.getByText(/market reference — not seeded/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        'This seed is a snapshot of recorded actuals as of 2026-07-13. It will not update automatically.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/cccccccc/)).toBeInTheDocument();
  });

  it('renders PARTIAL unavailable values as facts unavailable and requires their inputs', async () => {
    const response = availableResponse([makePartialSeed()]);
    pickerState.seedHookResult = {
      seeds: response.seeds,
      response,
      isLoading: false,
      error: null,
    };
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole('radio', { name: /company 102/i }));

    expect(screen.getAllByText('facts unavailable').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByLabelText(/follow-ons override/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/active fmv override/i)).toBeInTheDocument();
    expect(screen.queryByText(/^0$/)).not.toBeInTheDocument();
  });

  it('renders currency-blocked values as muted text and never as zero', async () => {
    const response = availableResponse([makeCurrencyBlockedSeed()]);
    pickerState.seedHookResult = {
      seeds: response.seeds,
      response,
      isLoading: false,
      error: null,
    };
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole('radio', { name: /company 103/i }));

    expect(screen.getAllByText('currency blocked').length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText(/^0$/)).not.toBeInTheDocument();
  });

  it('renders a failed facts envelope without a selectable seed', () => {
    pickerState.seedHookResult = {
      seeds: [],
      response: failedResponse(),
      isLoading: false,
      error: null,
    };

    renderPicker();

    expect(screen.getByText(/seed facts are unavailable/i)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('reveals an explicit input when a seeded field is deselected', async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByRole('radio', { name: /company 101/i }));

    const checkbox = screen.getByRole('checkbox', { name: /use observed investment/i });
    expect(checkbox).toBeChecked();
    await user.click(checkbox);

    expect(screen.getByLabelText(/observed investment override/i)).toBeInTheDocument();
  });

  it('blocks submit until every explicit input is supplied', async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByRole('radio', { name: /company 101/i }));
    await user.click(screen.getByRole('radio', { name: /base scenario/i }));
    await user.click(screen.getByRole('button', { name: /create case/i }));

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(await screen.findAllByText('Required')).toHaveLength(5);
  });

  it('hides mutation for a selected locked scenario', async () => {
    pickerState.companyHookResult = {
      scenarios: [makeScenario({ name: 'Locked scenario', isLocked: true })],
      isLoading: false,
      isFetching: false,
      error: null,
    };
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole('radio', { name: /company 101/i }));
    await user.click(screen.getByRole('radio', { name: /locked scenario/i }));

    expect(screen.getByText('Scenario is locked')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create case/i })).not.toBeInTheDocument();
  });

  it('renders nothing when the feature flag is off', () => {
    pickerState.flagEnabled = false;

    const { container } = renderPicker();

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('posts the selected seed with one Idempotency-Key and invalidates workspace data', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          scenarioCaseId: SCENARIO_CASE_ID,
          scenarioId: SCENARIO_ID,
          scenarioVersion: 5,
          seededAt: '2026-07-13T19:53:05.111Z',
          replay: false,
        },
        201
      )
    );
    globalThis.fetch = fetchSpy;
    const { invalidateSpy } = renderPicker();

    await selectLiveSeedAndFillRequiredInputs(user);
    await user.click(screen.getByRole('checkbox', { name: /use observed investment/i }));
    await user.type(screen.getByLabelText(/observed investment override/i), '600000');
    await user.click(screen.getByRole('button', { name: /create case/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/funds/7/scenario-analysis/scenarios/${SCENARIO_ID}/cases/from-seed`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toEqual(expect.any(String));
    expect(JSON.parse(String(init.body))).toEqual({
      seed: makeLiveSeed(),
      overrides: {
        caseName: 'Base case',
        probability: '0.4',
        exitValuation: '20000000',
        ownershipAtExit: '0.2',
        monthsToExit: 36,
        investment: '600000',
      },
      expectedScenarioVersion: 4,
    });
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['fund-scenario-workspace', '7'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['fund-scenario-analysis', '7', 'seeds'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['company-scenarios', '101'],
      });
    });
  });

  it('shows a retryable message on version conflict and does not auto-retry', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: 'version_conflict', message: 'stale' }, 409));
    globalThis.fetch = fetchSpy;
    const { invalidateSpy } = renderPicker();

    await selectLiveSeedAndFillRequiredInputs(user);
    await user.click(screen.getByRole('button', { name: /create case/i }));

    expect(await screen.findByText(/scenario changed.*try again/i)).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('radio', { name: /base scenario/i })).not.toBeChecked();
    expect(screen.queryByRole('button', { name: /create case/i })).not.toBeInTheDocument();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['company-scenarios', '101'] });
  });

  it('refreshes disclosed seeds when the server rejects a stale seed', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: 'seed_conflict', message: 'stale seed' }, 409));
    globalThis.fetch = fetchSpy;
    const { invalidateSpy } = renderPicker();

    await selectLiveSeedAndFillRequiredInputs(user);
    await user.click(screen.getByRole('button', { name: /create case/i }));

    expect(await screen.findByText(/portfolio actuals changed.*refresh/i)).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['fund-scenario-analysis', '7', 'seeds'],
    });
  });

  it('shows staleness without mutating anything', () => {
    renderPicker({ createdFromFactsHash: 'a'.repeat(64) });

    expect(screen.getByText('seed has changed since creation')).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('requires an explicit scenario selection and never creates one implicitly', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole('radio', { name: /company 101/i }));
    expect(screen.getByText(/select a company scenario to create a case/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create case/i })).not.toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('keeps loading, error, and empty scenario states nonactionable', async () => {
    const user = userEvent.setup();
    pickerState.companyHookResult = {
      scenarios: [],
      isLoading: true,
      isFetching: true,
      error: null,
    };
    const { rerenderPicker } = renderPicker();

    await user.click(screen.getByRole('radio', { name: /company 101/i }));
    expect(screen.getByText(/loading company scenarios/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create case/i })).not.toBeInTheDocument();

    pickerState.companyHookResult = {
      scenarios: [],
      isLoading: false,
      isFetching: false,
      error: new Error('bad response'),
    };
    rerenderPicker();
    expect(screen.getByText(/company scenarios could not be loaded/i)).toBeInTheDocument();

    pickerState.companyHookResult = {
      scenarios: [],
      isLoading: false,
      isFetching: false,
      error: null,
    };
    rerenderPicker();
    expect(screen.getByText(/no company scenarios yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create new scenario/i })).toBeEnabled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('makes retained scenario rows nonactionable during refetch and refetch error', async () => {
    const user = userEvent.setup();
    const { rerenderPicker } = renderPicker();

    await user.click(screen.getByRole('radio', { name: /company 101/i }));
    await user.click(screen.getByRole('radio', { name: /base scenario/i }));
    expect(screen.getByRole('button', { name: /create case/i })).toBeEnabled();

    pickerState.companyHookResult = {
      scenarios: [makeScenario()],
      isLoading: false,
      isFetching: true,
      error: null,
    };
    rerenderPicker();
    expect(screen.getByText(/loading company scenarios/i)).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /base scenario/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create case/i })).not.toBeInTheDocument();

    pickerState.companyHookResult = {
      scenarios: [makeScenario()],
      isLoading: false,
      isFetching: false,
      error: new Error('refetch failed'),
    };
    rerenderPicker();
    expect(screen.getByText(/company scenarios could not be loaded/i)).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /base scenario/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create case/i })).not.toBeInTheDocument();
  });

  it('creates a scenario only on explicit action and binds the returned scenario', async () => {
    const user = userEvent.setup();
    pickerState.companyHookResult = {
      scenarios: [],
      isLoading: false,
      isFetching: false,
      error: null,
    };
    const createdScenario = makeScenario({ name: 'New Scenario', caseCount: 0 });
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(jsonResponse({ scenario: createdScenario, replay: false }, 201));
    globalThis.fetch = fetchSpy;
    const { invalidateSpy } = renderPicker();

    await user.click(screen.getByRole('radio', { name: /company 101/i }));
    expect(fetchSpy).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /create new scenario/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/companies/101/scenarios');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({});
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toEqual(expect.any(String));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['company-scenarios', '101'] });
    expect(screen.getByRole('radio', { name: /new scenario/i })).toBeChecked();
  });

  it('reuses the create-new idempotency key when the user retries an uncertain failure', async () => {
    const user = userEvent.setup();
    pickerState.companyHookResult = {
      scenarios: [],
      isLoading: false,
      isFetching: false,
      error: null,
    };
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'temporary_failure' }, 500))
      .mockResolvedValueOnce(
        jsonResponse(
          { scenario: makeScenario({ name: 'New Scenario', caseCount: 0 }), replay: true },
          201
        )
      );
    globalThis.fetch = fetchSpy;
    renderPicker();

    await user.click(screen.getByRole('radio', { name: /company 101/i }));
    await user.click(screen.getByRole('button', { name: /create new scenario/i }));
    expect(await screen.findByText(/scenario creation failed/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /create new scenario/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    const firstHeaders = fetchSpy.mock.calls[0]?.[1]?.headers as Record<string, string>;
    const secondHeaders = fetchSpy.mock.calls[1]?.[1]?.headers as Record<string, string>;
    expect(firstHeaders['Idempotency-Key']).toBe(secondHeaders['Idempotency-Key']);
    expect(screen.getByRole('radio', { name: /new scenario/i })).toBeChecked();
  });

  it('closes on Escape through the dialog focus trap', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderPicker();

    await user.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
