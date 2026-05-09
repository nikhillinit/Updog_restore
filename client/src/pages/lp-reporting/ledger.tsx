/**
 * LP Reporting -- Ledger page (Phase 1b.2).
 *
 * Replaces the 1b.1 placeholder with a real cash-flow events surface:
 * a single-event dry-run form on the left + the preview table on the
 * right (stacked on small screens). On submit the form posts a one-row
 * base64 CSV to the existing protected route
 *   POST /api/funds/:fundId/imports/ledger/dry-run
 * and we surface the response `preview` rows in the table.
 *
 * No commit affordance here; batch commits live on the Imports page.
 *
 * Fund context resolves via `useFundContext().fundId` -- the same
 * pattern the rest of the app uses for fund-scoped routes. When no
 * fund is selected the form is disabled and a non-blocking notice
 * explains why.
 *
 * @module client/pages/lp-reporting/ledger
 */

import { useCallback, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { LedgerTable } from '@/components/lp-reporting/LedgerTable';
import { LedgerEventForm } from '@/components/lp-reporting/LedgerEventForm';
import { useFundContext } from '@/contexts/FundContext';
import type { ImportPreviewRow } from '@shared/contracts/lp-reporting';
import type { LpReportingHookError } from '@/hooks/lp-reporting';

interface ErrorEnvelope {
  title: string;
  description: string;
}

function envelopeFor(err: LpReportingHookError): ErrorEnvelope {
  switch (err.status) {
    case 401:
      return {
        title: 'Sign-in required',
        description: 'Your session expired. Please sign in again to validate ledger events.',
      };
    case 403:
      return {
        title: 'Access denied',
        description:
          'You do not have permission to validate ledger events for this fund. Contact your fund admin.',
      };
    case 429:
      return {
        title: 'Rate limit reached',
        description: 'Ledger dry-runs are limited to 20 per hour per user. Try again shortly.',
      };
    case 500:
      return {
        title: 'Dry-run failed',
        description:
          err.message ||
          'The server could not validate the event. Check your inputs and try again.',
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
        title: 'Unable to validate event',
        description: err.message || 'An unknown error occurred. Try again.',
      };
  }
}

export default function LpReportingLedgerPage() {
  const { fundId } = useFundContext();
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [error, setError] = useState<LpReportingHookError | null>(null);

  const handlePreview = useCallback((rows: ImportPreviewRow[]) => {
    setError(null);
    setPreviewRows(rows);
  }, []);

  const handleError = useCallback((err: LpReportingHookError) => {
    setError(err);
  }, []);

  const envelope = error ? envelopeFor(error) : null;

  return (
    <div className="p-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold font-inter text-charcoal">Ledger</h1>
        <p className="text-charcoal/70 font-poppins mt-1">
          Preview cash-flow events before commit. No INSERT happens in this view; use Imports for
          batch commits.
        </p>
      </header>

      {fundId === null ? (
        <Alert>
          <AlertTitle>Select a fund</AlertTitle>
          <AlertDescription>
            Choose a fund from the header to preview ledger events. The dry-run endpoint requires a
            fund-scoped URL.
          </AlertDescription>
        </Alert>
      ) : null}

      {envelope ? (
        <Alert
          variant="destructive"
          data-testid="ledger-error-envelope"
          data-error-status={error?.status ?? ''}
        >
          <AlertTitle>{envelope.title}</AlertTitle>
          <AlertDescription>{envelope.description}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Validate a single event</CardTitle>
            <CardDescription>
              Fill in the event details and click{' '}
              <span className="font-semibold">Preview event</span> to run a server-side dry-run. The
              event is NOT persisted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LedgerEventForm fundId={fundId} onPreview={handlePreview} onError={handleError} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>
              Rows the server would attach to fund {fundId ?? '--'}. Cleared between submissions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LedgerTable rows={previewRows} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
