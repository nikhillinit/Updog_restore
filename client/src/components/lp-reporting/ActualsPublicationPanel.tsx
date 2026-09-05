import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ActualsPreviewIssueV1,
  ActualsPreviewResponseV1,
  ActualsPreviewTotalsV1,
  ActualsPublishRequestV1,
} from '@shared/contracts/lp-reporting';
import {
  ACTUALS_LEDGER_TEMPLATE_VERSION,
  ACTUALS_VALUATION_TEMPLATE_VERSION,
} from '@shared/contracts/lp-reporting/actuals-pilot-templates';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  useActualsMetrics,
  useActualsPreview,
  useActualsPublish,
  useFinancialFactsLatestReference,
  type ActualsPublishHookError,
} from '@/hooks/lp-reporting';
import { sha256Bytes, sha256Hash } from '@/lib/hash';
import { formatDecimalCurrency } from '@/lib/format/lp-reporting/decimal';
import { ActualMetricsReadback } from './ActualMetricsReadback';

const STORAGE_PREFIX = 'actuals-publish:v1:';
const LEDGER_MAX_BYTES = 120 * 1024;
const VALUATION_MAX_BYTES = 40 * 1024;
const PREVIEW_PAGE_SIZE = 100;

type CommandStatus = 'ready' | 'uncertain' | 'precondition_failed' | 'rate_limited' | 'refused';

interface StoredFileMetadata {
  fileName: string;
  payloadSha256: string;
  canonicalRowsHash: string;
  previewHash: string;
}

interface StoredCommand {
  version: 1;
  fundId: number;
  asOfDate: string;
  ledger: StoredFileMetadata;
  valuation: StoredFileMetadata | null;
  coverage: ActualsPublishRequestV1['coverage'];
  idempotencyKey: string;
  ifMatch: string;
  requestIdentityHash: string;
  status: CommandStatus;
}

interface PreparedFile {
  file: File;
  payload: string;
  payloadSha256: string;
}

interface FreshPreviewState {
  ledger: ActualsPreviewResponseV1;
  valuation: ActualsPreviewResponseV1 | null;
  ledgerFile: PreparedFile;
  valuationFile: PreparedFile | null;
}

interface StoredCommandRecovery {
  command: StoredCommand | null;
  storageKey: string | null;
  corruptKeys: string[];
}

function storagePrefix(fundId: number): string {
  return `${STORAGE_PREFIX}${fundId}:`;
}

