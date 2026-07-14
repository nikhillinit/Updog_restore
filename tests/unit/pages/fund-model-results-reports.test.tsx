/**
 * Fund-scoped reports route (Plan 9 Wave 9B1, D-F.3).
 *
 * Pins the fund-scope wrapper: /^\d+$/ guard idiom on the route fund id,
 * FundContext verification before mounting the pipeline, and the GP
 * qualification strip rendered ABOVE the existing metrics pipeline.
 */

import React, { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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
  default: ({ onQualificationSnapshot }: LpReportingMetricsPageProps) => {
    function PipelineStub() {
      useEffect(() => {
        if (mocks.pipelineSnapshot !== null && onQualificationSnapshot) {
          onQualificationSnapshot(
            mocks.pipelineSnapshot as Parameters<
              NonNullable<LpReportingMetricsPageProps['onQualificationSnapshot']>
            >[0]
          );
        }
      }, []);
      return <div>Metrics Pipeline Stub</div>;
    }
    return <PipelineStub />;
  },
}));

function renderAt(path: string) {
  const { Wrapper } = createWouterWrapper(path);
  return render(<FundModelResultsReportsPage />, { wrapper: Wrapper });
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
    expect(screen.getByText('Fund Forty Two')).toBeInTheDocument();
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

  it('withholds the pipeline while the fund context resolves', () => {
    mocks.fundContext.fundId = null;
    mocks.fundContext.currentFund = null;
    mocks.fundContext.isLoading = true;

    renderAt('/fund-model-results/42/reports');

    expect(screen.getByText('Resolving fund scope')).toBeInTheDocument();
    expect(screen.queryByText('Metrics Pipeline Stub')).not.toBeInTheDocument();
  });

  it('never renders the pipeline for a fund outside the resolved scope', () => {
    mocks.fundContext.fundId = 7;
    mocks.fundContext.currentFund = { id: 7, name: 'Other Fund' };

    renderAt('/fund-model-results/42/reports');

    expect(screen.getByText('Fund not available')).toBeInTheDocument();
    expect(screen.queryByText('Metrics Pipeline Stub')).not.toBeInTheDocument();
  });

  it('upgrades the strip when the pipeline publishes a qualification snapshot', () => {
    mocks.pipelineSnapshot = {
      metricRun: { metricRunId: 7, status: 'locked', asOfDate: '2026-06-30', evidenceCount: 2 },
      reportPackage: { status: 'assembled', asOfDate: '2026-06-30' },
      exportBlockers: [],
      exportProven: false,
    };

    renderAt('/fund-model-results/42/reports');

    expect(screen.getByText('Qualified pending export gates')).toBeInTheDocument();
    expect(screen.getByTestId('gp-qualification-metric-run')).toHaveTextContent(
      'Metric run #7 — locked'
    );
  });
});
