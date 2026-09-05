import React from 'react';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActualsPublicationPanel } from '@/components/lp-reporting/ActualsPublicationPanel';

const LEDGER_TEXT =
  'event_type,effective_date,amount,currency,company_name,vehicle_slug,deployment_category,description,expense_category,distribution_type,recallable,external_ref\n' +
  'lp_capital_call,2026-09-04,100.00,USD,,,,,,,false,row-1\n';
const LEDGER_HASH = '210517a4dbc8ad8fce22f5db025935bba70bea1f7dfcb72aaa25fddb623636bc';

const totals = {
  settledPaidIn: '100.000000',
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
};

const preview = {
  contractVersion: 'actuals-preview-response/1.0.0',
  templateVersion: 'actuals-ledger/1.0.0',
  asOfDate: '2026-09-04',
  sanitizedFileName: 'ledger.csv',
  byteCount: 215,
  payloadSha256: LEDGER_HASH,
  canonicalRowsHash: 'b'.repeat(64),
  previewHash: 'c'.repeat(64),
  rowCounts: { total: 1, valid: 1, invalid: 0, duplicateInFile: 0, alreadyImported: 0 },
  fileTotals: totals,
  netNewEffectTotals: totals,
  categoryCoverage: 'complete',
  canPublish: true,
  issues: [],
  rows: [],
} as const;

