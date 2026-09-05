import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import {
  useActualsMetrics,
  useActualsPreview,
  useActualsPublish,
  useFinancialFactsLatestReference,
} from '@/hooks/lp-reporting';

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

const preview = {
  contractVersion: 'actuals-preview-response/1.0.0',
  templateVersion: 'actuals-ledger/1.0.0',
  asOfDate: '2026-09-04',
  sanitizedFileName: 'ledger.csv',
  byteCount: 10,
  payloadSha256: 'a'.repeat(64),
  canonicalRowsHash: 'b'.repeat(64),
  previewHash: 'c'.repeat(64),
  rowCounts: { total: 0, valid: 0, invalid: 0, duplicateInFile: 0, alreadyImported: 0 },
  fileTotals: {
    settledPaidIn: '0.000000',
    deployed: '0.000000',
    initialDeployed: '0.000000',
    followOnDeployed: '0.000000',
    secondaryDeployed: '0.000000',
    otherDeployed: '0.000000',
    managementFees: '0.000000',
    otherExpenses: '0.000000',
    realizedFundProceeds: '0.000000',
    distributionsToPartners: '0.000000',
    positionFairValue: '0.000000',
    markedCompanyCount: 0,
  },
  netNewEffectTotals: {
    settledPaidIn: '0.000000',
    deployed: '0.000000',
    initialDeployed: '0.000000',
    followOnDeployed: '0.000000',
    secondaryDeployed: '0.000000',
    otherDeployed: '0.000000',
    managementFees: '0.000000',
    otherExpenses: '0.000000',
    realizedFundProceeds: '0.000000',
    distributionsToPartners: '0.000000',
    positionFairValue: '0.000000',
    markedCompanyCount: 0,
  },
  categoryCoverage: 'complete',
  canPublish: true,
  issues: [],
  rows: [],
} as const;

describe('actuals publication hooks', () => {
  afterEach(() => vi.restoreAllMocks());

  it('posts preview through locked route and contract', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(preview));
    const { result } = renderHook(() => useActualsPreview(7), { wrapper: wrapper() });
    const request = {
      contractVersion: 'actuals-preview-request/1.0.0',
      templateVersion: 'actuals-ledger/1.0.0',
      asOfDate: '2026-09-04',
      fileName: 'ledger.csv',
      payload: 'YQ==',
    } as const;

    result.current.mutate(request);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/funds/7/imports/actuals/dry-run',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(request) })
    );
  });

  it('preserves frozen publish body, key, If-Match, and Retry-After', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        jsonResponse({ code: 'RATE_LIMITED', message: 'Wait.' }, 429, { 'Retry-After': '9' })
      );
    const { result } = renderHook(() => useActualsPublish(7), { wrapper: wrapper() });
    const body = {
      contractVersion: 'actuals-pilot-publish/1.0.0',
      asOfDate: '2026-09-04',
      ledger: {
        templateVersion: 'actuals-ledger/1.0.0',
        fileName: 'ledger.csv',
        payload: 'YQ==',
        expectedPayloadSha256: 'a'.repeat(64),
        expectedCanonicalRowsHash: 'b'.repeat(64),
        expectedPreviewHash: 'c'.repeat(64),
      },
      valuation: null,
      coverage: {
        ledger: 'inception_to_date',
        priorFactsSnapshotId: null,
        evidenceNote: 'Full ledger export.',
      },
    } as const;
    const serializedBody = JSON.stringify(body);

    result.current.mutate({
      body,
      serializedBody,
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      ifMatch: '"financial-facts:none"',
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/funds/7/imports/actuals/publish',
      expect.objectContaining({
        body: serializedBody,
        headers: expect.objectContaining({
          'Idempotency-Key': '11111111-1111-4111-8111-111111111111',
          'If-Match': '"financial-facts:none"',
        }),
      })
    );
    expect(result.current.error?.retryAfterSeconds).toBe(9);
  });

  it.each([
    ['non-JSON', new Response('not-json', { status: 201 })],
    ['invalid receipt', jsonResponse({ contractVersion: 'wrong' }, 201)],
  ])(
    'normalizes %s 2xx publish response to CONTRACT_PARSE_ERROR',
    async (_label, responseValue) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(responseValue);
      const { result } = renderHook(() => useActualsPublish(7), { wrapper: wrapper() });
      const body = {
        contractVersion: 'actuals-pilot-publish/1.0.0',
        asOfDate: '2026-09-04',
        ledger: {
          templateVersion: 'actuals-ledger/1.0.0',
          fileName: 'ledger.csv',
          payload: 'YQ==',
          expectedPayloadSha256: 'a'.repeat(64),
          expectedCanonicalRowsHash: 'b'.repeat(64),
          expectedPreviewHash: 'c'.repeat(64),
        },
        valuation: null,
        coverage: {
          ledger: 'inception_to_date',
          priorFactsSnapshotId: null,
          evidenceNote: 'Full ledger export.',
        },
      } as const;

      result.current.mutate({
        body,
        serializedBody: JSON.stringify(body),
        idempotencyKey: '11111111-1111-4111-8111-111111111111',
        ifMatch: '"financial-facts:none"',
      });
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toMatchObject({ code: 'CONTRACT_PARSE_ERROR', status: 201 });
    }
  );

  it('derives latest If-Match and requests metrics by immutable snapshot id', async () => {
    const latest = {
      contractVersion: 'financial-facts-latest-reference/1.0.0',
      head: {
        snapshotId: 41,
        asOfDate: '2026-09-04',
        knowledgeCutoff: '2026-09-04T12:00:00.000Z',
        policyVersion: 'financial-facts-policy/1.4.0',
        payloadSchemaId: 'financial-facts-payload/5',
        snapshotInputHash: 'd'.repeat(64),
        supersedesSnapshotId: null,
        basisRef: null,
        consumerEvaluations: [],
      },
    } as const;
    const unavailableMetrics = {
      contractVersion: 'actual-metrics/2.0.0',
      snapshotStatus: 'unavailable',
      fundId: 7,
      asOfDate: null,
      knowledgeCutoff: null,
      financialFactsSnapshotId: null,
      snapshotInputHash: null,
      reasonCodes: ['FACTS_NOT_FOUND'],
    } as const;
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) =>
        String(input).includes('latest-reference')
          ? jsonResponse(latest)
          : jsonResponse(unavailableMetrics)
      );

    const latestHook = renderHook(() => useFinancialFactsLatestReference(7), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(latestHook.result.current.isSuccess).toBe(true));
    expect(latestHook.result.current.data?.ifMatch).toBe(`"financial-facts:41:${'d'.repeat(64)}"`);

    const metricsHook = renderHook(() => useActualsMetrics(7, 41), { wrapper: wrapper() });
    await waitFor(() => expect(metricsHook.result.current.isSuccess).toBe(true));
    expect(fetchSpy).toHaveBeenCalledWith('/api/funds/7/actuals/metrics?factsSnapshotId=41', {
      method: 'GET',
    });
  });
});
