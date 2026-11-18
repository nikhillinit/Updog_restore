import React from 'react';
import { createHash, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MainFundOnboardingPanel } from '@/components/lp-reporting/MainFundOnboardingPanel';
import { clearPendingCreateCommands } from '@/hooks/useIdempotencyKey';
import type { AuthSession } from '@/lib/auth-session';
import type { VehicleOnboardingRequest } from '@shared/contracts/lp-reporting/vehicle-onboarding.contract';

const auth = vi.hoisted(() => ({ session: null as AuthSession | null }));
vi.mock('@/lib/auth-session', () => ({ useAuthSession: () => ({ data: auth.session }) }));

const SOURCE = 'Signed commitments schedule: total USD 1250000.25.';
const ENTRY = 'pending-create:v1:7:vehicle_onboarding';
const noHead = { contractVersion: 'financial-facts-latest-reference/1.0.0', head: null };
type CapturedCommand = { url: string; key: string; body: string; credentials?: RequestCredentials };

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function receipt(command: CapturedCommand, changes: Record<string, unknown> = {}) {
  const body = JSON.parse(command.body) as VehicleOnboardingRequest;
  const source =
    'content' in body.source
      ? Buffer.from(body.source.content)
      : Buffer.from(body.source.payloadBase64, 'base64');
  return {
    contractVersion: body.contractVersion,
    commandId: 11,
    fundId: 7,
    vehicleId: 12,
    vehicleSlug: body.vehicleSlug,
    name: body.name,
    vehicleType: 'main_fund',
    currency: 'USD',
    status: 'active',
    committedCapital: body.committedCapital,
    sourceArtifactId: 13,
    sourceArtifactSha256: createHash('sha256').update(source).digest('hex'),
    sourceLocator: body.sourceLocator,
    sourcePurgeAfter: '2027-11-04T00:00:00.000Z',
    attestation: body.attestation,
    outcome: 'created',
    actorId: 9,
    declaredAt: '2026-11-04T00:00:00.000Z',
    ...changes,
  };
}

function mockRequests(
  handle: (command: CapturedCommand, count: number) => Response | Promise<Response> = (command) =>
    response(receipt(command), 201),
  availability: () => Response | Promise<Response> = () => response(noHead)
) {
  const commands: CapturedCommand[] = [];
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/financial-facts/latest-reference')) return availability();
    if (url.endsWith('/imports/actuals/main-fund')) {
      const command = {
        url,
        key: new Headers(init?.headers).get('Idempotency-Key') ?? '',
        body: String(init?.body),
        credentials: init?.credentials,
      };
      commands.push(command);
      return handle(command, commands.length);
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  return { commands, fetchMock };
}

function renderPanel(fundId = 7) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <MainFundOnboardingPanel fundId={fundId} />
    </QueryClientProvider>
  );
  return {
    ...view,
    client,
    switchFund: (nextFundId: number) =>
      view.rerender(
        <QueryClientProvider client={client}>
          <MainFundOnboardingPanel fundId={nextFundId} />
        </QueryClientProvider>
      ),
  };
}

async function fillDeclaration(source = SOURCE) {
  await screen.findByRole('heading', { name: 'Declare the main fund' });
  fireEvent.change(screen.getByLabelText('Main fund slug'), { target: { value: 'fund-seven' } });
  fireEvent.change(screen.getByLabelText('Vehicle display name'), {
    target: { value: 'Fund Seven' },
  });
  fireEvent.change(screen.getByLabelText('Committed capital (USD)'), {
    target: { value: '1250000.25' },
  });
  fireEvent.change(screen.getByLabelText('Commitment source text'), { target: { value: source } });
  fireEvent.change(screen.getByLabelText('Location in source'), {
    target: { value: 'Schedule A, total' },
  });
  fireEvent.click(screen.getByRole('checkbox'));
}

async function reviewDeclaration(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Review declaration' }));
  return screen.findByRole('button', { name: /^(Declare main fund|Retry unchanged declaration)$/ });
}

