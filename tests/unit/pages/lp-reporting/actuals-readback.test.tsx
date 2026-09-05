import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActualMetricsReadback } from '@/components/lp-reporting/ActualMetricsReadback';
import type { ActualMetricsV2, ActualsPublishReceiptV1 } from '@shared/contracts/lp-reporting';

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
      reasonCodes: ['VALUATION_COVERAGE_INCOMPLETE'],
    },
  };
}

describe('ActualMetricsReadback', () => {
  it('preserves large decimal strings and renders unavailable reasons instead of zero', () => {
    render(<ActualMetricsReadback receipt={receipt} metrics={metrics()} />);
    expect(screen.getByTestId('actuals-metric-committed')).toHaveTextContent(
      '$900,719,925,474,099,312,345.67'
    );
    expect(screen.getByTestId('actuals-metric-nav')).toHaveTextContent(
      'Unavailable — SOURCE_NOT_SUPPLIED'
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

  it('withholds metrics when receipt and readback hashes differ', () => {
    render(<ActualMetricsReadback receipt={receipt} metrics={metrics('f'.repeat(64))} />);
    expect(screen.getByTestId('actuals-metrics-identity-mismatch')).toHaveTextContent(
      'METRICS_RECEIPT_IDENTITY_MISMATCH'
    );
    expect(screen.queryByTestId('actuals-metric-committed')).toBeNull();
  });
});
