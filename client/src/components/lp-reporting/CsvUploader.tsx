/**
 * LP Reporting -- CSV uploader for ledger / valuation-mark dry-runs.
 *
 * A single component that accepts a `.csv` file, base64-encodes its
 * UTF-8 contents in a browser-safe way, and POSTs a
 * `{ sourceType: 'csv', payload }` envelope to the matching dry-run
 * endpoint via the existing `useLedgerImportDryRun` /
 * `useValuationMarkImportDryRun` hooks.
 *
 * The hook is selected at component construction time based on the
 * `sourceType` prop -- this keeps both hooks behind a single uniform
 * surface for the imports page.
 *
 * No commit affordance. Phase 1b is dry-run only.
 *
 * @module client/components/lp-reporting/CsvUploader
 */

import { useCallback, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  useLedgerImportDryRun,
  useValuationMarkImportDryRun,
  type LpReportingHookError,
} from '@/hooks/lp-reporting';
import type { ImportDryRunResponse } from '@shared/contracts/lp-reporting';

export type CsvUploaderSourceType = 'ledger' | 'valuation-marks';

export interface CsvUploaderProps {
  sourceType: CsvUploaderSourceType;
  fundId: number | null;
  onPreview: (response: ImportDryRunResponse) => void;
  onError: (error: LpReportingHookError) => void;
}

/**
 * Base64-encode a UTF-8 CSV string in a browser-safe way. Mirrors the
 * helper used by `LedgerEventForm` / `ValuationMarkForm` so the wire
 * shape stays identical to single-row submissions.
 */
function csvToBase64(csv: string): string {
  const bytes = new TextEncoder().encode(csv);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * Read a `File` as UTF-8 text. We prefer `Blob.text()` when the host
 * implements it (Chromium / Firefox) but fall back to `FileReader` for
 * jsdom and older Safari, where `Blob.text()` is sometimes missing or
 * returns a stub. Both code paths produce a UTF-8 string.
 */
function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result);
      } else {
        reject(new Error('FileReader returned non-string result'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsText(file);
  });
}

const ACCEPTED_EXTENSIONS = ['.csv'];
const ACCEPTED_MIME_TYPES = new Set(['text/csv', 'application/vnd.ms-excel', 'application/csv']);

function isCsvFile(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  const extOk = ACCEPTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  // Some browsers omit MIME for .csv; accept name-only matches.
  if (!extOk) {
    return false;
  }
  if (file.type === '' || file.type === undefined) {
    return true;
  }
  return ACCEPTED_MIME_TYPES.has(file.type);
}

type Status = 'idle' | 'uploading' | 'ready' | 'error';

export function CsvUploader({ sourceType, fundId, onPreview, onError }: CsvUploaderProps) {
  const ledgerMutation = useLedgerImportDryRun(fundId);
  const valuationMutation = useValuationMarkImportDryRun(fundId);
  const mutation = sourceType === 'ledger' ? ledgerMutation : valuationMutation;

  const [status, setStatus] = useState<Status>('idle');
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const inputId = useId();

  const disabled = fundId === null;

  const handleFile = useCallback(
    async (file: File) => {
      if (!isCsvFile(file)) {
        const error = new Error(
          'Only .csv files are accepted. Please pick a CSV export from your data source.'
        ) as LpReportingHookError;
        error.code = 'INVALID_FILE_TYPE';
        error.status = 0;
        setStatus('error');
        setFileName(file.name);
        onError(error);
        return;
      }

      setStatus('uploading');
      setFileName(file.name);

      try {
        const csv = await readFileAsText(file);
        const payload = csvToBase64(csv);
        const result = await mutation.mutateAsync({ sourceType: 'csv', payload });
        setStatus('ready');
        onPreview(result);
      } catch (err) {
        setStatus('error');
        if (err && typeof err === 'object') {
          onError(err as LpReportingHookError);
        }
      }
    },
    [mutation, onError, onPreview]
  );

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      void handleFile(file);
    },
    [handleFile]
  );

  const triggerPicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const labelText = sourceType === 'ledger' ? 'Ledger CSV file' : 'Valuation marks CSV file';

  return (
    <div className="space-y-3" data-testid={`csv-uploader-${sourceType}`}>
      <Label htmlFor={inputId}>{labelText}</Label>
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          disabled={disabled}
          onChange={handleChange}
          data-testid={`csv-uploader-input-${sourceType}`}
        />
        <Button
          type="button"
          variant="outline"
          onClick={triggerPicker}
          disabled={disabled || status === 'uploading'}
          data-testid={`csv-uploader-button-${sourceType}`}
        >
          {status === 'uploading' ? 'Uploading...' : 'Choose CSV file'}
        </Button>
        <p
          className="text-sm text-charcoal/70 font-poppins"
          data-testid={`csv-uploader-status-${sourceType}`}
          data-status={status}
        >
          {disabled
            ? 'Choose a fund to enable upload.'
            : status === 'idle'
              ? 'No file selected.'
              : status === 'uploading'
                ? `Uploading ${fileName ?? ''}...`
                : status === 'ready'
                  ? `Preview ready for ${fileName ?? 'file'}.`
                  : `Upload failed for ${fileName ?? 'file'}.`}
        </p>
      </div>
    </div>
  );
}

export default CsvUploader;
