/**
 * Rendering tests for the Summary readiness rollup table (Plan 9 Wave 9B2).
 *
 * Pins the D-A dense-table grammar (dedicated Decision state column, neutral
 * blocked-count line, muted inline primary reason), D-D disclosure keyboard
 * parity, tabular-nums on numerics and skeletons, fund-carrying links, and
 * the D-C loading/disabled fallbacks. Every query is scoped inside the
 * rollup's own testid — the surface labels intentionally collide with the
 * workspace nav row on the real page (L5).
 */

import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWouterWrapper } from '../../../utils/withWouter';
import { FundReadinessRollup } from '../../../../client/src/pages/fund-model-results/FundReadinessRollup';
import type {
  ReadinessRollupModel,
  ReadinessRollupRow,
} from '../../../../client/src/pages/fund-model-results/readiness-rollup';

function row(overrides: Partial<ReadinessRollupRow> & Pick<ReadinessRollupRow, 'key' | 'label'>) {
  return {
    loading: false,
    state: 'actionable' as const,
    stateLabel: null,
    primaryReason: null,
    asOfDate: null,
    href: null,
    hrefDisabledReason: null,
    blockedSummary: null,
    details: [],
    ...overrides,
  };
}

function modelFixture(overrides: Partial<ReadinessRollupModel> = {}): ReadinessRollupModel {
  const rows: ReadinessRollupRow[] = [
    row({
      key: 'forecast',
      label: 'Forecast',
      href: '/financial-modeling?fundId=42',
      asOfDate: '2026-07-01',
    }),
    row({
      key: 'portfolio-actuals',
      label: 'Portfolio Actuals',
      href: '/portfolio?tab=reserve-planning&fundId=42',
      state: 'indicative',
      primaryReason: '2 companies degraded',
      blockedSummary: '3 drifted, 1 material',
      asOfDate: '2026-07-02',
    }),
    row({
      key: 'reserves',
      label: 'Reserves',
      href: '/fund-model-results/42/moic-analysis',
      state: 'not_actionable',
      stateLabel: 'Facts unavailable',
      primaryReason: 'The reserve rankings read failed',
    }),
    row({
      key: 'scenarios',
      label: 'Scenarios',
      href: '/fund-model-results/42/scenarios',
      state: 'indicative',
      primaryReason: 'first warning',
      details: ['first warning', 'second warning'],
    }),
    row({
      key: 'reports',
      label: 'Reports',
      href: '/fund-model-results/42/reports',
      state: 'not_actionable',
      stateLabel: 'Not verified',
      primaryReason: 'Qualification is verified on the Reports surface',
    }),
  ];
  return { rows, surfaceCount: 5, blockedCount: 2, ...overrides };
}

function renderRollup(model: ReadinessRollupModel) {
  const { Wrapper } = createWouterWrapper('/fund-model-results/42');
  render(<FundReadinessRollup model={model} />, { wrapper: Wrapper });
  return within(screen.getByTestId('fund-readiness-rollup'));
}

afterEach(() => cleanup());

