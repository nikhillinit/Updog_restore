import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportDealsModal } from '@/components/pipeline/ImportDealsModal';
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
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

const mockAuth = vi.hoisted(() => vi.fn(() => ({ data: null as { user: { id: string } } | null })));

vi.mock('@/lib/auth-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth-session')>()),
  useAuthSession: () => mockAuth(),
}));

const keyOf = (call: number) =>
  ((mockApiRequest.mock.calls[call] as unknown[])[3] as { headers: Record<string, string> })
    .headers['Idempotency-Key'];

const CSV = 'companyName,sector,stage,sourceType\nNorthwind AI,AI / ML,Seed,Referral';

async function uploadCsv() {
  const file = new File([CSV], 'deals.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: async () => CSV });
  await userEvent.upload(document.getElementById('csv-upload')!, file);
}

function previewOf(toImport: number, duplicates: number) {
  return {
    success: true,
    data: {
      total: 1,
      valid: 1,
      invalid: 0,
      duplicates,
      toImport,
      invalidRows: [],
      duplicateRows:
        duplicates > 0 ? [{ index: 0, existingId: 9, companyName: 'Northwind AI' }] : [],
    },
  };
}

const IMPORTED_ONE = {
  success: true,
  data: { imported: 1, skipped: 0, failed: 0, failedRows: [], total: 1 },
};

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('ImportDealsModal', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockAuth.mockReturnValue({ data: null });
    mockApiRequest.mockReset();
    mockSha256Hash.mockReset();
    mockToast.mockReset();
    mockOpenChange.mockReset();
  });

  it('keeps preview unkeyed and keys confirm import', async () => {
    mockApiRequest
      .mockResolvedValueOnce({
        success: true,
        data: {
          total: 1,
          valid: 1,
          invalid: 0,
          duplicates: 0,
          toImport: 1,
          invalidRows: [],
          duplicateRows: [],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { imported: 1, skipped: 0, failed: 0, failedRows: [], total: 1 },
      });

    renderWithQuery(<ImportDealsModal open={true} onOpenChange={mockOpenChange} fundId={1} />);
    const csv = 'companyName,sector,stage,sourceType\nNorthwind AI,AI / ML,Seed,Referral';
    const file = new File([csv], 'deals.csv', { type: 'text/csv' });
    // jsdom's File has no text(); the modal reads the upload through it.
    Object.defineProperty(file, 'text', { value: async () => csv });
    await userEvent.upload(document.getElementById('csv-upload')!, file);

    await waitFor(() => expect(mockApiRequest).toHaveBeenCalledTimes(1));
    expect(mockApiRequest.mock.calls[0]?.[3]).toBeUndefined();

    await userEvent.click(await screen.findByRole('button', { name: /import 1 deal/i }));
    await waitFor(() => expect(mockApiRequest).toHaveBeenCalledTimes(2));
    expect(mockApiRequest.mock.calls[1]?.[3]).toEqual({
      headers: { 'Idempotency-Key': expect.stringMatching(/^[0-9a-f-]{36}$/) },
    });
  });

  it('retries an uncertain confirm with the same key and settles on key reuse', async () => {
    mockApiRequest
      .mockResolvedValueOnce({
        success: true,
        data: {
          total: 1,
          valid: 1,
          invalid: 0,
          duplicates: 0,
          toImport: 1,
          invalidRows: [],
          duplicateRows: [],
        },
      })
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new ApiError(409, 'reuse', 'IDEMPOTENCY_KEY_REUSE'));

    renderWithQuery(<ImportDealsModal open={true} onOpenChange={mockOpenChange} fundId={1} />);
    const csv = 'companyName,sector,stage,sourceType\nNorthwind AI,AI / ML,Seed,Referral';
    const file = new File([csv], 'deals.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'text', { value: async () => csv });
    await userEvent.upload(document.getElementById('csv-upload')!, file);

    await userEvent.click(await screen.findByRole('button', { name: /import 1 deal/i }));
    expect(await screen.findByText(/import status is uncertain/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /retry import/i }));
    await waitFor(() => expect(mockApiRequest).toHaveBeenCalledTimes(3));
    const key = (call: number) =>
      ((mockApiRequest.mock.calls[call] as unknown[])[3] as { headers: Record<string, string> })
        .headers['Idempotency-Key'];
    expect(key(2)).toBe(key(1));
    expect(await screen.findByText(/already recorded/i)).toBeInTheDocument();
  });

  it('retries an uncertain import under its original fund and key after the page fund changes', async () => {
    mockAuth.mockReturnValue({ data: { user: { id: '7' } } });
    mockApiRequest
      .mockResolvedValueOnce(previewOf(1, 0))
      .mockRejectedValueOnce(new ApiError(503, 'unavailable'))
      .mockResolvedValueOnce(IMPORTED_ONE);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const view = (fundId: number, open: boolean) => (
      <QueryClientProvider client={queryClient}>
        <ImportDealsModal open={open} onOpenChange={mockOpenChange} fundId={fundId} />
      </QueryClientProvider>
    );
    const { rerender } = render(view(1, true));

    await uploadCsv();
    await userEvent.click(await screen.findByRole('button', { name: /import 1 deal/i }));
    expect(await screen.findByText(/import status is uncertain/i)).toBeInTheDocument();

    rerender(view(2, false));
    rerender(view(2, true));
    await userEvent.click(await screen.findByRole('button', { name: /retry import/i }));

    await waitFor(() => expect(mockApiRequest).toHaveBeenCalledTimes(3));
    expect(keyOf(2)).toBe(keyOf(1));
    expect((mockApiRequest.mock.calls[2] as unknown[])[2]).toMatchObject({ fundId: 1 });
    await waitFor(() =>
      expect(sessionStorage.getItem('pending-create:v1:1:deal_import')).toBeNull()
    );
    expect(sessionStorage.getItem('pending-create:v1:2:deal_import')).toBeNull();
  });

  it('replays a restored import when every re-uploaded row previews as a duplicate', async () => {
    mockAuth.mockReturnValue({ data: { user: { id: '7' } } });
    mockApiRequest
      .mockResolvedValueOnce(previewOf(1, 0))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(previewOf(0, 1))
      .mockResolvedValueOnce(IMPORTED_ONE);

    const firstTab = renderWithQuery(
      <ImportDealsModal open={true} onOpenChange={mockOpenChange} fundId={1} />
    );
    await uploadCsv();
    await userEvent.click(await screen.findByRole('button', { name: /import 1 deal/i }));
    expect(await screen.findByText(/import status is uncertain/i)).toBeInTheDocument();
    // The committed import lost its response; a reload keeps only the stored key.
    firstTab.unmount();

    renderWithQuery(<ImportDealsModal open={true} onOpenChange={mockOpenChange} fundId={1} />);
    expect(await screen.findByText(/earlier attempt may already be recorded/i)).toBeInTheDocument();
    await uploadCsv();
    await userEvent.click(await screen.findByRole('button', { name: /retry import/i }));

    await waitFor(() => expect(mockApiRequest).toHaveBeenCalledTimes(4));
    expect(keyOf(3)).toBe(keyOf(1));
    expect(await screen.findByText(/1 deal imported/i)).toBeInTheDocument();
  });

  it('keys an import under its submitted fund when the fund changes while hashing', async () => {
    mockAuth.mockReturnValue({ data: { user: { id: '7' } } });
    const firstDigest = deferred<string>();
    mockSha256Hash
      .mockImplementationOnce(() => firstDigest.promise)
      .mockResolvedValueOnce('digest-a');
    mockApiRequest
      .mockResolvedValueOnce(previewOf(1, 0))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(IMPORTED_ONE);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const view = (fundId: number) => (
      <QueryClientProvider client={queryClient}>
        <ImportDealsModal open={true} onOpenChange={mockOpenChange} fundId={fundId} />
      </QueryClientProvider>
    );
    const { rerender } = render(view(1));

    await uploadCsv();
    await userEvent.click(await screen.findByRole('button', { name: /import 1 deal/i }));
    await waitFor(() => expect(mockSha256Hash).toHaveBeenCalledTimes(1));
    rerender(view(2));
    firstDigest.resolve('digest-a');

    expect(await screen.findByText(/import status is uncertain/i)).toBeInTheDocument();
    expect((mockApiRequest.mock.calls[1] as unknown[])[2]).toMatchObject({ fundId: 1 });
    expect(
      JSON.parse(sessionStorage.getItem('pending-create:v1:1:deal_import') ?? '{}')
    ).toMatchObject({ key: keyOf(1) });
    expect(sessionStorage.getItem('pending-create:v1:2:deal_import')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /retry import/i }));
    await waitFor(() => expect(mockApiRequest).toHaveBeenCalledTimes(3));
    expect(keyOf(2)).toBe(keyOf(1));
    expect((mockApiRequest.mock.calls[2] as unknown[])[2]).toMatchObject({ fundId: 1 });
  });
});
