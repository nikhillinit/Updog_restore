import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  BulkResolveResponse,
  ImportBatchStatusResponse,
  ListReconciliationCasesResponse,
  ReconciliationCaseDto,
  StageImportBatchReceipt,
} from '@shared/contracts/financial-observations/reconciliation-api.contract';

const fundContextMock = vi.hoisted(() => ({
  fundId: 7 as number | null,
}));

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({
    fundId: fundContextMock.fundId,
    currentFund: null,
    setCurrentFund: () => {},
    isLoading: false,
    needsSetup: false,
    fundLoadError: false,
    fundLoadErrorMessage: null,
    isDemoMode: false,
  }),
  FundProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import LpReportingImportsPage from '@/pages/lp-reporting/imports';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LpReportingImportsPage />
    </QueryClientProvider>
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stageReceipt(): StageImportBatchReceipt {
  return {
    batchId: 44,
    sourceArtifactId: 11,
    mappingProfileId: 22,
    dataBasis: 'observed_actual',
    previewHash: 'a'.repeat(64),
    purgeAfter: '2026-04-01T00:00:00.000Z',
    observations: [
      {
        id: 101,
        sourceLocator: 'row:1',
        dependencyGroupKey: 'source-observation:101',
      },
    ],
    initialCaseIds: [501],
  };
}

function batchStatus(
  overrides: Partial<ImportBatchStatusResponse> = {}
): ImportBatchStatusResponse {
  return {
    batchId: 44,
    sourceArtifactId: 11,
    mappingProfileId: 22,
    status: 'staged',
    dataBasis: 'observed_actual',
    previewHash: 'a'.repeat(64),
    purgeAfter: '2026-04-01T00:00:00.000Z',
    retentionExtendedUntil: null,
    purgedAt: null,
    expired: false,
    version: 1,
    etag: 'W/"batch-44-v1"',
    groups: [
      {
        dependencyGroupKey: 'source-observation:101',
        observationId: 101,
        observationStatus: 'staged',
        sourceLocator: 'row:1',
        caseIds: [501],
        accepted: false,
      },
    ],
    blockers: [
      {
        caseId: 501,
        caseType: 'observation_match',
        status: 'open',
        observationId: 101,
      },
    ],
    ...overrides,
  };
}

function openCase(overrides: Partial<ReconciliationCaseDto> = {}): ReconciliationCaseDto {
  return {
    id: 501,
    fundId: 7,
    importBatchId: 44,
    sourceObservationId: 101,
    caseType: 'observation_match',
    status: 'open',
    resolution: null,
    resolvedBy: null,
    resolvedAt: null,
    version: 1,
    createdAt: '2026-03-01T00:00:00.000Z',
    etag: 'W/"case-501-v1"',
    ...overrides,
  };
}

function casesResponse(
  cases: ReconciliationCaseDto[] = [openCase()]
): ListReconciliationCasesResponse {
  return { cases };
}

function bulkResponse(): BulkResolveResponse {
  return {
    results: [
      {
        caseId: 501,
        ok: true,
        httpStatus: 200,
        case: openCase({
          status: 'resolved',
          resolution: {
            action: 'confirm_match',
            targetCompanyIdentityId: null,
            memo: 'duplicate confirmed',
            targetCanonicalRecordRef: { kind: 'cash_flow_event', id: 777 },
          },
          resolvedBy: 3,
          resolvedAt: '2026-03-02T00:00:00.000Z',
        }),
        error: null,
      },
      {
        caseId: 502,
        ok: false,
        httpStatus: 412,
        case: null,
        error: {
          code: 'PRECONDITION_FAILED',
          message: 'Case changed during resolution.',
        },
      },
    ],
  };
}

