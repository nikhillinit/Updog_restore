import React from 'react';
import { createHash, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActualsRestatementReview } from '@/components/lp-reporting/ActualsRestatementReview';
import {
  FinancialCapitalActualsV1Schema,
  type FinancialFactsBasisRef,
} from '@shared/contracts/financial-facts-snapshot-v1.contract';
import {
  ActualsPreviewTotalsV1Schema,
  type ActualsPreviewIssueV1,
  type FinancialFactsLatestReferenceV1,
} from '@shared/contracts/lp-reporting/actuals-pilot.contract';
import {
  ActualsRestatementReceiptV1Schema,
  type ActualsRestatementPreviewRequestV1,
  type ActualsRestatementTargetV1,
} from '@shared/contracts/lp-reporting/actuals-restatement.contract';
import {
  ACTUALS_LEDGER_TEMPLATE_HEADER,
  ACTUALS_VALUATION_TEMPLATE_HEADER,
} from '@shared/contracts/lp-reporting/actuals-pilot-templates';

const basis: FinancialFactsBasisRef = {
  schemaId: 'financial-facts-basis-ref/1.0.0',
  fundId: 7,
  snapshotId: 41,
  snapshotInputHash: 'a'.repeat(64),
  sourceFactsInputHash: 'b'.repeat(64),
  policyVersion: 'financial-facts-policy/1.4.0',
  asOfDate: '2026-09-04',
  knowledgeCutoff: '2026-09-04T12:00:00.000Z',
};
const target: ActualsRestatementTargetV1 = {
  identity: {
    kind: 'ledger',
    recordId: 11,
    sourceHash: 'c'.repeat(64),
    contentHash: 'd'.repeat(64),
  },
  fields: {
    kind: 'ledger',
    eventType: 'settled_contribution',
    effectiveDate: '2026-09-04',
    amount: '100.00',
    currency: 'USD',
    companyId: null,
    vehicleId: 1,
    deploymentCategory: null,
    expenseCategory: null,
    distributionType: null,
    recallable: null,
    description: null,
  },
  sourceExternalRef: 'original-ref',
  originalPublication: {
    snapshotId: 41,
    snapshotInputHash: basis.snapshotInputHash,
    operationHash: 'e'.repeat(64),
  },
  predecessor: null,
  correctionCommandId: null,
};
const unknown = {
  value: null,
  availability: 'unavailable',
  reasonCodes: ['SOURCE_NOT_SUPPLIED'],
  sourceRefs: [],
};
const markTarget: ActualsRestatementTargetV1 = {
  ...target,
  identity: { ...target.identity, kind: 'valuation' },
  fields: {
    kind: 'valuation',
    markDate: basis.asOfDate,
    fairValue: '100.00',
    currency: 'USD',
    companyId: 1,
    vehicleId: 1,
    markPurpose: 'quarterly',
    markSource: 'board_update',
    confidenceLevel: 'high',
    valuationMethod: 'manual',
    costBasis: '80.00',
  },
};
const existingMarkIssue: ActualsPreviewIssueV1 = {
  code: 'VALUATION_MARK_ALREADY_EXISTS',
  rowNumber: 1,
  column: 'mark_date',
  severity: 'error',
  message: 'A valuation mark already exists for this position and date.',
};
const markCsv = `${ACTUALS_VALUATION_TEMPLATE_HEADER}\nSynthetic Acme Labs,main,${basis.asOfDate},250.00,USD,board_update,high,manual,80.00,corrected-ref\n`;
const capitalActuals = FinancialCapitalActualsV1Schema.parse(
  Object.fromEntries(
    Object.keys(FinancialCapitalActualsV1Schema.shape).map((key) => [
      key,
      key === 'ledgerCoverage' ? 'complete' : unknown,
    ])
  )
);
const totals = ActualsPreviewTotalsV1Schema.parse(
  Object.fromEntries(
    Object.keys(ActualsPreviewTotalsV1Schema.shape).map((key) => [
      key,
      key === 'markedCompanyCount' ? 0 : '0.000000',
    ])
  )
);
const reason = 'Correct source contribution amount.';
const replacementContentHash = 'f'.repeat(64);
const correctionPreviewHash = '1'.repeat(64);
const successorHash = '2'.repeat(64);
const replacement = {
  kind: 'ledger' as const,
  recordId: 12,
  sourceHash: '3'.repeat(64),
  contentHash: replacementContentHash,
};
const correction = {
  commandId: '11111111-1111-4111-8111-111111111111',
  asOfDate: basis.asOfDate,
  reason,
  actor: { userId: 1 },
  createdAt: '2026-09-05T12:00:00.000Z',
  items: [
    { target: target.identity, replacement, originalPublication: target.originalPublication },
  ],
};

