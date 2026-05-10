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
 * Successful previews can be committed as draft metric runs.
 *
 * @module client/pages/lp-reporting/metrics
 */

import { useCallback, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { MetricRunForm } from '@/components/lp-reporting/MetricRunForm';
import { MetricsCards } from '@/components/lp-reporting/MetricsCards';
import { XirrDiagnosticPanel } from '@/components/lp-reporting/XirrDiagnosticPanel';
import { MarkConfidenceMix } from '@/components/lp-reporting/MarkConfidenceMix';
import { useFundContext } from '@/contexts/FundContext';
import {
  LpMetricRunResultsSchema,
  MetricRunDryRunResponseSchema,
  type MetricRunCommitResponse,
  type MetricRunDryRunRequest,
  type MetricRunDryRunResponse,
} from '@shared/contracts/lp-reporting';
import { useMetricRunCommit, type LpReportingHookError } from '@/hooks/lp-reporting';

interface ErrorEnvelope {
  title: string;
  description: string;
}

const XIRR_PANEL_DOM_ID = 'lp-reporting-xirr-diagnostic-panel';

function envelopeFor(err: LpReportingHookError): ErrorEnvelope {
  if (err.code === 'PREVIEW_HASH_MISMATCH') {
    return {
      title: 'Preview changed',
      description: 'The selected source rows changed after preview. Run metrics again.',
    };
  }
  if (err.code === 'CONTRACT_PARSE_ERROR') {
    return {
      title: 'Unexpected response',
      description:
        'The server response did not match the locked contract. This is a bug -- please flag it.',
    };
  }

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
        description: 'Metric-run requests are limited to 20 per hour per user. Try again shortly.',
      };
    case 500:
      return {
        title: 'Metric run failed',
        description:
          err.message || 'The server could not compute metrics. Check your inputs and try again.',
      };
    default:
      return {
        title: 'Unable to compute metrics',
        description: err.message || 'An unknown error occurred. Try again.',
      };
  }
}

export default function LpReportingMetricsPage() {
  const { fundId } = useFundContext();
  const commitMutation = useMetricRunCommit(fundId);
  const [dryRun, setDryRun] = useState<MetricRunDryRunResponse | null>(null);
  const [dryRunRequest, setDryRunRequest] = useState<MetricRunDryRunRequest | null>(null);
  const [dryRunError, setDryRunError] = useState<LpReportingHookError | null>(null);
  const [commitResult, setCommitResult] = useState<MetricRunCommitResponse | null>(null);
  const [commitError, setCommitError] = useState<LpReportingHookError | null>(null);

  const handleSuccess = useCallback(
    (response: MetricRunDryRunResponse, request: MetricRunDryRunRequest) => {
      // Defensive parse at the trust boundary. The hook already validates
      // with safeParse; re-parsing here guards against any local mutation
      // and makes the contract dependency explicit at the page level.
      const parsedEnvelope = MetricRunDryRunResponseSchema.parse(response);
      const parsedResults = LpMetricRunResultsSchema.parse(parsedEnvelope.results);
      setDryRun({ ...parsedEnvelope, results: parsedResults });
      setDryRunRequest(request);
      setDryRunError(null);
      setCommitError(null);
      setCommitResult(null);
    },
    []
  );

  const handleError = useCallback((err: LpReportingHookError) => {
    setDryRunError(err);
    setCommitError(null);
    setCommitResult(null);
  }, []);

  const handleCommit = useCallback(async () => {
    if (!dryRun || !dryRunRequest) {
      return;
    }
    try {
      const result = await commitMutation.mutateAsync({
        ...dryRunRequest,
        previewHash: dryRun.previewHash,
      });
      setCommitResult(result);
      setCommitError(null);
    } catch (err) {
      if (err && typeof err === 'object') {
        setCommitError(err as LpReportingHookError);
      }
    }
  }, [commitMutation, dryRun, dryRunRequest]);

  const results = dryRun?.results ?? null;
  const envelope = dryRunError ? envelopeFor(dryRunError) : null;
  const commitEnvelope = commitError ? envelopeFor(commitError) : null;

  return (
    <div className="p-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold font-inter text-charcoal">Metrics</h1>
        <p className="text-charcoal/70 font-poppins mt-1">
          DPI, RVPI, TVPI, MOIC, Net IRR, Gross IRR with XIRR convergence diagnostics and draft
          metric-run persistence.
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
          data-error-status={dryRunError?.status ?? ''}
        >
          <AlertTitle>{envelope.title}</AlertTitle>
          <AlertDescription>{envelope.description}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Run metrics</CardTitle>
          <CardDescription>
            Select an as-of date, run type, and perspective. A successful preview can be committed
            as a draft metric run.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MetricRunForm fundId={fundId} onSuccess={handleSuccess} onError={handleError} />
        </CardContent>
      </Card>

      {dryRun && results ? (
        <div className="space-y-6" data-testid="metrics-results">
          <Card data-testid="metrics-commit-card">
            <CardHeader>
              <CardTitle>Draft metric run</CardTitle>
              <CardDescription>
                Preview hash {dryRun.previewHash.slice(0, 12)}... | inputs hash{' '}
                {dryRun.inputsHash.slice(0, 12)}...
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-charcoal/70 font-poppins">
                  Commit the current preview as a draft reporting snapshot.
                </p>
                <Button
                  type="button"
                  onClick={() => void handleCommit()}
                  disabled={commitMutation.isPending}
                  data-testid="metrics-commit-button"
                >
                  {commitMutation.isPending ? 'Committing...' : 'Commit draft'}
                </Button>
              </div>

              {commitEnvelope ? (
                <Alert
                  variant="destructive"
                  data-testid="metrics-commit-error-envelope"
                  data-error-status={commitError?.status ?? ''}
                >
                  <AlertTitle>{commitEnvelope.title}</AlertTitle>
                  <AlertDescription>{commitEnvelope.description}</AlertDescription>
                </Alert>
              ) : null}

              {commitResult ? (
                <Alert
                  data-testid="metrics-commit-result"
                  data-inserted={String(commitResult.inserted)}
                >
                  <AlertTitle>Draft saved</AlertTitle>
                  <AlertDescription>
                    Metric run #{commitResult.metricRunId} is {commitResult.status}. Inputs hash{' '}
                    {commitResult.inputsHash.slice(0, 12)}...
                  </AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>

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
