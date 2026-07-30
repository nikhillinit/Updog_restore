import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReserveIntelligencePanel } from '@/components/fund-results/ReserveIntelligencePanel';
import type {
  ReserveIntelligenceHookError,
  ReserveIntelligenceQueryResult,
} from '@/hooks/useReserveIntelligence';
import {
  makeReserveIntelligenceRun,
  RESERVE_FACTS_HASH,
} from '../../fixtures/dynamic-reserve-intelligence';

interface HookResult {
  data: ReserveIntelligenceQueryResult | undefined;
  error: ReserveIntelligenceHookError | null;
  isLoading: boolean;
}

const useReserveIntelligence = vi.fn<(fundId: number | null) => HookResult>();

vi.mock('@/hooks/useReserveIntelligence', () => ({
  useReserveIntelligence: (fundId: number | null) => useReserveIntelligence(fundId),
}));

function mockHook(result: HookResult) {
  useReserveIntelligence.mockReturnValue(result);
}

const PARTICIPATION_BASIS_UNAVAILABLE =
  'Participation basis unavailable: companyId to companyIdentityId mapping is not disclosed.';

function expectParticipationBasisDisclosureForEachCompany() {
  const table = screen.getByRole('table', { name: 'Reserve intelligence diagnostics' });
  for (const companyName of ['Alpha', 'Beta', 'Gamma']) {
    const row = within(table).getByText(companyName).closest('tr');
    expect(row).not.toBeNull();
    expect(
      within(row as HTMLTableRowElement).getByText(PARTICIPATION_BASIS_UNAVAILABLE)
    ).toBeVisible();
  }
}

