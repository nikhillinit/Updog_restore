import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mutateAsyncMock = vi.fn();

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({
    currentFund: { id: 7, name: 'Test Fund' },
  }),
}));

vi.mock('@/hooks/useTimelineData', () => ({
  useTimelineData: () => ({
    data: {
      events: [],
      snapshots: [
        {
          id: 'snapshot-1',
          snapshotTime: '2026-04-05T00:00:00.000Z',
          eventCount: 3,
        },
      ],
      pagination: { total: 1 },
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  usePointInTimeState: () => ({
    data: null,
    isLoading: false,
  }),
  useStateComparison: () => ({
    data: null,
    isLoading: false,
  }),
  useCreateSnapshot: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: false,
  }),
}));

vi.mock('@/components/analytics', () => ({
  ErrorState: () => <div data-testid="error-state" />,
  StatCard: ({ title, value }: { title: string; value: unknown }) => (
    <div>
      {title}:{String(value)}
    </div>
  ),
  StatCardGrid: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TimelineChart: () => <div data-testid="timeline-chart" />,
  EventTimelineChart: () => <div data-testid="event-timeline-chart" />,
}));

vi.mock('@/components/ui/select', async () => {
  const React = await import('react');

  const SelectContext = React.createContext<{
    value: string;
    onValueChange: (value: string) => void;
  } | null>(null);

  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value: string;
      onValueChange: (value: string) => void;
      children?: React.ReactNode;
    }) => (
      <SelectContext.Provider value={{ value, onValueChange }}>{children}</SelectContext.Provider>
    ),
    SelectTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    SelectValue: () => null,
    SelectContent: ({ children }: { children?: React.ReactNode }) => {
      const context = React.useContext(SelectContext);
      if (!context) return null;

      return (
        <select
          aria-label="Snapshot Type"
          value={context.value}
          onChange={(event) => context.onValueChange(event.target.value)}
        >
          {children}
        </select>
      );
    },
    SelectItem: ({
      value,
      children,
    }: {
      value: string;
      children?: React.ReactNode;
    }) => <option value={value}>{children}</option>,
  };
});

import TimeTravelPage from '@/pages/time-travel';

describe('TimeTravelPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsyncMock.mockResolvedValue({
      message: 'queued',
      fundId: 7,
      type: 'manual',
      estimatedCompletion: '2026-04-05T00:00:00.000Z',
    });
  });

  it('keeps restore disabled with versioned workflow copy', async () => {
    render(<TimeTravelPage />);
    const user = userEvent.setup();

    expect(screen.getByText('Time-Travel Analytics')).toBeInTheDocument();
    expect(
      screen.getByText(
        /dormant page/i
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request snapshot/i })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Snapshot Manager' }));
    expect(
      screen.getByText(
        /timeline snapshot ids do not map to the uuid snapshot\/version identities used by the server-side restore workflow/i
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /restore not available/i })).toBeDisabled();
  });

  it('submits the selected snapshot type and optional description', async () => {
    render(<TimeTravelPage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /request snapshot/i }));
    await user.selectOptions(screen.getByRole('combobox', { name: /snapshot type/i }), 'auto');
    await user.type(screen.getByPlaceholderText(/enter snapshot description/i), 'Identity audit');
    await user.click(screen.getByRole('button', { name: /queue snapshot/i }));

    expect(mutateAsyncMock).toHaveBeenCalledWith({
      fundId: 7,
      type: 'auto',
      description: 'Identity audit',
    });
  });
});
