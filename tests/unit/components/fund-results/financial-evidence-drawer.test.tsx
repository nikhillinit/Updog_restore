import React, { useRef, useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FundMoicFactsBasisV1Schema } from '@shared/contracts/fund-moic-v1.contract';
import { FinancialEvidenceDrawer } from '@/components/fund-results/FinancialEvidenceDrawer';
import {
  evidenceFromMoicBasis,
  type FinancialEvidence,
} from '@/components/fund-results/financial-evidence';

const FACTS_HASH = 'c'.repeat(64);

/** Evidence derived from a schema-parsed contract fixture via the real adapter. */
function evidenceFixture(overrides: Partial<FinancialEvidence> = {}): FinancialEvidence {
  const basis = FundMoicFactsBasisV1Schema.parse({
    rankability: 'indicative',
    reasons: ['planning_fmv_stale'],
    observedInitialInvestment: '1000000.5',
    observedFollowOnInvestment: '250000',
    observedTotalInvestment: '1250000.5',
    valuationAnchor: { kind: 'planning_fmv', value: '4000000', asOfDate: '2026-07-12' },
    planningFmvStatus: 'stale',
    currencyStatus: 'base_currency',
    factsInputHash: FACTS_HASH,
    warnings: [
      {
        code: 'PLANNING_FMV_STALE',
        severity: 'warning',
        message: 'Planning FMV is stale.',
      },
    ],
  });
  return { ...evidenceFromMoicBasis(basis), asOfDate: '2026-07-10', ...overrides };
}

function assertPrecedes(first: HTMLElement, second: HTMLElement) {
  expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

function DrawerHarness({ evidence }: { evidence: FinancialEvidence }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={triggerRef} onClick={() => setOpen(true)}>
        Open evidence
      </button>
      <FinancialEvidenceDrawer
        open={open}
        onOpenChange={setOpen}
        entityLabel="Acme Corp"
        evidence={evidence}
        decisionState="indicative"
        returnFocusRef={triggerRef}
      />
    </>
  );
}

