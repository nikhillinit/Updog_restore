import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockUseCashFlowEvents } = vi.hoisted(() => ({ mockUseCashFlowEvents: vi.fn() }));

vi.mock('@/hooks/useCashFlowEvents', () => ({
  useCashFlowEvents: (fundId: string | undefined, options?: { enabled?: boolean }) =>
    mockUseCashFlowEvents(fundId, options),
}));

import { CashEventsPanel } from '@/components/dashboard/CashEventsPanel';

const sampleEvent = {
  id: 10,
  fundId: 1,
  eventType: 'lp_capital_call',
  amount: '1250000.000000',
  currency: 'USD',
  eventDate: '2026-06-15T00:00:00.000Z',
  perspective: 'lp_net',
  description: null,
  payload: { callNumber: 1 },
  status: 'draft',
  createdAt: '2026-06-15T00:00:00.000Z',
};

describe('CashEventsPanel', () => {
  it('renders nothing when no panel state is present', () => {
    mockUseCashFlowEvents.mockReturnValue({ data: [], isLoading: false });
    render(<CashEventsPanel fundId="1" state={null} onClose={() => {}} />);
    expect(screen.queryByText('Cash events')).not.toBeInTheDocument();
  });

  it('does not enable the query when the panel is closed', () => {
    mockUseCashFlowEvents.mockReturnValue({ data: [], isLoading: false });
    render(<CashEventsPanel fundId="1" state={null} onClose={() => {}} />);
    expect(mockUseCashFlowEvents).toHaveBeenCalledWith('1', { enabled: false });
  });

  it('lists persisted events when the panel is open', () => {
    mockUseCashFlowEvents.mockReturnValue({ data: [sampleEvent], isLoading: false });
    render(<CashEventsPanel fundId="1" state={{ panel: 'cash-events' }} onClose={() => {}} />);
    expect(mockUseCashFlowEvents).toHaveBeenCalledWith('1', { enabled: true });
    expect(screen.getByText('lp_capital_call')).toBeInTheDocument();
    expect(screen.getByText('1250000.000000')).toBeInTheDocument();
  });

  it('shows a loading state while fetching', () => {
    mockUseCashFlowEvents.mockReturnValue({ data: undefined, isLoading: true });
    render(<CashEventsPanel fundId="1" state={{ panel: 'cash-events' }} onClose={() => {}} />);
    expect(screen.getByText(/loading cash events/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no events', () => {
    mockUseCashFlowEvents.mockReturnValue({ data: [], isLoading: false });
    render(<CashEventsPanel fundId="1" state={{ panel: 'cash-events' }} onClose={() => {}} />);
    expect(screen.getByText(/no cash events recorded/i)).toBeInTheDocument();
  });

  it('calls onClose when the close affordance is used', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockUseCashFlowEvents.mockReturnValue({ data: [sampleEvent], isLoading: false });
    render(<CashEventsPanel fundId="1" state={{ panel: 'cash-events' }} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
