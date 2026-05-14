import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'wouter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { FundResultsComparisonV1 } from '@shared/contracts/fund-results-comparison-v1.contract';
import type { FundResultsReadV1 } from '@shared/contracts/fund-results-v1.contract';
import {
  buildQuarterlyReviewTrace,
  type AnalyticsTraceAction,
  type AnalyticsTraceStatus,
} from './quarterly-review-trace';

const STATUS_LABELS: Record<AnalyticsTraceStatus, string> = {
  available: 'Available',
  pending: 'Pending',
  unavailable: 'Unavailable',
  linked: 'Linked',
  deferred: 'Deferred',
};

const STATUS_CLASSES: Record<AnalyticsTraceStatus, string> = {
  available: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  unavailable: 'border-slate-200 bg-slate-50 text-slate-600',
  linked: 'border-blue-200 bg-blue-50 text-blue-700',
  deferred: 'border-beige-200 bg-lightGray text-charcoal-500',
};

interface QuarterlyReviewTraceProps {
  results: FundResultsReadV1;
  comparison: FundResultsComparisonV1 | null;
  fundId: string;
}

function TraceStatusBadge({ status }: { status: AnalyticsTraceStatus }) {
  return (
    <Badge
      variant="outline"
      className={STATUS_CLASSES[status]}
      data-testid="analytics-trace-status"
    >
      {STATUS_LABELS[status]}
    </Badge>
  );
}

function TraceActionLink({ action }: { action: AnalyticsTraceAction }) {
  return (
    <Button asChild variant="outline" size="sm" className="shrink-0">
      <Link href={action.href}>
        {action.label}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </Button>
  );
}

export function QuarterlyReviewTrace({ results, comparison, fundId }: QuarterlyReviewTraceProps) {
  const trace = buildQuarterlyReviewTrace(results, comparison, fundId);

  return (
    <section
      className="bg-white rounded-lg border border-beige-200 p-6 space-y-5"
      aria-labelledby="quarterly-review-trace-title"
      data-testid="quarterly-review-trace"
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 id="quarterly-review-trace-title" className="text-lg font-medium text-charcoal">
            Quarterly Analytics Trace
          </h2>
          <p className="mt-1 text-sm text-charcoal-500 font-poppins">
            Source-labeled answers for the mounted quarterly review workflow.
          </p>
        </div>
        <Badge variant="outline" className="border-beige-200 text-charcoal-500 md:mt-1">
          Tranche 6
        </Badge>
      </div>

      <div className="divide-y divide-beige-200">
        {trace.items.map((item) => (
          <article
            key={item.id}
            className="grid gap-3 py-4 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_auto]"
          >
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-charcoal">{item.question}</h3>
                <TraceStatusBadge status={item.status} />
              </div>
              <p className="text-xs font-semibold uppercase tracking-normal text-charcoal-500">
                {item.sourceLabel}
              </p>
              <p className="text-sm text-charcoal-600 font-poppins">{item.description}</p>
            </div>

            <div className="flex flex-wrap items-start gap-2 lg:justify-end">
              <TraceActionLink action={item.action} />
              {item.secondaryAction ? <TraceActionLink action={item.secondaryAction} /> : null}
            </div>
          </article>
        ))}
      </div>

      <div className="rounded-md border border-beige-200 bg-lightGray p-4">
        <h3 className="text-sm font-semibold text-charcoal">Deferred Parity Ledger</h3>
        <dl className="mt-3 grid gap-3 md:grid-cols-2">
          {trace.deferred.map((item) => (
            <div key={item.label} className="space-y-1">
              <dt className="flex flex-wrap items-center gap-2 text-sm font-medium text-charcoal">
                {item.label}
                <TraceStatusBadge status={item.status} />
              </dt>
              <dd className="text-sm text-charcoal-500 font-poppins">{item.reason}</dd>
              {item.href ? (
                <dd>
                  <Link className="text-sm font-medium text-charcoal underline" href={item.href}>
                    Review linked surface
                  </Link>
                </dd>
              ) : null}
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
