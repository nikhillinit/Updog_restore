import React, { useState } from 'react';
import { webcrypto } from 'node:crypto';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWouterWrapper } from '../../utils/withWouter';
import frozen from '../../fixtures/capital-planning/workspace-b8.json';
import { FundScenarioWorkspacePage } from '../../../client/src/pages/fund-scenario-workspace';
import { CreateCapitalPlanScenarioModal } from '../../../client/src/components/scenarios/CreateCapitalPlanScenarioModal';
import {
  CapitalPlanComparisonTable,
  CapitalPlanResultView,
} from '../../../client/src/components/fund-results/CapitalPlanComparisonTable';
import * as api from '../../../client/src/lib/fund-scenario-workspace-api';
import * as keys from '../../../client/src/lib/fund-scenario-workspace-query-keys';
import * as review from '../../../client/src/lib/capital-plan-review';
import { apiRequest } from '../../../client/src/lib/queryClient';
import {
  getCapitalDraft,
  getCapitalSaveIntent,
  newCapitalDraft,
  retainCapitalDraft,
  retainCapitalSaveIntent,
} from '../../../client/src/components/scenarios/capital-plan-draft';
import { FundResultsReadV1Schema } from '../../../shared/contracts/fund-results-v1.contract';
import {
  CapitalPlanningMemoV1Schema,
  type CapitalIssueV1,
  type CapitalPlanningMemoV1,
} from '../../../shared/contracts/capital-planning-v1.contract';
import {
  CreateFundScenarioSetV3Schema,
  FundScenarioCapitalCalculateResponseV1Schema,
  FundScenarioCapitalDetailResponseV1Schema,
  FundScenarioCapitalResultsResponseV1Schema,
  FundScenarioCapitalSourceResponseV1Schema,
  FundScenarioSetDetailV1Schema,
  type FundScenarioCapitalSourceResponseV1,
  type FundScenarioSetDetailV1,
} from '../../../shared/contracts/fund-scenario-sets-v1.contract';
import {
  FundScenarioCapitalComparisonV1Schema,
  FundScenarioComparisonV1Schema,
  type FundScenarioCapitalComparisonV1,
} from '../../../shared/contracts/fund-scenario-comparison-v1.contract';

vi.mock('@/contexts/FundContext', () => ({ useFundContext: () => ({ fundId: null }) }));

// Recorded B8 financial bytes plus independently retained B4 CP-032 expected results.
// Only read wrappers and explicitly labeled UI-state variants below are synthetic.
// Provenance: B9/test-engineer/fixture-provenance.json in the external execution evidence.
// Appended B4 provenance: B9/resume-r1/test-engineer/fixture-provenance.json.
const calculate = FundScenarioCapitalCalculateResponseV1Schema.parse(frozen.calculate);
const saved = calculate.payload.variants[0]!;
const bundle = saved.result.sourceBundle;
const FUND = String(calculate.payload.fundId);
const SET = calculate.payload.scenarioSetId;
const TIME = calculate.payload.calculatedAt;
const REPRESENTATION = 'capital-plan-v1';
const declarationMessage = 'An exact-path source-unit declaration is required';
const selectionMessage =
  'Scenario selections are required to determine construction sources and declarations';
const readState = {
  sourceFreshness: 'CURRENT' as const,
  calculationReadiness: { context: 'saved_input' as const, state: 'READY' as const, issues: [] },
  interpretationCompatibility: {
    state: 'CURRENT' as const,
    savedVersion: bundle.interpretationVersion,
    currentVersion: bundle.interpretationVersion,
  },
};

function sourceResponse(extraIssues: CapitalIssueV1[] = []): FundScenarioCapitalSourceResponseV1 {
  // These are inspector-shaped test metadata, not a claimed recorded source GET.
  const remainingDeclarations = Object.entries(bundle.unitDeclarations).map(([path, unit]) => ({
    path,
    allowedUnits: unit === 'usd' ? ['usd', 'usd_millions'] : [unit],
  }));
  return FundScenarioCapitalSourceResponseV1Schema.parse({
    contractVersion: 'fund-scenario-capital-source/1.0.0',
    representation: REPRESENTATION,
    projection: structuredClone(bundle.projection),
    sourceBundleHash: bundle.sourceBundleHash,
    publishedAt: bundle.publishedAt,
    interpretationVersion: bundle.interpretationVersion,
    remainingDeclarations,
    materialized: null,
    calculationReadiness: {
      context: 'current_preview',
      state: extraIssues.some((issue) => issue.support !== 'incomplete')
        ? 'UNSUPPORTED'
        : 'INPUT_REQUIRED',
      issues: [
        ...extraIssues,
        ...remainingDeclarations.map(({ path }) => ({
          code: 'UNIT_PROVENANCE_UNRESOLVED',
          path,
          message: declarationMessage,
          support: 'incomplete',
        })),
        { code: 'INVALID_INPUT', path: 'inputs', message: selectionMessage, support: 'incomplete' },
      ],
    },
    interpretationCompatibility: readState.interpretationCompatibility,
  });
}

function sourceForFollowOnValidation() {
  const source = sourceResponse();
  // Synthetic inspector option for first-error tests; these invalid drafts never calculate.
  const stages = source.projection.facts.find((fact) => fact.path === 'pipelineProfiles[0].stages');
  if (stages?.state === 'array') stages.length = 2;
  source.projection.facts.push({
    path: 'pipelineProfiles[0].stages[1].id',
    state: 'present',
    rawValue: 's1',
  });
  return source;
}

function summary(id = SET, archived = false) {
  return {
    id,
    fundId: Number(FUND),
    name: 'Recorded capital plan',
    description: null,
    sourceConfigId: bundle.projection.sourceConfigId,
    sourceConfigVersion: bundle.projection.sourceConfigVersion,
    variantCount: 1,
    archivedAt: archived ? TIME : null,
    archivedByUserId: null,
    archivedByLabel: null,
    createdByUserId: null,
    createdByLabel: null,
    updatedByUserId: null,
    updatedByLabel: null,
    createdAt: TIME,
    updatedAt: TIME,
  };
}

function capitalDetail(archived = false) {
  return FundScenarioCapitalDetailResponseV1Schema.parse({
    ...summary(SET, archived),
    contractVersion: 'fund-scenario-capital-detail/1.0.0',
    representation: REPRESENTATION,
    overrideType: 'capital_plan',
    baselineVariantId: saved.variantId,
    sourceBundleHash: bundle.sourceBundleHash,
    interpretationVersion: bundle.interpretationVersion,
    readState,
    variants: [
      {
        id: saved.variantId,
        scenarioSetId: SET,
        name: saved.name,
        description: null,
        sortOrder: 0,
        override: {
          overrideType: 'capital_plan',
          payload: {
            input: saved.result.input,
            sourceBundle: bundle,
            sourceBundleHash: bundle.sourceBundleHash,
          },
        },
        createdAt: TIME,
        updatedAt: TIME,
      },
    ],
  });
}

function capitalList(archived = false) {
  const {
    contractVersion: _version,
    representation: _representation,
    variants: _variants,
    ...row
  } = capitalDetail(archived);
  return {
    contractVersion: 'fund-scenario-capital-list/1.0.0',
    representation: REPRESENTATION,
    scenarioSets: [row],
  };
}

function capitalResults(ready = true) {
  const { contractVersion: _version, representation: _representation, ...savedResult } = calculate;
  return FundScenarioCapitalResultsResponseV1Schema.parse({
    contractVersion: 'fund-scenario-capital-results/1.0.0',
    representation: REPRESENTATION,
    scenarioSetId: SET,
    savedResult: ready ? savedResult : null,
    unavailableReason: ready ? null : 'NO_CALCULATED_RESULT',
    readState,
  });
}

function memo(companion?: keyof typeof frozen.companions): CapitalPlanningMemoV1 {
  const result = structuredClone(saved.result);
  if (companion) {
    const recorded = frozen.companions[companion];
    result.input.performanceCase = structuredClone(
      recorded.input
    ) as typeof result.input.performanceCase;
    result.performance = structuredClone(recorded.performance) as typeof result.performance;
  }
  return CapitalPlanningMemoV1Schema.parse({
    contractVersion: 'capital-planning-memo/1.0.0',
    fundId: Number(FUND),
    scenarioSetId: SET,
    variantId: saved.variantId,
    scenarioSetName: 'Recorded capital plan',
    variantName: saved.name,
    result,
    readState: structuredClone(readState),
    countBasis: 'expected',
    detailScope: 'complete',
    limitations: [
      'Planning estimates under saved assumptions; not a liquidity forecast.',
      'Simultaneous input changes do not assign additive causes to output differences.',
      'Comparison rows use saved values; entered rows cover only allocations with entered counts.',
    ],
  });
}

function comparison(value = memo()): FundScenarioCapitalComparisonV1 {
  return FundScenarioCapitalComparisonV1Schema.parse({
    contractVersion: 'fund-scenario-capital-comparison/1.0.0',
    representation: REPRESENTATION,
    fundId: Number(FUND),
    scenarioSetId: SET,
    comparisonStatus: 'comparable',
    snapshotId: calculate.snapshotId,
    baselineVariantId: saved.variantId,
    baseline: value,
    variants: [],
    readState: value.readState,
    calculatedAt: TIME,
  });
}

function twoVariantComparison() {
  const value = comparison(memo('manual99'));
  const other = memo('manual1');
  other.variantId = '44444444-4444-4444-8444-444444444444';
  other.variantName = 'Manual FMV alternative';
  value.variants.push({
    variantId: other.variantId,
    name: other.variantName,
    overrideType: 'capital_plan',
    memo: other,
    changedInputs: [
      {
        group: 'companion',
        path: 'input.performanceCase.manualFmvOverride.amountUsd',
        label: 'Manual FMV override',
        baseline: '99.000000',
        variant: '1.000000',
      },
    ],
    metricDeltas: [],
    companionComparison: 'same_issuer',
  });
  return FundScenarioCapitalComparisonV1Schema.parse(value);
}

