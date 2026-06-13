import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CreateMethodologyScenarioModal,
  buildCreateMethodologyScenarioPayload,
} from '../../../../client/src/components/scenarios/CreateMethodologyScenarioModal';
import type { FundScenarioSetDetailV1 } from '../../../../shared/contracts/fund-scenario-sets-v1.contract';
import { installRadixSelectShim } from '../../../helpers/radix-select-shim';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

interface ModalProps {
  fundId?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: (created: FundScenarioSetDetailV1) => void;
}

function renderModal(props: ModalProps = {}) {
  const queryClient = makeQueryClient();
  const onOpenChange = props.onOpenChange ?? vi.fn();
  const onSuccess = props.onSuccess ?? vi.fn();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <CreateMethodologyScenarioModal
        fundId={props.fundId ?? '123'}
        open={props.open ?? true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />
    </QueryClientProvider>
  );
  return { ...result, queryClient, onOpenChange, onSuccess };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(status: number, code: string, message: string) {
  return jsonResponse({ error: 'error', code, message }, status);
}

function makeCreatedDetail(): FundScenarioSetDetailV1 {
  return {
    id: '00000000-0000-0000-0000-000000000711',
    fundId: 123,
    name: 'American waterfall test',
    description: null,
    sourceConfigId: 12,
    sourceConfigVersion: 4,
    variantCount: 1,
    archivedAt: null,
    archivedByUserId: null,
    archivedByLabel: null,
    createdByUserId: 17,
    createdByLabel: 'analyst@example.com',
    updatedByUserId: 17,
    updatedByLabel: 'analyst@example.com',
    createdAt: '2026-06-08T12:00:00.000Z',
    updatedAt: '2026-06-08T12:00:00.000Z',
    variants: [
      {
        id: '00000000-0000-0000-0000-000000000712',
        scenarioSetId: '00000000-0000-0000-0000-000000000711',
        name: 'American variant',
        description: null,
        sortOrder: 0,
        override: { overrideType: 'methodology', payload: { waterfallType: 'american' } },
        createdAt: '2026-06-08T12:00:00.000Z',
        updatedAt: '2026-06-08T12:00:00.000Z',
      },
    ],
  };
}

// ─── payload builder ─────────────────────────────────────────────────────────

describe('buildCreateMethodologyScenarioPayload', () => {
  it('builds payload with waterfallType only', () => {
    const result = buildCreateMethodologyScenarioPayload({
      scenarioSetName: 'My set',
      variantName: 'My variant',
      waterfallType: 'american',
      managementFeeRate: undefined,
    });
    expect(result.name).toBe('My set');
    expect(result.variants[0]?.name).toBe('My variant');
    expect(result.variants[0]?.override.overrideType).toBe('methodology');
    expect(result.variants[0]?.override.payload).toEqual({ waterfallType: 'american' });
    expect('managementFeeRate' in (result.variants[0]?.override.payload ?? {})).toBe(false);
  });

  it('builds payload with managementFeeRate only', () => {
    const result = buildCreateMethodologyScenarioPayload({
      scenarioSetName: 'Fee test',
      variantName: 'Fee variant',
      waterfallType: undefined,
      managementFeeRate: 2,
    });
    expect(result.variants[0]?.override.payload).toEqual({ managementFeeRate: 2 });
    expect('waterfallType' in (result.variants[0]?.override.payload ?? {})).toBe(false);
  });

  it('builds payload with both fields', () => {
    const result = buildCreateMethodologyScenarioPayload({
      scenarioSetName: 'Both',
      variantName: 'Both variant',
      waterfallType: 'hybrid',
      managementFeeRate: 2.5,
    });
    expect(result.variants[0]?.override.payload).toEqual({
      waterfallType: 'hybrid',
      managementFeeRate: 2.5,
    });
  });

  it('submits decimal fee as percentage, not divided by 100', () => {
    const result = buildCreateMethodologyScenarioPayload({
      scenarioSetName: 'Decimal',
      variantName: 'v',
      waterfallType: undefined,
      managementFeeRate: 2.5,
    });
    const payload = result.variants[0]?.override.payload as { managementFeeRate: number };
    expect(payload.managementFeeRate).toBe(2.5);
  });

  it('submits zero fee as a real override value', () => {
    const result = buildCreateMethodologyScenarioPayload({
      scenarioSetName: 'Zero',
      variantName: 'v',
      waterfallType: undefined,
      managementFeeRate: 0,
    });
    expect(result.variants[0]?.override.payload).toEqual({ managementFeeRate: 0 });
  });

  it('maps scenarioSetName to name and variantName to variants[0].name', () => {
    const result = buildCreateMethodologyScenarioPayload({
      scenarioSetName: 'Set name',
      variantName: 'Variant name',
      waterfallType: 'american',
      managementFeeRate: undefined,
    });
    expect(result.name).toBe('Set name');
    expect(result.variants[0]?.name).toBe('Variant name');
  });
});

// ─── modal component ─────────────────────────────────────────────────────────

describe('CreateMethodologyScenarioModal', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeAll(installRadixSelectShim);

  beforeEach(() => {
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders all four form fields when open', () => {
    renderModal();
    expect(screen.getByLabelText(/scenario set name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/variant name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/waterfall type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/management fee rate/i)).toBeInTheDocument();
    expect(screen.getByText(/create one scenario variant/i)).toBeInTheDocument();
  });

  it('does not render dialog content when closed', () => {
    renderModal({ open: false });
    expect(screen.queryByLabelText(/scenario set name/i)).not.toBeInTheDocument();
  });

  it('shows required errors under name fields on empty submit', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /create scenario/i }));
    expect(await screen.findAllByText('Required')).toHaveLength(2);
  });

  it('shows cross-field error when names filled but no override specified', async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText(/scenario set name/i), {
      target: { value: 'My set' },
    });
    fireEvent.change(screen.getByLabelText(/variant name/i), {
      target: { value: 'My variant' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create scenario/i }));
    expect(await screen.findByText(/specify at least one override/i)).toBeInTheDocument();
  });

  it('does not POST when fee rate is negative', async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText(/scenario set name/i), { target: { value: 'S' } });
    fireEvent.change(screen.getByLabelText(/variant name/i), { target: { value: 'V' } });
    fireEvent.change(screen.getByLabelText(/management fee rate/i), {
      target: { value: '-1', valueAsNumber: -1 },
    });
    fireEvent.click(screen.getByRole('button', { name: /create scenario/i }));
    await waitFor(() => {
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  it('does not POST when fee rate is above 100', async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText(/scenario set name/i), { target: { value: 'S' } });
    fireEvent.change(screen.getByLabelText(/variant name/i), { target: { value: 'V' } });
    fireEvent.change(screen.getByLabelText(/management fee rate/i), {
      target: { value: '101', valueAsNumber: 101 },
    });
    fireEvent.click(screen.getByRole('button', { name: /create scenario/i }));
    await waitFor(() => {
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  it('POSTs correct body with managementFeeRate only', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(makeCreatedDetail()));
    renderModal();
    fireEvent.change(screen.getByLabelText(/scenario set name/i), {
      target: { value: 'Fee set' },
    });
    fireEvent.change(screen.getByLabelText(/variant name/i), { target: { value: 'Fee v' } });
    fireEvent.change(screen.getByLabelText(/management fee rate/i), {
      target: { value: '2', valueAsNumber: 2 },
    });
    fireEvent.click(screen.getByRole('button', { name: /create scenario/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.variants[0].override.overrideType).toBe('methodology');
    expect(body.variants[0].override.payload).toEqual({ managementFeeRate: 2 });
    expect('waterfallType' in body.variants[0].override.payload).toBe(false);
    expect(init.headers).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        'Idempotency-Key': expect.any(String),
      })
    );
  });

  it('guards against re-entrant submit (one POST)', async () => {
    fetchSpy.mockReturnValueOnce(new Promise(() => {}));
    renderModal();
    fireEvent.change(screen.getByLabelText(/scenario set name/i), {
      target: { value: 'S' },
    });
    fireEvent.change(screen.getByLabelText(/variant name/i), { target: { value: 'V' } });
    fireEvent.change(screen.getByLabelText(/management fee rate/i), {
      target: { value: '2', valueAsNumber: 2 },
    });

    const form = document.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
  });

  it('reuses the same Idempotency-Key on same-payload retry after a transient failure', async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(500, 'server_error', 'boom'));
    renderModal();
    fireEvent.change(screen.getByLabelText(/scenario set name/i), {
      target: { value: 'S' },
    });
    fireEvent.change(screen.getByLabelText(/variant name/i), { target: { value: 'V' } });
    fireEvent.change(screen.getByLabelText(/management fee rate/i), {
      target: { value: '2', valueAsNumber: 2 },
    });
    fireEvent.click(screen.getByRole('button', { name: /create scenario/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const firstInit = fetchSpy.mock.calls[0][1] as RequestInit;
    const key1 = (firstInit.headers as Record<string, string>)['Idempotency-Key'];

    await waitFor(() => {
      expect(screen.getByText(/failed to create scenario/i)).toBeInTheDocument();
    });

    fetchSpy.mockResolvedValueOnce(jsonResponse(makeCreatedDetail()));
    fireEvent.click(screen.getByRole('button', { name: /create scenario/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    const secondInit = fetchSpy.mock.calls[1][1] as RequestInit;
    const key2 = (secondInit.headers as Record<string, string>)['Idempotency-Key'];

    expect(key2).toBe(key1);
  });

  it('mints a new Idempotency-Key when the payload changes after a failure', async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(500, 'server_error', 'boom'));
    renderModal();
    fireEvent.change(screen.getByLabelText(/scenario set name/i), {
      target: { value: 'S' },
    });
    fireEvent.change(screen.getByLabelText(/variant name/i), { target: { value: 'V' } });
    fireEvent.change(screen.getByLabelText(/management fee rate/i), {
      target: { value: '2', valueAsNumber: 2 },
    });
    fireEvent.click(screen.getByRole('button', { name: /create scenario/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const firstInit = fetchSpy.mock.calls[0][1] as RequestInit;
    const key1 = (firstInit.headers as Record<string, string>)['Idempotency-Key'];

    await waitFor(() => {
      expect(screen.getByText(/failed to create scenario/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/variant name/i), { target: { value: 'V2' } });
    fetchSpy.mockResolvedValueOnce(jsonResponse(makeCreatedDetail()));
    fireEvent.click(screen.getByRole('button', { name: /create scenario/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    const secondInit = fetchSpy.mock.calls[1][1] as RequestInit;
    const key2 = (secondInit.headers as Record<string, string>)['Idempotency-Key'];

    expect(key2).not.toBe(key1);
  });

  it('POSTs waterfallType when chosen via the Select dropdown', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(makeCreatedDetail()));
    renderModal();
    fireEvent.change(screen.getByLabelText(/scenario set name/i), {
      target: { value: 'Wf set' },
    });
    fireEvent.change(screen.getByLabelText(/variant name/i), { target: { value: 'Wf v' } });
    const user = userEvent.setup();

    await user.click(screen.getByLabelText(/waterfall type/i));
    await user.click(screen.getByRole('option', { name: /american \(deal-by-deal\)/i }));

    fireEvent.click(screen.getByRole('button', { name: /create scenario/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.variants[0].override.payload).toEqual({ waterfallType: 'american' });
    expect('managementFeeRate' in body.variants[0].override.payload).toBe(false);
  });

  it('shows duplicate_scenario_set_name error under name field', async () => {
    fetchSpy.mockResolvedValueOnce(
      errorResponse(409, 'duplicate_scenario_set_name', 'Already exists')
    );
    renderModal();
    fireEvent.change(screen.getByLabelText(/scenario set name/i), { target: { value: 'S' } });
    fireEvent.change(screen.getByLabelText(/variant name/i), { target: { value: 'V' } });
    fireEvent.change(screen.getByLabelText(/management fee rate/i), {
      target: { value: '2', valueAsNumber: 2 },
    });
    fireEvent.click(screen.getByRole('button', { name: /create scenario/i }));
    expect(
      await screen.findByText(/a scenario set with this name already exists/i)
    ).toBeInTheDocument();
  });

  it('shows max_scenario_sets banner', async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(409, 'max_scenario_sets', 'Max reached'));
    renderModal();
    fireEvent.change(screen.getByLabelText(/scenario set name/i), { target: { value: 'S' } });
    fireEvent.change(screen.getByLabelText(/variant name/i), { target: { value: 'V' } });
    fireEvent.change(screen.getByLabelText(/management fee rate/i), {
      target: { value: '2', valueAsNumber: 2 },
    });
    fireEvent.click(screen.getByRole('button', { name: /create scenario/i }));
    expect(await screen.findByText(/maximum of 10 active scenario sets/i)).toBeInTheDocument();
  });

  it('shows no_published_config banner', async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(409, 'no_published_config', 'No config'));
    renderModal();
    fireEvent.change(screen.getByLabelText(/scenario set name/i), { target: { value: 'S' } });
    fireEvent.change(screen.getByLabelText(/variant name/i), { target: { value: 'V' } });
    fireEvent.change(screen.getByLabelText(/management fee rate/i), {
      target: { value: '2', valueAsNumber: 2 },
    });
    fireEvent.click(screen.getByRole('button', { name: /create scenario/i }));
    expect(await screen.findByText(/publish a fund configuration/i)).toBeInTheDocument();
  });

  it('disables Create button while mutation is pending', async () => {
    fetchSpy.mockReturnValueOnce(new Promise(() => {}));
    renderModal();
    fireEvent.change(screen.getByLabelText(/scenario set name/i), { target: { value: 'S' } });
    fireEvent.change(screen.getByLabelText(/variant name/i), { target: { value: 'V' } });
    fireEvent.change(screen.getByLabelText(/management fee rate/i), {
      target: { value: '2', valueAsNumber: 2 },
    });
    fireEvent.click(screen.getByRole('button', { name: /create scenario/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /creating/i })).toBeDisabled();
    });
  });

  it('blocks close while mutation is pending', async () => {
    fetchSpy.mockReturnValueOnce(new Promise(() => {}));
    const onOpenChange = vi.fn();
    renderModal({ onOpenChange });
    fireEvent.change(screen.getByLabelText(/scenario set name/i), { target: { value: 'S' } });
    fireEvent.change(screen.getByLabelText(/variant name/i), { target: { value: 'V' } });
    fireEvent.change(screen.getByLabelText(/management fee rate/i), {
      target: { value: '2', valueAsNumber: 2 },
    });
    fireEvent.click(screen.getByRole('button', { name: /create scenario/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('resets form on close and re-open', async () => {
    function Harness() {
      const [open, setOpen] = React.useState(true);
      return (
        <>
          <button onClick={() => setOpen((o) => !o)}>Toggle</button>
          <QueryClientProvider client={makeQueryClient()}>
            <CreateMethodologyScenarioModal
              fundId="123"
              open={open}
              onOpenChange={setOpen}
              onSuccess={vi.fn()}
            />
          </QueryClientProvider>
        </>
      );
    }
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(/scenario set name/i), {
      target: { value: 'Filled' },
    });
    expect(screen.getByLabelText(/scenario set name/i)).toHaveValue('Filled');
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    fireEvent.click(screen.getByRole('button', { name: /toggle/i }));
    expect(await screen.findByLabelText(/scenario set name/i)).toHaveValue('');
  });

  it('calls onSuccess with the created detail', async () => {
    const detail = makeCreatedDetail();
    fetchSpy.mockResolvedValueOnce(jsonResponse(detail));
    const onSuccess = vi.fn();
    renderModal({ onSuccess });
    fireEvent.change(screen.getByLabelText(/scenario set name/i), {
      target: { value: 'American waterfall test' },
    });
    fireEvent.change(screen.getByLabelText(/variant name/i), {
      target: { value: 'American variant' },
    });
    fireEvent.change(screen.getByLabelText(/management fee rate/i), {
      target: { value: '2', valueAsNumber: 2 },
    });
    fireEvent.click(screen.getByRole('button', { name: /create scenario/i }));
    await waitFor(() =>
      expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ id: detail.id }))
    );
  });

  it('invalidates workspace query on success', async () => {
    const detail = makeCreatedDetail();
    fetchSpy.mockResolvedValueOnce(jsonResponse(detail));
    const { queryClient } = renderModal();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    fireEvent.change(screen.getByLabelText(/scenario set name/i), {
      target: { value: 'American waterfall test' },
    });
    fireEvent.change(screen.getByLabelText(/variant name/i), {
      target: { value: 'American variant' },
    });
    fireEvent.change(screen.getByLabelText(/management fee rate/i), {
      target: { value: '2', valueAsNumber: 2 },
    });
    fireEvent.click(screen.getByRole('button', { name: /create scenario/i }));
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['fund-scenario-workspace', '123'] })
      );
    });
  });

  it('seeds detail query cache on success', async () => {
    const detail = makeCreatedDetail();
    fetchSpy.mockResolvedValueOnce(jsonResponse(detail));
    const { queryClient } = renderModal();
    const setQueryDataSpy = vi.spyOn(queryClient, 'setQueryData');
    fireEvent.change(screen.getByLabelText(/scenario set name/i), {
      target: { value: 'American waterfall test' },
    });
    fireEvent.change(screen.getByLabelText(/variant name/i), {
      target: { value: 'American variant' },
    });
    fireEvent.change(screen.getByLabelText(/management fee rate/i), {
      target: { value: '2', valueAsNumber: 2 },
    });
    fireEvent.click(screen.getByRole('button', { name: /create scenario/i }));
    await waitFor(() => {
      expect(setQueryDataSpy).toHaveBeenCalledWith(
        ['fund-scenario-workspace', '123', 'scenario-sets', detail.id, 'detail'],
        expect.objectContaining({ id: detail.id })
      );
    });
  });
});
