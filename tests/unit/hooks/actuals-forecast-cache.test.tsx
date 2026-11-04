import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useMutation: (options: unknown) => options,
}));

import { useActualsPublish } from '@/hooks/lp-reporting/useActualsPublish';
import { useActualsRestatementPublish } from '@/hooks/lp-reporting/useActualsRestatement';

describe('publication refreshes forecast comparisons', () => {
  it.each([
    ['publish', useActualsPublish],
    ['restatement', useActualsRestatementPublish],
  ] as const)(
    '%s invalidates every cutoff for the affected fund without invalidating another fund',
    async (_name, usePublish) => {
      const client = new QueryClient();
      const current = ['dual-forecast', 7];
      const historical = ['dual-forecast', 7, { asOfDate: '2025-03-31', baselineSnapshotId: 51 }];
      const otherFund = ['dual-forecast', 8];
      const currentMetrics = ['fund-metrics', 7];
      const otherFundMetrics = ['fund-metrics', 8];
      for (const key of [current, historical, otherFund, currentMetrics, otherFundMetrics])
        client.setQueryData(key, { value: 'old' });
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      );
      // A request can settle after the user switches the active fund.
      const { result } = renderHook(() => usePublish(8), { wrapper });
      const options = result.current as unknown as {
        onSuccess: (receipt: { fundId: number; facts: { snapshotId: number } }) => void;
      };
      await act(async () => {
        options.onSuccess({ fundId: 7, facts: { snapshotId: 42 } });
      });
      expect(client.getQueryState(current)?.isInvalidated).toBe(true);
      expect(client.getQueryState(historical)?.isInvalidated).toBe(true);
      expect(client.getQueryState(otherFund)?.isInvalidated).toBe(false);
      expect(client.getQueryState(currentMetrics)?.isInvalidated).toBe(true);
      expect(client.getQueryState(otherFundMetrics)?.isInvalidated).toBe(false);
      client.clear();
    }
  );
});