function expandMemoSections() {
  for (const toggle of document.querySelectorAll('details:not([open]) > summary'))
    fireEvent.click(toggle);
}

function legacyDetail(reserve = false, id = SET): FundScenarioSetDetailV1 {
  return {
    ...summary(id),
    name: reserve ? 'Legacy reserve plan' : 'Legacy fee plan',
    variants: [
      {
        id: saved.variantId,
        scenarioSetId: id,
        name: 'Legacy variant',
        description: null,
        sortOrder: 0,
        createdAt: TIME,
        updatedAt: TIME,
        override: reserve
          ? {
              overrideType: 'reserve_allocation',
              payload: {
                allocationVersion: 1,
                items: [{ companyId: 101, plannedReservesCents: 100, maxAllocationCents: 150 }],
              },
            }
          : {
              overrideType: 'allocation',
              payload: { allocations: [{ id: 'seed', category: 'Initial', percentage: 100 }] },
            },
      },
    ],
  } as FundScenarioSetDetailV1;
}

function legacyComparison() {
  return {
    fundId: Number(FUND),
    comparisonStatus: 'no_scenario_results',
    scenarioSet: {
      scenarioSetId: SET,
      name: 'Legacy fee plan',
      sourceConfigId: 11,
      sourceConfigVersion: 1,
    },
    baseline: null,
    variants: [],
    staleness: null,
    calculatedAt: null,
  };
}

function legacyResults() {
  const unavailable = { status: 'unavailable', reason: 'No authoritative result' };
  return {
    status: 'pending',
    fundId: Number(FUND),
    fund: { name: 'Synthetic B9 fund', vintageYear: 2026, size: 100 },
    lifecycle: {
      fundId: Number(FUND),
      configState: {
        latestVersion: 1,
        draftVersion: null,
        publishedVersion: 1,
        hasDraft: false,
        hasPublished: true,
        publishedAt: TIME,
        draftUpdatedAt: null,
        publishedUpdatedAt: TIME,
      },
      calculationState: {
        status: 'not_requested',
        configVersion: null,
        runId: null,
        correlationId: null,
        dispatchState: null,
        availableSnapshotTypes: [],
        expectedSnapshotTypes: ['RESERVE', 'PACING'],
        lastCalculatedAt: null,
        lastError: null,
        legacyEvidence: false,
      },
      legacy: { engineResultsPresent: false },
    },
    sections: {
      reserve: unavailable,
      pacing: unavailable,
      scorecard: unavailable,
      scenarios: unavailable,
      waterfall: unavailable,
      economics: unavailable,
    },
  };
}

type Call = { method: string; url: URL; body: unknown; headers: Headers };
type Dispatcher = (call: Call) => unknown | Response | Promise<unknown | Response>;
let calls: Call[] = [];
let writeClipboard: ReturnType<typeof vi.fn>;
const clients: QueryClient[] = [];
function client() {
  const value = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  clients.push(value);
  return value;
}

function dispatch(overrides?: Dispatcher) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        'http://localhost'
      );
      const call = {
        method: init?.method ?? 'GET',
        url,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
        headers: new Headers(init?.headers),
      };
      calls.push(call);
      let body = await overrides?.(call);
      if (body === undefined) {
        const path = url.pathname;
        const capital = url.searchParams.get('representation') === REPRESENTATION;
        if (call.method === 'GET' && path === `/api/funds/${FUND}/results` && !capital)
          body = legacyResults();
        else if (call.method === 'GET' && path === `/api/funds/${FUND}/scenario-sets/source-config`)
          body = capital
            ? sourceResponse()
            : {
                contractVersion: 'fund-scenario-source-config/1.0.0',
                sourceConfigId: 11,
                sourceConfigVersion: 1,
                publishedAt: TIME,
                allocations: [],
                capitalPlanAllocations: null,
              };
        else if (call.method === 'GET' && path === `/api/funds/${FUND}/scenario-sets`)
          body = capital
            ? capitalList(url.searchParams.get('includeArchived') === 'true')
            : { scenarioSets: [] };
        else if (call.method === 'GET' && path === `/api/funds/${FUND}/scenario-sets/${SET}`)
          body = capital ? capitalDetail() : legacyDetail();
        else if (
          call.method === 'GET' &&
          path === `/api/funds/${FUND}/scenario-sets/${SET}/results` &&
          capital
        )
          body = capitalResults();
        else if (
          call.method === 'GET' &&
          path === `/api/funds/${FUND}/scenario-sets/${SET}/comparison` &&
          capital
        )
          body = comparison();
        else if (
          call.method === 'GET' &&
          path === `/api/funds/${FUND}/scenario-sets/${SET}/comparison`
        )
          body = legacyComparison();
        else throw new Error(`Unexpected B9 request: ${call.method} ${url.pathname}${url.search}`);
      }
      return body instanceof Response
        ? body
        : new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
    })
  );
}

function renderWorkspace(queryClient = client(), enabled = true) {
  const { Wrapper, goto } = createWouterWrapper(`/fund-model-results/${FUND}/scenarios`);
  return {
    queryClient,
    goto,
    ...render(
      <QueryClientProvider client={queryClient}>
        <Wrapper>
          <FundScenarioWorkspacePage capitalPlanEnabled={enabled} />
        </Wrapper>
      </QueryClientProvider>
    ),
  };
}

function ModalHarness({ onSuccess = vi.fn() }: { onSuccess?: (created: unknown) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen(true)}>Reopen capital draft</button>
      <button onClick={() => setOpen(false)}>Hide capital draft</button>
      <CreateCapitalPlanScenarioModal
        fundId={FUND}
        open={open}
        onOpenChange={setOpen}
        onSuccess={onSuccess}
      />
    </>
  );
}

function renderModal(queryClient = client(), onSuccess = vi.fn()) {
  return {
    queryClient,
    onSuccess,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ModalHarness onSuccess={onSuccess} />
      </QueryClientProvider>
    ),
  };
}

function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
}
function step(name: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`(?:^|\\d\\. )${name}$`) }));
}
async function fillDraft() {
  await screen.findByLabelText('Scenario name', { exact: true });
  change('Scenario name', 'Independent component plan');
  for (const [path, unit] of Object.entries(bundle.unitDeclarations)) {
    fireEvent.change(screen.getByLabelText(`Source unit: ${path}`, { exact: true }), {
      target: { value: unit },
    });
  }
  step('Allocations');
  const variant = screen.queryByLabelText('Variant name', { exact: true });
  if (variant) fireEvent.change(variant, { target: { value: 'Baseline' } });
  if (!screen.queryByLabelText('Allocation name', { exact: true })) step('Add allocation');
  for (const [name, value] of [
    ['Source allocation', 'a1'],
    ['Allocation name', 'Seed'],
    ['Pipeline profile', 'p1'],
    ['Entry stage', 's0'],
    ['Entry round', 'Seed'],
    ['Budget share (ratio)', '1'],
    ['Initial check (USD)', '1'],
    ['Deployment period (years)', '1'],
  ])
    change(name!, value!);
}
async function reviewDraft() {
  await fillDraft();
  step('Review');
  step('Review capital plan');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save capital scenario' })).toBeEnabled()
  );
}