describe('LpReportingImportsPage', () => {
  beforeEach(() => {
    fundContextMock.fundId = 7;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the V2 stage form and not the legacy dry-run tabs', () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(casesResponse([])));

    renderPage();

    expect(screen.getByRole('heading', { name: /^imports$/i })).toBeInTheDocument();
    expect(screen.getByTestId('imports-v2-source-artifact-id')).toBeInTheDocument();
    expect(screen.getByTestId('imports-v2-mapping-profile-id')).toBeInTheDocument();
    expect(screen.queryByTestId('imports-tab-trigger-ledger')).toBeNull();
    expect(screen.queryByTestId('csv-uploader-ledger')).toBeNull();
    expect(screen.queryByTestId('imports-v2-refresh-cases')).toBeNull();
    expect(screen.queryByTestId('imports-v2-commit-button')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('stages a CSV artifact through R1, loads R2 status, and keeps previewHash private', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/reconciliation/cases?status=open')) {
        return jsonResponse(casesResponse([]));
      }
      if (url.endsWith('/imports/batches') && init?.method === 'POST') {
        return jsonResponse(stageReceipt(), 201);
      }
      if (url.endsWith('/imports/batches/44')) {
        return jsonResponse(batchStatus());
      }
      return jsonResponse({ code: 'UNEXPECTED', message: url }, 500);
    });
    const user = userEvent.setup();

    renderPage();

    await user.type(screen.getByTestId('imports-v2-source-artifact-id'), '11');
    await user.type(screen.getByTestId('imports-v2-mapping-profile-id'), '22');
    await user.click(screen.getByTestId('imports-v2-stage-button'));

    await waitFor(() => {
      expect(screen.getByTestId('import-preview-batch-status')).toBeInTheDocument();
    });

    const stageCall = fetchSpy.mock.calls.find(
      ([url, init]) => String(url).endsWith('/imports/batches') && init?.method === 'POST'
    );
    expect(stageCall).toBeDefined();
    expect(stageCall?.[0]).toBe('/api/funds/7/imports/batches');
    expect(stageCall?.[1]?.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(JSON.parse(String(stageCall?.[1]?.body))).toEqual({
      contractVersion: 'import-v2',
      sourceArtifactId: 11,
      mappingProfileId: 22,
      dataBasis: 'observed_actual',
    });
    expect(screen.getAllByText('Accepted evidence only. Not calculation-active.')).toHaveLength(2);
    expect(screen.queryByTestId('imports-v2-group-101-checkbox')).toBeNull();
    expect(screen.getByTestId('imports-v2-commit-button')).toBeDisabled();
    expect(document.body.textContent).not.toContain('a'.repeat(64));
    expect(document.body.textContent).not.toContain('candidateFingerprint');
    expect(document.body.textContent).not.toContain('observationHash');
  });

  it('requires memo for a confirmed duplicate and sends typed canonical target via R4', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/reconciliation/cases?status=open')) {
        return jsonResponse(casesResponse());
      }
      if (url.endsWith('/imports/batches') && init?.method === 'POST') {
        return jsonResponse(stageReceipt(), 201);
      }
      if (url.endsWith('/imports/batches/44') && init?.method === 'GET') {
        return jsonResponse(batchStatus());
      }
      if (url.endsWith('/reconciliation/cases/501/resolve') && init?.method === 'POST') {
        return jsonResponse({
          case: openCase({
            status: 'resolved',
            resolution: {
              action: 'confirm_match',
              targetCompanyIdentityId: null,
              memo: 'duplicate confirmed',
              targetCanonicalRecordRef: { kind: 'cash_flow_event', id: 777 },
            },
            resolvedBy: 3,
            resolvedAt: '2026-03-02T00:00:00.000Z',
          }),
        });
      }
      return jsonResponse({ cases: [] });
    });
    const user = userEvent.setup();

    renderPage();

    await user.type(screen.getByTestId('imports-v2-source-artifact-id'), '11');
    await user.type(screen.getByTestId('imports-v2-mapping-profile-id'), '22');
    await user.click(screen.getByTestId('imports-v2-stage-button'));
    await waitFor(() => {
      expect(screen.getByTestId('imports-v2-case-501-open')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('imports-v2-case-501-open'));
    expect(screen.getByTestId('imports-v2-resolution-submit')).toBeDisabled();

    await user.type(screen.getByTestId('imports-v2-canonical-id'), '777');
    await user.type(screen.getByTestId('imports-v2-resolution-memo'), 'duplicate confirmed');
    await user.click(screen.getByTestId('imports-v2-resolution-submit'));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/funds/7/reconciliation/cases/501/resolve',
        expect.objectContaining({ method: 'POST' })
      );
    });
    const resolveCall = fetchSpy.mock.calls.find(([url]) =>
      String(url).endsWith('/reconciliation/cases/501/resolve')
    );
    expect(resolveCall?.[1]?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'If-Match': 'W/"case-501-v1"',
    });
    expect(JSON.parse(String(resolveCall?.[1]?.body))).toEqual({
      action: 'confirm_match',
      targetCompanyIdentityId: null,
      memo: 'duplicate confirmed',
      targetCanonicalRecordRef: { kind: 'cash_flow_event', id: 777 },
    });
  });

  it('renders ordered R5 partial results and commits selected groups through R6 with current ETag', async () => {
    const secondCase = openCase({
      id: 502,
      sourceObservationId: 102,
      etag: 'W/"case-502-v1"',
    });
    const stagedReceipt = stageReceipt();
    stagedReceipt.observations.push({
      id: 102,
      sourceLocator: 'row:2',
      dependencyGroupKey: 'source-observation:102',
    });
    stagedReceipt.initialCaseIds.push(502);
    const readyStatus = batchStatus({
      blockers: [],
      groups: [
        batchStatus().groups[0]!,
        {
          dependencyGroupKey: 'source-observation:102',
          observationId: 102,
          observationStatus: 'staged',
          sourceLocator: 'row:2',
          caseIds: [502],
          accepted: false,
        },
      ],
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/reconciliation/cases?status=open')) {
        return jsonResponse(casesResponse([openCase(), secondCase]));
      }
      if (url.endsWith('/imports/batches') && init?.method === 'POST') {
        return jsonResponse(stagedReceipt, 201);
      }
      if (url.endsWith('/imports/batches/44') && init?.method === 'GET') {
        return jsonResponse(readyStatus);
      }
      if (url.endsWith('/reconciliation/cases/bulk-resolve')) {
        return jsonResponse(bulkResponse());
      }
      if (url.endsWith('/imports/batches/44/commit')) {
        return jsonResponse({ batch: { ...readyStatus, status: 'committed' } });
      }
      return jsonResponse({ code: 'UNEXPECTED', message: url }, 500);
    });
    const user = userEvent.setup();

    renderPage();

    await user.type(screen.getByTestId('imports-v2-source-artifact-id'), '11');
    await user.type(screen.getByTestId('imports-v2-mapping-profile-id'), '22');
    await user.click(screen.getByTestId('imports-v2-stage-button'));
    await waitFor(() => {
      expect(screen.getByTestId('imports-v2-group-101-checkbox')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('imports-v2-case-501-bulk'));
    await user.click(screen.getByTestId('imports-v2-case-502-bulk'));
    expect(screen.getByTestId('imports-v2-bulk-resolve-button')).toBeDisabled();
    expect(screen.getByTestId('imports-v2-bulk-validation')).toHaveTextContent(
      'Add a valid action, target, and memo for every selected case.'
    );
    await user.click(screen.getByTestId('imports-v2-case-501-open'));
    await user.type(screen.getByTestId('imports-v2-canonical-id'), '777');
    await user.type(screen.getByTestId('imports-v2-resolution-memo'), 'duplicate confirmed');
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('imports-v2-bulk-resolve-button')).toBeDisabled();
    await user.click(screen.getByTestId('imports-v2-case-502-open'));
    await user.type(screen.getByTestId('imports-v2-canonical-id'), '778');
    await user.type(screen.getByTestId('imports-v2-resolution-memo'), 'duplicate changed');
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('imports-v2-bulk-resolve-button')).toBeEnabled();
    await user.click(screen.getByTestId('imports-v2-bulk-resolve-button'));
    await waitFor(() => {
      expect(screen.getByTestId('imports-v2-bulk-result-501')).toBeInTheDocument();
    });
    const orderedResults = screen.getAllByTestId(/imports-v2-bulk-result-/);
    expect(orderedResults.map((result) => result.getAttribute('data-testid'))).toEqual([
      'imports-v2-bulk-result-501',
      'imports-v2-bulk-result-502',
    ]);
    expect(screen.getByTestId('imports-v2-bulk-result-502')).toHaveTextContent(
      'PRECONDITION_FAILED'
    );
    const bulkCall = fetchSpy.mock.calls.find(([url]) =>
      String(url).endsWith('/reconciliation/cases/bulk-resolve')
    );
    expect(JSON.parse(String(bulkCall?.[1]?.body))).toEqual({
      items: [
        {
          caseId: 501,
          ifMatch: 'W/"case-501-v1"',
          decision: {
            action: 'confirm_match',
            targetCompanyIdentityId: null,
            memo: 'duplicate confirmed',
            targetCanonicalRecordRef: { kind: 'cash_flow_event', id: 777 },
          },
        },
        {
          caseId: 502,
          ifMatch: 'W/"case-502-v1"',
          decision: {
            action: 'confirm_match',
            targetCompanyIdentityId: null,
            memo: 'duplicate changed',
            targetCanonicalRecordRef: { kind: 'cash_flow_event', id: 778 },
          },
        },
      ],
    });

    await user.click(screen.getByTestId('imports-v2-group-101-checkbox'));
    await user.click(screen.getByTestId('imports-v2-commit-button'));
    await waitFor(() => {
      expect(screen.getByTestId('imports-v2-commit-result')).toBeInTheDocument();
    });

    const commitCall = fetchSpy.mock.calls.find(([url]) =>
      String(url).endsWith('/imports/batches/44/commit')
    );
    expect(commitCall?.[1]?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'If-Match': 'W/"batch-44-v1"',
    });
    expect(JSON.parse(String(commitCall?.[1]?.body))).toEqual({
      previewHash: 'a'.repeat(64),
      requestedGroupKeys: ['source-observation:101'],
    });
  });

  it('renders the select-fund notice and disables staging when fundId is null', () => {
    fundContextMock.fundId = null;

    renderPage();

    expect(screen.getByText(/select a fund/i)).toBeInTheDocument();
    expect(screen.getByTestId('imports-v2-stage-button')).toBeDisabled();
  });
});