describe('FinancialEvidenceDrawer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a labeled region with the D-B section order and exactly one proof slot', () => {
    render(
      <FinancialEvidenceDrawer
        open
        onOpenChange={() => {}}
        entityLabel="Acme Corp"
        evidence={evidenceFixture()}
        decisionState="indicative"
        decisionReason="Planning FMV is stale."
        proofSlot={<div data-testid="proof-slot-content">proof rows</div>}
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'Acme Corp' });
    const utils = within(dialog);

    // (1) header: entity + as-of + labeled decision state + inline primary reason
    expect(utils.getByText('Acme Corp')).toBeInTheDocument();
    expect(utils.getByText('2026-07-10')).toHaveClass('tabular-nums');
    expect(utils.getByText('Decision state')).toBeInTheDocument();
    const badge = utils.getByText('Indicative');
    expect(badge).toHaveClass('text-presson-textMuted');
    expect(utils.getByText('Planning FMV is stale.', { selector: 'span' })).toBeInTheDocument();

    // (2) compact evidence fields
    expect(utils.getByText('Source')).toBeInTheDocument();
    expect(utils.getByText('fund_moic_facts')).toBeInTheDocument();
    expect(utils.getByText('Contract version')).toBeInTheDocument();
    expect(utils.getByText('fund-moic-v1')).toBeInTheDocument();
    expect(utils.getByText('Trust state')).toBeInTheDocument();
    expect(utils.getByText('Currency status')).toBeInTheDocument();

    // (3) exactly one proof slot, headed "Facts basis"
    expect(utils.getAllByText('Facts basis')).toHaveLength(1);
    expect(utils.getByTestId('proof-slot-content')).toBeInTheDocument();

    // (4) warnings, (5) provenance LAST as a collapsed disclosure
    const provenanceToggle = utils.getByRole('button', { name: 'Provenance' });
    expect(provenanceToggle).toHaveAttribute('aria-expanded', 'false');

    assertPrecedes(badge, utils.getByText('Source'));
    assertPrecedes(utils.getByText('Source'), utils.getByText('Facts basis'));
    assertPrecedes(utils.getByText('Facts basis'), utils.getByText('Warnings'));
    assertPrecedes(utils.getByText('Warnings'), provenanceToggle);
    expect(utils.getByText('Planning FMV is stale.', { selector: 'li' })).toBeInTheDocument();
  });

  it('copies the FULL hash while displaying the 12-char short form', async () => {
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWrite },
    });

    render(
      <FinancialEvidenceDrawer
        open
        onOpenChange={() => {}}
        entityLabel="Acme Corp"
        evidence={evidenceFixture()}
        decisionState="indicative"
      />
    );

    const provenanceToggle = screen.getByRole('button', { name: 'Provenance' });
    fireEvent.click(provenanceToggle);
    expect(provenanceToggle).toHaveAttribute('aria-expanded', 'true');

    expect(screen.getByText(FACTS_HASH.slice(0, 12))).toBeInTheDocument();
    expect(screen.queryByText(FACTS_HASH)).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Copy full facts input hash for Acme Corp' })
    );
    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledWith(FACTS_HASH));

    // assumptionsHash is null -> "Not disclosed" and no copy button for it
    expect(screen.getByText('Not disclosed')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Copy full assumptions hash for Acme Corp' })
    ).not.toBeInTheDocument();
  });

  it('closes on Escape and restores focus to the trigger via returnFocusRef', async () => {
    const user = userEvent.setup();
    render(<DrawerHarness evidence={evidenceFixture()} />);

    await user.click(screen.getByRole('button', { name: 'Open evidence' }));
    await screen.findByRole('dialog', { name: 'Acme Corp' });

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Acme Corp' })).not.toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'Open evidence' })).toHaveFocus();
  });

  it('renders the loading state as skeleton rows with tabular-nums placeholders', () => {
    render(
      <FinancialEvidenceDrawer
        open
        onOpenChange={() => {}}
        entityLabel="Acme Corp"
        status="loading"
        evidence={null}
        decisionState="indicative"
      />
    );

    expect(screen.getByText('resolving evidence…')).toBeInTheDocument();
    const rows = screen.getAllByTestId('evidence-skeleton-row');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).toHaveClass('animate-pulse', 'motion-reduce:animate-none');
      expect(row.querySelector('.tabular-nums')).not.toBeNull();
    }
  });

  it('renders the failed state as not_actionable with the reason, never success-colored', () => {
    const { container } = render(
      <FinancialEvidenceDrawer
        open
        onOpenChange={() => {}}
        entityLabel="Acme Corp"
        status="failed"
        statusReason="Facts fetch timed out."
        evidence={null}
        decisionState="actionable"
      />
    );

    expect(screen.getAllByText('Facts unavailable').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Facts fetch timed out.', { selector: 'span' })).toBeInTheDocument();
    // badge forced to the not_actionable presentation (hollow dot)
    const dot = screen.getByTestId('evidence-decision-dot');
    expect(dot).toHaveClass('border-charcoal-400', 'bg-transparent');
    expect(container.innerHTML).not.toMatch(
      /success|positive|confidence-|charcoal-500|warning-dark|#10b981|#127E3D/
    );
  });

  it('renders the empty state with the facts domain noun and the as-of date', () => {
    render(
      <FinancialEvidenceDrawer
        open
        onOpenChange={() => {}}
        entityLabel="Acme Corp"
        status="empty"
        factsDomainNoun="cash flows"
        evidence={evidenceFixture()}
        decisionState="not_actionable"
      />
    );

    expect(screen.getByText(/No cash flows disclosed/)).toBeInTheDocument();
    expect(screen.getByText('2026-07-10')).toHaveClass('tabular-nums');
  });

  it('caps drawer content transitions at 200ms and gates them behind motion-reduce', () => {
    render(
      <FinancialEvidenceDrawer
        open
        onOpenChange={() => {}}
        entityLabel="Acme Corp"
        evidence={evidenceFixture()}
        decisionState="indicative"
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'Acme Corp' });
    expect(dialog.className).toContain('data-[state=open]:duration-200');
    expect(dialog.className).toContain('data-[state=closed]:duration-200');
    expect(dialog.className).toContain('motion-reduce:transition-none');
    expect(dialog.className).toContain('motion-reduce:animate-none');
  });
});
