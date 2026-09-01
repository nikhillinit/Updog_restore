import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Page from '@/pages/fund-model-results-operations';
import { ApiError } from '@/lib/queryClient';
import { TestQueryClientProvider } from '../../utils/test-query-client';
import { createWouterWrapper } from '../../utils/withWouter';

const mocks = vi.hoisted(() => ({
  fundId: 7 as number | undefined,
  currentFund: { id: 7, name: 'Fund Seven' } as { id: number; name: string } | null,
  decisions: vi.fn(),
  tasks: vi.fn(),
  decisionEvidence: vi.fn(),
  taskEvidence: vi.fn(),
  createDecision: vi.fn(),
  transitionDecision: vi.fn(),
  recordDecisionOutcome: vi.fn(),
  supersedeDecision: vi.fn(),
  createDecisionEvidence: vi.fn(),
  createTask: vi.fn(),
  createDecisionError: null as Error | null,
  transitionDecisionError: null as Error | null,
  supersedeDecisionError: null as Error | null,
}));

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({
    fundId: mocks.fundId,
    currentFund: mocks.currentFund,
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useDecisions', () => ({
  useDecisions: mocks.decisions,
  useCreateDecision: () => ({
    mutate: mocks.createDecision,
    isPending: false,
    error: mocks.createDecisionError,
  }),
  useDecisionEvidenceLinks: mocks.decisionEvidence,
  useRecordDecisionOutcome: () => ({
    mutate: mocks.recordDecisionOutcome,
    isPending: false,
    error: null,
  }),
  useSupersedeDecision: () => ({
    mutate: mocks.supersedeDecision,
    isPending: false,
    error: mocks.supersedeDecisionError,
  }),
  useTransitionDecision: () => ({
    mutate: mocks.transitionDecision,
    isPending: false,
    error: mocks.transitionDecisionError,
  }),
  useCreateDecisionEvidenceLink: () => ({
    mutate: mocks.createDecisionEvidence,
    isPending: false,
    error: null,
  }),
}));

vi.mock('@/hooks/useTasks', () => ({
  useTasks: mocks.tasks,
  useCreateTask: () => ({ mutate: mocks.createTask, isPending: false, error: null }),
  useTaskEvidenceLinks: mocks.taskEvidence,
}));

vi.mock('@/hooks/useDualForecast', () => ({
  useDualForecast: () => ({ data: undefined, isSuccess: false, isError: true, error: null }),
}));

vi.mock('@/hooks/useCurrentPlanVersions', () => ({
  useCurrentPlanVersions: () => ({
    versions: [],
    headVersion: null,
    isLoading: false,
    error: null,
    mint: {},
  }),
}));

function decisionRow(
  decisionId: number,
  status: 'proposed' | 'accepted' | 'rejected' | 'deferred',
  overrides: Record<string, unknown> = {}
) {
  return {
    contractVersion: 'decision/1.0.0',
    decisionId,
    fundId: 7,
    title: `Decision ${decisionId}`,
    recommendation: `Recommendation ${decisionId}`,
    status,
    supersedesDecisionId: null,
    outcome: null,
    outcomeRecordedAt: null,
    outcomeRecordedBy: null,
    followUpOwnerId: status === 'deferred' ? 9 : null,
    followUpDate: status === 'deferred' ? '2026-10-01' : null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    etag: `W/"${decisionId}"`,
    ...overrides,
  };
}

const task = {
  id: 51,
  fundId: 7,
  title: 'Call portfolio CEO',
  status: 'open',
  ownerId: 9,
  dueDate: '2026-09-15',
  description: 'Confirm runway update.',
  createdAt: '2026-08-31T12:00:00.000Z',
  updatedAt: '2026-08-31T12:00:00.000Z',
  etag: 'W/"task-51"',
} as const;

function renderPage(path = '/fund-model-results/7/operations') {
  const { Wrapper } = createWouterWrapper(path);
  return render(
    <TestQueryClientProvider>
      <Wrapper>
        <Page />
      </Wrapper>
    </TestQueryClientProvider>
  );
}

function setDecisions(rows: ReturnType<typeof decisionRow>[]) {
  mocks.decisions.mockReturnValue({ data: rows, isLoading: false, error: null });
}

