import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const {
  mockUseCashFlowEvents,
  mockUseUpdate,
  mockUseApprove,
  mockUseLock,
  mockUseFlag,
  mockMutate,
  mockApprove,
  mockLock,
  mockRefetch,
} = vi.hoisted(() => ({
  mockUseCashFlowEvents: vi.fn(),
  mockUseUpdate: vi.fn(),
  mockUseApprove: vi.fn(),
  mockUseLock: vi.fn(),
  mockUseFlag: vi.fn(),
  mockMutate: vi.fn(),
  mockApprove: vi.fn(),
  mockLock: vi.fn(),
  mockRefetch: vi.fn(),
}));

vi.mock('@/shared/useFlags', () => ({ useFlag: (key: string) => mockUseFlag(key) }));

vi.mock('@/hooks/useCashFlowEvents', async (importActual) => {
  const actual = await importActual<typeof import('@/hooks/useCashFlowEvents')>();
  return {
    ...actual,
    useCashFlowEvents: (fundId: string | undefined, options?: { enabled?: boolean }) =>
      mockUseCashFlowEvents(fundId, options),
    useUpdateCashFlowEvent: (fundId: string | undefined) => mockUseUpdate(fundId),
    useApproveCashFlowEvent: (fundId: string | undefined) => mockUseApprove(fundId),
    useLockCashFlowEvent: (fundId: string | undefined) => mockUseLock(fundId),
  };
});

import { CashEventsPanel } from '@/components/dashboard/CashEventsPanel';

const draftEvent = {
  id: 10,
  fundId: 1,
  eventType: 'lp_capital_call',
  amount: '1250000.000000',
  currency: 'USD',
  eventDate: '2026-06-15T14:30:00.000Z',
  perspective: 'lp_net',
  description: null,
  payload: { callNumber: 1 },
  status: 'draft',
  createdAt: '2026-06-15T00:00:00.000Z',
  updatedAt: '2026-06-15T00:00:00.000Z',
  etag: 'W/"abc"',
};
const approvedEvent = { ...draftEvent, id: 11, status: 'approved', etag: 'W/"xyz"' };

function noopProps() {
  return { onClose: vi.fn(), onSelect: vi.fn(), onBack: vi.fn() };
}

beforeEach(() => {
  mockUseFlag.mockReset();
  mockUseFlag.mockReturnValue(false);
  mockUseCashFlowEvents.mockReset();
  mockUseCashFlowEvents.mockReturnValue({
    data: [draftEvent],
    isLoading: false,
    refetch: mockRefetch,
  });
  mockMutate.mockReset();
  mockRefetch.mockReset();
  mockUseUpdate.mockReset();
  mockUseUpdate.mockReturnValue({ mutate: mockMutate, isPending: false });
  mockUseApprove.mockReset();
  mockUseApprove.mockReturnValue({ mutate: mockApprove, isPending: false });
  mockUseLock.mockReset();
  mockUseLock.mockReturnValue({ mutate: mockLock, isPending: false });
  mockApprove.mockReset();
  mockLock.mockReset();
});

