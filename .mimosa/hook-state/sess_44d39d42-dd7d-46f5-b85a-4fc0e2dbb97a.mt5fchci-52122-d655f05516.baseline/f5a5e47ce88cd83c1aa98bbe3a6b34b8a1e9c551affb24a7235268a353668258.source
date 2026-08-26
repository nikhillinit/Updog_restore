import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  EvidenceHeader,
  type EvidenceHeaderLifecycle,
} from '../../../../client/src/components/results/EvidenceHeader';

function lifecycleBacked(
  overrides: Partial<EvidenceHeaderLifecycle> = {}
): EvidenceHeaderLifecycle {
  return {
    status: 'ready',
    configVersion: 3,
    runId: 7,
    lastCalculatedAt: '2026-03-20T12:30:00.000Z',
    publishedVersion: 3,
    source: 'fund_snapshots',
    ...overrides,
  };
}

describe('EvidenceHeader', () => {
  it('renders lifecycle-backed evidence with config, run, source, and freshness', () => {
    render(<EvidenceHeader lifecycle={lifecycleBacked()} testId="ev" />);

    const header = screen.getByTestId('ev');
    expect(within(header).getByText('READY')).toBeInTheDocument();
    expect(within(header).getByText('CONFIG v3')).toBeInTheDocument();
    expect(within(header).getByText('RUN #7')).toBeInTheDocument();
    expect(within(header).getByText('SOURCE fund_snapshots')).toBeInTheDocument();
    expect(within(header).getByText('CURRENT')).toBeInTheDocument();
    expect(within(header).queryByText('RUN UNAVAILABLE')).toBeNull();
  });

  it('renders RUN UNAVAILABLE when a lifecycle run id is missing', () => {
    render(<EvidenceHeader lifecycle={lifecycleBacked({ runId: null })} testId="ev" />);

    const header = screen.getByTestId('ev');
    expect(within(header).getByText('RUN UNAVAILABLE')).toBeInTheDocument();
  });

  it('renders section-backed evidence without a run segment', () => {
    render(
      <EvidenceHeader
        lifecycle={lifecycleBacked({
          provenanceLevel: 'section_backed_result',
          configVersion: 2,
          runId: null,
          source: 'fund_snapshots',
        })}
        testId="ev"
      />
    );

    const header = screen.getByTestId('ev');
    expect(within(header).getByText('CONFIG v2')).toBeInTheDocument();
    expect(within(header).getByText('SOURCE fund_snapshots')).toBeInTheDocument();
    // section-backed sections emit no run id at all
    expect(within(header).queryByText(/^RUN /)).toBeNull();
  });

  it('renders config-backed setup evidence with a published timestamp and no run', () => {
    render(
      <EvidenceHeader
        lifecycle={lifecycleBacked({
          provenanceLevel: 'config_backed_setup',
          configVersion: 12,
          runId: null,
          source: 'fund_config',
          lastCalculatedAt: '2026-06-02T09:00:00.000Z',
        })}
        testId="ev"
      />
    );

    const header = screen.getByTestId('ev');
    expect(within(header).getByText('CONFIG')).toBeInTheDocument();
    expect(within(header).getByText('CONFIG v12')).toBeInTheDocument();
    expect(within(header).getByText('SOURCE fund_config')).toBeInTheDocument();
    expect(within(header).getByText(/^PUBLISHED /)).toBeInTheDocument();
    expect(within(header).queryByText('PUBLISHED UNAVAILABLE')).toBeNull();
    // a setup section never claims a calculation run or calc freshness
    expect(within(header).queryByText(/^RUN /)).toBeNull();
    expect(within(header).queryByText('CURRENT')).toBeNull();
    expect(within(header).queryByText(/^CALCULATED /)).toBeNull();
  });

  it('labels a missing published timestamp as unavailable for config-backed setup', () => {
    render(
      <EvidenceHeader
        lifecycle={lifecycleBacked({
          provenanceLevel: 'config_backed_setup',
          configVersion: 5,
          runId: null,
          source: 'fund_config',
          lastCalculatedAt: null,
        })}
        testId="ev"
      />
    );

    const header = screen.getByTestId('ev');
    expect(within(header).getByText('PUBLISHED UNAVAILABLE')).toBeInTheDocument();
  });

  it('renders mixed-source evidence without claiming a single source', () => {
    render(
      <EvidenceHeader
        lifecycle={lifecycleBacked({
          provenanceLevel: 'mixed_scorecard_sources',
          sourceLabel: 'funds / fund_snapshots / fund_state',
          configVersion: null,
          runId: null,
        })}
        testId="ev"
      />
    );

    const header = screen.getByTestId('ev');
    expect(within(header).getByText('MIXED')).toBeInTheDocument();
    expect(
      within(header).getByText('SOURCES funds / fund_snapshots / fund_state')
    ).toBeInTheDocument();
    expect(within(header).queryByText(/^CONFIG/)).toBeNull();
    expect(within(header).queryByText(/^RUN /)).toBeNull();
    expect(within(header).queryByText(/^CALCULATED /)).toBeNull();
    expect(within(header).queryByText('CURRENT')).toBeNull();
  });

  it('renders only the derived sources for mixed evidence without padding absent sources', () => {
    render(
      <EvidenceHeader
        lifecycle={lifecycleBacked({
          provenanceLevel: 'mixed_scorecard_sources',
          sourceLabel: 'funds',
          configVersion: null,
          runId: null,
        })}
        testId="ev"
      />
    );

    const header = screen.getByTestId('ev');
    expect(within(header).getByText('SOURCES funds')).toBeInTheDocument();
    expect(header).not.toHaveTextContent('fund_snapshots');
    expect(header).not.toHaveTextContent('fund_state');
  });
});
