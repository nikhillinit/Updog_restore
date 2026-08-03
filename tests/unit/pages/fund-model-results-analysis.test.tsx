import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createWouterWrapper } from '../../utils/withWouter';
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

function renderPage(path: string) {
  const { Wrapper } = createWouterWrapper(path);
  return render(
    <Wrapper>
      <FundModelResultsAnalysisPage />
    </Wrapper>
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
  });
});
