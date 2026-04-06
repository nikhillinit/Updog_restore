import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    mutateAsync: vi.fn(),
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

import TimeTravelPage from '@/pages/time-travel';

describe('TimeTravelPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps restore disabled with versioned workflow copy', async () => {
    render(<TimeTravelPage />);
    const user = userEvent.setup();

    expect(screen.getByText('Time-Travel Analytics')).toBeInTheDocument();
    expect(
      screen.getByText(
        /server-side versioned restore workflow exists, but restore remains unavailable on this page/i
      )
    ).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Snapshot Manager' }));
    expect(
      screen.getByText(
        /restore stays intentionally disabled on this page until the existing server-side versioned restore workflow is wired to this surface end-to-end/i
      )
    ).toBeInTheDocument();
  });
});
