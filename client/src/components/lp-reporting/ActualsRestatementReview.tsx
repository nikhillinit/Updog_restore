import { useEffect, useRef, useState } from 'react';
import type {
  FinancialCapitalActualsV1,
  FinancialFactsBasisRef,
} from '@shared/contracts/financial-facts-snapshot-v1.contract';
import {
  ACTUALS_LEDGER_MAX_BYTES,
  ACTUALS_VALUATION_MAX_BYTES,
  type ActualMetricsV2,
  type ActualsPublishFileV1,
  type FinancialFactsLatestReferenceV1,
} from '@shared/contracts/lp-reporting/actuals-pilot.contract';
import {
  ACTUALS_LEDGER_TEMPLATE_VERSION,
  ACTUALS_VALUATION_TEMPLATE_VERSION,
} from '@shared/contracts/lp-reporting/actuals-pilot-templates';
import {
  ACTUALS_RESTATEMENT_CONTRACT_VERSION,
  ActualsRestatementPreviewRequestV1Schema,
  type ActualsRestatementPreviewRequestV1,
  type ActualsRestatementPreviewResponseV1,
  type ActualsRestatementRecordFieldsV1,
  type ActualsRestatementTargetV1,
} from '@shared/contracts/lp-reporting/actuals-restatement.contract';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useActualsMetrics, useActualsPreview } from '@/hooks/lp-reporting';
import type { LpReportingHookError } from '@/hooks/lp-reporting/contract-fetch';
import {
  clearRestatementCommand,
  freezeRestatementCommand,
  isRestatementOutcomeUncertain,
  persistRestatementCommand,
  prepareActualsFile,
  recoverRestatementCommand,
  restoreRestatementFile,
  restatementBasisKey,
  useActualsRestatementHistory,
  useActualsRestatementPreview,
  useActualsRestatementPublish,
  useActualsRestatementTargets,
  type FrozenRestatementCommand,
} from '@/hooks/lp-reporting/useActualsRestatement';
import { formatDecimalCurrency, formatDecimalRatio } from '@/lib/format/lp-reporting/decimal';
import ActualMetricsReadback from './ActualMetricsReadback';

export interface ActualsRestatementReviewProps {
  fundId: number;
  latestReference?: FinancialFactsLatestReferenceV1;
  disabled: boolean;
  onLockChange: (locked: boolean) => void;
  onPendingChange: (pending: boolean) => void;
  onRefreshBasis: () => Promise<unknown>;
}

interface PreparedCorrection {
  request: ActualsRestatementPreviewRequestV1;
  result: ActualsRestatementPreviewResponseV1;
}

const targetKey = (target: ActualsRestatementTargetV1) =>
  `${target.identity.kind}:${target.identity.recordId}:${target.identity.contentHash}`;
const fieldLabel = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2');
const fieldText = (value: unknown) => (value === null ? 'Not supplied' : String(value));

