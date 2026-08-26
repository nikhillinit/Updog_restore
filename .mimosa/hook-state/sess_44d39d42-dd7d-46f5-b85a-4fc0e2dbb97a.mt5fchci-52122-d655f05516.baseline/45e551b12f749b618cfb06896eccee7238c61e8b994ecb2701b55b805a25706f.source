import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { QuarterlyReviewPanel } from '@/components/internal-analysis/QuarterlyReviewPanel';

const hookState = vi.hoisted(() => ({
  review: null as Record<string, unknown> | null,
  error: null as Record<string, unknown> | null,
  finalizeError: null as Record<string, unknown> | null,
}));
const commandMocks = vi.hoisted(() => ({
  updateItem: vi.fn(),
  waiveCompany: vi.fn(),
  refresh: vi.fn(),
  finalize: vi.fn(),
}));

vi.mock('@/hooks/useQuarterlyReview', () => ({
  useQuarterlyReview: () => ({
    data: hookState.review,
    error: hookState.error,
    isLoading: false,
    refetch: vi.fn(),
  }),
  useQuarterlyReviewCommands: () => ({
    updateItem: { mutate: commandMocks.updateItem, isPending: false },
    waiveCompany: { mutate: commandMocks.waiveCompany, isPending: false },
    refresh: { mutate: commandMocks.refresh, isPending: false },
    finalize: {
      mutate: commandMocks.finalize,
      isPending: false,
      error: hookState.finalizeError,
    },
  }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const fiveCategories = [
  'Cases & probabilities',
  'KPIs',
  'Valuation & FMV',
  'Reserve strategy',
  'Risks & mitigations',
];

function healthyReview() {
  return {
    contractVersion: 'quarterly-review-v1',
    draftId: 11,
    fundId: 7,
    rosterId: 31,
    draftVersion: 3,
    financialFactsSnapshotId: 91,
    draftEtag: '"analysis-draft:11:3"',
    requiresRefresh: false,
    completion: {
      companyCount: 1,
      completedCompanyCount: 0,
      pendingCompanyCount: 1,
      pendingItemCount: 5,
    },
    canFinalize: false,
    capabilities: {
      operatingDecision: { availability: 'unavailable', reason: 'dependency_not_available' },
    },
    companies: [
      {
        id: 301,
        portfolioCompanyId: 101,
        companyName: 'Acme',
        etag: '"quarterly-review-company:101:1"',
        waivedAt: null,
        waivedBy: null,
        waiverReason: null,
        version: 1,
        items: [
          'cases_probabilities',
          'kpis',
          'valuation_fmv',
          'reserve_plan',
          'qualitative_risks',
        ].map((category, index) => ({
          id: 801 + index,
          category,
          state: 'pending',
          note: null,
          reviewedBy: null,
          reviewedAt: null,
          changeReference: null,
          followUp: null,
          version: 1,
          etag: `"quarterly-review-item:${801 + index}:1"`,
        })),
      },
    ],
  };
}

describe('QuarterlyReviewPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookState.review = healthyReview();
    hookState.error = null;
    hookState.finalizeError = null;
  });

  it('submits changed evidence with category-appropriate internal link and separate follow-up', () => {
    render(<QuarterlyReviewPanel fundId={7} draftId={11} userRole="analyst" />, { wrapper });

    fireEvent.click(screen.getAllByRole('button', { name: 'Changed' })[0]!);
    fireEvent.change(screen.getByLabelText('Cases & probabilities review note'), {
      target: { value: 'Downside case probability increased.' },
    });
    fireEvent.change(screen.getByLabelText('Cases & probabilities optional follow-up task'), {
      target: { value: '88' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save review item' })[0]!);

    expect(commandMocks.updateItem).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 301,
        category: 'cases_probabilities',
        etag: '"quarterly-review-item:801:1"',
        input: {
          state: 'changed',
          note: 'Downside case probability increased.',
          changeReference: {
            kind: 'internal_route',
            path: '/fund-model-results/7/scenarios',
            label: 'Open scenario workspace',
          },
          followUpTaskId: 88,
        },
      })
    );
  });

  it('blocks follow-up task IDs outside the PostgreSQL integer range', () => {
    render(<QuarterlyReviewPanel fundId={7} draftId={11} userRole="analyst" />, { wrapper });

    fireEvent.click(screen.getAllByRole('button', { name: 'Changed' })[0]!);
    fireEvent.change(screen.getByLabelText('Cases & probabilities review note'), {
      target: { value: 'Downside case probability increased.' },
    });
    const followUpInput = screen.getByLabelText('Cases & probabilities optional follow-up task');
    fireEvent.change(followUpInput, { target: { value: '2147483648' } });

    expect(followUpInput).toHaveAttribute('max', '2147483647');
    expect(screen.getAllByRole('button', { name: 'Save review item' })[0]).toBeDisabled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Save review item' })[0]!);
    expect(commandMocks.updateItem).not.toHaveBeenCalled();
  });

  it('shows every frozen company, all five categories, explicit states, and required evidence fields', () => {
    render(<QuarterlyReviewPanel fundId={7} draftId={11} userRole="analyst" />, { wrapper });

    expect(screen.getByRole('heading', { name: 'Acme' })).toBeInTheDocument();
    for (const label of fiveCategories) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByRole('button', { name: 'Changed' })).toHaveLength(5);
    expect(screen.getAllByRole('button', { name: 'Reviewed — no change' })).toHaveLength(5);
    expect(screen.getAllByLabelText(/review note/i)).toHaveLength(5);
    expect(screen.getAllByLabelText(/internal change link/i)).toHaveLength(5);
    expect(screen.getAllByLabelText(/optional follow-up task/i)).toHaveLength(5);
    expect(screen.getByText('0 of 5 items complete')).toBeInTheDocument();
    expect(screen.getByText(/Operating decision links are unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finalize reference' })).toBeDisabled();
  });

  it.each(['partner', 'admin'])('shows waiver control to %s', (role) => {
    render(<QuarterlyReviewPanel fundId={7} draftId={11} userRole={role} />, { wrapper });
    expect(screen.getByRole('button', { name: 'Waive company review' })).toBeInTheDocument();
  });

  it('submits waiver with the company row ETag', () => {
    render(<QuarterlyReviewPanel fundId={7} draftId={11} userRole="partner" />, { wrapper });

    fireEvent.change(screen.getByLabelText('Waiver reason'), {
      target: { value: 'Approved exception.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Waive company review' }));

    expect(commandMocks.waiveCompany).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 301,
        etag: '"quarterly-review-company:101:1"',
        input: { reason: 'Approved exception.' },
      })
    );
  });

  it.each(['analyst', 'viewer', 'operator', 'service'])('hides waiver control from %s', (role) => {
    render(<QuarterlyReviewPanel fundId={7} draftId={11} userRole={role} />, { wrapper });
    expect(screen.queryByRole('button', { name: 'Waive company review' })).not.toBeInTheDocument();
  });

  it('renders terminal waiver actor and reason instead of editable review controls', () => {
    hookState.review = {
      ...healthyReview(),
      completion: {
        companyCount: 1,
        completedCompanyCount: 1,
        pendingCompanyCount: 0,
        pendingItemCount: 0,
      },
      companies: [
        {
          ...healthyReview().companies[0],
          waivedAt: '2026-08-03T12:00:00.000Z',
          waivedBy: 42,
          waiverReason: 'Company exited after roster freeze.',
        },
      ],
    };
    render(<QuarterlyReviewPanel fundId={7} draftId={11} userRole="partner" />, { wrapper });

    expect(screen.getByText(/Waived by actor 42/)).toBeInTheDocument();
    expect(screen.getByText('Company exited after roster freeze.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Changed' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Waive company review' })).not.toBeInTheDocument();
  });

  it.each(['partner', 'admin', 'analyst'])(
    'blocks unsafe actions and offers refresh-only recovery to %s',
    (role) => {
      hookState.review = null;
      hookState.error = {
        status: 409,
        code: 'QUARTERLY_REVIEW_ROSTER_CORRUPT',
        etag: '"analysis-draft:11:3"',
        details: { expectedCompanyCount: 4, actualCompanyCount: 3 },
      };
      render(<QuarterlyReviewPanel fundId={7} draftId={11} userRole={role} />, { wrapper });

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Roster integrity check failed: expected 4 companies, found 3.'
      );
      expect(screen.getByRole('button', { name: 'Refresh quarterly review' })).toBeEnabled();
      expect(screen.queryByRole('button', { name: 'Changed' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Waive company review' })
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Finalize reference' })).not.toBeInTheDocument();
    }
  );

  it.each(['viewer', 'operator', 'service'])('withholds corrupt-roster refresh from %s', (role) => {
    hookState.review = null;
    hookState.error = {
      status: 409,
      code: 'QUARTERLY_REVIEW_ROSTER_CORRUPT',
      etag: '"analysis-draft:11:3"',
      details: { expectedCompanyCount: 4, actualCompanyCount: 3 },
    };
    render(<QuarterlyReviewPanel fundId={7} draftId={11} userRole={role} />, { wrapper });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Refresh quarterly review' })
    ).not.toBeInTheDocument();
  });

  it('treats a missing legacy roster as refresh-only recovery', () => {
    hookState.review = {
      ...healthyReview(),
      requiresRefresh: true,
      rosterId: null,
      companies: [],
    };
    render(<QuarterlyReviewPanel fundId={7} draftId={11} userRole="analyst" />, { wrapper });

    expect(screen.getByRole('alert')).toHaveTextContent('Quarterly review roster is missing');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh quarterly review' }));
    expect(commandMocks.refresh).toHaveBeenCalledWith(
      expect.objectContaining({ etag: '"analysis-draft:11:3"' })
    );
  });

  it('focuses and lists typed pending work when finalization races with review changes', () => {
    hookState.review = { ...healthyReview(), canFinalize: true };
    hookState.finalizeError = {
      status: 409,
      code: 'QUARTERLY_REVIEW_INCOMPLETE',
      details: {
        draftId: 11,
        draftVersion: 3,
        financialFactsSnapshotId: 91,
        pendingCompanyCount: 1,
        pendingItemCount: 2,
        companies: [{ companyId: 301, pendingCategories: ['kpis', 'valuation_fmv'] }],
      },
    };

    render(<QuarterlyReviewPanel fundId={7} draftId={11} userRole="partner" />, { wrapper });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Acme: KPIs, Valuation & FMV');
    expect(alert).toHaveFocus();
  });

  it('requires explicit acknowledgement after mixed-basis rejection before retrying finalization', () => {
    hookState.review = { ...healthyReview(), canFinalize: true };
    const view = render(<QuarterlyReviewPanel fundId={7} draftId={11} userRole="partner" />, {
      wrapper,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Finalize reference' }));
    expect(commandMocks.finalize).toHaveBeenLastCalledWith(
      expect.objectContaining({ acknowledgeMixedBasis: false })
    );

    hookState.finalizeError = {
      status: 409,
      code: 'MIXED_FACTS_BASIS',
      message: 'Pinned components do not all resolve to the draft facts basis.',
    };
    view.rerender(<QuarterlyReviewPanel fundId={7} draftId={11} userRole="partner" />);

    expect(screen.getByRole('alert')).toHaveTextContent(/mixed facts basis/i);
    const acknowledgement = screen.getByRole('checkbox', {
      name: /acknowledge.*mixed facts basis/i,
    });
    expect(screen.getByRole('button', { name: 'Finalize mixed-basis reference' })).toBeDisabled();

    fireEvent.click(acknowledgement);
    fireEvent.click(screen.getByRole('button', { name: 'Finalize mixed-basis reference' }));

    expect(commandMocks.finalize).toHaveBeenLastCalledWith(
      expect.objectContaining({ acknowledgeMixedBasis: true })
    );
  });

  it('surfaces a safe generic finalization error without rendering server details', () => {
    hookState.review = { ...healthyReview(), canFinalize: true };
    hookState.finalizeError = {
      status: 409,
      code: 'DRAFT_ALREADY_SAVED',
      message: 'This draft has already been saved.',
      details: { internalSql: 'must not render' },
    };

    render(<QuarterlyReviewPanel fundId={7} draftId={11} userRole="partner" />, { wrapper });

    expect(screen.getByRole('alert')).toHaveTextContent('This draft has already been saved.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('must not render');
  });
});
