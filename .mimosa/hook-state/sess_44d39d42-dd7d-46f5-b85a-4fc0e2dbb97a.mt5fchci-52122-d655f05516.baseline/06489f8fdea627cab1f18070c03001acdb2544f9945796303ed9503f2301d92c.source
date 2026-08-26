/**
 * Fund-scoped reports route (Plan 9 Wave 9B1, D-F.3).
 *
 * Pins the fund-scope wrapper: /^\d+$/ guard idiom on the route fund id,
 * FundContext verification before mounting the pipeline, and the GP
 * qualification strip rendered ABOVE the existing metrics pipeline.
 */

import React, { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { createWouterWrapper } from '../../utils/withWouter';
import FundModelResultsReportsPage from '../../../client/src/pages/fund-model-results-reports';
import type { LpReportingMetricsPageProps } from '../../../client/src/pages/lp-reporting/metrics';

const mocks = vi.hoisted(() => ({
  fundContext: {
    currentFund: { id: 42, name: 'Fund Forty Two' } as { id: number; name: string } | null,
    fundId: 42 as number | null,
    isLoading: false,
  },
  pipelineSnapshot: null as unknown,
}));

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => mocks.fundContext,
}));

vi.mock('@/pages/lp-reporting/metrics', () => ({
  default: function MetricsPipelineStub({ onQualificationSnapshot }: LpReportingMetricsPageProps) {
    useEffect(() => {
      if (mocks.pipelineSnapshot !== null && onQualificationSnapshot) {
        onQualificationSnapshot(
          mocks.pipelineSnapshot as Parameters<
            NonNullable<LpReportingMetricsPageProps['onQualificationSnapshot']>
          >[0]
        );
      }
    }, [onQualificationSnapshot]);
    return <div>Metrics Pipeline Stub</div>;
  },
}));

function renderAt(path: string) {
  const { Wrapper, goto } = createWouterWrapper(path);
  return { goto, ...render(<FundModelResultsReportsPage />, { wrapper: Wrapper }) };
}

