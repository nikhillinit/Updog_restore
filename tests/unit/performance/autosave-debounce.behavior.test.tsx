import { act, useSyncExternalStore } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FundDraftWriteV1Schema,
  type FundDraftWriteV1,
} from '@shared/contracts/fund-draft-write-v1.contract';
import FundSetup from '@/pages/fund-setup';
import { fundStore } from '@/stores/fundStore';
import { TestQueryClientProvider } from '../../utils/test-query-client';

const draftServer = vi.hoisted(() => {
  type Snapshot = {
    writeCount: number;
    fundId: number | null;
    payload: FundDraftWriteV1 | null;
  };

  const listeners = new Set<() => void>();
  let snapshot: Snapshot = { writeCount: 0, fundId: null, payload: null };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reset: () => {
      snapshot = { writeCount: 0, fundId: null, payload: null };
    },
    save: async (fundId: number, payload: unknown) => {
      const parsedPayload = FundDraftWriteV1Schema.parse(payload);
      snapshot = {
        writeCount: snapshot.writeCount + 1,
        fundId,
        payload: parsedPayload,
      };
      listeners.forEach((listener) => listener());
      return { config: parsedPayload };
    },
  };
});

vi.mock('@/contexts/FundContext', () => ({
  FundProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useFundContext: () => ({
    currentFund: { id: 55, name: 'Draft Sync Fund', size: 100_000_000 },
    fundId: 55,
    needsSetup: false,
    isLoading: false,
    fundLoadError: false,
    fundLoadErrorMessage: null,
  }),
}));

vi.mock('@/hooks/useUnifiedFlag', () => ({
  useFlag: () => false,
}));

vi.mock('@/lib/wizard-telemetry', () => ({
  emitWizard: () => undefined,
}));

vi.mock('@/services/fund-drafts', () => ({
  fetchFundDraft: async () => {
    throw new Error('No draft fetch expected');
  },
  saveFundDraft: (fundId: number, payload: unknown) => draftServer.save(fundId, payload),
}));

function DraftServerObservation() {
  const snapshot = useSyncExternalStore(draftServer.subscribe, draftServer.getSnapshot);
  const firstTier = snapshot.payload?.waterfallTiers?.[0];

  return (
    <output aria-label="authoritative draft state">
      {snapshot.writeCount} {snapshot.writeCount === 1 ? 'write' : 'writes'}; fund{' '}
      {snapshot.fundId ?? 'unavailable'}; LP split {firstTier?.lpSplit ?? 'unavailable'}%; GP split{' '}
      {firstTier?.gpSplit ?? 'unavailable'}%
    </output>
  );
}

async function renderRoutedDistributionsStep() {
  window.history.pushState({}, '', '/fund-setup?step=5');
  render(
    <TestQueryClientProvider>
      <FundSetup />
      <DraftServerObservation />
    </TestQueryClientProvider>
  );

  expect(
    await screen.findByRole(
      'heading',
      { name: 'Distributions, Waterfall, Fees & Recycling' },
      { timeout: 5000 }
    )
  ).toBeInTheDocument();
  const lpSplitInput = screen.getByDisplayValue('80');
  vi.useFakeTimers();
  return lpSplitInput;
}

async function advanceTimers(milliseconds: number) {
  await act(async () => {
    vi.advanceTimersByTime(milliseconds);
    await Promise.resolve();
  });
}

describe('routed fund draft autosave debounce behavior', () => {
  beforeEach(() => {
    vi.useRealTimers();
    draftServer.reset();
    sessionStorage.setItem('wizard-visited-steps', JSON.stringify([1, 2, 3, 4, 5]));

    const initialState = fundStore.getInitialState();
    act(() => {
      fundStore.setState(
        {
          ...initialState,
          hydrated: true,
          draftFundId: 55,
          draftServerReady: false,
        },
        true
      );
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    sessionStorage.clear();
    window.history.pushState({}, '', '/');
  });

  it('batches rapid routed edits into one authoritative draft write with final data', async () => {
    const lpSplitInput = await renderRoutedDistributionsStep();

    fireEvent.change(lpSplitInput, { target: { value: '81' } });
    fireEvent.change(lpSplitInput, { target: { value: '82' } });
    await advanceTimers(600);

    expect(screen.getByLabelText('authoritative draft state')).toHaveTextContent(
      '1 write; fund 55; LP split 82%; GP split 18%'
    );
    expect(screen.getByTestId('draft-sync-status')).toHaveTextContent('Draft saved to server');
  });

  it('does not write an edited routed draft before the 600 ms window ends', async () => {
    const lpSplitInput = await renderRoutedDistributionsStep();

    fireEvent.change(lpSplitInput, { target: { value: '81' } });
    expect(lpSplitInput).toHaveValue(81);
    expect(screen.getByTestId('draft-sync-status')).toHaveTextContent(
      'Saving authoritative server draft...'
    );

    await advanceTimers(599);

    expect(screen.getByLabelText('authoritative draft state')).toHaveTextContent(
      '0 writes; fund unavailable; LP split unavailable%; GP split unavailable%'
    );
  });

  it('writes exactly once when the routed draft debounce window elapses', async () => {
    const lpSplitInput = await renderRoutedDistributionsStep();

    fireEvent.change(lpSplitInput, { target: { value: '84' } });
    await advanceTimers(600);

    expect(screen.getByLabelText('authoritative draft state')).toHaveTextContent(
      '1 write; fund 55; LP split 84%; GP split 16%'
    );

    await advanceTimers(600);
    expect(screen.getByLabelText('authoritative draft state')).toHaveTextContent('1 write');
  });
});