describe('operations page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fundId = 7;
    mocks.currentFund = { id: 7, name: 'Fund Seven' };
    mocks.createDecisionError = null;
    mocks.transitionDecisionError = null;
    mocks.supersedeDecisionError = null;
    setDecisions([]);
    mocks.tasks.mockReturnValue({ data: [], isLoading: false, error: null });
    mocks.decisionEvidence.mockReturnValue({ data: [], isLoading: false, error: null });
    mocks.taskEvidence.mockReturnValue({ data: [], isLoading: false, error: null });
  });

  it('suppresses reads when the route fund ID is invalid', () => {
    renderPage('/fund-model-results/not-a-fund/operations');

    expect(screen.getByText('Invalid fund ID')).toBeInTheDocument();
    expect(mocks.decisions).not.toHaveBeenCalled();
    expect(mocks.tasks).not.toHaveBeenCalled();
  });

  it('suppresses reads when the route fund is outside the resolved scope', () => {
    mocks.fundId = 8;
    mocks.currentFund = { id: 8, name: 'Fund Eight' };

    renderPage();

    expect(screen.getByText('Fund not available')).toBeInTheDocument();
    expect(screen.getByText(/operational records are withheld/i)).toBeInTheDocument();
    expect(mocks.decisions).not.toHaveBeenCalled();
    expect(mocks.tasks).not.toHaveBeenCalled();
  });

  it('renders a proposed decision as proposed', () => {
    setDecisions([decisionRow(1, 'proposed')]);

    renderPage();

    expect(screen.getByTestId('decision-status-1')).toHaveTextContent('proposed');
  });

  it('renders an accepted decision as accepted', () => {
    setDecisions([decisionRow(2, 'accepted')]);

    renderPage();

    expect(screen.getByTestId('decision-status-2')).toHaveTextContent('accepted');
  });

  it('renders a rejected decision as rejected', () => {
    setDecisions([decisionRow(3, 'rejected')]);

    renderPage();

    expect(screen.getByTestId('decision-status-3')).toHaveTextContent('rejected');
  });

  it('renders a deferred decision as deferred', () => {
    setDecisions([decisionRow(4, 'deferred')]);

    renderPage();

    expect(screen.getByTestId('decision-status-4')).toHaveTextContent('deferred');
  });

  it('derives superseded from another decision reverse reference', () => {
    setDecisions([
      decisionRow(1, 'accepted'),
      decisionRow(5, 'accepted', { supersedesDecisionId: 1 }),
    ]);

    renderPage();

    expect(screen.getByTestId('decision-status-1')).toHaveTextContent('superseded');
    expect(screen.getByTestId('decision-status-5')).toHaveTextContent('accepted');
  });

  it('shows outcome-missing separately from the recommendation', () => {
    setDecisions([decisionRow(2, 'accepted')]);

    renderPage();

    expect(screen.getByText('Recommendation 2')).toBeInTheDocument();
    expect(screen.getByTestId('decision-outcome-missing-2')).toHaveTextContent('outcome-missing');
  });

  it('renders a recorded outcome instead of outcome-missing', () => {
    setDecisions([
      decisionRow(2, 'accepted', {
        outcome: 'Reserve remained unused',
        outcomeRecordedAt: '2026-08-31T12:00:00.000Z',
        outcomeRecordedBy: 9,
      }),
    ]);

    renderPage();

    const row = screen.getByTestId('decision-row-2');
    expect(within(row).getByText('Reserve remained unused')).toBeInTheDocument();
    expect(within(row).queryByTestId('decision-outcome-missing-2')).not.toBeInTheDocument();
  });

  it('shows deferred follow-up owner and date', () => {
    setDecisions([decisionRow(4, 'deferred')]);

    renderPage();

    const row = screen.getByTestId('decision-row-4');
    expect(within(row).getByText('User #9')).toBeInTheDocument();
    expect(within(row).getByText('Oct 1, 2026')).toBeInTheDocument();
  });

  it('explains why proposed decisions cannot create a plan version', () => {
    setDecisions([decisionRow(1, 'proposed')]);

    renderPage();

    expect(document.getElementById('decision-plan-version-disabled-1-reason')).toHaveTextContent(
      'Only active accepted decision can cite plan-version command.'
    );
  });

  it('explains the accepted-decision plan-version fallback', () => {
    setDecisions([decisionRow(2, 'accepted')]);

    renderPage();

    expect(document.getElementById('decision-plan-version-disabled-2-reason')).toHaveTextContent(
      'Decision-linked plan-version command is not mounted on live surface.'
    );
  });

  it('enables decision evidence only for the expanded row', async () => {
    setDecisions([decisionRow(1, 'proposed'), decisionRow(2, 'accepted')]);

    renderPage();

    expect(mocks.decisionEvidence).not.toHaveBeenCalledWith(7, 1, { enabled: true });
    fireEvent.click(screen.getByTestId('decision-evidence-toggle-1'));

    await waitFor(() => {
      expect(mocks.decisionEvidence).toHaveBeenCalledWith(7, 1, { enabled: true });
    });
    expect(mocks.decisionEvidence).not.toHaveBeenCalledWith(7, 2, { enabled: true });
  });

  it('renders decision evidence returned for an expanded row', async () => {
    setDecisions([decisionRow(1, 'proposed')]);
    mocks.decisionEvidence.mockReturnValue({
      data: [
        {
          contractVersion: 'decision-evidence-link/1.0.0',
          linkId: 71,
          fundId: 7,
          decisionId: 1,
          target: { kind: 'analysis_reference', id: 22 },
          createdAt: '2026-08-31T12:00:00.000Z',
        },
      ],
      isLoading: false,
      error: null,
    });

    renderPage();
    fireEvent.click(screen.getByTestId('decision-evidence-toggle-1'));

    await waitFor(() => {
      expect(screen.getByText('Analysis reference #22')).toBeInTheDocument();
    });
  });

  it('enables task evidence only for the expanded row', async () => {
    mocks.tasks.mockReturnValue({ data: [task], isLoading: false, error: null });

    renderPage();

    expect(mocks.taskEvidence).not.toHaveBeenCalledWith('7', 51, { enabled: true });
    fireEvent.click(screen.getByTestId('task-evidence-toggle-51'));

    await waitFor(() => {
      expect(mocks.taskEvidence).toHaveBeenCalledWith('7', 51, { enabled: true });
    });
  });

  it('renders task evidence returned for an expanded row', async () => {
    mocks.tasks.mockReturnValue({ data: [task], isLoading: false, error: null });
    mocks.taskEvidence.mockReturnValue({
      data: [
        {
          contractVersion: 'task-evidence-link/1.0.0',
          linkId: 81,
          fundId: 7,
          taskId: 51,
          target: { kind: 'internal_economics_run', id: 88 },
          createdAt: '2026-08-31T12:00:00.000Z',
        },
      ],
      isLoading: false,
      error: null,
    });

    renderPage();
    fireEvent.click(screen.getByTestId('task-evidence-toggle-51'));

    await waitFor(() => {
      expect(screen.getByText('Internal economics run #88')).toBeInTheDocument();
    });
  });

  it('passes decision ID, ETag, and accepted status to transition action', () => {
    setDecisions([decisionRow(1, 'proposed')]);

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Accept decision' }));

    expect(mocks.transitionDecision).toHaveBeenCalledWith({
      decisionId: 1,
      etag: 'W/"1"',
      input: { status: 'accepted' },
    });
  });

  it('passes decision ID, ETag, and parsed follow-up fields to deferred transition', () => {
    setDecisions([decisionRow(1, 'proposed')]);

    renderPage();
    const row = screen.getByTestId('decision-row-1');
    fireEvent.change(within(row).getByLabelText('Follow-up owner ID'), {
      target: { value: '9' },
    });
    fireEvent.change(within(row).getByLabelText('Follow-up date'), {
      target: { value: '2026-10-01' },
    });
    fireEvent.click(within(row).getByRole('button', { name: 'Defer with follow-up' }));

    expect(mocks.transitionDecision).toHaveBeenCalledWith({
      decisionId: 1,
      etag: 'W/"1"',
      input: {
        status: 'deferred',
        followUpOwnerId: 9,
        followUpDate: '2026-10-01',
      },
    });
  });

  it('passes decision ID, ETag, and outcome to outcome action', () => {
    setDecisions([decisionRow(2, 'accepted')]);

    renderPage();
    const row = screen.getByTestId('decision-row-2');
    fireEvent.change(within(row).getByLabelText('Outcome'), {
      target: { value: 'Reserve remained unused' },
    });
    fireEvent.click(within(row).getByRole('button', { name: 'Record outcome' }));

    expect(mocks.recordDecisionOutcome).toHaveBeenCalledWith(
      {
        decisionId: 2,
        etag: 'W/"2"',
        input: { outcome: 'Reserve remained unused' },
      },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });

  it('passes predecessor ID and successor payload to supersede action', () => {
    setDecisions([decisionRow(2, 'accepted')]);

    renderPage();
    const row = screen.getByTestId('decision-row-2');
    fireEvent.change(within(row).getByLabelText('Successor title'), {
      target: { value: 'Release reserve' },
    });
    fireEvent.change(within(row).getByLabelText('Successor recommendation'), {
      target: { value: 'Release unused reserve' },
    });
    fireEvent.click(within(row).getByRole('button', { name: 'Supersede decision' }));

    expect(mocks.supersedeDecision).toHaveBeenCalledWith(
      {
        decisionId: 2,
        input: {
          fundId: 7,
          title: 'Release reserve',
          recommendation: 'Release unused reserve',
        },
      },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });

  it('passes fund-scoped fields to task creation', () => {
    renderPage();
    const pane = screen.getByTestId('operations-tasks-pane');
    fireEvent.change(within(pane).getByLabelText('Title'), {
      target: { value: 'Call portfolio CEO' },
    });
    fireEvent.change(within(pane).getByLabelText('Owner ID'), { target: { value: '9' } });
    fireEvent.change(within(pane).getByLabelText('Due date'), {
      target: { value: '2026-09-15' },
    });
    fireEvent.change(within(pane).getByLabelText('Description'), {
      target: { value: 'Confirm runway update.' },
    });
    fireEvent.click(within(pane).getByRole('button', { name: 'Create task' }));

    expect(mocks.createTask).toHaveBeenCalledWith(
      {
        fundId: 7,
        title: 'Call portfolio CEO',
        ownerId: 9,
        dueDate: '2026-09-15',
        description: 'Confirm runway update.',
      },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });

  it('passes fund, title, and recommendation to decision creation', () => {
    renderPage();
    const pane = screen.getByTestId('operations-decisions-pane');
    fireEvent.change(within(pane).getByLabelText('Title'), {
      target: { value: 'Keep reserve' },
    });
    fireEvent.change(within(pane).getByLabelText('Recommendation'), {
      target: { value: 'Keep reserve available' },
    });
    fireEvent.click(within(pane).getByRole('button', { name: 'Create decision' }));

    expect(mocks.createDecision).toHaveBeenCalledWith(
      {
        fundId: 7,
        title: 'Keep reserve',
        recommendation: 'Keep reserve available',
      },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });

  it('passes decision ID and target to evidence creation', async () => {
    setDecisions([decisionRow(1, 'proposed')]);

    renderPage();
    fireEvent.click(screen.getByTestId('decision-evidence-toggle-1'));
    const row = screen.getByTestId('decision-row-1');
    fireEvent.change(within(row).getByLabelText('Evidence type'), {
      target: { value: 'internal_economics_run' },
    });
    fireEvent.change(within(row).getByLabelText('Target ID'), { target: { value: '88' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Link evidence' }));

    await waitFor(() => {
      expect(mocks.createDecisionEvidence).toHaveBeenCalledWith(
        {
          decisionId: 1,
          input: { target: { kind: 'internal_economics_run', id: 88 } },
        },
        expect.objectContaining({ onSuccess: expect.any(Function) })
      );
    });
  });

  it('surfaces a forbidden decision-create error', () => {
    mocks.createDecisionError = new ApiError(403, 'Fund write role required');

    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent('Fund write role required');
  });

  it('surfaces an in-flight supersede conflict', () => {
    mocks.supersedeDecisionError = new ApiError(409, 'Command already in progress');
    setDecisions([decisionRow(2, 'accepted')]);

    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent('Command already in progress');
  });

  it('renders stale transition errors with refresh guidance', () => {
    mocks.transitionDecisionError = new ApiError(412, 'Decision changed');
    setDecisions([decisionRow(1, 'proposed')]);

    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Decision changed since it was loaded. Review refreshed row and retry action.'
    );
  });
});
