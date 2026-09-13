import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreateCapitalPlanScenarioModal } from '@/components/scenarios/CreateCapitalPlanScenarioModal';
import { CapitalPlanResultView } from '@/components/fund-results/CapitalPlanComparisonTable';
import { capitalPlanMemoSections } from '@/components/fund-results/capital-plan-memo-presentation';
import {
  capitalDraftRequest,
  newCapitalDraft,
  type RawCapitalInputV2,
} from '@/components/scenarios/capital-plan-draft';
import { reviewCapitalPlanDraft } from '@/lib/capital-plan-review';
import * as api from '@/lib/fund-scenario-workspace-api';
import { calculateCapitalPlanningV2 } from '@shared/lib/capital-planning/capital-planning-v2';
import { CapitalPlanningMemoV2Schema } from '@shared/contracts/capital-planning-v2.contract';
import { FundScenarioCapitalSourceResponseV1Schema } from '@shared/contracts/fund-scenario-sets-v1.contract';
import { v2Input, v2Bundle, v2Round } from '../../fixtures/capital-planning/v2-fixtures';

function fixture() {
  const input = v2Input();
  input.allocations[0]!.followOnRounds = [v2Round()];
  const bundle = v2Bundle(input);
  const remainingDeclarations = Object.entries(bundle.unitDeclarations)
    .filter(([path]) => !/^(capitalPlanAllocations|pipelineProfiles)\[/.test(path))
    .map(([path, unit]) => ({ path, allowedUnits: [unit] }));
  const source = FundScenarioCapitalSourceResponseV1Schema.parse({
    contractVersion: 'fund-scenario-capital-source/1.0.0',
    representation: 'capital-plan-v1',
    projection: bundle.projection,
    sourceBundleHash: bundle.sourceBundleHash,
    publishedAt: bundle.publishedAt,
    interpretationVersion: bundle.interpretationVersion,
    remainingDeclarations,
    materialized: null,
    calculationReadiness: {
      context: 'current_preview',
      state: 'INPUT_REQUIRED',
      issues: remainingDeclarations.map(({ path }) => ({
        code: 'UNIT_PROVENANCE_UNRESOLVED',
        path,
        message: 'An exact-path source-unit declaration is required',
        support: 'incomplete',
      })),
    },
    interpretationCompatibility: {
      state: 'CURRENT',
      savedVersion: bundle.interpretationVersion,
      currentVersion: bundle.interpretationVersion,
    },
  });
  return { input, bundle, source };
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('corrected capital UI', () => {
  it('offers explicit financing, timing, eligibility and participation controls with no defaults', async () => {
    const { source } = fixture();
    vi.spyOn(api, 'fetchCapitalScenarioSource').mockResolvedValue(source);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <CreateCapitalPlanScenarioModal
          fundId="55123"
          open
          onOpenChange={() => {}}
          onSuccess={() => {}}
        />
      </QueryClientProvider>
    );
    fireEvent.change(screen.getByLabelText('Calculation method'), {
      target: { value: 'corrected' },
    });
    expect(screen.getByLabelText('Solve mode')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: '2. Allocations', exact: true }));
    expect(screen.getByLabelText('Initial investment dollar weight (ratio)')).toHaveValue('');
    expect(screen.getByLabelText('Schedule anchor')).toHaveValue('');
    expect(screen.getByLabelText('Primary capital denominator')).toHaveValue('');
    expect(
      screen.getByRole('option', {
        name: 'Fixed total primary capital whether fund participates or skips; other investors supply remainder',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', {
        name: 'Fixed external primary capital; fund check adds to total',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Primary capital only; excludes all secondary sales')
    ).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: '3. Follow-ons', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Add follow-on round', exact: true }));
    expect(screen.getByLabelText('Participation policy')).toHaveValue('');
    expect(screen.getByLabelText('Follow-on eligibility')).toHaveValue('');
    expect(screen.getByLabelText('Timing basis')).toHaveValue('');
    expect(screen.getByLabelText('Pool basis')).toHaveValue('');
    await waitFor(() => expect(api.fetchCapitalScenarioSource).toHaveBeenCalled());
  });
  it('normalizes 43/43/14 as initial dollars and refuses missing corrected declarations', () => {
    const { input, source } = fixture();
    input.allocations = ['0.430000000000', '0.430000000000', '0.140000000000'].map(
      (share, index) => ({
        ...structuredClone(input.allocations[0]!),
        allocationId: `a${index}`,
        initialPoolShareRatio: share,
      })
    );
    const draft = newCapitalDraft();
    draft.name = 'Corrected dollar weights';
    draft.source = source;
    draft.variants[0]!.input = JSON.parse(JSON.stringify(input), (_key, value: unknown) =>
      typeof value === 'number' ? String(value) : value
    ) as RawCapitalInputV2;
    const parsed = capitalDraftRequest(draft);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.request.contractVersion).toBe('fund-scenario-set-create/4.0.0');
    const payload = parsed.request.variants[0]!.override.payload;
    const normalized = 'input' in payload ? payload.input : payload;
    expect(
      normalized.allocations.map((allocation) =>
        'initialPoolShareRatio' in allocation ? allocation.initialPoolShareRatio : null
      )
    ).toEqual(['0.430000000000', '0.430000000000', '0.140000000000']);
    (
      draft.variants[0]!.input as RawCapitalInputV2
    ).allocations[0]!.entryFinancing.primaryCapital.primary_only_excludes_secondary = false;
    expect(capitalDraftRequest(draft).ok).toBe(false);
  });
  it('reviews corrected inputs through the existing source-pinned browser calculation seam', async () => {
    const { input, source, bundle } = fixture();
    const draft = newCapitalDraft();
    draft.name = 'Corrected review';
    draft.source = source;
    draft.declarations = bundle.unitDeclarations;
    draft.variants[0]!.input = JSON.parse(JSON.stringify(input), (_key, value: unknown) =>
      typeof value === 'number' ? String(value) : value
    ) as RawCapitalInputV2;
    const parsed = capitalDraftRequest(draft);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await reviewCapitalPlanDraft({ fundId: 101, source, request: parsed.request });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.results[0]!.contractVersion).toBe('capital-planning/2.0.0');
    expect(result.results[0]!.sourceBundle.sourceBundleHash).toBe(bundle.sourceBundleHash);
  });
  it('renders computed corrected results and signed residuals without applying V1 labels', () => {
    const { input, bundle } = fixture();
    input.allocations[0]!.plannedCompanyCount = 11;
    const result = calculateCapitalPlanningV2({ input, sourceBundle: bundle });
    const memo = CapitalPlanningMemoV2Schema.parse({
      contractVersion: 'capital-planning-memo/2.0.0',
      fundId: 101,
      scenarioSetId: '00000000-0000-4000-8000-000000000001',
      variantId: '00000000-0000-4000-8000-000000000002',
      scenarioSetName: 'Corrected plan',
      variantName: 'Baseline',
      result,
      countBasis: 'expected',
      detailScope: 'complete',
      limitations: ['Expected counts are fractional.'],
      readState: {
        sourceFreshness: 'CURRENT',
        calculationReadiness: { state: 'READY', context: 'saved_input', issues: [] },
        interpretationCompatibility: {
          state: 'CURRENT',
          savedVersion: bundle.interpretationVersion,
          currentVersion: bundle.interpretationVersion,
        },
      },
    });
    const text = capitalPlanMemoSections(memo)
      .flatMap((section) => section.rows.map((row) => `${row.label}: ${row.value}`))
      .join('\n');
    expect(text).toContain('Fixed fund');
    expect(text).toContain(result.roundingPolicy);
    expect(text).toContain('Expected count rounding residual');
    expect(text).toContain('Initial allocation rounding residual');
    expect(text).toContain('Capital rounding residual');
    expect(text).toContain('Path probability rounding residual');
    expect(text).toContain('Path demand rounding residual');
    expect(text).toContain('Initial schedule rounding residual');
    expect(text).toContain('Follow on schedule rounding residual');
    expect(text).toContain('Stopped non-graduated histories');
    expect(text).toContain('User-supplied integer counts; expected solve unchanged');
    expect(text).toContain(result.construction.allocations[0]!.entered!.signedBudgetResidualUsd);
    expect(text).not.toContain('Graduation and participation independent of ownership history');
    render(<CapitalPlanResultView memo={memo} />);
    expect(screen.getByText('Initial investment pool and reconciliation')).toBeInTheDocument();
    expect(screen.getByText('Ownership and participation histories')).toBeInTheDocument();
  });
});
