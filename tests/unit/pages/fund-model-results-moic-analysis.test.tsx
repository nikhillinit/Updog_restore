import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createWouterWrapper } from '../../utils/withWouter';
import FundModelResultsMoicAnalysisPage from '../../../client/src/pages/fund-model-results-moic-analysis';
import {
  FundMoicRankingsResponseV2Schema,
  type FundMoicRankingsResponseV2,
} from '../../../shared/contracts/fund-moic-v2.contract';
import {
  FundMoicFactsBasisV1Schema,
  type FundMoicFactsBasisV1,
} from '../../../shared/contracts/fund-moic-v1.contract';

type HookError = { code: string };
type HookResult = {
  data: FundMoicRankingsResponseV2 | null;
  error: HookError | null;
  isLoading: boolean;
};

const useFundMoicRankingsV2 = vi.fn<(fundId: number | null) => HookResult>();
const usePortfolioCompanies = vi.fn<
  (fundId: number | undefined) => {
    portfolioCompanies: Array<{
      id: number;
      plannedReservesCents: number;
      deployedReservesCents: number;
    }>;
  }
>();

const FACTS_HASH = 'a'.repeat(64);

function makeFactsBasis(overrides: Partial<FundMoicFactsBasisV1> = {}): FundMoicFactsBasisV1 {
  return FundMoicFactsBasisV1Schema.parse({
    rankability: 'actionable',
    reasons: ['planning_fmv_active'],
    observedInitialInvestment: '1000000',
    observedFollowOnInvestment: '250000',
    observedTotalInvestment: '1250000',
    valuationAnchor: {
      kind: 'planning_fmv',
      value: '4000000',
      asOfDate: '2026-07-12',
    },
    planningFmvStatus: 'active',
    currencyStatus: 'base_currency',
    factsInputHash: FACTS_HASH,
    warnings: [],
    ...overrides,
  });
}

vi.mock('../../../client/src/hooks/use-moic', () => ({
  useFundMoicRankingsV2: (fundId: number | null) => useFundMoicRankingsV2(fundId),
}));

vi.mock('../../../client/src/hooks/use-fund-data', () => ({
  usePortfolioCompanies: (fundId: number | undefined) => usePortfolioCompanies(fundId),
}));

const canonicalFixture = {
  contractVersion: '2.1.0',
  fundId: 7,
  rankings: [
    {
      rank: 1,
      investmentId: '101',
      investmentName: 'Acme Corp',
      factsBasis: makeFactsBasis(),
      reservesMoic: {
        value: 2.8,
        description: 'Expected return on planned reserves',
        formula: 'reserve exit value / planned reserves',
      },
    },
  ],
  provenance: {
    mode: 'legacy',
    warnings: ['shadow_residency_pending'],
  },
  latestReconciliation: {
    runId: '55',
    createdAt: '2026-06-24T00:00:00.000Z',
    currentInputMatches: false,
    sourceFingerprintMatches: false,
  },
  materiality: { status: 'stale', candidateMaterial: true, epsilon: 1e-8 },
  modePreview: {
    calculationKey: 'fund_moic_rankings_exit_probability',
    configuredMode: 'shadow',
    effectiveMode: 'off',
    killSwitchActive: true,
    shadowStartedAt: '2026-06-24T00:00:00.000Z',
    eligibleAt: '2026-07-01T00:00:00.000Z',
    residencyDaysRequired: 7,
    residencyStatus: 'pending',
    currentSourceMatchesAccepted: false,
    unreconciledEditsPresent: true,
    blockers: [
      'accepted_reconciliation_required',
      'accepted_reconciliation_not_found',
      'current_source_changed',
      'exit_probability_source_incomplete',
      'kill_switch_active',
      'reserve_exit_multiple_source_incomplete',
      'shadow_residency_pending',
    ],
    version: 2,
  },
  moicInputSummary: {
    sourceVersion: 'moic-round-fmv-facts-v2',
    explicitExitProbabilityCount: 1,
    defaultedExitProbabilityCount: 2,
    activationBlockingDefaultedExitProbabilityCount: 2,
    explicitReserveExitMultipleCount: 1,
    defaultedReserveExitMultipleCount: 3,
    activationBlockingDefaultedReserveExitMultipleCount: 3,
  },
  actualsProvenanceSummary: {
    factsStatus: 'available',
    factsInputHash: 'facts-hash',
    companyCount: 4,
    trustStateCounts: { LIVE: 2, PARTIAL: 1, UNAVAILABLE: 1, FAILED: 0 },
    defaultedEconomicInputCount: 5,
    warnings: [],
  },
  roundEvidenceSummary: {
    activeRoundCount: 3,
    activeOverrideCount: 1,
    warningCodes: [
      'ROLE_CLASSIFICATION_AMBIGUOUS',
      'CURRENCY_MISMATCH_BLOCK',
      'ROUND_MODEL_OVERRIDE_APPLIED',
      'NON_EQUITY_AMOUNT_ONLY',
      'EMPTY_FUND',
      'ROUND_ADAPTER_FAILED',
      'UNMAPPED_ROUND_WARNING',
    ],
  },
  generatedAt: '2026-06-24T00:00:00.000Z',
} satisfies FundMoicRankingsResponseV2;

