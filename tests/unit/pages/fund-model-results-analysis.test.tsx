import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createWouterWrapper } from '../../utils/withWouter';
import { TestQueryClientProvider } from '../../utils/test-query-client';
import FundModelResultsAnalysisPage, {
  parseFundIdParam,
} from '@/pages/fund-model-results-analysis';

const mocks = vi.hoisted(() => ({
  contextFundId: 7 as number | undefined,
  currentFund: { id: 7, name: 'Fund Seven' } as { id: number; name: string } | null,
  isLoading: false,
  useInternalAnalysis: vi.fn(),
  useInternalEconomics: vi.fn(),
}));

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({
    currentFund: mocks.currentFund,
    fundId: mocks.contextFundId,
    isLoading: mocks.isLoading,
  }),
}));

vi.mock('@/hooks/useInternalAnalysis', () => ({
  useInternalAnalysis: mocks.useInternalAnalysis,
}));

vi.mock('@/hooks/useInternalEconomics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useInternalEconomics')>();
  return { ...actual, useInternalEconomics: mocks.useInternalEconomics };
});

// F_1.9.0: the page mounts FundWorkspaceProvider + WorkspaceContextRail; keep
// their reads inert so this suite stays focused on the analysis surface.
vi.mock('@/hooks/useDualForecast', () => ({
  useDualForecast: () => ({ data: undefined, isSuccess: false, isError: true, error: null }),
}));
vi.mock('@/hooks/useCurrentPlanVersions', () => ({
  useCurrentPlanVersions: () => ({
    versions: [],
    headVersion: null,
    isLoading: false,
    error: null,
    mint: {},
  }),
}));
vi.stubGlobal(
  'fetch',
  vi.fn(async () => new Response(JSON.stringify({ message: 'not found' }), { status: 404 }))
);

function renderPage(path: string) {
  const { Wrapper } = createWouterWrapper(path);
  return render(
    <TestQueryClientProvider>
      <Wrapper>
        <FundModelResultsAnalysisPage />
      </Wrapper>
    </TestQueryClientProvider>
  );
}

describe('FundModelResultsAnalysisPage', () => {
  beforeEach(() => {
    mocks.contextFundId = 7;
    mocks.currentFund = { id: 7, name: 'Fund Seven' };
    mocks.isLoading = false;
    mocks.useInternalAnalysis.mockReset();
    mocks.useInternalEconomics.mockReset();
    mocks.useInternalAnalysis.mockReturnValue({ drafts: [], references: [], isLoading: false, error: null });
    mocks.useInternalEconomics.mockReturnValue({
      baseline: { state: 'empty', runId: null, receipt: null, error: null },
      current: { state: 'empty', runId: null, receipt: null, error: null },
    });
  });

  it.each([
    [undefined, { status: 'missing', fundId: null }],
    ['', { status: 'invalid', fundId: null }],
    ['0', { status: 'invalid', fundId: null }],
    ['-1', { status: 'invalid', fundId: null }],
    ['1.5', { status: 'invalid', fundId: null }],
    ['abc', { status: 'invalid', fundId: null }],
    ['7', { status: 'valid', fundId: 7 }],
  ])('parses route fund id %s fail-closed', (raw, expected) => {
    expect(parseFundIdParam(raw)).toEqual(expected);
  });

  it('withholds discovery and receipt reads for invalid routes', () => {
    renderPage('/fund-model-results/not-a-fund/analysis');

    expect(screen.getByText('Invalid fund ID')).toBeInTheDocument();
    expect(mocks.useInternalAnalysis).not.toHaveBeenCalled();
    expect(mocks.useInternalEconomics).not.toHaveBeenCalled();
  });

  it('withholds all reads when route fund and FundContext do not match', () => {
    renderPage('/fund-model-results/8/analysis');

    expect(screen.getByText('Fund not available')).toBeInTheDocument();
    expect(screen.getByText(/economics evidence is withheld/i)).toBeInTheDocument();
    expect(mocks.useInternalAnalysis).not.toHaveBeenCalled();
    expect(mocks.useInternalEconomics).not.toHaveBeenCalled();
  });

  it('loads matching fund pins, initializes empty receipt slots, and marks Economics active', () => {
    renderPage('/fund-model-results/7/analysis');

    expect(mocks.useInternalAnalysis).toHaveBeenCalledWith(7, { includeSuperseded: false });
    expect(mocks.useInternalEconomics).toHaveBeenCalledWith(7, [null, null]);
    expect(screen.getByRole('link', { name: 'Economics' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('No pinned economics runs are available for comparison.')).toBeInTheDocument();
    // F_1.9.0: workspace context rail mounts on this surface.
    expect(screen.getByTestId('workspace-context-rail')).toBeInTheDocument();
  });
});
