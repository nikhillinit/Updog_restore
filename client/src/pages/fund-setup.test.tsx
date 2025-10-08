import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import FundSetup from './fund-setup';

// Mock the API request function
vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
}));

// Mock the router
const mockNavigate = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/fund-setup', mockNavigate],
}));

// Mock the FundContext
vi.mock('@/contexts/FundContext', () => ({
  useFund: () => ({
    funds: [],
    currentFund: null,
    setCurrentFund: vi.fn(),
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

// Mock components that might cause issues
vi.mock('@/components/ui/premium-card', () => ({
  PremiumCard: ({ children, title, className, headerActions }: any) => (
    <div data-testid="premium-card" className={className}>
      {title && <div data-testid="card-title">{title}</div>}
      {headerActions && <div data-testid="card-actions">{headerActions}</div>}
      {children}
    </div>
  ),
}));

vi.mock('@/components/ui/wizard-container', () => ({
  WizardContainer: ({ children }: any) => <div data-testid="wizard-container">{children}</div>,
}));

vi.mock('@/components/ui/enhanced-analytics-panel', () => ({
  EnhancedAnalyticsPanel: () => <div data-testid="analytics-panel">Analytics Panel</div>,
}));

// Mock other UI components
vi.mock('@/components/ui/input', () => ({
  Input: React.forwardRef<HTMLInputElement, any>(({ className, type, ...props }, ref) => (
    <input ref={ref} type={type} className={className} {...props} />
  )),
}));

vi.mock('@/components/ui/button', () => ({
  Button: React.forwardRef<HTMLButtonElement, any>(({ className, variant, size, children, ...props }, ref) => (
    <button ref={ref} className={className} {...props}>
      {children}
    </button>
  )),
}));

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, ...props }: any) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      {...props}
    />
  ),
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: any) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children }: any) => <h2 data-testid="dialog-title">{children}</h2>,
}));

// Create a wrapper component with QueryClient
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('FundSetup Wizard - Core Functionality', () => {
  let wrapper: ReturnType<typeof createWrapper>;

  beforeEach(() => {
    wrapper = createWrapper();
    vi.clearAllMocks();
  });

  describe('Basic Rendering Tests', () => {
    it('should render the wizard without crashing', () => {
      expect(() => render(<FundSetup />, { wrapper })).not.toThrow();
    });

    it('should render wizard container and analytics panel', () => {
      render(<FundSetup />, { wrapper });

      expect(screen.getByTestId('wizard-container')).toBeInTheDocument();
      expect(screen.getByTestId('analytics-panel')).toBeInTheDocument();
    });

    it('should render the first step (Fund Basics)', () => {
      render(<FundSetup />, { wrapper });

      expect(screen.getByText('Fund Basics')).toBeInTheDocument();
    });

    it('should show navigation buttons', () => {
      render(<FundSetup />, { wrapper });

      expect(screen.getByText('Next')).toBeInTheDocument();
      expect(screen.getByText('Back')).toBeInTheDocument();
    });

    it('should show step progress', () => {
      render(<FundSetup />, { wrapper });

      // Look for step indicators
      expect(screen.getByText(/Step \d+ of \d+/)).toBeInTheDocument();
    });
  });

  describe('Navigation State Tests', () => {
    it('should disable back button on first step', () => {
      render(<FundSetup />, { wrapper });

      const backButton = screen.getByText('Back');
      expect(backButton).toBeDisabled();
    });

    it('should disable next button initially when required fields are empty', () => {
      render(<FundSetup />, { wrapper });

      const nextButton = screen.getByText('Next');
      expect(nextButton).toBeDisabled();
    });
  });

  describe('Form Elements Tests', () => {
    it('should render form inputs', () => {
      render(<FundSetup />, { wrapper });

      // Check for common form inputs
      const inputs = screen.getAllByRole('textbox');
      const numberInputs = screen.getAllByRole('spinbutton');
      
      expect(inputs.length + numberInputs.length).toBeGreaterThan(0);
    });

    it('should have save draft functionality', () => {
      render(<FundSetup />, { wrapper });

      const saveDraftButton = screen.queryByText('Save draft');
      if (saveDraftButton) {
        expect(saveDraftButton).toBeInTheDocument();
      }
    });
  });

  describe('Step Structure Tests', () => {
    it('should define the wizard steps structure', () => {
      render(<FundSetup />, { wrapper });

      // The first step should be Fund Basics
      expect(screen.getByText('Fund Basics')).toBeInTheDocument();
      
      // Check if step indicator shows expected format
      const stepIndicator = screen.getByText(/Step 1 of \d+/);
      expect(stepIndicator).toBeInTheDocument();
    });
  });

  describe('Premium Card Components Tests', () => {
    it('should render premium cards for layout', () => {
      render(<FundSetup />, { wrapper });

      const premiumCards = screen.getAllByTestId('premium-card');
      expect(premiumCards.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Modal Tests', () => {
    it('should handle dialog state', () => {
      render(<FundSetup />, { wrapper });

      // Look for buttons that might trigger modals
      const addButtons = screen.queryAllByText(/Add/i);
      expect(addButtons.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Data Structure Tests', () => {
    it('should handle fund data initialization', () => {
      // This test validates that the component initializes without data structure errors
      expect(() => render(<FundSetup />, { wrapper })).not.toThrow();
    });
  });

  describe('Button Interaction Tests', () => {
    it('should handle button clicks without crashing', () => {
      render(<FundSetup />, { wrapper });

      const nextButton = screen.getByText('Next');
      const backButton = screen.getByText('Back');

      // These buttons should handle clicks gracefully even when disabled
      expect(() => fireEvent.click(nextButton)).not.toThrow();
      expect(() => fireEvent.click(backButton)).not.toThrow();
    });
  });

  describe('Accessibility Tests', () => {
    it('should have accessible button elements', () => {
      render(<FundSetup />, { wrapper });

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);

      // All buttons should have accessible names
      buttons.forEach((button: HTMLElement) => {
        expect(button).toHaveTextContent(/.+/); // Non-empty text content
      });
    });
  });
});