/**
 * LP Reporting -- Valuations page (Phase 1b.3).
 *
 * Replaces the 1b.1 placeholder. Same layout as the Ledger page: a
 * single-mark dry-run form on the left and the preview table on the
 * right (stacked on small screens). Submitting posts a one-row base64
 * CSV to the existing protected route
 *   POST /api/funds/:fundId/imports/valuation-marks/dry-run
 * and we surface the response `preview` rows.
 *
 * Two valuation-only affordances per design 8.6:
 *   1. Future-dated marks (`asOfDate > pageAsOfDate`) are visually
 *      distinguished and aria-labeled. They do NOT contribute to
 *      current as-of NAV; the table just SHOWS that.
 *   2. Mark confidence renders as a Badge with tone. Imported marks
 *      default to LOW confidence -- the form's default reflects this.
 *
 * No commit affordance here; batch commits live on the Imports page.
 *
 * @module client/pages/lp-reporting/valuations
 */

import { useCallback, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ValuationMarksTable } from '@/components/lp-reporting/ValuationMarksTable';
import { ValuationMarkForm } from '@/components/lp-reporting/ValuationMarkForm';
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
        description: 'Your session expired. Please sign in again to validate valuation marks.',
      };
    case 403:
      return {
        title: 'Access denied',
        description:
          'You do not have permission to validate valuation marks for this fund. Contact your fund admin.',
      };
    case 429:
      return {
        title: 'Rate limit reached',
        description:
          'Valuation-mark dry-runs are limited to 20 per hour per user. Try again shortly.',
      };
    case 500:
      return {
        title: 'Dry-run failed',
        description:
          err.message || 'The server could not validate the mark. Check your inputs and try again.',
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
        title: 'Unable to validate mark',
        description: err.message || 'An unknown error occurred. Try again.',
      };
  }
}

/**
 * Resolve today's date as YYYY-MM-DD using locale-independent UTC
 * components. We avoid `toISOString().slice(0,10)` to make the
 * intent explicit -- TZ=UTC tests still observe the same value.
 */
function todayIsoDate(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function LpReportingValuationsPage() {
  const { fundId } = useFundContext();
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [error, setError] = useState<LpReportingHookError | null>(null);

  // Page-level as-of date drives the future-dated affordance in the
  // table. Memoized so the table identity stays stable across renders
  // that don't change the date.
  const asOfDate = useMemo(() => todayIsoDate(), []);

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
        <h1 className="text-3xl font-bold font-inter text-charcoal">Valuations</h1>
        <p className="text-charcoal/70 font-poppins mt-1">
          Per-company valuation marks with confidence levels and source attribution. No INSERT
          happens in this view; use Imports for batch commits.
        </p>
      </header>

      {fundId === null ? (
        <Alert>
          <AlertTitle>Select a fund</AlertTitle>
          <AlertDescription>
            Choose a fund from the header to preview valuation marks. The dry-run endpoint requires
            a fund-scoped URL.
          </AlertDescription>
        </Alert>
      ) : null}

      {envelope ? (
        <Alert
          variant="destructive"
          data-testid="valuations-error-envelope"
          data-error-status={error?.status ?? ''}
        >
          <AlertTitle>{envelope.title}</AlertTitle>
          <AlertDescription>{envelope.description}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Validate a single mark</CardTitle>
            <CardDescription>
              Fill in the mark details and click <span className="font-semibold">Preview mark</span>{' '}
              to run a server-side dry-run. The mark is NOT persisted. Imported marks default to{' '}
              <span className="font-semibold">low</span> confidence per import policy.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ValuationMarkForm fundId={fundId} onPreview={handlePreview} onError={handleError} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>
              Marks the server would attach to fund {fundId ?? '--'}. Future-dated marks are flagged
              and excluded from current NAV. As-of date: {asOfDate}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ValuationMarksTable rows={previewRows} asOfDate={asOfDate} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
