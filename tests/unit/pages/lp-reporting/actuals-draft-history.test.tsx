import React from 'react';
import { createHash, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  ActualsDraftHistory,
  type ActualsDraftHistoryProps,
} from '@/components/lp-reporting/ActualsDraftHistory';
import { ActualsPublicationPanel } from '@/components/lp-reporting/ActualsPublicationPanel';
import {
  freezeDraftCommand,
  recoverDraftCommand,
} from '@/components/lp-reporting/actuals-draft-command';
import type {
  ActualsDraftDetailResponseV1,
  ActualsDraftHistoryResponseV1,
  ActualsDraftRevisionV1,
  ActualsDraftSaveRequestV1,
  ActualsDraftSaveResponseV1,
} from '@shared/contracts/lp-reporting/actuals-draft.contract';

// Browser behavior with a mocked HTTP boundary and synthetic fixtures only.
// Contract parsing and SHA-256 remain real; these tests make no database claim.
const BASE_URL = '/api/funds/7/imports/actuals/draft-revisions';
const clients: QueryClient[] = [];
type DraftFiles = Awaited<ReturnType<ActualsDraftHistoryProps['prepareFiles']>>;
type SentSave = { body: string; key: string; ifMatch: string };

function ledgerText(version = 1) {
  return (
    'event_type,effective_date,amount,currency,external_ref\n' +
    `lp_capital_call,,${(100 + 25 * (version - 1)).toFixed(2)},USD,synthetic-draft-only\n`
  );
}

const valuationText = 'company_name,fair_value,currency\nSynthetic Company,50.00,USD\n';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const revisionHash = (version: number) => version.toString(16).padStart(64, '0');

function files(version = 1, valuation = false): DraftFiles {
  return {
    ledger: {
      templateVersion: 'actuals-ledger/1.0.0',
      fileName: `synthetic-ledger-v${version}.csv`,
      payload: btoa(ledgerText(version)),
    },
    valuation: valuation
      ? {
          templateVersion: 'actuals-valuation/1.0.0',
          fileName: 'synthetic-valuation.csv',
          payload: btoa(valuationText),
        }
      : null,
  };
}

function revision(
  version = 1,
  overrides: Partial<ActualsDraftRevisionV1> = {}
): ActualsDraftRevisionV1 {
  return {
    fundId: 7,
    revision: version,
    revisionHash: revisionHash(version),
    etag: `"actuals-draft:7:${version}:${revisionHash(version)}"`,
    priorRevision: version === 1 ? null : version - 1,
    priorRevisionHash: version === 1 ? null : revisionHash(version - 1),
    classification: 'provisional',
    asOfDate: null,
    sourceNote: `Synthetic source version ${version}`,
    correctionReason: version === 1 ? 'Preserve incomplete source' : 'Correct source amount',
    createdBy: 42,
    createdAt: `2026-09-08T12:0${version}:00.000Z`,
    ledger: {
      fileName: files(version).ledger.fileName,
      templateVersion: 'actuals-ledger/1.0.0',
      payloadSha256: hash(ledgerText(version)),
      byteCount: new TextEncoder().encode(ledgerText(version)).byteLength,
      sourceArtifactId: 100 + version,
      purgeAfter: '2026-10-08T12:00:00.000Z',
    },
    valuation: null,
    ...overrides,
  };
}

function history(
  revisions: ActualsDraftRevisionV1[] = [],
  fundId = 7
): ActualsDraftHistoryResponseV1 {
  const latest = revisions[0];
  return {
    contractVersion: 'actuals-draft-history/1.0.0',
    fundId,
    head: latest
      ? { revision: latest.revision, revisionHash: latest.revisionHash, etag: latest.etag }
      : null,
    revisions,
    nextBeforeRevision: null,
  };
}

function receipt(
  row: ActualsDraftRevisionV1,
  command: SentSave,
  replayed = false
): ActualsDraftSaveResponseV1 {
  return {
    contractVersion: 'actuals-draft-save-result/1.0.0',
    idempotencyKey: command.key,
    requestHash: hash(command.body),
    revision: row,
    replayed,
  };
}