function latestReference(expectedBasis = basis): FinancialFactsLatestReferenceV1 {
  return {
    contractVersion: 'financial-facts-latest-reference/1.0.0',
    head: {
      snapshotId: expectedBasis.snapshotId,
      asOfDate: expectedBasis.asOfDate,
      knowledgeCutoff: expectedBasis.knowledgeCutoff,
      policyVersion: expectedBasis.policyVersion,
      payloadSchemaId: 'financial-facts-payload/5',
      snapshotInputHash: expectedBasis.snapshotInputHash,
      supersedesSnapshotId: null,
      basisRef: expectedBasis,
      consumerEvaluations: [],
    },
  };
}

function csv(externalRef = 'corrected-ref') {
  return `${ACTUALS_LEDGER_TEMPLATE_HEADER}\nlp_contribution,2026-09-04,250.00,USD,,main,,,,,,${externalRef}\n`;
}

function csvPreview(payload: string) {
  const text = Buffer.from(payload, 'base64').toString('utf8');
  const externalRef = text.trim().split('\n')[1]?.split(',').at(-1);
  return {
    contractVersion: 'actuals-preview-response/1.0.0',
    templateVersion: 'actuals-ledger/1.0.0',
    asOfDate: basis.asOfDate,
    sanitizedFileName: 'correction.csv',
    byteCount: Buffer.byteLength(text),
    payloadSha256: createHash('sha256').update(text).digest('hex'),
    canonicalRowsHash: '4'.repeat(64),
    previewHash: '5'.repeat(64),
    rowCounts: { total: 1, valid: 1, invalid: 0, duplicateInFile: 0, alreadyImported: 0 },
    fileTotals: totals,
    netNewEffectTotals: totals,
    categoryCoverage: 'complete',
    canPublish: true,
    issues: [],
    rows: [
      {
        rowNumber: 1,
        sourceExternalRef: externalRef,
        status: 'valid',
        eventType: 'settled_contribution',
        effectiveDate: basis.asOfDate,
        companyLabel: null,
        vehicleLabel: 'main',
        canonicalAmount: '250.000000',
        rowSourceHash: replacement.sourceHash,
        rowContentHash: replacementContentHash,
        issues: [],
      },
    ],
  };
}

function previewResponse(request: ActualsRestatementPreviewRequestV1) {
  return {
    contractVersion: 'actuals-restatement/1.0.0',
    basisRef: request.expectedBasis,
    previewHash: correctionPreviewHash,
    canPublish: true,
    items: [
      {
        original: target,
        replacementExternalRef: request.items[0]?.replacementExternalRef,
        replacementContentHash,
        replacementFields: { ...target.fields, amount: '250.00' },
      },
    ],
    impact: {
      capitalActuals,
      valuationActuals: {
        valuationDate: null,
        roster: [],
        marks: [],
        coverage: 'not_supplied',
        missingCompanyIds: [],
      },
      unavailableCompanyIds: [],
    },
    errors: [],
  };
}

