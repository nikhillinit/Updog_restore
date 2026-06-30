/**
 * LP Reporting -- MetricRunForm tests.
 *
 * Asserts:
 *   - zodResolver rejects malformed asOfDate strings
 *   - default asOfDate is today's UTC date (TZ=UTC tests)
 *   - submitting fires `useMetricsDryRun.mutateAsync` with
 *     `{ asOfDate, runType, perspective, sourceEventIds, sourceMarkIds, sourceMarkSelection }`
 *   - on success the parent's `onSuccess` callback receives the
 *     parsed metric-run dry-run envelope and original request
 *   - on 401 the parent's `onError` callback receives the typed error
 *   - submit is disabled when fundId is null
 */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import {
  MetricRunForm,
  MetricRunDryRunRequestClientSchema,
  todayIsoDate,
} from '@/components/lp-reporting/MetricRunForm';
import type { LpMetricRunResults, MetricRunDryRunResponse } from '@shared/contracts/lp-reporting';

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

function makeCanonicalResults(): LpMetricRunResults {
  return {
    asOfDate: '2026-03-31',
    currency: 'USD',
    dpi: '0.450000',
    rvpi: '1.250000',
    tvpi: '1.700000',
    moic: '1.700000',
    netIrr: '0.150000',
    grossIrr: '0.180000',
    xirrDiagnostic: {
      net: {
        convergence: 'converged',
        iterations: 5,
        method: 'newton',
        boundHit: null,
        failureReason: null,
      },
      gross: {
        convergence: 'converged',
        iterations: 4,
        method: 'newton',
        boundHit: null,
        failureReason: null,
      },
    },
    contributionsTotal: '50000000',
    distributionsTotal: '22500000',
    currentNav: '62500000',
    markConfidenceMix: { high: 8, medium: 3, low: 1 },
  };
}

function makeDryRunResponse(): MetricRunDryRunResponse {
  return {
    results: makeCanonicalResults(),
    diagnostics: {
      engineVersion: 'lp-reporting-engine@1.2.0',
      decimalPrecision: 6,
      excludedFutureMarks: [],
      warnings: [],
    },
    inputsHash: 'a'.repeat(64),
    runType: 'quarterly_report',
    previewHash: 'b'.repeat(64),
  };
}

describe('MetricRunDryRunRequestClientSchema', () => {
  it('rejects malformed asOfDate strings', () => {
    for (const bad of ['03/31/2026', '2026-3-31', '2026/03/31', '', 'today']) {
      const parsed = MetricRunDryRunRequestClientSchema.safeParse({
        asOfDate: bad,
        runType: 'internal_review',
        perspective: 'lp_net',
      });
      expect(parsed.success).toBe(false);
    }
  });

  it('accepts the four locked runType values', () => {
    for (const rt of ['quarterly_report', 'fundraise_pack', 'internal_review', 'lp_update']) {
      const parsed = MetricRunDryRunRequestClientSchema.safeParse({
        asOfDate: '2026-03-31',
        runType: rt,
        perspective: 'lp_net',
      });
      expect(parsed.success).toBe(true);
    }
  });

  it('rejects perspective=vehicle (engine supports lp_net + fund_gross only)', () => {
    const parsed = MetricRunDryRunRequestClientSchema.safeParse({
      asOfDate: '2026-03-31',
      runType: 'internal_review',
      perspective: 'vehicle',
    });
    expect(parsed.success).toBe(false);
  });
});

describe('todayIsoDate', () => {
  it('returns YYYY-MM-DD using UTC components', () => {
    const today = todayIsoDate();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const now = new Date();
    const expected = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(
      now.getUTCDate()
    ).padStart(2, '0')}`;
    expect(today).toBe(expected);
  });
});

describe('MetricRunForm', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults the asOfDate field to today (UTC)', () => {
    const { Wrapper } = makeWrapper();
    render(
      <Wrapper>
        <MetricRunForm fundId={7} onSuccess={() => {}} />
      </Wrapper>
    );

    const input = screen.getByLabelText(/^as-of date/i) as HTMLInputElement;
    expect(input.value).toBe(todayIsoDate());
  });

  it('disables the submit button when fundId is null', () => {
    const { Wrapper } = makeWrapper();
    render(
      <Wrapper>
        <MetricRunForm fundId={null} onSuccess={() => {}} />
      </Wrapper>
    );

    expect(screen.getByRole('button', { name: /run metrics/i })).toBeDisabled();
  });

  it('POSTs the metric-run dry-run envelope and surfaces the parsed results on success', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeDryRunResponse()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const onSuccess = vi.fn();

    const { Wrapper } = makeWrapper();
    render(
      <Wrapper>
        <MetricRunForm fundId={7} onSuccess={onSuccess} />
      </Wrapper>
    );

    fireEvent.change(screen.getByLabelText(/^as-of date/i), {
      target: { value: '2026-03-31' },
    });
    fireEvent.change(screen.getByLabelText(/^run type/i), {
      target: { value: 'quarterly_report' },
    });
    fireEvent.change(screen.getByLabelText(/^perspective/i), {
      target: { value: 'fund_gross' },
    });

    fireEvent.click(screen.getByRole('button', { name: /run metrics/i }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/funds/7/metric-runs/dry-run');
    expect(init?.method).toBe('POST');

    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      asOfDate: '2026-03-31',
      runType: 'quarterly_report',
      perspective: 'fund_gross',
      sourceEventIds: [],
      sourceMarkIds: [],
      sourceMarkSelection: 'explicit',
    });

    const passed = onSuccess.mock.calls[0]![0] as MetricRunDryRunResponse;
    const request = onSuccess.mock.calls[0]![1] as Record<string, unknown>;
    expect(passed.results.tvpi).toBe('1.700000');
    expect(passed.results.markConfidenceMix.high).toBe(8);
    expect(request).toMatchObject({
      asOfDate: '2026-03-31',
      runType: 'quarterly_report',
      perspective: 'fund_gross',
      sourceMarkSelection: 'explicit',
    });
  });

  it('routes 401 errors to onError with status + code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'UNAUTHORIZED', message: 'Session expired' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const onError = vi.fn();
    const onSuccess = vi.fn();

    const { Wrapper } = makeWrapper();
    render(
      <Wrapper>
        <MetricRunForm fundId={7} onSuccess={onSuccess} onError={onError} />
      </Wrapper>
    );

    fireEvent.click(screen.getByRole('button', { name: /run metrics/i }));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1);
    });

    const err = onError.mock.calls[0]![0];
    expect(err.status).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('renders a per-field error when the asOfDate is malformed', async () => {
    const { Wrapper } = makeWrapper();
    render(
      <Wrapper>
        <MetricRunForm fundId={7} onSuccess={() => {}} />
      </Wrapper>
    );

    fireEvent.change(screen.getByLabelText(/^as-of date/i), {
      target: { value: '03/31/2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: /run metrics/i }));

    await waitFor(() => {
      expect(screen.getByTestId('error-asOfDate')).toBeInTheDocument();
    });
  });
});