function storageKey(command: StoredCommand): string {
  return `${storagePrefix(command.fundId)}${command.requestIdentityHash}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function prepareFile(file: File, maxBytes: number): Promise<PreparedFile> {
  if (file.size > maxBytes) {
    throw new Error(`${file.name} exceeds ${Math.floor(maxBytes / 1024)} KB.`);
  }
  const arrayBuffer =
    typeof file.arrayBuffer === 'function'
      ? await file.arrayBuffer()
      : await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(reader.error ?? new Error('File read failed.'));
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.readAsArrayBuffer(file);
        });
  const bytes = new Uint8Array(arrayBuffer);
  return { file, payload: bytesToBase64(bytes), payloadSha256: await sha256Bytes(bytes) };
}

function newIdempotencyKey(): string {
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    throw new Error('Secure UUID generation unavailable.');
  }
  return crypto.randomUUID().toLowerCase();
}

function isStoredFileMetadata(value: unknown): value is StoredFileMetadata {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item['fileName'] === 'string' &&
    typeof item['payloadSha256'] === 'string' &&
    typeof item['canonicalRowsHash'] === 'string' &&
    typeof item['previewHash'] === 'string'
  );
}

function isStoredCommand(value: unknown, fundId: number): value is StoredCommand {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  const coverage = item['coverage'] as Record<string, unknown> | undefined;
  return (
    item['version'] === 1 &&
    item['fundId'] === fundId &&
    typeof item['asOfDate'] === 'string' &&
    isStoredFileMetadata(item['ledger']) &&
    (item['valuation'] === null || isStoredFileMetadata(item['valuation'])) &&
    coverage !== undefined &&
    (coverage['ledger'] === 'inception_to_date' ||
      coverage['ledger'] === 'incremental_since_prior_head') &&
    (coverage['priorFactsSnapshotId'] === null ||
      typeof coverage['priorFactsSnapshotId'] === 'number') &&
    typeof coverage['evidenceNote'] === 'string' &&
    typeof item['idempotencyKey'] === 'string' &&
    typeof item['ifMatch'] === 'string' &&
    typeof item['requestIdentityHash'] === 'string' &&
    ['ready', 'uncertain', 'precondition_failed', 'rate_limited', 'refused'].includes(
      String(item['status'])
    )
  );
}

function readStoredCommand(fundId: number): StoredCommandRecovery {
  const keys = Array.from({ length: sessionStorage.length }, (_, index) =>
    sessionStorage.key(index)
  )
    .filter((key): key is string => key?.startsWith(storagePrefix(fundId)) === true)
    .sort();
  if (keys.length !== 1) return { command: null, storageKey: null, corruptKeys: keys };
  const key = keys[0]!;
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? 'null') as unknown;
    if (!isStoredCommand(value, fundId) || key !== storageKey(value)) {
      return { command: null, storageKey: null, corruptKeys: [key] };
    }
    return { command: value, storageKey: key, corruptKeys: [] };
  } catch {
    return { command: null, storageKey: null, corruptKeys: [key] };
  }
}

function writeStoredCommand(command: StoredCommand, previousKey: string | null): string {
  const nextKey = storageKey(command);
  sessionStorage.setItem(nextKey, JSON.stringify(command));
  if (previousKey !== null && previousKey !== nextKey) sessionStorage.removeItem(previousKey);
  return nextKey;
}

function previewMetadata(preview: ActualsPreviewResponseV1): StoredFileMetadata {
  return {
    fileName: preview.sanitizedFileName,
    payloadSha256: preview.payloadSha256,
    canonicalRowsHash: preview.canonicalRowsHash,
    previewHash: preview.previewHash,
  };
}

function publishFile(
  templateVersion:
    typeof ACTUALS_LEDGER_TEMPLATE_VERSION | typeof ACTUALS_VALUATION_TEMPLATE_VERSION,
  prepared: PreparedFile,
  metadata: StoredFileMetadata
): ActualsPublishRequestV1['ledger'] {
  return {
    templateVersion,
    fileName: metadata.fileName,
    payload: prepared.payload,
    expectedPayloadSha256: metadata.payloadSha256,
    expectedCanonicalRowsHash: metadata.canonicalRowsHash,
    expectedPreviewHash: metadata.previewHash,
  };
}

function issueRows(preview: FreshPreviewState | null) {
  if (preview === null) return [];
  const files = [
    { fileKey: 'ledger' as const, fileLabel: 'Ledger', response: preview.ledger },
    { fileKey: 'valuation' as const, fileLabel: 'Valuation', response: preview.valuation },
  ];
  const unique = new Map<
    string,
    {
      fileKey: 'ledger' | 'valuation';
      fileLabel: string;
      issue: ActualsPreviewIssueV1;
    }
  >();
  for (const file of files) {
    if (file.response === null) continue;
    for (const issue of [
      ...file.response.issues,
      ...file.response.rows.flatMap((row) => row.issues),
    ]) {
      const key = [
        file.fileKey,
        issue.rowNumber,
        issue.column,
        issue.code,
        issue.severity,
        issue.message,
      ].join(':');
      unique.set(key, { fileKey: file.fileKey, fileLabel: file.fileLabel, issue });
    }
  }
  return [...unique.values()];
}

const PREVIEW_TOTAL_ROWS: Array<{
  key: keyof ActualsPreviewTotalsV1;
  label: string;
  kind: 'money' | 'count';
}> = [
  { key: 'settledPaidIn', label: 'Settled paid in', kind: 'money' },
  { key: 'deployed', label: 'Deployed', kind: 'money' },
  { key: 'initialDeployed', label: 'Initial deployed', kind: 'money' },
  { key: 'followOnDeployed', label: 'Follow-on deployed', kind: 'money' },
  { key: 'secondaryDeployed', label: 'Secondary deployed', kind: 'money' },
  { key: 'otherDeployed', label: 'Other deployed', kind: 'money' },
  { key: 'managementFees', label: 'Management fees', kind: 'money' },
  { key: 'otherExpenses', label: 'Other expenses', kind: 'money' },
  { key: 'realizedFundProceeds', label: 'Realized fund proceeds', kind: 'money' },
  { key: 'distributionsToPartners', label: 'Distributions to partners', kind: 'money' },
  { key: 'positionFairValue', label: 'Position fair value', kind: 'money' },
  { key: 'markedCompanyCount', label: 'Marked companies', kind: 'count' },
];

function previewRowId(fileKey: 'ledger' | 'valuation', rowNumber: number): string {
  return `actuals-preview-${fileKey}-row-${rowNumber}`;
}

function PreviewTotals({
  fileLabel,
  preview,
}: {
  fileLabel: string;
  preview: ActualsPreviewResponseV1;
}) {
  return (
    <div className="overflow-x-auto" aria-live="polite">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{fileLabel} total</TableHead>
            <TableHead scope="col">File total</TableHead>
            <TableHead scope="col">Net-new effect</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {PREVIEW_TOTAL_ROWS.map(({ key, label, kind }) => (
            <TableRow key={key}>
              <TableCell>{label}</TableCell>
              <TableCell className="tabular-nums">
                {kind === 'money'
                  ? formatDecimalCurrency(String(preview.fileTotals[key]))
                  : preview.fileTotals[key]}
              </TableCell>
              <TableCell className="tabular-nums">
                {kind === 'money'
                  ? formatDecimalCurrency(String(preview.netNewEffectTotals[key]))
                  : preview.netNewEffectTotals[key]}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PreviewRows({
  fileKey,
  fileLabel,
  preview,
  page,
  onPageChange,
}: {
  fileKey: 'ledger' | 'valuation';
  fileLabel: string;
  preview: ActualsPreviewResponseV1;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(preview.rows.length / PREVIEW_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const start = currentPage * PREVIEW_PAGE_SIZE;
  const rows = preview.rows.slice(start, start + PREVIEW_PAGE_SIZE);

  return (
    <section className="space-y-2" aria-label={`${fileLabel} preview rows`}>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col" className="sticky left-0 z-10 bg-background">
                Row
              </TableHead>
              <TableHead scope="col">External ref</TableHead>
              <TableHead scope="col">Status</TableHead>
              <TableHead scope="col">Type</TableHead>
              <TableHead scope="col">Date</TableHead>
              <TableHead scope="col">Company</TableHead>
              <TableHead scope="col">Vehicle</TableHead>
              <TableHead scope="col">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.rowNumber}
                id={previewRowId(fileKey, row.rowNumber)}
                data-testid={previewRowId(fileKey, row.rowNumber)}
                tabIndex={-1}
              >
                <TableCell className="sticky left-0 z-10 bg-background">{row.rowNumber}</TableCell>
                <TableCell>{row.sourceExternalRef ?? '--'}</TableCell>
                <TableCell>{row.status}</TableCell>
                <TableCell>{row.eventType ?? '--'}</TableCell>
                <TableCell>{row.effectiveDate ?? '--'}</TableCell>
                <TableCell>{row.companyLabel ?? '--'}</TableCell>
                <TableCell>{row.vehicleLabel ?? '--'}</TableCell>
                <TableCell className="tabular-nums">
                  {formatDecimalCurrency(row.canonicalAmount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-charcoal/70">
          Page {currentPage + 1} of {pageCount} · rows {preview.rows.length === 0 ? 0 : start + 1}–
          {Math.min(start + PREVIEW_PAGE_SIZE, preview.rows.length)} of {preview.rows.length}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={currentPage === 0}
            onClick={() => onPageChange(currentPage - 1)}
          >
            Previous {fileLabel.toLowerCase()} rows
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={currentPage >= pageCount - 1}
            onClick={() => onPageChange(currentPage + 1)}
          >
            Next {fileLabel.toLowerCase()} rows
          </Button>
        </div>
      </div>
    </section>
  );
}

export interface ActualsPublicationPanelProps {
  fundId: number;
}

export function ActualsPublicationPanel({ fundId }: ActualsPublicationPanelProps) {
  const initialRecovery = readStoredCommand(fundId);
  const panelRef = useRef<HTMLElement>(null);
  const previewSummaryRef = useRef<HTMLDivElement>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const preparingPublishRef = useRef(false);
  const latestQuery = useFinancialFactsLatestReference(fundId);
  const ledgerPreviewMutation = useActualsPreview(fundId);
  const valuationPreviewMutation = useActualsPreview(fundId);
  const publishMutation = useActualsPublish(fundId);
  const [asOfDate, setAsOfDate] = useState('');
  const [ledgerFile, setLedgerFile] = useState<File | null>(null);
  const [valuationFile, setValuationFile] = useState<File | null>(null);
  const [ledgerPreviewPage, setLedgerPreviewPage] = useState(0);
  const [valuationPreviewPage, setValuationPreviewPage] = useState(0);
  const [coverageKind, setCoverageKind] = useState<
    'inception_to_date' | 'incremental_since_prior_head'
  >('inception_to_date');
  const [evidenceNote, setEvidenceNote] = useState('');
  const [preview, setPreview] = useState<FreshPreviewState | null>(null);
  const [storedCommand, setStoredCommand] = useState<StoredCommand | null>(initialRecovery.command);
  const [storedStorageKey, setStoredStorageKey] = useState<string | null>(
    initialRecovery.storageKey
  );
  const [corruptStorageKeys, setCorruptStorageKeys] = useState<string[]>(
    initialRecovery.corruptKeys
  );
  const [frozenBody, setFrozenBody] = useState<ActualsPublishRequestV1 | null>(null);
  const [frozenSerializedBody, setFrozenSerializedBody] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const [isPreparingPublish, setIsPreparingPublish] = useState(false);
  const receipt = publishMutation.data;
  const metricsQuery = useActualsMetrics(
    fundId,
    receipt?.facts.snapshotId ?? null,
    receipt !== undefined
  );

  useEffect(() => {
    const recovered = readStoredCommand(fundId);
    setStoredCommand(recovered.command);
    setStoredStorageKey(recovered.storageKey);
    setCorruptStorageKeys(recovered.corruptKeys);
    setFrozenBody(null);
    setFrozenSerializedBody(null);
    setPreview(null);
    setLedgerFile(null);
    setValuationFile(null);
    if (recovered.command) {
      setAsOfDate(recovered.command.asOfDate);
      setCoverageKind(recovered.command.coverage.ledger);
      setEvidenceNote(recovered.command.coverage.evidenceNote);
    }
  }, [fundId]);

  const publishNavigationFrozen =
    isPreparingPublish || publishMutation.isPending || storedCommand?.status === 'uncertain';

  useEffect(() => {
    if (!publishNavigationFrozen) return;
    const frozenUrl = window.location.href;
    const guardState = { actualsPublishNavigationGuard: true };
    window.history.pushState(guardState, '', frozenUrl);
    const blockUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const blockOutsideAction = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const action = target?.closest('a,button,[role="button"]');
      if (action && !panelRef.current?.contains(action)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const blockHistoryNavigation = (event: PopStateEvent) => {
      event.stopImmediatePropagation();
      window.history.pushState(guardState, '', frozenUrl);
    };
    window.addEventListener('beforeunload', blockUnload);
    document.addEventListener('click', blockOutsideAction, true);
    window.addEventListener('popstate', blockHistoryNavigation, true);
    return () => {
      window.removeEventListener('beforeunload', blockUnload);
      document.removeEventListener('click', blockOutsideAction, true);
      window.removeEventListener('popstate', blockHistoryNavigation, true);
    };
  }, [publishNavigationFrozen]);

  useEffect(() => {
    if (retryAfterSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setRetryAfterSeconds((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryAfterSeconds]);

  useEffect(() => {
    if (preview !== null) previewSummaryRef.current?.focus();
  }, [preview]);

  useEffect(() => {
    if (receipt !== undefined) receiptRef.current?.focus();
  }, [receipt]);

  const issues = useMemo(() => issueRows(preview), [preview]);
  const previewCanPublish =
    preview !== null && preview.ledger.canPublish && (preview.valuation?.canPublish ?? true);
  const commandFrozen =
    isPreparingPublish ||
    publishMutation.isPending ||
    storedCommand !== null ||
    corruptStorageKeys.length > 0;
  const retryReady =
    storedCommand !== null &&
    frozenBody !== null &&
    frozenSerializedBody !== null &&
    retryAfterSeconds === 0;

  const reconstructStoredBody = useCallback(async () => {
    if (storedCommand === null || ledgerFile === null) return;
    setLocalError(null);
    const preparedLedger = await prepareFile(ledgerFile, LEDGER_MAX_BYTES);
    if (preparedLedger.payloadSha256 !== storedCommand.ledger.payloadSha256) {
      setLocalError(
        'Ledger file hash does not match frozen command. Reselect exact file or discard command.'
      );
      return;
    }
    let preparedValuation: PreparedFile | null = null;
    if (storedCommand.valuation !== null) {
      if (valuationFile === null) {
        setLocalError('Frozen command requires exact valuation file reselection.');
        return;
      }
      preparedValuation = await prepareFile(valuationFile, VALUATION_MAX_BYTES);
      if (preparedValuation.payloadSha256 !== storedCommand.valuation.payloadSha256) {
        setLocalError('Valuation file hash does not match frozen command.');
        return;
      }
    } else if (valuationFile !== null) {
      setLocalError('Frozen command did not include a valuation file.');
      return;
    }

    const body: ActualsPublishRequestV1 = {
      contractVersion: 'actuals-pilot-publish/1.0.0',
      asOfDate: storedCommand.asOfDate,
      ledger: publishFile(ACTUALS_LEDGER_TEMPLATE_VERSION, preparedLedger, storedCommand.ledger),
      valuation:
        preparedValuation && storedCommand.valuation
          ? publishFile(
              ACTUALS_VALUATION_TEMPLATE_VERSION,
              preparedValuation,
              storedCommand.valuation
            )
          : null,
      coverage: storedCommand.coverage,
    };
    const serialized = JSON.stringify(body);
    const identity = await sha256Hash({
      fundId,
      asOfDate: body.asOfDate,
      templateVersions: [body.ledger.templateVersion, body.valuation?.templateVersion ?? null],
      ledgerPayloadSha256: body.ledger.expectedPayloadSha256,
      valuationPayloadSha256: body.valuation?.expectedPayloadSha256 ?? null,
      canonicalRowsHashes: [
        body.ledger.expectedCanonicalRowsHash,
        body.valuation?.expectedCanonicalRowsHash ?? null,
      ],
      previewHashes: [body.ledger.expectedPreviewHash, body.valuation?.expectedPreviewHash ?? null],
      expectedFactsHead: storedCommand.ifMatch,
      coverage: body.coverage,
    });
    if (identity !== storedCommand.requestIdentityHash) {
      setLocalError('Reselected files do not reconstruct frozen command identity.');
      return;
    }
    setFrozenBody(body);
    setFrozenSerializedBody(serialized);
  }, [fundId, ledgerFile, storedCommand, valuationFile]);

  useEffect(() => {
    if (storedCommand && ledgerFile) {
      void reconstructStoredBody();
    }
  }, [ledgerFile, reconstructStoredBody, storedCommand, valuationFile]);

  const handlePreview = useCallback(async () => {
    if (!ledgerFile || !asOfDate) return;
    setLocalError(null);
    publishMutation.reset();
    try {
      const preparedLedger = await prepareFile(ledgerFile, LEDGER_MAX_BYTES);
      const ledger = await ledgerPreviewMutation.mutateAsync({
        contractVersion: 'actuals-preview-request/1.0.0',
        templateVersion: ACTUALS_LEDGER_TEMPLATE_VERSION,
        asOfDate,
        fileName: ledgerFile.name,
        payload: preparedLedger.payload,
      });
      if (ledger.payloadSha256 !== preparedLedger.payloadSha256) {
        throw new Error('Ledger preview hash does not match selected file bytes.');
      }

      let valuation: ActualsPreviewResponseV1 | null = null;
      let preparedValuation: PreparedFile | null = null;
      if (valuationFile) {
        preparedValuation = await prepareFile(valuationFile, VALUATION_MAX_BYTES);
        valuation = await valuationPreviewMutation.mutateAsync({
          contractVersion: 'actuals-preview-request/1.0.0',
          templateVersion: ACTUALS_VALUATION_TEMPLATE_VERSION,
          asOfDate,
          fileName: valuationFile.name,
          payload: preparedValuation.payload,
        });
        if (valuation.payloadSha256 !== preparedValuation.payloadSha256) {
          throw new Error('Valuation preview hash does not match selected file bytes.');
        }
      }
      setPreview({
        ledger,
        valuation,
        ledgerFile: preparedLedger,
        valuationFile: preparedValuation,
      });
      setLedgerPreviewPage(0);
      setValuationPreviewPage(0);
    } catch (error) {
      setPreview(null);
      setLocalError(error instanceof Error ? error.message : 'Preview failed.');
    }
  }, [
    asOfDate,
    ledgerFile,
    ledgerPreviewMutation,
    publishMutation,
    valuationFile,
    valuationPreviewMutation,
  ]);

  const sendFrozenCommand = useCallback(
    async (command: StoredCommand, body: ActualsPublishRequestV1, serializedBody: string) => {
      setLocalError(null);
      const commandStorageKey = storageKey(command);
      const attemptingCommand: StoredCommand = { ...command, status: 'uncertain' };
      const attemptingStorageKey = writeStoredCommand(attemptingCommand, commandStorageKey);
      setStoredCommand(attemptingCommand);
      setStoredStorageKey(attemptingStorageKey);
      try {
        await publishMutation.mutateAsync({
          body,
          serializedBody,
          idempotencyKey: command.idempotencyKey,
          ifMatch: command.ifMatch,
        });
        sessionStorage.removeItem(commandStorageKey);
        setStoredCommand(null);
        setStoredStorageKey(null);
        setFrozenBody(null);
        setFrozenSerializedBody(null);
        await latestQuery.refetch();
      } catch (rawError) {
        const error = rawError as ActualsPublishHookError;
        const knownNoCommit5xx =
          error.code === 'TRANSACTION_UNSUPPORTED' || error.code === 'PUBLISH_RETRY_EXHAUSTED';
        const unrecognizedTransport5xx =
          (error.status ?? 0) >= 500 && (error.status ?? 0) < 600 && !knownNoCommit5xx;
        const status: CommandStatus =
          error.code === 'MUTATION_OUTCOME_UNKNOWN' ||
          (error.code === 'CONTRACT_PARSE_ERROR' &&
            (error.status ?? 0) >= 200 &&
            (error.status ?? 0) < 300) ||
          unrecognizedTransport5xx ||
          error instanceof TypeError
            ? 'uncertain'
            : error.status === 412
              ? 'precondition_failed'
              : error.status === 429
                ? 'rate_limited'
                : 'refused';
        const next = { ...command, status };
        const nextStorageKey = writeStoredCommand(next, commandStorageKey);
        setStoredCommand(next);
        setStoredStorageKey(nextStorageKey);
        setRetryAfterSeconds(error.retryAfterSeconds ?? 0);
      }
    },
    [latestQuery, publishMutation]
  );

  const finishPreparingPublish = useCallback(() => {
    preparingPublishRef.current = false;
    setIsPreparingPublish(false);
  }, []);

  const handlePublish = useCallback(async () => {
    if (
      preparingPublishRef.current ||
      !preview ||
      !previewCanPublish ||
      !latestQuery.data ||
      evidenceNote.trim() === ''
    ) {
      return;
    }
    preparingPublishRef.current = true;
    setIsPreparingPublish(true);
    try {
      const coverage: ActualsPublishRequestV1['coverage'] = {
        ledger: coverageKind,
        priorFactsSnapshotId:
          coverageKind === 'incremental_since_prior_head'
            ? (latestQuery.data.reference.head?.snapshotId ?? null)
            : null,
        evidenceNote: evidenceNote.trim(),
      };
      if (
        coverageKind === 'incremental_since_prior_head' &&
        coverage.priorFactsSnapshotId === null
      ) {
        setLocalError('Incremental coverage requires an existing financial-facts head.');
        return;
      }
      const ledger = previewMetadata(preview.ledger);
      const valuation = preview.valuation ? previewMetadata(preview.valuation) : null;
      const body: ActualsPublishRequestV1 = {
        contractVersion: 'actuals-pilot-publish/1.0.0',
        asOfDate,
        ledger: publishFile(ACTUALS_LEDGER_TEMPLATE_VERSION, preview.ledgerFile, ledger),
        valuation:
          preview.valuationFile && valuation
            ? publishFile(ACTUALS_VALUATION_TEMPLATE_VERSION, preview.valuationFile, valuation)
            : null,
        coverage,
      };
      const requestIdentityHash = await sha256Hash({
        fundId,
        asOfDate,
        templateVersions: [body.ledger.templateVersion, body.valuation?.templateVersion ?? null],
        ledgerPayloadSha256: ledger.payloadSha256,
        valuationPayloadSha256: valuation?.payloadSha256 ?? null,
        canonicalRowsHashes: [ledger.canonicalRowsHash, valuation?.canonicalRowsHash ?? null],
        previewHashes: [ledger.previewHash, valuation?.previewHash ?? null],
        expectedFactsHead: latestQuery.data.ifMatch,
        coverage,
      });
      const command: StoredCommand = {
        version: 1,
        fundId,
        asOfDate,
        ledger,
        valuation,
        coverage,
        idempotencyKey: newIdempotencyKey(),
        ifMatch: latestQuery.data.ifMatch,
        requestIdentityHash,
        status: 'ready',
      };
      const serialized = JSON.stringify(body);
      const nextStorageKey = writeStoredCommand(command, storedStorageKey);
      setStoredCommand(command);
      setStoredStorageKey(nextStorageKey);
      setFrozenBody(body);
      setFrozenSerializedBody(serialized);
      await sendFrozenCommand(command, body, serialized);
    } finally {
      finishPreparingPublish();
    }
  }, [
    asOfDate,
    coverageKind,
    evidenceNote,
    finishPreparingPublish,
    fundId,
    latestQuery.data,
    preview,
    previewCanPublish,
    sendFrozenCommand,
    storedStorageKey,
  ]);

  const handleRetry = useCallback(async () => {
    if (storedCommand && frozenBody && frozenSerializedBody && retryAfterSeconds === 0) {
      await sendFrozenCommand(storedCommand, frozenBody, frozenSerializedBody);
    }
  }, [frozenBody, frozenSerializedBody, retryAfterSeconds, sendFrozenCommand, storedCommand]);

  const handleDiscard = useCallback(() => {
    if (isPreparingPublish || publishMutation.isPending) return;
    if (storedStorageKey !== null) sessionStorage.removeItem(storedStorageKey);
    publishMutation.reset();
    setStoredCommand(null);
    setStoredStorageKey(null);
    setFrozenBody(null);
    setFrozenSerializedBody(null);
    setPreview(null);
    setLocalError(null);
  }, [isPreparingPublish, publishMutation, storedStorageKey]);

  const handleReconfirm = useCallback(async () => {
    if (!storedCommand || !frozenBody) return;
    const refreshed = await latestQuery.refetch();
    if (!refreshed.data) return;
    const coverage =
      frozenBody.coverage.ledger === 'incremental_since_prior_head'
        ? {
            ...frozenBody.coverage,
            priorFactsSnapshotId: refreshed.data.reference.head?.snapshotId ?? null,
          }
        : frozenBody.coverage;
    if (
      coverage.ledger === 'incremental_since_prior_head' &&
      coverage.priorFactsSnapshotId === null
    ) {
      setLocalError('Incremental coverage cannot be reconfirmed without a current head.');
      return;
    }
    const body = { ...frozenBody, coverage };
    const serialized = JSON.stringify(body);
    const next: StoredCommand = {
      ...storedCommand,
      coverage,
      idempotencyKey: newIdempotencyKey(),
      ifMatch: refreshed.data.ifMatch,
      status: 'ready',
      requestIdentityHash: await sha256Hash({
        fundId,
        asOfDate: body.asOfDate,
        templateVersions: [body.ledger.templateVersion, body.valuation?.templateVersion ?? null],
        ledgerPayloadSha256: body.ledger.expectedPayloadSha256,
        valuationPayloadSha256: body.valuation?.expectedPayloadSha256 ?? null,
        canonicalRowsHashes: [
          body.ledger.expectedCanonicalRowsHash,
          body.valuation?.expectedCanonicalRowsHash ?? null,
        ],
        previewHashes: [
          body.ledger.expectedPreviewHash,
          body.valuation?.expectedPreviewHash ?? null,
        ],
        expectedFactsHead: refreshed.data.ifMatch,
        coverage,
      }),
    };
    const nextStorageKey = writeStoredCommand(next, storedStorageKey);
    setStoredCommand(next);
    setStoredStorageKey(nextStorageKey);
    setFrozenBody(body);
    setFrozenSerializedBody(serialized);
    publishMutation.reset();
  }, [frozenBody, fundId, latestQuery, publishMutation, storedCommand, storedStorageKey]);

  if (
    latestQuery.error?.status === 404 &&
    storedCommand === null &&
    corruptStorageKeys.length === 0
  ) {
    return null;
  }

  return (
    <section
      ref={panelRef}
      className="space-y-5 border-t border-beige-200 pt-6"
      aria-label="Publish fixed-template actuals"
      aria-busy={
        isPreparingPublish ||
        publishMutation.isPending ||
        latestQuery.isLoading ||
        latestQuery.isFetching
      }
    >
      <div>
        <h2 className="font-inter text-xl font-semibold text-charcoal">
          Publish fixed-template actuals
        </h2>
        <p className="mt-1 text-sm text-charcoal/70">
          Preview raw files, confirm coverage, then publish one immutable financial-facts snapshot.
        </p>
      </div>

      {latestQuery.error && latestQuery.error.status !== 404 ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>{latestQuery.error.code ?? 'LATEST_REFERENCE_FAILED'}</AlertTitle>
          <AlertDescription>{latestQuery.error.message}</AlertDescription>
        </Alert>
      ) : null}
      {localError ? (
        <Alert variant="destructive" role="alert" data-testid="actuals-local-error">
          <AlertTitle>ACTUALS_COMMAND_BLOCKED</AlertTitle>
          <AlertDescription>{localError}</AlertDescription>
        </Alert>
      ) : null}
      {ledgerPreviewMutation.error || valuationPreviewMutation.error ? (
        <Alert variant="destructive" role="alert" data-testid="actuals-preview-error">
          <AlertTitle>
            {(ledgerPreviewMutation.error ?? valuationPreviewMutation.error)?.code ??
              'PREVIEW_FAILED'}
          </AlertTitle>
          <AlertDescription>
            {(ledgerPreviewMutation.error ?? valuationPreviewMutation.error)?.message ??
              'Actuals preview failed.'}
          </AlertDescription>
        </Alert>
      ) : null}
      {publishMutation.error ? (
        <Alert variant="destructive" role="alert" data-testid="actuals-publish-error">
          <AlertTitle>{publishMutation.error.code ?? 'PUBLISH_FAILED'}</AlertTitle>
          <AlertDescription>{publishMutation.error.message}</AlertDescription>
        </Alert>
      ) : null}

      {storedCommand?.status === 'uncertain' ? (
        <Alert role="alert" data-testid="actuals-unknown-outcome">
          <AlertTitle>Publish may have completed</AlertTitle>
          <AlertDescription>
            Retry sends the identical request. All other actions remain frozen.
          </AlertDescription>
        </Alert>
      ) : null}
      {storedCommand?.status === 'precondition_failed' ? (
        <Alert role="alert" data-testid="actuals-precondition-failed">
          <AlertTitle>Facts changed since you previewed</AlertTitle>
          <AlertDescription>
            Reconfirm current head before another publish attempt.
          </AlertDescription>
        </Alert>
      ) : null}
      {storedCommand && receipt === undefined ? (
        <Alert data-testid="actuals-recovery-notice">
          <AlertTitle>Frozen publish command</AlertTitle>
          <AlertDescription>
            Reselect same file(s) to retry identical request. Session storage contains hashes and
            command metadata only.
          </AlertDescription>
        </Alert>
      ) : null}
      {corruptStorageKeys.length > 0 ? (
        <Alert variant="destructive" role="alert" data-testid="actuals-corrupt-command">
          <AlertTitle>FROZEN_COMMAND_METADATA_INVALID</AlertTitle>
          <AlertDescription>
            Stored command metadata cannot be trusted. Discard it explicitly before starting a new
            preview.
          </AlertDescription>
        </Alert>
      ) : null}

      <div
        className="grid gap-4 md:grid-cols-3"
        aria-busy={
          ledgerPreviewMutation.isPending ||
          valuationPreviewMutation.isPending ||
          latestQuery.isLoading ||
          latestQuery.isFetching
        }
      >
        <div className="space-y-2">
          <Label htmlFor="actuals-as-of">Reporting cutoff</Label>
          <Input
            id="actuals-as-of"
            type="date"
            className="min-h-11"
            value={asOfDate}
            disabled={commandFrozen}
            onChange={(event) => {
              setAsOfDate(event.target.value);
              setPreview(null);
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="actuals-ledger-file">Ledger CSV</Label>
          <Input
            id="actuals-ledger-file"
            type="file"
            accept=".csv,text/csv"
            className="min-h-11"
            disabled={
              isPreparingPublish ||
              publishMutation.isPending ||
              (storedCommand !== null && frozenBody !== null)
            }
            onChange={(event) => {
              setLedgerFile(event.target.files?.[0] ?? null);
              if (!commandFrozen) setPreview(null);
            }}
          />
          {!commandFrozen ? (
            <a
              className="inline-flex min-h-11 items-center text-sm font-medium text-charcoal underline"
              href="/templates/actuals-ledger-1.0.0.csv"
              download="actuals-ledger-1.0.0.csv"
            >
              Download ledger template
            </a>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="actuals-valuation-file">Valuation CSV (optional)</Label>
          <Input
            id="actuals-valuation-file"
            type="file"
            accept=".csv,text/csv"
            className="min-h-11"
            disabled={
              isPreparingPublish ||
              publishMutation.isPending ||
              (storedCommand !== null && frozenBody !== null)
            }
            onChange={(event) => {
              setValuationFile(event.target.files?.[0] ?? null);
              if (!commandFrozen) setPreview(null);
            }}
          />
          {!commandFrozen ? (
            <a
              className="inline-flex min-h-11 items-center text-sm font-medium text-charcoal underline"
              href="/templates/actuals-valuation-1.0.0.csv"
              download="actuals-valuation-1.0.0.csv"
            >
              Download valuation template
            </a>
          ) : null}
        </div>
      </div>

      {!commandFrozen ? (
        <Button
          type="button"
          className="min-h-11"
          onClick={() => void handlePreview()}
          disabled={
            !ledgerFile ||
            !asOfDate ||
            ledgerPreviewMutation.isPending ||
            valuationPreviewMutation.isPending
          }
        >
          Preview actuals
        </Button>
      ) : null}

      {preview ? (
        <div
          ref={previewSummaryRef}
          className="space-y-3"
          aria-live="polite"
          data-testid="actuals-preview-summary"
          tabIndex={-1}
        >
          <p className="text-sm text-charcoal/70">
            Ledger: {preview.ledger.rowCounts.valid} valid, {preview.ledger.rowCounts.invalid}{' '}
            invalid.{' '}
            {preview.valuation
              ? `Valuation: ${preview.valuation.rowCounts.valid} valid, ${preview.valuation.rowCounts.invalid} invalid.`
              : 'No valuation file selected.'}
          </p>
          {issues.length > 0 ? (
            <div className="max-h-72 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Location</TableHead>
                    <TableHead scope="col">Code</TableHead>
                    <TableHead scope="col">Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {issues.map(({ fileKey, fileLabel, issue }, index) => (
                    <TableRow key={`${fileKey}-${issue.rowNumber}-${issue.code}-${index}`}>
                      <TableCell className="sticky left-0 bg-background">
                        {issue.rowNumber > 0 ? (
                          <button
                            type="button"
                            className="min-h-11 text-left font-medium text-charcoal underline"
                            onClick={() => {
                              const page = Math.floor((issue.rowNumber - 1) / PREVIEW_PAGE_SIZE);
                              if (fileKey === 'ledger') setLedgerPreviewPage(page);
                              else setValuationPreviewPage(page);
                              window.setTimeout(() => {
                                document
                                  .getElementById(previewRowId(fileKey, issue.rowNumber))
                                  ?.focus();
                              }, 0);
                            }}
                          >
                            {fileLabel} row {issue.rowNumber}
                            {issue.column ? ` · ${issue.column}` : ''}
                          </button>
                        ) : (
                          <span>
                            {fileLabel} file{issue.column ? ` · ${issue.column}` : ''}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{issue.code}</TableCell>
                      <TableCell>{issue.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
          <section className="space-y-3" aria-label="Ledger preview totals and rows">
            <h3 className="font-inter text-base font-semibold text-charcoal">Ledger preview</h3>
            <PreviewTotals fileLabel="Ledger" preview={preview.ledger} />
            <PreviewRows
              fileKey="ledger"
              fileLabel="Ledger"
              preview={preview.ledger}
              page={ledgerPreviewPage}
              onPageChange={setLedgerPreviewPage}
            />
          </section>
          {preview.valuation ? (
            <section className="space-y-3" aria-label="Valuation preview totals and rows">
              <h3 className="font-inter text-base font-semibold text-charcoal">
                Valuation preview
              </h3>
              <PreviewTotals fileLabel="Valuation" preview={preview.valuation} />
              <PreviewRows
                fileKey="valuation"
                fileLabel="Valuation"
                preview={preview.valuation}
                page={valuationPreviewPage}
                onPageChange={setValuationPreviewPage}
              />
            </section>
          ) : null}
        </div>
      ) : null}

      {previewCanPublish && !commandFrozen ? (
        <div className="space-y-4">
          <div
            className="break-all whitespace-normal text-sm text-charcoal/70"
            data-testid="actuals-predecessor-evidence"
            aria-busy={latestQuery.isLoading || latestQuery.isFetching}
          >
            {latestQuery.data?.reference.head ? (
              <p>
                Predecessor snapshot {latestQuery.data.reference.head.snapshotId} · as of{' '}
                {latestQuery.data.reference.head.asOfDate} · hash{' '}
                {latestQuery.data.reference.head.snapshotInputHash}
              </p>
            ) : (
              <p>Predecessor: no financial-facts head.</p>
            )}
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-charcoal">Ledger coverage</legend>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name="actuals-coverage"
                checked={coverageKind === 'inception_to_date'}
                onChange={() => setCoverageKind('inception_to_date')}
              />{' '}
              Inception to date
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name="actuals-coverage"
                checked={coverageKind === 'incremental_since_prior_head'}
                disabled={!latestQuery.data?.reference.head}
                onChange={() => setCoverageKind('incremental_since_prior_head')}
              />{' '}
              Incremental since current head
            </label>
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="actuals-evidence-note">Coverage evidence note</Label>
            <Textarea
              id="actuals-evidence-note"
              value={evidenceNote}
              maxLength={500}
              onChange={(event) => setEvidenceNote(event.target.value)}
            />
          </div>
          <Button
            type="button"
            className="min-h-11"
            onClick={() => void handlePublish()}
            disabled={isPreparingPublish || publishMutation.isPending || evidenceNote.trim() === ''}
          >
            Publish actuals
          </Button>
        </div>
      ) : null}

      {storedCommand && receipt === undefined ? (
        <div
          className="flex flex-wrap gap-3"
          aria-busy={publishMutation.isPending || latestQuery.isFetching}
          data-testid="actuals-command-actions"
        >
          {storedCommand.status !== 'precondition_failed' ? (
            <Button
              type="button"
              className="min-h-11"
              onClick={() => void handleRetry()}
              disabled={!retryReady || publishMutation.isPending}
            >
              {retryAfterSeconds > 0 ? `Retry publish (${retryAfterSeconds}s)` : 'Retry publish'}
            </Button>
          ) : null}
          {storedCommand.status === 'precondition_failed' ? (
            <Button
              type="button"
              className="min-h-11"
              onClick={() => void handleReconfirm()}
              disabled={!frozenBody || latestQuery.isFetching}
            >
              Reconfirm
            </Button>
          ) : null}
          {storedCommand.status !== 'uncertain' &&
          !isPreparingPublish &&
          !publishMutation.isPending ? (
            <Button type="button" variant="outline" className="min-h-11" onClick={handleDiscard}>
              Discard command
            </Button>
          ) : null}
        </div>
      ) : null}
      {corruptStorageKeys.length > 0 ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => {
            for (const key of corruptStorageKeys) sessionStorage.removeItem(key);
            setCorruptStorageKeys([]);
          }}
        >
          Discard command
        </Button>
      ) : null}

      {receipt ? (
        <div
          ref={receiptRef}
          className="space-y-4"
          data-testid="actuals-publish-receipt"
          tabIndex={-1}
        >
          <Alert>
            <AlertTitle>Actuals published</AlertTitle>
            <AlertDescription
              className="break-all whitespace-normal"
              data-testid="actuals-publish-receipt-identity"
            >
              Snapshot {receipt.facts.snapshotId}; input hash {receipt.facts.snapshotInputHash}.
            </AlertDescription>
          </Alert>
          <div
            data-testid="actuals-metrics-readback"
            aria-busy={metricsQuery.isLoading || metricsQuery.isFetching}
          >
            <ActualMetricsReadback
              receipt={receipt}
              isLoading={metricsQuery.isLoading}
              {...(latestQuery.data ? { latestReference: latestQuery.data.reference } : {})}
              {...(metricsQuery.data ? { metrics: metricsQuery.data } : {})}
              {...(metricsQuery.error?.code ? { errorCode: metricsQuery.error.code } : {})}
              {...(metricsQuery.error?.message ? { errorMessage: metricsQuery.error.message } : {})}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default ActualsPublicationPanel;