function detail(withValuation = false): ActualsDraftDetailResponseV1 {
  const row = revision();
  if (withValuation) {
    row.valuation = {
      templateVersion: 'actuals-valuation/1.0.0',
      fileName: 'synthetic-valuation.csv',
      payloadSha256: hash(valuationText),
      byteCount: new TextEncoder().encode(valuationText).byteLength,
      sourceArtifactId: 201,
      purgeAfter: '2026-10-08T12:00:00.000Z',
    };
  }
  return {
    contractVersion: 'actuals-draft-detail/1.0.0',
    revision: row,
    ledger: { payload: files().ledger.payload, payloadAvailable: true },
    valuation: withValuation ? { payload: btoa(valuationText), payloadAvailable: true } : null,
  };
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function captureSave(init: RequestInit | undefined): SentSave {
  const headers = new Headers(init?.headers);
  return {
    body: String(init?.body),
    key: headers.get('Idempotency-Key') ?? '',
    ifMatch: headers.get('If-Match') ?? '',
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function queryClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  clients.push(client);
  return client;
}

function renderHistory(overrides: Partial<ActualsDraftHistoryProps> = {}) {
  const client = queryClient();
  let props: ActualsDraftHistoryProps = {
    fundId: 7,
    asOfDate: '',
    disabled: false,
    hasLedger: true,
    prepareFiles: vi.fn(async () => files()),
    onLockChange: vi.fn(),
    onPendingChange: vi.fn(),
    onRestore: vi.fn(),
    ...overrides,
  };
  const component = () => (
    <QueryClientProvider client={client}>
      <ActualsDraftHistory key={props.fundId} {...props} />
    </QueryClientProvider>
  );
  const view = render(component());
  return {
    ...view,
    client,
    initialProps: props,
    update(next: Partial<ActualsDraftHistoryProps>) {
      props = { ...props, ...next };
      view.rerender(component());
    },
  };
}

async function openHistory(client: QueryClient, fundId = 7) {
  const element = screen.getByText(/^Draft versions and corrections/).closest('details');
  if (!element) throw new Error('Draft history details are missing');
  element.open = true;
  fireEvent(element, new Event('toggle'));
  await screen.findByRole('region', { name: 'Actuals draft history' });
  await waitFor(() =>
    expect(
      client.getQueryData(['lp-reporting', 'actuals-draft-revisions', fundId, null])
    ).toBeDefined()
  );
}

function fillNotes(version = 1) {
  fireEvent.change(screen.getByLabelText('Draft source note'), {
    target: { value: `Synthetic source version ${version}` },
  });
  fireEvent.change(screen.getByLabelText('Reason for this version'), {
    target: { value: version === 1 ? 'Preserve incomplete source' : 'Correct source amount' },
  });
}

describe('ActualsDraftHistory mocked HTTP lifecycle', () => {
  beforeEach(() => {
    sessionStorage.clear();
    let sequence = 0;
    vi.stubGlobal('crypto', {
      subtle: webcrypto.subtle,
      randomUUID: () => `11111111-1111-4111-8111-${String(++sequence).padStart(12, '0')}`,
    });
  });

  afterEach(() => {
    cleanup();
    clients.splice(0).forEach((client) => client.clear());
    sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fetches no history until the native details are opened', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(history()));
    const view = renderHistory();
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'Actuals draft history' })).toBeNull();
    await openHistory(view.client);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      BASE_URL,
      expect.objectContaining({ method: 'GET', cache: 'no-store' })
    );
  });

  it('saves incomplete provisional bytes then binds corrected version 2 to version 1 without hiding its provenance', async () => {
    const saves: SentSave[] = [];
    const rows: ActualsDraftRevisionV1[] = [];
    const prepareFiles = vi.fn(async () => files(saves.length + 1));
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input) !== BASE_URL) throw new Error(`Unexpected mocked URL: ${String(input)}`);
      if (init?.method === 'POST') {
        saves.push(captureSave(init));
        const row = revision(saves.length);
        rows.unshift(row);
        return response(receipt(row, saves.at(-1)!), 201);
      }
      return response(history(rows));
    });
    const view = renderHistory({ prepareFiles });
    await openHistory(view.client);
    fillNotes();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft revision' }));
    await screen.findByText('Saved draft version 1.');
    await screen.findByText('Version 1 · provisional');
    const firstBody = JSON.parse(saves[0]!.body) as ActualsDraftSaveRequestV1;
    expect(firstBody).toMatchObject({
      classification: 'provisional',
      asOfDate: null,
      ledger: files().ledger,
      valuation: null,
    });
    expect(saves[0]!.ifMatch).toBe('"actuals-draft:7:none"');

    fillNotes(2);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save draft revision' })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save draft revision' }));
    await screen.findByText('Saved draft version 2.');
    const versions = await screen.findByRole('list', { name: 'Saved draft versions' });
    expect(within(versions).getAllByRole('listitem')).toHaveLength(2);
    expect(versions).toHaveTextContent('Synthetic source version 1');
    expect(versions).toHaveTextContent('Preserve incomplete source');
    expect(versions).toHaveTextContent(hash(ledgerText()));
    expect(versions).toHaveTextContent('Synthetic source version 2');
    expect(versions).toHaveTextContent(hash(ledgerText(2)));
    expect(saves[1]!.ifMatch).toBe(revision().etag);
    expect(saves[1]!.key).not.toBe(saves[0]!.key);
    expect(JSON.parse(saves[1]!.body).ledger).toEqual(files(2).ledger);
    expect(prepareFiles).toHaveBeenCalledTimes(2);
  });

  it.each([
    'unknown outcome',
    'network error',
    'malformed success receipt',
    'wrong ledger hash',
    'wrong source filename',
    'wrong prior revision',
    'wrong source byte count',
    'wrong revision ETag',
    'wrong idempotency key',
  ])(
    'freezes %s and retries identical key, body and If-Match after latest head changes',
    async (outcome) => {
      const saves: SentSave[] = [];
      const row2 = revision(2);
      const prepareFiles = vi.fn(async () => files(2));
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        if (String(input) !== BASE_URL) throw new Error(`Unexpected mocked URL: ${String(input)}`);
        if (init?.method !== 'POST') return response(history([revision()]));
        saves.push(captureSave(init));
        if (saves.length > 1) return response(receipt(row2, saves.at(-1)!, true));
        if (outcome === 'network error') throw new TypeError('Network request failed');
        if (outcome === 'unknown outcome') {
          return response({ code: 'MUTATION_OUTCOME_UNKNOWN', message: 'Outcome unknown.' }, 503);
        }
        if (outcome === 'malformed success receipt')
          return response({ contractVersion: 'invalid' }, 201);
        const invalid = structuredClone(row2);
        if (outcome === 'wrong ledger hash') invalid.ledger.payloadSha256 = 'f'.repeat(64);
        if (outcome === 'wrong source filename') invalid.ledger.fileName = 'unrelated-source.csv';
        if (outcome === 'wrong source byte count') invalid.ledger.byteCount += 1;
        if (outcome === 'wrong revision ETag') invalid.etag = revision(3).etag;
        if (outcome === 'wrong prior revision') {
          invalid.priorRevision = 9;
          invalid.priorRevisionHash = revisionHash(9);
        }
        const invalidReceipt = receipt(invalid, saves.at(-1)!);
        if (outcome === 'wrong idempotency key') {
          invalidReceipt.idempotencyKey = '22222222-2222-4222-8222-222222222222';
        }
        return response(invalidReceipt, 201);
      });
      const view = renderHistory({ prepareFiles });
      await openHistory(view.client);
      fillNotes(2);
      fireEvent.click(screen.getByRole('button', { name: 'Save draft revision' }));
      await screen.findByText(
        'This save needs confirmation. Retry sends the same files and command.'
      );
      expect(screen.getByLabelText('Draft source note')).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Use version 1' })).toBeDisabled();
      expect(view.initialProps.onLockChange).toHaveBeenLastCalledWith(true);
      expect(view.initialProps.onPendingChange).toHaveBeenLastCalledWith(true);
      await act(async () => {
        view.client.setQueryData(
          ['lp-reporting', 'actuals-draft-revisions', 7, null],
          history([revision(3)])
        );
      });
      view.update({ asOfDate: '2026-09-09', prepareFiles: vi.fn(async () => files(3)) });
      await screen.findByText('Latest saved version: 3.');
      fireEvent.click(screen.getByRole('button', { name: 'Retry draft save' }));
      await screen.findByText('Saved draft version 2.');
      expect(saves).toHaveLength(2);
      expect(saves[1]).toEqual(saves[0]);
      expect(saves[0]!.ifMatch).toBe(revision().etag);
      expect(JSON.parse(saves[0]!.body).asOfDate).toBeNull();
      expect(prepareFiles).toHaveBeenCalledOnce();
      await waitFor(() => expect(view.initialProps.onLockChange).toHaveBeenLastCalledWith(false));
      expect(view.initialProps.onPendingChange).toHaveBeenLastCalledWith(false);
    }
  );

  it('requires explicit successful review after 412 before rotating the key and adopting the current ETag', async () => {
    const saves: SentSave[] = [];
    const refetch = deferred<Response>();
    let historyReads = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      if (init?.method === 'POST') {
        saves.push(captureSave(init));
        return response({ code: 'PRECONDITION_FAILED', message: 'Draft head moved.' }, 412);
      }
      historyReads += 1;
      return historyReads === 1 ? response(history([revision()])) : refetch.promise;
    });
    const view = renderHistory({ prepareFiles: vi.fn(async () => files(2)) });
    await openHistory(view.client);
    fillNotes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Save draft revision' }));
    await screen.findByRole('button', { name: 'Review latest revision' });
    expect(historyReads).toBe(1);
    expect(screen.queryByRole('button', { name: 'Save draft revision' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Review latest revision' }));
    await waitFor(() => expect(historyReads).toBe(2));
    expect(saves).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Save draft revision' })).toBeNull();
    await act(async () => refetch.resolve(response(history([revision(3)]))));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save draft revision' })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save draft revision' }));
    await waitFor(() => expect(saves).toHaveLength(2));
    expect(saves[1]!.key).not.toBe(saves[0]!.key);
    expect(saves[1]!.ifMatch).toBe(revision(3).etag);
    expect(saves[1]!.body).toBe(saves[0]!.body);
  });

  it('keeps the exact pending command retryable when recovery storage removal throws after 412', async () => {
    const saves: SentSave[] = [];
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    window.addEventListener('unhandledrejection', unhandled);
    try {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
        if (init?.method !== 'POST') return response(history([revision()]));
        saves.push(captureSave(init));
        return response({ code: 'PRECONDITION_FAILED', message: 'Draft head moved.' }, 412);
      });
      const prepareFiles = vi.fn(async () => files(2));
      const view = renderHistory({ prepareFiles });
      await openHistory(view.client);
      fillNotes(2);
      const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementationOnce(() => {
        throw new DOMException('Session storage removal unavailable.', 'SecurityError');
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save draft revision' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'This browser cannot update draft recovery storage. Retry the same save.'
      );
      expect(removeItem).toHaveBeenCalledWith('actuals-draft-save:v1:7');
      expect(screen.getByRole('button', { name: 'Retry draft save' })).toBeEnabled();
      expect(screen.queryByRole('button', { name: 'Review latest revision' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Use version 1' })).toBeDisabled();
      expect(view.initialProps.onLockChange).toHaveBeenLastCalledWith(true);
      expect(view.initialProps.onPendingChange).toHaveBeenLastCalledWith(true);
      expect(sessionStorage.getItem('actuals-draft-save:v1:7')).toContain(saves[0]!.key);

      fireEvent.click(screen.getByRole('button', { name: 'Retry draft save' }));
      await screen.findByRole('button', { name: 'Review latest revision' });
      expect(saves).toHaveLength(2);
      expect(saves[1]).toEqual(saves[0]);
      expect(prepareFiles).toHaveBeenCalledOnce();
      expect(sessionStorage.getItem('actuals-draft-save:v1:7')).toBeNull();
      expect(view.initialProps.onPendingChange).toHaveBeenLastCalledWith(false);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
      window.removeEventListener('unhandledrejection', unhandled);
    }
  });

  it.each([401, 403, 404])(
    'preserves an unresolved save through a later %s refusal',
    async (status) => {
      const saves: SentSave[] = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
        if (init?.method !== 'POST') return response(history([revision()]));
        saves.push(captureSave(init));
        if (saves.length === 1) {
          return response({ code: 'MUTATION_OUTCOME_UNKNOWN', message: 'Outcome unknown.' }, 503);
        }
        if (saves.length === 2) {
          return response(
            { code: 'ACCESS_REFUSED', message: `Access temporarily refused: ${status}.` },
            status
          );
        }
        return response(receipt(revision(2), saves.at(-1)!, true));
      });
      const view = renderHistory({ prepareFiles: vi.fn(async () => files(2)) });
      await openHistory(view.client);
      fillNotes(2);
      fireEvent.click(screen.getByRole('button', { name: 'Save draft revision' }));
      await screen.findByText(
        'This save needs confirmation. Retry sends the same files and command.'
      );
      fireEvent.click(screen.getByRole('button', { name: 'Retry draft save' }));
      await screen.findByText(`Access temporarily refused: ${status}.`);
      expect(screen.getByRole('button', { name: 'Use version 1' })).toBeDisabled();
      expect(view.initialProps.onLockChange).toHaveBeenLastCalledWith(true);
      fireEvent.click(screen.getByRole('button', { name: 'Retry draft save' }));
      await screen.findByText('Saved draft version 2.');
      expect(saves).toHaveLength(3);
      expect(saves[1]).toEqual(saves[0]);
      expect(saves[2]).toEqual(saves[0]);
    }
  );

  it('requires explicit recovery cleanup and current-head review after a stored checksum is corrupt', async () => {
    const storageKey = 'actuals-draft-save:v1:7';
    const original = await freezeDraftCommand(
      7,
      {
        contractVersion: 'actuals-draft-save/1.0.0',
        classification: 'provisional',
        asOfDate: null,
        sourceNote: 'Synthetic source version 2',
        correctionReason: 'Correct source amount',
        ...files(2),
      },
      revision().etag
    );
    const corruptHash =
      original.stored.identityHash === 'a'.repeat(64) ? 'b'.repeat(64) : 'a'.repeat(64);
    const corruptMetadata = JSON.stringify({ ...original.stored, identityHash: corruptHash });
    sessionStorage.setItem(storageKey, corruptMetadata);
    expect(recoverDraftCommand(7)).toMatchObject({ corrupt: false, command: { body: null } });

    const saves: SentSave[] = [];
    let latest = 1;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      if (init?.method !== 'POST') return response(history([revision(latest)]));
      saves.push(captureSave(init));
      return response(
        receipt(
          revision(4, { ledger: revision(2).ledger, sourceNote: 'Synthetic source version 2' }),
          saves.at(-1)!
        ),
        201
      );
    });
    const view = renderHistory({ prepareFiles: vi.fn(async () => files(2)) });
    await openHistory(view.client);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry draft save' }));
    expect(await screen.findByText(/checksum.*invalid/i)).toBeInTheDocument();
    expect(saves).toHaveLength(0);
    expect(sessionStorage.getItem(storageKey)).toBe(corruptMetadata);
    expect(view.initialProps.onPendingChange).toHaveBeenLastCalledWith(true);

    const clear = await screen.findByRole('button', { name: 'Clear invalid recovery metadata' });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementationOnce(() => {
      throw new Error('Synthetic storage removal failure');
    });
    fireEvent.click(clear);
    expect(
      await screen.findByText('This browser cannot update draft recovery storage.')
    ).toBeInTheDocument();
    expect(sessionStorage.getItem(storageKey)).toBe(corruptMetadata);
    expect(view.initialProps.onPendingChange).toHaveBeenLastCalledWith(true);
    expect(saves).toHaveLength(0);

    fireEvent.click(clear);
    await waitFor(() => expect(sessionStorage.getItem(storageKey)).toBeNull());
    await waitFor(() => expect(view.initialProps.onPendingChange).toHaveBeenLastCalledWith(false));
    expect(screen.queryByRole('button', { name: 'Retry draft save' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save draft revision' })).toBeNull();
    latest = 3;
    fireEvent.click(await screen.findByRole('button', { name: 'Review latest revision' }));
    const save = await screen.findByRole('button', { name: 'Save draft revision' });
    fillNotes(2);
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await screen.findByText('Saved draft version 4.');
    expect(saves).toHaveLength(1);
    expect(saves[0]!.key).not.toBe(original.stored.key);
    expect(saves[0]!.ifMatch).toBe(revision(3).etag);
  });

  it.each(['matching bytes', 'wrong bytes then matching bytes'])(
    'recovers metadata after reload with %s without changing command identity',
    async (selection) => {
      const saves: SentSave[] = [];
      let headMoved = false;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
        if (init?.method !== 'POST') return response(history([revision(headMoved ? 3 : 1)]));
        saves.push(captureSave(init));
        return saves.length === 1
          ? response({ code: 'MUTATION_OUTCOME_UNKNOWN', message: 'Outcome unknown.' }, 503)
          : response(receipt(revision(2, { classification: 'synthetic' }), saves.at(-1)!, true));
      });
      const first = renderHistory({ prepareFiles: vi.fn(async () => files(2)) });
      await openHistory(first.client);
      fillNotes(2);
      fireEvent.change(screen.getByLabelText('Draft data qualification'), {
        target: { value: 'synthetic' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save draft revision' }));
      await screen.findByText(
        'This save needs confirmation. Retry sends the same files and command.'
      );
      const storedMetadata = Object.values(sessionStorage).join('\n');
      expect(storedMetadata).toContain(saves[0]!.key);
      expect(storedMetadata).not.toContain(files(2).ledger.payload);
      expect(storedMetadata).not.toContain(ledgerText(2));
      first.unmount();
      headMoved = true;
      const reselectFiles = vi.fn(async () => files(selection === 'matching bytes' ? 2 : 3));
      const resumed = renderHistory({
        asOfDate: '2026-09-09',
        hasLedger: false,
        prepareFiles: reselectFiles,
      });
      await openHistory(resumed.client);
      expect(screen.getByLabelText('Draft data qualification')).toHaveValue('synthetic');
      expect(screen.getByLabelText('Draft source note')).toHaveValue('Synthetic source version 2');
      expect(screen.getByLabelText('Reason for this version')).toHaveValue('Correct source amount');
      expect(await screen.findByRole('button', { name: 'Retry draft save' })).toBeDisabled();
      expect(resumed.initialProps.onLockChange).toHaveBeenLastCalledWith(false);
      expect(resumed.initialProps.onPendingChange).toHaveBeenLastCalledWith(true);
      expect(saves).toHaveLength(1);
      resumed.update({ hasLedger: true });
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Retry draft save' })).toBeEnabled()
      );
      fireEvent.click(screen.getByRole('button', { name: 'Retry draft save' }));
      if (selection === 'wrong bytes then matching bytes') {
        expect(await screen.findByRole('alert')).toHaveTextContent(/match|reselect|same/i);
        expect(saves).toHaveLength(1);
        expect(Object.values(sessionStorage).join('\n')).toContain(saves[0]!.key);
        resumed.update({ prepareFiles: vi.fn(async () => files(2)) });
        fireEvent.click(screen.getByRole('button', { name: 'Retry draft save' }));
      }
      await screen.findByText('Saved draft version 2.');
      expect(saves).toHaveLength(2);
      expect(saves[1]).toEqual(saves[0]);
      expect(saves[1]!.ifMatch).toBe(revision().etag);
      expect(JSON.parse(saves[1]!.body).asOfDate).toBeNull();
      expect(Object.values(sessionStorage).join('\n')).not.toContain(saves[0]!.key);
    }
  );

  it('keeps stale-head refusal in place when explicit review fails', async () => {
    let historyReads = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      if (init?.method === 'POST') {
        return response({ code: 'PRECONDITION_FAILED', message: 'Draft head moved.' }, 412);
      }
      historyReads += 1;
      return historyReads === 1
        ? response(history())
        : response({ message: 'Latest history unavailable.' }, 503);
    });
    const view = renderHistory();
    await openHistory(view.client);
    fillNotes();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft revision' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Review latest revision' }));
    await screen.findByText('Latest history unavailable.');
    expect(screen.getByRole('button', { name: 'Review latest revision' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Save draft revision' })).toBeNull();
  });

  it('checks both source hashes before restoring retained ledger and valuation bytes', async () => {
    const saved = detail(true);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      response(String(input) === `${BASE_URL}/1` ? saved : history([saved.revision]))
    );
    const view = renderHistory();
    await openHistory(view.client);
    fireEvent.click(screen.getByRole('button', { name: 'Use version 1' }));
    await screen.findByText('Loaded version 1. Preview again before publishing.');
    expect(view.initialProps.onRestore).toHaveBeenCalledExactlyOnceWith(saved);
    expect(screen.getByLabelText('Draft source note')).toHaveValue(saved.revision.sourceNote);
    expect(screen.getByLabelText('Reason for this version')).toHaveValue(
      'Restore draft version 1.'
    );
  });

  it.each([
    ['ledger', 'expired'],
    ['valuation', 'expired'],
    ['ledger', 'tampered'],
    ['valuation', 'tampered'],
  ] as const)('refuses %s restore when source bytes are %s', async (kind, condition) => {
    const saved = detail(true);
    if (condition === 'expired') {
      saved[kind] = { payload: null, payloadAvailable: false };
      saved.revision[kind]!.purgeAfter = '2026-09-07T00:00:00.000Z';
    } else {
      saved[kind] = { payload: btoa('tampered synthetic bytes'), payloadAvailable: true };
    }
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      response(String(input) === `${BASE_URL}/1` ? saved : history([saved.revision]))
    );
    const view = renderHistory();
    await openHistory(view.client);
    fireEvent.click(screen.getByRole('button', { name: 'Use version 1' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      condition === 'expired'
        ? 'Original file bytes are no longer retained.'
        : 'Saved file bytes do not match their recorded source hash.'
    );
    expect(view.initialProps.onRestore).not.toHaveBeenCalled();
    expect(screen.queryByText(/Loaded version/)).toBeNull();
  });

  it('disables new saves and restores when publication freezes the parent', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(history([revision()])));
    const view = renderHistory();
    await openHistory(view.client);
    fillNotes();
    view.update({ disabled: true });
    const save = screen.getByRole('button', { name: 'Save draft revision' });
    const restore = screen.getByRole('button', { name: 'Use version 1' });
    expect(save).toBeDisabled();
    expect(restore).toBeDisabled();
    expect(screen.getByLabelText('Draft data qualification')).toBeDisabled();
    fireEvent.click(save);
    fireEvent.click(restore);
    expect(view.initialProps.prepareFiles).not.toHaveBeenCalled();
    expect(view.initialProps.onRestore).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('coalesces double clicks while source preparation is pending', async () => {
    const preparation = deferred<DraftFiles>();
    const saves: SentSave[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      if (init?.method === 'POST') {
        saves.push(captureSave(init));
        return response(receipt(revision(), saves.at(-1)!), 201);
      }
      return response(history());
    });
    const prepareFiles = vi.fn(() => preparation.promise);
    const view = renderHistory({ prepareFiles });
    await openHistory(view.client);
    fillNotes();
    const save = screen.getByRole('button', { name: 'Save draft revision' });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(prepareFiles).toHaveBeenCalledOnce();
    expect(saves).toHaveLength(0);
    expect(view.initialProps.onLockChange).toHaveBeenLastCalledWith(true);
    await act(async () => preparation.resolve(files()));
    await screen.findByText('Saved draft version 1.');
    expect(saves).toHaveLength(1);
  });

  it('coalesces double restore clicks while detail readback is pending', async () => {
    const readback = deferred<Response>();
    let detailReads = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input) === `${BASE_URL}/1`) {
        detailReads += 1;
        return readback.promise;
      }
      return response(history([revision()]));
    });
    const view = renderHistory();
    await openHistory(view.client);
    const restore = screen.getByRole('button', { name: 'Use version 1' });
    fireEvent.click(restore);
    fireEvent.click(restore);
    expect(detailReads).toBe(1);
    await act(async () => readback.resolve(response(detail())));
    await waitFor(() => expect(view.initialProps.onRestore).toHaveBeenCalledOnce());
  });

  it('cannot deliver an old pending restore after the keyed fund component unmounts', async () => {
    const readback = deferred<Response>();
    const oldRestore = vi.fn();
    const newRestore = vi.fn();
    const requested: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      requested.push(url);
      if (url === `${BASE_URL}/1`) return readback.promise;
      return response(url.includes('/funds/8/') ? history([], 8) : history([revision()]));
    });
    const view = renderHistory({ onRestore: oldRestore });
    await openHistory(view.client);
    fireEvent.click(screen.getByRole('button', { name: 'Use version 1' }));
    await waitFor(() => expect(requested).toContain(`${BASE_URL}/1`));
    view.update({ fundId: 8, onRestore: newRestore });
    await openHistory(view.client, 8);
    await act(async () => readback.resolve(response(detail())));
    expect(oldRestore).not.toHaveBeenCalled();
    expect(newRestore).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Draft source note')).toHaveValue('');
    expect(screen.queryByText(/Loaded version/)).toBeNull();
    expect(requested).not.toContain('/api/funds/8/imports/actuals/draft-revisions/1');
  });

  it('restores through the real publication parent and requires a new cutoff before previewing restored bytes', async () => {
    const previews: Array<Record<string, unknown>> = [];
    const saved = detail();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/financial-facts/latest-reference')) {
        return response({
          contractVersion: 'financial-facts-latest-reference/1.0.0',
          fundId: 7,
          latest: null,
        });
      }
      if (url === BASE_URL) return response(history([saved.revision]));
      if (url === `${BASE_URL}/1`) return response(saved);
      if (url.endsWith('/imports/actuals/dry-run')) {
        previews.push(JSON.parse(String(init?.body)));
        return response(
          { code: 'INVALID_VALUE', message: 'Synthetic incomplete ledger remains a draft.' },
          422
        );
      }
      throw new Error(`Unexpected mocked URL: ${url}`);
    });
    const client = queryClient();
    render(
      <QueryClientProvider client={client}>
        <ActualsPublicationPanel fundId={7} />
      </QueryClientProvider>
    );
    await screen.findByRole('heading', { name: 'Publish fixed-template actuals' });
    fireEvent.change(screen.getByLabelText('Reporting cutoff'), {
      target: { value: '2026-09-08' },
    });
    await openHistory(client);
    fireEvent.click(screen.getByRole('button', { name: 'Use version 1' }));
    await screen.findByText('Loaded version 1. Preview again before publishing.');
    expect(screen.getByLabelText('Reporting cutoff')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Preview actuals' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Reporting cutoff'), {
      target: { value: '2026-09-09' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preview actuals' }));
    await waitFor(() => expect(previews).toHaveLength(1));
    expect(previews[0]).toMatchObject({
      asOfDate: '2026-09-09',
      fileName: saved.revision.ledger.fileName,
      payload: saved.ledger.payload,
    });
  });
});
