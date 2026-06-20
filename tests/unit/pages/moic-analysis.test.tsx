import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWouterWrapper } from '../../utils/withWouter';
import MOICAnalysisPage from '../../../client/src/pages/moic-analysis';
import type {
  FundMoicRankingItemV1,
  FundMoicRankingsResponseV1,
} from '../../../shared/contracts/fund-moic-v1.contract';

function makeRanking(overrides: Partial<FundMoicRankingItemV1> = {}): FundMoicRankingItemV1 {
  return {
    rank: 1,
    investmentId: '101',
    investmentName: 'Acme Corp',
    reservesMoic: {
      value: 3.5,
      description: 'Expected return on planned reserves',
      formula: 'reserve exit value / planned reserves',
    },
    ...overrides,
  };
}

function makeRankingsResponse(
  fundId: number,
  rankings: FundMoicRankingItemV1[] = [
    makeRanking(),
    makeRanking({
      rank: 2,
      investmentId: '102',
      investmentName: 'Beta Ltd',
      reservesMoic: {
        value: 2,
        description: 'Expected return on planned reserves',
        formula: 'reserve exit value / planned reserves',
      },
    }),
  ]
): FundMoicRankingsResponseV1 {
  return {
    fundId,
    provenance: {
      source: 'portfolio_companies',
      calculation: 'reserves_moic_rankings',
      metricBasis: 'planned_reserves',
      sourceRecordCount: rankings.length,
    },
    generatedAt: '2026-06-07T00:00:00.000Z',
    rankings,
  };
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function withoutProvenance(response: FundMoicRankingsResponseV1): Partial<FundMoicRankingsResponseV1> {
  const copy: Partial<FundMoicRankingsResponseV1> = { ...response };
  delete copy.provenance;
  return copy;
}

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPage(path = '/moic-analysis?fundId=5', qc = makeQueryClient()) {
  const { Wrapper } = createWouterWrapper(path);

  return render(
    <QueryClientProvider client={qc}>
      <Wrapper>
        <MOICAnalysisPage />
      </Wrapper>
    </QueryClientProvider>
  );
}

function expectNoSampleFallback() {
  expect(screen.queryByText('Company H')).not.toBeInTheDocument();
  expect(screen.queryByText(/7 different MOIC/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/Moving Beyond Simple MOIC/i)).not.toBeInTheDocument();
}

describe('MOICAnalysisPage live-primary rankings', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  it('renders live rows when provenance is valid', async () => {
    fetchMock.mockResolvedValue(jsonResponse(makeRankingsResponse(5)));

    renderPage('/moic-analysis?fundId=5');

    await waitFor(() => {
      expect(screen.getAllByText('Acme Corp')).toHaveLength(2);
      expect(screen.getByText('Beta Ltd')).toBeInTheDocument();
    });

    expect(screen.getByText('portfolio_companies')).toBeInTheDocument();
    expect(screen.getByText('reserves_moic_rankings')).toBeInTheDocument();
    expect(screen.getByText('planned_reserves')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/funds/5/moic/rankings', {
      credentials: 'include',
    });
    expectNoSampleFallback();
  });

  it('renders a closed state for missing provenance without sample or broad claims', async () => {
    fetchMock.mockResolvedValue(jsonResponse(withoutProvenance(makeRankingsResponse(5))));

    renderPage('/moic-analysis?fundId=5');

    await waitFor(() => {
      expect(screen.getByText('Live MOIC contract mismatch')).toBeInTheDocument();
    });

    expect(screen.queryByText('Acme Corp')).not.toBeInTheDocument();
    expect(screen.queryByText(/performance/i)).not.toBeInTheDocument();
    expectNoSampleFallback();
  });

  it('renders a closed state for invalid provenance without sample or broad claims', async () => {
    const response = makeRankingsResponse(5);
    const invalidResponse = {
      ...response,
      provenance: {
        ...response.provenance,
        source: 'sample_companies',
      },
    };

    fetchMock.mockResolvedValue(jsonResponse(invalidResponse));

    renderPage('/moic-analysis?fundId=5');

    await waitFor(() => {
      expect(screen.getByText('Live MOIC contract mismatch')).toBeInTheDocument();
    });

    expect(screen.queryByText('Acme Corp')).not.toBeInTheDocument();
    expect(screen.queryByText(/performance/i)).not.toBeInTheDocument();
    expectNoSampleFallback();
  });

  it('hides cached live rows after a provenance parse failure', async () => {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(['fund-moic-rankings', 5], makeRankingsResponse(5));
    const response = makeRankingsResponse(5);
    const invalidResponse = {
      ...response,
      provenance: {
        ...response.provenance,
        sourceRecordCount: -1,
      },
    };

    fetchMock.mockResolvedValue(jsonResponse(invalidResponse));

    renderPage('/moic-analysis?fundId=5', queryClient);

    await waitFor(() => {
      expect(screen.getByText('Live MOIC contract mismatch')).toBeInTheDocument();
    });

    expect(screen.queryByText('Acme Corp')).not.toBeInTheDocument();
    expectNoSampleFallback();
  });

  it('renders a load-error state for HTTP failures', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ message: 'database unavailable' }, { status: 500 })
    );

    renderPage('/moic-analysis?fundId=5');

    await waitFor(() => {
      expect(screen.getByText('Unable to load live MOIC rankings')).toBeInTheDocument();
    });

    expectNoSampleFallback();
  });

  it.each([
    ['/moic-analysis', 'Fund ID required'],
    ['/moic-analysis?fundId=abc', 'Invalid fund ID'],
    ['/moic-analysis?fundId=0', 'Invalid fund ID'],
  ])('does not fetch for %s', (path, expectedState) => {
    renderPage(path);

    expect(screen.getByText(expectedState)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expectNoSampleFallback();
  });

  it('renders a live empty state for empty rankings', async () => {
    fetchMock.mockResolvedValue(jsonResponse(makeRankingsResponse(5, [])));

    renderPage('/moic-analysis?fundId=5');

    await waitFor(() => {
      expect(screen.getByText('No live rankings available')).toBeInTheDocument();
    });

    expect(screen.queryByText('Acme Corp')).not.toBeInTheDocument();
    expectNoSampleFallback();
  });
});
