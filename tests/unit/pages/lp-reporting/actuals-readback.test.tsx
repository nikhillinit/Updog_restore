import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ActualMetricsReadback } from '@/components/lp-reporting/ActualMetricsReadback';
import type {
  ActualMetricsV2,
  ActualsPublishReceiptV1,
  FinancialFactsLatestReferenceV1,
} from '@shared/contracts/lp-reporting';

const hash = 'd'.repeat(64);
const available = (value: string) => ({
  availability: 'available' as const,
  value,
  reasonCodes: [],
  sourceRefs: ['fixture'],
});
const unavailable = {
  availability: 'unavailable' as const,
  value: null,
  reasonCodes: ['SOURCE_NOT_SUPPLIED' as const],
  sourceRefs: [],
};

const receipt: ActualsPublishReceiptV1 = {
  contractVersion: 'actuals-pilot-publish-receipt/1.0.0',
  operationHash: 'e'.repeat(64),
  fundId: 7,
  asOfDate: '2026-09-04',
  coverage: { ledger: 'inception_to_date', priorFactsSnapshotId: null },
  admitted: {
    ledger: {
      sourceArtifactId: 1,
      payloadSha256: 'a'.repeat(64),
      canonicalRowsHash: 'b'.repeat(64),
      previewHash: 'c'.repeat(64),
      approvedRowIds: [1],
      approvedCount: 1,
    },
    valuation: null,
    importBatchId: '11111111-1111-4111-8111-111111111111',
  },
  facts: {
    policyVersion: 'financial-facts-policy/1.4.0',
    payloadSchemaId: 'financial-facts-payload/5',
    supersedesSnapshotId: null,
    knowledgeCutoff: '2026-09-04T12:00:00.000Z',
    snapshotId: 41,
    snapshotInputHash: hash,
    etag: `"financial-facts:41:${hash}"`,
  },
  basisRef: {
    schemaId: 'financial-facts-basis-ref/1.0.0',
    fundId: 7,
    snapshotId: 41,
    snapshotInputHash: hash,
    sourceFactsInputHash: hash,
    policyVersion: 'financial-facts-policy/1.4.0',
    asOfDate: '2026-09-04',
    knowledgeCutoff: '2026-09-04T12:00:00.000Z',
  },
};

const currentHead: NonNullable<FinancialFactsLatestReferenceV1['head']> = {
  snapshotId: 42,
  asOfDate: '2026-09-05',
  knowledgeCutoff: '2026-09-05T12:00:00.000Z',
  policyVersion: 'financial-facts-policy/1.5.0',
  payloadSchemaId: 'financial-facts-payload/6',
  snapshotInputHash: 'f'.repeat(64),
  supersedesSnapshotId: 41,
  basisRef: {
    ...receipt.basisRef,
    snapshotId: 42,
    snapshotInputHash: 'f'.repeat(64),
    sourceFactsInputHash: 'e'.repeat(64),
    policyVersion: 'financial-facts-policy/1.5.0',
    asOfDate: '2026-09-05',
    knowledgeCutoff: '2026-09-05T12:00:00.000Z',
  },
  consumerEvaluations: [
    { consumer: 'reserve', status: 'accepted', reasons: [] },
    {
      consumer: 'forecast',
      status: 'blocked',
      reasons: ['ledger_coverage_partial', 'period_nav_unavailable'],
    },
    { consumer: 'economics', status: 'blocked', reasons: ['unsupported_payload_policy'] },
  ],
};

function metrics(snapshotInputHash = hash): ActualMetricsV2 {
  return {
    contractVersion: 'actual-metrics/2.0.0',
    snapshotStatus: 'resolved',
    fundId: 7,
    asOfDate: '2026-09-04',
    knowledgeCutoff: '2026-09-04T12:00:00.000Z',
    financialFactsSnapshotId: 41,
    snapshotInputHash,
    capitalScope: 'aggregate_lp_and_gp',
    performancePerspective: 'fund_net_to_partners',
    deploymentPerspective: 'fund_gross',
    currency: 'USD',
    capital: {
      committed: available('900719925474099312345.67'),
      calledIssued: available('2.00'),
      paidIn: available('2.00'),
      deployed: available('1.00'),
      initialDeployed: available('1.00'),
      followOnDeployed: available('0.00'),
      secondaryDeployed: available('0.00'),
      otherDeployed: available('0.00'),
      recallableDistributions: available('0.00'),
      availableRecallCapacity: available('0.00'),
      outstandingCalls: available('0.00'),
      remainingCallable: available('1.00'),
      unfunded: available('1.00'),
    },
    expenses: { managementFeesPaid: available('0.00'), otherExpensesPaid: available('0.00') },
    value: {
      portfolioFmv: unavailable,
      nav: unavailable,
      realizedFundProceeds: available('0.00'),
      distributionsToPartners: available('0.00'),
    },
    valuation: { valuationDate: null, rosterCount: 0, markedCount: 0, companies: [] },
    performance: { dpi: available('0.000000000000000001'), rvpi: unavailable, tvpi: unavailable },
    actionability: {
      scope: 'actuals_reporting',
      status: 'blocked',
      reasonCodes: ['VALUATION_COVERAGE_PARTIAL'],
    },
  };
}

