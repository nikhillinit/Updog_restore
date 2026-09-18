import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ActualsDraftDetailResponseV1Schema,
  ActualsDraftHistoryResponseV1Schema,
  ActualsDraftSaveRequestV1Schema,
  ActualsDraftSaveResponseV1Schema,
  type ActualsDraftDetailResponseV1,
  type ActualsDraftSaveRequestV1,
} from '@shared/contracts/lp-reporting/actuals-draft.contract';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { contractFetch, type LpReportingHookError } from '@/hooks/lp-reporting/contract-fetch';
import { sha256Bytes } from '@/lib/hash';
import {
  DraftRecoveryMetadataError,
  clearDraftCommand,
  confirmDraftReceipt,
  decodeDraftPayload,
  freezeDraftCommand,
  recoverDraftCommand,
  reconstructDraftCommand,
  type FrozenDraftSave,
} from './actuals-draft-command';

type DraftFiles = Pick<ActualsDraftSaveRequestV1, 'ledger' | 'valuation'>;

export interface ActualsDraftHistoryProps {
  fundId: number;
  asOfDate: string;
  disabled: boolean;
  hasLedger: boolean;
  prepareFiles: () => Promise<DraftFiles>;
  onLockChange: (locked: boolean) => void;
  onPendingChange?: (pending: boolean) => void;
  onRestore: (detail: ActualsDraftDetailResponseV1) => void;
}