const noHead = { contractVersion: 'financial-facts-latest-reference/1.0.0', head: null } as const;
const currentHead = {
  contractVersion: 'financial-facts-latest-reference/1.0.0',
  head: {
    snapshotId: 40,
    asOfDate: '2026-08-31',
    knowledgeCutoff: '2026-09-01T00:00:00.000Z',
    policyVersion: 'financial-facts-policy/1.4.0',
    payloadSchemaId: 'financial-facts-payload/5',
    snapshotInputHash: 'f'.repeat(64),
    supersedesSnapshotId: null,
    basisRef: null,
    consumerEvaluations: [],
  },
} as const;
const publishedHash = 'd'.repeat(64);
const publishReceipt = {
  contractVersion: 'actuals-pilot-publish-receipt/1.0.0',
  operationHash: 'e'.repeat(64),
  fundId: 7,
  asOfDate: '2026-09-04',
  coverage: { ledger: 'inception_to_date', priorFactsSnapshotId: null },
  admitted: {
    ledger: {
      sourceArtifactId: 1,
      payloadSha256: LEDGER_HASH,
      canonicalRowsHash: 'b'.repeat(64),
      previewHash: 'c'.repeat(64),
      approvedRowIds: [1],
      approvedCount: 1,
    },
    valuation: null,
    importBatchId: '11111111-1111-4111-8111-111111111111',
  },
  facts: {
    policyVersion: 'financial-facts-policy/1.4.0',
    payloadSchemaId: 'financial-facts-payload/5',
    supersedesSnapshotId: null,
    knowledgeCutoff: '2026-09-04T12:00:00.000Z',
    snapshotId: 41,
    snapshotInputHash: publishedHash,
    etag: `"financial-facts:41:${publishedHash}"`,
  },
  basisRef: {
    schemaId: 'financial-facts-basis-ref/1.0.0',
    fundId: 7,
    snapshotId: 41,
    snapshotInputHash: publishedHash,
    sourceFactsInputHash: publishedHash,
    policyVersion: 'financial-facts-policy/1.4.0',
    asOfDate: '2026-09-04',
    knowledgeCutoff: '2026-09-04T12:00:00.000Z',
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

function ledgerPreviewRow(rowNumber: number) {
  return {
    rowNumber,
    sourceExternalRef: `external-${rowNumber}`,
    status: 'valid' as const,
    eventType: 'settled_contribution' as const,
    effectiveDate: '2026-09-04',
    companyLabel: null,
    vehicleLabel: null,
    canonicalAmount: '100.000000',
    rowSourceHash: '1'.repeat(64),
    rowContentHash: '2'.repeat(64),
    issues: [],
  };
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ActualsPublicationPanel fundId={7} />
    </QueryClientProvider>
  );
}

async function advanceToPublish(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('heading', { name: 'Publish fixed-template actuals' });
  const reportingCutoff = screen.getByLabelText('Reporting cutoff');
  expect(reportingCutoff).toHaveValue('');
  expect(reportingCutoff).toHaveClass('min-h-11');
  await user.type(reportingCutoff, '2026-09-04');
  const ledgerTemplate = screen.getByRole('link', { name: 'Download ledger template' });
  const valuationTemplate = screen.getByRole('link', { name: 'Download valuation template' });
  expect(ledgerTemplate).toHaveAttribute('href', '/templates/actuals-ledger-1.0.0.csv');
  expect(valuationTemplate).toHaveAttribute('href', '/templates/actuals-valuation-1.0.0.csv');
  expect(ledgerTemplate).toHaveClass('min-h-11');
  expect(valuationTemplate).toHaveClass('min-h-11');
  await user.upload(
    screen.getByLabelText('Ledger CSV'),
    new File([LEDGER_TEXT], 'ledger.csv', { type: 'text/csv' })
  );
  expect(screen.getByLabelText('Ledger CSV')).toHaveClass('min-h-11');
  expect(screen.getByLabelText('Valuation CSV (optional)')).toHaveClass('min-h-11');
  expect(screen.getByRole('button', { name: 'Preview actuals' })).toHaveClass('min-h-11');
  await user.click(screen.getByRole('button', { name: 'Preview actuals' }));
  const previewSummary = await screen.findByTestId('actuals-preview-summary');
  expect(document.activeElement).toBe(previewSummary);
  expect(screen.getByTestId('actuals-predecessor-evidence')).toHaveTextContent(
    'Predecessor: no financial-facts head.'
  );
  await user.type(screen.getByLabelText('Coverage evidence note'), 'Complete ledger export.');
  expect(screen.getByRole('button', { name: 'Publish actuals' })).toHaveClass('min-h-11');
}

describe('ActualsPublicationPanel lifecycle', () => {
  beforeEach(() => {
    sessionStorage.clear();
    let uuidCounter = 0;
    vi.stubGlobal('crypto', {
      subtle: webcrypto.subtle,
      randomUUID: () => `11111111-1111-4111-8111-${String(++uuidCounter).padStart(12, '0')}`,
    });
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it('persists metadata only and retries identical command after reload and exact reselection', async () => {
    window.history.replaceState(null, '', '/dashboard');
    window.history.pushState(null, '', '/lp-reporting/imports');
    const publishCalls: Array<{ body: string; key: string; ifMatch: string }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('latest-reference')) return response(noHead);
      if (url.includes('/actuals/dry-run')) return response(preview);
      if (url.includes('/actuals/publish')) {
        const headers = init?.headers as Record<string, string>;
        publishCalls.push({
          body: String(init?.body),
          key: headers['Idempotency-Key'],
          ifMatch: headers['If-Match'],
        });
        return response({ code: 'MUTATION_OUTCOME_UNKNOWN', message: 'Outcome unknown.' }, 503);
      }
      return response({ code: 'UNEXPECTED', message: url }, 500);
    });
    const user = userEvent.setup();
    const first = renderPanel();
    await advanceToPublish(user);
    await user.click(screen.getByRole('button', { name: 'Publish actuals' }));

    await screen.findByTestId('actuals-unknown-outcome');
    expect(screen.getByRole('button', { name: 'Retry publish' })).toBeEnabled();
    expect(screen.getByLabelText('Ledger CSV')).toBeDisabled();
    expect(screen.getByLabelText('Valuation CSV (optional)')).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'Download ledger template' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Discard command' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reconfirm' })).toBeNull();
    const dashboardLink = document.createElement('a');
    dashboardLink.href = '/dashboard';
    const dashboardClick = vi.fn();
    dashboardLink.addEventListener('click', dashboardClick);
    document.body.appendChild(dashboardLink);
    await user.click(dashboardLink);
    expect(dashboardClick).not.toHaveBeenCalled();
    window.history.back();
    await waitFor(() => expect(window.location.pathname).toBe('/lp-reporting/imports'));
    const storedKey = Object.keys(sessionStorage).find((key) =>
      key.startsWith('actuals-publish:v1:7:')
    );
    expect(storedKey).toMatch(/^actuals-publish:v1:7:[a-f0-9]{64}$/);
    const stored = storedKey ? (sessionStorage.getItem(storedKey) ?? '') : '';
    expect(stored).toContain(LEDGER_HASH);
    expect(stored).not.toContain(LEDGER_TEXT);
    expect(stored).not.toContain(btoa(LEDGER_TEXT));

    first.unmount();
    renderPanel();
    await screen.findByTestId('actuals-recovery-notice');
    await user.upload(
      screen.getByLabelText('Ledger CSV'),
      new File([`${LEDGER_TEXT}changed`], 'ledger.csv', { type: 'text/csv' })
    );
    expect(await screen.findByTestId('actuals-local-error')).toHaveTextContent(
      'Ledger file hash does not match frozen command'
    );
    expect(screen.getByRole('button', { name: 'Retry publish' })).toBeDisabled();
    await user.upload(
      screen.getByLabelText('Ledger CSV'),
      new File([LEDGER_TEXT], 'ledger.csv', { type: 'text/csv' })
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Retry publish' })).toBeEnabled()
    );
    await user.click(screen.getByRole('button', { name: 'Retry publish' }));
    await waitFor(() => expect(publishCalls).toHaveLength(2));
    expect(publishCalls[1]).toEqual(publishCalls[0]);
  });

  it('mints one frozen command when publish is clicked twice during identity hashing', async () => {
    const publishCalls: Array<{ key: string; body: string }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('latest-reference')) return response(noHead);
      if (url.includes('/actuals/dry-run')) return response(preview);
      if (url.includes('/actuals/publish')) {
        const headers = init?.headers as Record<string, string>;
        publishCalls.push({
          key: headers['Idempotency-Key'],
          body: String(init?.body),
        });
        return response({ code: 'MUTATION_OUTCOME_UNKNOWN', message: 'Outcome unknown.' }, 503);
      }
      return response({}, 500);
    });

    const user = userEvent.setup();
    renderPanel();
    await advanceToPublish(user);

    const originalRandomUUID = crypto.randomUUID;
    const originalDigest = webcrypto.subtle.digest.bind(webcrypto.subtle);
    let releaseDigest!: () => void;
    const digestGate = new Promise<void>((resolve) => {
      releaseDigest = resolve;
    });
    vi.stubGlobal('crypto', {
      randomUUID: originalRandomUUID,
      subtle: {
        digest: async (...args: Parameters<SubtleCrypto['digest']>) => {
          await digestGate;
          return originalDigest(...args);
        },
      },
    });

    const publishButton = screen.getByRole('button', { name: 'Publish actuals' });
    fireEvent.click(publishButton);
    fireEvent.click(publishButton);
    releaseDigest();

    expect(await screen.findByTestId('actuals-unknown-outcome')).toBeVisible();
    expect(publishCalls).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Discard command' })).toBeNull();

    const storedKey = Object.keys(sessionStorage).find((key) =>
      key.startsWith('actuals-publish:v1:7:')
    );
    expect(storedKey).toBeDefined();
    const storedCommand = JSON.parse(sessionStorage.getItem(storedKey!) ?? 'null') as {
      idempotencyKey?: string;
    };
    expect(storedCommand.idempotencyKey).toBe(publishCalls[0]?.key);
  });

  it('rejects frozen command metadata when expected facts head is tampered', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('latest-reference')) return response(noHead);
      if (url.includes('/actuals/dry-run')) return response(preview);
      if (url.includes('/actuals/publish')) {
        return response({ code: 'MUTATION_OUTCOME_UNKNOWN', message: 'Outcome unknown.' }, 503);
      }
      return response({}, 500);
    });

    const user = userEvent.setup();
    const first = renderPanel();
    await advanceToPublish(user);
    await user.click(screen.getByRole('button', { name: 'Publish actuals' }));
    await screen.findByTestId('actuals-unknown-outcome');

    const storedKey = Object.keys(sessionStorage).find((key) =>
      key.startsWith('actuals-publish:v1:7:')
    );
    const storedCommand = JSON.parse(sessionStorage.getItem(storedKey!) ?? 'null') as Record<
      string,
      unknown
    >;
    storedCommand['ifMatch'] = `"financial-facts:99:${'9'.repeat(64)}"`;
    sessionStorage.setItem(storedKey!, JSON.stringify(storedCommand));

    first.unmount();
    renderPanel();
    await screen.findByTestId('actuals-recovery-notice');
    await user.upload(
      screen.getByLabelText('Ledger CSV'),
      new File([LEDGER_TEXT], 'ledger.csv', { type: 'text/csv' })
    );

    expect(await screen.findByTestId('actuals-local-error')).toHaveTextContent(
      'Reselected files do not reconstruct frozen command identity.'
    );
    expect(screen.getByRole('button', { name: 'Retry publish' })).toBeDisabled();
  });

  it('shows current predecessor snapshot evidence before publication', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('latest-reference')) return response(currentHead);
      if (url.includes('/actuals/dry-run')) return response(preview);
      return response({}, 500);
    });

    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole('heading', { name: 'Publish fixed-template actuals' });
    await user.type(screen.getByLabelText('Reporting cutoff'), '2026-09-04');
    await user.upload(
      screen.getByLabelText('Ledger CSV'),
      new File([LEDGER_TEXT], 'ledger.csv', { type: 'text/csv' })
    );
    await user.click(screen.getByRole('button', { name: 'Preview actuals' }));

    const predecessor = await screen.findByTestId('actuals-predecessor-evidence');
    expect(predecessor).toHaveTextContent('Predecessor snapshot 40');
    expect(predecessor).toHaveTextContent('2026-08-31');
    expect(predecessor).toHaveTextContent('f'.repeat(64));
    expect(predecessor).toHaveAttribute('aria-busy', 'false');
    expect(predecessor).toHaveClass('break-all', 'whitespace-normal');
  });

  it('clears prior-fund receipt scope and never queries new fund with old snapshot', async () => {
    const requestedUrls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes('latest-reference')) return response(noHead);
      if (url.includes('/actuals/dry-run')) return response(preview);
      if (url.includes('/api/funds/7/imports/actuals/publish')) {
        return response(publishReceipt, 201);
      }
      if (url.includes('/api/funds/7/actuals/metrics')) return response(unavailableMetrics);
      return response({}, 500);
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    });
    const panel = (fundId: number) => (
      <QueryClientProvider client={queryClient}>
        <ActualsPublicationPanel key={fundId} fundId={fundId} />
      </QueryClientProvider>
    );
    const view = render(panel(7));
    const user = userEvent.setup();
    await advanceToPublish(user);
    await user.click(screen.getByRole('button', { name: 'Publish actuals' }));
    await screen.findByTestId('actuals-publish-receipt');

    view.rerender(panel(8));
    await waitFor(() =>
      expect(requestedUrls).toContain('/api/funds/8/financial-facts/latest-reference')
    );
    expect(screen.queryByTestId('actuals-publish-receipt')).toBeNull();
    expect(
      requestedUrls.some((url) => url === '/api/funds/8/actuals/metrics?factsSnapshotId=41')
    ).toBe(false);
  });

  it('renders cent-exact totals and pages issue links to the referenced external row', async () => {
    const issue = {
      code: 'INVALID_VALUE' as const,
      rowNumber: 101,
      column: 'amount',
      severity: 'error' as const,
      message: 'Amount is invalid.',
    };
    const pagedPreview = {
      ...preview,
      rowCounts: {
        total: 101,
        valid: 100,
        invalid: 1,
        duplicateInFile: 0,
        alreadyImported: 0,
      },
      fileTotals: { ...totals, settledPaidIn: '9007199254740993.000000' },
      netNewEffectTotals: { ...totals, settledPaidIn: '1234.560000' },
      issues: [issue],
      rows: Array.from({ length: 101 }, (_, index) => ledgerPreviewRow(index + 1)),
      canPublish: false,
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('latest-reference')) return response(noHead);
      if (url.includes('/actuals/dry-run')) return response(pagedPreview);
      return response({}, 500);
    });

    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole('heading', { name: 'Publish fixed-template actuals' });
    await user.type(screen.getByLabelText('Reporting cutoff'), '2026-09-04');
    await user.upload(
      screen.getByLabelText('Ledger CSV'),
      new File([LEDGER_TEXT], 'ledger.csv', { type: 'text/csv' })
    );
    await user.click(screen.getByRole('button', { name: 'Preview actuals' }));

    expect(await screen.findByText('$9,007,199,254,740,993.00')).toBeVisible();
    expect(screen.getByText('$1,234.56')).toBeVisible();
    expect(screen.getByText('external-1')).toBeVisible();
    expect(screen.queryByTestId('actuals-preview-ledger-row-101')).toBeNull();
    expect(screen.getByText('Page 1 of 2 · rows 1–100 of 101')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Ledger row 101 · amount' }));
    const referencedRow = await screen.findByTestId('actuals-preview-ledger-row-101');
    expect(referencedRow).toHaveTextContent('external-101');
    expect(document.activeElement).toBe(referencedRow);
    expect(screen.queryByTestId('actuals-preview-ledger-row-1')).toBeNull();
    expect(screen.getByText('Page 2 of 2 · rows 101–101 of 101')).toBeVisible();
  });

  it('persists uncertain recovery state before a pending POST and enables discard after proven refusal', async () => {
    const publishCalls: Array<{ key: string; body: string }> = [];
    let resolvePublish!: (value: Response) => void;
    const pendingPublish = new Promise<Response>((resolve) => {
      resolvePublish = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('latest-reference')) return response(noHead);
      if (url.includes('/actuals/dry-run')) return response(preview);
      if (url.includes('/actuals/publish')) {
        const headers = init?.headers as Record<string, string>;
        publishCalls.push({
          key: headers['Idempotency-Key'],
          body: String(init?.body),
        });
        return pendingPublish;
      }
      return response({}, 500);
    });

    const user = userEvent.setup();
    renderPanel();
    await advanceToPublish(user);
    await user.click(screen.getByRole('button', { name: 'Publish actuals' }));

    await waitFor(() => expect(publishCalls).toHaveLength(1));
    expect(await screen.findByTestId('actuals-unknown-outcome')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Publish fixed-template actuals' })).toHaveAttribute(
      'aria-busy',
      'true'
    );
    expect(screen.getByTestId('actuals-command-actions')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('button', { name: 'Discard command' })).toBeNull();
    expect(screen.getByLabelText('Reporting cutoff')).toBeDisabled();
    expect(screen.getByLabelText('Ledger CSV')).toBeDisabled();
    expect(screen.getByLabelText('Valuation CSV (optional)')).toBeDisabled();

    const storedKey = Object.keys(sessionStorage).find((key) =>
      key.startsWith('actuals-publish:v1:7:')
    );
    expect(storedKey).toBeDefined();
    const storedCommand = JSON.parse(sessionStorage.getItem(storedKey!) ?? 'null') as {
      idempotencyKey?: string;
      status?: string;
    };
    expect(storedCommand).toMatchObject({
      idempotencyKey: publishCalls[0]?.key,
      status: 'uncertain',
    });

    const dashboardLink = document.createElement('a');
    dashboardLink.href = '/dashboard';
    const dashboardClick = vi.fn();
    dashboardLink.addEventListener('click', dashboardClick);
    document.body.appendChild(dashboardLink);
    await user.click(dashboardLink);
    expect(dashboardClick).not.toHaveBeenCalled();

    resolvePublish(
      response({ code: 'TRANSACTION_UNSUPPORTED', message: 'Transactions unavailable.' }, 503)
    );
    expect(await screen.findByTestId('actuals-publish-error')).toHaveTextContent(
      'TRANSACTION_UNSUPPORTED'
    );
    expect(screen.getByRole('button', { name: 'Discard command' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Discard command' })).toHaveClass('min-h-11');
  });

  it('fails closed on malformed stored metadata until explicit discard', async () => {
    sessionStorage.setItem(`actuals-publish:v1:7:${'a'.repeat(64)}`, '{broken');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(noHead));
    const user = userEvent.setup();
    renderPanel();

    expect(await screen.findByTestId('actuals-corrupt-command')).toHaveTextContent(
      'FROZEN_COMMAND_METADATA_INVALID'
    );
    expect(screen.queryByRole('button', { name: 'Preview actuals' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Discard command' }));
    expect(screen.getByRole('button', { name: 'Preview actuals' })).toBeDisabled();
    expect(sessionStorage.length).toBe(0);
  });

  it('renders server refusal code and permits explicit discard', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('latest-reference')) return response(noHead);
      if (url.includes('/actuals/dry-run')) return response(preview);
      return response(
        { code: 'VALUATION_COVERAGE_INCOMPLETE', message: 'Valuation roster incomplete.' },
        422
      );
    });
    const user = userEvent.setup();
    renderPanel();
    await advanceToPublish(user);
    await user.click(screen.getByRole('button', { name: 'Publish actuals' }));

    expect(await screen.findByTestId('actuals-publish-error')).toHaveTextContent(
      'VALUATION_COVERAGE_INCOMPLETE'
    );
    expect(screen.getByRole('button', { name: 'Discard command' })).toBeEnabled();
  });

  it('freezes a 201 invalid receipt as uncertain and retries exact command', async () => {
    const publishCalls: Array<{ body: string; key: string; ifMatch: string }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('latest-reference')) return response(noHead);
      if (url.includes('/actuals/dry-run')) return response(preview);
      if (url.includes('/actuals/publish')) {
        const headers = init?.headers as Record<string, string>;
        publishCalls.push({
          body: String(init?.body),
          key: headers['Idempotency-Key'],
          ifMatch: headers['If-Match'],
        });
        return response({ contractVersion: 'invalid-receipt' }, 201);
      }
      return response({}, 500);
    });
    const user = userEvent.setup();
    renderPanel();
    await advanceToPublish(user);
    await user.click(screen.getByRole('button', { name: 'Publish actuals' }));

    expect(await screen.findByTestId('actuals-unknown-outcome')).toBeVisible();
    expect(screen.getByTestId('actuals-publish-error')).toHaveTextContent('CONTRACT_PARSE_ERROR');
    expect(screen.queryByRole('button', { name: 'Discard command' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Retry publish' }));
    await waitFor(() => expect(publishCalls).toHaveLength(2));
    expect(publishCalls[1]).toEqual(publishCalls[0]);
  });

  it('freezes an unrecognized gateway 503 and retries exact command', async () => {
    const publishCalls: Array<{ body: string; key: string; ifMatch: string }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('latest-reference')) return response(noHead);
      if (url.includes('/actuals/dry-run')) return response(preview);
      if (url.includes('/actuals/publish')) {
        const headers = init?.headers as Record<string, string>;
        publishCalls.push({
          body: String(init?.body),
          key: headers['Idempotency-Key'],
          ifMatch: headers['If-Match'],
        });
        return new Response('upstream reset', { status: 503 });
      }
      return response({}, 500);
    });
    const user = userEvent.setup();
    renderPanel();
    await advanceToPublish(user);
    await user.click(screen.getByRole('button', { name: 'Publish actuals' }));

    expect(await screen.findByTestId('actuals-unknown-outcome')).toBeVisible();
    expect(screen.getByTestId('actuals-publish-error')).toHaveTextContent('UNKNOWN');
    expect(screen.queryByRole('button', { name: 'Discard command' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Retry publish' }));
    await waitFor(() => expect(publishCalls).toHaveLength(2));
    expect(publishCalls[1]).toEqual(publishCalls[0]);
  });

  it('renders preview refusal codes and withholds publish action', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('latest-reference')) return response(noHead);
      if (url.includes('/actuals/dry-run')) {
        return response({
          ...preview,
          canPublish: false,
          issues: [
            {
              code: 'FUND_LEDGER_NOT_PILOT_OWNED',
              rowNumber: 1,
              column: null,
              severity: 'error',
              message: 'Ledger contains rows outside pilot ownership.',
            },
          ],
        });
      }
      return response({}, 500);
    });
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole('heading', { name: 'Publish fixed-template actuals' });
    await user.type(screen.getByLabelText('Reporting cutoff'), '2026-09-04');
    await user.upload(
      screen.getByLabelText('Ledger CSV'),
      new File([LEDGER_TEXT], 'ledger.csv', { type: 'text/csv' })
    );
    await user.click(screen.getByRole('button', { name: 'Preview actuals' }));

    expect(await screen.findByText('FUND_LEDGER_NOT_PILOT_OWNED')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Publish actuals' })).toBeNull();
  });

  it('moves focus to publication receipt after successful publish', async () => {
    let resolveMetrics!: (value: Response) => void;
    const pendingMetrics = new Promise<Response>((resolve) => {
      resolveMetrics = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('latest-reference')) return response(noHead);
      if (url.includes('/actuals/dry-run')) return response(preview);
      if (url.includes('/actuals/publish')) return response(publishReceipt, 201);
      if (url.includes('/actuals/metrics')) return pendingMetrics;
      return response({}, 500);
    });
    const user = userEvent.setup();
    renderPanel();
    await advanceToPublish(user);
    await user.click(screen.getByRole('button', { name: 'Publish actuals' }));

    const receiptLine = await screen.findByTestId('actuals-publish-receipt');
    expect(document.activeElement).toBe(receiptLine);
    expect(screen.getByTestId('actuals-publish-receipt-identity')).toHaveClass(
      'break-all',
      'whitespace-normal'
    );
    expect(screen.getByTestId('actuals-metrics-readback')).toHaveAttribute('aria-busy', 'true');
    resolveMetrics(response(unavailableMetrics));
    await waitFor(() =>
      expect(screen.getByTestId('actuals-metrics-readback')).toHaveAttribute('aria-busy', 'false')
    );
  });

  it('rotates key only after 412 reconfirmation and adopts current head If-Match', async () => {
    let latestCalls = 0;
    let resolveRefetch!: (value: Response) => void;
    const pendingRefetch = new Promise<Response>((resolve) => {
      resolveRefetch = resolve;
    });
    const publishCalls: Array<{ key: string; ifMatch: string }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('latest-reference')) {
        latestCalls += 1;
        return latestCalls === 1 ? response(noHead) : pendingRefetch;
      }
      if (url.includes('/actuals/dry-run')) return response(preview);
      if (url.includes('/actuals/publish')) {
        const headers = init?.headers as Record<string, string>;
        publishCalls.push({ key: headers['Idempotency-Key'], ifMatch: headers['If-Match'] });
        return response({ code: 'PRECONDITION_FAILED', message: 'Head moved.' }, 412);
      }
      return response({}, 500);
    });
    const user = userEvent.setup();
    renderPanel();
    await advanceToPublish(user);
    await user.click(screen.getByRole('button', { name: 'Publish actuals' }));
    await screen.findByTestId('actuals-precondition-failed');
    const storageKeyBeforeReconfirm = Object.keys(sessionStorage).find((key) =>
      key.startsWith('actuals-publish:v1:7:')
    );
    await user.click(screen.getByRole('button', { name: 'Reconfirm' }));
    await waitFor(() => expect(latestCalls).toBe(2));
    expect(screen.getByTestId('actuals-command-actions')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Reconfirm' })).toHaveClass('min-h-11');
    resolveRefetch(response(currentHead));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Retry publish' })).toBeEnabled()
    );
    const storageKeyAfterReconfirm = Object.keys(sessionStorage).find((key) =>
      key.startsWith('actuals-publish:v1:7:')
    );
    expect(storageKeyAfterReconfirm).not.toBe(storageKeyBeforeReconfirm);
    await user.click(screen.getByRole('button', { name: 'Retry publish' }));
    await waitFor(() => expect(publishCalls).toHaveLength(2));

    expect(publishCalls[1]?.key).not.toBe(publishCalls[0]?.key);
    expect(publishCalls[0]?.ifMatch).toBe('"financial-facts:none"');
    expect(publishCalls[1]?.ifMatch).toBe(`"financial-facts:40:${'f'.repeat(64)}"`);
  });
});
