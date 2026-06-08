import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWouterWrapper } from '../../utils/withWouter';
import MOICAnalysisPage from '../../../client/src/pages/moic-analysis';
import type { FundMoicRankingsResponseV1 } from '../../../shared/contracts/fund-moic-v1.contract';

function makeRankingsResponse(fundId: number): FundMoicRankingsResponseV1 {
  return {
    fundId,
    generatedAt: '2026-06-07T00:00:00.000Z',
    rankings: [
      {
        rank: 1,
        investmentId: '101',
        investmentName: 'Acme Corp',
        reservesMoic: { value: 3.5, description: 'Expected return', formula: 'R×M×P / R' },
      },
      {
        rank: 2,
        investmentId: '102',
        investmentName: 'Beta Ltd',
        reservesMoic: { value: 2.0, description: 'Expected return', formula: 'R×M×P / R' },
      },
    ],
  };
}

function renderPage(path = '/moic-analysis?fundId=5') {
  const { Wrapper } = createWouterWrapper(path);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={qc}>
      <Wrapper>
        <MOICAnalysisPage />
      </Wrapper>
    </QueryClientProvider>
  );
}

describe('MOICAnalysisPage follow-on rankings section', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
  });

  it('calls the fund-scoped rankings endpoint and renders company names', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => makeRankingsResponse(5),
    } as Response);

    renderPage('/moic-analysis?fundId=5');

    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/funds/5/moic/rankings',
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('shows rank numbers in the rankings list', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => makeRankingsResponse(5),
    } as Response);

    renderPage('/moic-analysis?fundId=5');

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });
  });

  it('shows a loading state before data arrives', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));

    renderPage('/moic-analysis?fundId=5');

    expect(screen.getByText(/loading follow-on rankings/i)).toBeInTheDocument();
  });

  it('does not fetch when no fundId is provided', () => {
    renderPage('/moic-analysis');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
