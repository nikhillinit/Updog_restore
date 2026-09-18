import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import Sidebar from '../layout/sidebar';

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({
    currentFund: { id: 1, name: 'Test Fund', size: 20_000_000 },
    needsSetup: false,
  }),
}));

vi.mock('wouter', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  useLocation: () => ['/dashboard', vi.fn()],
}));

describe('Sidebar', () => {
  it('renders current navigation contract', () => {
    render(<Sidebar activeModule="dashboard" />);

    expect(screen.getAllByRole('link')).toHaveLength(11);
    for (const label of [
      'Dashboard',
      'Portfolio',
      'Pipeline',
      'Performance',
      'Forecasting',
      'Model Results',
      'Sensitivity Analysis',
      'Variance Tracking',
      'Reports',
      'Settings',
      'Help',
    ]) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('builds fund-aware model and forecasting links', () => {
    render(<Sidebar activeModule="model-results" />);

    expect(screen.getByRole('link', { name: 'Model Results' })).toHaveAttribute(
      'href',
      '/fund-model-results/1'
    );
    expect(screen.getByRole('link', { name: 'Forecasting' })).toHaveAttribute(
      'href',
      '/forecasting?fundId=1'
    );
  });
});