describe('ReserveIntelligencePanel', () => {
  beforeEach(() => {
    useReserveIntelligence.mockReset();
    mockHook({
      data: { kind: 'feature-disabled' },
      error: null,
      isLoading: false,
    });
  });

  it('renders server-disabled as unavailable with reason, not error or table', () => {
    render(<ReserveIntelligencePanel fundId={7} />);

    const panel = screen.getByRole('region', { name: 'Reserve intelligence' });
    expect(within(panel).getByText('Reserve intelligence unavailable')).toBeInTheDocument();
    expect(within(panel).getByText(/disabled by server configuration/i)).toBeInTheDocument();
    expect(within(panel).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(panel).queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders no-run separately from the server-disabled state', () => {
    mockHook({ data: { kind: 'no-run' }, error: null, isLoading: false });

    render(<ReserveIntelligencePanel fundId={7} />);

    expect(screen.getByText('No reserve intelligence run yet')).toBeInTheDocument();
    expect(screen.getByText(/feature is enabled.*no persisted run/i)).toBeInTheDocument();
    expect(screen.queryByText(/disabled by server configuration/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders loading without a table', () => {
    mockHook({ data: undefined, error: null, isLoading: true });

    render(<ReserveIntelligencePanel fundId={7} />);

    expect(screen.getByText('Loading reserve intelligence')).toBeInTheDocument();
    expect(screen.getAllByTestId('reserve-intelligence-skeleton-row')).toHaveLength(3);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it.each([
    ['contract mismatch', { code: 'CONTRACT_PARSE_ERROR' as const }, /contract mismatch/i],
    ['load error', { status: 500 }, /unable to load reserve intelligence/i],
  ])('renders %s as an error distinct from unavailable', (_label, error, copy) => {
    mockHook({ data: undefined, error, isLoading: false });

    render(<ReserveIntelligencePanel fundId={7} />);

    expect(screen.getByRole('alert')).toHaveTextContent(copy);
    expect(screen.queryByText(/disabled by server configuration/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders one analytical diagnostics table with its D33 basis line inside', () => {
    const run = makeReserveIntelligenceRun();
    mockHook({ data: { kind: 'ready', run }, error: null, isLoading: false });

    render(<ReserveIntelligencePanel fundId={7} />);

    const table = screen.getByRole('table', { name: 'Reserve intelligence diagnostics' });
    const basisLine = within(table).getByTestId('basis-line');
    expect(table.contains(basisLine)).toBe(true);
    expect(basisLine.closest('table')).toBe(table);
    expect(basisLine).toHaveTextContent('2026-07-29');
    expect(basisLine).toHaveTextContent(RESERVE_FACTS_HASH.slice(0, 12));
    expect(basisLine).toHaveTextContent('Snapshot 31');
    expect(basisLine).toHaveTextContent('Not actionable');
    expect(basisLine).toHaveTextContent('Mode: shadow');
    expect(basisLine).toHaveTextContent(
      'Analytical only. Derived from the pinned facts snapshot; never written back to the current plan.'
    );
    expect(screen.getAllByRole('table')).toHaveLength(1);
  });

  it('renders allocations, overlays, deltas, constraints, unresolved facts, and decisions', () => {
    const run = makeReserveIntelligenceRun();
    mockHook({ data: { kind: 'ready', run }, error: null, isLoading: false });

    render(<ReserveIntelligencePanel fundId={7} />);

    const table = screen.getByRole('table');
    const alphaRow = within(table).getByText('Alpha').closest('tr');
    expect(alphaRow).not.toBeNull();
    expect(alphaRow).toHaveTextContent('Seed');
    expect(alphaRow).toHaveTextContent('7,500.00');
    expect(alphaRow).toHaveTextContent('7,000.00');
    expect(alphaRow).toHaveTextContent('-500.00');
    expect(alphaRow).toHaveTextContent('2.5x');
    expect(screen.getByText(/overlay_unknown_company.*99/i)).toBeInTheDocument();
    expect(screen.getByText(/envelope_untrusted/i)).toBeInTheDocument();
    const deviations = screen
      .getByRole('heading', { name: 'D30 selection deviations' })
      .closest('section');
    expect(deviations).not.toBeNull();
    expect(
      within(deviations as HTMLElement).getByText(/working_value_selection_deviation/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/reserve selection differs from the default/i)).toBeInTheDocument();
    expect(screen.getByText(/one non-usd cash flow was excluded/i)).toBeInTheDocument();
    expect(screen.getByText(/follow_on.*approved/i)).toBeInTheDocument();
    expect(screen.getByText(/maxpercompany:infinity/i)).toBeInTheDocument();
    expectParticipationBasisDisclosureForEachCompany();
  });

  it('renders the per-row participation-basis disclosure under policy 1.0.1', () => {
    const run = makeReserveIntelligenceRun('financial-facts-policy/1.0.1');
    mockHook({ data: { kind: 'ready', run }, error: null, isLoading: false });

    render(<ReserveIntelligencePanel fundId={7} />);

    expectParticipationBasisDisclosureForEachCompany();
  });

  it('links facts per row, opens evidence, and discloses missing row fallback', async () => {
    const user = userEvent.setup();
    const run = makeReserveIntelligenceRun();
    mockHook({ data: { kind: 'ready', run }, error: null, isLoading: false });

    render(<ReserveIntelligencePanel fundId={7} />);

    await user.click(screen.getByRole('button', { name: 'Open reserve facts for Alpha' }));
    const alphaDrawer = screen.getByRole('dialog', { name: 'Alpha reserve evidence' });
    expect(within(alphaDrawer).getByText('PARTIAL')).toBeInTheDocument();
    expect(within(alphaDrawer).getByText(/companyId.*companyIdentityId/i)).toBeInTheDocument();
    expect(within(alphaDrawer).getByText(/participation refs: 1/i)).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Open reserve facts for Gamma' }));
    const gammaDrawer = screen.getByRole('dialog', { name: 'Gamma reserve evidence' });
    expect(within(gammaDrawer).getByText('No Gamma facts row disclosed')).toBeInTheDocument();
    expect(screen.getByText('No facts row disclosed', { selector: 'span' })).toBeInTheDocument();
  });

  it.each(['financial-facts-policy/1.0.1' as const, 'financial-facts-policy/1.1.0' as const])(
    'renders policy version %s without assuming details exist',
    async (policyVersion) => {
      const user = userEvent.setup();
      const run = makeReserveIntelligenceRun(policyVersion);
      mockHook({ data: { kind: 'ready', run }, error: null, isLoading: false });

      render(<ReserveIntelligencePanel fundId={7} />);

      expect(screen.getByText(policyVersion)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Open reserve facts for Alpha' }));
      const drawer = screen.getByRole('dialog', { name: 'Alpha reserve evidence' });
      if (policyVersion === 'financial-facts-policy/1.0.1') {
        expect(
          within(drawer).getByText(/does not disclose effective-terms refs/i)
        ).toBeInTheDocument();
      } else {
        expect(within(drawer).getByText(/valuation basis.*derived 1/i)).toBeInTheDocument();
      }
    }
  );

  it('keeps recompute disabled with reason and exposes no apply or write-back action', () => {
    const run = makeReserveIntelligenceRun();
    mockHook({ data: { kind: 'ready', run }, error: null, isLoading: false });

    render(<ReserveIntelligencePanel fundId={7} />);

    expect(
      screen.getByRole('button', { name: 'Recompute from latest accepted facts' })
    ).toBeDisabled();
    expect(screen.getByText(/recompute command is not available/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /apply|write back/i })).not.toBeInTheDocument();
  });
});