beforeEach(() => {
  calls = [];
  vi.stubGlobal('crypto', webcrypto);
  retainCapitalDraft(FUND, newCapitalDraft());
  retainCapitalSaveIntent(FUND, null);
  writeClipboard = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: writeClipboard },
  });
});
afterEach(() => {
  cleanup();
  for (const queryClient of clients.splice(0)) queryClient.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('B9 capital presentation from frozen B8 values', () => {
  it('PERF-R3-001 PERF-R3-002 CP-054 preserves issuer and junior labels and unavailable values in view/copy', async () => {
    const value = memo('unavailable');
    render(<CapitalPlanComparisonTable comparison={comparison(value)} />);
    expandMemoSections();
    expect(screen.getAllByText('Synthetic issuer', { exact: false })[0]).toBeVisible();
    expect(screen.getAllByText('Representative issuer', { exact: false })[0]).toBeVisible();
    expect(
      screen.getAllByText('Preferences Behind Position', { exact: true }).length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText('FMV_UNAVAILABLE', { exact: false })[0]).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Copy capital memo/ }));
    await waitFor(() => expect(writeClipboard).toHaveBeenCalledOnce());
    const text = String(writeClipboard.mock.calls[0]![0]);
    expect(text).toContain('Synthetic issuer');
    expect(text).toContain('Representative issuer');
    expect(text).toContain('Preferences Behind Position');
    expect(text).toContain('FMV_UNAVAILABLE');
    expect(text).toContain('2000000.000000');
  });

  it('PERF-R3-007 manual FMV changes only valuation presentation, preserving recorded proceeds/MOIC/construction', async () => {
    const before = memo('manual99');
    const after = memo('manual1');
    expect(after.result.construction).toEqual(before.result.construction);
    expect(after.result.performance!.adjustedProceedsUsd).toBe('0.000000');
    expect(after.result.performance!.adjustedMoic).toEqual(before.result.performance!.adjustedMoic);
    const view = render(<CapitalPlanResultView memo={before} />);
    fireEvent.click(screen.getByRole('button', { name: /Copy capital memo/ }));
    await waitFor(() => expect(writeClipboard).toHaveBeenCalledTimes(1));
    expect(String(writeClipboard.mock.calls[0]![0])).toContain('99.000000');
    view.rerender(<CapitalPlanResultView memo={after} />);
    fireEvent.click(screen.getByRole('button', { name: /Copy capital memo/ }));
    await waitFor(() => expect(writeClipboard).toHaveBeenCalledTimes(2));
    const second = String(writeClipboard.mock.calls[1]![0]);
    expect(second).toContain('1.000000');
    expect(second).toContain('0.000000000000');
    expect(after.result.input.performanceCase!.manualFmvOverride!.amountUsd).toBe('1.000000');
  });

  it('CP-022 UI-R3-006 UI-R3-010 retains exact saved values and copied stale state after a publication change', async () => {
    const value = memo();
    const savedBytes = JSON.stringify(value.result);
    const view = render(<CapitalPlanResultView memo={value} />);
    const stale = structuredClone(value);
    stale.readState.sourceFreshness = 'STALE_PUBLISH';
    view.rerender(<CapitalPlanResultView memo={stale} />);
    expect(screen.getAllByText('STALE_PUBLISH', { exact: false })[0]).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Copy capital memo/ }));
    await waitFor(() => expect(writeClipboard).toHaveBeenCalledOnce());
    const text = String(writeClipboard.mock.calls[0]![0]);
    expect(text).toContain('STALE_PUBLISH');
    expect(text).toContain('90.000000');
    expect(JSON.stringify(stale.result)).toBe(savedBytes);
    for (const disclosure of Object.values(saved.result.construction.disclosures))
      expect(text).toContain(disclosure);
    for (const literal of [
      bundle.sourceBundleHash,
      bundle.interpretationVersion,
      saved.result.contractVersion,
      'expected',
    ])
      expect(text).toContain(literal);
  });

  it('UI-R3-002 presents lifetime commitments, GP deduction, full-fund costs and available capital without current-cash inputs', () => {
    render(<CapitalPlanResultView memo={memo()} />);
    expandMemoSections();
    const text = document.body.textContent!;
    for (const literal of [
      '100.000000',
      '10.000000',
      '0.400000000000',
      '4.000000',
      '2.000000',
      '90.000000',
      'full_fund_committed_capital',
    ])
      expect(text).toContain(literal);
    expect(text).toContain(saved.result.construction.disclosures.gp);
    expect(saved.result.input).not.toHaveProperty('currentCashUsd');
    expect(saved.result.input).not.toHaveProperty('calledCapitalUsd');
  });

  it.each([
    [
      'explicitZero',
      '0',
      'No default applied',
      '96afe197376c8b2e2b0ddaa88e5d986d86afc032f6e3b1656eefc18be8fd8d17',
    ],
    [
      'omittedZero',
      'Absent',
      'ADR_070_MISSING_FRACTION_ZERO',
      '3497c806fc74f2ed283fd446396f93a4eee1008015e588893d3bf70a1dda853b',
    ],
  ] as const)(
    'CP-032 preserves independent B4 %s amounts and raw/default provenance in view and copy',
    async (mode, rawFraction, defaultReason, sourceHash) => {
      const recorded = frozen.b4Cp032ZeroFraction[mode];
      const before = JSON.stringify(recorded);
      const value = CapitalPlanningMemoV1Schema.parse({
        ...memo(),
        result: structuredClone(recorded),
        readState: {
          ...readState,
          interpretationCompatibility: {
            state: 'CURRENT',
            savedVersion: recorded.sourceBundle.interpretationVersion,
            currentVersion: recorded.sourceBundle.interpretationVersion,
          },
        },
      });
      render(<CapitalPlanResultView memo={value} />);
      expandMemoSections();
      const gp = screen.getByText('GP source and deemed contribution', {
        selector: 'summary',
      }).parentElement!;
      for (const [label, expected] of [
        ['Raw funded-from-fees fraction', rawFraction],
        ['Effective funded-from-fees fraction', '0.000000000000'],
        ['Fraction default reason', defaultReason],
      ])
        expect(
          within(gp).getByText(label!, { selector: 'dt', exact: true }).nextElementSibling
        ).toHaveTextContent(expected!);
      fireEvent.click(screen.getByRole('button', { name: /Copy capital memo/ }));
      await waitFor(() => expect(writeClipboard).toHaveBeenCalledOnce());
      const copied = String(writeClipboard.mock.calls[0]![0]);
      for (const text of [document.body.textContent!, copied]) {
        for (const literal of [
          '100000000.000000',
          '10000000.000000',
          '18000000.000000',
          '2000000.000000',
          '80000000.000000',
          '0.000000',
          'full_fund_committed_capital',
          'callable_as_needed',
          sourceHash,
          defaultReason,
        ])
          expect(text).toContain(literal);
      }
      expect(copied).toContain(`Raw funded-from-fees fraction: ${rawFraction}`);
      expect(copied).toContain('GP deemed contribution deduction: $0.00 (USD 0.000000)');
      expect(value.result.input).not.toHaveProperty('currentCashUsd');
      expect(value.result.input).not.toHaveProperty('calledCapitalUsd');
      expect(value.result.sourceBundle.sourceBundleHash).toBe(sourceHash);
      expect(JSON.stringify(value.result)).toBe(before);
      expect(JSON.stringify(recorded)).toBe(before);
    }
  );

  it('CP-041 UI-R3-009 renders simultaneous verdict axes and every exact disclosure', async () => {
    render(<CapitalPlanResultView memo={memo()} />);
    const text = document.body.textContent!;
    for (const heading of [
      'Verdict axes',
      'Capital budget',
      'Construction',
      'Schedule',
      'Stress results',
      'Provenance',
      'Disclosures',
    ])
      expect(screen.getByText(heading, { selector: 'summary', exact: true })).toBeVisible();
    for (const axis of Object.values(saved.result.construction.verdicts))
      expect(text).toContain(axis);
    for (const disclosure of Object.values(saved.result.construction.disclosures))
      expect(text).toContain(disclosure);
    expect(text).toMatch(/under modeled assumptions/i);
  });

  it('CP-041 qualifies each negative verdict in its own rendered and copied row', async () => {
    const value = memo();
    // Synthetic presentation controls only; financial amounts remain the frozen B8 values.
    value.result.construction.verdicts.lifetimeCapacity = 'over_capacity';
    value.result.construction.verdicts.allocationBudget = 'allocation_gap';
    value.result.construction.verdicts.reserveEarmark = 'earmark_gap';
    render(<CapitalPlanResultView memo={CapitalPlanningMemoV1Schema.parse(value)} />);
    expandMemoSections();
    const axes = screen.getByText('Verdict axes', { selector: 'summary' }).parentElement!;
    fireEvent.click(screen.getByRole('button', { name: /Copy capital memo/ }));
    await waitFor(() => expect(writeClipboard).toHaveBeenCalledOnce());
    const copied = String(writeClipboard.mock.calls[0]![0]);
    for (const [label, verdict] of [
      ['Lifetime capacity', 'over_capacity'],
      ['Allocation budget', 'allocation_gap'],
      ['Reserve earmark', 'earmark_gap'],
    ]) {
      const qualified = `${verdict} (under modeled assumptions)`;
      expect(
        within(axes).getByText(label!, { selector: 'dt', exact: true }).nextElementSibling
      ).toHaveTextContent(qualified);
      expect(copied.split('\n')).toContain(`${label}: ${qualified}`);
    }
    expect(copied).toContain(saved.result.construction.disclosures.timing);
    expect(document.body.textContent).toContain(saved.result.construction.disclosures.timing);
    expect(value.result.construction.budget).toEqual(saved.result.construction.budget);
  });

  it('CP-054 selected zero-cost companion keeps unavailable MOIC distinct from a numeric zero', () => {
    render(<CapitalPlanResultView memo={memo('zeroCost')} />);
    expandMemoSections();
    expect(screen.getAllByText('ZERO_COST', { exact: false })[0]).toBeVisible();
    expect(memo('zeroCost').result.performance!.adjustedMoic).toEqual({
      state: 'unavailable',
      value: null,
      reason: 'ZERO_COST',
    });
  });

  it('UI-R3-007 previews remain visibly unsaved and cannot copy a saved memo', () => {
    render(<CapitalPlanResultView memo={memo()} preview />);
    for (const marker of screen.getAllByText('UNSAVED PREVIEW', { exact: false }))
      expect(marker).toBeVisible();
    expect(screen.queryByRole('button', { name: /Copy capital memo/ })).not.toBeInTheDocument();
    expect(writeClipboard).not.toHaveBeenCalled();
  });

  it('UI-R3-011 uses named tables, keyboard-operable copy and no blue primary action', async () => {
    render(<CapitalPlanComparisonTable comparison={twoVariantComparison()} />);
    const copy = screen.getByRole('button', {
      name: `Copy capital memo: ${saved.name}`,
      exact: true,
    });
    expect(copy.className).not.toMatch(/(?:bg|text|border)-blue/);
    for (const table of screen.getAllByRole('table')) expect(table).toHaveAccessibleName();
    copy.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(writeClipboard).toHaveBeenCalledOnce());
  });

  it('UI-R3-010 copies every displayed saved memo row in the same section and row order', async () => {
    render(<CapitalPlanResultView memo={memo('manual99')} />);
    expandMemoSections();
    const displayed = [...document.querySelectorAll('details')].map((section) => ({
      heading: section.querySelector('summary')!.textContent!,
      rows: [...section.querySelectorAll('dl > div')].map(
        (row) => `${row.querySelector('dt')!.textContent}: ${row.querySelector('dd')!.textContent}`
      ),
    }));
    expect(displayed.length).toBeGreaterThan(5);
    fireEvent.click(screen.getByRole('button', { name: /Copy capital memo/ }));
    await waitFor(() => expect(writeClipboard).toHaveBeenCalledOnce());
    expect(writeClipboard.mock.calls[0]![0]).toBe(
      displayed.map(({ heading, rows }) => `${heading}\n${rows.join('\n')}`).join('\n\n')
    );
    expect(String(writeClipboard.mock.calls[0]![0])).toContain('labeled summary');
    expect(String(writeClipboard.mock.calls[0]![0])).toContain('Omitted monthly detail');
  });

  it('UI-R3-010 complete saved memo download retains exact historical payload and releases the object URL', async () => {
    const value = memo();
    let downloaded!: Blob;
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL(blob: Blob) {
          downloaded = blob;
          return 'blob:capital-saved-memo';
        }
        static revokeObjectURL = vi.fn();
      }
    );
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    render(<CapitalPlanResultView memo={value} />);
    fireEvent.click(
      screen.getByRole('button', {
        name: `Download complete saved memo: ${saved.name}`,
        exact: true,
      })
    );
    expect(anchorClick).toHaveBeenCalledOnce();
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsText(downloaded);
    });
    expect(JSON.parse(text)).toEqual(value);
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:capital-saved-memo');
  });
});