export function ActualsDraftHistory({
  fundId,
  asOfDate,
  disabled,
  hasLedger,
  prepareFiles,
  onLockChange,
  onPendingChange,
  onRestore,
}: ActualsDraftHistoryProps) {
  const [recovery] = useState(() => recoverDraftCommand(fundId));
  const [corruptRecovery, setCorruptRecovery] = useState(recovery.corrupt);
  const [open, setOpen] = useState(false);
  const [classification, setClassification] = useState<'provisional' | 'synthetic'>(
    recovery.command?.stored.body.classification ?? 'provisional'
  );
  const [sourceNote, setSourceNote] = useState(recovery.command?.stored.body.sourceNote ?? '');
  const [correctionReason, setCorrectionReason] = useState(
    recovery.command?.stored.body.correctionReason ?? ''
  );
  const [beforeRevision, setBeforeRevision] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [frozen, setFrozen] = useState<FrozenDraftSave | null>(recovery.command);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  const [restoredVersion, setRestoredVersion] = useState<number | null>(null);
  const inFlight = useRef(false);
  const active = useRef(true);
  const queryClient = useQueryClient();
  const url = `/api/funds/${fundId}/imports/actuals/draft-revisions`;
  const queryKey = ['lp-reporting', 'actuals-draft-revisions', fundId];
  const history = useQuery({
    queryKey: [...queryKey, beforeRevision],
    enabled: open,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const result = await contractFetch(
        beforeRevision === null ? url : `${url}?beforeRevision=${beforeRevision}`,
        { method: 'GET', cache: 'no-store' },
        ActualsDraftHistoryResponseV1Schema,
        'Draft history response is invalid.'
      );
      if (
        result.fundId !== fundId ||
        (result.head !== null &&
          result.head.etag !==
            `"actuals-draft:${fundId}:${result.head.revision}:${result.head.revisionHash}"`) ||
        result.revisions.some(
          (row) =>
            row.fundId !== fundId ||
            row.etag !== `"actuals-draft:${fundId}:${row.revision}:${row.revisionHash}"`
        )
      ) {
        throw new Error('Draft history does not match the selected fund.');
      }
      return result;
    },
  });

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  useEffect(() => {
    onLockChange(busy || (frozen !== null && frozen.body !== null));
    return () => onLockChange(false);
  }, [busy, frozen, onLockChange]);

  useEffect(() => {
    onPendingChange?.(busy || frozen !== null || corruptRecovery);
    return () => onPendingChange?.(false);
  }, [busy, frozen, corruptRecovery, onPendingChange]);

  function finishOperation() {
    inFlight.current = false;
    if (active.current) setBusy(false);
  }

  async function save() {
    if (disabled || inFlight.current || stale || corruptRecovery || (!frozen && !history.data))
      return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setSavedVersion(null);
    let command = frozen;
    try {
      if (command === null) {
        const body = ActualsDraftSaveRequestV1Schema.parse({
          contractVersion: 'actuals-draft-save/1.0.0',
          classification,
          asOfDate: asOfDate || null,
          sourceNote: sourceNote.trim(),
          correctionReason: correctionReason.trim(),
          ...(await prepareFiles()),
        });
        if (!active.current) return;
        command = await freezeDraftCommand(
          fundId,
          body,
          history.data!.head?.etag ?? `"actuals-draft:${fundId}:none"`
        );
      } else if (command.body === null) {
        command = await reconstructDraftCommand(command, await prepareFiles());
      }
      if (!active.current) return;
      setFrozen(command);
      const result = await contractFetch(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': command.stored.key,
            'If-Match': command.stored.ifMatch,
          },
          body: command.serializedBody,
        },
        ActualsDraftSaveResponseV1Schema,
        'Draft save response is invalid. Retry the same save to resolve its outcome.'
      );
      if (!active.current) return;
      if (result.idempotencyKey !== command.stored.key) {
        throw new Error('Draft save receipt belongs to a different command. Retry the same save.');
      }
      await confirmDraftReceipt(command, result.revision);
      clearDraftCommand(fundId);
      setFrozen(null);
      setSavedVersion(result.revision.revision);
      setBeforeRevision(null);
      await queryClient.invalidateQueries({ queryKey });
    } catch (caught) {
      if (caught instanceof DraftRecoveryMetadataError) setCorruptRecovery(true);
      const failure = caught as LpReportingHookError;
      setError(failure.message || 'Draft save failed.');
      // Actor-first replay means authorization failures cannot settle an earlier unknown save.
      if (failure.status === 412) {
        try {
          clearDraftCommand(fundId);
          setFrozen(null);
          setStale(true);
        } catch {
          setError('This browser cannot update draft recovery storage. Retry the same save.');
        }
      }
    } finally {
      finishOperation();
    }
  }

  async function restore(revision: number) {
    if (disabled || frozen !== null || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setSavedVersion(null);
    try {
      const detail = await contractFetch(
        `${url}/${revision}`,
        { method: 'GET', cache: 'no-store' },
        ActualsDraftDetailResponseV1Schema,
        'Saved draft response is invalid.'
      );
      if (!active.current) return;
      if (detail.revision.fundId !== fundId || detail.revision.revision !== revision) {
        throw new Error('Saved draft does not match the requested fund and version.');
      }
      for (const kind of ['ledger', 'valuation'] as const) {
        const metadata = detail.revision[kind];
        if (metadata === null) continue;
        const file = detail[kind];
        if (!file?.payloadAvailable || file.payload === null) {
          throw new Error(
            'Original file bytes are no longer retained. Re-upload the file to continue.'
          );
        }
        if ((await sha256Bytes(decodeDraftPayload(file.payload))) !== metadata.payloadSha256) {
          throw new Error('Saved file bytes do not match their recorded source hash.');
        }
      }
      if (!active.current) return;
      onRestore(detail);
      setRestoredVersion(revision);
      setClassification(detail.revision.classification);
      setSourceNote(detail.revision.sourceNote);
      setCorrectionReason(`Restore draft version ${revision}.`);
    } catch (caught) {
      setError((caught as Error).message || 'Draft restore failed.');
    } finally {
      finishOperation();
    }
  }

  async function reviewLatest() {
    if (busy || disabled || frozen !== null) return;
    const result = await history.refetch();
    if (!result.isError) {
      setStale(false);
      setError(null);
    }
  }

  const locked = disabled || busy || frozen !== null;
  return (
    <details
      className="rounded-lg border border-beige-200 p-4"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="min-h-11 cursor-pointer font-inter font-semibold text-charcoal">
        Draft versions and corrections{frozen || corruptRecovery ? ' (save pending)' : ''}
      </summary>
      {open ? (
        <section className="space-y-4" aria-label="Actuals draft history" aria-busy={busy}>
          <p className="text-sm text-charcoal-600">
            Save incomplete or provisional uploads here. Each save preserves a new version with its
            source and reason. Saving a draft does not publish actuals.
          </p>
          {corruptRecovery ? (
            <div role="alert">
              <p>
                Draft recovery metadata is invalid. Review saved history before clearing this
                browser record.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  try {
                    clearDraftCommand(fundId);
                    setFrozen(null);
                    setCorruptRecovery(false);
                    setError(null);
                    setStale(true);
                  } catch {
                    setError('This browser cannot update draft recovery storage.');
                  }
                }}
              >
                Clear invalid recovery metadata
              </Button>
            </div>
          ) : null}
          {frozen?.body === null ? (
            <p role="status">
              Reselect the original files to recover this pending draft save. Its source notes and
              predecessor are preserved.
            </p>
          ) : null}
          {history.error ? <p role="alert">{history.error.message}</p> : null}
          {error ? <p role="alert">{error}</p> : null}
          {savedVersion !== null ? <p role="status">Saved draft version {savedVersion}.</p> : null}
          {restoredVersion !== null ? (
            <p role="status">Loaded version {restoredVersion}. Preview again before publishing.</p>
          ) : null}
          {frozen && !busy ? (
            <p role="status">
              This save needs confirmation. Retry sends the same files and command.
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor={`draft-classification-${fundId}`}>Draft data qualification</Label>
            <select
              id={`draft-classification-${fundId}`}
              className="min-h-11 rounded-md border border-input bg-background px-3"
              value={classification}
              disabled={locked}
              onChange={(event) =>
                setClassification(event.target.value as 'provisional' | 'synthetic')
              }
            >
              <option value="provisional">Provisional source data</option>
              <option value="synthetic">Synthetic test data</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`draft-source-${fundId}`}>Draft source note</Label>
            <Textarea
              id={`draft-source-${fundId}`}
              value={sourceNote}
              disabled={locked}
              maxLength={500}
              onChange={(event) => setSourceNote(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`draft-reason-${fundId}`}>Reason for this version</Label>
            <Textarea
              id={`draft-reason-${fundId}`}
              value={correctionReason}
              disabled={locked}
              maxLength={500}
              onChange={(event) => setCorrectionReason(event.target.value)}
            />
          </div>
          <p className="text-sm">Latest saved version: {history.data?.head?.revision ?? 'none'}.</p>
          {stale ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={busy || disabled}
              onClick={() => void reviewLatest()}
            >
              Review latest revision
            </Button>
          ) : (
            <Button
              type="button"
              className="min-h-11"
              onClick={() => void save()}
              disabled={
                disabled ||
                busy ||
                corruptRecovery ||
                (!frozen && (!history.data || history.isFetching)) ||
                (frozen?.body === null && !hasLedger) ||
                (!frozen && (!hasLedger || !sourceNote.trim() || !correctionReason.trim()))
              }
            >
              {frozen ? 'Retry draft save' : 'Save draft revision'}
            </Button>
          )}
          {history.data?.revisions.length ? (
            <ol className="space-y-3" aria-label="Saved draft versions">
              {history.data.revisions.map((row) => (
                <li key={row.revision} className="space-y-1 rounded-md border border-beige-200 p-3">
                  <p className="font-semibold">
                    Version {row.revision} · {row.classification}
                  </p>
                  <p className="text-sm">
                    Saved {row.createdAt} by user {row.createdBy}.
                  </p>
                  <p className="break-words text-sm">Source: {row.sourceNote}</p>
                  <p className="break-words text-sm">Reason: {row.correctionReason}</p>
                  <p className="break-all text-xs">
                    Ledger: {row.ledger.fileName} · {row.ledger.payloadSha256}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    disabled={locked}
                    onClick={() => void restore(row.revision)}
                  >
                    Use version {row.revision}
                  </Button>
                </li>
              ))}
            </ol>
          ) : null}
          {history.data?.nextBeforeRevision !== null &&
          history.data?.nextBeforeRevision !== undefined ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={locked}
              onClick={() => setBeforeRevision(history.data!.nextBeforeRevision)}
            >
              Older versions
            </Button>
          ) : null}
          {beforeRevision !== null ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={locked}
              onClick={() => setBeforeRevision(null)}
            >
              Latest versions
            </Button>
          ) : null}
        </section>
      ) : null}
    </details>
  );
}
