/**
 * LP Reporting -- ValuationMarkForm tests.
 *
 * Asserts:
 *   - zodResolver rejects malformed `fairValue` strings.
 *   - zodResolver accepts decimal strings up to 6 fractional digits.
 *   - confidenceLevel defaults to `low` (design 8.6 import policy).
 *   - Submitting fires `useValuationMarkImportDryRun.mutateAsync` with
 *     a `{ sourceType: 'csv', payload: <base64> }` envelope whose
 *     decoded CSV contains the typed-in fields.
 *   - On success the parent's `onPreview` callback receives the
 *     response `preview` rows.
 *   - On 401 the parent's `onError` callback receives the typed
 *     error envelope.
 *   - submit is disabled when fundId is null.
 */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import {
  ValuationMarkForm,
  ValuationMarkFormSchema,
  buildValuationMarkCsv,
} from '@/components/lp-reporting/ValuationMarkForm';
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
  return { Wrapper, queryClient };
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
      calledCapitalImported: '0.000000',
      distributionsImported: '0.000000',
      latestNavImported: '1000000.000000',
      explanations: [],
    },
    preview: [
      {
        rowIndex: 1,
        markSource: 'gp_estimate',
        companyId: 42,
        fairValue: '1000000.000000',
        asOfDate: '2026-03-31',
        confidenceLevel: 'low',
        duplicate: false,
        excluded: false,
      },
    ],
    previewHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  };
}