describe('FundModelResultsReportsPage', () => {
  beforeEach(() => {
    mocks.fundContext.currentFund = { id: 42, name: 'Fund Forty Two' };
    mocks.fundContext.fundId = 42;
    mocks.fundContext.isLoading = false;
    mocks.pipelineSnapshot = null;
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the qualification strip above the pipeline for a valid fund id', () => {
    renderAt('/fund-model-results/42/reports');

    const strip = screen.getByTestId('gp-qualification-strip');
    const pipeline = screen.getByText('Metrics Pipeline Stub');
    expect(strip).toBeInTheDocument();
    expect(pipeline).toBeInTheDocument();
    // Strip renders ABOVE the pipeline in document order.
    expect(strip.compareDocumentPosition(pipeline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Fund identity appears in the page header and the workspace-row context.
    expect(screen.getAllByText('Fund Forty Two').length).toBeGreaterThanOrEqual(1);
  });

  it('mounts the workspace row with Reports active and the current-basis indicator', () => {
    renderAt('/fund-model-results/42/reports');

    const reportsLink = screen.getByRole('link', { name: 'Reports' });
    expect(reportsLink).toHaveAttribute('aria-current', 'page');
    expect(reportsLink).toHaveAttribute('href', '/fund-model-results/42/reports');
    expect(screen.getByText('Basis: Current')).toBeInTheDocument();
  });

  it('rejects a non-numeric fund id with the guard idiom and withholds the pipeline', () => {
    renderAt('/fund-model-results/abc/reports');

    expect(screen.getByText('Invalid fund ID')).toBeInTheDocument();
    expect(screen.queryByText('Metrics Pipeline Stub')).not.toBeInTheDocument();
    expect(screen.queryByTestId('gp-qualification-strip')).not.toBeInTheDocument();
  });

  it('rejects a non-positive fund id', () => {
    renderAt('/fund-model-results/0/reports');

    expect(screen.getByText('Invalid fund ID')).toBeInTheDocument();
    expect(screen.queryByText('Metrics Pipeline Stub')).not.toBeInTheDocument();
  });

  it('withholds the pipeline and the strip while the fund context resolves', () => {
    mocks.fundContext.fundId = null;
    mocks.fundContext.currentFund = null;
    mocks.fundContext.isLoading = true;

    renderAt('/fund-model-results/42/reports');

    expect(screen.getByText('Resolving fund scope')).toBeInTheDocument();
    expect(screen.queryByText('Metrics Pipeline Stub')).not.toBeInTheDocument();
    expect(screen.queryByTestId('gp-qualification-strip')).not.toBeInTheDocument();
  });

  it('never renders the pipeline, strip, or prior-fund identity outside the resolved scope', () => {
    mocks.fundContext.fundId = 7;
    mocks.fundContext.currentFund = { id: 7, name: 'Other Fund' };

    renderAt('/fund-model-results/42/reports');

    expect(screen.getByText('Fund not available')).toBeInTheDocument();
    expect(screen.queryByText('Metrics Pipeline Stub')).not.toBeInTheDocument();
    expect(screen.queryByTestId('gp-qualification-strip')).not.toBeInTheDocument();
    // Review P1-2: the context fund's identity never leaks onto this route.
    expect(screen.queryByText(/Other Fund/)).not.toBeInTheDocument();
    // Fund-scoped nav destinations render disabled with reason for the
    // unavailable fund (D-C).
    expect(screen.getByTestId('workspace-nav-reports-disabled')).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('clears fund-42 qualification state before returning to that fund without a new publication', () => {
    mocks.pipelineSnapshot = {
      metricRun: { metricRunId: 7, status: 'locked', asOfDate: '2026-06-30', evidenceCount: 2 },
      reportPackage: { status: 'assembled', asOfDate: '2026-06-30' },
      exportBlockers: [],
      exportProven: false,
      gateErrorReason: null,
      lastStoredExportAt: null,
    };

    const { goto } = renderAt('/fund-model-results/42/reports');
    expect(screen.getByText('Qualified pending export gates')).toBeInTheDocument();

    // Disable subsequent pipeline publications. Returning to fund 42 must
    // render from cleared state rather than resurrecting its prior snapshot.
    mocks.pipelineSnapshot = null;
    act(() => goto('/fund-model-results/999/reports'));

    // Review P1-2: nothing from fund 42 survives — no name, no snapshot-backed
    // strip, no live fund-scoped links.
    expect(screen.queryByText(/Fund Forty Two/)).not.toBeInTheDocument();
    expect(screen.queryByText('Qualified pending export gates')).not.toBeInTheDocument();
    expect(screen.queryByTestId('gp-qualification-strip')).not.toBeInTheDocument();
    expect(screen.queryByText('Metrics Pipeline Stub')).not.toBeInTheDocument();
    expect(screen.getByText('Fund not available')).toBeInTheDocument();
    for (const key of ['summary', 'reserves', 'scenarios', 'reports']) {
      expect(screen.getByTestId(`workspace-nav-${key}-disabled`)).toHaveAttribute(
        'aria-disabled',
        'true'
      );
    }

    act(() => goto('/fund-model-results/42/reports'));

    expect(screen.getByText('Metrics Pipeline Stub')).toBeInTheDocument();
    expect(screen.getByTestId('gp-qualification-strip')).toBeInTheDocument();
    expect(screen.getByText('Not export-ready')).toBeInTheDocument();
    expect(screen.getByTestId('gp-qualification-metric-run')).toHaveTextContent(
      'No metric run disclosed'
    );
    expect(screen.queryByText('Qualified pending export gates')).not.toBeInTheDocument();
    expect(screen.queryByText('Metric run #7 — locked')).not.toBeInTheDocument();
  });

  it('upgrades the strip when the pipeline publishes a qualification snapshot', () => {
    mocks.pipelineSnapshot = {
      metricRun: { metricRunId: 7, status: 'locked', asOfDate: '2026-06-30', evidenceCount: 2 },
      reportPackage: { status: 'assembled', asOfDate: '2026-06-30' },
      exportBlockers: [],
      exportProven: false,
      gateErrorReason: null,
      lastStoredExportAt: null,
    };

    renderAt('/fund-model-results/42/reports');

    expect(screen.getByText('Qualified pending export gates')).toBeInTheDocument();
    expect(screen.getByTestId('gp-qualification-metric-run')).toHaveTextContent(
      'Metric run #7 — locked'
    );
  });
});
