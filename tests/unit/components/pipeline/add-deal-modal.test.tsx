import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddDealModal } from '@/components/pipeline/AddDealModal';
import { ApiError } from '@/lib/queryClient';

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

const mockAuth = vi.hoisted(() => vi.fn(() => ({ data: null as { user: { id: string } } | null })));
vi.mock('@/lib/auth-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth-session')>()),
  useAuthSession: () => mockAuth(),
}));
const keyOf = (call: number) =>
  ((mockApiRequest.mock.calls[call] as unknown[])[3] as { headers: Record<string, string> })
    .headers['Idempotency-Key'];

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
  beforeEach(() => {
    sessionStorage.clear();
    mockAuth.mockReturnValue({ data: null });
  });

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
        }),
        { headers: { 'Idempotency-Key': expect.any(String) } }
      )
    );
  });

  it('maps a definite server rejection to safe dialog and toast copy', async () => {
    mockApiRequest.mockRejectedValue(
      new ApiError(
        422,
        'Database operation failed: SQLSTATE 23505 duplicate key value violates constraint'
      )
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

  it('freezes an unknown outcome, persists its key, and retries with it until success', async () => {
    mockAuth.mockReturnValue({ data: { user: { id: '7' } } });
    mockApiRequest
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue({ success: true, data: { id: 1 } });
    renderWithQuery(<AddDealModal open={true} onOpenChange={mockOpenChange} fundId={1} />);

    await fillRequiredDealFields();
    await userEvent.click(screen.getByRole('button', { name: /add deal/i }));

    expect(await screen.findByText(/creation status is uncertain/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/company name/i)).toBeDisabled();
    expect(keyOf(0)).toMatch(/^[0-9a-f-]{36}$/);
    expect(
      JSON.parse(sessionStorage.getItem('pending-create:v1:1:deal_create') ?? '{}')
    ).toMatchObject({ actorId: '7', key: keyOf(0) });

    await userEvent.click(screen.getByRole('button', { name: /retry create/i }));
    await waitFor(() => expect(mockApiRequest).toHaveBeenCalledTimes(2));
    expect(keyOf(1)).toBe(keyOf(0));
    await waitFor(() =>
      expect(sessionStorage.getItem('pending-create:v1:1:deal_create')).toBeNull()
    );

    await fillRequiredDealFields();
    await userEvent.click(screen.getByRole('button', { name: /add deal/i }));
    await waitFor(() => expect(mockApiRequest).toHaveBeenCalledTimes(3));
    expect(keyOf(2)).not.toBe(keyOf(1));
  });

  it('settles an uncertain create as already recorded on key reuse', async () => {
    mockApiRequest
      .mockRejectedValueOnce(new ApiError(503, 'unavailable'))
      .mockRejectedValueOnce(new ApiError(409, 'reuse', 'IDEMPOTENCY_KEY_REUSE'));
    renderWithQuery(<AddDealModal open={true} onOpenChange={mockOpenChange} fundId={1} />);

    await fillRequiredDealFields();
    await userEvent.click(screen.getByRole('button', { name: /add deal/i }));
    await userEvent.click(await screen.findByRole('button', { name: /retry create/i }));

    expect(await screen.findByText(/already recorded/i)).toBeInTheDocument();
    expect(keyOf(1)).toBe(keyOf(0));
    expect(screen.getByLabelText(/company name/i)).not.toBeDisabled();
  });
});
