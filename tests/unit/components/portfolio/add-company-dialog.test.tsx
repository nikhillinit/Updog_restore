import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddCompanyDialog } from '@/components/portfolio/tabs/AddCompanyDialog';
import { ApiError } from '@/lib/queryClient';

const { mockApiRequest, mockToast, mockOpenChange, mockInvalidatePortfolioData } = vi.hoisted(
  () => ({
    mockApiRequest: vi.fn(),
    mockToast: vi.fn(),
    mockOpenChange: vi.fn(),
    mockInvalidatePortfolioData: vi.fn(),
  })
);

vi.mock('@/lib/queryClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queryClient')>();
  return {
    ...actual,
    apiRequest: (...args: unknown[]) => mockApiRequest(...args),
  };
});

vi.mock('@/lib/invalidate-portfolio-data', () => ({
  invalidatePortfolioData: (...args: unknown[]) => mockInvalidatePortfolioData(...args),
}));

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

// Pass-through unless a test queues a digest to hold the hashing window open.
const mockSha256Hash = vi.hoisted(() => vi.fn<(payload: unknown) => Promise<string> | undefined>());

vi.mock('@/lib/hash', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/hash')>();
  return {
    ...actual,
    sha256Hash: (payload: unknown) => mockSha256Hash(payload) ?? actual.sha256Hash(payload),
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

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

async function fillRequiredCompanyFields() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/company name/i), 'Northwind AI');
  await chooseOption(/sector/i, 'AI / ML');
  await user.type(screen.getByLabelText(/initial investment/i), '1,500,000');
}

