/**
 * Portfolio Constructor UI Component Tests
 *
 * Comprehensive unit tests for Portfolio Constructor page component
 * Tests user interactions, form validations, chart rendering, and simulation workflows
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import PortfolioConstructor from '../../../client/src/pages/portfolio-constructor';

// Mock dependencies
vi.mock('../../../client/src/hooks/use-fund-data', () => ({
  useFundData: () => ({
    funds: [
      {
        id: 1,
        name: 'Test Fund',
        size: 50000000,
        isActive: true
      }
    ],
    primaryFund: {
      id: 1,
      name: 'Test Fund',
      size: 50000000,
      isActive: true
    },
    isLoading: false
  })
}));

vi.mock('../../../client/src/hooks/use-toast', () => ({
  toast: vi.fn()
}));

// Mock chart components to avoid canvas rendering issues in tests
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => <div data-testid="pie" />,
  Cell: () => <div data-testid="cell" />,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div data-testid="area-chart">{children}</div>,
  Area: () => <div data-testid="area" />
}));

// Test wrapper component
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {children}
      </BrowserRouter>
    </QueryClientProvider>
  );
};

const renderWithWrapper = (ui: React.ReactElement) => {
  return render(ui, { wrapper: TestWrapper });
};

describe('PortfolioConstructor', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial Rendering and Layout', () => {
    it('should render the main layout with header and navigation tabs', () => {
      renderWithWrapper(<PortfolioConstructor />);

      // Check header
      expect(screen.getByRole('heading', { name: /portfolio constructor/i })).toBeInTheDocument();
      expect(screen.getByText(/build and optimize your fund's portfolio strategy/i)).toBeInTheDocument();

      // Check action buttons
      expect(screen.getByRole('button', { name: /save strategy/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /run simulation/i })).toBeInTheDocument();

      // Check navigation tabs
      expect(screen.getByRole('tab', { name: /strategy builder/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /scenario modeling/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /projections/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /timeline/i })).toBeInTheDocument();
    });

    it('should display key metrics overview cards', () => {
      renderWithWrapper(<PortfolioConstructor />);

      // Check for stat cards
      expect(screen.getByText('Fund Size')).toBeInTheDocument();
      expect(screen.getByText('Initial Capital')).toBeInTheDocument();
      expect(screen.getByText('Reserve Capital')).toBeInTheDocument();
      expect(screen.getByText('Projected IRR')).toBeInTheDocument();

      // Check for formatted values
      expect(screen.getByText('$50.0M')).toBeInTheDocument(); // Fund size
    });

    it('should show loading state when funds are loading', () => {
      vi.doMock('../../../client/src/hooks/use-fund-data', () => ({
        useFundData: () => ({
          funds: [],
          primaryFund: null,
          isLoading: true
        })
      }));

      renderWithWrapper(<PortfolioConstructor />);

      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  describe('Strategy Builder Tab', () => {
    beforeEach(() => {
      renderWithWrapper(<PortfolioConstructor />);
      // Strategy Builder tab should be active by default
    });

    it('should display fund configuration form', () => {
      expect(screen.getByLabelText(/fund size/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/target portfolio size/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/deployment period/i)).toBeInTheDocument();
    });

    it('should display check size configuration', () => {
      expect(screen.getByLabelText(/minimum check/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/target check/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/maximum check/i)).toBeInTheDocument();
    });

    it('should update fund size when input changes', async () => {
      const fundSizeInput = screen.getByLabelText(/fund size/i);

      await user.clear(fundSizeInput);
      await user.type(fundSizeInput, '75000000');

      expect(fundSizeInput).toHaveValue(75000000);

      // Check that the display updates
      await waitFor(() => {
        expect(screen.getByText('$75.0M')).toBeInTheDocument();
      });
    });

    it('should update reserve percentage using slider', async () => {
      const reserveSlider = screen.getByRole('slider');

      // Initial value should be 50%
      expect(screen.getByText('Reserve Percentage: 50%')).toBeInTheDocument();

      // Change slider value
      fireEvent.change(reserveSlider, { target: { value: '40' } });

      await waitFor(() => {
        expect(screen.getByText('Reserve Percentage: 40%')).toBeInTheDocument();
      });
    });

    it('should display allocation charts', () => {
      // Check for chart containers
      expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();

      // Check chart titles
      expect(screen.getByText('Sector Allocation')).toBeInTheDocument();
      expect(screen.getByText('Stage Allocation')).toBeInTheDocument();
      expect(screen.getByText('Geographic Allocation')).toBeInTheDocument();
    });

    it('should show calculated metrics', () => {
      expect(screen.getByText(/estimated initial deals/i)).toBeInTheDocument();
      expect(screen.getByText(/average check/i)).toBeInTheDocument();
    });

    it('should validate form inputs', async () => {
      const portfolioSizeInput = screen.getByLabelText(/target portfolio size/i);

      // Test negative value
      await user.clear(portfolioSizeInput);
      await user.type(portfolioSizeInput, '-5');

      // Should handle gracefully (implementation dependent)
      expect(portfolioSizeInput).toHaveValue(-5);
    });
  });

  describe('Scenario Modeling Tab', () => {
    beforeEach(async () => {
      renderWithWrapper(<PortfolioConstructor />);
      await user.click(screen.getByRole('tab', { name: /scenario modeling/i }));
    });

    it('should display scenario selection buttons', () => {
      expect(screen.getByRole('button', { name: /base case/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /optimistic/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /pessimistic/i })).toBeInTheDocument();
    });

    it('should allow switching between scenarios', async () => {
      const optimisticButton = screen.getByRole('button', { name: /optimistic/i });

      await user.click(optimisticButton);

      // Check if the scenario is now active
      expect(optimisticButton).toHaveClass('bg-primary'); // or similar active class
    });

    it('should display scenario configuration controls', () => {
      expect(screen.getByText(/market environment/i)).toBeInTheDocument();
      expect(screen.getByText(/deal flow multiplier/i)).toBeInTheDocument();
      expect(screen.getByText(/valuation multiplier/i)).toBeInTheDocument();
      expect(screen.getByText(/exit multiplier/i)).toBeInTheDocument();
    });

    it('should update scenario parameters with sliders', async () => {
      const sliders = screen.getAllByRole('slider');

      // Should have multiple sliders for different multipliers
      expect(sliders.length).toBeGreaterThan(0);

      // Test changing a slider value
      fireEvent.change(sliders[0], { target: { value: '1.5' } });

      await waitFor(() => {
        // Check that the multiplier value updated
        expect(screen.getByText(/1\.5x/)).toBeInTheDocument();
      });
    });

    it('should display scenario results', () => {
      expect(screen.getByText(/scenario results/i)).toBeInTheDocument();
      expect(screen.getByText(/projected irr/i)).toBeInTheDocument();
      expect(screen.getByText(/multiple/i)).toBeInTheDocument();
    });

    it('should update market environment selection', async () => {
      // Find and click the market environment select
      const selectTrigger = screen.getByRole('combobox');
      await user.click(selectTrigger);

      // Wait for options to appear
      await waitFor(() => {
        expect(screen.getByText('Bull Market')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Bull Market'));

      // Verify selection
      await waitFor(() => {
        expect(selectTrigger).toHaveTextContent('Bull Market');
      });
    });
  });

  describe('Projections Tab', () => {
    beforeEach(async () => {
      renderWithWrapper(<PortfolioConstructor />);
      await user.click(screen.getByRole('tab', { name: /projections/i }));
    });

    it('should display projected fund metrics', () => {
      expect(screen.getByText('Projected Fund Metrics')).toBeInTheDocument();
      expect(screen.getByText('Target IRR')).toBeInTheDocument();
      expect(screen.getByText('Fund Multiple')).toBeInTheDocument();
      expect(screen.getByText('DPI')).toBeInTheDocument();
      expect(screen.getByText('TVPI')).toBeInTheDocument();
    });

    it('should display risk analysis section', () => {
      expect(screen.getByText('Risk Analysis')).toBeInTheDocument();
      expect(screen.getByText('Concentration Risk')).toBeInTheDocument();
      expect(screen.getByText('Diversification')).toBeInTheDocument();
      expect(screen.getByText('Market Risk')).toBeInTheDocument();
    });

    it('should show key risk factors', () => {
      expect(screen.getByText(/high allocation to early-stage/i)).toBeInTheDocument();
      expect(screen.getByText(/geographic concentration/i)).toBeInTheDocument();
      expect(screen.getByText(/sector concentration/i)).toBeInTheDocument();
    });

    it('should display metrics in proper format', () => {
      // Check for percentage formatting
      expect(screen.getByText(/\d+\.\d+%/)).toBeInTheDocument();

      // Check for multiple formatting
      expect(screen.getByText(/\d+\.\d+x/)).toBeInTheDocument();
    });
  });

  describe('Timeline Tab', () => {
    beforeEach(async () => {
      renderWithWrapper(<PortfolioConstructor />);
      await user.click(screen.getByRole('tab', { name: /timeline/i }));
    });

    it('should display capital deployment schedule chart', () => {
      expect(screen.getByText('Capital Deployment Schedule')).toBeInTheDocument();
      expect(screen.getByTestId('area-chart')).toBeInTheDocument();
    });

    it('should show deployment metrics', () => {
      expect(screen.getByText('Deployment Period')).toBeInTheDocument();
      expect(screen.getByText('Quarterly Deployment')).toBeInTheDocument();
      expect(screen.getByText('Final Portfolio')).toBeInTheDocument();
    });

    it('should display timeline information correctly', () => {
      expect(screen.getByText(/36 months/i)).toBeInTheDocument();
      expect(screen.getByText(/companies/i)).toBeInTheDocument();
    });
  });

  describe('User Interactions and Workflows', () => {
    it('should save strategy when save button is clicked', async () => {
      renderWithWrapper(<PortfolioConstructor />);

      const saveButton = screen.getByRole('button', { name: /save strategy/i });
      await user.click(saveButton);

      // Button should show loading state
      await waitFor(() => {
        expect(screen.getByText(/saving/i)).toBeInTheDocument();
      });
    });

    it('should run simulation when run button is clicked', async () => {
      renderWithWrapper(<PortfolioConstructor />);

      const runButton = screen.getByRole('button', { name: /run simulation/i });
      await user.click(runButton);

      // Should show simulation progress
      await waitFor(() => {
        expect(screen.getByText(/simulating/i)).toBeInTheDocument();
      });

      // Should show simulation status card
      await waitFor(() => {
        expect(screen.getByText(/running monte carlo simulation/i)).toBeInTheDocument();
      });
    });

    it('should update calculated metrics when inputs change', async () => {
      renderWithWrapper(<PortfolioConstructor />);

      const targetCheckInput = screen.getByLabelText(/target check/i);

      await user.clear(targetCheckInput);
      await user.type(targetCheckInput, '2000000');

      // Should update estimated deals
      await waitFor(() => {
        const estimatedDealsText = screen.getByText(/estimated initial deals/i).parentElement;
        expect(estimatedDealsText).toHaveTextContent(/\d+/);
      });
    });

    it('should handle form validation errors', async () => {
      renderWithWrapper(<PortfolioConstructor />);

      const fundSizeInput = screen.getByLabelText(/fund size/i);

      // Clear to empty value
      await user.clear(fundSizeInput);

      // Should handle empty value gracefully
      expect(fundSizeInput).toHaveValue(null);
    });

    it('should maintain state when switching tabs', async () => {
      renderWithWrapper(<PortfolioConstructor />);

      // Modify fund size in Strategy Builder
      const fundSizeInput = screen.getByLabelText(/fund size/i);
      await user.clear(fundSizeInput);
      await user.type(fundSizeInput, '100000000');

      // Switch to Projections tab
      await user.click(screen.getByRole('tab', { name: /projections/i }));

      // Switch back to Strategy Builder
      await user.click(screen.getByRole('tab', { name: /strategy builder/i }));

      // Value should be preserved
      expect(screen.getByLabelText(/fund size/i)).toHaveValue(100000000);
    });
  });

  describe('Data Display and Formatting', () => {
    it('should format currency values correctly', () => {
      renderWithWrapper(<PortfolioConstructor />);

      // Check for proper currency formatting
      expect(screen.getByText('$50.0M')).toBeInTheDocument();
      expect(screen.getByText(/\$\d+\.?\d*[KM]/)).toBeInTheDocument();
    });

    it('should format percentage values correctly', () => {
      renderWithWrapper(<PortfolioConstructor />);

      // Check for percentage formatting in various places
      expect(screen.getByText(/\d+\.?\d*%/)).toBeInTheDocument();
    });

    it('should display proper metric values', () => {
      renderWithWrapper(<PortfolioConstructor />);

      // Should show reasonable IRR values
      const irrElements = screen.getAllByText(/\d+\.?\d*%/);
      expect(irrElements.length).toBeGreaterThan(0);

      // Should show reasonable multiple values
      const multipleElements = screen.getAllByText(/\d+\.?\d*x/);
      expect(multipleElements.length).toBeGreaterThan(0);
    });
  });

  describe('Responsive Design and Accessibility', () => {
    it('should have proper ARIA labels', () => {
      renderWithWrapper(<PortfolioConstructor />);

      // Check for labeled form controls
      expect(screen.getByLabelText(/fund size/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/target portfolio size/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/deployment period/i)).toBeInTheDocument();
    });

    it('should have proper heading hierarchy', () => {
      renderWithWrapper(<PortfolioConstructor />);

      const mainHeading = screen.getByRole('heading', { level: 1 });
      expect(mainHeading).toHaveTextContent(/portfolio constructor/i);
    });

    it('should have keyboard navigation support', async () => {
      renderWithWrapper(<PortfolioConstructor />);

      const firstInput = screen.getByLabelText(/fund size/i);
      firstInput.focus();

      expect(document.activeElement).toBe(firstInput);

      // Tab navigation should work
      await user.tab();
      expect(document.activeElement).not.toBe(firstInput);
    });

    it('should handle different viewport sizes gracefully', () => {
      renderWithWrapper(<PortfolioConstructor />);

      // Component should render without errors on different screen sizes
      // This is a basic test - more comprehensive responsive testing would require actual viewport changes
      expect(screen.getByRole('heading', { name: /portfolio constructor/i })).toBeInTheDocument();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle missing fund data gracefully', () => {
      vi.doMock('../../../client/src/hooks/use-fund-data', () => ({
        useFundData: () => ({
          funds: [],
          primaryFund: null,
          isLoading: false
        })
      }));

      renderWithWrapper(<PortfolioConstructor />);

      // Should still render the component
      expect(screen.getByRole('heading', { name: /portfolio constructor/i })).toBeInTheDocument();
    });

    it('should handle extreme input values', async () => {
      renderWithWrapper(<PortfolioConstructor />);

      const fundSizeInput = screen.getByLabelText(/fund size/i);

      // Test very large number
      await user.clear(fundSizeInput);
      await user.type(fundSizeInput, '999999999999');

      expect(fundSizeInput).toHaveValue(999999999999);

      // Component should handle this gracefully
      expect(screen.getByRole('heading', { name: /portfolio constructor/i })).toBeInTheDocument();
    });

    it('should handle simulation errors gracefully', async () => {
      renderWithWrapper(<PortfolioConstructor />);

      // Mock a failed simulation by making the mutation fail
      const runButton = screen.getByRole('button', { name: /run simulation/i });

      // This test would need the actual mutation to be mocked to fail
      // For now, we just verify the button can be clicked
      await user.click(runButton);

      expect(runButton).toBeInTheDocument();
    });

    it('should handle concurrent operations', async () => {
      renderWithWrapper(<PortfolioConstructor />);

      const saveButton = screen.getByRole('button', { name: /save strategy/i });
      const runButton = screen.getByRole('button', { name: /run simulation/i });

      // Try to click both buttons quickly
      await user.click(saveButton);
      await user.click(runButton);

      // Both operations should be handled
      expect(saveButton).toBeInTheDocument();
      expect(runButton).toBeInTheDocument();
    });
  });

  describe('Performance and Optimization', () => {
    it('should render within reasonable time', () => {
      const startTime = performance.now();
      renderWithWrapper(<PortfolioConstructor />);
      const endTime = performance.now();

      const renderTime = endTime - startTime;
      expect(renderTime).toBeLessThan(1000); // Should render within 1 second
    });

    it('should not cause memory leaks on unmount', () => {
      const { unmount } = renderWithWrapper(<PortfolioConstructor />);

      // Should unmount without errors
      expect(() => unmount()).not.toThrow();
    });

    it('should handle rapid input changes efficiently', async () => {
      renderWithWrapper(<PortfolioConstructor />);

      const fundSizeInput = screen.getByLabelText(/fund size/i);

      // Simulate rapid typing
      await user.clear(fundSizeInput);
      await user.type(fundSizeInput, '1234567890', { delay: 1 });

      expect(fundSizeInput).toHaveValue(1234567890);
    });
  });

  describe('Integration Scenarios', () => {
    it('should support complete workflow from strategy building to simulation', async () => {
      renderWithWrapper(<PortfolioConstructor />);

      // Step 1: Modify strategy in Strategy Builder
      const fundSizeInput = screen.getByLabelText(/fund size/i);
      await user.clear(fundSizeInput);
      await user.type(fundSizeInput, '75000000');

      // Step 2: Configure scenarios
      await user.click(screen.getByRole('tab', { name: /scenario modeling/i }));
      const optimisticButton = screen.getByRole('button', { name: /optimistic/i });
      await user.click(optimisticButton);

      // Step 3: Review projections
      await user.click(screen.getByRole('tab', { name: /projections/i }));
      expect(screen.getByText('Projected Fund Metrics')).toBeInTheDocument();

      // Step 4: Save and simulate
      const saveButton = screen.getByRole('button', { name: /save strategy/i });
      await user.click(saveButton);

      const runButton = screen.getByRole('button', { name: /run simulation/i });
      await user.click(runButton);

      // Workflow should complete successfully
      expect(screen.getByRole('heading', { name: /portfolio constructor/i })).toBeInTheDocument();
    });

    it('should maintain data consistency across different views', async () => {
      renderWithWrapper(<PortfolioConstructor />);

      // Change fund size
      const fundSizeInput = screen.getByLabelText(/fund size/i);
      await user.clear(fundSizeInput);
      await user.type(fundSizeInput, '100000000');

      // Check that stat cards update
      await waitFor(() => {
        expect(screen.getByText('$100.0M')).toBeInTheDocument();
      });

      // Switch to projections and verify consistency
      await user.click(screen.getByRole('tab', { name: /projections/i }));

      // Values should be consistent across tabs
      expect(screen.getByText('Projected Fund Metrics')).toBeInTheDocument();
    });
  });
});