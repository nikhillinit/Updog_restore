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
    mockApiRequest.mockReset();
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
});