function receipt() {
  const filePreview = csvPreview(Buffer.from(csv()).toString('base64'));
  return ActualsRestatementReceiptV1Schema.parse({
    contractVersion: 'actuals-pilot-publish/2.0.0',
    operationKind: 'restatement',
    operationHash: '6'.repeat(64),
    fundId: 7,
    asOfDate: basis.asOfDate,
    coverage: { ledger: 'incremental_since_prior_head', priorFactsSnapshotId: 41 },
    admitted: {
      ledger: {
        sourceArtifactId: 2,
        payloadSha256: filePreview.payloadSha256,
        canonicalRowsHash: filePreview.canonicalRowsHash,
        previewHash: filePreview.previewHash,
        approvedRowIds: [12],
        approvedCount: 1,
      },
      valuation: null,
      importBatchId: '22222222-2222-4222-8222-222222222222',
    },
    facts: {
      policyVersion: 'financial-facts-policy/1.5.0',
      payloadSchemaId: 'financial-facts-payload/6',
      supersedesSnapshotId: 41,
      knowledgeCutoff: correction.createdAt,
      snapshotId: 42,
      snapshotInputHash: successorHash,
      etag: `"financial-facts:42:${successorHash}"`,
    },
    basisRef: {
      ...basis,
      snapshotId: 42,
      snapshotInputHash: successorHash,
      sourceFactsInputHash: '7'.repeat(64),
      policyVersion: 'financial-facts-policy/1.5.0',
      knowledgeCutoff: correction.createdAt,
    },
    effectiveBasis: {
      ledgerRecordIds: [12],
      valuationRecordIds: [],
      recordsHash: '8'.repeat(64),
      predecessorSnapshotInputHash: basis.snapshotInputHash,
      corrections: [correction],
    },
    restatement: correction,
  });
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface CapturedCall {
  url: URL;
  init?: RequestInit;
}

function installApi(
  options: {
    publish?: (call: CapturedCall, attempt: number) => Response;
    preview?: (request: ActualsRestatementPreviewRequestV1) => unknown;
    readBasis?: FinancialFactsBasisRef;
    selectedTarget?: ActualsRestatementTargetV1;
    filePreview?: (payload: string) => unknown;
  } = {}
) {
  const calls: CapturedCall[] = [];
  let attempts = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const call = { url: new URL(String(input), 'http://localhost'), init };
    calls.push(call);
    if (call.url.pathname.endsWith('/restatements/targets'))
      return response({
        contractVersion: 'actuals-restatement/1.0.0',
        basisRef: options.readBasis ?? basis,
        targets: [options.selectedTarget ?? target],
        nextCursor: call.url.searchParams.has('cursor') ? null : 'opaque-target-cursor',
      });
    if (call.url.pathname.endsWith('/restatements/history'))
      return response({
        contractVersion: 'actuals-restatement/1.0.0',
        basisRef: options.readBasis ?? basis,
        history: [{ id: 1, publication: target.originalPublication, correction }],
        nextCursor: null,
      });
    if (call.url.pathname.endsWith('/restatements/dry-run')) {
      const request = JSON.parse(String(init?.body)) as ActualsRestatementPreviewRequestV1;
      return response(options.preview ? options.preview(request) : previewResponse(request));
    }
    if (call.url.pathname.endsWith('/actuals/dry-run')) {
      const request = JSON.parse(String(init?.body)) as { payload: string };
      return response(
        options.filePreview ? options.filePreview(request.payload) : csvPreview(request.payload)
      );
    }
    if (call.url.pathname.endsWith('/restatements/publish')) {
      return options.publish?.(call, ++attempts) ?? response(receipt());
    }
    if (call.url.pathname.endsWith('/actuals/metrics'))
      return response({
        contractVersion: 'actual-metrics/2.0.0',
        snapshotStatus: 'unavailable',
        fundId: 7,
        asOfDate: null,
        knowledgeCutoff: null,
        financialFactsSnapshotId: null,
        snapshotInputHash: null,
        reasonCodes: ['FACTS_NOT_FOUND'],
      });
    throw new Error(`Unexpected request: ${call.url}`);
  });
  return calls;
}

function renderReview(onRefreshBasis = vi.fn(async () => undefined)) {
  const onLockChange = vi.fn();
  const onPendingChange = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const view = (reference: FinancialFactsLatestReferenceV1) => (
    <QueryClientProvider client={client}>
      <ActualsRestatementReview
        fundId={7}
        latestReference={reference}
        disabled={false}
        onLockChange={onLockChange}
        onPendingChange={onPendingChange}
        onRefreshBasis={onRefreshBasis}
      />
    </QueryClientProvider>
  );
  const rendered = render(view(latestReference()));
  return {
    ...rendered,
    onRefreshBasis,
    onLockChange,
    onPendingChange,
    rerenderBasis: (next: FinancialFactsBasisRef) => rendered.rerender(view(latestReference(next))),
  };
}