function makeV2(): FundMoicRankingsResponseV2 {
  return FundMoicRankingsResponseV2Schema.parse(structuredClone(canonicalFixture));
}

function renderPage(path = '/fund-model-results/7/moic-analysis') {
  const { Wrapper } = createWouterWrapper(path);
  return render(
    <Wrapper>
      <FundModelResultsMoicAnalysisPage />
    </Wrapper>
  );
}

function mockHook(result: HookResult) {
  useFundMoicRankingsV2.mockReturnValue(result);
}

describe('FundModelResultsMoicAnalysisPage', () => {
  beforeEach(() => {
    useFundMoicRankingsV2.mockReset();
    usePortfolioCompanies.mockReset();
    usePortfolioCompanies.mockReturnValue({
      portfolioCompanies: [
        { id: 101, plannedReservesCents: 140_000_000, deployedReservesCents: 100_000_000 },
        { id: 102, plannedReservesCents: 130_000_000, deployedReservesCents: 90_000_000 },
        { id: 103, plannedReservesCents: 120_000_000, deployedReservesCents: 80_000_000 },
        { id: 104, plannedReservesCents: 110_000_000, deployedReservesCents: 70_000_000 },
      ],
    });
  });

  it('renders legacy source, warning banners, mapped codes, blocking counts, and reconciliation indicators', () => {
    mockHook({ data: makeV2(), error: null, isLoading: false });

    renderPage();

    expect(
      screen.getByText('Showing legacy rankings - baseline values from recorded portfolio data.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Kill switch active. Candidate mode is disabled; legacy rankings are shown.')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Materiality check is stale. Displayed rankings may not reflect current inputs.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Stale - rerun required')).toBeInTheDocument();
    expect(
      screen.getByText('Source data changed since the last accepted reconciliation')
    ).toBeInTheDocument();
    expect(screen.getByText('2 blocking (defaulted exit probabilities)')).toBeInTheDocument();
    expect(screen.getByText('3 blocking (defaulted reserve exit multiples)')).toBeInTheDocument();
    expect(screen.getByText('Kill switch active')).toBeInTheDocument();
    expect(screen.getByTitle('kill_switch_active')).toBeInTheDocument();
    expect(screen.getByText('Unreconciled source edits')).toBeInTheDocument();
    expect(screen.getByText('Exit probabilities incomplete')).toBeInTheDocument();
    expect(screen.getByText('Reserve exit multiples incomplete')).toBeInTheDocument();
    expect(screen.getByText('Accepted reconciliation required')).toBeInTheDocument();
    expect(screen.getByText('No accepted reconciliation found')).toBeInTheDocument();
    expect(screen.getByText('Shadow residency period pending')).toBeInTheDocument();
    expect(screen.getByText('Round role classification ambiguous')).toBeInTheDocument();
    expect(screen.getByText('Currency mismatch (blocking)')).toBeInTheDocument();
    expect(screen.getByText('Round model override applied')).toBeInTheDocument();
    expect(screen.getByText('Non-equity amounts only')).toBeInTheDocument();
    expect(screen.getByText('No round data for fund')).toBeInTheDocument();
    expect(screen.getByText('Round evidence unavailable (adapter failed)')).toBeInTheDocument();
    expect(screen.getByText('UNMAPPED_ROUND_WARNING')).toBeInTheDocument();
    expect(screen.getByText('Run ID: 55')).toBeInTheDocument();
    expect(screen.getByText('Created: 2026-06-24T00:00:00.000Z')).toBeInTheDocument();
    expect(screen.getByText('Inputs changed')).toBeInTheDocument();
    expect(screen.getByText('Fingerprint changed')).toBeInTheDocument();
    expect(screen.getByText('Facts status')).toBeInTheDocument();
    expect(screen.getByText('available')).toBeInTheDocument();
    expect(screen.getByText('Facts input hash')).toBeInTheDocument();
    expect(screen.getByText('facts-hash')).toBeInTheDocument();
    expect(screen.getByText('Facts trust')).toBeInTheDocument();
    expect(screen.getByText('LIVE 2, PARTIAL 1, UNAVAILABLE 1, FAILED 0')).toBeInTheDocument();
    expect(screen.getByText('Defaulted economic inputs')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.queryByText(/marginal next-dollar/i)).not.toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('1,400,000.00')).toHaveClass('tabular-nums');
    expect(screen.getByText('1,000,000.00')).toHaveClass('tabular-nums');
  });

  it('renders candidate source copy when candidate rankings are active', () => {
    const fixture = makeV2();
    fixture.provenance.mode = 'candidate';
    fixture.modePreview.configuredMode = 'on';
    fixture.modePreview.effectiveMode = 'on';
    fixture.modePreview.killSwitchActive = false;
    fixture.modePreview.blockers = [];
    fixture.materiality.status = 'recorded';
    fixture.latestReconciliation = {
      runId: '56',
      createdAt: '2026-06-25T00:00:00.000Z',
      currentInputMatches: true,
      sourceFingerprintMatches: true,
    };

    mockHook({
      data: FundMoicRankingsResponseV2Schema.parse(fixture),
      error: null,
      isLoading: false,
    });

    renderPage();

    expect(
      screen.getByText('Showing candidate rankings - values use reconciled round evidence.')
    ).toBeInTheDocument();
    expect(screen.getByText('Recorded')).toBeInTheDocument();
    expect(screen.getByText('Inputs match')).toBeInTheDocument();
    expect(screen.getByText('Fingerprint match')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('groups every company by rankability and expands disclosure from the keyboard', async () => {
    const user = userEvent.setup();
    const fixture = makeV2();
    const rankingTemplate = fixture.rankings[0];

    fixture.rankings = [
      {
        ...rankingTemplate,
        rank: 2,
        investmentId: '104',
        investmentName: 'Unavailable Co',
        factsBasis: null,
        reservesMoic: { ...rankingTemplate.reservesMoic, value: 1.1 },
      },
      {
        ...rankingTemplate,
        rank: 1,
        investmentId: '103',
        investmentName: 'Blocked Co',
        factsBasis: makeFactsBasis({
          rankability: 'not_actionable',
          reasons: ['currency_blocked'],
          valuationAnchor: { kind: 'none', value: null, asOfDate: null },
          currencyStatus: 'mismatch_blocked',
        }),
        reservesMoic: { ...rankingTemplate.reservesMoic, value: 1.2 },
      },
      {
        ...rankingTemplate,
        rank: 3,
        investmentId: '102',
        investmentName: 'Indicative Co',
        factsBasis: makeFactsBasis({
          rankability: 'indicative',
          reasons: ['planning_fmv_stale'],
          planningFmvStatus: 'stale',
        }),
        reservesMoic: { ...rankingTemplate.reservesMoic, value: 1.3 },
      },
      {
        ...rankingTemplate,
        rank: 4,
        investmentId: '101',
        investmentName: 'Action Co',
        factsBasis: makeFactsBasis(),
        reservesMoic: { ...rankingTemplate.reservesMoic, value: 1.4 },
      },
    ];

    mockHook({
      data: FundMoicRankingsResponseV2Schema.parse(fixture),
      error: null,
      isLoading: false,
    });

    const { container } = renderPage();

    expect(
      screen.getByRole('heading', {
        name: 'Expected MOIC on planned reserves — assumption-based',
      })
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/marginal|opportunity cost/i);
    expect(screen.getByText('Overall MOIC rank')).toBeInTheDocument();
    const rankingGroups = screen.getByRole('table').querySelectorAll('tbody');
    expect(rankingGroups).toHaveLength(3);
    expect(
      Array.from(rankingGroups, (group) =>
        group.querySelector('th[scope="rowgroup"]')?.textContent?.trim()
      )
    ).toEqual(['Actionable', 'Indicative', 'Not actionable']);
    expect(
      screen
        .getAllByRole('button', { name: /show facts basis for/i })
        .map((button) => button.textContent?.trim())
    ).toEqual(['Action Co', 'Indicative Co', 'Blocked Co', 'Unavailable Co']);

    const actionButton = screen.getByRole('button', { name: 'Show facts basis for Action Co' });
    expect(actionButton).toHaveAttribute('aria-expanded', 'false');
    actionButton.focus();
    await user.keyboard('{Enter}');
    expect(actionButton).toHaveAttribute('aria-expanded', 'true');
    expect(actionButton).toHaveAccessibleName('Hide facts basis for Action Co');
    expect(screen.getByRole('region', { name: 'Action Co MOIC facts basis' })).toBeInTheDocument();
    await user.keyboard(' ');
    expect(actionButton).toHaveAttribute('aria-expanded', 'false');
    expect(actionButton).toHaveAccessibleName('Show facts basis for Action Co');

    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('1.10x')).toHaveClass('tabular-nums');
    expect(screen.getByText('1,100,000.00')).toHaveClass('tabular-nums');
    expect(screen.getByText('700,000.00')).toHaveClass('tabular-nums');
    expect(screen.getByText('Facts unavailable')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show facts basis for Unavailable Co' }));
    expect(screen.getByText(/supporting facts basis could not be loaded/i)).toBeInTheDocument();
    expect(useFundMoicRankingsV2).toHaveBeenCalledTimes(1);
    expect(usePortfolioCompanies).toHaveBeenCalledWith(7);
  });

  it('renders zero blocking counts, empty warning groups, and no reconciliation copy', () => {
    const fixture = makeV2();
    fixture.modePreview.blockers = [];
    fixture.modePreview.killSwitchActive = false;
    fixture.modePreview.unreconciledEditsPresent = false;
    fixture.moicInputSummary.activationBlockingDefaultedExitProbabilityCount = 0;
    fixture.moicInputSummary.activationBlockingDefaultedReserveExitMultipleCount = 0;
    fixture.roundEvidenceSummary.warningCodes = [];
    fixture.latestReconciliation = null;
    fixture.materiality.status = 'not_run';
    fixture.actualsProvenanceSummary.factsStatus = 'failed';
    fixture.actualsProvenanceSummary.factsInputHash = null;
    fixture.actualsProvenanceSummary.trustStateCounts = {
      LIVE: 0,
      PARTIAL: 0,
      UNAVAILABLE: 1,
      FAILED: 0,
    };

    mockHook({
      data: FundMoicRankingsResponseV2Schema.parse(fixture),
      error: null,
      isLoading: false,
    });

    renderPage();

    expect(screen.getByText('Not run')).toBeInTheDocument();
    expect(screen.getAllByText('0')).toHaveLength(2);
    expect(screen.getAllByText('None').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('failed')).toBeInTheDocument();
    expect(screen.getByText('unavailable')).toBeInTheDocument();
    expect(screen.getByText('No reconciliation recorded')).toBeInTheDocument();
  });

  it('shows contract mismatch and does not render the rankings table on parse errors', () => {
    mockHook({
      data: null,
      error: { code: 'CONTRACT_PARSE_ERROR' },
      isLoading: false,
    });

    renderPage();

    expect(screen.getByText('MOIC contract mismatch')).toBeInTheDocument();
    expect(
      screen.getByText(
        'The response did not match the required V2 contract, so rankings are not shown.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows a generic load error and does not render rankings', () => {
    mockHook({
      data: null,
      error: { code: 'LOAD_ERROR' },
      isLoading: false,
    });

    renderPage();

    expect(screen.getByText('Unable to load MOIC rankings')).toBeInTheDocument();
    expect(
      screen.getByText('The rankings endpoint returned a load error, so rankings are not shown.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the empty rankings state without rendering the table', () => {
    const fixture = makeV2();
    fixture.rankings = [];

    mockHook({
      data: FundMoicRankingsResponseV2Schema.parse(fixture),
      error: null,
      isLoading: false,
    });

    renderPage();

    expect(screen.getByText('No rankings disclosed')).toBeInTheDocument();
    expect(
      screen.getByText(
        'As of 2026-06-24. The V2 response returned zero reserves MOIC ranking rows for this fund.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the loading state before data is available', () => {
    mockHook({ data: null, error: null, isLoading: true });

    renderPage();

    expect(screen.getByText('Loading MOIC rankings')).toBeInTheDocument();
    expect(
      screen.getByText('Fetching the fund-scoped MOIC rankings response.')
    ).toBeInTheDocument();
    expect(screen.getAllByTestId('moic-loading-number')).toHaveLength(3);
    for (const skeleton of screen.getAllByTestId('moic-loading-number')) {
      expect(skeleton).toHaveClass('tabular-nums', 'motion-reduce:animate-none');
    }
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
