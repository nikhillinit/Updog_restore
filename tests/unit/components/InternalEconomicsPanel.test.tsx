import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  INTERNAL_ECONOMICS_NOTICE,
  InternalEconomicsPanel,
  renderInternalEconomicsCopyText,
  type InternalEconomicsPanelGroup,
  type InternalEconomicsPanelProps,
} from '@/components/fund-results/InternalEconomicsPanel';
import { InternalLpEconomicsRunReceiptV1Schema } from '@shared/contracts/internal-economics/lp-economics-run-receipt-v1.contract';

const HASH = 'abcdef0123456789'.repeat(4);

function receipt(
  runId: number,
  lpCapitalCallUsd: string,
  factsSnapshotId = 5
) {
  return InternalLpEconomicsRunReceiptV1Schema.parse({
    receiptVersion: 'internal-lp-economics-run-receipt/1.0.0',
    runId,
    fundId: 7,
    createdAt: '2026-06-30T23:59:59.000Z',
    basis: {
      policyVersionId: 3,
      capitalEnvelopeVersionId: 4,
      factsSnapshotId,
      knowledgeCutoff: '2026-06-30T00:00:00.000Z',
      planVersionId: 6,
      forecastSnapshotId: 7,
      evaluationClock: '2026-06-30T23:59:59.000Z',
      terminalMode: 'hold_unrealized',
      terminalPeriodEnd: '2026-09-30',
      terminalResolutionMethodologyVersion: 'terminal-resolution/1.0.0',
    },
    versions: {
      calculationContractVersion: 'lp-economics/1.1.0',
      engineVersion: 'cash-assembly-period-loop-v1/1.1.0',
      methodologyVersion: 'cash-assembly-period-loop-methodology/1.1.0',
      resultCalculationVersion: 'lp-economics/1.1.0',
    },
    hashes: {
      capitalEnvelopeHash: HASH,
      policyAssumptionsHash: HASH,
      factsSnapshotInputHash: HASH,
      planAssumptionsHash: HASH,
      forecastInputHash: HASH,
      inputHash: HASH,
      resultHash: HASH,
    },
    outcome: {
      runState: 'completed',
      result: {
        waterfallTemplate: 'deal_by_deal',
        resultStatus: 'available',
        clock: '2026-06-30T23:59:59.000Z',
        currency: 'USD',
        perspective: 'lp_net',
        precisionMode: 'decimal_native_with_float64_xirr',
        quarters: [],
        waterfallEvents: [],
        totals: {
          lpCapitalCallUsd: `${lpCapitalCallUsd}.000000`,
          gpCommitmentCallUsd: '0.000000',
          portfolioDeploymentUsd: '0.000000',
          managementFeesUsd: '10.000000',
          fundExpensesUsd: '0.000000',
          grossRealizedProceedsUsd: '0.000000',
          lpCapitalReturnUsd: '0.000000',
          lpProfitUsd: '0.000000',
          lpDistributionUsd: '20.000000',
          gpInvestmentDistributionUsd: '0.000000',
          gpCarryDistributedUsd: '3.000000',
          endingCashUsd: '4.000000',
          grossNavUsd: '50.000000',
          lpNetNavUsd: '45.000000',
          dpi: '0.200000000000',
          rvpi: '0.450000000000',
          tvpi: '0.650000000000',
        },
        terminalNavBeforeRealizationUsd: '0.000000',
        lpNetIrr: '0.125000000000',
        lpNetIrrBasis: 'cash_only',
        lpNetIrrDiagnostic: {
          convergence: 'failed',
          iterations: 0,
          method: 'none',
          boundHit: null,
          failureReason: 'NO_SIGN_CHANGE',
        },
        reasons: [],
      },
    },
  });
}

function group(
  runId: number,
  overrides: Partial<InternalEconomicsPanelGroup['primaryPin']> = {}
): InternalEconomicsPanelGroup {
  const primaryPin = {
    sourceKind: 'draft' as const,
    sourceId: runId,
    periodStart: '2026-04-01',
    periodEnd: '2026-06-30',
    createdAt: '2026-07-01T00:00:00.000Z',
    knowledgeCutoff: '2026-07-01T00:00:00.000Z',
    analysisFactsSnapshotId: 5,
    mixedBasisAtSave: false,
    ...overrides,
  };
  return { runId, pins: [primaryPin], primaryPin };
}