async function fillCorrection(
  user: ReturnType<typeof userEvent.setup>,
  externalRef = 'corrected-ref'
) {
  await user.click(screen.getByText('Correct published actuals'));
  const selection = screen.getByLabelText('Published row or mark');
  await screen.findByRole('option', { name: /original-ref/ });
  await user.selectOptions(selection, `ledger:11:${target.identity.contentHash}`);
  await user.type(screen.getByLabelText('Fresh replacement external reference'), externalRef);
  await user.type(screen.getByLabelText('Correction reason'), reason);
  await user.upload(
    screen.getByLabelText('Replacement CSV (one row)'),
    new File([csv(externalRef)], 'correction.csv', { type: 'text/csv' })
  );
  await user.click(screen.getByRole('button', { name: 'Preview correction' }));
  await screen.findByRole('region', { name: 'Correction before and after' });
}

function publishCalls(calls: CapturedCall[]) {
  return calls.filter((call) => call.url.pathname.endsWith('/restatements/publish'));
}

async function previewMark(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText('Correct published actuals'));
  await screen.findByRole('option', { name: /original-ref/ });
  await user.selectOptions(
    screen.getByLabelText('Published row or mark'),
    `valuation:11:${markTarget.identity.contentHash}`
  );
  await user.type(screen.getByLabelText('Fresh replacement external reference'), 'corrected-ref');
  await user.type(screen.getByLabelText('Correction reason'), reason);
  await user.upload(
    screen.getByLabelText('Replacement CSV (one row)'),
    new File([markCsv], 'correction.csv', { type: 'text/csv' })
  );
  await user.click(screen.getByRole('button', { name: 'Preview correction' }));
}

function ordinaryMarkPreview(payload: string, extraIssues: ActualsPreviewIssueV1[] = []) {
  const base = csvPreview(payload);
  const issues = [existingMarkIssue, ...extraIssues];
  return {
    ...base,
    templateVersion: 'actuals-valuation/1.0.0',
    canPublish: false,
    categoryCoverage: 'not_applicable',
    rowCounts: { ...base.rowCounts, valid: 0, invalid: 1 },
    issues,
    rows: [{ ...base.rows[0], status: 'invalid', eventType: 'valuation_mark', issues }],
  };
}