function RecordComparison({
  before,
  after,
}: {
  before: ActualsRestatementRecordFieldsV1;
  after: ActualsRestatementRecordFieldsV1;
}) {
  const replacement = new Map(Object.entries(after));
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (key) => key !== 'kind'
  );
  const original = new Map(Object.entries(before));
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Field</TableHead>
            <TableHead>Published</TableHead>
            <TableHead>Replacement</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {keys.map((key) => (
            <TableRow key={key}>
              <TableCell className="capitalize">{fieldLabel(key)}</TableCell>
              <TableCell className="tabular-nums">{fieldText(original.get(key) ?? null)}</TableCell>
              <TableCell className="tabular-nums">
                {fieldText(replacement.get(key) ?? null)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface GovernedValue {
  value: string | null;
  availability: string;
  reasonCodes: string[];
}
function governedText(value: GovernedValue | undefined, ratio = false) {
  if (!value || value.availability !== 'available' || value.value === null) {
    return `Unavailable — ${value?.reasonCodes.join(', ') || 'SOURCE_NOT_SUPPLIED'}`;
  }
  return ratio ? formatDecimalRatio(value.value) : formatDecimalCurrency(value.value);
}

function CorrectionImpact({
  before,
  after,
}: {
  before: ActualMetricsV2 | undefined;
  after: FinancialCapitalActualsV1;
}) {
  const current = before?.snapshotStatus === 'resolved' ? before : undefined;
  const rows: Array<[string, GovernedValue | undefined, GovernedValue, boolean?]> = [
    ['Paid in', current?.capital.paidIn, after.paidInCapital],
    ['Deployed', current?.capital.deployed, after.deployedCapital],
    ['Initial deployed', current?.capital.initialDeployed, after.initialDeployedCapital],
    ['Follow-on deployed', current?.capital.followOnDeployed, after.followOnDeployedCapital],
    ['Management fees paid', current?.expenses.managementFeesPaid, after.managementFeesPaid],
    ['Other expenses paid', current?.expenses.otherExpensesPaid, after.otherExpensesPaid],
    ['Realized proceeds', current?.value.realizedFundProceeds, after.realizedFundProceeds],
    ['Distributions', current?.value.distributionsToPartners, after.distributionsToPartners],
    ['Portfolio FMV', current?.value.portfolioFmv, after.portfolioFmv],
    ['NAV', current?.value.nav, after.nav],
    ['DPI', current?.performance.dpi, after.dpi, true],
    ['RVPI', current?.performance.rvpi, after.rvpi, true],
    ['TVPI', current?.performance.tvpi, after.tvpi, true],
  ];
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Metric</TableHead>
            <TableHead>Published basis</TableHead>
            <TableHead>After correction</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(([label, original, replacement, ratio]) => (
            <TableRow key={label}>
              <TableCell>{label}</TableCell>
              <TableCell className="tabular-nums">{governedText(original, ratio)}</TableCell>
              <TableCell className="tabular-nums">{governedText(replacement, ratio)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function BasisDetails({ basis }: { basis: FinancialFactsBasisRef }) {
  return (
    <details className="text-xs text-charcoal/70">
      <summary className="min-h-11 cursor-pointer py-3">
        Basis snapshot {basis.snapshotId} · {basis.asOfDate}
      </summary>
      <dl className="grid gap-2 break-all font-mono">
        {Object.entries(basis).map(([key, value]) => (
          <div key={key}>
            <dt>{fieldLabel(key)}</dt>
            <dd>{String(value)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function ActualsRestatementReview({
  fundId,
  latestReference,
  disabled,
  onLockChange,
  onPendingChange,
  onRefreshBasis,
}: ActualsRestatementReviewProps) {
  const [recovery] = useState(() => recoverRestatementCommand(fundId));
  const [open, setOpen] = useState(recovery.command !== null || recovery.corrupt);
  const [frozen, setFrozen] = useState<FrozenRestatementCommand | null>(recovery.command);
  const [selectedKey, setSelectedKey] = useState('');
  const [externalRef, setExternalRef] = useState(
    recovery.command?.stored.body.items[0]?.replacementExternalRef ?? ''
  );
  const [reason, setReason] = useState(recovery.command?.stored.body.reason ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [prepared, setPrepared] = useState<PreparedCorrection | null>(null);
  const [targetCursor, setTargetCursor] = useState<string | null>(null);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);
  const inFlight = useRef(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const basis = latestReference?.head?.basisRef ?? null;
  const basisKey = basis === null ? null : restatementBasisKey(basis);
  const previousBasis = useRef(basisKey);
  const targets = useActualsRestatementTargets(fundId, basis, targetCursor, open && !disabled);
  const history = useActualsRestatementHistory(fundId, basis, historyCursor, open && !disabled);
  const csvPreview = useActualsPreview(fundId);
  const correctionPreview = useActualsRestatementPreview(fundId);
  const publication = useActualsRestatementPublish(fundId);
  const originalMetrics = useActualsMetrics(
    fundId,
    basis?.snapshotId ?? null,
    open && basis !== null
  );
  const publishedMetrics = useActualsMetrics(
    fundId,
    publication.data?.facts.snapshotId ?? null,
    publication.data !== undefined
  );
  const target = targets.data?.targets.find((candidate) => targetKey(candidate) === selectedKey);
  const readError = targets.error ?? history.error;
  const editingLocked = disabled || busy || frozen !== null || recovery.corrupt;
  const stalePreview =
    prepared !== null && restatementBasisKey(prepared.request.expectedBasis) !== basisKey;
  const knownBasisMetrics =
    originalMetrics.data?.snapshotStatus === 'resolved' &&
    originalMetrics.data.financialFactsSnapshotId === basis?.snapshotId &&
    originalMetrics.data.snapshotInputHash === basis?.snapshotInputHash
      ? originalMetrics.data
      : undefined;

  useEffect(() => {
    onLockChange(busy || frozen !== null || recovery.corrupt);
    onPendingChange(busy || frozen?.stored.status === 'uncertain');
    return () => {
      onLockChange(false);
      onPendingChange(false);
    };
  }, [busy, frozen, onLockChange, onPendingChange, recovery.corrupt]);
  useEffect(() => {
    if (previousBasis.current !== basisKey) {
      previousBasis.current = basisKey;
      setTargetCursor(null);
      setHistoryCursor(null);
      if (frozen === null) {
        setSelectedKey('');
        setPrepared(null);
      }
    }
  }, [basisKey, frozen]);
  useEffect(() => {
    if (prepared) previewRef.current?.focus();
  }, [prepared]);
  useEffect(() => {
    if (publication.data) receiptRef.current?.focus();
  }, [publication.data]);
  useEffect(() => {
    if (retryAfter <= 0) return;
    const timer = window.setInterval(() => setRetryAfter((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [retryAfter]);

  const resetPreview = () => {
    setPrepared(null);
    setError(null);
    correctionPreview.reset();
    publication.reset();
  };
  function finishOperation() {
    inFlight.current = false;
    setBusy(false);
  }

  async function refreshBasis() {
    setError(null);
    try {
      await onRefreshBasis();
    } catch {
      setError('Published basis could not be refreshed. Try again.');
    }
  }

  async function handlePreview() {
    if (editingLocked || inFlight.current || !basis || !target || !file) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setPrepared(null);
    try {
      if (!reason.trim()) throw new Error('Enter a correction reason.');
      if (!externalRef.trim() || externalRef === target.sourceExternalRef)
        throw new Error('Use a fresh replacement external reference.');
      const isLedger = target.identity.kind === 'ledger';
      const templateVersion = isLedger
        ? ACTUALS_LEDGER_TEMPLATE_VERSION
        : ACTUALS_VALUATION_TEMPLATE_VERSION;
      const upload = await prepareActualsFile(
        file,
        isLedger ? ACTUALS_LEDGER_MAX_BYTES : ACTUALS_VALUATION_MAX_BYTES
      );
      const preview = await csvPreview.mutateAsync({
        contractVersion: 'actuals-preview-request/1.0.0',
        templateVersion,
        asOfDate: basis.asOfDate,
        fileName: file.name,
        payload: upload.payload,
      });
      const row = preview.rows[0];
      const issues = [...preview.issues, ...preview.rows.flatMap((candidate) => candidate.issues)];
      const existingMarkRequiresCorrection =
        !isLedger &&
        preview.templateVersion === ACTUALS_VALUATION_TEMPLATE_VERSION &&
        row?.eventType === 'valuation_mark' &&
        row.status === 'invalid' &&
        row.issues.length > 0 &&
        issues.every(
          (issue) =>
            issue.code === 'VALUATION_MARK_ALREADY_EXISTS' && issue.rowNumber === row.rowNumber
        );
      if (
        preview.rows.length !== 1 ||
        (!existingMarkRequiresCorrection && (!preview.canPublish || row?.status !== 'valid')) ||
        !row?.rowContentHash
      ) {
        throw new Error(
          issues.map((issue) => `${issue.code}: ${issue.message}`).join('; ') ||
            'Supply exactly one valid replacement row.'
        );
      }
      if (preview.payloadSha256 !== upload.payloadSha256)
        throw new Error('CSV preview does not match the replacement file bytes.');
      if (row.sourceExternalRef !== externalRef)
        throw new Error('CSV external reference must match the replacement reference.');
      const replacement: ActualsPublishFileV1 = {
        templateVersion,
        fileName: preview.sanitizedFileName,
        payload: upload.payload,
        expectedPayloadSha256: preview.payloadSha256,
        expectedCanonicalRowsHash: preview.canonicalRowsHash,
        expectedPreviewHash: preview.previewHash,
      };
      const request = ActualsRestatementPreviewRequestV1Schema.parse({
        contractVersion: ACTUALS_RESTATEMENT_CONTRACT_VERSION,
        expectedBasis: basis,
        expectedETag: `"financial-facts:${basis.snapshotId}:${basis.snapshotInputHash}"`,
        ledger: isLedger ? replacement : null,
        valuation: isLedger ? null : replacement,
        items: [
          {
            target: target.identity,
            originalPublication: target.originalPublication,
            replacementExternalRef: externalRef,
            expectedReplacementContentHash: row.rowContentHash,
          },
        ],
        reason,
      });
      const result = await correctionPreview.mutateAsync(request);
      setPrepared({ request, result });
    } catch (caught) {
      const failure = caught as LpReportingHookError;
      setError(
        `${failure.code ? `${failure.code}: ` : ''}${failure.message ?? 'Correction preview failed.'}`
      );
    } finally {
      finishOperation();
    }
  }

  async function sendCommand(command: FrozenRestatementCommand) {
    const attempting: FrozenRestatementCommand = {
      ...command,
      stored: { ...command.stored, status: 'uncertain' },
    };
    persistRestatementCommand(attempting);
    setFrozen(attempting);
    try {
      await publication.mutateAsync(attempting);
    } catch (caught) {
      const failure = caught as LpReportingHookError & { retryAfterSeconds?: number };
      const failed: FrozenRestatementCommand = {
        ...attempting,
        stored: {
          ...attempting.stored,
          status: isRestatementOutcomeUncertain(failure) ? 'uncertain' : 'refused',
        },
      };
      persistRestatementCommand(failed);
      setFrozen(failed);
      setRetryAfter(failure.retryAfterSeconds ?? 0);
      setError(`${failure.code ?? 'CORRECTION_OUTCOME_UNKNOWN'}: ${failure.message}`);
      return;
    }
    clearRestatementCommand(fundId);
    setFrozen(null);
    setPrepared(null);
    setFile(null);
    try {
      await onRefreshBasis();
    } catch {
      setError('Correction published. Refresh the published basis to load its latest state.');
    }
  }

  async function handlePublish() {
    if (disabled || inFlight.current || busy || recovery.corrupt || retryAfter > 0) return;
    if (!frozen && (!prepared?.result.canPublish || stalePreview)) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      let command = frozen;
      if (command === null) {
        if (!prepared) return;
        command = await freezeRestatementCommand(fundId, {
          ...prepared.request,
          expectedPreviewHash: prepared.result.previewHash,
        });
        setFrozen(command);
      }
      if (command.body === null) {
        if (!file) throw new Error('Reattach the exact replacement CSV to retry this correction.');
        command = await restoreRestatementFile(command, file);
        setFrozen(command);
      }
      await sendCommand(command);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Correction command could not be prepared.'
      );
    } finally {
      finishOperation();
    }
  }

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="border-t border-beige-200 pt-4"
    >
      <summary className="min-h-11 cursor-pointer py-3 font-inter text-lg font-semibold text-charcoal">
        Correct published actuals
      </summary>
      <section className="space-y-4" aria-label="Published actuals correction" aria-busy={busy}>
        <p className="text-sm text-charcoal/70">
          Replace one published ledger row or valuation mark. Review the original, correction, and
          resulting metrics before restating.
        </p>
        {basis ? (
          <BasisDetails basis={basis} />
        ) : (
          <p role="status">A published financial-facts basis is required.</p>
        )}
        {disabled ? (
          <p role="status">
            Finish the active publication or draft command before preparing a correction.
          </p>
        ) : null}
        {error || targets.error || history.error || recovery.corrupt ? (
          <Alert variant="destructive" role="alert">
            <AlertTitle>
              {recovery.corrupt ? 'CORRECTION_RECOVERY_INVALID' : 'CORRECTION_REVIEW_BLOCKED'}
            </AlertTitle>
            <AlertDescription className="break-words">
              {recovery.corrupt
                ? 'Stored correction metadata cannot be verified. Preserve the existing command record and resolve its outcome before creating another correction.'
                : (error ??
                  (readError
                    ? `${readError.code ? `${readError.code}: ` : ''}${readError.message}`
                    : null))}
            </AlertDescription>
          </Alert>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={busy || disabled}
          onClick={() => void refreshBasis()}
        >
          Refresh published basis
        </Button>
        {frozen ? (
          <Alert role="status">
            <AlertTitle>
              {frozen.stored.status === 'uncertain'
                ? 'Correction outcome unknown'
                : 'Correction command retained'}
            </AlertTitle>
            <AlertDescription>
              Retry uses the same target, reason, preview, basis, file bytes, and command key.{' '}
              {frozen.body === null ? 'Reattach the original replacement CSV.' : ''}
              <p className="break-all font-mono text-xs">Command {frozen.stored.key}</p>
              {frozen.stored.body.items.map((item) => (
                <p
                  key={`${item.target.kind}:${item.target.recordId}`}
                  className="break-all text-xs"
                >
                  {item.target.kind} {item.target.recordId} · {item.target.contentHash} →{' '}
                  {item.replacementExternalRef}
                </p>
              ))}
              <BasisDetails basis={frozen.stored.body.expectedBasis} />
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor={`correction-target-${fundId}`}>Published row or mark</Label>
          <select
            id={`correction-target-${fundId}`}
            className="min-h-11 w-full rounded-md border border-beige-200 bg-white px-3 text-sm text-charcoal focus-visible:outline focus-visible:outline-2 focus-visible:outline-charcoal"
            disabled={editingLocked || !basis || targets.isFetching || !!targets.error}
            value={selectedKey}
            onChange={(event) => {
              setSelectedKey(event.target.value);
              setFile(null);
              resetPreview();
            }}
          >
            <option value="">Choose an effective published target</option>
            {!targets.error
              ? targets.data?.targets.map((candidate) => (
                  <option key={targetKey(candidate)} value={targetKey(candidate)}>
                    {candidate.identity.kind} {candidate.identity.recordId} ·{' '}
                    {candidate.sourceExternalRef} ·{' '}
                    {candidate.fields.kind === 'ledger'
                      ? candidate.fields.effectiveDate
                      : candidate.fields.markDate}
                  </option>
                ))
              : null}
          </select>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={editingLocked || targetCursor === null}
              onClick={() => {
                setTargetCursor(null);
                setSelectedKey('');
                resetPreview();
              }}
            >
              First targets
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={
                editingLocked || !targets.data?.nextCursor || targets.isFetching || !!targets.error
              }
              onClick={() => {
                setTargetCursor(targets.data?.nextCursor ?? null);
                setSelectedKey('');
                resetPreview();
              }}
            >
              Next targets
            </Button>
          </div>
          {targets.isFetching ? <p role="status">Loading basis-bound targets…</p> : null}
          {!targets.isFetching && targets.data?.targets.length === 0 ? (
            <p>No effective correction targets on this page.</p>
          ) : null}
        </div>
        {target && !targets.error ? (
          <div className="space-y-1 text-xs text-charcoal/70">
            <p className="break-all">
              Original publication: snapshot {target.originalPublication.snapshotId} ·{' '}
              {target.originalPublication.snapshotInputHash}
            </p>
            <p className="break-all">
              Target source: {target.identity.sourceHash} · content: {target.identity.contentHash}
            </p>
            <a
              className="inline-flex min-h-11 items-center underline"
              href={`/api/funds/${fundId}/actuals/metrics?factsSnapshotId=${target.originalPublication.snapshotId}`}
              target="_blank"
              rel="noreferrer"
            >
              Open original snapshot metrics
            </a>
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor={`correction-ref-${fundId}`}>Fresh replacement external reference</Label>
          <Input
            id={`correction-ref-${fundId}`}
            className="min-h-11"
            value={externalRef}
            disabled={editingLocked}
            onChange={(event) => {
              setExternalRef(event.target.value);
              resetPreview();
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`correction-file-${fundId}`}>Replacement CSV (one row)</Label>
          <Input
            id={`correction-file-${fundId}`}
            type="file"
            accept=".csv,text/csv"
            className="min-h-11"
            disabled={
              disabled || busy || recovery.corrupt || (frozen !== null && frozen.body !== null)
            }
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              if (!frozen) resetPreview();
            }}
          />
          {frozen ? (
            <p className="text-xs">
              Required file: {(frozen.stored.body.ledger ?? frozen.stored.body.valuation)?.fileName}
            </p>
          ) : target ? (
            <a
              className="inline-flex min-h-11 items-center text-sm underline"
              href={`/templates/actuals-${target.identity.kind === 'ledger' ? 'ledger' : 'valuation'}-1.0.0.csv`}
              download
            >
              Download replacement template
            </a>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor={`correction-reason-${fundId}`}>Correction reason</Label>
          <Textarea
            id={`correction-reason-${fundId}`}
            maxLength={500}
            value={reason}
            disabled={editingLocked}
            onChange={(event) => {
              setReason(event.target.value);
              resetPreview();
            }}
          />
        </div>
        {!frozen ? (
          <Button
            type="button"
            className="min-h-11"
            disabled={
              editingLocked ||
              !target ||
              !file ||
              !reason.trim() ||
              !externalRef.trim() ||
              !!targets.error
            }
            onClick={() => void handlePreview()}
          >
            Preview correction
          </Button>
        ) : null}
        {prepared ? (
          <div
            ref={previewRef}
            tabIndex={-1}
            className="space-y-3"
            role="region"
            aria-label="Correction before and after"
            aria-live="polite"
          >
            <h3 className="font-inter font-semibold">Review correction</h3>
            <BasisDetails basis={prepared.result.basisRef} />
            {prepared.result.items.map((item) => (
              <div
                key={`${item.original.identity.kind}:${item.original.identity.recordId}`}
                className="space-y-2"
              >
                <p className="text-sm break-all">
                  {item.original.sourceExternalRef} → {item.replacementExternalRef}
                </p>
                <RecordComparison before={item.original.fields} after={item.replacementFields} />
              </div>
            ))}
            <p className="text-sm">Reason: {prepared.request.reason}</p>
            {prepared.result.errors.map((failure, index) => (
              <p role="alert" key={`${failure.code}:${index}`}>
                {failure.code}: {failure.message}
              </p>
            ))}
            {prepared.result.impact ? (
              <>
                <CorrectionImpact
                  before={knownBasisMetrics}
                  after={prepared.result.impact.capitalActuals}
                />
                {prepared.result.impact.unavailableCompanyIds.length > 0 ? (
                  <p role="status">
                    Company monetary facts unavailable for{' '}
                    {prepared.result.impact.unavailableCompanyIds.join(', ')}. Reserve and
                    construction calculations require mapped deployment categories.
                  </p>
                ) : null}
              </>
            ) : (
              <p role="status">Correction impact is unavailable.</p>
            )}
            {stalePreview ? (
              <p role="alert">
                STALE_BASIS: Published facts changed. Select the current target and preview again.
              </p>
            ) : null}
            <p className="text-xs break-all text-charcoal/70">
              Preview {prepared.result.previewHash}
            </p>
          </div>
        ) : null}
        {frozen || prepared ? (
          <div className="space-y-2">
            <Button
              type="button"
              className="min-h-11"
              disabled={
                disabled ||
                busy ||
                recovery.corrupt ||
                retryAfter > 0 ||
                (frozen === null && (!prepared?.result.canPublish || stalePreview)) ||
                (frozen !== null && frozen.body === null && file === null)
              }
              onClick={() => void handlePublish()}
            >
              {frozen ? 'Retry same correction' : 'Restate published actuals'}
            </Button>
            {retryAfter > 0 ? <p role="status">Retry available in {retryAfter} seconds.</p> : null}
            {frozen && frozen.stored.status !== 'uncertain' ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 ml-2"
                disabled={busy || disabled}
                onClick={() => {
                  clearRestatementCommand(fundId);
                  setFrozen(null);
                  resetPreview();
                  setFile(null);
                  publication.reset();
                }}
              >
                Change correction and preview again
              </Button>
            ) : null}
          </div>
        ) : null}
        {publication.data ? (
          <div ref={receiptRef} tabIndex={-1} className="space-y-3" aria-live="polite">
            <h3 className="font-inter font-semibold">Correction published</h3>
            <p className="text-sm">
              Updated facts need an accepted current plan before forecast recomputation. Use the
              existing plan and recompute actions for snapshot {publication.data.facts.snapshotId}.
            </p>
            <ActualMetricsReadback
              receipt={publication.data}
              {...(latestReference ? { latestReference } : {})}
              {...(publishedMetrics.data ? { metrics: publishedMetrics.data } : {})}
              isLoading={publishedMetrics.isLoading}
              {...(publishedMetrics.error?.code ? { errorCode: publishedMetrics.error.code } : {})}
              {...(publishedMetrics.error?.message
                ? { errorMessage: publishedMetrics.error.message }
                : {})}
            />
          </div>
        ) : null}
        <details className="border-t border-beige-200 pt-2">
          <summary className="min-h-11 cursor-pointer py-3 font-medium">
            Replacement history
          </summary>
          {history.isFetching ? <p role="status">Loading replacement history…</p> : null}
          {!history.error &&
            history.data?.history.map((entry) => (
              <article key={entry.id} className="space-y-1 border-t border-beige-200 py-3 text-sm">
                <p>
                  Snapshot {entry.publication.snapshotId} · {entry.correction.createdAt} · actor{' '}
                  {entry.correction.actor.userId}
                </p>
                <p>{entry.correction.reason}</p>
                {entry.correction.items.map((item) => (
                  <p key={`${item.target.kind}:${item.target.recordId}`}>
                    {item.target.kind} {item.target.recordId} → {item.replacement.recordId}
                  </p>
                ))}
                <p className="break-all font-mono text-xs">{entry.publication.snapshotInputHash}</p>
                <a
                  className="inline-flex min-h-11 items-center underline"
                  href={`/api/funds/${fundId}/actuals/metrics?factsSnapshotId=${entry.publication.snapshotId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open correction snapshot metrics
                </a>
              </article>
            ))}
          {!history.isFetching && history.data?.history.length === 0 ? (
            <p>No replacements recorded on this page.</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={disabled || busy || historyCursor === null}
              onClick={() => setHistoryCursor(null)}
            >
              First history page
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={
                disabled ||
                busy ||
                !history.data?.nextCursor ||
                history.isFetching ||
                !!history.error
              }
              onClick={() => setHistoryCursor(history.data?.nextCursor ?? null)}
            >
              Next history page
            </Button>
          </div>
        </details>
      </section>
    </details>
  );
}

export default ActualsRestatementReview;
