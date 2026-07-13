import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScenarioCaseSeedV1Schema } from '../../../../shared/contracts/scenarios/scenario-case-seed-v1.contract';
import { ScenarioFactsSeedPicker } from '../../../../client/src/components/scenarios/ScenarioFactsSeedPicker';

const pickerState = vi.hoisted(() => ({
  flagEnabled: true,
  hookResult: {
    seeds: [] as unknown[],
    response: undefined as unknown,
    isLoading: false,
    error: null as Error | null,
  },
}));

vi.mock('@/core/flags/flagAdapter', () => ({
  useFeatureFlag: () => pickerState.flagEnabled,
}));

vi.mock('@/hooks/useFundScenarioSeeds', () => ({
  useFundScenarioSeeds: () => pickerState.hookResult,
}));

const SCENARIO_ID = '00000000-0000-4000-8000-000000000101';
const SCENARIO_CASE_ID = '00000000-0000-4000-8000-000000000201';

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
  scenario?: { id: string; version: number; locked_at?: string | null } | null;
  createdFromFactsHash?: string;
}

function renderPicker(options: RenderPickerOptions = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const onOpenChange = vi.fn();
  const scenario =
    options.scenario === undefined
      ? { id: SCENARIO_ID, version: 4, locked_at: null }
      : options.scenario;

  const result = render(
    <QueryClientProvider client={queryClient}>
      <ScenarioFactsSeedPicker
        fundId="7"
        open
        onOpenChange={onOpenChange}
        scenario={scenario ?? undefined}
        createdFromFactsHash={options.createdFromFactsHash}
      />
    </QueryClientProvider>
  );

  return { ...result, queryClient, invalidateSpy, onOpenChange };
}

async function selectLiveSeedAndFillRequiredInputs(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('radio', { name: /company 101/i }));
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
    pickerState.hookResult = {
      seeds: response.seeds,
      response,
      isLoading: false,
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
    pickerState.hookResult = {
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
    pickerState.hookResult = {
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
    pickerState.hookResult = {
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
    await user.click(screen.getByRole('button', { name: /create case/i }));

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(await screen.findAllByText('Required')).toHaveLength(5);
  });

  it('hides mutation for locked scenarios', () => {
    renderPicker({
      scenario: {
        id: SCENARIO_ID,
        version: 4,
        locked_at: '2026-07-13T18:00:00.000Z',
      },
    });

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
    });
  });

  it('shows a retryable message on version conflict and does not auto-retry', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: 'version_conflict', message: 'stale' }, 409));
    globalThis.fetch = fetchSpy;
    renderPicker();

    await selectLiveSeedAndFillRequiredInputs(user);
    await user.click(screen.getByRole('button', { name: /create case/i }));

    expect(await screen.findByText(/scenario changed.*try again/i)).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
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

  it('opens in discovery-only mode without issuing a mutation when no scenario is supplied', () => {
    renderPicker({ scenario: null });

    expect(screen.getByText(/select a company scenario to create a case/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create case/i })).not.toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('closes on Escape through the dialog focus trap', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderPicker();

    await user.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