describe('published actuals correction review', () => {
  beforeEach(() => {
    sessionStorage.clear();
    let counter = 0;
    vi.stubGlobal('crypto', {
      subtle: webcrypto.subtle,
      randomUUID: () => `91111111-1111-4111-8111-${String(++counter).padStart(12, '0')}`,
    });
  });
  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('binds authenticated target/history reads and opaque pagination to the complete basis', async () => {
    const calls = installApi();
    renderReview();
    const user = userEvent.setup();
    await user.click(screen.getByText('Correct published actuals'));
    await screen.findByRole('option', { name: /original-ref/ });
    await user.click(screen.getByText('Replacement history'));
    expect(await screen.findByText(reason)).toBeVisible();
    const reads = calls.filter((call) =>
      /restatements\/(targets|history)$/.test(call.url.pathname)
    );
    expect(reads).toHaveLength(2);
    for (const call of reads) {
      expect(JSON.parse(call.url.searchParams.get('expectedBasis') ?? '')).toEqual(basis);
      expect(call.url.searchParams.get('limit')).toBe('50');
      expect(call.url.searchParams.has('cursor')).toBe(false);
      expect(call.init).toMatchObject({
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
      });
    }
    await user.click(screen.getByRole('button', { name: /next.*target/i }));
    await waitFor(() =>
      expect(
        calls.some((call) => call.url.searchParams.get('cursor') === 'opaque-target-cursor')
      ).toBe(true)
    );
  });

  it('uses file preview before correction preview and shows exact before/after and unavailable money', async () => {
    const calls = installApi();
    renderReview();
    await fillCorrection(userEvent.setup());
    const previews = calls.filter((call) => call.url.pathname.endsWith('/dry-run'));
    expect(previews.map((call) => call.url.pathname)).toEqual([
      '/api/funds/7/imports/actuals/dry-run',
      '/api/funds/7/imports/actuals/restatements/dry-run',
    ]);
    const request = JSON.parse(String(previews[1]?.init?.body));
    expect(request).toMatchObject({
      expectedBasis: basis,
      reason,
      valuation: null,
      items: [
        {
          target: target.identity,
          originalPublication: target.originalPublication,
          replacementExternalRef: 'corrected-ref',
          expectedReplacementContentHash: replacementContentHash,
        },
      ],
    });
    expect(new Headers(previews[1]?.init?.headers).get('If-Match')).toBe(
      `"financial-facts:41:${basis.snapshotInputHash}"`
    );
    const review = screen.getByRole('region', { name: 'Correction before and after' });
    expect(within(review).getByText('100.00')).toBeVisible();
    expect(within(review).getByText('250.00')).toBeVisible();
    expect(within(review).getAllByText('Unavailable — SOURCE_NOT_SUPPLIED').length).toBeGreaterThan(
      1
    );
    expect(within(review).queryByText('$0.00')).not.toBeInTheDocument();
    expect(publishCalls(calls)).toHaveLength(0);
  });

  it('passes only a same-position mark conflict to exact-target correction validation with original file hashes', async () => {
    const calls = installApi({
      selectedTarget: markTarget,
      filePreview: ordinaryMarkPreview,
      preview: (request) => ({
        ...previewResponse(request),
        items: [
          {
            original: markTarget,
            replacementExternalRef: 'corrected-ref',
            replacementContentHash,
            replacementFields: { ...markTarget.fields, fairValue: '250.00' },
          },
        ],
      }),
    });
    renderReview();
    await previewMark(userEvent.setup());
    expect(
      await screen.findByRole('region', { name: 'Correction before and after' })
    ).toBeVisible();
    const requests = calls.filter((call) => call.url.pathname.endsWith('/dry-run'));
    expect(requests).toHaveLength(2);
    const originalPreview = ordinaryMarkPreview(Buffer.from(markCsv).toString('base64'));
    expect(originalPreview.canPublish).toBe(false);
    expect(JSON.parse(String(requests[1]?.init?.body))).toMatchObject({
      ledger: null,
      valuation: {
        payload: Buffer.from(markCsv).toString('base64'),
        expectedPayloadSha256: originalPreview.payloadSha256,
        expectedCanonicalRowsHash: originalPreview.canonicalRowsHash,
        expectedPreviewHash: originalPreview.previewHash,
      },
      items: [
        {
          target: markTarget.identity,
          originalPublication: markTarget.originalPublication,
          replacementExternalRef: 'corrected-ref',
          expectedReplacementContentHash: replacementContentHash,
        },
      ],
    });
    expect(publishCalls(calls)).toHaveLength(0);
  });

  it('blocks a mark conflict accompanied by another ordinary file issue', async () => {
    const calls = installApi({
      selectedTarget: markTarget,
      filePreview: (payload) =>
        ordinaryMarkPreview(payload, [
          {
            code: 'VALUATION_AS_OF_MISMATCH',
            rowNumber: 1,
            column: 'mark_date',
            severity: 'error',
            message: 'Valuation mark date must equal the preview as-of date.',
          },
        ]),
    });
    renderReview();
    await previewMark(userEvent.setup());
    expect(await screen.findByText(/VALUATION_AS_OF_MISMATCH/)).toBeVisible();
    expect(
      calls.filter((call) => call.url.pathname.endsWith('/restatements/dry-run'))
    ).toHaveLength(0);
    expect(publishCalls(calls)).toHaveLength(0);
  });

  it('keeps dedicated correction validation authoritative for a mark conflict', async () => {
    const calls = installApi({
      selectedTarget: markTarget,
      filePreview: ordinaryMarkPreview,
      preview: (request) => ({
        ...previewResponse(request),
        canPublish: false,
        impact: null,
        items: [
          {
            original: markTarget,
            replacementExternalRef: 'corrected-ref',
            replacementContentHash,
            replacementFields: { ...markTarget.fields, fairValue: '250.00' },
          },
        ],
        errors: [
          {
            code: 'VALUATION_SCOPE_MISMATCH',
            message: 'Correction must preserve the selected position and date.',
            target: markTarget.identity,
          },
        ],
      }),
    });
    renderReview();
    await previewMark(userEvent.setup());
    expect(await screen.findByText(/VALUATION_SCOPE_MISMATCH/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Restate published actuals' })).toBeDisabled();
    expect(publishCalls(calls)).toHaveLength(0);
  });

  it('preserves exact body, key and inputs through ambiguous retries', async () => {
    const calls = installApi({
      publish: () =>
        response({ code: 'MUTATION_OUTCOME_UNKNOWN', message: 'Outcome unknown.' }, 503),
    });
    const rendered = renderReview();
    const user = userEvent.setup();
    await fillCorrection(user);
    await user.click(screen.getByRole('button', { name: 'Restate published actuals' }));
    await screen.findByText(/MUTATION_OUTCOME_UNKNOWN: Outcome unknown/);
    expect(screen.getByLabelText('Published row or mark')).toBeDisabled();
    expect(screen.getByLabelText('Fresh replacement external reference')).toBeDisabled();
    expect(screen.getByLabelText('Correction reason')).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Change correction and preview again' })
    ).not.toBeInTheDocument();
    expect(rendered.onLockChange).toHaveBeenLastCalledWith(true);
    expect(rendered.onPendingChange).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole('button', { name: 'Retry same correction' }));
    await waitFor(() => expect(publishCalls(calls)).toHaveLength(2));
    const [first, retry] = publishCalls(calls);
    expect(retry?.init?.body).toBe(first?.init?.body);
    expect(new Headers(retry?.init?.headers).get('Idempotency-Key')).toBe(
      new Headers(first?.init?.headers).get('Idempotency-Key')
    );
    expect(JSON.parse(String(first?.init?.body)).expectedPreviewHash).toBe(correctionPreviewHash);
    expect(sessionStorage.getItem('actuals-restatement:v1:7')).not.toContain(
      Buffer.from(csv()).toString('base64')
    );
    expect(rendered.onRefreshBasis).not.toHaveBeenCalled();
  });

  it('requires a new preview and key when changing a refused command', async () => {
    const calls = installApi({
      publish: () => response({ code: 'PREVIEW_HASH_MISMATCH', message: 'Preview changed.' }, 409),
    });
    renderReview();
    const user = userEvent.setup();
    await fillCorrection(user);
    await user.click(screen.getByRole('button', { name: 'Restate published actuals' }));
    await user.click(
      await screen.findByRole('button', { name: 'Change correction and preview again' })
    );
    expect(
      screen.queryByRole('button', { name: 'Restate published actuals' })
    ).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('Correction reason'));
    await user.type(
      screen.getByLabelText('Correction reason'),
      'Correct independently verified amount.'
    );
    await user.upload(
      screen.getByLabelText('Replacement CSV (one row)'),
      new File([csv()], 'correction.csv', { type: 'text/csv' })
    );
    await user.click(screen.getByRole('button', { name: 'Preview correction' }));
    await user.click(await screen.findByRole('button', { name: 'Restate published actuals' }));
    await waitFor(() => expect(publishCalls(calls)).toHaveLength(2));
    const [first, changed] = publishCalls(calls);
    expect(new Headers(changed?.init?.headers).get('Idempotency-Key')).not.toBe(
      new Headers(first?.init?.headers).get('Idempotency-Key')
    );
    expect(
      calls.filter((call) => call.url.pathname.endsWith('/restatements/dry-run'))
    ).toHaveLength(2);
    expect(JSON.parse(String(changed?.init?.body)).reason).toBe(
      'Correct independently verified amount.'
    );
  });

  it('rejects targets from another full basis and refreshes only on explicit action', async () => {
    const calls = installApi({ readBasis: { ...basis, sourceFactsInputHash: '9'.repeat(64) } });
    const rendered = renderReview();
    const user = userEvent.setup();
    await user.click(screen.getByText('Correct published actuals'));
    expect(await screen.findAllByText(/STALE_BASIS/)).not.toHaveLength(0);
    expect(screen.queryByRole('option', { name: /original-ref/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview correction' })).toBeDisabled();
    expect(rendered.onRefreshBasis).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Refresh published basis' }));
    expect(rendered.onRefreshBasis).toHaveBeenCalledTimes(1);
    expect(calls.every((call) => call.init?.method === 'GET')).toBe(true);
  });

  it('invalidates an unfrozen preview when the full published basis changes', async () => {
    const calls = installApi();
    const rendered = renderReview();
    await fillCorrection(userEvent.setup());
    rendered.rerenderBasis({ ...basis, sourceFactsInputHash: '9'.repeat(64) });
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'Correction before and after' })
      ).not.toBeInTheDocument()
    );
    expect(
      screen.queryByRole('button', { name: 'Restate published actuals' })
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Published row or mark')).toHaveValue('');
    expect(publishCalls(calls)).toHaveLength(0);
  });

  it('rejects a preview mapped to a different immutable original publication', async () => {
    const calls = installApi({
      preview: (request) => {
        const result = previewResponse(request);
        result.items[0]!.original = {
          ...target,
          originalPublication: { ...target.originalPublication, operationHash: '9'.repeat(64) },
        };
        return result;
      },
    });
    renderReview();
    const user = userEvent.setup();
    await user.click(screen.getByText('Correct published actuals'));
    await screen.findByRole('option', { name: /original-ref/ });
    await user.selectOptions(
      screen.getByLabelText('Published row or mark'),
      `ledger:11:${target.identity.contentHash}`
    );
    await user.type(screen.getByLabelText('Fresh replacement external reference'), 'corrected-ref');
    await user.type(screen.getByLabelText('Correction reason'), reason);
    await user.upload(
      screen.getByLabelText('Replacement CSV (one row)'),
      new File([csv()], 'correction.csv', { type: 'text/csv' })
    );
    await user.click(screen.getByRole('button', { name: 'Preview correction' }));
    expect(
      await screen.findByText(/Correction preview does not match the selected replacement/)
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Restate published actuals' })
    ).not.toBeInTheDocument();
    expect(publishCalls(calls)).toHaveLength(0);
  });

  it.each([
    [
      'successor basis',
      (value: ReturnType<typeof receipt>) => {
        value.basisRef.knowledgeCutoff = '2026-09-06T12:00:00.000Z';
      },
    ],
    [
      'admitted file',
      (value: ReturnType<typeof receipt>) => {
        value.admitted.ledger!.payloadSha256 = '9'.repeat(64);
      },
    ],
    [
      'original publication',
      (value: ReturnType<typeof receipt>) => {
        value.restatement.items[0]!.originalPublication.operationHash = '9'.repeat(64);
      },
    ],
    [
      'effective replacement',
      (value: ReturnType<typeof receipt>) => {
        value.effectiveBasis.ledgerRecordIds = [11];
      },
    ],
  ] as const)(
    'preserves the frozen command after a mismatched %s receipt',
    async (_label, change) => {
      const calls = installApi({
        publish: () => {
          const value = receipt();
          change(value);
          return response(value);
        },
      });
      const rendered = renderReview();
      const user = userEvent.setup();
      await fillCorrection(user);
      await user.click(screen.getByRole('button', { name: 'Restate published actuals' }));
      expect(
        await screen.findByText(/Correction receipt does not match the frozen command/)
      ).toBeVisible();
      expect(
        screen.queryByRole('heading', { name: 'Correction published' })
      ).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry same correction' })).toBeEnabled();
      expect(
        screen.queryByRole('button', { name: 'Change correction and preview again' })
      ).not.toBeInTheDocument();
      expect(rendered.onPendingChange).toHaveBeenLastCalledWith(true);
      expect(publishCalls(calls)).toHaveLength(1);
      expect(rendered.onRefreshBasis).not.toHaveBeenCalled();
    }
  );

  it('keeps publication acknowledged after readback refresh failure without automatic recompute', async () => {
    const calls = installApi();
    const rendered = renderReview(
      vi.fn(async () => {
        throw new Error('Readback offline.');
      })
    );
    const user = userEvent.setup();
    await fillCorrection(user);
    await user.click(screen.getByRole('button', { name: 'Restate published actuals' }));
    expect(await screen.findByRole('heading', { name: 'Correction published' })).toBeVisible();
    expect(
      await screen.findByText(
        'Correction published. Refresh the published basis to load its latest state.'
      )
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Retry same correction' })).not.toBeInTheDocument();
    expect(sessionStorage.getItem('actuals-restatement:v1:7')).toBeNull();
    expect(rendered.onPendingChange).toHaveBeenLastCalledWith(false);
    expect(
      calls.filter((call) => call.init?.method === 'POST').map((call) => call.url.pathname)
    ).toEqual([
      '/api/funds/7/imports/actuals/dry-run',
      '/api/funds/7/imports/actuals/restatements/dry-run',
      '/api/funds/7/imports/actuals/restatements/publish',
    ]);
  });
});
