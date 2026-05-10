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

import { useCallback, useState, type FormEvent } from 'react';
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
  type ConfidenceLevel,
  type MetricRunCommitResponse,
  type MetricRunDryRunRequest,
  type MetricRunDryRunResponse,
  type MetricRunEvidenceCreateRequest,
} from '@shared/contracts/lp-reporting';
import {
  useMetricRunCommit,
  useMetricRunEvidenceCreate,
  useMetricRunEvidenceList,
  type LpReportingHookError,
} from '@/hooks/lp-reporting';

interface ErrorEnvelope {
  title: string;
  description: string;
}

const XIRR_PANEL_DOM_ID = 'lp-reporting-xirr-diagnostic-panel';

type EvidenceSource =
  | 'financing_round'
  | 'signed_loi'
  | 'revenue_milestone'
  | 'strategic_partnership'
  | 'audited_financials'
  | 'board_update'
  | 'gp_estimate'
  | 'third_party_priced'
  | 'secondary_transaction'
  | 'customer_contract'
  | 'management_report'
  | 'auditor_confirmation';

type MaterialityLevel = 'high' | 'medium' | 'low';
type Confidentiality = 'internal' | 'lp_shareable' | 'restricted';

interface EvidenceFormState {
  evidenceSource: EvidenceSource;
  sourceDate: string;
  confidenceLevel: ConfidenceLevel;
  materialityLevel: MaterialityLevel;
  confidentiality: Confidentiality;
  redactionRequired: boolean;
  description: string;
}

function makeEvidenceFormState(sourceDate = ''): EvidenceFormState {
  return {
    evidenceSource: 'board_update',
    sourceDate,
    confidenceLevel: 'medium',
    materialityLevel: 'medium',
    confidentiality: 'internal',
    redactionRequired: false,
    description: '',
  };
}

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function createEvidenceIdempotencyKey(metricRunId: number): string {
  const token =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `metric-run-${metricRunId}-evidence-${token}`;
}

