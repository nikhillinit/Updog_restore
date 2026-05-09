/**
 * LP Reporting -- XIRR diagnostic panel (Phase 1b.4).
 *
 * Renders both the Net and Gross XIRR diagnostics side-by-side on lg
 * (stacked on sm). Strictly a presentation component: it takes the
 * locked `XirrDiagnostic` shape from the wire contract and surfaces
 * convergence + method + iterations + boundHit + failureReason.
 *
 * CRITICAL: this panel NEVER calls the XIRR solver. It must not
 * import `shared/lib/finance/xirr` or any function that would invoke
 * the iterative root-finder. The corresponding test asserts the file
 * has no such import.
 *
 * Bound + failure descriptions trace ADR-010
 * (docs/adr/ADR-010-xirr-day-count-and-bounds.md). The XIRR search
 * range is [-0.999999, 200] per the ADR.
 *
 * @module client/components/lp-reporting/XirrDiagnosticPanel
 */

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatXirrConvergence } from '@/lib/format/lp-reporting/xirr';
import type { XirrFormatTone } from '@/lib/format/lp-reporting/xirr';
import type { XirrDiagnostic } from '@shared/contracts/lp-reporting';

type DiagnosticInput = XirrDiagnostic;

const TONE_BADGE_VARIANT: Record<
  XirrFormatTone,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  ok: 'default',
  warn: 'secondary',
  fail: 'destructive',
};

const BOUND_TOOLTIP =
  'Per ADR-010, XIRR is searched within [-0.999999, 200]. Hitting min or max means the true IRR lies outside this range; the reported value is a bound.';

const FAILURE_TOOLTIP =
  'Per ADR-010, the solver returns a structured failureReason instead of NaN. See the description for cause.';

export interface XirrDiagnosticBlockProps {
  title: string;
  diagnostic: DiagnosticInput;
  testId: string;
}

export function XirrDiagnosticBlock({ title, diagnostic, testId }: XirrDiagnosticBlockProps) {
  const formatted = formatXirrConvergence(diagnostic);
  const variant = TONE_BADGE_VARIANT[formatted.tone];

  return (
    <div
      className="rounded-md border border-input bg-background p-4 space-y-3"
      data-testid={testId}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold font-inter text-charcoal">{title}</h3>
        <Badge variant={variant} data-testid={`${testId}-convergence-badge`}>
          {formatted.label}
        </Badge>
      </div>

      <p className="text-sm font-poppins text-charcoal/80" data-testid={`${testId}-description`}>
        {formatted.description}
      </p>

      <dl className="grid grid-cols-2 gap-2 text-xs font-poppins">
        <div>
          <dt className="text-charcoal/60">Method</dt>
          <dd className="text-charcoal" data-testid={`${testId}-method`}>
            {diagnostic.method}
          </dd>
        </div>
        <div>
          <dt className="text-charcoal/60">Iterations</dt>
          <dd className="text-charcoal" data-testid={`${testId}-iterations`}>
            {String(diagnostic.iterations)}
          </dd>
        </div>
      </dl>

      {diagnostic.boundHit !== null ? (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                data-testid={`${testId}-bound-hit`}
                className="inline-flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 cursor-help"
              >
                <span className="font-semibold">
                  {diagnostic.boundHit === 'max' ? 'Hit upper bound' : 'Hit lower bound'}
                </span>
                <span className="text-amber-700/80">
                  ({diagnostic.boundHit === 'max' ? '200' : '-0.999999'})
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>{BOUND_TOOLTIP}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}

      {diagnostic.failureReason !== null ? (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                data-testid={`${testId}-failure-reason`}
                data-failure-code={diagnostic.failureReason}
                className="inline-flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-800 cursor-help"
              >
                <span className="font-semibold">{diagnostic.failureReason}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>{FAILURE_TOOLTIP}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
    </div>
  );
}

export interface XirrDiagnosticPanelProps {
  net: DiagnosticInput;
  gross: DiagnosticInput;
  /** Optional dom id so MetricsCards can reference us via aria-describedby. */
  id?: string;
}

export function XirrDiagnosticPanel({ net, gross, id }: XirrDiagnosticPanelProps) {
  return (
    <section
      {...(id !== undefined && { id })}
      data-testid="xirr-diagnostic-panel"
      aria-label="XIRR convergence diagnostics"
      className="grid grid-cols-1 lg:grid-cols-2 gap-4"
    >
      <XirrDiagnosticBlock title="Net IRR" diagnostic={net} testId="xirr-net" />
      <XirrDiagnosticBlock title="Gross IRR" diagnostic={gross} testId="xirr-gross" />
    </section>
  );
}

export default XirrDiagnosticPanel;
