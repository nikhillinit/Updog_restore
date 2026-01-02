/**
 * Unit tests for EditAllocationDialog component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EditAllocationDialog } from '../EditAllocationDialog';
import type { AllocationCompany } from '../types';

// Mock dependencies
vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({ fundId: 1 }),
}));

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

const mockCompany: AllocationCompany = {
  company_id: 1,
  company_name: 'TechCorp',
  sector: 'FinTech',
  stage: 'Series A',
  status: 'active',
  invested_amount_cents: 100000000, // $1M
  deployed_reserves_cents: 50000000, // $500K
  planned_reserves_cents: 150000000, // $1.5M
  allocation_cap_cents: 300000000, // $3M
  allocation_reason: 'Strong growth trajectory',
  allocation_version: 1,
  last_allocation_at: '2024-01-01T00:00:00Z',
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe('EditAllocationDialog', () => {
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi['clearAllMocks']();
    global.fetch = vi.fn();
  });

  it('renders dialog when open', () => {
    renderWithQuery(
      <EditAllocationDialog
        company={mockCompany}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    expect(screen.getByText(/edit allocation - techcorp/i)).toBeTruthy();
  });

  it('does not render when closed', () => {
    renderWithQuery(
      <EditAllocationDialog
        company={mockCompany}
        open={false}
        onOpenChange={mockOnOpenChange}
      />
    );

    expect(screen.queryByText(/edit allocation/i)).toBeFalsy();
  });

  it('displays company information', () => {
    renderWithQuery(
      <EditAllocationDialog
        company={mockCompany}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    expect(screen.getByText('FinTech')).toBeTruthy();
    expect(screen.getByText('Series A')).toBeTruthy();
  });

  it('pre-fills form with company data', () => {
    renderWithQuery(
      <EditAllocationDialog
        company={mockCompany}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    const plannedReservesInput = screen.getByLabelText(/planned reserves/i);
    expect(plannedReservesInput).toHaveValue(1500000); // $1.5M in dollars

    const allocationCapInput = screen.getByLabelText(/allocation cap/i);
    expect(allocationCapInput).toHaveValue(3000000); // $3M in dollars

    const reasonTextarea = screen.getByLabelText(/allocation reason/i);
    expect(reasonTextarea).toHaveValue('Strong growth trajectory');
  });

  it('validates planned reserves is non-negative', async () => {
    const user = userEvent.setup();

    renderWithQuery(
      <EditAllocationDialog
        company={mockCompany}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    const plannedReservesInput = screen.getByLabelText(/planned reserves/i);
    await user.clear(plannedReservesInput);
    await user.type(plannedReservesInput, '-100');

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/must be a non-negative number/i)).toBeTruthy();
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('validates allocation cap is greater than or equal to planned reserves', async () => {
    const user = userEvent.setup();

    renderWithQuery(
      <EditAllocationDialog
        company={mockCompany}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    const plannedReservesInput = screen.getByLabelText(/planned reserves/i);
    await user.clear(plannedReservesInput);
    await user.type(plannedReservesInput, '2000000');

    const allocationCapInput = screen.getByLabelText(/allocation cap/i);
    await user.clear(allocationCapInput);
    await user.type(allocationCapInput, '1000000');

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/must be greater than or equal to planned reserves/i)).toBeTruthy();
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('submits form with valid data', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    renderWithQuery(
      <EditAllocationDialog
        company={mockCompany}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    const plannedReservesInput = screen.getByLabelText(/planned reserves/i);
    await user.clear(plannedReservesInput);
    await user.type(plannedReservesInput, '2000000');

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/funds/1/allocations',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('200000000'), // $2M in cents
        })
      );
    });

    expect(mockToast).toHaveBeenCalledWith({
      title: 'Success',
      description: 'Allocation updated successfully',
    });

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('handles optimistic locking conflict (409)', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ message: 'Version conflict' }),
    });

    renderWithQuery(
      <EditAllocationDialog
        company={mockCompany}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Error',
          variant: 'destructive',
        })
      );
    });
  });

  it('allows clearing allocation cap', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    renderWithQuery(
      <EditAllocationDialog
        company={mockCompany}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    const allocationCapInput = screen.getByLabelText(/allocation cap/i);
    await user.clear(allocationCapInput);

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/funds/1/allocations',
        expect.objectContaining({
          body: expect.stringContaining('"allocation_cap_cents":null'),
        })
      );
    });
  });

  it('tracks character count for allocation reason', async () => {
    const user = userEvent.setup();

    renderWithQuery(
      <EditAllocationDialog
        company={mockCompany}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    const reasonTextarea = screen.getByLabelText(/allocation reason/i);
    await user.clear(reasonTextarea);
    await user.type(reasonTextarea, 'Test reason');

    expect(screen.getByText('11/500 characters')).toBeTruthy();
  });
});
