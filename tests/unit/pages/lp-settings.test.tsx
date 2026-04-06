import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LPSettings from '@/pages/lp/settings';

const mutateAsyncMock = vi.fn();
const toastMock = vi.fn();

vi.mock('@/contexts/LPContext', () => ({
  useLPContext: () => ({
    lpProfile: {
      name: 'Demo LP',
      email: 'demo@example.com',
      entityType: 'llc',
      taxId: '12-3456789',
    },
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: toastMock,
  }),
}));

vi.mock('@/hooks/useLpNotificationPreferences', () => ({
  DEFAULT_LP_NOTIFICATION_PREFERENCES: {
    emailCapitalCalls: true,
    emailDistributions: true,
    emailQuarterlyReports: true,
    emailAnnualReports: true,
    emailMarketUpdates: false,
    inAppCapitalCalls: true,
    inAppDistributions: true,
    inAppReports: true,
  },
  useLpNotificationPreferences: () => ({
    data: {
      emailCapitalCalls: true,
      emailDistributions: false,
      emailQuarterlyReports: true,
      emailAnnualReports: true,
      emailMarketUpdates: false,
      inAppCapitalCalls: true,
      inAppDistributions: true,
      inAppReports: true,
    },
    isLoading: false,
    error: null,
  }),
  useUpdateLpNotificationPreferences: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: false,
  }),
}));

describe('LPSettings', () => {
  it('hydrates notification preferences and saves only backend-owned notification fields', async () => {
    mutateAsyncMock.mockResolvedValue({
      preferences: {},
    });
    const user = userEvent.setup();
    render(<LPSettings />);

    expect(screen.getByText(/display preferences remain local-only/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/distributions/i)).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(mutateAsyncMock).toHaveBeenCalledWith({
      emailCapitalCalls: true,
      emailDistributions: false,
      emailQuarterlyReports: true,
      emailAnnualReports: true,
      emailMarketUpdates: false,
    });
  });
});