function props(overrides: Partial<InternalEconomicsPanelProps> = {}): InternalEconomicsPanelProps {
  const groups = [group(10), group(20)];
  return {
    groups,
    selection: { baselineRunId: 10, currentRunId: 20 },
    baseline: { state: 'ready', runId: 10, receipt: receipt(10, '100'), error: null },
    current: { state: 'ready', runId: 20, receipt: receipt(20, '130'), error: null },
    onSelectionChange: vi.fn(),
    ...overrides,
  };
}

describe('InternalEconomicsPanel', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('renders labeled native selectors, semantic scoped tables, Decimal deltas, and methodology disclosure', () => {
    render(<InternalEconomicsPanel {...props()} />);

    expect(screen.getByRole('combobox', { name: 'Baseline economics run' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Comparison economics run' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Economics result metrics' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Receipt provenance comparison' })).toBeInTheDocument();
    for (const header of screen.getAllByRole('columnheader')) expect(header).toHaveAttribute('scope', 'col');
    for (const header of screen.getAllByRole('rowheader')) expect(header).toHaveAttribute('scope', 'row');
    expect(screen.getByTestId('internal-economics-copy-block')).toHaveTextContent(
      'LP calls: baseline=100.000000; comparison=130.000000; delta=30'
    );
    expect(screen.getAllByText(/forecast uses flat annual fee drag/i)).toHaveLength(2);
  });

  it('renders exact evidence text and copies that same payload with polite feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const input = props();
    const evidence = renderInternalEconomicsCopyText(input);
    render(<InternalEconomicsPanel {...input} />);

    const block = screen.getByTestId('internal-economics-copy-block');
    expect(block.textContent).toBe(evidence);
    expect(evidence).toContain(INTERNAL_ECONOMICS_NOTICE);
    expect(evidence).toContain('As of: 2026-07-01T00:00:00.000Z');
    expect(evidence).toContain('Receipt basis cutoff: 2026-06-30T00:00:00.000Z');
    expect(evidence).toContain(`Facts input hash (short): ${HASH.slice(0, 12)}`);
    expect(evidence).toContain(`factsSnapshotInputHash: ${HASH}`);

    await userEvent.click(screen.getByRole('button', { name: /copy the full internal economics/i }));
    expect(writeText).toHaveBeenCalledWith(evidence);
    expect(screen.getByText('Evidence copied')).toHaveAttribute('aria-live', 'polite');
  });

  it('shows both coherence warnings and suppresses numeric deltas', () => {
    const groups = [
      group(10),
      group(20, { sourceKind: 'reference', mixedBasisAtSave: true }),
    ];
    render(
      <InternalEconomicsPanel
        {...props({
          groups,
          baseline: { state: 'ready', runId: 10, receipt: receipt(10, '100', 99), error: null },
        })}
      />
    );

    expect(screen.getAllByText('Economics pin basis mismatch').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bundle mixed at save').length).toBeGreaterThan(0);
    expect(screen.getByTestId('internal-economics-copy-block')).toHaveTextContent(
      'LP calls: baseline=100.000000; comparison=130.000000; delta=Unavailable'
    );
  });

  it('supports zero and one-run states and swaps distinct selected runs', async () => {
    const onSelectionChange = vi.fn();
    const one = group(10);
    const { rerender } = render(
      <InternalEconomicsPanel
        {...props({
          groups: [],
          selection: { baselineRunId: null, currentRunId: null },
          baseline: { state: 'empty', runId: null, receipt: null, error: null },
          current: { state: 'empty', runId: null, receipt: null, error: null },
          onSelectionChange,
        })}
      />
    );
    expect(screen.getByText('No pinned economics runs are available for comparison.')).toBeInTheDocument();

    rerender(
      <InternalEconomicsPanel
        {...props({
          groups: [one],
          selection: { baselineRunId: null, currentRunId: 10 },
          baseline: { state: 'empty', runId: null, receipt: null, error: null },
          current: { state: 'ready', runId: 10, receipt: receipt(10, '100'), error: null },
          onSelectionChange,
        })}
      />
    );
    expect(screen.getByRole('option', { name: 'No baseline' })).toBeInTheDocument();

    rerender(<InternalEconomicsPanel {...props({ onSelectionChange })} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Baseline economics run' }), '20');
    expect(onSelectionChange).toHaveBeenLastCalledWith({ baselineRunId: 20, currentRunId: 10 });
  });

  it('keeps copy as the sole action and exposes no forbidden workflow controls', () => {
    render(<InternalEconomicsPanel {...props()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName(/copy/i);
    for (const forbidden of ['export', 'share', 'recipient', 'approve', 'deliver', 'payment', 'create run', 'pin', 'save']) {
      expect(screen.queryByRole('button', { name: new RegExp(forbidden, 'i') })).not.toBeInTheDocument();
    }
  });
});