describe('ActualMetricsReadback', () => {
  it('renders unavailable reasons without Object.hasOwn', () => {
    const descriptor = Object.getOwnPropertyDescriptor(Object, 'hasOwn')!;
    Object.defineProperty(Object, 'hasOwn', { value: undefined });
    try {
      render(<ActualMetricsReadback receipt={receipt} metrics={metrics()} />);
      expect(screen.getByTestId('actuals-metric-nav')).toHaveTextContent(
        'Unavailable — SOURCE_NOT_SUPPLIED: The required source evidence has not been supplied.'
      );
    } finally {
      Object.defineProperty(Object, 'hasOwn', descriptor);
    }
  });

  it('preserves large decimal strings and renders unavailable reasons instead of zero', () => {
    render(<ActualMetricsReadback receipt={receipt} metrics={metrics()} />);
    expect(screen.getByTestId('actuals-metric-committed')).toHaveTextContent(
      '$900,719,925,474,099,312,345.67'
    );
    expect(screen.getByTestId('actuals-metric-nav')).toHaveTextContent(
      'Unavailable — SOURCE_NOT_SUPPLIED'
    );
    expect(screen.getByTestId('actuals-metric-nav')).toHaveTextContent(
      'The required source evidence has not been supplied.'
    );
    expect(screen.getByTestId('actuals-metric-dpi')).toHaveTextContent('0.00x');
    expect(screen.getByText('Policy financial-facts-policy/1.4.0')).toHaveClass(
      'whitespace-normal',
      'break-all'
    );
    expect(screen.getByText('Payload financial-facts-payload/5')).toHaveClass(
      'whitespace-normal',
      'break-all'
    );
  });

  it('labels mixed current-head evaluations separately from historical receipt metrics', () => {
    render(
      <ActualMetricsReadback
        receipt={receipt}
        metrics={metrics()}
        latestReference={{
          contractVersion: 'financial-facts-latest-reference/1.0.0',
          head: currentHead,
        }}
      />
    );
    const consumers = screen.getByRole('region', { name: 'Current-head consumer availability' });
    expect(consumers).toHaveTextContent('Current head differs from this publication receipt.');
    expect(consumers).toHaveTextContent('Metrics above belong to receipt snapshot 41.');
    expect(within(consumers).getAllByText('Accepted')).toHaveLength(1);
    expect(within(consumers).getAllByText('Blocked')).toHaveLength(2);
    expect(consumers).toHaveTextContent(
      'ledger_coverage_partial: The ledger does not establish complete inception-to-cutoff coverage.'
    );
    expect(consumers).toHaveTextContent(
      'period_nav_unavailable: Period NAV is unavailable; portfolio marks alone do not establish it.'
    );
    expect(consumers).toHaveTextContent(
      'unsupported_payload_policy: This consumer does not support this facts policy.'
    );
    expect(screen.getByTestId('actuals-latest-reference-line')).toHaveTextContent(
      'Current head snapshot 42'
    );
    expect(screen.getByTestId('actuals-current-basis-line')).toHaveTextContent(
      `source hash ${'e'.repeat(64)}`
    );
    expect(screen.getByTestId('actuals-current-basis-line')).not.toHaveTextContent(hash);
    expect(screen.getByTestId('actuals-current-basis-line')).toHaveClass('break-all');
    expect(screen.getByTestId('actuals-basis-line')).toHaveTextContent('Receipt basis');
    expect(screen.getByTestId('actuals-basis-line')).toHaveTextContent(hash);
    expect(screen.getByTestId('actuals-metric-committed')).toHaveTextContent(
      '$900,719,925,474,099,312,345.67'
    );
  });

  it('retains unknown consumer reason codes with a neutral explanation', () => {
    render(
      <ActualMetricsReadback
        receipt={receipt}
        metrics={metrics()}
        latestReference={{
          contractVersion: 'financial-facts-latest-reference/1.0.0',
          head: {
            ...currentHead,
            consumerEvaluations: [
              {
                consumer: 'future_consumer',
                status: 'blocked',
                reasons: ['FUTURE_REASON', 'constructor'],
              },
            ],
          },
        }}
      />
    );
    const consumers = screen.getByRole('region', { name: 'Current-head consumer availability' });
    expect(consumers).toHaveTextContent(
      'FUTURE_REASON: No further explanation is available for this reason.'
    );
    expect(consumers).toHaveTextContent(
      'constructor: No further explanation is available for this reason.'
    );
    expect(within(consumers).queryByText('Accepted')).toBeNull();
  });

  it.each([null, { ...currentHead, basisRef: null, consumerEvaluations: [] }])(
    'does not infer consumer acceptance when head or evaluations are absent',
    (head) => {
      render(
        <ActualMetricsReadback
          receipt={receipt}
          metrics={metrics()}
          latestReference={{
            contractVersion: 'financial-facts-latest-reference/1.0.0',
            head,
          }}
        />
      );
      const consumers = screen.getByRole('region', { name: 'Current-head consumer availability' });
      expect(consumers).toHaveTextContent(
        head
          ? 'Consumer evaluations unavailable for this head.'
          : 'Current head and consumer evaluations unavailable.'
      );
      if (head) expect(consumers).toHaveTextContent('Current-head basis unavailable.');
      expect(within(consumers).queryByRole('list')).toBeNull();
      expect(within(consumers).queryByText('Accepted')).toBeNull();
    }
  );

  it('withholds metrics when receipt and readback hashes differ', () => {
    render(<ActualMetricsReadback receipt={receipt} metrics={metrics('f'.repeat(64))} />);
    expect(screen.getByTestId('actuals-metrics-identity-mismatch')).toHaveTextContent(
      'METRICS_RECEIPT_IDENTITY_MISMATCH'
    );
    expect(screen.queryByTestId('actuals-metric-committed')).toBeNull();
  });
});