describe('CashEventsPanel', () => {
  it('renders nothing when no panel state is present', () => {
    render(<CashEventsPanel fundId="1" state={null} {...noopProps()} />);
    expect(screen.queryByText('Cash events')).not.toBeInTheDocument();
  });

  it('does not enable the query when the panel is closed', () => {
    render(<CashEventsPanel fundId="1" state={null} {...noopProps()} />);
    expect(mockUseCashFlowEvents).toHaveBeenCalledWith('1', { enabled: false });
  });

  it('lists persisted events when the panel is open', () => {
    render(<CashEventsPanel fundId="1" state={{ panel: 'cash-events' }} {...noopProps()} />);
    expect(mockUseCashFlowEvents).toHaveBeenCalledWith('1', { enabled: true });
    expect(screen.getByText('lp_capital_call')).toBeInTheDocument();
    expect(screen.getByText('1250000.000000')).toBeInTheDocument();
  });

  it('remains read-only (no edit inputs) when the edit flag is off', () => {
    render(
      <CashEventsPanel fundId="1" state={{ panel: 'cash-events', object: '10' }} {...noopProps()} />
    );
    expect(screen.queryByLabelText('Amount')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('selects a row, guarded by the leave check', async () => {
    const user = userEvent.setup();
    const props = noopProps();
    render(<CashEventsPanel fundId="1" state={{ panel: 'cash-events' }} {...props} />);
    await user.click(screen.getByRole('button', { name: /lp_capital_call/ }));
    expect(props.onSelect).toHaveBeenCalledWith('10');
  });

  it('shows a not-found state when the object is not in the list', () => {
    mockUseFlag.mockReturnValue(true);
    render(
      <CashEventsPanel
        fundId="1"
        state={{ panel: 'cash-events', object: '999' }}
        {...noopProps()}
      />
    );
    expect(screen.getByText(/was not found/i)).toBeInTheDocument();
  });

  it('opens an editable form for a draft lp_capital_call when the flag is on', () => {
    mockUseFlag.mockReturnValue(true);
    render(
      <CashEventsPanel fundId="1" state={{ panel: 'cash-events', object: '10' }} {...noopProps()} />
    );
    expect(screen.getByLabelText('Amount')).toHaveValue('1250000.000000');
    expect(screen.getByLabelText('Event date')).toHaveValue('2026-06-15');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('keeps approved rows read-only with no Save', () => {
    mockUseFlag.mockReturnValue(true);
    mockUseCashFlowEvents.mockReturnValue({
      data: [approvedEvent],
      isLoading: false,
      refetch: mockRefetch,
    });
    render(
      <CashEventsPanel fundId="1" state={{ panel: 'cash-events', object: '11' }} {...noopProps()} />
    );
    expect(screen.queryByLabelText('Amount')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('enables Save only when dirty and valid', async () => {
    const user = userEvent.setup();
    mockUseFlag.mockReturnValue(true);
    render(
      <CashEventsPanel fundId="1" state={{ panel: 'cash-events', object: '10' }} {...noopProps()} />
    );
    const amount = screen.getByLabelText('Amount');
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await user.clear(amount);
    await user.type(amount, '2000000');
    expect(save).toBeEnabled();
    await user.clear(amount);
    await user.type(amount, '1.2.3');
    expect(save).toBeDisabled();
  });

  it('Cancel restores the original values', async () => {
    const user = userEvent.setup();
    mockUseFlag.mockReturnValue(true);
    render(
      <CashEventsPanel fundId="1" state={{ panel: 'cash-events', object: '10' }} {...noopProps()} />
    );
    const amount = screen.getByLabelText('Amount');
    await user.clear(amount);
    await user.type(amount, '2000000');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Amount')).toHaveValue('1250000.000000');
  });

  it('prompts before discarding unsaved changes on close', async () => {
    const user = userEvent.setup();
    mockUseFlag.mockReturnValue(true);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const props = noopProps();
    render(
      <CashEventsPanel fundId="1" state={{ panel: 'cash-events', object: '10' }} {...props} />
    );
    await user.clear(screen.getByLabelText('Amount'));
    await user.type(screen.getByLabelText('Amount'), '2000000');
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('sends the PATCH on Save and surfaces a 412 conflict with a refetch', async () => {
    const user = userEvent.setup();
    mockUseFlag.mockReturnValue(true);
    mockMutate.mockImplementation((_vars, opts) => opts.onError({ status: 412, message: 'stale' }));
    render(
      <CashEventsPanel fundId="1" state={{ panel: 'cash-events', object: '10' }} {...noopProps()} />
    );
    await user.clear(screen.getByLabelText('Amount'));
    await user.type(screen.getByLabelText('Amount'), '2000000');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 10, etag: 'W/"abc"', patch: { amount: '2000000' } }),
      expect.any(Object)
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/changed since you opened it/i);
    expect(mockRefetch).toHaveBeenCalled();
  });
});

describe('CashEventsPanel lifecycle controls', () => {
  const lockedEvent = { ...draftEvent, id: 12, status: 'locked', etag: 'W/"v3"' };
  const noEtagDraft = { ...draftEvent, etag: '' };
  const approvedReturn = { ...draftEvent, status: 'approved', etag: 'W/"v2"' };

  it('draft shows Save and Approve', () => {
    mockUseFlag.mockReturnValue(true);
    render(
      <CashEventsPanel fundId="1" state={{ panel: 'cash-events', object: '10' }} {...noopProps()} />
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
  });

  it('approved shows Lock and no Save/Approve', () => {
    mockUseFlag.mockReturnValue(true);
    mockUseCashFlowEvents.mockReturnValue({
      data: [approvedEvent],
      isLoading: false,
      refetch: mockRefetch,
    });
    render(
      <CashEventsPanel fundId="1" state={{ panel: 'cash-events', object: '11' }} {...noopProps()} />
    );
    expect(screen.getByRole('button', { name: /lock/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
  });

  it('locked shows no mutation controls', () => {
    mockUseFlag.mockReturnValue(true);
    mockUseCashFlowEvents.mockReturnValue({
      data: [lockedEvent],
      isLoading: false,
      refetch: mockRefetch,
    });
    render(
      <CashEventsPanel fundId="1" state={{ panel: 'cash-events', object: '12' }} {...noopProps()} />
    );
    expect(screen.queryByRole('button', { name: /save|approve|lock/i })).toBeNull();
  });

  it('disables Approve and does not POST when etag is empty', async () => {
    const user = userEvent.setup();
    mockUseFlag.mockReturnValue(true);
    mockUseCashFlowEvents.mockReturnValue({
      data: [noEtagDraft],
      isLoading: false,
      refetch: mockRefetch,
    });
    render(
      <CashEventsPanel fundId="1" state={{ panel: 'cash-events', object: '10' }} {...noopProps()} />
    );
    const approve = screen.getByRole('button', { name: /approve/i });
    expect(approve).toBeDisabled();
    await user.click(approve).catch(() => {});
    expect(mockApprove).not.toHaveBeenCalled();
  });

  it('disables Approve and does not POST while draft edits are unsaved', async () => {
    const user = userEvent.setup();
    mockUseFlag.mockReturnValue(true);
    render(
      <CashEventsPanel fundId="1" state={{ panel: 'cash-events', object: '10' }} {...noopProps()} />
    );

    await user.clear(screen.getByLabelText('Amount'));
    await user.type(screen.getByLabelText('Amount'), '2000000');

    const approve = screen.getByRole('button', { name: /approve/i });
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(approve).toBeDisabled();
    await user.click(approve).catch(() => {});
    expect(mockApprove).not.toHaveBeenCalled();
  });

  it('re-enables Approve after dirty draft edits are cancelled', async () => {
    const user = userEvent.setup();
    mockUseFlag.mockReturnValue(true);
    render(
      <CashEventsPanel fundId="1" state={{ panel: 'cash-events', object: '10' }} {...noopProps()} />
    );

    await user.clear(screen.getByLabelText('Amount'));
    await user.type(screen.getByLabelText('Amount'), '2000000');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: /approve/i })).toBeEnabled();
  });

  it('surfaces a 412 conflict via role=alert on approve', async () => {
    const user = userEvent.setup();
    mockUseFlag.mockReturnValue(true);
    mockApprove.mockImplementation((_v, opts) =>
      opts.onError({ status: 412, message: 'Event has been modified' })
    );
    render(
      <CashEventsPanel fundId="1" state={{ panel: 'cash-events', object: '10' }} {...noopProps()} />
    );
    await user.click(screen.getByRole('button', { name: /approve/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/modified|conflict|changed/i);
  });

  it('after approve success the detail reflects approved and drops draft controls', async () => {
    const user = userEvent.setup();
    mockUseFlag.mockReturnValue(true);
    mockApprove.mockImplementation((_v, opts) => opts.onSuccess(approvedReturn));
    render(
      <CashEventsPanel fundId="1" state={{ panel: 'cash-events', object: '10' }} {...noopProps()} />
    );
    await user.click(screen.getByRole('button', { name: /approve/i }));
    expect(screen.getByRole('button', { name: /lock/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });
});
