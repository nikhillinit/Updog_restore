/**
 * LP Reporting -- Metrics page (Phase 1b.4).
 *
 * Replaces the 1b.1 placeholder. The dry-run preview IS the metrics
 * page populated. Layout:
 *   - Header card: title + subtitle.
 *   - MetricRunForm at top (asOfDate / runType / perspective).
 *   - On success: metric cards + XIRR diagnostic panel + mark-confidence mix.
 *   - On error: 401 / 403 / 429 / 500 / CONTRACT_PARSE_ERROR-aware envelope.
 *   - Empty state before first run.
 *
 * Defensive trust-boundary parse: we run `LpMetricRunResultsSchema.parse`
 * on the response BEFORE rendering. The hook already parses with
 * safeParse and would have thrown CONTRACT_PARSE_ERROR if the shape
 * was wrong, but we re-parse here per the design (defense in depth at
 * the page level).
 *
 * NO commit / persistence affordance. Persistence ships in Phase 1c.
 *
 * @module client/pages/lp-reporting/metrics
 */

import { useCallback, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { MetricRunForm } from '@/components/lp-reporting/MetricRunForm';
import { MetricsCards } from '@/components/lp-reporting/MetricsCards';
import { XirrDiagnosticPanel } from '@/components/lp-reporting/XirrDiagnosticPanel';
import { MarkConfidenceMix } from '@/components/lp-reporting/MarkConfidenceMix';
import { useFundContext } from '@/contexts/FundContext';
import { LpMetricRunResultsSchema, type LpMetricRunResults } from '@shared/contracts/lp-reporting';
import type { LpReportingHookError } from '@/hooks/lp-reporting';

interface ErrorEnvelope {
  title: string;
  description: string;
}

const XIRR_PANEL_DOM_ID = 'lp-reporting-xirr-diagnostic-panel';

function envelopeFor(err: LpReportingHookError): ErrorEnvelope {
  switch (err.status) {
    case 401:
      return {
        title: 'Sign-in required',
        description: 'Your session expired. Please sign in again to compute metrics.',
      };
    case 403:
      return {
        title: 'Access denied',
        description:
          'You do not have permission to compute metrics for this fund. Contact your fund admin.',
      };
    case 429:
      return {
        title: 'Rate limit reached',
        description: 'Metric-run dry-runs are limited to 20 per hour per user. Try again shortly.',
      };
    case 500:
      return {
        title: 'Dry-run failed',
        description:
          err.message || 'The server could not compute metrics. Check your inputs and try again.',
      };
    default:
      if (err.code === 'CONTRACT_PARSE_ERROR') {
        return {
          title: 'Unexpected response',
          description:
            'The server response did not match the locked contract. This is a bug -- please flag it.',
        };
      }
      return {
        title: 'Unable to compute metrics',
        description: err.message || 'An unknown error occurred. Try again.',
      };
  }
}

export default function LpReportingMetricsPage() {
  const { fundId } = useFundContext();
  const [results, setResults] = useState<LpMetricRunResults | null>(null);
  const [error, setError] = useState<LpReportingHookError | null>(null);

  const handleSuccess = useCallback((response: LpMetricRunResults) => {
    // Defensive parse at the trust boundary. The hook already validates
    // with safeParse; re-parsing here guards against any local mutation
    // and makes the contract dependency explicit at the page level.
    const parsed = LpMetricRunResultsSchema.parse(response);
    setError(null);
    setResults(parsed);
  }, []);

  const handleError = useCallback((err: LpReportingHookError) => {
    setError(err);
  }, []);

  const envelope = error ? envelopeFor(error) : null;

  return (
    <div className="p-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold font-inter text-charcoal">Metrics</h1>
        <p className="text-charcoal/70 font-poppins mt-1">
          DPI, RVPI, TVPI, MOIC, Net IRR, Gross IRR with XIRR convergence diagnostics. No INSERT
          happens in this view; persistence ships in Phase 1c.
        </p>
      </header>

      {fundId === null ? (
        <Alert>
          <AlertTitle>Select a fund</AlertTitle>
          <AlertDescription>
            Choose a fund from the header to compute metrics. The dry-run endpoint requires a
            fund-scoped URL.
          </AlertDescription>
        </Alert>
      ) : null}

      {envelope ? (
        <Alert
          variant="destructive"
          data-testid="metrics-error-envelope"
          data-error-status={error?.status ?? ''}
        >
          <AlertTitle>{envelope.title}</AlertTitle>
          <AlertDescription>{envelope.description}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Run metrics</CardTitle>
          <CardDescription>
            Select an as-of date, run type, and perspective. Click{' '}
            <span className="font-semibold">Run metrics</span> to compute headline metrics + XIRR
            diagnostics. Nothing is persisted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MetricRunForm fundId={fundId} onSuccess={handleSuccess} onError={handleError} />
        </CardContent>
      </Card>

      {results ? (
        <div className="space-y-6" data-testid="metrics-results">
          <Card>
            <CardHeader>
              <CardTitle>Headline metrics</CardTitle>
              <CardDescription>
                As of {results.asOfDate} -- {results.currency}. Ratios and IRRs are point-in-time;
                future-dated marks are excluded from current NAV per design 8.6.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MetricsCards results={results} diagnosticPanelId={XIRR_PANEL_DOM_ID} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>XIRR convergence</CardTitle>
              <CardDescription>
                Net + Gross XIRR diagnostics per ADR-010. Bound hits and failure reasons surface
                here without re-running the solver.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <XirrDiagnosticPanel
                id={XIRR_PANEL_DOM_ID}
                net={results.xirrDiagnostic.net}
                gross={results.xirrDiagnostic.gross}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mark provenance</CardTitle>
              <CardDescription>
                Confidence mix of the marks contributing to current NAV.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MarkConfidenceMix mix={results.markConfidenceMix} />
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card data-testid="metrics-empty-state">
          <CardHeader>
            <CardTitle>No metrics yet</CardTitle>
            <CardDescription>
              Run the form above to populate DPI / RVPI / TVPI / MOIC / Net IRR / Gross IRR plus the
              XIRR convergence panel.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-charcoal/70 font-poppins">
              The metric cards, XIRR diagnostic panel, and mark-confidence mix will appear here
              after a successful dry-run.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