function decodePayloadCsv(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function fillMinimumFields() {
  fireEvent.change(screen.getByLabelText(/^mark date/i), {
    target: { value: '2026-03-31' },
  });
  fireEvent.change(screen.getByLabelText(/^as-of date/i), {
    target: { value: '2026-03-31' },
  });
  fireEvent.change(screen.getByLabelText(/^company id/i), {
    target: { value: '42' },
  });
  fireEvent.change(screen.getByLabelText(/^nav/i), {
    target: { value: '1000000.000000' },
  });
}

describe('ValuationMarkFormSchema', () => {
  it('rejects malformed fairValue strings', () => {
    for (const bad of ['1.2.3', 'abc', '', '1,000', '1.0000001']) {
      const parsed = ValuationMarkFormSchema.safeParse({
        markDate: '2026-03-31',
        asOfDate: '2026-03-31',
        companyId: '42',
        fairValue: bad,
        currency: 'USD',
        markSource: 'gp_estimate',
        confidenceLevel: 'low',
        valuationMethod: 'unspecified',
      });
      expect(parsed.success).toBe(false);
    }
  });

  it('accepts well-formed decimal strings up to 6 fractional digits', () => {
    for (const good of ['1000000', '1000000.000000', '-50.5', '0', '0.123456']) {
      const parsed = ValuationMarkFormSchema.safeParse({
        markDate: '2026-03-31',
        asOfDate: '2026-03-31',
        companyId: '42',
        fairValue: good,
        currency: 'USD',
        markSource: 'gp_estimate',
        confidenceLevel: 'low',
        valuationMethod: 'unspecified',
      });
      expect(parsed.success).toBe(true);
    }
  });

  it('rejects malformed mark dates', () => {
    const parsed = ValuationMarkFormSchema.safeParse({
      markDate: '03/31/2026',
      asOfDate: '2026-03-31',
      companyId: '42',
      fairValue: '1000000',
      currency: 'USD',
      markSource: 'gp_estimate',
      confidenceLevel: 'low',
      valuationMethod: 'unspecified',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects non-positive-integer companyId strings', () => {
    for (const bad of ['0', '-1', '4.5', 'abc', '']) {
      const parsed = ValuationMarkFormSchema.safeParse({
        markDate: '2026-03-31',
        asOfDate: '2026-03-31',
        companyId: bad,
        fairValue: '1000000',
        currency: 'USD',
        markSource: 'gp_estimate',
        confidenceLevel: 'low',
        valuationMethod: 'unspecified',
      });
      expect(parsed.success).toBe(false);
    }
  });
});

describe('buildValuationMarkCsv', () => {
  it('produces a snake_case header and one CSV row in the documented order', () => {
    const csv = buildValuationMarkCsv({
      markDate: '2026-03-31',
      asOfDate: '2026-03-31',
      companyId: '42',
      fairValue: '1000000.000000',
      currency: 'USD',
      markSource: 'gp_estimate',
      confidenceLevel: 'low',
      valuationMethod: 'recent_round',
    });

    const [header, row] = csv.trim().split('\n');
    expect(header).toBe(
      'company_id,mark_date,as_of_date,fair_value,currency,mark_source,valuation_method,confidence_level'
    );
    expect(row).toBe('42,2026-03-31,2026-03-31,1000000.000000,USD,gp_estimate,recent_round,low');
  });

  it('escapes commas and quotes in the valuation method', () => {
    const csv = buildValuationMarkCsv({
      markDate: '2026-03-31',
      asOfDate: '2026-03-31',
      companyId: '42',
      fairValue: '1000000.000000',
      currency: 'USD',
      markSource: 'gp_estimate',
      confidenceLevel: 'low',
      valuationMethod: 'note, "with quotes"',
    });

    expect(csv).toContain('"note, ""with quotes"""');
  });
});

describe('ValuationMarkForm', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults the confidence field to low (import policy default)', () => {
    const { Wrapper } = makeWrapper();
    render(
      <Wrapper>
        <ValuationMarkForm fundId={7} onPreview={() => {}} />
      </Wrapper>
    );

    const select = screen.getByLabelText(/^confidence/i) as HTMLSelectElement;
    expect(select.value).toBe('low');
  });

  it('renders a per-field error when the fairValue is malformed', async () => {
    const { Wrapper } = makeWrapper();
    render(
      <Wrapper>
        <ValuationMarkForm fundId={7} onPreview={() => {}} />
      </Wrapper>
    );

    fireEvent.change(screen.getByLabelText(/^mark date/i), { target: { value: '2026-03-31' } });
    fireEvent.change(screen.getByLabelText(/^as-of date/i), { target: { value: '2026-03-31' } });
    fireEvent.change(screen.getByLabelText(/^company id/i), { target: { value: '42' } });
    fireEvent.change(screen.getByLabelText(/^nav/i), { target: { value: '1.2.3' } });
    fireEvent.click(screen.getByRole('button', { name: /preview mark/i }));

    await waitFor(() => {
      expect(screen.getByTestId('error-fairValue')).toBeInTheDocument();
    });
  });

  it('POSTs a base64 CSV envelope and surfaces preview rows on success', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeDryRunResponse()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const onPreview = vi.fn();

    const { Wrapper } = makeWrapper();
    render(
      <Wrapper>
        <ValuationMarkForm fundId={7} onPreview={onPreview} />
      </Wrapper>
    );

    fillMinimumFields();
    fireEvent.click(screen.getByRole('button', { name: /preview mark/i }));

    await waitFor(() => {
      expect(onPreview).toHaveBeenCalledTimes(1);
    });

    expect(onPreview.mock.calls[0]![0]).toHaveLength(1);
    expect(onPreview.mock.calls[0]![0][0]).toMatchObject({
      markSource: 'gp_estimate',
      fairValue: '1000000.000000',
      confidenceLevel: 'low',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/funds/7/imports/valuation-marks/dry-run');
    const body = JSON.parse(init?.body as string) as { sourceType: string; payload: string };
    expect(body.sourceType).toBe('csv');
    const decoded = decodePayloadCsv(body.payload);
    expect(decoded).toContain(
      'company_id,mark_date,as_of_date,fair_value,currency,mark_source,valuation_method,confidence_level'
    );
    expect(decoded).toContain('42,2026-03-31,2026-03-31,1000000.000000,USD,gp_estimate');
    // Default confidence baked in.
    expect(decoded.trim().endsWith('low')).toBe(true);
  });

  it('routes mutation errors to onError with status + code (401)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'UNAUTHORIZED', message: 'Not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const onError = vi.fn();
    const onPreview = vi.fn();

    const { Wrapper } = makeWrapper();
    render(
      <Wrapper>
        <ValuationMarkForm fundId={7} onPreview={onPreview} onError={onError} />
      </Wrapper>
    );

    fillMinimumFields();
    fireEvent.click(screen.getByRole('button', { name: /preview mark/i }));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1);
    });

    const err = onError.mock.calls[0]![0];
    expect(err.status).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(onPreview).not.toHaveBeenCalled();
  });

  it('disables the submit button when fundId is null', () => {
    const { Wrapper } = makeWrapper();
    render(
      <Wrapper>
        <ValuationMarkForm fundId={null} onPreview={() => {}} />
      </Wrapper>
    );

    expect(screen.getByRole('button', { name: /preview mark/i })).toBeDisabled();
  });
});