describe('B9 negotiated API and one-client cache isolation', () => {
  it.each(['legacy-first', 'capital-first'])(
    'WIRE-R3-009 keeps strict source/list/detail/results/comparison identities for %s',
    async (order) => {
      dispatch();
      const queryClient = client();
      const legacy: Array<{ queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }> = [
        {
          queryKey: keys.scenarioSourceConfigQueryKey(FUND),
          queryFn: () => api.fetchScenarioSourceConfig(FUND),
        },
        {
          queryKey: keys.scenarioSetListQueryKey(FUND),
          queryFn: () => api.fetchScenarioSetList(FUND),
        },
        {
          queryKey: keys.scenarioSetDetailQueryKey(FUND, SET),
          queryFn: async () =>
            FundScenarioSetDetailV1Schema.parse(
              await apiRequest('GET', api.scenarioSetApiPath(FUND, SET))
            ),
        },
        {
          queryKey: keys.fundResultsQueryKey(FUND),
          queryFn: async () =>
            FundResultsReadV1Schema.parse(
              await apiRequest('GET', api.scenarioApiPath(FUND, '/results'))
            ),
        },
        {
          queryKey: keys.scenarioComparisonQueryKey(FUND, SET),
          queryFn: async () =>
            FundScenarioComparisonV1Schema.parse(
              await apiRequest('GET', api.scenarioSetApiPath(FUND, SET, '/comparison'))
            ),
        },
      ];
      const capital: Array<{ queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }> = [
        {
          queryKey: keys.capitalScenarioSourceQueryKey(FUND),
          queryFn: () => api.fetchCapitalScenarioSource(FUND),
        },
        {
          queryKey: keys.capitalScenarioListQueryKey(FUND),
          queryFn: () => api.fetchCapitalScenarioList(FUND),
        },
        {
          queryKey: keys.capitalScenarioDetailQueryKey(FUND, SET),
          queryFn: () => api.fetchCapitalScenarioDetail(FUND, SET),
        },
        {
          queryKey: keys.capitalScenarioResultsQueryKey(FUND, SET),
          queryFn: () => api.fetchCapitalScenarioResults(FUND, SET),
        },
        {
          queryKey: keys.capitalScenarioComparisonQueryKey(FUND, SET),
          queryFn: () => api.fetchCapitalScenarioComparison(FUND, SET),
        },
      ];
      for (const batch of order === 'legacy-first' ? [legacy, capital] : [capital, legacy])
        for (const query of batch) await queryClient.fetchQuery({ ...query, staleTime: Infinity });
      expect(
        queryClient.getQueryData(keys.scenarioSetDetailQueryKey(FUND, SET))
      ).not.toHaveProperty('representation');
      for (const query of capital) {
        expect(query.queryKey.slice(0, 2)).toEqual(keys.workspaceQueryKey(FUND));
        expect(query.queryKey).toContain(REPRESENTATION);
        expect(queryClient.getQueryData(query.queryKey)).toHaveProperty(
          'representation',
          REPRESENTATION
        );
      }
      expect(
        new Set([...legacy, ...capital].map(({ queryKey }) => JSON.stringify(queryKey))).size
      ).toBe(10);
      await queryClient.fetchQuery({
        queryKey: keys.capitalScenarioListQueryKey(FUND, true),
        queryFn: () => api.fetchCapitalScenarioList(FUND, true),
      });
      expect(queryClient.getQueryData(keys.capitalScenarioListQueryKey(FUND, true))).toHaveProperty(
        'scenarioSets.0.archivedAt',
        TIME
      );
      expect(queryClient.getQueryData(keys.capitalScenarioListQueryKey(FUND))).toHaveProperty(
        'scenarioSets.0.archivedAt',
        null
      );
      await queryClient.invalidateQueries({
        queryKey: keys.workspaceQueryKey(FUND),
        refetchType: 'none',
      });
      for (const query of [...legacy, ...capital])
        expect(queryClient.getQueryState(query.queryKey)?.isInvalidated).toBe(true);
    }
  );

  it('WIRE-R3-007 wrong-family payloads fail strict parsers instead of entering either cache', async () => {
    dispatch(({ url }) =>
      url.searchParams.has('representation') ? { scenarioSets: [] } : capitalList()
    );
    await expect(api.fetchCapitalScenarioList(FUND)).rejects.toThrow();
    await expect(api.fetchScenarioSetList(FUND)).rejects.toThrow();
  });

  it('WIRE-R3-010 calculate is synchronous, uses the negotiated path and never sends reserve/status work', async () => {
    dispatch(({ method, url }) =>
      method === 'POST' && url.pathname.endsWith('/calculate') ? calculate : undefined
    );
    await expect(api.calculateCapitalScenario(FUND, SET)).resolves.toEqual(calculate);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url.searchParams.get('representation')).toBe(REPRESENTATION);
    expect(calls[0]!.body).toBeNull();
    expect(calls[0]!.headers.has('Idempotency-Key')).toBe(false);
    expect(calls[0]!.url.pathname).not.toMatch(/status|reserve/);
  });

  it('WIRE-R3-010 shows synchronous pending, success and failure and reloads saved results without capital polling', async () => {
    let release!: (value: unknown) => void;
    let attempt = 0;
    dispatch(({ method, url }) => {
      if (method !== 'POST' || !url.pathname.endsWith('/calculate')) return undefined;
      attempt += 1;
      return attempt === 1
        ? new Promise((resolve) => {
            release = resolve;
          })
        : new Response(
            JSON.stringify({ error: 'scenario_source_config_stale', message: 'Source changed' }),
            { status: 409 }
          );
    });
    renderWorkspace();
    const button = await screen.findByRole('button', { name: 'Calculate capital scenario' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(
      await screen.findByRole('button', { name: 'Calculating capital scenario' })
    ).toBeDisabled();
    const initialReads = calls.filter(
      ({ url }) => url.pathname.endsWith('/results') && url.searchParams.has('representation')
    ).length;
    await act(async () => release(calculate));
    expect(
      await screen.findByText('Capital calculation saved and reloaded.', { exact: true })
    ).toBeVisible();
    expect(
      calls.filter(
        ({ url }) => url.pathname.endsWith('/results') && url.searchParams.has('representation')
      ).length
    ).toBeGreaterThan(initialReads);
    fireEvent.click(screen.getByRole('button', { name: 'Calculate capital scenario' }));
    expect(await screen.findByText(/Calculation failed or its response was lost/)).toBeVisible();
    expect(
      calls.some(
        ({ url }) =>
          /calculation-status|calculate-reserve/.test(url.pathname) &&
          url.searchParams.has('representation')
      )
    ).toBe(false);
  });

  it('WIRE-R3-007 WIRE-R3-010 renders mixed families and retains legacy reserve status queries', async () => {
    const legacyId = '88888888-8888-4888-8888-888888888888';
    dispatch(({ method, url }) => {
      if (method !== 'GET' || url.searchParams.has('representation')) return undefined;
      if (url.pathname.endsWith('/scenario-sets'))
        return { scenarioSets: [{ ...summary(legacyId), name: 'Legacy reserve plan' }] };
      if (url.pathname.endsWith(`/scenario-sets/${legacyId}`)) return legacyDetail(true, legacyId);
      if (url.pathname.endsWith(`/scenario-sets/${legacyId}/comparison`))
        return {
          ...legacyComparison(),
          scenarioSet: { ...legacyComparison().scenarioSet, scenarioSetId: legacyId },
        };
      if (url.pathname.endsWith('/calculation-status'))
        return {
          fundId: Number(FUND),
          scenarioSetId: legacyId,
          calculationMode: 'async_reserve_allocation',
          status: 'queued',
          jobId: null,
          correlationId: null,
          snapshotId: null,
          lastEventAt: TIME,
          lastError: null,
        };
      return undefined;
    });
    renderWorkspace();
    expect(await screen.findByTestId(`scenario-workspace-set-${legacyId}`)).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Calculate capital scenario' })).toBeVisible();
    await waitFor(() =>
      expect(calls.some(({ url }) => url.pathname.endsWith('/calculation-status'))).toBe(true)
    );
    expect(
      calls
        .filter(({ url }) => url.pathname.endsWith('/calculation-status'))
        .every(({ url }) => !url.searchParams.has('representation'))
    ).toBe(true);
  });

  it('WIRE-R3-007 shows a capital-family failure while retaining legacy rows', async () => {
    dispatch(({ url }) => {
      if (url.pathname.endsWith('/scenario-sets'))
        return url.searchParams.has('representation')
          ? new Response(
              JSON.stringify({
                error: 'capital_read_failed',
                message: 'Capital family unavailable',
              }),
              { status: 503 }
            )
          : { scenarioSets: [summary()] };
      return undefined;
    });
    renderWorkspace();
    expect(
      await screen.findByText('Capital plan list unavailable', { exact: false })
    ).toBeVisible();
    expect(await screen.findByTestId(`scenario-workspace-set-${SET}`)).toBeVisible();
  });

  it('B9 entry remains unavailable unless the explicit component capability is enabled', async () => {
    dispatch();
    renderWorkspace(client(), false);
    await screen.findByRole('heading', { name: 'Scenario Workspace' });
    expect(calls.some(({ url }) => url.searchParams.has('representation'))).toBe(false);
    expect(
      screen.queryByRole('button', { name: /New capital|Create capital/i })
    ).not.toBeInTheDocument();
  });
});

describe('B9 public guided review and raw drafts', () => {
  it('UI-R3-003 direct modal fund changes preserve both raw draft stores when only the next source is cached', async () => {
    const nextFund = '202';
    const original = newCapitalDraft();
    original.name = 'First fund raw draft';
    original.variants[0]!.input.allocations[0]!.initialCheckUsd = '1.';
    const next = newCapitalDraft();
    next.name = 'Second fund raw draft';
    next.variants[0]!.input.allocations[0]!.initialCheckUsd = '2.';
    retainCapitalDraft(FUND, original);
    retainCapitalDraft(nextFund, next);
    retainCapitalSaveIntent(nextFund, null);
    const cachedSource = sourceResponse();
    cachedSource.projection.fundId = Number(nextFund);
    const queryClient = client();
    queryClient.setQueryData(keys.capitalScenarioSourceQueryKey(nextFund), cachedSource);
    dispatch(({ url }) =>
      url.pathname.includes(`/funds/${nextFund}/`) ? cachedSource : new Promise(() => undefined)
    );
    function modal(fundId: string) {
      return (
        <QueryClientProvider client={queryClient}>
          <CreateCapitalPlanScenarioModal
            fundId={fundId}
            open
            onOpenChange={vi.fn()}
            onSuccess={vi.fn()}
          />
        </QueryClientProvider>
      );
    }
    const view = render(modal(FUND));
    expect(screen.getByLabelText('Scenario name')).toHaveValue(original.name);
    view.rerender(modal(nextFund));
    await waitFor(() => expect(screen.getByLabelText('Scenario name')).toHaveValue(next.name));
    step('Allocations');
    expect(screen.getByLabelText('Initial check (USD)')).toHaveValue('2.');
    expect(getCapitalDraft(FUND)).toEqual(original);
    expect(getCapitalDraft(nextFund)).toEqual({ ...next, source: cachedSource });
    view.rerender(modal(FUND));
    await waitFor(() => expect(screen.getByLabelText('Scenario name')).toHaveValue(original.name));
    step('Allocations');
    expect(screen.getByLabelText('Initial check (USD)')).toHaveValue('1.');
    expect(getCapitalDraft(FUND)).toEqual(original);
    expect(getCapitalDraft(nextFund)).toEqual({ ...next, source: cachedSource });
  });

  it('UI-R3-001 UI-R3-002 reviews before saving, leaves cached inspection unchanged, and writes nothing before Save', async () => {
    dispatch();
    const { queryClient } = renderModal();
    await fillDraft();
    const original = JSON.stringify(
      queryClient.getQueryData(keys.capitalScenarioSourceQueryKey(FUND))
    );
    for (const name of [
      'Source and budget',
      'Allocations',
      'Follow-ons',
      'Optional companion',
      'Review',
    ])
      expect(screen.getByRole('button', { name: new RegExp(`\\d\\. ${name}$`) })).toBeVisible();
    step('Review');
    step('Review capital plan');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save capital scenario' })).toBeEnabled()
    );
    expect(document.body.textContent).toContain('90.000000');
    expect(document.body.textContent).toContain('4.000000');
    expect(document.body.textContent).toContain('full_fund_committed_capital');
    expect(calls.every(({ method }) => method === 'GET')).toBe(true);
    expect(JSON.stringify(queryClient.getQueryData(keys.capitalScenarioSourceQueryKey(FUND)))).toBe(
      original
    );
  });

  it.each(['', '1.', '0'])(
    'UI-R3-003 retains raw initial-check string %j across steps, source refresh, and modal return',
    async (raw) => {
      dispatch();
      renderModal();
      await fillDraft();
      change('Initial check (USD)', raw);
      step('Follow-ons');
      step('Allocations');
      expect(screen.getByLabelText('Initial check (USD)')).toHaveValue(raw);
      step('Source and budget');
      step('Refresh source');
      step('Allocations');
      expect(screen.getByLabelText('Initial check (USD)')).toHaveValue(raw);
      fireEvent.click(screen.getByRole('button', { name: 'Close and keep draft' }));
      fireEvent.click(screen.getByRole('button', { name: 'Reopen capital draft' }));
      step('Allocations');
      expect(screen.getByLabelText('Initial check (USD)')).toHaveValue(raw);
    }
  );

  it('UI-R3-004 invalid fields receive focus, associated inline errors and a linked validation summary', async () => {
    dispatch();
    renderModal();
    await fillDraft();
    change('Initial check (USD)', '0');
    step('Review');
    step('Review capital plan');
    const field = await screen.findByLabelText('Initial check (USD)', { exact: true });
    await waitFor(() => expect(field).toHaveFocus());
    expect(field).toHaveAttribute('aria-invalid', 'true');
    const description = field.getAttribute('aria-describedby');
    expect(description).toBeTruthy();
    expect(document.getElementById(description!)).toHaveTextContent(/positive|greater|invalid/i);
    const linkedErrors = within(
      screen.getByRole('region', { name: 'Validation errors' })
    ).getAllByRole('button', { name: /initialCheckUsd/ });
    for (const linkedError of linkedErrors) {
      fireEvent.click(linkedError);
      expect(field).toHaveFocus();
    }
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Save capital scenario' })).toBeDisabled();
    expect(calls.every(({ method }) => method === 'GET')).toBe(true);
  });

  it('UI-R3-004 missing check policy focuses its select and links the first error without losing the entered amount', async () => {
    dispatch();
    renderModal();
    await fillDraft();
    step('Follow-ons');
    step('Add follow-on round');
    for (const [label, value] of [
      ['Round label', 'Series A'],
      ['Stage', 's0'],
      ['Graduation (ratio)', '0.5'],
      ['Participation (ratio)', '1'],
      ['Check (USD)', '2.000000'],
      ['Months after previous round', '12'],
    ])
      change(label!, value!);
    step('Review');
    step('Review capital plan');
    const policy = await screen.findByLabelText('Check policy', { exact: true });
    await waitFor(() => expect(policy).toHaveFocus());
    expect(policy).toHaveValue('');
    expect(policy).toHaveAttribute('aria-invalid', 'true');
    const describedBy = policy.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      /policy|fixed|pro_rata|invalid/i
    );
    const summary = screen.getByRole('region', { name: 'Validation errors' });
    const link = within(summary).getAllByRole('button')[0]!;
    expect(link).toHaveTextContent('checkPolicy.type');
    screen.getByLabelText('Check (USD)').focus();
    fireEvent.click(link);
    expect(policy).toHaveFocus();
    expect(screen.getByLabelText('Check (USD)')).toHaveValue('2.000000');
    expect(screen.getByRole('button', { name: 'Save capital scenario' })).toBeDisabled();
    expect(calls.every(({ method }) => method === 'GET')).toBe(true);
  });

  it.each(['entry', 'follow_on'] as const)(
    'UI-R3-004 ISSUE-5625294952-REMAINDER partial %s benchmark override routes and focuses its amount error',
    async (target) => {
      dispatch(({ url }) =>
        url.pathname.endsWith('/source-config') ? sourceForFollowOnValidation() : undefined
      );
      renderModal();
      await fillDraft();
      const section = target === 'entry' ? 'Allocations' : 'Follow-ons';
      if (target === 'follow_on') {
        step('Follow-ons');
        step('Add follow-on round');
        for (const [label, value] of [
          ['Round label', 'Series A'],
          ['Stage', 's1'],
          ['Graduation (ratio)', '0.5'],
          ['Participation (ratio)', '1'],
          ['Check policy', 'fixed'],
          ['Check (USD)', '2.000000'],
          ['Months after previous round', '12'],
        ])
          change(label!, value!);
      }
      change(
        target === 'entry' ? 'Seed benchmark' : 'Series A benchmark',
        target === 'entry' ? 'seed' : 'series_a'
      );
      fireEvent.click(screen.getByRole('checkbox', { name: /Override benchmark valuation/ }));
      change('Override valuation basis', 'pre_money');
      step('Review');
      step('Review capital plan');
      const summary = await screen.findByRole('region', { name: 'Validation errors' });
      const link = within(summary).getAllByRole('button')[0]!;
      expect(link).toHaveTextContent('benchmarkSelections[0].overrides.valuation.valuationUsd');
      expect(
        screen.getByRole('button', { name: new RegExp(`\\d\\. ${section}$`) })
      ).toHaveAttribute('aria-current', 'step');
      const amount = screen.getByLabelText('Override valuation (USD)', { exact: true });
      await waitFor(() => expect(amount).toHaveFocus());
      expect(amount).toHaveValue('');
      expect(amount).toHaveAttribute('aria-invalid', 'true');
      const describedBy = amount.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      expect(document.getElementById(describedBy!)).toHaveTextContent(/required|decimal|invalid/i);
      step('Source and budget');
      fireEvent.click(link);
      await waitFor(() =>
        expect(screen.getByLabelText('Override valuation (USD)', { exact: true })).toHaveFocus()
      );
      expect(
        screen.getByRole('button', { name: new RegExp(`\\d\\. ${section}$`) })
      ).toHaveAttribute('aria-current', 'step');
      expect(screen.getByLabelText('Override valuation basis')).toHaveValue('pre_money');
      expect(screen.getByRole('button', { name: 'Save capital scenario' })).toBeDisabled();
      expect(calls.every(({ method }) => method === 'GET')).toBe(true);
    }
  );

  it.each(['entry', 'follow_on'] as const)(
    'UI-R3-004 missing %s financing focuses its declaration and restores focus from the error summary',
    async (missing) => {
      dispatch(({ url }) =>
        url.pathname.endsWith('/source-config') ? sourceForFollowOnValidation() : undefined
      );
      renderModal();
      await fillDraft();
      if (missing === 'follow_on') {
        fireEvent.click(screen.getByRole('checkbox', { name: 'Declare entry financing' }));
        change('Valuation (USD)', '10');
        change('Valuation basis', 'pre_money');
        change('Primary round capital (USD)', '2');
      }
      step('Follow-ons');
      step('Add follow-on round');
      for (const [label, value] of [
        ['Round label', 'Series A'],
        ['Stage', 's1'],
        ['Graduation (ratio)', '0.5'],
        ['Participation (ratio)', '1'],
        ['Check policy', 'pro_rata'],
        ['Pro-rata exercise (ratio)', '1'],
        ['Months after previous round', '12'],
        ['Incremental pool dilution (ratio)', '0'],
      ])
        change(label!, value!);
      if (missing === 'entry') {
        fireEvent.click(screen.getByRole('checkbox', { name: 'Declare follow-on financing' }));
        change('Valuation (USD)', '10');
        change('Valuation basis', 'pre_money');
        change('Primary round capital (USD)', '2');
      }
      step('Review');
      step('Review capital plan');
      const summary = await screen.findByRole('region', { name: 'Validation errors' });
      const link = within(summary).getAllByRole('button')[0]!;
      expect(link).toHaveTextContent(
        missing === 'entry' ? 'allocations[0].entryFinancing' : 'followOnRounds[0].financing'
      );
      const label = missing === 'entry' ? 'Declare entry financing' : 'Declare follow-on financing';
      const declaration = screen.getByRole('checkbox', { name: label });
      await waitFor(() => expect(declaration).toHaveFocus());
      expect(declaration).not.toBeChecked();
      expect(declaration).toHaveAttribute('aria-invalid', 'true');
      const describedBy = declaration.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      expect(document.getElementById(describedBy!)).toHaveTextContent('OWNERSHIP_INPUT_UNRESOLVED');
      step('Source and budget');
      fireEvent.click(link);
      await waitFor(() => expect(screen.getByRole('checkbox', { name: label })).toHaveFocus());
      expect(screen.getByRole('button', { name: 'Save capital scenario' })).toBeDisabled();
      expect(calls.every(({ method }) => method === 'GET')).toBe(true);
    }
  );

  it.each([
    {
      code: 'TIME_ORIGIN_UNRESOLVED',
      path: 'feeProfiles[0].feeTiers[0].startMonth',
      message: 'Ambiguous time origin',
      support: 'incomplete',
    },
    {
      code: 'INVALID_INPUT',
      path: 'fundName',
      message: 'Hidden full-source field is invalid',
      support: 'invalid',
    },
  ] as CapitalIssueV1[])(
    'SRC-R3-007 UI-R3-007 preserves source-global $code refusals through declaration and review',
    async (issue) => {
      dispatch(({ url }) =>
        url.pathname.endsWith('/source-config') ? sourceResponse([issue]) : undefined
      );
      renderModal();
      await fillDraft();
      step('Review');
      step('Review capital plan');
      expect((await screen.findAllByText(issue.message, { exact: false }))[0]).toBeVisible();
      expect(screen.getByRole('button', { name: 'Save capital scenario' })).toBeDisabled();
      expect(screen.queryByRole('button', { name: /Copy capital memo/ })).not.toBeInTheDocument();
      expect(calls.every(({ method }) => method === 'GET')).toBe(true);
    }
  );

  it('UI-R3-008 selected invalid companion blocks Save and removal preserves construction fields', async () => {
    dispatch();
    renderModal();
    await fillDraft();
    change('Initial check (USD)', '1.000000');
    step('Optional companion');
    step('Add companion');
    step('Review');
    step('Review capital plan');
    expect(screen.getByRole('button', { name: 'Save capital scenario' })).toBeDisabled();
    step('Optional companion');
    step('Remove companion');
    step('Allocations');
    expect(screen.getByLabelText('Initial check (USD)')).toHaveValue('1.000000');
    step('Review');
    step('Review capital plan');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save capital scenario' })).toBeEnabled()
    );
  });

  it('UI-R3-003 stale asynchronous Review success cannot enable Save after a raw edit', async () => {
    let release!: (value: Awaited<ReturnType<typeof review.reviewCapitalPlanDraft>>) => void;
    const realReview = review.reviewCapitalPlanDraft;
    let reviewed: Awaited<ReturnType<typeof review.reviewCapitalPlanDraft>>;
    vi.spyOn(review, 'reviewCapitalPlanDraft').mockImplementation(async (args) => {
      reviewed = await realReview(args);
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    dispatch();
    renderModal();
    await fillDraft();
    step('Review');
    step('Review capital plan');
    await waitFor(() => expect(release).toBeTypeOf('function'));
    step('Allocations');
    change('Initial check (USD)', '2');
    await act(async () => release(reviewed!));
    step('Review');
    expect(screen.getByRole('button', { name: 'Save capital scenario' })).toBeDisabled();
    expect(calls.every(({ method }) => method === 'GET')).toBe(true);
  });

  it('UI-R3-003 stale asynchronous Review failure cannot replace the edited draft or current errors', async () => {
    let release!: (value: Awaited<ReturnType<typeof review.reviewCapitalPlanDraft>>) => void;
    vi.spyOn(review, 'reviewCapitalPlanDraft').mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    dispatch();
    renderModal();
    await fillDraft();
    step('Review');
    step('Review capital plan');
    await waitFor(() => expect(release).toBeTypeOf('function'));
    step('Allocations');
    change('Initial check (USD)', '2');
    await act(async () =>
      release({
        ok: false,
        issues: [
          {
            code: 'INVALID_INPUT',
            path: 'variants[0].override.payload.input.allocations[0].initialCheckUsd',
            message: 'Obsolete Review failure',
            support: 'invalid',
          },
        ],
      })
    );
    expect(screen.getByLabelText('Initial check (USD)')).toHaveValue('2');
    expect(screen.queryByRole('region', { name: 'Validation errors' })).not.toBeInTheDocument();
    expect(screen.queryByText('Obsolete Review failure', { exact: false })).not.toBeInTheDocument();
    step('Review');
    expect(screen.getByRole('button', { name: 'Save capital scenario' })).toBeDisabled();
  });

  it('UI-R3-003 source refresh completing after an edit retains raw fields and requires fresh Review', async () => {
    let release!: (value: unknown) => void;
    let sourceReads = 0;
    dispatch(({ url }) => {
      if (!url.pathname.endsWith('/source-config')) return undefined;
      sourceReads += 1;
      return sourceReads === 1
        ? sourceResponse()
        : new Promise((resolve) => {
            release = resolve;
          });
    });
    renderModal();
    await reviewDraft();
    step('Source and budget');
    step('Refresh source');
    await waitFor(() => expect(release).toBeTypeOf('function'));
    step('Allocations');
    change('Initial check (USD)', '2.');
    await act(async () => release(sourceResponse()));
    expect(screen.getByLabelText('Initial check (USD)')).toHaveValue('2.');
    step('Review');
    expect(screen.getByRole('button', { name: 'Save capital scenario' })).toBeDisabled();
    expect(calls.every(({ method }) => method === 'GET')).toBe(true);
  });

  it('UI-R3-003 same-source refresh releases an in-flight Review and ignores its obsolete completion during fresh Review', async () => {
    type ReviewResult = Awaited<ReturnType<typeof review.reviewCapitalPlanDraft>>;
    const pending: Array<{ result: ReviewResult; resolve: (value: ReviewResult) => void }> = [];
    const realReview = review.reviewCapitalPlanDraft;
    vi.spyOn(review, 'reviewCapitalPlanDraft').mockImplementation(async (args) => {
      const result = await realReview(args);
      return new Promise((resolve) => {
        pending.push({ result, resolve });
      });
    });
    dispatch();
    const { queryClient } = renderModal();
    await fillDraft();
    const sourceBefore = JSON.stringify(
      queryClient.getQueryData(keys.capitalScenarioSourceQueryKey(FUND))
    );
    const draftBefore = JSON.stringify(getCapitalDraft(FUND));
    step('Review');
    step('Review capital plan');
    await waitFor(() => expect(pending).toHaveLength(1));
    step('Source and budget');
    step('Refresh source');
    await screen.findByText('Source refreshed. Your entries are retained; review again.');
    expect(JSON.stringify(queryClient.getQueryData(keys.capitalScenarioSourceQueryKey(FUND)))).toBe(
      sourceBefore
    );
    expect(JSON.stringify(getCapitalDraft(FUND))).toBe(draftBefore);
    expect(screen.getByRole('button', { name: 'Review capital plan' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save capital scenario' })).toBeDisabled();
    step('Review');
    step('Review capital plan');
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => pending[0]!.resolve(pending[0]!.result));
    expect(screen.getByRole('button', { name: 'Reviewing capital plan' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save capital scenario' })).toBeDisabled();
    expect(screen.queryByText(/Review complete/)).not.toBeInTheDocument();
    await act(async () => pending[1]!.resolve(pending[1]!.result));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save capital scenario' })).toBeEnabled()
    );
    expect(calls.filter(({ url }) => url.pathname.endsWith('/source-config'))).toHaveLength(2);
    expect(calls.every(({ method }) => method === 'GET')).toBe(true);
  });

  it('UI-R3-003 an in-flight Review cannot enable Save after the source cache changes', async () => {
    let release!: (value: Awaited<ReturnType<typeof review.reviewCapitalPlanDraft>>) => void;
    const realReview = review.reviewCapitalPlanDraft;
    let result!: Awaited<ReturnType<typeof review.reviewCapitalPlanDraft>>;
    vi.spyOn(review, 'reviewCapitalPlanDraft').mockImplementation(async (args) => {
      result = await realReview(args);
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    dispatch();
    const { queryClient } = renderModal();
    await fillDraft();
    step('Review');
    step('Review capital plan');
    await waitFor(() => expect(release).toBeTypeOf('function'));
    const replacement = sourceResponse();
    replacement.projection.sourceConfigVersion += 1;
    // Synthetic changed identity: this test never reviews or calculates replacement bytes.
    await act(async () =>
      queryClient.setQueryData(keys.capitalScenarioSourceQueryKey(FUND), replacement)
    );
    await screen.findByText(/Current source changed/);
    await act(async () => release(result));
    expect(screen.getByRole('button', { name: 'Save capital scenario' })).toBeDisabled();
    expect(screen.queryByText(/Review complete/)).not.toBeInTheDocument();
    step('Allocations');
    expect(screen.getByLabelText('Initial check (USD)')).toHaveValue('1');
    expect(calls.every(({ method }) => method === 'GET')).toBe(true);
  });

  it('UI-R3-006 source 409 shows exact supplied/current identities and retains raw draft until explicit refresh and Review', async () => {
    const details = {
      suppliedSourceConfigId: bundle.projection.sourceConfigId,
      suppliedSourceConfigVersion: bundle.projection.sourceConfigVersion,
      suppliedSourceBundleHash: bundle.sourceBundleHash,
      currentSourceConfigId: 912,
      currentSourceConfigVersion: 17,
      currentSourceBundleHash: 'b'.repeat(64),
    };
    dispatch(({ method, url }) =>
      method === 'POST' && url.pathname.endsWith('/scenario-sets')
        ? new Response(
            JSON.stringify({
              error: 'scenario_source_config_stale',
              message: 'Published source identity changed',
              details,
            }),
            { status: 409 }
          )
        : undefined
    );
    const view = renderModal();
    await reviewDraft();
    step('Allocations');
    change('Initial check (USD)', '1.000000');
    step('Review');
    step('Review capital plan');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save capital scenario' })).toBeEnabled()
    );
    step('Save capital scenario');
    const conflict = await screen.findByRole('region', { name: 'Source conflict identities' });
    expect(conflict).toHaveTextContent(
      `Supplied source: config ${details.suppliedSourceConfigId}, version ${details.suppliedSourceConfigVersion}, hash ${details.suppliedSourceBundleHash}`
    );
    expect(conflict).toHaveTextContent(
      `Current source: config ${details.currentSourceConfigId}, version ${details.currentSourceConfigVersion}, hash ${details.currentSourceBundleHash}`
    );
    expect(
      screen.getByText(/Source conflict\. Your draft is retained\. Refresh source and review/)
    ).toBeVisible();
    expect(view.onSuccess).not.toHaveBeenCalled();
    expect(getCapitalSaveIntent(FUND)).toBeNull();
    expect(screen.getByRole('button', { name: 'Save capital scenario' })).toBeDisabled();
    step('Allocations');
    expect(screen.getByLabelText('Initial check (USD)')).toHaveValue('1.000000');
    const before = calls.filter(({ url }) => url.pathname.endsWith('/source-config')).length;
    step('Source and budget');
    step('Refresh source');
    await waitFor(() =>
      expect(calls.filter(({ url }) => url.pathname.endsWith('/source-config'))).toHaveLength(
        before + 1
      )
    );
    step('Review');
    expect(screen.getByRole('button', { name: 'Save capital scenario' })).toBeDisabled();
    expect(calls.filter(({ method }) => method === 'POST')).toHaveLength(1);
  });

  it('UI-R3-003 duplicate Save activation sends once and source invalidation releases busy state without accepting the late response', async () => {
    let release!: (value: unknown) => void;
    let attempts = 0;
    const created = {
      contractVersion: 'fund-scenario-capital-create/1.0.0',
      representation: REPRESENTATION,
      scenarioSetId: SET,
    };
    dispatch(({ method, url }) => {
      if (method !== 'POST' || !url.pathname.endsWith('/scenario-sets')) return undefined;
      attempts += 1;
      return attempts === 1
        ? new Promise((resolve) => {
            release = resolve;
          })
        : created;
    });
    const view = renderModal();
    await reviewDraft();
    const save = screen.getByRole('button', { name: 'Save capital scenario' });
    act(() => {
      fireEvent.click(save);
      fireEvent.click(save);
    });
    await waitFor(() => expect(release).toBeTypeOf('function'));
    expect(calls.filter(({ method }) => method === 'POST')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Saving capital scenario' })).toBeDisabled();
    const retained = getCapitalSaveIntent(FUND);
    const replacement = sourceResponse();
    replacement.projection.sourceConfigVersion += 1;
    // Synthetic identity invalidation only; replacement is never calculated.
    await act(async () =>
      view.queryClient.setQueryData(keys.capitalScenarioSourceQueryKey(FUND), replacement)
    );
    await screen.findByText(/Current source changed/);
    await act(async () => release(created));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Retry capital save' })).toBeEnabled()
    );
    expect(view.onSuccess).not.toHaveBeenCalled();
    expect(getCapitalSaveIntent(FUND)).toEqual(retained);
    step('Allocations');
    expect(screen.getByLabelText('Initial check (USD)')).toHaveValue('1');
    step('Retry capital save');
    await waitFor(() => expect(view.onSuccess).toHaveBeenCalledOnce());
    const writes = calls.filter(({ method }) => method === 'POST');
    expect(writes).toHaveLength(2);
    expect(writes[1]!.body).toEqual(writes[0]!.body);
    expect(writes[1]!.headers.get('Idempotency-Key')).toBe(
      writes[0]!.headers.get('Idempotency-Key')
    );
    expect(getCapitalSaveIntent(FUND)).toBeNull();
  });

  it('UI-R3-003 old unmounted Save completion cannot clear or complete a newer retained command', async () => {
    const releases: Array<(value: unknown) => void> = [];
    const created = {
      contractVersion: 'fund-scenario-capital-create/1.0.0',
      representation: REPRESENTATION,
      scenarioSetId: SET,
    };
    dispatch(({ method, url }) =>
      method === 'POST' && url.pathname.endsWith('/scenario-sets')
        ? new Promise((resolve) => {
            releases.push(resolve);
          })
        : undefined
    );
    const queryClient = client();
    const first = renderModal(queryClient);
    await reviewDraft();
    step('Save capital scenario');
    await waitFor(() => expect(releases).toHaveLength(1));
    const oldIntent = getCapitalSaveIntent(FUND);
    first.unmount();
    const second = renderModal(queryClient);
    await screen.findByLabelText('Scenario name');
    step('Allocations');
    change('Initial check (USD)', '2');
    step('Review');
    step('Review capital plan');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save capital scenario' })).toBeEnabled()
    );
    step('Save capital scenario');
    await waitFor(() => expect(releases).toHaveLength(2));
    const newIntent = getCapitalSaveIntent(FUND);
    expect(newIntent?.key).not.toBe(oldIntent?.key);
    await act(async () => releases[0]!(created));
    expect(first.onSuccess).not.toHaveBeenCalled();
    expect(second.onSuccess).not.toHaveBeenCalled();
    expect(getCapitalSaveIntent(FUND)).toEqual(newIntent);
    expect(screen.getByRole('button', { name: 'Saving capital scenario' })).toBeDisabled();
    expect(getCapitalDraft(FUND).variants[0]!.input.allocations[0]!.initialCheckUsd).toBe('2');
    await act(async () => releases[1]!(created));
    await waitFor(() => expect(second.onSuccess).toHaveBeenCalledOnce());
    expect(first.onSuccess).not.toHaveBeenCalled();
    expect(getCapitalSaveIntent(FUND)).toBeNull();
  });

  it('UI-R3-003 failed save retains draft and retries identical reviewed V3 bytes and idempotency key', async () => {
    let attempts = 0;
    dispatch(({ method, url }) => {
      if (method !== 'POST' || !url.pathname.endsWith('/scenario-sets')) return undefined;
      attempts += 1;
      if (attempts === 1) throw new TypeError('Synthetic response lost');
      return {
        contractVersion: 'fund-scenario-capital-create/1.0.0',
        representation: REPRESENTATION,
        scenarioSetId: SET,
      };
    });
    const { onSuccess } = renderModal();
    await reviewDraft();
    step('Save capital scenario');
    await screen.findByText('Synthetic response lost', { exact: false });
    step('Retry capital save');
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    const writes = calls.filter(({ method }) => method === 'POST');
    expect(writes).toHaveLength(2);
    expect(writes[1]!.body).toEqual(writes[0]!.body);
    expect(CreateFundScenarioSetV3Schema.safeParse(writes[0]!.body).success).toBe(true);
    expect(writes[0]!.headers.get('Idempotency-Key')).toBeTruthy();
    expect(writes[1]!.headers.get('Idempotency-Key')).toBe(
      writes[0]!.headers.get('Idempotency-Key')
    );
    expect(JSON.stringify(writes[0]!.body)).not.toMatch(
      /sourceBundle":|benchmarkSnapshots|materialized/
    );
  });

  it('UI-R3-003 ambiguous Save survives route unmount/remount and unchanged Review with its exact body/key', async () => {
    let attempts = 0;
    dispatch(({ method, url }) => {
      if (method !== 'POST' || !url.pathname.endsWith('/scenario-sets')) return undefined;
      attempts += 1;
      if (attempts === 1) throw new TypeError('Committed response was lost');
      return {
        contractVersion: 'fund-scenario-capital-create/1.0.0',
        representation: REPRESENTATION,
        scenarioSetId: SET,
      };
    });
    const queryClient = client();
    const first = renderModal(queryClient);
    await reviewDraft();
    step('Save capital scenario');
    await screen.findByText('Committed response was lost', { exact: false });
    first.unmount();
    const second = renderModal(queryClient);
    await screen.findByLabelText('Scenario name');
    expect(screen.getByLabelText('Scenario name')).toHaveValue('Independent component plan');
    step('Review');
    expect(screen.getByRole('button', { name: 'Review capital plan' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Retry capital save' })).toBeEnabled();
    step('Retry capital save');
    await waitFor(() => expect(second.onSuccess).toHaveBeenCalledOnce());
    const writes = calls.filter(({ method }) => method === 'POST');
    expect(writes).toHaveLength(2);
    expect(writes[1]!.body).toEqual(writes[0]!.body);
    expect(writes[1]!.headers.get('Idempotency-Key')).toBe(
      writes[0]!.headers.get('Idempotency-Key')
    );
  });

  it('UI-R3-003 an edit after ambiguous Save requires fresh Review and a different create intent', async () => {
    dispatch(({ method, url }) =>
      method === 'POST' && url.pathname.endsWith('/scenario-sets')
        ? Promise.reject(new TypeError('Response lost'))
        : undefined
    );
    renderModal();
    await reviewDraft();
    step('Save capital scenario');
    await screen.findByText('Response lost', { exact: false });
    step('Allocations');
    change('Initial check (USD)', '2');
    step('Review');
    expect(screen.getByRole('button', { name: 'Save capital scenario' })).toBeDisabled();
    step('Review capital plan');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save capital scenario' })).toBeEnabled()
    );
    step('Save capital scenario');
    await waitFor(() => expect(calls.filter(({ method }) => method === 'POST')).toHaveLength(2));
    const writes = calls.filter(({ method }) => method === 'POST');
    expect(writes[1]!.body).not.toEqual(writes[0]!.body);
    expect(writes[1]!.headers.get('Idempotency-Key')).not.toBe(
      writes[0]!.headers.get('Idempotency-Key')
    );
  });

  it('UI-R3-005 keyboard tabs reach Review, Save, companion removal and saved Copy actions', async () => {
    dispatch(({ method, url }) =>
      method === 'POST' && url.pathname.endsWith('/scenario-sets')
        ? {
            contractVersion: 'fund-scenario-capital-create/1.0.0',
            representation: REPRESENTATION,
            scenarioSetId: SET,
          }
        : undefined
    );
    const view = renderModal();
    await fillDraft();
    const user = userEvent.setup();
    writeClipboard = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    async function keyboardActivate(name: RegExp) {
      const target = screen.getByRole('button', { name });
      for (let count = 0; document.activeElement !== target && count < 100; count += 1)
        await user.tab();
      expect(target).toHaveFocus();
      await user.keyboard('{Enter}');
    }
    await keyboardActivate(/\d\. Optional companion$/);
    await keyboardActivate(/^Add companion$/);
    await keyboardActivate(/^Remove companion$/);
    await keyboardActivate(/\d\. Review$/);
    await keyboardActivate(/^Review capital plan$/);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save capital scenario' })).toBeEnabled()
    );
    await keyboardActivate(/^Save capital scenario$/);
    await waitFor(() => expect(view.onSuccess).toHaveBeenCalledOnce());
    expect(calls.filter(({ method }) => method === 'POST')).toHaveLength(1);
    view.unmount();
    render(<CapitalPlanComparisonTable comparison={twoVariantComparison()} />);
    await keyboardActivate(new RegExp(`^Copy capital memo: ${saved.name}$`));
    await waitFor(() => expect(writeClipboard).toHaveBeenCalledOnce());
  });

  it('UI-R3-001 retains distinct variants, enforces one-to-five editing bounds and saves both reviewed inputs', async () => {
    dispatch(({ method, url }) =>
      method === 'POST' && url.pathname.endsWith('/scenario-sets')
        ? {
            contractVersion: 'fund-scenario-capital-create/1.0.0',
            representation: REPRESENTATION,
            scenarioSetId: SET,
          }
        : undefined
    );
    const view = renderModal();
    await fillDraft();
    expect(screen.getByRole('button', { name: 'Remove variant' })).toBeDisabled();
    change('Initial check (USD)', '1.000000');
    step('Add variant');
    change('Variant name', 'Alternative');
    change('Initial check (USD)', '2.');
    change('Selected variant', '0');
    expect(screen.getByLabelText('Initial check (USD)')).toHaveValue('1.000000');
    change('Selected variant', '1');
    expect(screen.getByLabelText('Initial check (USD)')).toHaveValue('2.');
    change('Initial check (USD)', '2.000000');
    for (let index = 0; index < 3; index += 1) step('Add variant');
    expect(within(screen.getByLabelText('Selected variant')).getAllByRole('option')).toHaveLength(
      5
    );
    expect(screen.getByRole('button', { name: 'Add variant' })).toBeDisabled();
    for (const index of ['4', '3', '2']) {
      change('Selected variant', index);
      step('Remove variant');
    }
    expect(within(screen.getByLabelText('Selected variant')).getAllByRole('option')).toHaveLength(
      2
    );
    expect(screen.getByRole('button', { name: 'Remove variant' })).toBeDisabled();
    step('Review');
    step('Review capital plan');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save capital scenario' })).toBeEnabled()
    );
    expect(calls.every(({ method }) => method === 'GET')).toBe(true);
    step('Save capital scenario');
    await waitFor(() => expect(view.onSuccess).toHaveBeenCalledOnce());
    const request = CreateFundScenarioSetV3Schema.parse(
      calls.find(({ method }) => method === 'POST')!.body
    );
    expect(request.variants.map(({ name }) => name)).toEqual(['Baseline', 'Alternative']);
    expect(
      request.variants.map(({ override }) =>
        'input' in override.payload ? override.payload.input.allocations[0]!.initialCheckUsd : null
      )
    ).toEqual(['1.000000', '2.000000']);
    expect(new Set(request.variants.map(({ variantId }) => variantId)).size).toBe(2);
  });

  it('UI-R3-003 Duplicate draft copies a saved capital scenario into independent raw inputs without writing', async () => {
    dispatch();
    renderWorkspace();
    const duplicate = await screen.findByRole('button', {
      name: 'Duplicate to draft',
      exact: true,
    });
    await waitFor(() => expect(duplicate).toBeEnabled());
    fireEvent.click(duplicate);
    await screen.findByLabelText('Scenario name');
    expect(screen.getByLabelText('Scenario name')).toHaveValue(capitalDetail().name);
    step('Allocations');
    expect(screen.getByLabelText('Initial check (USD)')).toHaveValue(
      saved.result.input.allocations[0]!.initialCheckUsd
    );
    const copy = getCapitalDraft(FUND);
    expect(copy.variants[0]!.variantId).not.toBe(saved.variantId);
    expect(copy.declarations).toEqual(bundle.unitDeclarations);
    change('Initial check (USD)', '2.');
    expect(saved.result.input.allocations[0]!.initialCheckUsd).toBe('1.000000');
    expect(screen.getByRole('button', { name: 'Save capital scenario' })).toBeDisabled();
    expect(calls.every(({ method }) => method === 'GET')).toBe(true);
  });

  it('ISSUE-5625294952-REMAINDER exposes explicit benchmark intent, overrides and source qualifications', async () => {
    dispatch(({ method, url }) =>
      method === 'POST' && url.pathname.endsWith('/scenario-sets')
        ? {
            contractVersion: 'fund-scenario-capital-create/1.0.0',
            representation: REPRESENTATION,
            scenarioSetId: SET,
          }
        : undefined
    );
    const view = renderModal();
    await fillDraft();
    change('Seed benchmark', 'seed');
    expect(
      screen.getByText(/cash raised is not independently verified primary-only priced financing/)
    ).toBeVisible();
    const benchmarkDisclosure = screen.getByText('Benchmark source and applicability', {
      selector: 'summary',
    });
    fireEvent.click(benchmarkDisclosure);
    expect(benchmarkDisclosure.parentElement!.textContent).toMatch(/population|source|synthetic/i);
    fireEvent.click(screen.getByRole('checkbox', { name: /Override benchmark valuation/ }));
    change('Override valuation (USD)', '10.000000');
    change('Override valuation basis', 'pre_money');
    step('Review');
    step('Review capital plan');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save capital scenario' })).toBeEnabled()
    );
    expect(calls.every(({ method }) => method === 'GET')).toBe(true);
    step('Save capital scenario');
    await waitFor(() => expect(view.onSuccess).toHaveBeenCalledOnce());
    const request = CreateFundScenarioSetV3Schema.parse(
      calls.find(({ method }) => method === 'POST')!.body
    );
    const payload = request.variants[0]!.override.payload;
    expect(payload).toHaveProperty('benchmarkSelections');
    if (!('benchmarkSelections' in payload))
      throw new Error('Explicit benchmark selector was lost');
    const selection = payload.benchmarkSelections![0]!;
    expect(selection.target).toEqual({ kind: 'entry', allocationId: 'a1' });
    expect(selection.selector.stage).toBe('seed');
    expect(selection.overrides?.valuation).toEqual({
      valuationUsd: '10.000000',
      valuationBasis: 'pre_money',
    });
    expect(JSON.stringify(request)).not.toContain('benchmarkSnapshots');
  });

  it.each([
    ['Scenario name', 'Source and budget'],
    ['Variant name', 'Allocations'],
  ])(
    'ISSUE-5625294952-REMAINDER accepts 120-character %s and rejects 121 without losing text',
    async (label, section) => {
      dispatch();
      renderModal();
      await fillDraft();
      step(section!);
      change(label!, 'x'.repeat(121));
      step('Review');
      step('Review capital plan');
      expect(screen.getByRole('button', { name: 'Save capital scenario' })).toBeDisabled();
      step(section!);
      expect(screen.getByLabelText(label!)).toHaveValue('x'.repeat(121));
      change(label!, 'x'.repeat(120));
      step('Review');
      step('Review capital plan');
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Save capital scenario' })).toBeEnabled()
      );
    }
  );
});