describe('FundReadinessRollup', () => {
  it('renders the outcome-bearing heading and all five surface rows', () => {
    const rollup = renderRollup(modelFixture());

    expect(
      rollup.getByRole('heading', { level: 2, name: 'Readiness — what is blocked and where' })
    ).toBeInTheDocument();
    for (const key of ['forecast', 'portfolio-actuals', 'reserves', 'scenarios', 'reports']) {
      expect(rollup.getByTestId(`readiness-row-${key}`)).toBeInTheDocument();
    }
  });

  it('renders the neutral blocked-count line above the rows with tabular numerals', () => {
    const rollup = renderRollup(modelFixture());

    const line = rollup.getByTestId('fund-readiness-rollup-blocked-count');
    expect(line).toHaveTextContent('2 of 5 surfaces not actionable');
    expect(line.querySelectorAll('.tabular-nums')).toHaveLength(2);
    // The line renders ABOVE the table rows.
    expect(
      line.compareDocumentPosition(rollup.getByTestId('readiness-row-forecast')) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('omits the blocked-count line when nothing is blocked', () => {
    const model = modelFixture({
      rows: modelFixture().rows.map((candidate) => ({
        ...candidate,
        state: 'actionable' as const,
        stateLabel: null,
      })),
      blockedCount: 0,
    });
    const rollup = renderRollup(model);

    expect(rollup.queryByTestId('fund-readiness-rollup-blocked-count')).not.toBeInTheDocument();
  });

  it('gives every row a dedicated Decision state column via the shared badge', () => {
    const rollup = renderRollup(modelFixture());

    expect(rollup.getByRole('columnheader', { name: 'Decision state' })).toBeInTheDocument();
    // Actionable: full-ink label, no dot.
    const forecastRow = within(rollup.getByTestId('readiness-row-forecast'));
    expect(forecastRow.getByText('Actionable')).toBeInTheDocument();
    expect(forecastRow.queryByTestId('readiness-forecast-dot')).not.toBeInTheDocument();
    // Domain label + hollow dot for a facts failure; dot is aria-hidden with
    // the visible text label alongside (DecisionStateBadge integration).
    const reservesRow = within(rollup.getByTestId('readiness-row-reserves'));
    expect(reservesRow.getByText('Facts unavailable')).toBeInTheDocument();
    expect(reservesRow.getByTestId('readiness-reserves-dot')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    // Indicative: amber dot present.
    const scenariosRow = within(rollup.getByTestId('readiness-row-scenarios'));
    expect(scenariosRow.getByTestId('readiness-scenarios-dot')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });

  it('shows the primary blocker inline muted with the counts summary beneath', () => {
    const rollup = renderRollup(modelFixture());

    const reason = rollup.getByTestId('readiness-row-portfolio-actuals-reason');
    expect(reason).toHaveTextContent('2 companies degraded');
    expect(reason.className).toContain('text-presson-textMuted');
    const summary = rollup.getByTestId('readiness-row-portfolio-actuals-blocked-summary');
    expect(summary).toHaveTextContent('3 drifted, 1 material');
    expect(summary.className).toContain('tabular-nums');
  });

  it('keeps full warnings behind a keyboard-parity row disclosure (D-D)', async () => {
    const user = userEvent.setup();
    const rollup = renderRollup(modelFixture());

    const disclosure = rollup.getByTestId('readiness-row-scenarios-disclosure');
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    expect(rollup.queryByTestId('readiness-row-scenarios-details')).not.toBeInTheDocument();

    await user.click(disclosure);
    expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    const details = rollup.getByTestId('readiness-row-scenarios-details');
    expect(within(details).getByText('second warning')).toBeInTheDocument();
    expect(disclosure).toHaveAttribute('aria-controls', 'readiness-row-scenarios-details');

    // Enter closes, Space reopens (native button parity).
    disclosure.focus();
    await user.keyboard('{Enter}');
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    expect(rollup.queryByTestId('readiness-row-scenarios-details')).not.toBeInTheDocument();
    await user.keyboard(' ');
    expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders no disclosure affordance for rows without warnings', () => {
    const rollup = renderRollup(modelFixture());

    expect(rollup.queryByTestId('readiness-row-forecast-disclosure')).not.toBeInTheDocument();
  });

  it('renders as-of dates in tabular numerals and an em dash when undisclosed', () => {
    const rollup = renderRollup(modelFixture());

    const forecastCells = rollup.getByTestId('readiness-row-forecast').querySelectorAll('td');
    const asOfCell = forecastCells[3];
    expect(asOfCell?.textContent).toBe('2026-07-01');
    expect(asOfCell?.className).toContain('tabular-nums');
    const reportsCells = rollup.getByTestId('readiness-row-reports').querySelectorAll('td');
    expect(reportsCells[3]?.textContent).toBe('—');
  });

  it('links each surface with a fund-carrying underlined text link', () => {
    const rollup = renderRollup(modelFixture());

    expect(rollup.getByTestId('readiness-link-forecast')).toHaveAttribute(
      'href',
      '/financial-modeling?fundId=42'
    );
    expect(rollup.getByTestId('readiness-link-reserves')).toHaveAttribute(
      'href',
      '/fund-model-results/42/moic-analysis'
    );
    expect(rollup.getByTestId('readiness-link-reports')).toHaveAttribute(
      'href',
      '/fund-model-results/42/reports'
    );
    expect(rollup.getByTestId('readiness-link-scenarios').className).toContain('underline');
  });

  it('renders gated rows disabled with their reason, never dead links (D-C)', () => {
    const model = modelFixture({
      rows: modelFixture().rows.map((candidate) =>
        candidate.key === 'reports'
          ? {
              ...candidate,
              href: null,
              hrefDisabledReason: 'Select a fund to open this view',
            }
          : candidate
      ),
    });
    const rollup = renderRollup(model);

    const disabled = rollup.getByTestId('readiness-link-reports-disabled');
    expect(disabled).toHaveAttribute('aria-disabled', 'true');
    expect(disabled).toHaveTextContent('Reports');
    expect(disabled).toHaveTextContent('(Select a fund to open this view)');
    expect(rollup.queryByTestId('readiness-link-reports')).not.toBeInTheDocument();
  });

  it('renders loading rows as skeletons with tabular-nums, motion-gated placeholders', () => {
    const model = modelFixture({
      rows: modelFixture().rows.map((candidate) =>
        candidate.key === 'forecast'
          ? { ...candidate, loading: true, state: 'not_actionable' as const }
          : candidate
      ),
    });
    const rollup = renderRollup(model);

    const loadingRow = rollup.getByTestId('readiness-row-forecast');
    expect(within(loadingRow).queryByText('Actionable')).not.toBeInTheDocument();
    expect(within(loadingRow).queryByText('Not actionable')).not.toBeInTheDocument();
    const skeletons = loadingRow.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
    for (const skeleton of skeletons) {
      expect(skeleton.className).toContain('tabular-nums');
      expect(skeleton.className).toContain('motion-reduce:animate-none');
      expect(skeleton).toHaveAttribute('aria-hidden', 'true');
    }
  });
});