function envelopeFor(err: LpReportingHookError): ErrorEnvelope {
  if (err.code === 'METRIC_RUN_NOT_EDITABLE') {
    return {
      title: 'Metric run not editable',
      description: 'Evidence records can only be added while the metric run is still draft.',
    };
  }
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
  const [evidenceForm, setEvidenceForm] = useState<EvidenceFormState>(() =>
    makeEvidenceFormState()
  );
  const [evidenceIdempotencyKey, setEvidenceIdempotencyKey] = useState<string | null>(null);
  const [evidenceError, setEvidenceError] = useState<LpReportingHookError | null>(null);
  const committedMetricRunId = commitResult?.metricRunId ?? null;
  const evidenceListQuery = useMetricRunEvidenceList(fundId, committedMetricRunId);
  const evidenceCreateMutation = useMetricRunEvidenceCreate(fundId, committedMetricRunId);

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
      setEvidenceError(null);
      setEvidenceIdempotencyKey(null);
      setEvidenceForm(makeEvidenceFormState(parsedResults.asOfDate));
    },
    []
  );

  const handleError = useCallback((err: LpReportingHookError) => {
    setDryRunError(err);
    setCommitError(null);
    setCommitResult(null);
    setEvidenceError(null);
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
      setEvidenceError(null);
      setEvidenceIdempotencyKey(createEvidenceIdempotencyKey(result.metricRunId));
      setEvidenceForm(makeEvidenceFormState(dryRun.results.asOfDate));
    } catch (err) {
      if (err && typeof err === 'object') {
        setCommitError(err as LpReportingHookError);
      }
    }
  }, [commitMutation, dryRun, dryRunRequest]);

  const handleEvidenceSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (committedMetricRunId === null) {
        return;
      }
      const idempotencyKey =
        evidenceIdempotencyKey ?? createEvidenceIdempotencyKey(committedMetricRunId);

      const request: MetricRunEvidenceCreateRequest = {
        idempotencyKey,
        evidenceSource: evidenceForm.evidenceSource,
        sourceDate: evidenceForm.sourceDate,
        confidenceLevel: evidenceForm.confidenceLevel,
        materialityLevel: evidenceForm.materialityLevel,
        confidentiality: evidenceForm.confidentiality,
        redactionRequired: evidenceForm.redactionRequired,
        ...(optionalText(evidenceForm.description) !== undefined && {
          description: optionalText(evidenceForm.description),
        }),
      };

      try {
        await evidenceCreateMutation.mutateAsync(request);
        setEvidenceError(null);
        setEvidenceIdempotencyKey(createEvidenceIdempotencyKey(committedMetricRunId));
        setEvidenceForm(makeEvidenceFormState(dryRun?.results.asOfDate ?? ''));
      } catch (err) {
        if (err && typeof err === 'object') {
          setEvidenceError(err as LpReportingHookError);
        }
      }
    },
    [
      committedMetricRunId,
      dryRun?.results.asOfDate,
      evidenceCreateMutation,
      evidenceForm,
      evidenceIdempotencyKey,
    ]
  );

  const results = dryRun?.results ?? null;
  const envelope = dryRunError ? envelopeFor(dryRunError) : null;
  const commitEnvelope = commitError ? envelopeFor(commitError) : null;
  const evidenceQueryError =
    evidenceListQuery.error && committedMetricRunId !== null ? evidenceListQuery.error : null;
  const evidenceEnvelope = evidenceError
    ? envelopeFor(evidenceError)
    : evidenceQueryError
      ? envelopeFor(evidenceQueryError)
      : null;
  const evidenceRecords = evidenceListQuery.data?.records ?? [];

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

          {commitResult ? (
            <Card data-testid="metric-run-evidence-card">
              <CardHeader>
                <CardTitle>Metric-run evidence</CardTitle>
                <CardDescription>
                  Metadata records attached to draft metric run #{commitResult.metricRunId}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {evidenceEnvelope ? (
                  <Alert
                    variant="destructive"
                    data-testid="metric-run-evidence-error-envelope"
                    data-error-status={evidenceError?.status ?? evidenceQueryError?.status ?? ''}
                  >
                    <AlertTitle>{evidenceEnvelope.title}</AlertTitle>
                    <AlertDescription>{evidenceEnvelope.description}</AlertDescription>
                  </Alert>
                ) : null}

                <form
                  className="grid gap-4 md:grid-cols-2"
                  onSubmit={(event) => void handleEvidenceSubmit(event)}
                  data-testid="metric-run-evidence-form"
                >
                  <label className="space-y-1 text-sm font-medium text-charcoal">
                    Evidence source
                    <select
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                      value={evidenceForm.evidenceSource}
                      onChange={(event) =>
                        setEvidenceForm((current) => ({
                          ...current,
                          evidenceSource: event.target.value as EvidenceSource,
                        }))
                      }
                    >
                      <option value="board_update">Board update</option>
                      <option value="audited_financials">Audited financials</option>
                      <option value="financing_round">Financing round</option>
                      <option value="management_report">Management report</option>
                      <option value="gp_estimate">GP estimate</option>
                      <option value="third_party_priced">Third-party priced</option>
                      <option value="signed_loi">Signed LOI</option>
                      <option value="revenue_milestone">Revenue milestone</option>
                      <option value="strategic_partnership">Strategic partnership</option>
                      <option value="secondary_transaction">Secondary transaction</option>
                      <option value="customer_contract">Customer contract</option>
                      <option value="auditor_confirmation">Auditor confirmation</option>
                    </select>
                  </label>

                  <label className="space-y-1 text-sm font-medium text-charcoal">
                    Source date
                    <input
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      type="date"
                      required
                      value={evidenceForm.sourceDate}
                      onChange={(event) =>
                        setEvidenceForm((current) => ({
                          ...current,
                          sourceDate: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="space-y-1 text-sm font-medium text-charcoal">
                    Confidence
                    <select
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                      value={evidenceForm.confidenceLevel}
                      onChange={(event) =>
                        setEvidenceForm((current) => ({
                          ...current,
                          confidenceLevel: event.target.value as ConfidenceLevel,
                        }))
                      }
                    >
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </label>

                  <label className="space-y-1 text-sm font-medium text-charcoal">
                    Materiality
                    <select
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                      value={evidenceForm.materialityLevel}
                      onChange={(event) =>
                        setEvidenceForm((current) => ({
                          ...current,
                          materialityLevel: event.target.value as MaterialityLevel,
                        }))
                      }
                    >
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </label>

                  <label className="space-y-1 text-sm font-medium text-charcoal">
                    Confidentiality
                    <select
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                      value={evidenceForm.confidentiality}
                      onChange={(event) =>
                        setEvidenceForm((current) => ({
                          ...current,
                          confidentiality: event.target.value as Confidentiality,
                        }))
                      }
                    >
                      <option value="internal">Internal</option>
                      <option value="lp_shareable">LP shareable</option>
                      <option value="restricted">Restricted</option>
                    </select>
                  </label>

                  <label className="flex items-center gap-2 text-sm font-medium text-charcoal md:mt-7">
                    <input
                      type="checkbox"
                      checked={evidenceForm.redactionRequired}
                      onChange={(event) =>
                        setEvidenceForm((current) => ({
                          ...current,
                          redactionRequired: event.target.checked,
                        }))
                      }
                    />
                    Redaction required
                  </label>

                  <label className="space-y-1 text-sm font-medium text-charcoal md:col-span-2">
                    Description
                    <textarea
                      className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      maxLength={2000}
                      value={evidenceForm.description}
                      onChange={(event) =>
                        setEvidenceForm((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <div className="md:col-span-2">
                    <Button
                      type="submit"
                      disabled={evidenceCreateMutation.isPending}
                      data-testid="metric-run-evidence-submit"
                    >
                      {evidenceCreateMutation.isPending ? 'Saving...' : 'Add evidence'}
                    </Button>
                  </div>
                </form>

                <div className="space-y-3" data-testid="metric-run-evidence-list">
                  {evidenceListQuery.isLoading ? (
                    <p className="text-sm text-charcoal/70 font-poppins">Loading evidence...</p>
                  ) : null}
                  {!evidenceListQuery.isLoading && evidenceRecords.length === 0 ? (
                    <p
                      className="text-sm text-charcoal/70 font-poppins"
                      data-testid="metric-run-evidence-empty"
                    >
                      No evidence records yet.
                    </p>
                  ) : null}
                  {evidenceRecords.map((record) => (
                    <div
                      key={record.id}
                      className="rounded-md border border-slate-200 px-3 py-2"
                      data-testid="metric-run-evidence-record"
                    >
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm font-medium text-charcoal">
                          {record.evidenceSource.replaceAll('_', ' ')}
                        </p>
                        <p className="text-xs text-charcoal/60">{record.sourceDate}</p>
                      </div>
                      {record.description ? (
                        <p className="mt-1 text-sm text-charcoal/70">{record.description}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-charcoal/60">
                        {record.confidenceLevel} confidence | {record.materialityLevel} materiality
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

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
