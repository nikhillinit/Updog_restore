import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fundStoreToDraftWriteV1 } from '@/adapters/fund-store-adapters';
import { useFundDraftSync } from '@/hooks/useFundDraftSync';
import { fundStore } from '@/stores/fundStore';

const { mockFetchFundDraft, mockSaveFundDraft } = vi.hoisted(() => ({
  mockFetchFundDraft: vi.fn(),
  mockSaveFundDraft: vi.fn(),
}));

vi.mock('@/hooks/useUnifiedFlag', () => ({
  useFlag: () => false,
}));

vi.mock('@/services/fund-drafts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/fund-drafts')>()),
  fetchFundDraft: (...args: unknown[]) => mockFetchFundDraft(...args),
  saveFundDraft: (...args: unknown[]) => mockSaveFundDraft(...args),
}));

const SERVER_ETAG = '"0000000000000001"';

function reverseObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, field]) => [key, reverseObjectKeys(field)])
  );
}

function Harness() {
  useFundDraftSync({ stepKey: '1', debounceMs: 25 });
  return null;
}

describe('useFundDraftSync canonical snapshot equality', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetchFundDraft.mockReset();
    mockSaveFundDraft.mockReset();
    localStorage.clear();
    sessionStorage.clear();

    const initialState = fundStore.getInitialState();
    fundStore.setState(
      {
        ...initialState,
        hydrated: true,
        draftFundId: 42,
        draftServerReady: true,
        draftETag: SERVER_ETAG,
        draftSyncStatus: 'synced',
        fundName: 'Canonical Fund',
        followOnChecks: { A: 1, B: 2, C: 3 },
      },
      true
    );

    const localPayload = fundStoreToDraftWriteV1(fundStore.getState());
    const reorderedPayload = reverseObjectKeys(localPayload) as typeof localPayload;
    expect(reorderedPayload.stages).toEqual(localPayload.stages);
    expect(Object.keys(reorderedPayload.followOnChecks!)).toEqual(['C', 'B', 'A']);
    expect(reorderedPayload.followOnChecks).toEqual(localPayload.followOnChecks);
    expect(JSON.stringify(reorderedPayload)).not.toBe(JSON.stringify(localPayload));
    mockFetchFundDraft.mockResolvedValue({ config: reorderedPayload, etag: SERVER_ETAG });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not PUT when server JSONB only reordered nested object keys', async () => {
    render(<Harness />);

    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(30);
    });

    expect(mockFetchFundDraft).toHaveBeenCalledWith(42);
    expect(mockSaveFundDraft).not.toHaveBeenCalled();
  });
});
