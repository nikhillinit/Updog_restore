/**
 * LP Reporting -- CsvUploader tests.
 *
 * Asserts:
 *   - Accepts `.csv` files; rejects non-csv with INVALID_FILE_TYPE.
 *   - On success: calls `onPreview` with the parsed dry-run response.
 *   - On 401: calls `onError` with `{ status: 401, code: 'UNAUTHORIZED' }`.
 *   - Disabled when `fundId === null`.
 *   - `sourceType='ledger'`     -> hits /imports/ledger/dry-run.
 *   - `sourceType='valuation-marks'` -> hits /imports/valuation-marks/dry-run.
 */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

import { CsvUploader } from '@/components/lp-reporting/CsvUploader';
import type { ImportDryRunResponse } from '@shared/contracts/lp-reporting';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { Wrapper };
}

function makeDryRunResponse(): ImportDryRunResponse {
  return {
    importId: '11111111-2222-3333-4444-555555555555',
    sourceType: 'csv',
    parsedRows: 1,
    validRows: 1,
    invalidRows: 0,
    duplicateRows: 0,
    warnings: [],
    errors: [],
    reconciliation: {
      calledCapitalImported: '1000000.000000',
      distributionsImported: '0.000000',
      latestNavImported: '0.000000',
      explanations: [],
    },
    preview: [
      {
        rowIndex: 1,
        eventType: 'lp_capital_call',
        amount: '1000000.000000',
        eventDate: '2026-03-31',
        duplicate: false,
        excluded: false,
      },
    ],
    previewHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  };
}

function makeCsvFile(name = 'sample.csv'): File {
  const content =
    'event_type,amount,currency,event_date,perspective,description\n' +
    'lp_capital_call,1000000.000000,USD,2026-03-31,fund_gross,Q1\n';
  return new File([content], name, { type: 'text/csv' });
}

function makeNonCsvFile(): File {
  return new File(['not a csv'], 'sample.txt', { type: 'text/plain' });
}

describe('CsvUploader', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('rejects a non-csv file with INVALID_FILE_TYPE without firing fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const onPreview = vi.fn();
    const onError = vi.fn();

    const { Wrapper } = makeWrapper();
    render(
      <Wrapper>
        <CsvUploader sourceType="ledger" fundId={7} onPreview={onPreview} onError={onError} />
      </Wrapper>
    );

    const input = screen.getByTestId('csv-uploader-input-ledger') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeNonCsvFile()] } });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1);
    });
    expect(onError.mock.calls[0]![0]).toMatchObject({
      code: 'INVALID_FILE_TYPE',
      status: 0,
    });
    expect(onPreview).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('routes a ledger CSV upload to /imports/ledger/dry-run and calls onPreview', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeDryRunResponse()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const onPreview = vi.fn();
    const onError = vi.fn();

    const { Wrapper } = makeWrapper();
    render(
      <Wrapper>
        <CsvUploader sourceType="ledger" fundId={7} onPreview={onPreview} onError={onError} />
      </Wrapper>
    );

    const input = screen.getByTestId('csv-uploader-input-ledger') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeCsvFile()] } });

    await waitFor(() => {
      expect(onPreview).toHaveBeenCalledTimes(1);
    });

    expect(onPreview.mock.calls[0]![0]).toMatchObject({
      importId: '11111111-2222-3333-4444-555555555555',
      sourceType: 'csv',
    });
    expect(onError).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/funds/7/imports/ledger/dry-run');
    const body = JSON.parse(init?.body as string) as { sourceType: string; payload: string };
    expect(body.sourceType).toBe('csv');
    expect(typeof body.payload).toBe('string');
    expect(body.payload.length).toBeGreaterThan(0);
  });

  it('routes a valuation-marks CSV upload to /imports/valuation-marks/dry-run', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeDryRunResponse()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const onPreview = vi.fn();
    const onError = vi.fn();

    const { Wrapper } = makeWrapper();
    render(
      <Wrapper>
        <CsvUploader
          sourceType="valuation-marks"
          fundId={9}
          onPreview={onPreview}
          onError={onError}
        />
      </Wrapper>
    );

    const input = screen.getByTestId('csv-uploader-input-valuation-marks') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeCsvFile('marks.csv')] } });

    await waitFor(() => {
      expect(onPreview).toHaveBeenCalledTimes(1);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/funds/9/imports/valuation-marks/dry-run');
  });

  it('surfaces a 401 to onError with status + code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'UNAUTHORIZED', message: 'Session expired' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const onPreview = vi.fn();
    const onError = vi.fn();

    const { Wrapper } = makeWrapper();
    render(
      <Wrapper>
        <CsvUploader sourceType="ledger" fundId={7} onPreview={onPreview} onError={onError} />
      </Wrapper>
    );

    const input = screen.getByTestId('csv-uploader-input-ledger') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeCsvFile()] } });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1);
    });

    const err = onError.mock.calls[0]![0];
    expect(err.status).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(onPreview).not.toHaveBeenCalled();
  });

  it('disables the picker button and input when fundId is null', () => {
    const { Wrapper } = makeWrapper();
    render(
      <Wrapper>
        <CsvUploader sourceType="ledger" fundId={null} onPreview={() => {}} onError={() => {}} />
      </Wrapper>
    );

    expect(screen.getByTestId('csv-uploader-button-ledger')).toBeDisabled();
    expect(screen.getByTestId('csv-uploader-input-ledger')).toBeDisabled();
    expect(screen.getByTestId('csv-uploader-status-ledger').textContent).toMatch(/choose a fund/i);
  });
});
