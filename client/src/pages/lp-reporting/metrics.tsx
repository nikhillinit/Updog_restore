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

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, FileJson, FileSpreadsheet, Save } from 'lucide-react';
import type { QualificationSnapshot } from '@/components/lp-reporting/GpQualificationStrip';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MetricRunForm } from '@/components/lp-reporting/MetricRunForm';
import { MetricsCards } from '@/components/lp-reporting/MetricsCards';
import { XirrDiagnosticPanel } from '@/components/lp-reporting/XirrDiagnosticPanel';
import { MarkConfidenceMix } from '@/components/lp-reporting/MarkConfidenceMix';
import { useFundContext } from '@/contexts/FundContext';
import {
  LpMetricRunResultsSchema,
  MetricRunDryRunResponseSchema,
  type ConfidenceLevel,
  type MetricRunDetailResponse,
  type MetricRunCommitResponse,
  type MetricRunDryRunRequest,
  type MetricRunDryRunResponse,
  type MetricRunEvidenceCreateRequest,
  type MetricRunLifecycleResponse,
  type NarrativeRunRecord,
  type NarrativeType,
  type ReportPackageCsvStoredArtifactResponse,
  type ReportPackageJsonExportResponse,
  type ReportPackageRenderMetricRow,
} from '@shared/contracts/lp-reporting';
import {
  useLatestMetricRun,
  useMetricRunApprove,
  useMetricRunCommit,
  useMetricRunDetail,
  useMetricRunEvidenceCreate,
  useMetricRunEvidenceList,
  useMetricRunLock,
  useMetricRunNarrativeApprove,
  useMetricRunNarrativeCreate,
  useMetricRunNarrativeEdit,
  useMetricRunNarrativeList,
  useMetricRunNarrativeReview,
  useMetricRunReportPackage,
  useMetricRunReportPackageAssemble,
  useMetricRunReportPackageJsonExport,
  useMetricRunReportPackageRenderModel,
  useMetricRunReportPackageStoredCsvArtifact,
  useMetricRunReportPackageStoredCsvExport,
  useMetricRunReportPackageStoredCsvExportCreate,
  useMetricRunReportPackageStoredJsonArtifact,
  useMetricRunReportPackageStoredJsonExport,
  useMetricRunReportPackageStoredJsonExportCreate,
  type LpReportingHookError,
} from '@/hooks/lp-reporting';

interface ErrorEnvelope {
  title: string;
  description: string;
}

const XIRR_PANEL_DOM_ID = 'lp-reporting-xirr-diagnostic-panel';

const NARRATIVE_TYPES: Array<{ value: NarrativeType; label: string }> = [
  { value: 'no_dpi', label: 'No DPI' },
  { value: 'methodology', label: 'Methodology' },
  { value: 'portfolio_update', label: 'Portfolio update' },
  { value: 'risk_disclosure', label: 'Risk disclosure' },
];

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
  if (err.code === 'METRIC_RUN_EVIDENCE_REQUIRED') {
    return {
      title: 'Evidence required',
      description: 'Add at least one evidence record before approving this metric run.',
    };
  }
  if (err.code === 'METRIC_RUN_VERSION_CONFLICT') {
    return {
      title: 'Metric run changed',
      description: 'The metric run changed since this page loaded. Refresh the lifecycle state.',
    };
  }
  if (err.code === 'NARRATIVE_RUN_VERSION_CONFLICT') {
    return {
      title: 'Narrative changed',
      description: 'The narrative changed since this page loaded. Refresh the lifecycle state.',
    };
  }
  if (err.code === 'METRIC_RUN_STATUS_CONFLICT') {
    return {
      title: 'Metric run status changed',
      description: 'This lifecycle action is no longer valid for the metric run status.',
    };
  }
  if (err.code === 'REPORT_PACKAGE_ALREADY_ASSEMBLED') {
    return {
      title: 'Package already assembled',
      description: 'This metric run already has an assembled package with different refs.',
    };
  }
  if (err.code === 'REPORT_PACKAGE_CSV_SOURCE_JSON_EXPORT_REQUIRED') {
    return {
      title: 'Stored JSON required',
      description: 'Store the package JSON artifact before creating a stored CSV export.',
    };
  }
  if (err.code === 'EXPORT_CONTENT_HASH_CONFLICT') {
    return {
      title: 'Export conflict',
      description: 'The stored export does not match the current deterministic artifact.',
    };
  }
  if (
    err.code === 'REPORT_PACKAGE_NARRATIVE_SET_INVALID' ||
    err.code === 'NARRATIVE_RUN_STATUS_CONFLICT'
  ) {
    return {
      title: 'Package not ready',
      description: 'All required narratives must be approved before assembly.',
    };
  }
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

function formatRenderMetricValue(row: ReportPackageRenderMetricRow): string {
  if (row.value === null) return 'N/A';
  if (row.valueKind === 'count') return String(row.value);

  const numeric = Number(row.value);
  if (!Number.isFinite(numeric)) return String(row.value);

  if (row.valueKind === 'multiple') return `${numeric.toFixed(2)}x`;
  if (row.valueKind === 'irr') return `${(numeric * 100).toFixed(2)}%`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: row.currency ?? 'USD',
    maximumFractionDigits: 0,
  }).format(numeric);
}

