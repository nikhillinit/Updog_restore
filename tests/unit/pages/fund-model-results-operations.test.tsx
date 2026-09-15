import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  updateTask: vi.fn(),
  resetTaskUpdate: vi.fn(),
  refetchTasks: vi.fn(),
  createTaskEvidence: vi.fn(),
  updateTaskError: null as Error | null,
  updateTaskPending: false,
  createTaskEvidenceError: null as Error | null,
  createTaskEvidencePending: false,
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
  useUpdateTask: () => ({
    mutate: mocks.updateTask,
    reset: mocks.resetTaskUpdate,
    isPending: mocks.updateTaskPending,
    error: mocks.updateTaskError,
  }),
  useCreateTaskEvidenceLink: () => ({
    mutate: mocks.createTaskEvidence,
    isPending: mocks.createTaskEvidencePending,
    error: mocks.createTaskEvidenceError,
  }),
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
  const content = () => (
    <TestQueryClientProvider>
      <Wrapper>
        <Page />
      </Wrapper>
    </TestQueryClientProvider>
  );
  const view = render(content());
  return { ...view, rerenderPage: () => view.rerender(content()) };
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
    mocks.updateTaskError = null;
    mocks.updateTaskPending = false;
    mocks.createTaskEvidenceError = null;
    mocks.createTaskEvidencePending = false;
    mocks.updateTask.mockReset();
    mocks.createTaskEvidence.mockReset();
    mocks.refetchTasks.mockReset();
    mocks.resetTaskUpdate.mockImplementation(() => {
      mocks.updateTaskError = null;
    });
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

  it('opens task editing by keyboard and submits nullable fields with the captured ETag', async () => {
    mocks.tasks.mockReturnValue({ data: [task], isLoading: false, error: null });
    const user = userEvent.setup();
    renderPage();
    const row = screen.getByTestId('task-row-51');
    within(row).getByRole('button', { name: 'Edit task' }).focus();
    await user.keyboard('{Enter}');
    expect(within(row).getByLabelText('Title')).toHaveFocus();
    fireEvent.change(within(row).getByLabelText('Title'), {
      target: { value: '  Confirm runway  ' },
    });
    fireEvent.change(within(row).getByLabelText('Description'), { target: { value: '' } });
    fireEvent.change(within(row).getByLabelText('Owner ID'), { target: { value: '' } });
    fireEvent.change(within(row).getByLabelText('Due date'), { target: { value: '' } });
    fireEvent.change(within(row).getByLabelText('Status'), { target: { value: 'in_progress' } });
    expect(
      within(within(row).getByLabelText('Status'))
        .getAllByRole('option')
        .map((option) => option.getAttribute('value'))
    ).toEqual(['open', 'in_progress', 'done']);
    fireEvent.click(within(row).getByRole('button', { name: 'Save task' }));
    expect(mocks.updateTask).toHaveBeenCalledWith(
      {
        taskId: 51,
        etag: task.etag,
        input: {
          title: 'Confirm runway',
          description: null,
          ownerId: null,
          dueDate: null,
          status: 'in_progress',
        },
      },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
    );
  });

  it.each([task.description, '', null])(
    'completes a task with description %j through a status-only update',
    async (description) => {
      const original = { ...task, description };
      const completed = { ...original, status: 'done', etag: 'W/"completed"' };
      mocks.tasks.mockReturnValue({ data: [original], isLoading: false, error: null });
      mocks.updateTask.mockImplementation((_input, options) => {
        mocks.tasks.mockReturnValue({ data: [completed], isLoading: false, error: null });
        options.onSuccess();
      });
      const view = renderPage();
      const row = screen.getByTestId('task-row-51');
      fireEvent.click(within(row).getByRole('button', { name: 'Complete task' }));
      expect(mocks.updateTask).toHaveBeenCalledWith(
        {
          taskId: 51,
          etag: task.etag,
          input: { status: 'done' },
        },
        expect.any(Object)
      );
      view.rerenderPage();
      await waitFor(() => expect(within(row).getByText('done')).toBeInTheDocument());
      expect(within(row).getByRole('button', { name: 'Edit task' })).toHaveFocus();
      expect(within(row).queryByRole('button', { name: 'Complete task' })).not.toBeInTheDocument();
    }
  );

  it.each([new Error('Connection lost'), new ApiError(500, 'Failed to update task')])(
    'mounted task editor retains values and original ETag after %s, refetch, and editor close',
    (failure) => {
      mocks.tasks.mockReturnValue({ data: [task], isLoading: false, error: null });
      const view = renderPage();
      const row = screen.getByTestId('task-row-51');
      fireEvent.click(within(row).getByRole('button', { name: 'Edit task' }));
      fireEvent.change(within(row).getByLabelText('Title'), {
        target: { value: 'My pending edit' },
      });
      fireEvent.change(within(row).getByLabelText('Owner ID'), { target: { value: '21' } });
      fireEvent.change(within(row).getByLabelText('Due date'), { target: { value: '2026-10-01' } });
      fireEvent.click(within(row).getByRole('button', { name: 'Save task' }));
      const originalCommand = mocks.updateTask.mock.calls[0]?.[0];
      mocks.updateTaskError = failure;
      mocks.tasks.mockReturnValue({
        data: [{ ...task, title: 'A remote edit', ownerId: 30, etag: 'W/"background"' }],
        isLoading: false,
        error: null,
      });
      view.rerenderPage();
      expect(within(row).getByText('A remote edit')).toBeInTheDocument();
      expect(within(row).getByRole('alert')).toHaveTextContent(failure.message);
      expect(within(row).getByLabelText('Title')).toHaveValue('My pending edit');
      fireEvent.click(within(row).getByRole('button', { name: 'Close editor' }));
      expect(within(row).getByRole('button', { name: 'Edit task' })).toHaveFocus();
      fireEvent.click(within(row).getByRole('button', { name: 'Edit task' }));
      expect(within(row).getByLabelText('Owner ID')).toHaveValue(21);
      expect(within(row).getByLabelText('Due date')).toHaveValue('2026-10-01');
      fireEvent.click(within(row).getByRole('button', { name: 'Save task' }));
      expect(mocks.updateTask.mock.calls[1]?.[0]).toEqual(originalCommand);
      expect(mocks.updateTask.mock.calls[1]?.[0].etag).toBe(task.etag);
      expect(mocks.resetTaskUpdate).not.toHaveBeenCalled();
    }
  );

  it.each([task.title, ''])(
    'recovers a committed update after response loss before accepting later title %j',
    (laterTitle) => {
      const committed = { ...task, title: 'Committed title', etag: 'W/"committed-title"' };
      mocks.tasks.mockReturnValue({ data: [task], isLoading: false, error: null });
      mocks.updateTask.mockImplementationOnce((_input, options) => {
        mocks.tasks.mockReturnValue({ data: [committed], isLoading: false, error: null });
        mocks.updateTaskError = new TypeError('Connection lost');
        options.onError(mocks.updateTaskError);
      });
      const view = renderPage();
      const row = screen.getByTestId('task-row-51');
      fireEvent.click(within(row).getByRole('button', { name: 'Edit task' }));
      fireEvent.change(within(row).getByLabelText('Title'), { target: { value: committed.title } });
      fireEvent.click(within(row).getByRole('button', { name: 'Save task' }));
      const originalCommand = mocks.updateTask.mock.calls[0]?.[0];
      view.rerenderPage();
      fireEvent.change(within(row).getByLabelText('Title'), { target: { value: laterTitle } });
      mocks.updateTask.mockImplementationOnce((_input, options) => {
        mocks.updateTaskError = null;
        options.onSuccess(committed);
      });
      fireEvent.click(within(row).getByRole('button', { name: 'Save task' }));
      expect(mocks.updateTask.mock.calls[1]?.[0]).toEqual(originalCommand);
      expect(within(row).queryByText('No changes to save.')).not.toBeInTheDocument();
      expect(within(row).getByLabelText('Title')).toHaveValue(laterTitle);
      expect(within(row).getByRole('status')).toHaveTextContent(
        'Previous save confirmed. Review your remaining edits, then save again.'
      );
      expect(mocks.resetTaskUpdate).not.toHaveBeenCalled();
      if (laterTitle === '') {
        fireEvent.click(within(row).getByRole('button', { name: 'Save task' }));
        expect(mocks.updateTask).toHaveBeenCalledTimes(2);
        fireEvent.change(within(row).getByLabelText('Title'), { target: { value: task.title } });
      }
      fireEvent.click(within(row).getByRole('button', { name: 'Save task' }));
      expect(mocks.updateTask.mock.calls[2]?.[0]).toEqual({
        taskId: task.id,
        etag: committed.etag,
        input: { title: task.title },
      });
    }
  );

  it('retains an uncertain command after a later authorization refusal', () => {
    mocks.tasks.mockReturnValue({ data: [task], isLoading: false, error: null });
    mocks.updateTask.mockImplementationOnce((_input, options) => {
      mocks.updateTaskError = new TypeError('Connection lost');
      options.onError(mocks.updateTaskError);
    });
    renderPage();
    const row = screen.getByTestId('task-row-51');
    fireEvent.click(within(row).getByRole('button', { name: 'Edit task' }));
    fireEvent.change(within(row).getByLabelText('Title'), {
      target: { value: 'Unconfirmed title' },
    });
    fireEvent.click(within(row).getByRole('button', { name: 'Save task' }));
    const originalCommand = mocks.updateTask.mock.calls[0]?.[0];
    fireEvent.change(within(row).getByLabelText('Title'), { target: { value: task.title } });
    mocks.updateTask.mockImplementationOnce((_input, options) => {
      mocks.updateTaskError = new ApiError(403, 'Fund write role required');
      options.onError(mocks.updateTaskError);
    });
    fireEvent.click(within(row).getByRole('button', { name: 'Save task' }));
    fireEvent.click(within(row).getByRole('button', { name: 'Save task' }));
    expect(mocks.updateTask.mock.calls.slice(1).map(([command]) => command)).toEqual([
      originalCommand,
      originalCommand,
    ]);
    expect(mocks.resetTaskUpdate).not.toHaveBeenCalled();
    expect(within(row).queryByText('No changes to save.')).not.toBeInTheDocument();
  });

  it('allows a settled no-op after an initial authorization refusal', () => {
    mocks.tasks.mockReturnValue({ data: [task], isLoading: false, error: null });
    mocks.updateTask.mockImplementationOnce((_input, options) => {
      mocks.updateTaskError = new ApiError(403, 'Fund write role required');
      options.onError(mocks.updateTaskError);
    });
    renderPage();
    const row = screen.getByTestId('task-row-51');
    fireEvent.click(within(row).getByRole('button', { name: 'Edit task' }));
    fireEvent.change(within(row).getByLabelText('Title'), { target: { value: 'Refused title' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Save task' }));
    fireEvent.change(within(row).getByLabelText('Title'), { target: { value: task.title } });
    fireEvent.click(within(row).getByRole('button', { name: 'Save task' }));
    expect(mocks.updateTask).toHaveBeenCalledTimes(1);
    expect(within(row).getByText('No changes to save.')).toBeInTheDocument();
  });

  it.each([task.description, '', null])(
    'preserves concurrent changes to untouched fields after refreshing description %j',
    async (description) => {
      mocks.tasks.mockReturnValue({
        data: [{ ...task, description }],
        isLoading: false,
        error: null,
        refetch: mocks.refetchTasks,
      });
      const view = renderPage();
      const row = screen.getByTestId('task-row-51');
      fireEvent.click(within(row).getByRole('button', { name: 'Edit task' }));
      fireEvent.change(within(row).getByLabelText('Title'), { target: { value: 'My stale edit' } });
      fireEvent.change(within(row).getByLabelText('Owner ID'), { target: { value: '21' } });
      fireEvent.click(within(row).getByRole('button', { name: 'Save task' }));
      mocks.updateTaskError = new ApiError(412, 'Task changed');
      const refreshed = {
        ...task,
        etag: 'W/"refreshed"',
        title: 'Current saved task',
        ownerId: 30,
        description: 'Concurrent description',
        dueDate: '2026-10-15',
        status: 'in_progress',
      };
      mocks.tasks.mockReturnValue({
        data: [refreshed],
        isLoading: false,
        error: null,
        refetch: mocks.refetchTasks,
      });
      view.rerenderPage();
      expect(within(row).getByRole('button', { name: 'Save task' })).toBeDisabled();
      expect(within(row).getByRole('alert')).toHaveTextContent(
        'Task changed since this edit started'
      );
      mocks.refetchTasks.mockResolvedValueOnce({
        error: new Error('Refresh unavailable'),
        data: undefined,
      });
      fireEvent.click(within(row).getByRole('button', { name: 'Refresh task version' }));
      await waitFor(() => expect(within(row).getByText('Refresh unavailable')).toBeInTheDocument());
      expect(within(row).getByRole('button', { name: 'Save task' })).toBeDisabled();
      expect(within(row).getByLabelText('Title')).toHaveValue('My stale edit');
      expect(mocks.resetTaskUpdate).not.toHaveBeenCalled();
      mocks.refetchTasks.mockResolvedValueOnce({ error: null, data: [refreshed] });
      fireEvent.click(within(row).getByRole('button', { name: 'Refresh task version' }));
      await waitFor(() =>
        expect(within(row).getByRole('button', { name: 'Save task' })).toBeEnabled()
      );
      expect(within(row).getByLabelText('Title')).toHaveValue('My stale edit');
      expect(within(row).getByLabelText('Owner ID')).toHaveValue(21);
      expect(within(row).getByLabelText('Description')).toHaveValue('Concurrent description');
      expect(within(row).getByLabelText('Due date')).toHaveValue('2026-10-15');
      expect(within(row).getByLabelText('Status')).toHaveValue('in_progress');
      expect(mocks.updateTask).toHaveBeenCalledTimes(1);
      expect(mocks.resetTaskUpdate).toHaveBeenCalledOnce();
      fireEvent.click(within(row).getByRole('button', { name: 'Save task' }));
      expect(mocks.updateTask.mock.calls[1]?.[0]).toEqual({
        taskId: 51,
        etag: refreshed.etag,
        input: { title: 'My stale edit', ownerId: 21 },
      });
    }
  );

  it.each([task.description, '', null])(
    'retains an unchanged draft with description %j without sending an update',
    (description) => {
      const original = { ...task, description, title: ` ${task.title} ` };
      mocks.tasks.mockReturnValue({ data: [original], isLoading: false, error: null });
      renderPage();
      const row = screen.getByTestId('task-row-51');
      fireEvent.click(within(row).getByRole('button', { name: 'Edit task' }));
      fireEvent.click(within(row).getByRole('button', { name: 'Save task' }));
      expect(mocks.updateTask).not.toHaveBeenCalled();
      expect(within(row).getByText('No changes to save.')).toBeInTheDocument();
      expect(within(row).getByLabelText('Title')).toHaveValue(original.title);
    }
  );

  it('disables task fields during a pending update and retains values after authorization failure', () => {
    mocks.tasks.mockReturnValue({ data: [task], isLoading: false, error: null });
    const view = renderPage();
    const row = screen.getByTestId('task-row-51');
    fireEvent.click(within(row).getByRole('button', { name: 'Edit task' }));
    fireEvent.change(within(row).getByLabelText('Description'), {
      target: { value: 'Retained description' },
    });
    mocks.updateTaskPending = true;
    view.rerenderPage();
    for (const label of ['Title', 'Description', 'Owner ID', 'Due date', 'Status']) {
      expect(within(row).getByLabelText(label)).toBeDisabled();
    }
    expect(within(row).getByRole('form', { name: 'Edit task 51' })).toHaveAttribute(
      'aria-busy',
      'true'
    );
    fireEvent.submit(within(row).getByRole('form', { name: 'Edit task 51' }));
    expect(mocks.updateTask).not.toHaveBeenCalled();
    mocks.updateTaskPending = false;
    mocks.updateTaskError = new ApiError(403, 'Fund write role required');
    view.rerenderPage();
    expect(within(row).getByRole('alert')).toHaveTextContent('Fund write role required');
    expect(within(row).getByLabelText('Description')).toHaveValue('Retained description');
  });

  it.each(['analysis_reference', 'internal_economics_run'])(
    'attaches supported task evidence %s and shows the refreshed link',
    async (kind) => {
      mocks.tasks.mockReturnValue({ data: [task], isLoading: false, error: null });
      mocks.createTaskEvidence.mockImplementation((_input, options) => {
        mocks.taskEvidence.mockReturnValue({
          data: [
            {
              linkId: 81,
              fundId: 7,
              taskId: 51,
              target: { kind, id: 88 },
              createdAt: task.createdAt,
            },
          ],
          isLoading: false,
          error: null,
        });
        options.onSuccess();
      });
      renderPage();
      const row = screen.getByTestId('task-row-51');
      fireEvent.click(within(row).getByText('Task evidence links'));
      const form = within(row).getByRole('form', { name: 'Task 51 evidence' });
      expect(
        within(form)
          .getAllByRole('option')
          .map((option) => option.getAttribute('value'))
      ).toEqual(['analysis_reference', 'internal_economics_run']);
      fireEvent.change(within(form).getByLabelText('Evidence type'), { target: { value: kind } });
      fireEvent.change(within(form).getByLabelText('Target ID'), { target: { value: '88' } });
      fireEvent.click(within(form).getByRole('button', { name: 'Link evidence' }));
      expect(mocks.createTaskEvidence).toHaveBeenCalledWith(
        {
          taskId: 51,
          input: { target: { kind, id: 88 } },
        },
        expect.objectContaining({ onSuccess: expect.any(Function) })
      );
      await waitFor(() =>
        expect(
          within(row).getByText(
            kind === 'analysis_reference' ? 'Analysis reference #88' : 'Internal economics run #88'
          )
        ).toBeInTheDocument()
      );
      expect(within(form).getByLabelText('Target ID')).toHaveValue(null);
    }
  );

  it('keeps evidence fields on ambiguous failure and rejects invalid target IDs', async () => {
    mocks.tasks.mockReturnValue({ data: [task], isLoading: false, error: null });
    const view = renderPage();
    const row = screen.getByTestId('task-row-51');
    fireEvent.click(within(row).getByText('Task evidence links'));
    const form = within(row).getByRole('form', { name: 'Task 51 evidence' });
    fireEvent.change(within(form).getByLabelText('Target ID'), {
      target: { value: '9007199254740992' },
    });
    fireEvent.submit(form);
    expect(mocks.createTaskEvidence).not.toHaveBeenCalled();
    expect(within(row).getByRole('alert')).toHaveTextContent('positive target ID');
    fireEvent.change(within(form).getByLabelText('Target ID'), { target: { value: '88' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Link evidence' }));
    mocks.createTaskEvidenceError = new Error('Connection lost');
    view.rerenderPage();
    expect(within(form).getByLabelText('Target ID')).toHaveValue(88);
    expect(within(row).getByRole('alert')).toHaveTextContent('Connection lost');
    fireEvent.click(within(form).getByRole('button', { name: 'Link evidence' }));
    expect(mocks.createTaskEvidence.mock.calls[1]?.[0]).toEqual(
      mocks.createTaskEvidence.mock.calls[0]?.[0]
    );
  });
});
