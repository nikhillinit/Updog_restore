/**
 * LP Reporting -- Imports page (Phase 1b.5).
 *
 * Replaces the 1b.1 placeholder with a CSV upload + dry-run preview
 * surface for ledger and valuation-mark sources. Two tabs share the
 * same component graph:
 *
 *   - `<CsvUploader sourceType="ledger" />`         -> POST /imports/ledger/dry-run
 *   - `<CsvUploader sourceType="valuation-marks" />` -> POST /imports/valuation-marks/dry-run
 *
 * Each tab maintains its own preview / error state so switching tabs
 * does not lose the other source's results.
 *
 * NO commit affordance anywhere. Persistence ships in Phase 1c.
 *
 * @module client/pages/lp-reporting/imports
 */

import { useCallback, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CsvUploader } from '@/components/lp-reporting/CsvUploader';
import { ImportPreviewPanel } from '@/components/lp-reporting/ImportPreviewPanel';
import { ImportWarningsList } from '@/components/lp-reporting/ImportWarningsList';
import { useFundContext } from '@/contexts/FundContext';
import type { ImportDryRunResponse } from '@shared/contracts/lp-reporting';
import type { LpReportingHookError } from '@/hooks/lp-reporting';

interface ErrorEnvelope {
  title: string;
  description: string;
}

function envelopeFor(err: LpReportingHookError): ErrorEnvelope {
  if (err.code === 'INVALID_FILE_TYPE') {
    return {
      title: 'Unsupported file type',
      description:
        err.message ||
        'Only .csv files are accepted. Please pick a CSV export from your data source.',
    };
  }
  switch (err.status) {
    case 401:
      return {
        title: 'Sign-in required',
        description: 'Your session expired. Please sign in again to validate imports.',
      };
    case 403:
      return {
        title: 'Access denied',
        description:
          'You do not have permission to validate imports for this fund. Contact your fund admin.',
      };
    case 429:
      return {
        title: 'Rate limit reached',
        description: 'Import dry-runs are limited to 20 per hour per user. Try again shortly.',
      };
    case 500:
      return {
        title: 'Dry-run failed',
        description:
          err.message ||
          'The server could not validate the upload. Check the file contents and try again.',
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
        title: 'Unable to validate upload',
        description: err.message || 'An unknown error occurred. Try again.',
      };
  }
}

interface SourceTabState {
  preview: ImportDryRunResponse | null;
  error: LpReportingHookError | null;
}

const INITIAL_STATE: SourceTabState = { preview: null, error: null };

interface ImportTabProps {
  testIdPrefix: string;
  sourceType: 'ledger' | 'valuation-marks';
  fundId: number | null;
  state: SourceTabState;
  onPreview: (response: ImportDryRunResponse) => void;
  onError: (error: LpReportingHookError) => void;
}

function ImportTab({
  testIdPrefix,
  sourceType,
  fundId,
  state,
  onPreview,
  onError,
}: ImportTabProps) {
  const envelope = state.error ? envelopeFor(state.error) : null;

  return (
    <div className="space-y-6" data-testid={`${testIdPrefix}-tab-content`}>
      {envelope ? (
        <Alert
          variant="destructive"
          data-testid={`${testIdPrefix}-error-envelope`}
          data-error-status={state.error?.status ?? ''}
          data-error-code={state.error?.code ?? ''}
        >
          <AlertTitle>{envelope.title}</AlertTitle>
          <AlertDescription>{envelope.description}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Upload CSV</CardTitle>
          <CardDescription>
            Pick a CSV file. The server validates it and returns matched / partial / unmatched rows.
            The file is NOT persisted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CsvUploader
            sourceType={sourceType}
            fundId={fundId}
            onPreview={onPreview}
            onError={onError}
          />
        </CardContent>
      </Card>

      {state.preview ? (
        <>
          <ImportPreviewPanel response={state.preview} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Warnings</CardTitle>
              <CardDescription>
                Validation warnings and errors emitted during dry-run.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ImportWarningsList warnings={state.preview.warnings} errors={state.preview.errors} />
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

export default function LpReportingImportsPage() {
  const { fundId } = useFundContext();
  const [ledgerState, setLedgerState] = useState<SourceTabState>(INITIAL_STATE);
  const [valuationState, setValuationState] = useState<SourceTabState>(INITIAL_STATE);

  const handleLedgerPreview = useCallback((response: ImportDryRunResponse) => {
    setLedgerState({ preview: response, error: null });
  }, []);
  const handleLedgerError = useCallback((error: LpReportingHookError) => {
    setLedgerState((prev) => ({ preview: prev.preview, error }));
  }, []);
  const handleValuationPreview = useCallback((response: ImportDryRunResponse) => {
    setValuationState({ preview: response, error: null });
  }, []);
  const handleValuationError = useCallback((error: LpReportingHookError) => {
    setValuationState((prev) => ({ preview: prev.preview, error }));
  }, []);

  return (
    <div className="p-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold font-inter text-charcoal">Imports</h1>
        <p className="text-charcoal/70 font-poppins mt-1">
          Validate ledger and valuation-mark uploads via the protected dry-run endpoints. Preview
          before commit; persistence ships in Phase 1c.
        </p>
      </header>

      {fundId === null ? (
        <Alert>
          <AlertTitle>Select a fund</AlertTitle>
          <AlertDescription>
            Choose a fund from the header to enable CSV uploads. The dry-run endpoints require a
            fund-scoped URL.
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue="ledger" className="space-y-6">
        <TabsList>
          <TabsTrigger value="ledger" data-testid="imports-tab-trigger-ledger">
            Ledger import
          </TabsTrigger>
          <TabsTrigger value="valuation-marks" data-testid="imports-tab-trigger-valuation-marks">
            Valuation marks import
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ledger">
          <ImportTab
            testIdPrefix="imports-ledger"
            sourceType="ledger"
            fundId={fundId}
            state={ledgerState}
            onPreview={handleLedgerPreview}
            onError={handleLedgerError}
          />
        </TabsContent>

        <TabsContent value="valuation-marks">
          <ImportTab
            testIdPrefix="imports-valuation-marks"
            sourceType="valuation-marks"
            fundId={fundId}
            state={valuationState}
            onPreview={handleValuationPreview}
            onError={handleValuationError}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