function saveReportPackageJsonExport(
  response: ReportPackageJsonExportResponse,
  fundId: number,
  metricRunId: number
): void {
  const blob = new Blob([JSON.stringify(response, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `lp-report-package-${fundId}-${metricRunId}-json-v1.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function saveReportPackageCsvExport(
  response: ReportPackageCsvStoredArtifactResponse,
  fundId: number,
  metricRunId: number
): void {
  const blob = new Blob([response.csv.csv], {
    type: response.csv.contentType,
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download =
    response.csv.filename || `lp-report-package-${fundId}-${metricRunId}-csv-v1.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export interface LpReportingMetricsPageProps {
  /**
   * Plan 9 Wave 9B1 additive: publishes the qualification-relevant slice of
   * this page's already-fetched state (latest metric run, package, export
   * blockers) so the fund-scoped reports route can render the GP
   * qualification summary strip. `/lp-reporting/metrics` passes nothing and
   * is unchanged.
   */
  onQualificationSnapshot?: (snapshot: QualificationSnapshot) => void;
}

export default function LpReportingMetricsPage({
  onQualificationSnapshot,
}: LpReportingMetricsPageProps = {}) {
  const { fundId } = useFundContext();
  const commitMutation = useMetricRunCommit(fundId);
  const [dryRun, setDryRun] = useState<MetricRunDryRunResponse | null>(null);
  const [dryRunRequest, setDryRunRequest] = useState<MetricRunDryRunRequest | null>(null);
  const [dryRunError, setDryRunError] = useState<LpReportingHookError | null>(null);
  const [commitResult, setCommitResult] = useState<MetricRunCommitResponse | null>(null);
  const [commitError, setCommitError] = useState<LpReportingHookError | null>(null);
  const [lifecycleResult, setLifecycleResult] = useState<MetricRunLifecycleResponse | null>(null);
  const [lifecycleError, setLifecycleError] = useState<LpReportingHookError | null>(null);
  const [evidenceForm, setEvidenceForm] = useState<EvidenceFormState>(() =>
    makeEvidenceFormState()
  );
  const [evidenceIdempotencyKey, setEvidenceIdempotencyKey] = useState<string | null>(null);
  const [evidenceError, setEvidenceError] = useState<LpReportingHookError | null>(null);
  const [narrativeDraftText, setNarrativeDraftText] = useState<Record<number, string>>({});
  const [narrativeOverrides, setNarrativeOverrides] = useState<Record<number, NarrativeRunRecord>>(
    {}
  );
  const [reportPackageJsonExportHash, setReportPackageJsonExportHash] = useState<string | null>(
    null
  );
  const committedMetricRunId = commitResult?.metricRunId ?? null;
  const latestQuery = useLatestMetricRun(
    fundId,
    dryRunRequest
      ? {
          asOfDate: dryRunRequest.asOfDate,
          runType: dryRunRequest.runType,
          perspective: dryRunRequest.perspective,
        }
      : null
  );
  const latestMetricRun = latestQuery.data?.metricRun ?? null;
  const committedMetricRunQuery = useMetricRunDetail(fundId, committedMetricRunId);
  const committedMetricRun = committedMetricRunQuery.data ?? null;
  const latestMatchesCommitted =
    latestMetricRun !== null &&
    (committedMetricRunId === null || latestMetricRun.metricRunId === committedMetricRunId);
  const activeMetricRun: MetricRunDetailResponse | null =
    lifecycleResult?.metricRun ??
    committedMetricRun ??
    (latestMatchesCommitted ? latestMetricRun : null);
  const lifecycleMetricRunId = activeMetricRun?.metricRunId ?? committedMetricRunId;
  const approveMutation = useMetricRunApprove(fundId, lifecycleMetricRunId);
  const lockMutation = useMetricRunLock(fundId, lifecycleMetricRunId);
  const evidenceListQuery = useMetricRunEvidenceList(fundId, committedMetricRunId);
  const evidenceCreateMutation = useMetricRunEvidenceCreate(fundId, committedMetricRunId);
  const lockedMetricRunId =
    activeMetricRun?.status === 'locked' ? activeMetricRun.metricRunId : null;
  const narrativeListQuery = useMetricRunNarrativeList(fundId, lockedMetricRunId);
  const narrativeCreateMutation = useMetricRunNarrativeCreate(fundId, lockedMetricRunId);
  const narrativeEditMutation = useMetricRunNarrativeEdit(fundId, lockedMetricRunId);
  const narrativeReviewMutation = useMetricRunNarrativeReview(fundId, lockedMetricRunId);
  const narrativeApproveMutation = useMetricRunNarrativeApprove(fundId, lockedMetricRunId);
  const reportPackageQuery = useMetricRunReportPackage(fundId, lockedMetricRunId);
  const reportPackageAssembleMutation = useMetricRunReportPackageAssemble(
    fundId,
    lockedMetricRunId
  );
  const reportPackageRecord = reportPackageQuery.data?.record ?? null;
  const reportPackageRenderModelQuery = useMetricRunReportPackageRenderModel(
    fundId,
    reportPackageRecord === null ? null : lockedMetricRunId
  );
  const reportPackageJsonExportQuery = useMetricRunReportPackageJsonExport(
    fundId,
    reportPackageRecord === null ? null : lockedMetricRunId
  );
  const reportPackageStoredJsonExportQuery = useMetricRunReportPackageStoredJsonExport(
    fundId,
    reportPackageRecord === null ? null : lockedMetricRunId
  );
  const reportPackageStoredJsonArtifactQuery = useMetricRunReportPackageStoredJsonArtifact(
    fundId,
    reportPackageRecord === null ? null : lockedMetricRunId
  );
  const reportPackageStoredJsonExportCreateMutation =
    useMetricRunReportPackageStoredJsonExportCreate(
      fundId,
      reportPackageRecord === null ? null : lockedMetricRunId
    );
  const reportPackageStoredCsvExportQuery = useMetricRunReportPackageStoredCsvExport(
    fundId,
    reportPackageRecord === null ? null : lockedMetricRunId
  );
  const reportPackageStoredCsvArtifactQuery = useMetricRunReportPackageStoredCsvArtifact(
    fundId,
    reportPackageRecord === null ? null : lockedMetricRunId
  );
  const reportPackageStoredCsvExportCreateMutation = useMetricRunReportPackageStoredCsvExportCreate(
    fundId,
    reportPackageRecord === null ? null : lockedMetricRunId
  );

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
      setLifecycleResult(null);
      setLifecycleError(null);
      setEvidenceError(null);
      setEvidenceIdempotencyKey(null);
      setNarrativeDraftText({});
      setNarrativeOverrides({});
      setReportPackageJsonExportHash(null);
      setEvidenceForm(makeEvidenceFormState(parsedResults.asOfDate));
    },
    []
  );

  const handleError = useCallback((err: LpReportingHookError) => {
    setDryRunError(err);
    setCommitError(null);
    setCommitResult(null);
    setLifecycleResult(null);
    setLifecycleError(null);
    setEvidenceError(null);
    setNarrativeDraftText({});
    setNarrativeOverrides({});
    setReportPackageJsonExportHash(null);
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
      setLifecycleResult(null);
      setLifecycleError(null);
      setEvidenceError(null);
      setEvidenceIdempotencyKey(createEvidenceIdempotencyKey(result.metricRunId));
      setNarrativeDraftText({});
      setNarrativeOverrides({});
      setReportPackageJsonExportHash(null);
      setEvidenceForm(makeEvidenceFormState(dryRun.results.asOfDate));
    } catch (err) {
      if (err && typeof err === 'object') {
        setCommitError(err as LpReportingHookError);
      }
    }
  }, [commitMutation, dryRun, dryRunRequest]);

  const handleApprove = useCallback(async () => {
    if (!activeMetricRun) {
      return;
    }
    try {
      const result = await approveMutation.mutateAsync({
        expectedVersion: activeMetricRun.version,
      });
      setLifecycleResult(result);
      setLifecycleError(null);
      setEvidenceError(null);
    } catch (err) {
      if (err && typeof err === 'object') {
        setLifecycleError(err as LpReportingHookError);
      }
    }
  }, [activeMetricRun, approveMutation]);

  const handleLock = useCallback(async () => {
    if (!activeMetricRun) {
      return;
    }
    try {
      const result = await lockMutation.mutateAsync({
        expectedVersion: activeMetricRun.version,
      });
      setLifecycleResult(result);
      setLifecycleError(null);
      setEvidenceError(null);
    } catch (err) {
      if (err && typeof err === 'object') {
        setLifecycleError(err as LpReportingHookError);
      }
    }
  }, [activeMetricRun, lockMutation]);

  const handleEvidenceSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (committedMetricRunId === null) {
        return;
      }
      const idempotencyKey =
        evidenceIdempotencyKey ?? createEvidenceIdempotencyKey(committedMetricRunId);
      const description = optionalText(evidenceForm.description);

      const request: MetricRunEvidenceCreateRequest = {
        idempotencyKey,
        evidenceSource: evidenceForm.evidenceSource,
        sourceDate: evidenceForm.sourceDate,
        confidenceLevel: evidenceForm.confidenceLevel,
        materialityLevel: evidenceForm.materialityLevel,
        confidentiality: evidenceForm.confidentiality,
        redactionRequired: evidenceForm.redactionRequired,
        ...(description !== undefined && { description }),
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

  const handleNarrativeCreate = useCallback(
    async (narrativeType: NarrativeType) => {
      try {
        await narrativeCreateMutation.mutateAsync({ narrativeType });
      } catch {
        // The mutation error is rendered from narrativeCreateMutation.error.
      }
    },
    [narrativeCreateMutation]
  );

  const handleNarrativeTextChange = useCallback((narrativeRunId: number, value: string) => {
    setNarrativeDraftText((current) => ({
      ...current,
      [narrativeRunId]: value,
    }));
  }, []);

  const mergeNarrativeRecord = useCallback((record: NarrativeRunRecord) => {
    setNarrativeOverrides((current) => ({
      ...current,
      [record.narrativeRunId]: record,
    }));
    setNarrativeDraftText((current) => ({
      ...current,
      [record.narrativeRunId]: record.editedText ?? record.generatedText,
    }));
  }, []);

  const handleNarrativeEdit = useCallback(
    async (record: NarrativeRunRecord) => {
      const editedText =
        narrativeDraftText[record.narrativeRunId] ?? record.editedText ?? record.generatedText;
      try {
        const response = await narrativeEditMutation.mutateAsync({
          narrativeRunId: record.narrativeRunId,
          expectedVersion: record.version,
          editedText,
        });
        mergeNarrativeRecord(response.record);
      } catch {
        // The mutation error is rendered from narrativeEditMutation.error.
      }
    },
    [mergeNarrativeRecord, narrativeDraftText, narrativeEditMutation]
  );

  const handleNarrativeReview = useCallback(
    async (record: NarrativeRunRecord) => {
      try {
        const response = await narrativeReviewMutation.mutateAsync({
          narrativeRunId: record.narrativeRunId,
          expectedVersion: record.version,
        });
        mergeNarrativeRecord(response.record);
      } catch {
        // The mutation error is rendered from narrativeReviewMutation.error.
      }
    },
    [mergeNarrativeRecord, narrativeReviewMutation]
  );

  const handleNarrativeApprove = useCallback(
    async (record: NarrativeRunRecord) => {
      try {
        const response = await narrativeApproveMutation.mutateAsync({
          narrativeRunId: record.narrativeRunId,
          expectedVersion: record.version,
        });
        mergeNarrativeRecord(response.record);
      } catch {
        // The mutation error is rendered from narrativeApproveMutation.error.
      }
    },
    [mergeNarrativeRecord, narrativeApproveMutation]
  );

  const handleReportPackageJsonExport = useCallback(async () => {
    if (fundId === null || lockedMetricRunId === null) {
      return;
    }

    const result = await reportPackageJsonExportQuery.refetch();
    if (result.error) {
      setReportPackageJsonExportHash(null);
      return;
    }
    if (result.data) {
      saveReportPackageJsonExport(result.data, fundId, lockedMetricRunId);
      setReportPackageJsonExportHash(result.data.export.contentHash);
    }
  }, [fundId, lockedMetricRunId, reportPackageJsonExportQuery]);

  const handleReportPackageStoredJsonCreate = useCallback(async () => {
    try {
      await reportPackageStoredJsonExportCreateMutation.mutateAsync();
    } catch {
      // The mutation error is rendered from reportPackageStoredJsonExportCreateMutation.error.
    }
  }, [reportPackageStoredJsonExportCreateMutation]);

  const handleReportPackageStoredJsonExport = useCallback(async () => {
    if (fundId === null || lockedMetricRunId === null) {
      return;
    }

    const result = await reportPackageStoredJsonArtifactQuery.refetch();
    if (result.data) {
      saveReportPackageJsonExport({ export: result.data.export }, fundId, lockedMetricRunId);
    }
  }, [fundId, lockedMetricRunId, reportPackageStoredJsonArtifactQuery]);

  const handleReportPackageStoredCsvCreate = useCallback(async () => {
    try {
      await reportPackageStoredCsvExportCreateMutation.mutateAsync();
    } catch {
      // The mutation error is rendered from reportPackageStoredCsvExportCreateMutation.error.
    }
  }, [reportPackageStoredCsvExportCreateMutation]);

  const handleReportPackageStoredCsvExport = useCallback(async () => {
    if (fundId === null || lockedMetricRunId === null) {
      return;
    }

    const result = await reportPackageStoredCsvArtifactQuery.refetch();
    if (result.data) {
      saveReportPackageCsvExport(result.data, fundId, lockedMetricRunId);
    }
  }, [fundId, lockedMetricRunId, reportPackageStoredCsvArtifactQuery]);

  const results = dryRun?.results ?? null;
  const envelope = dryRunError ? envelopeFor(dryRunError) : null;
  const commitEnvelope = commitError ? envelopeFor(commitError) : null;
  const lifecycleEnvelope = lifecycleError ? envelopeFor(lifecycleError) : null;
  const evidenceQueryError =
    evidenceListQuery.error && committedMetricRunId !== null ? evidenceListQuery.error : null;
  const evidenceEnvelope = evidenceError
    ? envelopeFor(evidenceError)
    : evidenceQueryError
      ? envelopeFor(evidenceQueryError)
      : null;
  const evidenceRecords = evidenceListQuery.data?.records ?? [];
  const narrativeRecords = (narrativeListQuery.data?.records ?? []).map((record) => {
    const override = narrativeOverrides[record.narrativeRunId];
    return override && override.version >= record.version ? override : record;
  });
  const reportPackageRenderModel = reportPackageRenderModelQuery.data?.renderModel ?? null;
  const reportPackageRenderModelError =
    reportPackageRenderModelQuery.error?.code === 'REPORT_PACKAGE_NOT_FOUND'
      ? null
      : (reportPackageRenderModelQuery.error as LpReportingHookError | null);
  const reportPackageJsonExportError =
    reportPackageJsonExportQuery.error as LpReportingHookError | null;
  const reportPackageJsonExportBlockers = reportPackageJsonExportError?.blockers ?? [];
  const reportPackageJsonExportEnvelope =
    reportPackageJsonExportError && reportPackageJsonExportBlockers.length === 0
      ? envelopeFor(reportPackageJsonExportError)
      : null;
  const reportPackageStoredJsonRecord =
    reportPackageStoredJsonExportCreateMutation.data?.record ??
    reportPackageStoredJsonExportQuery.data?.record ??
    null;
  const reportPackageStoredJsonError =
    reportPackageStoredJsonExportCreateMutation.error ??
    (reportPackageStoredJsonArtifactQuery.error as LpReportingHookError | null) ??
    (reportPackageStoredJsonExportQuery.error as LpReportingHookError | null);
  const reportPackageStoredJsonBlockers = reportPackageStoredJsonError?.blockers ?? [];
  const reportPackageStoredJsonEnvelope =
    reportPackageStoredJsonError && reportPackageStoredJsonBlockers.length === 0
      ? envelopeFor(reportPackageStoredJsonError)
      : null;
  const reportPackageStoredCsvRecord =
    reportPackageStoredCsvExportCreateMutation.data?.record ??
    reportPackageStoredCsvExportQuery.data?.record ??
    null;
  const reportPackageStoredCsvMetadata =
    reportPackageStoredCsvExportCreateMutation.data ??
    (reportPackageStoredCsvExportQuery.data?.record
      ? reportPackageStoredCsvExportQuery.data
      : null);
  const reportPackageStoredCsvError =
    reportPackageStoredCsvExportCreateMutation.error ??
    (reportPackageStoredCsvArtifactQuery.error as LpReportingHookError | null) ??
    (reportPackageStoredCsvExportQuery.error as LpReportingHookError | null);
  const reportPackageStoredCsvEnvelope = reportPackageStoredCsvError
    ? envelopeFor(reportPackageStoredCsvError)
    : null;
  const approvedNarrativeCount = narrativeRecords.filter(
    (record) => record.status === 'approved'
  ).length;
  const allNarrativesApproved = NARRATIVE_TYPES.every((type) =>
    narrativeRecords.some(
      (record) => record.narrativeType === type.value && record.status === 'approved'
    )
  );
  const handleReportPackageAssemble = useCallback(async () => {
    if (!activeMetricRun) {
      return;
    }
    const approvedByType = new Map<NarrativeType, NarrativeRunRecord>();
    for (const record of narrativeRecords) {
      if (record.status === 'approved') {
        approvedByType.set(record.narrativeType, record);
      }
    }
    const expectedNarratives: NarrativeRunRecord[] = [];
    for (const type of NARRATIVE_TYPES) {
      const record = approvedByType.get(type.value);
      if (!record) {
        return;
      }
      expectedNarratives.push(record);
    }

    try {
      await reportPackageAssembleMutation.mutateAsync({
        expectedMetricRunVersion: activeMetricRun.version,
        expectedNarratives: expectedNarratives.map((record) => ({
          narrativeType: record.narrativeType,
          narrativeRunId: record.narrativeRunId,
          expectedVersion: record.version,
        })),
      });
    } catch {
      // The mutation error is rendered from reportPackageAssembleMutation.error.
    }
  }, [activeMetricRun, narrativeRecords, reportPackageAssembleMutation]);
  const narrativeTypesWithDrafts = new Set(
    narrativeRecords.map((record: NarrativeRunRecord) => record.narrativeType)
  );
  const activeEvidenceCount = Math.max(activeMetricRun?.evidenceCount ?? 0, evidenceRecords.length);
  const canApprove =
    activeMetricRun?.status === 'draft' &&
    activeEvidenceCount > 0 &&
    !approveMutation.isPending &&
    !latestQuery.isFetching;
  const canLock = activeMetricRun?.status === 'approved' && !lockMutation.isPending;
  const isEvidenceEditable = activeMetricRun === null || activeMetricRun.status === 'draft';
  const narrativeError =
    narrativeCreateMutation.error ??
    narrativeEditMutation.error ??
    narrativeReviewMutation.error ??
    narrativeApproveMutation.error ??
    (narrativeListQuery.error as LpReportingHookError | null);
  const narrativeEnvelope = narrativeError ? envelopeFor(narrativeError) : null;
  const canAssembleReportPackage =
    activeMetricRun?.status === 'locked' &&
    allNarrativesApproved &&
    reportPackageRecord === null &&
    !reportPackageQuery.isLoading &&
    !reportPackageAssembleMutation.isPending;
  const canExportReportPackageJson =
    reportPackageRenderModel !== null &&
    fundId !== null &&
    lockedMetricRunId !== null &&
    !reportPackageJsonExportQuery.isFetching;
  const canStoreReportPackageJson =
    reportPackageRenderModel !== null &&
    fundId !== null &&
    lockedMetricRunId !== null &&
    !reportPackageStoredJsonExportCreateMutation.isPending;
  const canExportStoredReportPackageJson =
    reportPackageStoredJsonRecord !== null &&
    fundId !== null &&
    lockedMetricRunId !== null &&
    !reportPackageStoredJsonArtifactQuery.isFetching;
  const canStoreReportPackageCsv =
    reportPackageRenderModel !== null &&
    fundId !== null &&
    lockedMetricRunId !== null &&
    !reportPackageStoredCsvExportCreateMutation.isPending;
  const canExportStoredReportPackageCsv =
    reportPackageStoredCsvRecord !== null &&
    fundId !== null &&
    lockedMetricRunId !== null &&
    !reportPackageStoredCsvArtifactQuery.isFetching;
  const reportPackageError =
    reportPackageAssembleMutation.error ??
    (reportPackageQuery.error as LpReportingHookError | null) ??
    reportPackageRenderModelError;
  const reportPackageEnvelope = reportPackageError ? envelopeFor(reportPackageError) : null;

  // Plan 9 Wave 9B1: publish the qualification snapshot for the fund-scoped
  // reports route strip. Derived exclusively from state this page already
  // holds; identity-stable so the parent's setState never loops.
  const qualificationSnapshot = useMemo<QualificationSnapshot>(() => {
    const blockers = [
      ...(reportPackageJsonExportError?.blockers ?? []),
      ...(reportPackageStoredJsonError?.blockers ?? []),
    ].map((blocker) => ({ code: blocker.code, message: blocker.message }));

    return {
      metricRun: activeMetricRun
        ? {
            metricRunId: activeMetricRun.metricRunId,
            status: activeMetricRun.status,
            asOfDate: activeMetricRun.asOfDate,
            evidenceCount: activeEvidenceCount,
          }
        : null,
      reportPackage: reportPackageRecord
        ? { status: reportPackageRecord.status, asOfDate: reportPackageRecord.asOfDate }
        : null,
      exportBlockers: blockers,
      exportProven:
        reportPackageJsonExportHash !== null ||
        reportPackageStoredJsonRecord !== null ||
        reportPackageStoredCsvRecord !== null,
    };
  }, [
    activeMetricRun,
    activeEvidenceCount,
    reportPackageRecord,
    reportPackageJsonExportError,
    reportPackageStoredJsonError,
    reportPackageJsonExportHash,
    reportPackageStoredJsonRecord,
    reportPackageStoredCsvRecord,
  ]);

  useEffect(() => {
    onQualificationSnapshot?.(qualificationSnapshot);
  }, [onQualificationSnapshot, qualificationSnapshot]);

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
            <Card data-testid="metric-run-lifecycle-card">
              <CardHeader>
                <CardTitle>Metric-run lifecycle</CardTitle>
                <CardDescription>
                  Approval and lock state for metric run #{commitResult.metricRunId}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {lifecycleEnvelope ? (
                  <Alert
                    variant="destructive"
                    data-testid="metric-run-lifecycle-error-envelope"
                    data-error-status={lifecycleError?.status ?? ''}
                  >
                    <AlertTitle>{lifecycleEnvelope.title}</AlertTitle>
                    <AlertDescription>{lifecycleEnvelope.description}</AlertDescription>
                  </Alert>
                ) : null}

                {activeMetricRun ? (
                  <div
                    className="grid gap-3 rounded-md border border-beige-200 p-3 text-sm md:grid-cols-2"
                    data-testid="metric-run-lifecycle-panel"
                  >
                    <div>
                      <p className="text-xs uppercase tracking-wide text-charcoal/60">Status</p>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="outline" data-testid="metric-run-status-badge">
                          {activeMetricRun.status}
                        </Badge>
                        <span className="text-xs text-charcoal/60">
                          version {activeMetricRun.version}
                        </span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-charcoal/60">Evidence</p>
                      <p className="mt-1 font-medium" data-testid="metric-run-evidence-count">
                        {activeEvidenceCount} record{activeEvidenceCount === 1 ? '' : 's'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-charcoal/60">Approved</p>
                      <p className="mt-1 text-charcoal/70" data-testid="metric-run-approved-at">
                        {activeMetricRun.approvedAt ?? 'Not approved'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-charcoal/60">Locked</p>
                      <p className="mt-1 text-charcoal/70" data-testid="metric-run-locked-at">
                        {activeMetricRun.lockedAt ?? 'Not locked'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-charcoal/70 font-poppins">
                    Loading lifecycle status...
                  </p>
                )}

                {activeMetricRun?.status === 'draft' && activeEvidenceCount === 0 ? (
                  <Alert data-testid="metric-run-approval-blocked">
                    <AlertTitle>Approval blocked</AlertTitle>
                    <AlertDescription>
                      Add at least one evidence record before approving this metric run.
                    </AlertDescription>
                  </Alert>
                ) : null}

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    type="button"
                    onClick={() => void handleApprove()}
                    disabled={!canApprove}
                    data-testid="metric-run-approve-button"
                  >
                    {approveMutation.isPending ? 'Approving...' : 'Approve'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleLock()}
                    disabled={!canLock}
                    data-testid="metric-run-lock-button"
                  >
                    {lockMutation.isPending ? 'Locking...' : 'Lock'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {commitResult ? (
            <Card data-testid="metric-run-evidence-card">
              <CardHeader>
                <CardTitle>Metric-run evidence</CardTitle>
                <CardDescription>
                  Metadata records attached to metric run #{commitResult.metricRunId}.
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

                {isEvidenceEditable ? (
                  <form
                    className="grid gap-4 md:grid-cols-2"
                    onSubmit={(event) => void handleEvidenceSubmit(event)}
                    data-testid="metric-run-evidence-form"
                  >
                    <label className="space-y-1 text-sm font-medium text-charcoal">
                      Evidence source
                      <select
                        className="w-full rounded-md border border-beige-200 bg-white px-3 py-2 text-sm"
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
                        className="w-full rounded-md border border-beige-200 px-3 py-2 text-sm"
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
                        className="w-full rounded-md border border-beige-200 bg-white px-3 py-2 text-sm"
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
                        className="w-full rounded-md border border-beige-200 bg-white px-3 py-2 text-sm"
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
                        className="w-full rounded-md border border-beige-200 bg-white px-3 py-2 text-sm"
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
                        className="min-h-24 w-full rounded-md border border-beige-200 px-3 py-2 text-sm"
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
                ) : (
                  <Alert data-testid="metric-run-evidence-readonly">
                    <AlertTitle>Evidence locked</AlertTitle>
                    <AlertDescription>
                      Evidence can be reviewed but not added after approval.
                    </AlertDescription>
                  </Alert>
                )}

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
                      className="rounded-md border border-beige-200 px-3 py-2"
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

          {lockedMetricRunId !== null ? (
            <Card data-testid="metric-run-narrative-card">
              <CardHeader>
                <CardTitle>Narrative drafts</CardTitle>
                <CardDescription>
                  Draft narrative rows for metric run #{lockedMetricRunId}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {narrativeEnvelope ? (
                  <Alert
                    variant="destructive"
                    data-testid="metric-run-narrative-error-envelope"
                    data-error-status={narrativeError?.status ?? ''}
                  >
                    <AlertTitle>{narrativeEnvelope.title}</AlertTitle>
                    <AlertDescription>{narrativeEnvelope.description}</AlertDescription>
                  </Alert>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {NARRATIVE_TYPES.map((type) => (
                    <Button
                      key={type.value}
                      type="button"
                      variant={narrativeTypesWithDrafts.has(type.value) ? 'outline' : 'default'}
                      disabled={
                        narrativeTypesWithDrafts.has(type.value) ||
                        narrativeCreateMutation.isPending ||
                        narrativeListQuery.isLoading
                      }
                      onClick={() => void handleNarrativeCreate(type.value)}
                      data-testid={`metric-run-narrative-create-${type.value}`}
                    >
                      {narrativeTypesWithDrafts.has(type.value)
                        ? `${type.label} drafted`
                        : type.label}
                    </Button>
                  ))}
                </div>

                <div className="space-y-3" data-testid="metric-run-narrative-list">
                  {narrativeListQuery.isLoading ? (
                    <p className="text-sm text-charcoal/70 font-poppins">Loading drafts...</p>
                  ) : null}
                  {!narrativeListQuery.isLoading && narrativeRecords.length === 0 ? (
                    <p
                      className="text-sm text-charcoal/70 font-poppins"
                      data-testid="metric-run-narrative-empty"
                    >
                      No narrative drafts yet.
                    </p>
                  ) : null}
                  {narrativeRecords.map((record) => {
                    const type = NARRATIVE_TYPES.find(
                      (item) => item.value === record.narrativeType
                    );
                    const effectiveText = record.editedText ?? record.generatedText;
                    const draftText = narrativeDraftText[record.narrativeRunId] ?? effectiveText;
                    const savedEditText = record.editedText?.trim() ?? '';
                    const canEditNarrative = record.status === 'draft';
                    const canReviewNarrative =
                      record.status === 'draft' &&
                      savedEditText.length > 0 &&
                      !narrativeReviewMutation.isPending;
                    const canApproveNarrative =
                      record.status === 'reviewed' && !narrativeApproveMutation.isPending;
                    return (
                      <div
                        key={record.narrativeRunId}
                        className="rounded-md border border-beige-200 px-3 py-3"
                        data-testid="metric-run-narrative-record"
                      >
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-sm font-medium text-charcoal">
                            {type?.label ?? record.narrativeType}
                          </p>
                          <Badge variant="outline">{record.status}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-charcoal/60">
                          Version {record.version}
                          {record.reviewedAt ? ` | reviewed ${record.reviewedAt}` : ''}
                          {record.approvedAt ? ` | approved ${record.approvedAt}` : ''}
                        </p>
                        {canEditNarrative ? (
                          <div className="mt-3 space-y-2">
                            <Textarea
                              value={draftText}
                              onChange={(event) =>
                                handleNarrativeTextChange(record.narrativeRunId, event.target.value)
                              }
                              aria-label={`${type?.label ?? record.narrativeType} narrative text`}
                              data-testid={`metric-run-narrative-edit-${record.narrativeRunId}`}
                              className="min-h-28"
                            />
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => void handleNarrativeEdit(record)}
                                disabled={
                                  narrativeEditMutation.isPending || draftText.trim().length === 0
                                }
                                data-testid={`metric-run-narrative-save-${record.narrativeRunId}`}
                              >
                                <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                                Save edit
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => void handleNarrativeReview(record)}
                                disabled={!canReviewNarrative}
                                data-testid={`metric-run-narrative-review-${record.narrativeRunId}`}
                              >
                                <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
                                Mark reviewed
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-2 whitespace-pre-wrap text-sm text-charcoal/75">
                            {effectiveText}
                          </p>
                        )}
                        {record.status === 'reviewed' ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => void handleNarrativeApprove(record)}
                              disabled={!canApproveNarrative}
                              data-testid={`metric-run-narrative-approve-${record.narrativeRunId}`}
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
                              Approve
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {lockedMetricRunId !== null ? (
            <Card data-testid="metric-run-report-package-card">
              <CardHeader>
                <CardTitle>Approved report package</CardTitle>
                <CardDescription>Metric run #{lockedMetricRunId}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {reportPackageEnvelope ? (
                  <Alert
                    variant="destructive"
                    data-testid="metric-run-report-package-error-envelope"
                    data-error-status={reportPackageError?.status ?? ''}
                  >
                    <AlertTitle>{reportPackageEnvelope.title}</AlertTitle>
                    <AlertDescription>{reportPackageEnvelope.description}</AlertDescription>
                  </Alert>
                ) : null}

                <div
                  className="grid gap-2 sm:grid-cols-2"
                  data-testid="metric-run-report-package-readiness"
                >
                  {NARRATIVE_TYPES.map((type) => {
                    const record = narrativeRecords.find(
                      (candidate) => candidate.narrativeType === type.value
                    );
                    const status = record?.status ?? 'missing';
                    return (
                      <div
                        key={type.value}
                        className="flex items-center justify-between rounded-md border border-beige-200 px-3 py-2"
                      >
                        <span className="text-sm font-medium text-charcoal">{type.label}</span>
                        <Badge variant={status === 'approved' ? 'default' : 'outline'}>
                          {status}
                        </Badge>
                      </div>
                    );
                  })}
                </div>

                {reportPackageRecord ? (
                  <div className="space-y-3">
                    <Alert data-testid="metric-run-report-package-result">
                      <AlertTitle>Package assembled</AlertTitle>
                      <AlertDescription>
                        Package #{reportPackageRecord.reportPackageId} assembled{' '}
                        {reportPackageRecord.assembledAt} by user #{reportPackageRecord.assembledBy}
                        . Metric-run version {reportPackageRecord.metricRunVersion}; narratives{' '}
                        {reportPackageRecord.narrativeRefs.length}.
                      </AlertDescription>
                    </Alert>
                    <div
                      className="grid gap-2 sm:grid-cols-2"
                      data-testid="metric-run-report-package-refs"
                    >
                      {reportPackageRecord.narrativeRefs.map((ref) => {
                        const type = NARRATIVE_TYPES.find(
                          (item) => item.value === ref.narrativeType
                        );
                        return (
                          <div
                            key={ref.narrativeType}
                            className="rounded-md border border-beige-200 px-3 py-2 text-sm"
                            data-testid={`metric-run-report-package-ref-${ref.narrativeType}`}
                          >
                            <p className="font-medium text-charcoal">
                              {type?.label ?? ref.narrativeType}
                            </p>
                            <p className="text-xs text-charcoal/60">
                              Run #{ref.narrativeRunId} | version {ref.narrativeVersion}
                            </p>
                            <p className="text-xs text-charcoal/60">
                              Approved by {ref.approvedBy ? `user #${ref.approvedBy}` : 'unknown'}{' '}
                              at {ref.approvedAt}
                            </p>
                            <p className="font-mono text-xs text-charcoal/60">
                              {ref.textHash.slice(0, 12)}...
                            </p>
                          </div>
                        );
                      })}
                    </div>
                    {reportPackageRenderModel ? (
                      <div
                        className="space-y-4 rounded-md border border-beige-200 p-4"
                        data-testid="metric-run-report-package-render-preview"
                      >
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-charcoal">
                              {reportPackageRenderModel.fundDisplay.name}
                            </p>
                            <p className="text-xs text-charcoal/60">
                              As of {reportPackageRenderModel.source.asOfDate} | package #
                              {reportPackageRenderModel.source.reportPackageId}
                            </p>
                          </div>
                          <Badge variant="outline">
                            v{reportPackageRenderModel.renderModelVersion}
                          </Badge>
                        </div>

                        <div className="grid gap-3 lg:grid-cols-3">
                          {reportPackageRenderModel.metricSections.map((section) => (
                            <div
                              key={section.sectionId}
                              className="rounded-md border border-beige-200 px-3 py-2"
                              data-testid={`metric-run-report-package-render-section-${section.sectionId}`}
                            >
                              <p className="text-sm font-semibold text-charcoal">{section.title}</p>
                              <dl className="mt-2 space-y-1">
                                {section.rows.map((row) => (
                                  <div
                                    key={row.metricId}
                                    className="flex items-center justify-between gap-3 text-sm"
                                  >
                                    <dt className="text-charcoal/70">{row.label}</dt>
                                    <dd className="font-mono text-charcoal">
                                      {formatRenderMetricValue(row)}
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                            </div>
                          ))}
                        </div>

                        <div
                          className="grid gap-3 lg:grid-cols-2"
                          data-testid="metric-run-report-package-render-narratives"
                        >
                          {reportPackageRenderModel.narrativeSections.map((section) => (
                            <section
                              key={section.sectionId}
                              className="rounded-md border border-beige-200 px-3 py-2"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <h3 className="text-sm font-semibold text-charcoal">
                                  {section.title}
                                </h3>
                                <span className="text-xs text-charcoal/60">
                                  Run #{section.narrativeRunId}
                                </span>
                              </div>
                              <p className="mt-2 text-sm text-charcoal/70">{section.body}</p>
                            </section>
                          ))}
                        </div>

                        <div className="grid gap-2 text-xs text-charcoal/60 sm:grid-cols-3">
                          <span>
                            Warnings {reportPackageRenderModel.diagnostics.warnings.length}
                          </span>
                          <span>
                            Evidence {reportPackageRenderModel.references.evidenceRecordIds.length}
                          </span>
                          <span>
                            Source rows{' '}
                            {reportPackageRenderModel.references.sourceEventIds.length +
                              reportPackageRenderModel.references.sourceMarkIds.length}
                          </span>
                        </div>

                        {reportPackageJsonExportBlockers.length > 0 ? (
                          <Alert
                            variant="destructive"
                            data-testid="metric-run-report-package-json-export-blocked"
                          >
                            <AlertTitle>JSON handoff blocked</AlertTitle>
                            <AlertDescription>
                              <ul className="list-disc space-y-1 pl-5">
                                {reportPackageJsonExportBlockers.map((blocker, index) => (
                                  <li key={`${blocker.code}-${index}`}>
                                    {blocker.message}
                                    {blocker.evidenceRecordId
                                      ? ` Evidence #${blocker.evidenceRecordId}.`
                                      : ''}
                                    {blocker.evidenceRecordIds
                                      ? ` Evidence refs ${blocker.evidenceRecordIds.join(', ')}.`
                                      : ''}
                                  </li>
                                ))}
                              </ul>
                            </AlertDescription>
                          </Alert>
                        ) : null}

                        {reportPackageJsonExportEnvelope ? (
                          <Alert
                            variant="destructive"
                            data-testid="metric-run-report-package-json-export-error"
                            data-error-status={reportPackageJsonExportError?.status ?? ''}
                          >
                            <AlertTitle>{reportPackageJsonExportEnvelope.title}</AlertTitle>
                            <AlertDescription>
                              {reportPackageJsonExportEnvelope.description}
                            </AlertDescription>
                          </Alert>
                        ) : null}

                        {reportPackageStoredJsonBlockers.length > 0 ? (
                          <Alert
                            variant="destructive"
                            data-testid="metric-run-report-package-stored-json-blocked"
                          >
                            <AlertTitle>Stored JSON blocked</AlertTitle>
                            <AlertDescription>
                              <ul className="list-disc space-y-1 pl-5">
                                {reportPackageStoredJsonBlockers.map((blocker, index) => (
                                  <li key={`${blocker.code}-${index}`}>
                                    {blocker.message}
                                    {blocker.evidenceRecordId
                                      ? ` Evidence #${blocker.evidenceRecordId}.`
                                      : ''}
                                    {blocker.evidenceRecordIds
                                      ? ` Evidence refs ${blocker.evidenceRecordIds.join(', ')}.`
                                      : ''}
                                  </li>
                                ))}
                              </ul>
                            </AlertDescription>
                          </Alert>
                        ) : null}

                        {reportPackageStoredJsonEnvelope ? (
                          <Alert
                            variant="destructive"
                            data-testid="metric-run-report-package-stored-json-error"
                            data-error-status={reportPackageStoredJsonError?.status ?? ''}
                          >
                            <AlertTitle>{reportPackageStoredJsonEnvelope.title}</AlertTitle>
                            <AlertDescription>
                              {reportPackageStoredJsonEnvelope.description}
                            </AlertDescription>
                          </Alert>
                        ) : null}

                        {reportPackageStoredCsvEnvelope ? (
                          <Alert
                            variant="destructive"
                            data-testid="metric-run-report-package-stored-csv-error"
                            data-error-status={reportPackageStoredCsvError?.status ?? ''}
                          >
                            <AlertTitle>{reportPackageStoredCsvEnvelope.title}</AlertTitle>
                            <AlertDescription>
                              {reportPackageStoredCsvEnvelope.description}
                            </AlertDescription>
                          </Alert>
                        ) : null}

                        {reportPackageJsonExportHash ? (
                          <Alert data-testid="metric-run-report-package-json-export-result">
                            <AlertTitle>JSON handoff ready</AlertTitle>
                            <AlertDescription>
                              SHA-256 {reportPackageJsonExportHash.slice(0, 12)}...
                            </AlertDescription>
                          </Alert>
                        ) : null}

                        {reportPackageStoredCsvRecord && reportPackageStoredCsvMetadata ? (
                          <Alert data-testid="metric-run-report-package-stored-csv-result">
                            <AlertTitle>Stored CSV ready</AlertTitle>
                            <AlertDescription>
                              Status {reportPackageStoredCsvRecord.status}; SHA-256{' '}
                              {reportPackageStoredCsvRecord.contentHash.slice(0, 12)}...; source
                              JSON #{reportPackageStoredCsvMetadata.sourceJsonExportId}; created{' '}
                              {reportPackageStoredCsvRecord.createdAt} by user #
                              {reportPackageStoredCsvRecord.createdBy}.
                            </AlertDescription>
                          </Alert>
                        ) : null}

                        {reportPackageStoredJsonRecord ? (
                          <Alert data-testid="metric-run-report-package-stored-json-result">
                            <AlertTitle>Stored JSON ready</AlertTitle>
                            <AlertDescription>
                              Status {reportPackageStoredJsonRecord.status}; SHA-256{' '}
                              {reportPackageStoredJsonRecord.contentHash.slice(0, 12)}...; created{' '}
                              {reportPackageStoredJsonRecord.createdAt} by user #
                              {reportPackageStoredJsonRecord.createdBy}.
                            </AlertDescription>
                          </Alert>
                        ) : null}

                        <div className="flex flex-col gap-3 border-t border-beige-200 pt-3 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-sm text-charcoal/70 font-poppins">
                            Create the package JSON handoff for this locked metric run.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => void handleReportPackageJsonExport()}
                              disabled={!canExportReportPackageJson}
                              data-testid="metric-run-report-package-export-json"
                            >
                              <FileJson className="mr-2 h-4 w-4" aria-hidden="true" />
                              {reportPackageJsonExportQuery.isFetching
                                ? 'Preparing...'
                                : 'Export JSON'}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => void handleReportPackageStoredJsonCreate()}
                              disabled={!canStoreReportPackageJson}
                              data-testid="metric-run-report-package-store-json"
                            >
                              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                              {reportPackageStoredJsonExportCreateMutation.isPending
                                ? 'Storing...'
                                : 'Store JSON'}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => void handleReportPackageStoredJsonExport()}
                              disabled={!canExportStoredReportPackageJson}
                              data-testid="metric-run-report-package-export-stored-json"
                            >
                              <FileJson className="mr-2 h-4 w-4" aria-hidden="true" />
                              {reportPackageStoredJsonArtifactQuery.isFetching
                                ? 'Preparing...'
                                : 'Export stored JSON'}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => void handleReportPackageStoredCsvCreate()}
                              disabled={!canStoreReportPackageCsv}
                              data-testid="metric-run-report-package-store-csv"
                            >
                              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                              {reportPackageStoredCsvExportCreateMutation.isPending
                                ? 'Storing...'
                                : 'Store CSV'}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => void handleReportPackageStoredCsvExport()}
                              disabled={!canExportStoredReportPackageCsv}
                              data-testid="metric-run-report-package-export-stored-csv"
                            >
                              <FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden="true" />
                              {reportPackageStoredCsvArtifactQuery.isFetching
                                ? 'Preparing...'
                                : 'Export stored CSV'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-charcoal/70 font-poppins">
                      {approvedNarrativeCount} of {NARRATIVE_TYPES.length} narratives approved.
                    </p>
                    <Button
                      type="button"
                      onClick={() => void handleReportPackageAssemble()}
                      disabled={!canAssembleReportPackage}
                      data-testid="metric-run-report-package-assemble"
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
                      Assemble package
                    </Button>
                  </div>
                )}
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
