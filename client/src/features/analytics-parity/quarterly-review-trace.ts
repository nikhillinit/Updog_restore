import type { FundResultsComparisonV1 } from '@shared/contracts/fund-results-comparison-v1.contract';
import type { FundResultsReadV1 } from '@shared/contracts/fund-results-v1.contract';

export type AnalyticsTraceStatus = 'available' | 'pending' | 'unavailable' | 'linked' | 'deferred';

export type QuarterlyReviewTraceItemId =
  | 'plan'
  | 'segment-gap'
  | 'follow-on'
  | 'what-if'
  | 'lp-output';

export interface AnalyticsTraceAction {
  label: string;
  href: string;
}

export interface QuarterlyReviewTraceItem {
  id: QuarterlyReviewTraceItemId;
  question: string;
  status: AnalyticsTraceStatus;
  sourceLabel: string;
  description: string;
  action: AnalyticsTraceAction;
  secondaryAction?: AnalyticsTraceAction;
}

export interface DeferredParityItem {
  label: string;
  status: Extract<AnalyticsTraceStatus, 'linked' | 'deferred'>;
  reason: string;
  href?: string;
}

export interface QuarterlyReviewTrace {
  items: QuarterlyReviewTraceItem[];
  deferred: DeferredParityItem[];
}

type TraceSection = {
  status: 'available' | 'pending' | 'unavailable' | 'failed';
  reason?: string;
};

function sectionStatus(section: TraceSection): AnalyticsTraceStatus {
  if (section.status === 'available') {
    return 'available';
  }

  if (section.status === 'pending') {
    return 'pending';
  }

  return 'unavailable';
}

function comparisonStatus(
  results: FundResultsReadV1,
  comparison: FundResultsComparisonV1 | null
): AnalyticsTraceStatus {
  if (!results.lifecycle.configState.hasPublished) {
    return 'unavailable';
  }

  if (!comparison) {
    return 'pending';
  }

  if (comparison.comparisonStatus === 'comparable') {
    return 'available';
  }

  return 'pending';
}

function comparisonDescription(
  results: FundResultsReadV1,
  comparison: FundResultsComparisonV1 | null
): string {
  if (!results.lifecycle.configState.hasPublished) {
    return 'No published configuration exists, so plan drift cannot be traced yet.';
  }

  if (!comparison) {
    return 'Publish comparison is loading from the canonical results-comparison contract.';
  }

  if (comparison.comparisonStatus === 'comparable') {
    return `Published v${comparison.currentVersion?.version ?? '?'} is compared with v${
      comparison.previousVersion?.version ?? '?'
    } across ${comparison.metricDeltas.length} supported metrics.`;
  }

  return 'Current published results exist; publish another version to unlock drift between releases.';
}

function reserveDescription(section: FundResultsReadV1['sections']['reserve']): string {
  if (section.status === 'available') {
    return 'Reserve allocation is backed by fund_snapshots and connects to company-level reserve planning.';
  }

  if (section.status === 'pending') {
    return 'Reserve allocation is pending in the fund results contract; reserve planning remains the routed workspace for company context.';
  }

  return 'Reserve allocation is unavailable in the fund results contract; reserve planning remains the routed workspace for company context.';
}

export function buildQuarterlyReviewTrace(
  results: FundResultsReadV1,
  comparison: FundResultsComparisonV1 | null,
  fundId: string
): QuarterlyReviewTrace {
  const encodedFundId = encodeURIComponent(fundId);
  const reserveStatus = sectionStatus(results.sections.reserve);

  return {
    items: [
      {
        id: 'plan',
        question: 'Are we on plan?',
        status: comparisonStatus(results, comparison),
        sourceLabel: 'Publish comparison',
        description: comparisonDescription(results, comparison),
        action: {
          label: 'Review comparison',
          href: `/fund-model-results/${encodedFundId}`,
        },
      },
      {
        id: 'segment-gap',
        question: 'Where are the gaps by segment?',
        status: 'linked',
        sourceLabel: 'Performance breakdown route',
        description:
          'Sector, stage, and company breakdowns stay in the performance dashboard with route-owned empty states.',
        action: {
          label: 'Open performance breakdown',
          href: '/performance',
        },
      },
      {
        id: 'follow-on',
        question: 'Which follow-ons need action?',
        status: reserveStatus,
        sourceLabel: 'Reserve snapshot',
        description: reserveDescription(results.sections.reserve),
        action: {
          label: 'Open reserve planning',
          href: '/portfolio?tab=reserve-planning',
        },
      },
      {
        id: 'what-if',
        question: 'What if the model changes?',
        status: 'linked',
        sourceLabel: 'Scenario workspaces',
        description:
          'Sensitivity, Monte Carlo, and forecasting flows remain separate workspaces with explicit unsupported states.',
        action: {
          label: 'Open sensitivity analysis',
          href: '/sensitivity-analysis',
        },
        secondaryAction: {
          label: 'Open forecasting',
          href: `/forecasting?fundId=${encodedFundId}`,
        },
      },
      {
        id: 'lp-output',
        question: 'What can LPs receive today?',
        status: 'linked',
        sourceLabel: 'Reports workspace',
        description:
          'Reports links to the current GP reporting surface; automated LP narrative generation is deferred.',
        action: {
          label: 'Open reports',
          href: '/reports',
        },
      },
    ],
    deferred: [
      {
        label: 'MOIC distribution',
        status: 'deferred',
        reason: 'No canonical MOIC distribution contract exists for Monte Carlo output.',
      },
      {
        label: 'LP narrative package',
        status: 'deferred',
        reason:
          'Reports can be opened, but narrative LP report generation is outside this tranche.',
        href: '/reports',
      },
      {
        label: 'Founder benchmarking',
        status: 'deferred',
        reason:
          'Benchmarks require an owned benchmark source before they can appear in quarterly review.',
      },
      {
        label: 'Quarterly review alerts',
        status: 'deferred',
        reason: 'No alerting contract or notification backend is mounted for this workflow.',
      },
    ],
  };
}