describe('AddCompanyDialog', () => {
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
    mockSha256Hash.mockReset();
    mockToast.mockReset();
    mockOpenChange.mockReset();
    mockInvalidatePortfolioData.mockReset();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('uses canonical sector options and submits normalized dollar strings', async () => {
    mockApiRequest.mockResolvedValue({ id: 1 });
    renderWithQuery(<AddCompanyDialog fundId={1} open={true} onOpenChange={mockOpenChange} />);

    await fillRequiredCompanyFields();
    await userEvent.click(screen.getByRole('button', { name: /create company/i }));

    await waitFor(() =>
      expect(mockApiRequest).toHaveBeenCalledWith(
        'POST',
        '/api/portfolio-companies',
        {
          fundId: 1,
          name: 'Northwind AI',
          sector: 'AI / ML',
          stage: 'Seed',
          currentStage: 'Seed',
          investmentAmount: '1500000',
        },
        { headers: { 'Idempotency-Key': expect.any(String) } }
      )
    );
  });

  it('invalidates portfolio data (including the server overview) after a successful create', async () => {
    mockApiRequest.mockResolvedValue({ id: 1 });
    renderWithQuery(<AddCompanyDialog fundId={7} open={true} onOpenChange={mockOpenChange} />);

    await fillRequiredCompanyFields();
    await userEvent.click(screen.getByRole('button', { name: /create company/i }));

    await waitFor(() =>
      expect(mockInvalidatePortfolioData).toHaveBeenCalledWith(expect.anything(), 7)
    );
  });

  it('maps a definite server rejection to safe dialog and toast copy', async () => {
    mockApiRequest.mockRejectedValue(
      new ApiError(422, 'Database operation failed: relation "portfoliocompanies" does not exist')
    );
    renderWithQuery(<AddCompanyDialog fundId={1} open={true} onOpenChange={mockOpenChange} />);

    await fillRequiredCompanyFields();
    await userEvent.click(screen.getByRole('button', { name: /create company/i }));

    expect(
      await screen.findByText(
        'Company could not be created. Review the company details and try again.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/relation "portfoliocompanies"/i)).not.toBeInTheDocument();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Unable to add company',
        description: 'Company could not be created. Review the company details and try again.',
        variant: 'destructive',
      })
    );
  });

  it('freezes an unknown outcome, persists its key, and retries with it until success', async () => {
    mockAuth.mockReturnValue({ data: { user: { id: '7' } } });
    mockApiRequest
      .mockRejectedValueOnce(new ApiError(502, 'bad gateway'))
      .mockResolvedValue({ id: 1 });
    renderWithQuery(<AddCompanyDialog fundId={1} open={true} onOpenChange={mockOpenChange} />);

    await fillRequiredCompanyFields();
    await userEvent.click(screen.getByRole('button', { name: /create company/i }));

    expect(await screen.findByText(/creation status is uncertain/i)).toBeInTheDocument();
    expect(
      JSON.parse(sessionStorage.getItem('pending-create:v1:1:company_create') ?? '{}')
    ).toMatchObject({ actorId: '7', key: keyOf(0) });

    await userEvent.click(screen.getByRole('button', { name: /retry create/i }));
    await waitFor(() => expect(mockApiRequest).toHaveBeenCalledTimes(2));
    expect(keyOf(1)).toBe(keyOf(0));
    await waitFor(() =>
      expect(sessionStorage.getItem('pending-create:v1:1:company_create')).toBeNull()
    );
  });

  it('retries an uncertain create under its original fund and key after the page fund changes', async () => {
    mockAuth.mockReturnValue({ data: { user: { id: '7' } } });
    mockApiRequest
      .mockRejectedValueOnce(new ApiError(502, 'bad gateway'))
      .mockResolvedValue({ id: 1 });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const view = (fundId: number, open: boolean) => (
      <QueryClientProvider client={queryClient}>
        <AddCompanyDialog fundId={fundId} open={open} onOpenChange={mockOpenChange} />
      </QueryClientProvider>
    );
    const { rerender } = render(view(1, true));

    await fillRequiredCompanyFields();
    await userEvent.click(screen.getByRole('button', { name: /create company/i }));
    expect(await screen.findByText(/creation status is uncertain/i)).toBeInTheDocument();

    rerender(view(2, false));
    rerender(view(2, true));
    await userEvent.click(await screen.findByRole('button', { name: /retry create/i }));

    await waitFor(() => expect(mockApiRequest).toHaveBeenCalledTimes(2));
    expect(keyOf(1)).toBe(keyOf(0));
    expect((mockApiRequest.mock.calls[1] as unknown[])[2]).toMatchObject({ fundId: 1 });
    await waitFor(() =>
      expect(sessionStorage.getItem('pending-create:v1:1:company_create')).toBeNull()
    );
    expect(sessionStorage.getItem('pending-create:v1:2:company_create')).toBeNull();
    expect(mockInvalidatePortfolioData).toHaveBeenLastCalledWith(expect.anything(), 1);
  });

  it('keys a create under its submitted fund when the fund changes while hashing', async () => {
    mockAuth.mockReturnValue({ data: { user: { id: '7' } } });
    const firstDigest = deferred<string>();
    mockSha256Hash
      .mockImplementationOnce(() => firstDigest.promise)
      .mockResolvedValueOnce('digest-a');
    mockApiRequest
      .mockRejectedValueOnce(new ApiError(502, 'bad gateway'))
      .mockResolvedValue({ id: 1 });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const view = (fundId: number) => (
      <QueryClientProvider client={queryClient}>
        <AddCompanyDialog fundId={fundId} open={true} onOpenChange={mockOpenChange} />
      </QueryClientProvider>
    );
    const { rerender } = render(view(1));

    await fillRequiredCompanyFields();
    await userEvent.click(screen.getByRole('button', { name: /create company/i }));
    await waitFor(() => expect(mockSha256Hash).toHaveBeenCalledTimes(1));
    rerender(view(2));
    firstDigest.resolve('digest-a');

    expect(await screen.findByText(/creation status is uncertain/i)).toBeInTheDocument();
    expect((mockApiRequest.mock.calls[0] as unknown[])[2]).toMatchObject({ fundId: 1 });
    expect(
      JSON.parse(sessionStorage.getItem('pending-create:v1:1:company_create') ?? '{}')
    ).toMatchObject({ key: keyOf(0) });
    expect(sessionStorage.getItem('pending-create:v1:2:company_create')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /retry create/i }));
    await waitFor(() => expect(mockApiRequest).toHaveBeenCalledTimes(2));
    expect(keyOf(1)).toBe(keyOf(0));
    expect((mockApiRequest.mock.calls[1] as unknown[])[2]).toMatchObject({ fundId: 1 });
  });

  it('retries with the in-memory key after a fund change when storage writes fail', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    try {
      mockAuth.mockReturnValue({ data: { user: { id: '7' } } });
      const firstRequest = deferred<never>();
      mockApiRequest
        .mockImplementationOnce(() => firstRequest.promise)
        .mockResolvedValue({ id: 1 });
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      const view = (fundId: number) => (
        <QueryClientProvider client={queryClient}>
          <AddCompanyDialog fundId={fundId} open={true} onOpenChange={mockOpenChange} />
        </QueryClientProvider>
      );
      const { rerender } = render(view(1));

      await fillRequiredCompanyFields();
      await userEvent.click(screen.getByRole('button', { name: /create company/i }));
      await waitFor(() => expect(mockApiRequest).toHaveBeenCalledTimes(1));
      rerender(view(2));
      firstRequest.reject(new TypeError('Failed to fetch'));

      expect(await screen.findByText(/creation status is uncertain/i)).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: /retry create/i }));
      await waitFor(() => expect(mockApiRequest).toHaveBeenCalledTimes(2));
      expect(keyOf(1)).toBe(keyOf(0));
      expect((mockApiRequest.mock.calls[1] as unknown[])[2]).toMatchObject({ fundId: 1 });
    } finally {
      setItem.mockRestore();
    }
  });

  it('settles an uncertain create as already recorded on key reuse', async () => {
    mockApiRequest
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new ApiError(409, 'reuse', 'IDEMPOTENCY_KEY_REUSE'));
    renderWithQuery(<AddCompanyDialog fundId={1} open={true} onOpenChange={mockOpenChange} />);

    await fillRequiredCompanyFields();
    await userEvent.click(screen.getByRole('button', { name: /create company/i }));
    await userEvent.click(await screen.findByRole('button', { name: /retry create/i }));

    expect(await screen.findByText(/already recorded/i)).toBeInTheDocument();
    expect(keyOf(1)).toBe(keyOf(0));
  });
});
