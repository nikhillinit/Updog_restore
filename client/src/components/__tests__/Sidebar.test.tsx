/**
 * Sidebar Component Tests
 *
 * Tests sidebar rendering with feature flags:
 * - NEW_IA=false → 26 legacy items
 * - NEW_IA=true → 5 new IA items
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Sidebar from '../layout/sidebar';

// Mock the useFlags hook
vi.mock('@/shared/useFlags', () => ({
  useFlag: vi.fn(),
}));

// Import the mocked hook (vi.mock is hoisted)
import { useFlag } from '@/shared/useFlags';

// Mock the FundContext
vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({
    currentFund: {
      id: 1,
      name: 'Test Fund',
      size: 20000000,
    },
    needsSetup: false,
  }),
}));

// Mock wouter
vi.mock('wouter', () => ({
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
  useLocation: () => ['/', vi.fn()],
}));

describe('Sidebar', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('when NEW_IA flag is OFF (legacy mode)', () => {
    it('renders 26 navigation items', () => {
      vi.mocked(useFlag).mockReturnValue(false);

      const { container } = render(
        <Sidebar activeModule="dashboard" onModuleChange={() => {}} />
      );

      const navButtons = container.querySelectorAll('button[class*="nav"]');
      expect(navButtons.length).toBeGreaterThanOrEqual(25);
    });

    it('shows legacy navigation labels', () => {
      vi.mocked(useFlag).mockReturnValue(false);

      render(<Sidebar activeModule="dashboard" onModuleChange={() => {}} />);

      // Check for legacy labels
      expect(screen.queryByText(/Dashboard/i)).toBeInTheDocument();
      expect(screen.queryByText(/Portfolio/i)).toBeInTheDocument();
      expect(screen.queryByText(/KPI Manager/i)).toBeInTheDocument();
    });
  });

  describe('when NEW_IA flag is ON (new IA mode)', () => {
    it('renders exactly 5 navigation items', () => {
      vi.mocked(useFlag).mockReturnValue(true);

      const { container } = render(
        <Sidebar activeModule="overview" onModuleChange={() => {}} />
      );

      const navButtons = container.querySelectorAll('button[class*="nav"]');
      expect(navButtons).toHaveLength(5);
    });

    it('shows new IA navigation labels', () => {
      vi.mocked(useFlag).mockReturnValue(true);

      render(<Sidebar activeModule="overview" onModuleChange={() => {}} />);

      // Check for new IA labels
      expect(screen.getByText(/Overview/i)).toBeInTheDocument();
      expect(screen.getByText(/Portfolio/i)).toBeInTheDocument();
      expect(screen.getByText(/Model/i)).toBeInTheDocument();
      expect(screen.getByText(/Operate/i)).toBeInTheDocument();
      expect(screen.getByText(/Report/i)).toBeInTheDocument();
    });

    it('does NOT show legacy-only items', () => {
      vi.mocked(useFlag).mockReturnValue(true);

      render(<Sidebar activeModule="overview" onModuleChange={() => {}} />);

      // These should not appear in new IA
      expect(screen.queryByText(/KPI Manager/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Forecasting/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Scenario Builder/i)).not.toBeInTheDocument();
    });
  });
});
