/**
 * LP Reporting -- LedgerEventForm tests.
 *
 * Asserts:
 *   - zodResolver rejects malformed amounts ("1.2.3", "abc", "").
 *   - zodResolver accepts decimal strings up to 6 fractional digits.
 *   - Submitting fires `useLedgerImportDryRun.mutateAsync` with a
 *     `{ sourceType: 'csv', payload: <base64> }` envelope whose decoded
 *     CSV contains the typed-in field values.
 *   - On success the parent's `onPreview` callback receives the
 *     response `preview` rows.
 *   - On error the parent's `onError` callback receives the typed
 *     error envelope.
 */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import {
  LedgerEventForm,
  LedgerEventFormSchema,
  buildLedgerCsv,
} from '@/components/lp-reporting/LedgerEventForm';
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

describe('LedgerEventFormSchema', () => {
  it('rejects malformed decimal strings', () => {
    for (const bad of ['1.2.3', 'abc', '', '1,000', '1.0000001']) {
      const parsed = LedgerEventFormSchema.safeParse({
        eventDate: '2026-03-31',
        eventType: 'lp_capital_call',
        amount: bad,
        currency: 'USD',
        perspective: 'fund_gross',
      });
      expect(parsed.success).toBe(false);
    }
  });

  it('accepts well-formed decimal strings up to 6 fractional digits', () => {
    for (const good of ['1000000', '1000000.000000', '-50.5', '0', '0.123456']) {
      const parsed = LedgerEventFormSchema.safeParse({
        eventDate: '2026-03-31',
        eventType: 'lp_capital_call',
        amount: good,
        currency: 'USD',
        perspective: 'fund_gross',
      });
      expect(parsed.success).toBe(true);
    }
  });

  it('rejects malformed event dates', () => {
    const parsed = LedgerEventFormSchema.safeParse({
      eventDate: '03/31/2026',
      eventType: 'lp_capital_call',
      amount: '1000000',
      currency: 'USD',
      perspective: 'fund_gross',
    });
    expect(parsed.success).toBe(false);
  });
});

describe('buildLedgerCsv', () => {
  it('produces a snake_case header and one CSV row', () => {
    const csv = buildLedgerCsv({
      eventDate: '2026-03-31',
      eventType: 'lp_capital_call',
      amount: '1000000.000000',
      currency: 'USD',
      perspective: 'fund_gross',
      sourceRef: 'Q1 capital call',
    });

    const [header, row] = csv.trim().split('\n');
    expect(header).toBe('event_type,amount,currency,event_date,perspective,description');
    expect(row).toBe('lp_capital_call,1000000.000000,USD,2026-03-31,fund_gross,Q1 capital call');
  });

  it('escapes commas and quotes in the source reference', () => {
    const csv = buildLedgerCsv({
      eventDate: '2026-03-31',
      eventType: 'lp_capital_call',
      amount: '1000000.000000',
      currency: 'USD',
      perspective: 'fund_gross',
      sourceRef: 'note, "with quotes"',
    });

    expect(csv).toContain('"note, ""with quotes"""');
  });
});

describe('LedgerEventForm', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a per-field error when the amount is malformed', async () => {
    const { Wrapper } = makeWrapper();
    render(
      <Wrapper>
        <LedgerEventForm fundId={7} onPreview={() => {}} />
      </Wrapper>
    );

    fireEvent.change(screen.getByLabelText(/event date/i), { target: { value: '2026-03-31' } });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '1.2.3' } });
    fireEvent.click(screen.getByRole('button', { name: /preview event/i }));

    await waitFor(() => {
      expect(screen.getByTestId('error-amount')).toBeInTheDocument();
    });
  });

  it('POSTs a base64 CSV envelope and surfaces the preview rows on success', async () => {
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
        <LedgerEventForm fundId={7} onPreview={onPreview} />
      </Wrapper>
    );

    fireEvent.change(screen.getByLabelText(/event date/i), { target: { value: '2026-03-31' } });
    fireEvent.change(screen.getByLabelText(/amount/i), {
      target: { value: '1000000.000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /preview event/i }));

    await waitFor(() => {
      expect(onPreview).toHaveBeenCalledTimes(1);
    });

    expect(onPreview.mock.calls[0]![0]).toHaveLength(1);
    expect(onPreview.mock.calls[0]![0][0]).toMatchObject({
      eventType: 'lp_capital_call',
      amount: '1000000.000000',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/funds/7/imports/ledger/dry-run');
    const body = JSON.parse(init?.body as string) as { sourceType: string; payload: string };
    expect(body.sourceType).toBe('csv');
    const decoded = decodePayloadCsv(body.payload);
    expect(decoded).toContain('event_type,amount,currency,event_date,perspective');
    expect(decoded).toContain('lp_capital_call,1000000.000000,USD,2026-03-31,fund_gross');
  });

  it('routes mutation errors to the onError callback with status + code', async () => {
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
        <LedgerEventForm fundId={7} onPreview={onPreview} onError={onError} />
      </Wrapper>
    );

    fireEvent.change(screen.getByLabelText(/event date/i), { target: { value: '2026-03-31' } });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '1000000' } });
    fireEvent.click(screen.getByRole('button', { name: /preview event/i }));

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
        <LedgerEventForm fundId={null} onPreview={() => {}} />
      </Wrapper>
    );

    expect(screen.getByRole('button', { name: /preview event/i })).toBeDisabled();
  });
});
