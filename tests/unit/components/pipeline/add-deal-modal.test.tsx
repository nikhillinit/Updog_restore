import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddDealModal } from '@/components/pipeline/AddDealModal';

const { mockApiRequest, mockToast, mockOpenChange } = vi.hoisted(() => ({
  mockApiRequest: vi.fn(),
  mockToast: vi.fn(),
  mockOpenChange: vi.fn(),
}));

vi.mock('@/lib/queryClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queryClient')>();
  return {
    ...actual,
    apiRequest: (...args: unknown[]) => mockApiRequest(...args),
  };
});

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

async function chooseOption(label: RegExp, optionName: string) {
  const user = userEvent.setup();
  await user.click(screen.getByLabelText(label));
  await user.click(await screen.findByRole('option', { name: optionName }));
}

async function fillRequiredDealFields() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/company name/i), 'Northwind AI');
  await chooseOption(/sector/i, 'FinTech');
}

describe('AddDealModal', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    if (!Element.prototype.hasPointerCapture) {
      Object.defineProperty(Element.prototype, 'hasPointerCapture', {
        value: () => false,
        configurable: true,
      });
    }
    if (!Element.prototype.setPointerCapture) {
      Object.defineProperty(Element.prototype, 'setPointerCapture', {
        value: () => undefined,
        configurable: true,
      });
    }
    if (!Element.prototype.releasePointerCapture) {
      Object.defineProperty(Element.prototype, 'releasePointerCapture', {
        value: () => undefined,
        configurable: true,
      });
    }
    if (!Element.prototype.scrollIntoView) {
      Object.defineProperty(Element.prototype, 'scrollIntoView', {
        value: () => undefined,
        configurable: true,
      });
    }
  });

  beforeEach(() => {
    mockApiRequest.mockReset();
    mockToast.mockReset();
    mockOpenChange.mockReset();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('uses canonical taxonomy and submits comma-formatted money as dollar numbers', async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: { id: 1 } });
    renderWithQuery(<AddDealModal open={true} onOpenChange={mockOpenChange} fundId={1} />);

    await fillRequiredDealFields();
    await userEvent.type(screen.getByLabelText(/deal size/i), '1,500,000');
    await userEvent.type(screen.getByLabelText(/valuation/i), '10,000,000');
    await userEvent.click(screen.getByRole('button', { name: /add deal/i }));

    await waitFor(() =>
      expect(mockApiRequest).toHaveBeenCalledWith(
        'POST',
        '/api/deals/opportunities',
        expect.objectContaining({
          fundId: 1,
          companyName: 'Northwind AI',
          sector: 'FinTech',
          stage: 'Seed',
          dealSize: 1500000,
          valuation: 10000000,
        })
      )
    );
  });

  it('maps raw server failures to safe dialog and toast copy', async () => {
    mockApiRequest.mockRejectedValue(
      new Error('Database operation failed: SQLSTATE 23505 duplicate key value violates constraint')
    );
    renderWithQuery(<AddDealModal open={true} onOpenChange={mockOpenChange} fundId={1} />);

    await fillRequiredDealFields();
    await userEvent.click(screen.getByRole('button', { name: /add deal/i }));

    expect(
      await screen.findByText('Deal could not be created. Review the deal details and try again.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/SQLSTATE|duplicate key|constraint/i)).not.toBeInTheDocument();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Unable to add deal',
        description: 'Deal could not be created. Review the deal details and try again.',
        variant: 'destructive',
      })
    );
  });
});