describe('main-fund onboarding', () => {
  beforeEach(() => {
    auth.session = {
      user: { id: '9', email: 'admin@example.com', role: 'admin', fundIds: [] },
    };
    sessionStorage.clear();
    let id = 0;
    vi.stubGlobal('crypto', {
      subtle: webcrypto.subtle,
      randomUUID: () => `11111111-1111-4111-8111-${String(++id).padStart(12, '0')}`,
    });
  });
  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('requires attestation and rejects fractional cents with a focused accessible error', async () => {
    const { commands } = mockRequests();
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole('heading', { name: 'Declare the main fund' });
    expect(screen.getByRole('button', { name: 'Review declaration' })).toBeDisabled();
    await fillDeclaration();
    fireEvent.change(screen.getByLabelText('Committed capital (USD)'), {
      target: { value: '1.001' },
    });
    await user.click(screen.getByRole('button', { name: 'Review declaration' }));
    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('committedCapital');
    expect(error).toHaveFocus();
    expect(commands).toHaveLength(0);
    expect(sessionStorage.getItem(ENTRY)).toBeNull();
  });

  it.each(['text', 'file'] as const)(
    'rejects oversized %s sources before preparing or sending a command',
    async (mode) => {
      const { commands } = mockRequests();
      const user = userEvent.setup();
      renderPanel();
      await fillDeclaration(mode === 'text' ? 'é'.repeat(61441) : SOURCE);
      if (mode === 'file') {
        await user.selectOptions(screen.getByLabelText('Evidence format'), 'file');
        await user.upload(
          screen.getByLabelText('Commitment source file'),
          new File(['x'.repeat(122881)], 'source.csv', { type: 'text/csv' })
        );
      }
      await user.click(screen.getByRole('button', { name: 'Review declaration' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('120 KiB');
      expect(commands).toHaveLength(0);
      expect(sessionStorage.getItem(ENTRY)).toBeNull();
    }
  );

  it('requires explicit review and submission and displays a historical receipt without publishing', async () => {
    const { commands } = mockRequests();
    const user = userEvent.setup();
    renderPanel();
    await fillDeclaration();
    const submit = await reviewDeclaration(user);
    expect(commands).toHaveLength(0);
    expect(screen.getByLabelText('Main fund slug')).toBeDisabled();
    expect(sessionStorage.getItem(ENTRY)).toBeNull();
    await user.click(submit);
    expect(await screen.findByText('Main fund declared')).toBeVisible();
    expect(screen.getByText(/This is a historical declaration/)).toBeVisible();
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      url: '/api/funds/7/imports/actuals/main-fund',
      credentials: 'include',
    });
    expect(JSON.parse(commands[0]!.body)).toMatchObject({
      vehicleSlug: 'fund-seven',
      name: 'Fund Seven',
      committedCapital: '1250000.25',
      source: { sourceType: 'manual', content: SOURCE },
      sourceLocator: 'Schedule A, total',
      attestation: 'source-supports-commitment/1.0.0',
    });
    expect(sessionStorage.getItem(ENTRY)).toBeNull();
  });

  it('sends exact binary source bytes and filename for CSV evidence', async () => {
    const { commands } = mockRequests();
    const user = userEvent.setup();
    renderPanel();
    await fillDeclaration();
    await user.selectOptions(screen.getByLabelText('Evidence format'), 'file');
    const csv = 'name,commitment\r\nFund Seven,1250000.25\r\n';
    await user.upload(
      screen.getByLabelText('Commitment source file'),
      new File([csv], 'commitments.csv', { type: 'text/csv' })
    );
    await user.click(await reviewDeclaration(user));
    await screen.findByText('Main fund declared');
    expect(JSON.parse(commands[0]!.body).source).toEqual({
      sourceType: 'csv',
      fileName: 'commitments.csv',
      payloadBase64: Buffer.from(csv).toString('base64'),
    });
  });

  it('preserves the administrator-selected structured-paste evidence type', async () => {
    const { commands } = mockRequests();
    const user = userEvent.setup();
    renderPanel();
    await fillDeclaration();
    await user.selectOptions(screen.getByLabelText('Evidence format'), 'structured_paste');
    await user.click(await reviewDeclaration(user));
    await screen.findByText('Main fund declared');
    expect(JSON.parse(commands[0]!.body).source).toEqual({
      sourceType: 'structured_paste',
      content: SOURCE,
    });
  });

  it('does not prepare or submit an old fund declaration when file reading finishes after a switch', async () => {
    const { commands } = mockRequests();
    const user = userEvent.setup();
    const view = renderPanel();
    await fillDeclaration();
    await user.selectOptions(screen.getByLabelText('Evidence format'), 'file');
    let finishRead: (value: ArrayBuffer) => void = () => {};
    const file = new File([SOURCE], 'source.csv', { type: 'text/csv' });
    const digest = vi.spyOn(globalThis.crypto.subtle, 'digest');
    Object.defineProperty(file, 'arrayBuffer', {
      value: () =>
        new Promise<ArrayBuffer>((resolve) => {
          finishRead = resolve;
        }),
    });
    await user.upload(screen.getByLabelText('Commitment source file'), file);
    await user.click(screen.getByRole('button', { name: 'Review declaration' }));
    expect(screen.getByRole('button', { name: 'Preparing declaration…' })).toBeDisabled();
    view.switchFund(8);
    await screen.findByRole('heading', { name: 'Declare the main fund' });
    await act(async () => {
      finishRead(new TextEncoder().encode(SOURCE).buffer);
      await waitFor(() => expect(digest).toHaveBeenCalledTimes(2));
      await Promise.all(digest.mock.results.map((result) => result.value));
    });
    expect(screen.getByLabelText('Main fund slug')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Declare main fund' })).not.toBeInTheDocument();
    expect(sessionStorage.getItem(ENTRY)).toBeNull();
    expect(commands).toHaveLength(0);
  });

  it('retries an uncertain result with the same frozen body and key', async () => {
    const { commands } = mockRequests((command, count) =>
      count === 1 ? response({ code: 'TEMPORARY_FAILURE' }, 503) : response(receipt(command))
    );
    const user = userEvent.setup();
    renderPanel();
    await fillDeclaration();
    await user.click(await reviewDeclaration(user));
    await screen.findByText(/The outcome is uncertain/);
    expect(screen.queryByRole('button', { name: 'Edit declaration' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Committed capital (USD)')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Retry unchanged declaration' }));
    await screen.findByText('Main fund declared');
    expect(commands).toHaveLength(2);
    expect(commands[1]).toEqual(commands[0]);
  });

  it('allows a different declaration after reloading an unsent review', async () => {
    const { commands } = mockRequests();
    const user = userEvent.setup();
    const first = renderPanel();
    await fillDeclaration();
    await reviewDeclaration(user);
    expect(commands).toHaveLength(0);
    expect(sessionStorage.getItem(ENTRY)).toBeNull();
    first.unmount();
    renderPanel();
    await fillDeclaration('Replacement source with the same supported commitment.');
    await reviewDeclaration(user);
    expect(screen.queryByText('Pending declaration')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Declare main fund' }));
    await screen.findByText('Main fund declared');
    expect(commands).toHaveLength(1);
    expect(JSON.parse(commands[0]!.body).source.content).toBe(
      'Replacement source with the same supported commitment.'
    );
  });

  it('restores only metadata after reload and blocks a different source from replacing an uncertain key', async () => {
    const { commands } = mockRequests((command, count) =>
      count === 1 ? response({}, 503) : response(receipt(command))
    );
    const user = userEvent.setup();
    const first = renderPanel();
    await fillDeclaration();
    await user.click(await reviewDeclaration(user));
    await screen.findByText(/The outcome is uncertain/);
    const pending = sessionStorage.getItem(ENTRY);
    expect(Object.keys(JSON.parse(pending!)).sort()).toEqual([
      'actorId',
      'createdAt',
      'fingerprint',
      'key',
    ]);
    first.unmount();
    renderPanel();
    await screen.findByText('Pending declaration');
    expect(screen.getByLabelText('Commitment source text')).toHaveValue('');
    await fillDeclaration('Different source');
    await user.click(screen.getByRole('button', { name: 'Review declaration' }));
    await screen.findByText(/Restore the exact pending declaration and source/);
    expect(sessionStorage.getItem(ENTRY)).toBe(pending);
    expect(commands).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Commitment source text'), {
      target: { value: SOURCE },
    });
    await user.click(await reviewDeclaration(user));
    await screen.findByText('Main fund declared');
    expect(commands[1]).toEqual(commands[0]);
  });

  it('keeps a mismatched receipt uncertain and preserves the original retry key', async () => {
    const { commands } = mockRequests((command) => response(receipt(command, { fundId: 8 })));
    const user = userEvent.setup();
    renderPanel();
    await fillDeclaration();
    await user.click(await reviewDeclaration(user));
    await screen.findByText(/The outcome is uncertain/);
    expect(screen.queryByText('Main fund declared')).not.toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem(ENTRY)!)).toMatchObject({ key: commands[0]!.key });
  });

  it('requires editing after a definitive refusal before starting a new key', async () => {
    const { commands } = mockRequests((command, count) =>
      count === 1
        ? response(
            {
              code: 'VEHICLE_IDENTITY_CONFLICT',
              message: 'The requested main-fund identity is unavailable.',
            },
            409
          )
        : response(receipt(command))
    );
    const user = userEvent.setup();
    renderPanel();
    await fillDeclaration();
    await user.click(await reviewDeclaration(user));
    await screen.findByText('The requested main-fund identity is unavailable.');
    expect(screen.getByRole('button', { name: 'Declare main fund' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Edit declaration' }));
    fireEvent.change(screen.getByLabelText('Main fund slug'), {
      target: { value: 'fund-seven-main' },
    });
    await user.click(await reviewDeclaration(user));
    await screen.findByText('Main fund declared');
    expect(commands[1]!.key).not.toBe(commands[0]!.key);
  });

  it('forgets the key after a first-attempt refusal so a reload does not restore it', async () => {
    mockRequests(() =>
      response(
        {
          code: 'VEHICLE_DECLARATION_CONFLICT',
          message: 'Existing main-fund fields do not match the declaration.',
        },
        409
      )
    );
    const user = userEvent.setup();
    const first = renderPanel();
    await fillDeclaration();
    await user.click(await reviewDeclaration(user));
    await screen.findByText('Existing main-fund fields do not match the declaration.');
    expect(sessionStorage.getItem(ENTRY)).toBeNull();
    first.unmount();
    renderPanel();
    await screen.findByRole('heading', { name: 'Declare the main fund' });
    expect(screen.queryByText('Pending declaration')).not.toBeInTheDocument();
  });

  it.each([
    ['VEHICLE_DECLARATION_CONFLICT', 'Existing main-fund fields do not match the declaration.'],
    ['VEHICLE_IDENTITY_CONFLICT', 'The requested main-fund identity is unavailable.'],
    ['SOURCE_IDENTITY_CONFLICT', 'The declaration source identity is already occupied.'],
    ['IDEMPOTENCY_KEY_REUSE', 'Idempotency-Key was already used for a different request.'],
  ])(
    'clears uncertainty after a post-replay %s refusal and restores Edit across reload',
    async (code, message) => {
      mockRequests((_command, count) =>
        count === 1
          ? response({ code: 'TEMPORARY_FAILURE' }, 503)
          : response({ code, message }, 409)
      );
      const user = userEvent.setup();
      const first = renderPanel();
      await fillDeclaration();
      await user.click(await reviewDeclaration(user));
      await screen.findByText(/The outcome is uncertain/);
      await user.click(screen.getByRole('button', { name: 'Retry unchanged declaration' }));
      await screen.findByText(message);
      expect(screen.queryByText(/The outcome is uncertain/)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Declare main fund' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Edit declaration' })).toBeEnabled();
      expect(sessionStorage.getItem(ENTRY)).toBeNull();
      first.unmount();
      renderPanel();
      await screen.findByRole('heading', { name: 'Declare the main fund' });
      expect(screen.queryByText('Pending declaration')).not.toBeInTheDocument();
    }
  );

  it('keeps uncertainty for a pre-replay refusal and lets the admin discard the attempt', async () => {
    const { commands } = mockRequests((command, count) =>
      count === 1
        ? response({ code: 'TEMPORARY_FAILURE' }, 503)
        : count === 2
          ? response({ code: 'INSUFFICIENT_ROLE', message: 'Administrator access required.' }, 403)
          : response(receipt(command))
    );
    const user = userEvent.setup();
    renderPanel();
    await fillDeclaration();
    await user.click(await reviewDeclaration(user));
    await screen.findByText(/The outcome is uncertain/);
    const pending = sessionStorage.getItem(ENTRY);
    await user.click(screen.getByRole('button', { name: 'Retry unchanged declaration' }));
    await waitFor(() => expect(commands).toHaveLength(2));
    await screen.findByText(/The outcome is uncertain/);
    expect(screen.queryByRole('button', { name: 'Edit declaration' })).not.toBeInTheDocument();
    expect(sessionStorage.getItem(ENTRY)).toBe(pending);
    await user.click(screen.getByRole('button', { name: 'Discard pending attempt' }));
    expect(sessionStorage.getItem(ENTRY)).toBeNull();
    expect(screen.queryByText(/The outcome is uncertain/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Main fund slug')).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Main fund slug'), {
      target: { value: 'fund-seven-main' },
    });
    await user.click(await reviewDeclaration(user));
    await screen.findByText('Main fund declared');
    expect(commands[2]!.key).not.toBe(commands[0]!.key);
  });

  it('discards a restored pending attempt so a different declaration can start', async () => {
    const { commands } = mockRequests((command, count) =>
      count === 1 ? response({}, 503) : response(receipt(command))
    );
    const user = userEvent.setup();
    const first = renderPanel();
    await fillDeclaration();
    await user.click(await reviewDeclaration(user));
    await screen.findByText(/The outcome is uncertain/);
    first.unmount();
    renderPanel();
    await screen.findByText('Pending declaration');
    await user.click(screen.getByRole('button', { name: 'Discard pending attempt' }));
    expect(screen.queryByText('Pending declaration')).not.toBeInTheDocument();
    expect(sessionStorage.getItem(ENTRY)).toBeNull();
    await fillDeclaration('Different source');
    await user.click(await reviewDeclaration(user));
    await screen.findByText('Main fund declared');
    expect(commands).toHaveLength(2);
    expect(commands[1]!.key).not.toBe(commands[0]!.key);
    expect(JSON.parse(commands[1]!.body).source.content).toBe('Different source');
  });

  it('does not carry a frozen command into another fund or show an old in-flight receipt there', async () => {
    let finish: (value: Response) => void = () => {};
    const { commands } = mockRequests(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        })
    );
    const user = userEvent.setup();
    const view = renderPanel();
    await fillDeclaration();
    await user.click(await reviewDeclaration(user));
    await waitFor(() => expect(commands).toHaveLength(1));
    view.switchFund(8);
    await screen.findByRole('heading', { name: 'Declare the main fund' });
    expect(screen.getByLabelText('Main fund slug')).toHaveValue('');
    await act(async () => {
      finish(response(receipt(commands[0]!)));
    });
    await waitFor(() => expect(view.client.getMutationCache().getAll()).toHaveLength(0));
    expect(screen.queryByText('Main fund declared')).not.toBeInTheDocument();
    expect(commands[0]!.url).toContain('/funds/7/');
    expect(sessionStorage.getItem('pending-create:v1:8:vehicle_onboarding')).toBeNull();
    expect(sessionStorage.getItem(ENTRY)).not.toBeNull();
  });

  it('clears raw form data on logout and uses the existing logout cleanup for the saved retry key', async () => {
    mockRequests(() => response({}, 503));
    const user = userEvent.setup();
    const view = renderPanel();
    await fillDeclaration();
    await user.click(await reviewDeclaration(user));
    await screen.findByText(/The outcome is uncertain/);
    clearPendingCreateCommands();
    auth.session = null;
    view.switchFund(7);
    expect(screen.queryByTestId('main-fund-onboarding')).not.toBeInTheDocument();
    expect(sessionStorage.getItem(ENTRY)).toBeNull();
    auth.session = { user: { id: '10', email: 'other@example.com', role: 'admin', fundIds: [] } };
    view.switchFund(7);
    await screen.findByRole('heading', { name: 'Declare the main fund' });
    expect(screen.getByLabelText('Commitment source text')).toHaveValue('');
  });

  it.each([403, 503])(
    'does not expose onboarding when pilot availability returns %s',
    async (status) => {
      mockRequests(undefined, () => response({}, status));
      renderPanel();
      await screen.findByText(/Main-fund onboarding is unavailable/);
      expect(screen.queryByLabelText('Main fund slug')).not.toBeInTheDocument();
    }
  );

  it('checks the pilot grant and hides the form when the server returns 404', async () => {
    const { fetchMock } = mockRequests(undefined, () =>
      response({ code: 'RESOURCE_NOT_FOUND' }, 404)
    );
    const view = renderPanel();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByText(/Checking main-fund onboarding access/)).not.toBeInTheDocument()
    );
    expect(view.container).toBeEmptyDOMElement();
  });

  it.each(['viewer', 'signed-out'] as const)(
    'does not check pilot access or expose the form for %s users',
    (kind) => {
      const { fetchMock } = mockRequests();
      auth.session =
        kind === 'viewer'
          ? { user: { id: '9', email: 'user@example.com', role: 'viewer', fundIds: [7] } }
          : null;
      renderPanel();
      expect(screen.queryByLabelText('Main fund slug')).not.toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );
});
