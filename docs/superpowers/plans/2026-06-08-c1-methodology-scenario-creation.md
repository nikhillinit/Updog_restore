# C1: Methodology Scenario Creation UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "New methodology scenario" modal to the workspace so GPs can
create a methodology scenario set with one variant (waterfallType +
managementFeeRate) directly from the UI.

**Architecture:** `apiRequest` fix is the blocker (Task 1). Shared helpers
extracted first (Task 2). Modal built TDD (Tasks 3–4). Workspace wired last
(Task 5). All test commands use `.\scripts\windows-node-env.ps1` on Windows.

**Tech Stack:** React 18, TypeScript, Zod, React Hook Form, shadcn/ui Dialog +
Select + Input, TanStack Query useMutation, Vitest, React Testing Library.

---

## File Map

| File                                                                      | Action                                                    |
| ------------------------------------------------------------------------- | --------------------------------------------------------- |
| `client/src/lib/queryClient.ts`                                           | Modify — preserve server `code` in `ApiError.errorCode`   |
| `client/src/lib/fund-scenario-workspace-query-keys.ts`                    | Create — cache key helpers                                |
| `client/src/lib/fund-scenario-workspace-api.ts`                           | Create — path + validation helpers                        |
| `client/src/components/scenarios/CreateMethodologyScenarioModal.tsx`      | Create — modal component                                  |
| `client/src/pages/fund-scenario-workspace.tsx`                            | Modify — imports, state, button cluster, modal, highlight |
| `tests/unit/lib/queryClient.test.ts`                                      | Create — apiRequest error code test                       |
| `tests/unit/lib/fund-scenario-workspace-api.test.ts`                      | Create — path helper validation tests                     |
| `tests/unit/components/scenarios/CreateMethodologyScenarioModal.test.tsx` | Create — 19 modal cases + payload builder                 |
| `tests/unit/pages/fund-scenario-workspace.test.tsx`                       | Modify — thin integration: button + modal open            |

---

## Task 1: Fix apiRequest error code preservation (BLOCKER)

**Files:**

- Modify: `client/src/lib/queryClient.ts:74-83`
- Create: `tests/unit/lib/queryClient.test.ts`

- [ ] **Step 1.1: Write failing tests**

Create `tests/unit/lib/queryClient.test.ts`:

```ts
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, ApiError } from '../../../client/src/lib/queryClient';

describe('apiRequest', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves specific server error code over generic error field', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: 'conflict',
          code: 'duplicate_scenario_set_name',
          message: 'Already exists',
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      )
    );
    const err = await apiRequest('POST', '/api/test', {}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).errorCode).toBe('duplicate_scenario_set_name');
  });

  it('falls back to generic error field when no specific code', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: 'not_found', message: 'Not found' }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );
    const err = await apiRequest('GET', '/api/test').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).errorCode).toBe('not_found');
  });

  it('does not crash when response includes a details field', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: 'invalid_request',
          message: 'Bad input',
          details: { issues: [{ path: ['name'], message: 'Required' }] },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    );
    const err = await apiRequest('POST', '/api/test', {}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).errorCode).toBe('invalid_request');
  });
});
```

- [ ] **Step 1.2: Run tests to confirm failure**

```powershell
& .\scripts\windows-node-env.ps1 npx.cmd vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/lib/queryClient.test.ts
```

Expected: First test fails — `errorCode` is `'conflict'` not
`'duplicate_scenario_set_name'`.

- [ ] **Step 1.3: Fix `queryClient.ts`**

In `client/src/lib/queryClient.ts`, replace lines 74–83 (the `if (!response.ok)`
block):

```ts
if (!response.ok) {
  type ErrorBody = {
    message?: string;
    error?: string;
    code?: string;
    issues?: Array<{ path: (string | number)[]; message: string }>;
    details?: unknown;
  };
  const errorData = (await response
    .json()
    .catch(() => ({}) as ErrorBody)) as ErrorBody;
  const errorMessage =
    errorData.message ||
    errorData.error ||
    `API request failed: ${response.statusText}`;
  const errorCode = errorData.code ?? errorData.error;
  throw new ApiError(
    response.status,
    errorMessage,
    errorCode,
    errorData.issues
  );
}
```

- [ ] **Step 1.4: Verify tests pass**

```powershell
& .\scripts\windows-node-env.ps1 npx.cmd vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/lib/queryClient.test.ts
```

Expected: 3/3 pass, exit 0.

```powershell
& .\scripts\windows-node-env.ps1 npm.cmd run check
```

Expected: 0 TypeScript errors.

- [ ] **Step 1.5: Commit**

```
git add client/src/lib/queryClient.ts tests/unit/lib/queryClient.test.ts
git commit -m "fix(api): preserve specific server error code in ApiError.errorCode"
```

---

## Task 2: Extract shared helpers + refactor workspace page

**Files:**

- Create: `client/src/lib/fund-scenario-workspace-query-keys.ts`
- Create: `client/src/lib/fund-scenario-workspace-api.ts`
- Create: `tests/unit/lib/fund-scenario-workspace-api.test.ts`
- Modify: `client/src/pages/fund-scenario-workspace.tsx`

- [ ] **Step 2.1: Create query key helpers**

Create `client/src/lib/fund-scenario-workspace-query-keys.ts`:

```ts
export function workspaceQueryKey(fundId: string) {
  return ['fund-scenario-workspace', fundId] as const;
}

export function scenarioSetListQueryKey(fundId: string) {
  return [...workspaceQueryKey(fundId), 'scenario-sets'] as const;
}

export function scenarioSetDetailQueryKey(
  fundId: string,
  scenarioSetId: string
) {
  return [
    ...workspaceQueryKey(fundId),
    'scenario-sets',
    scenarioSetId,
    'detail',
  ] as const;
}

export function scenarioSetStatusQueryKey(
  fundId: string,
  scenarioSetId: string
) {
  return [
    ...workspaceQueryKey(fundId),
    'scenario-sets',
    scenarioSetId,
    'status',
  ] as const;
}

export function fundResultsQueryKey(fundId: string) {
  return [...workspaceQueryKey(fundId), 'results'] as const;
}

export function scenarioComparisonQueryKey(
  fundId: string,
  scenarioSetId: string
) {
  return [
    ...workspaceQueryKey(fundId),
    'scenario-sets',
    scenarioSetId,
    'comparison',
  ] as const;
}
```

- [ ] **Step 2.2: Create API path helpers**

Create `client/src/lib/fund-scenario-workspace-api.ts`:

```ts
const FUND_ID_PATTERN = /^\d+$/;
const SCENARIO_SET_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertFundId(fundId: string): void {
  if (!FUND_ID_PATTERN.test(fundId)) {
    throw new Error(`Invalid fund ID: ${fundId}`);
  }
}

export function assertScenarioSetId(scenarioSetId: string): void {
  if (!SCENARIO_SET_ID_PATTERN.test(scenarioSetId)) {
    throw new Error(`Invalid scenario set ID: ${scenarioSetId}`);
  }
}

export function scenarioApiPath(fundId: string, suffix: string): string {
  assertFundId(fundId);
  return `/api/funds/${encodeURIComponent(fundId)}${suffix}`;
}

export function scenarioSetApiPath(
  fundId: string,
  scenarioSetId: string,
  suffix = ''
): string {
  assertScenarioSetId(scenarioSetId);
  return scenarioApiPath(
    fundId,
    `/scenario-sets/${encodeURIComponent(scenarioSetId)}${suffix}`
  );
}
```

- [ ] **Step 2.3: Write API path helper tests**

Create `tests/unit/lib/fund-scenario-workspace-api.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  assertFundId,
  assertScenarioSetId,
  scenarioApiPath,
  scenarioSetApiPath,
} from '../../../client/src/lib/fund-scenario-workspace-api';

const VALID_UUID = '00000000-0000-0000-0000-000000000111';

describe('assertFundId', () => {
  it('accepts numeric strings', () => {
    expect(() => assertFundId('123')).not.toThrow();
  });
  it('rejects non-numeric strings', () => {
    expect(() => assertFundId('abc')).toThrow('Invalid fund ID');
  });
  it('rejects empty string', () => {
    expect(() => assertFundId('')).toThrow('Invalid fund ID');
  });
  it('rejects strings with leading non-digits', () => {
    expect(() => assertFundId('1e1')).toThrow('Invalid fund ID');
  });
});

describe('assertScenarioSetId', () => {
  it('accepts valid UUID', () => {
    expect(() => assertScenarioSetId(VALID_UUID)).not.toThrow();
  });
  it('rejects non-UUID strings', () => {
    expect(() => assertScenarioSetId('not-a-uuid')).toThrow(
      'Invalid scenario set ID'
    );
  });
});

describe('scenarioApiPath', () => {
  it('builds correct path for valid fundId', () => {
    expect(scenarioApiPath('123', '/scenario-sets')).toBe(
      '/api/funds/123/scenario-sets'
    );
  });
  it('throws for invalid fundId', () => {
    expect(() => scenarioApiPath('abc', '/scenario-sets')).toThrow(
      'Invalid fund ID'
    );
  });
});

describe('scenarioSetApiPath', () => {
  it('builds correct path for valid ids', () => {
    expect(scenarioSetApiPath('123', VALID_UUID)).toBe(
      `/api/funds/123/scenario-sets/${VALID_UUID}`
    );
  });
  it('appends suffix when provided', () => {
    expect(scenarioSetApiPath('123', VALID_UUID, '/calculate')).toBe(
      `/api/funds/123/scenario-sets/${VALID_UUID}/calculate`
    );
  });
});
```

- [ ] **Step 2.4: Run helper tests**

```powershell
& .\scripts\windows-node-env.ps1 npx.cmd vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/lib/fund-scenario-workspace-api.test.ts
```

Expected: All pass, exit 0.

- [ ] **Step 2.5: Update workspace page to use imported helpers**

In `client/src/pages/fund-scenario-workspace.tsx`:

**Add two import lines** at the top (after existing imports):

```ts
import {
  fundResultsQueryKey,
  scenarioComparisonQueryKey,
  scenarioSetDetailQueryKey,
  scenarioSetListQueryKey,
  scenarioSetStatusQueryKey,
  workspaceQueryKey,
} from '@/lib/fund-scenario-workspace-query-keys';
import {
  scenarioApiPath,
  scenarioSetApiPath,
} from '@/lib/fund-scenario-workspace-api';
```

**Remove** the following local definitions (they are replaced by the imports
above):

- The constants `FUND_ID_PATH_SEGMENT_PATTERN` and
  `SCENARIO_SET_ID_PATH_SEGMENT_PATTERN`
- The functions `workspaceQueryKey`, `scenarioSetListQueryKey`,
  `scenarioSetDetailQueryKey`, `scenarioSetStatusQueryKey`,
  `fundResultsQueryKey`, `scenarioComparisonQueryKey`
- The functions `assertFundId`, `assertScenarioSetId`, `scenarioApiPath`,
  `scenarioSetApiPath`

**Keep** `useWorkspaceFundId` but inline its pattern check. Replace:

```ts
// Before (uses the removed constant)
return fundId && FUND_ID_PATH_SEGMENT_PATTERN.test(fundId) ? fundId : null;

// After (inline — no external dependency needed for this one-liner)
return fundId && /^\d+$/.test(fundId) ? fundId : null;
```

- [ ] **Step 2.6: Verify existing workspace tests still pass**

```powershell
& .\scripts\windows-node-env.ps1 npx.cmd vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/pages/fund-scenario-workspace.test.tsx
```

Expected: All existing tests pass.

```powershell
& .\scripts\windows-node-env.ps1 npm.cmd run check
```

Expected: 0 errors.

- [ ] **Step 2.7: Commit**

```
git add client/src/lib/fund-scenario-workspace-query-keys.ts \
  client/src/lib/fund-scenario-workspace-api.ts \
  client/src/pages/fund-scenario-workspace.tsx \
  tests/unit/lib/fund-scenario-workspace-api.test.ts
git commit -m "refactor(scenarios): extract workspace query key and API path helpers"
```

---

## Task 3: Write failing modal tests

**Files:**

- Create:
  `tests/unit/components/scenarios/CreateMethodologyScenarioModal.test.tsx`

All tests in this task will fail (the modal component does not exist yet). That
is the expected TDD state.

- [ ] **Step 3.1: Create test file**

Create
`tests/unit/components/scenarios/CreateMethodologyScenarioModal.test.tsx`:

```tsx
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CreateMethodologyScenarioModal,
  buildCreateMethodologyScenarioPayload,
} from '../../../../client/src/components/scenarios/CreateMethodologyScenarioModal';
import type { FundScenarioSetDetailV1 } from '../../../../shared/contracts/fund-scenario-sets-v1.contract';

// ─── Helpers ────────────────────────────────────────────────────────────────

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
        override: {
          overrideType: 'methodology',
          payload: { waterfallType: 'american' },
        },
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
    expect(result.variants[0]?.override.payload).toEqual({
      waterfallType: 'american',
    });
    expect(
      'managementFeeRate' in (result.variants[0]?.override.payload ?? {})
    ).toBe(false);
  });

  it('builds payload with managementFeeRate only', () => {
    const result = buildCreateMethodologyScenarioPayload({
      scenarioSetName: 'Fee test',
      variantName: 'Fee variant',
      waterfallType: undefined,
      managementFeeRate: 2,
    });
    expect(result.variants[0]?.override.payload).toEqual({
      managementFeeRate: 2,
    });
    expect(
      'waterfallType' in (result.variants[0]?.override.payload ?? {})
    ).toBe(false);
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
    expect(
      (result.variants[0]?.override.payload as { managementFeeRate: number })
        .managementFeeRate
    ).toBe(2.5);
  });

  it('submits zero fee as a real override value', () => {
    const result = buildCreateMethodologyScenarioPayload({
      scenarioSetName: 'Zero',
      variantName: 'v',
      waterfallType: undefined,
      managementFeeRate: 0,
    });
    expect(result.variants[0]?.override.payload).toEqual({
      managementFeeRate: 0,
    });
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
  });

  it('does not render dialog content when closed', () => {
    renderModal({ open: false });
    expect(
      screen.queryByLabelText(/scenario set name/i)
    ).not.toBeInTheDocument();
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
    expect(
      await screen.findByText(/specify at least one override/i)
    ).toBeInTheDocument();
  });

  it('shows field error for negative management fee', async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText(/scenario set name/i), {
      target: { value: 'S' },
    });
    fireEvent.change(screen.getByLabelText(/variant name/i), {
      target: { value: 'V' },
    });
    fireEvent.change(screen.getByLabelText(/management fee rate/i), {
      target: { value: '-1', valueAsNumber: -1 },
    });
    fireEvent.click(screen.getByRole('button', { name: /create scenario/i }));
    await waitFor(() => {
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  it('shows field error for fee above 100', async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText(/scenario set name/i), {
      target: { value: 'S' },
    });
    fireEvent.change(screen.getByLabelText(/variant name/i), {
      target: { value: 'V' },
    });
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
    fireEvent.change(screen.getByLabelText(/variant name/i), {
      target: { value: 'Fee v' },
    });
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
  });

  it('shows duplicate_scenario_set_name error under name field', async () => {
    fetchSpy.mockResolvedValueOnce(
      errorResponse(409, 'duplicate_scenario_set_name', 'Already exists')
    );
    renderModal();
    fireEvent.change(screen.getByLabelText(/scenario set name/i), {
      target: { value: 'S' },
    });
    fireEvent.change(screen.getByLabelText(/variant name/i), {
      target: { value: 'V' },
    });
    fireEvent.change(screen.getByLabelText(/management fee rate/i), {
      target: { value: '2', valueAsNumber: 2 },
    });
    fireEvent.click(screen.getByRole('button', { name: /create scenario/i }));
    expect(
      await screen.findByText(/a scenario set with this name already exists/i)
    ).toBeInTheDocument();
  });

  it('shows max_scenario_sets banner', async () => {
    fetchSpy.mockResolvedValueOnce(
      errorResponse(409, 'max_scenario_sets', 'Max reached')
    );
    renderModal();
    fireEvent.change(screen.getByLabelText(/scenario set name/i), {
      target: { value: 'S' },
    });
    fireEvent.change(screen.getByLabelText(/variant name/i), {
      target: { value: 'V' },
    });
    fireEvent.change(screen.getByLabelText(/management fee rate/i), {
      target: { value: '2', valueAsNumber: 2 },
    });
    fireEvent.click(screen.getByRole('button', { name: /create scenario/i }));
    expect(
      await screen.findByText(/maximum of 10 active scenario sets/i)
    ).toBeInTheDocument();
  });

  it('shows no_published_config banner', async () => {
    fetchSpy.mockResolvedValueOnce(
      errorResponse(409, 'no_published_config', 'No config')
    );
    renderModal();
    fireEvent.change(screen.getByLabelText(/scenario set name/i), {
      target: { value: 'S' },
    });
    fireEvent.change(screen.getByLabelText(/variant name/i), {
      target: { value: 'V' },
    });
    fireEvent.change(screen.getByLabelText(/management fee rate/i), {
      target: { value: '2', valueAsNumber: 2 },
    });
    fireEvent.click(screen.getByRole('button', { name: /create scenario/i }));
    expect(
      await screen.findByText(/publish a fund configuration/i)
    ).toBeInTheDocument();
  });

  it('disables Create button while mutation is pending', async () => {
    // Never resolves — keeps mutation in pending state
    fetchSpy.mockReturnValueOnce(new Promise(() => {}));
    renderModal();
    fireEvent.change(screen.getByLabelText(/scenario set name/i), {
      target: { value: 'S' },
    });
    fireEvent.change(screen.getByLabelText(/variant name/i), {
      target: { value: 'V' },
    });
    fireEvent.change(screen.getByLabelText(/management fee rate/i), {
      target: { value: '2', valueAsNumber: 2 },
    });
    fireEvent.click(screen.getByRole('button', { name: /create scenario/i }));
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /create scenario/i })
      ).toBeDisabled();
    });
  });

  it('blocks close while mutation is pending (Cancel click is a no-op)', async () => {
    fetchSpy.mockReturnValueOnce(new Promise(() => {}));
    const onOpenChange = vi.fn();
    renderModal({ onOpenChange });
    fireEvent.change(screen.getByLabelText(/scenario set name/i), {
      target: { value: 'S' },
    });
    fireEvent.change(screen.getByLabelText(/variant name/i), {
      target: { value: 'V' },
    });
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
    // Close
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    // Re-open
    fireEvent.click(screen.getByRole('button', { name: /toggle/i }));
    expect(await screen.findByLabelText(/scenario set name/i)).toHaveValue('');
  });

  it('calls onSuccess with the created detail on successful submit', async () => {
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
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ id: detail.id })
      )
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
        expect.objectContaining({
          queryKey: ['fund-scenario-workspace', '123'],
        })
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
        [
          'fund-scenario-workspace',
          '123',
          'scenario-sets',
          detail.id,
          'detail',
        ],
        expect.objectContaining({ id: detail.id })
      );
    });
  });
});
```

- [ ] **Step 3.2: Run tests to confirm RED state**

```powershell
& .\scripts\windows-node-env.ps1 npx.cmd vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/components/scenarios/CreateMethodologyScenarioModal.test.tsx
```

Expected: Tests fail with "Cannot find module" or similar — the component file
does not exist yet.

---

## Task 4: Implement the modal component

**Files:**

- Create: `client/src/components/scenarios/CreateMethodologyScenarioModal.tsx`

- [ ] **Step 4.1: Create the modal component**

Create `client/src/components/scenarios/CreateMethodologyScenarioModal.tsx`:

```tsx
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiRequest, ApiError } from '@/lib/queryClient';
import { scenarioApiPath } from '@/lib/fund-scenario-workspace-api';
import {
  scenarioSetDetailQueryKey,
  workspaceQueryKey,
} from '@/lib/fund-scenario-workspace-query-keys';
import {
  FundScenarioSetDetailV1Schema,
  type FundScenarioSetDetailV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';
import type { CreateFundScenarioSetV1 } from '@shared/contracts/fund-scenario-sets-v1.contract';

// ─── Schema ──────────────────────────────────────────────────────────────────

const OptionalPercentageNumberSchema = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  if (typeof value === 'number' && Number.isNaN(value)) return undefined;
  return Number(value);
}, z.number().finite().min(0).max(100).optional());

const CreateMethodologyScenarioFormSchema = z
  .object({
    scenarioSetName: z.string().trim().min(1, 'Required').max(120),
    variantName: z.string().trim().min(1, 'Required').max(120),
    waterfallType: z.enum(['american', 'hybrid']).optional(),
    managementFeeRate: OptionalPercentageNumberSchema,
  })
  .refine(
    (data) =>
      data.waterfallType !== undefined || data.managementFeeRate !== undefined,
    {
      message:
        'Specify at least one override: waterfall type or management fee rate.',
      path: ['waterfallType'],
    }
  );

type CreateMethodologyScenarioFormValues = z.infer<
  typeof CreateMethodologyScenarioFormSchema
>;

const WATERFALL_UNSET_VALUE = '__unset__';

// ─── Payload builder (exported for direct testing) ────────────────────────────

export function buildCreateMethodologyScenarioPayload(
  values: CreateMethodologyScenarioFormValues
): CreateFundScenarioSetV1 {
  return {
    name: values.scenarioSetName,
    variants: [
      {
        name: values.variantName,
        override: {
          overrideType: 'methodology',
          payload: {
            ...(values.waterfallType
              ? { waterfallType: values.waterfallType }
              : {}),
            ...(values.managementFeeRate !== undefined
              ? { managementFeeRate: values.managementFeeRate }
              : {}),
          },
        },
      },
    ],
  };
}

// ─── Error helper ─────────────────────────────────────────────────────────────

function extractErrorCode(error: unknown): string | null {
  return error instanceof ApiError ? (error.errorCode ?? null) : null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface CreateMethodologyScenarioModalProps {
  fundId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (created: FundScenarioSetDetailV1) => void;
}

export function CreateMethodologyScenarioModal({
  fundId,
  open,
  onOpenChange,
  onSuccess,
}: CreateMethodologyScenarioModalProps) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<CreateMethodologyScenarioFormValues>({
    resolver: zodResolver(CreateMethodologyScenarioFormSchema),
    defaultValues: {
      scenarioSetName: '',
      variantName: '',
      waterfallType: undefined,
      managementFeeRate: undefined,
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateFundScenarioSetV1) =>
      apiRequest(
        'POST',
        scenarioApiPath(fundId, '/scenario-sets'),
        payload
      ).then((raw) => FundScenarioSetDetailV1Schema.parse(raw)),
    onMutate: () => {
      setServerError(null);
    },
    onSuccess: async (created) => {
      queryClient.setQueryData(
        scenarioSetDetailQueryKey(fundId, created.id),
        created
      );
      await queryClient.invalidateQueries({
        queryKey: workspaceQueryKey(fundId),
      });
      form.reset();
      setServerError(null);
      onOpenChange(false);
      onSuccess(created);
    },
    onError: (error) => {
      const code = extractErrorCode(error);
      if (code === 'duplicate_scenario_set_name') {
        form.setError('scenarioSetName', {
          message: 'A scenario set with this name already exists.',
        });
      } else if (code === 'max_scenario_sets') {
        setServerError(
          'This fund has reached the maximum of 10 active scenario sets.'
        );
      } else if (code === 'no_published_config') {
        setServerError(
          'Publish a fund configuration before creating scenarios.'
        );
      } else {
        setServerError('Failed to create scenario. Please try again.');
      }
    },
  });

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && createMutation.isPending) return;
    if (!nextOpen) {
      form.reset();
      setServerError(null);
    }
    onOpenChange(nextOpen);
  }

  function onSubmit(values: CreateMethodologyScenarioFormValues) {
    createMutation.mutate(buildCreateMethodologyScenarioPayload(values));
  }

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = form;

  const waterfallTypeValue = watch('waterfallType');

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-inter text-charcoal">
            New methodology scenario
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Scenario set name */}
          <div className="space-y-1">
            <Label
              htmlFor="scenarioSetName"
              className="font-poppins text-sm text-charcoal"
            >
              Scenario set name
            </Label>
            <Input
              id="scenarioSetName"
              {...register('scenarioSetName')}
              placeholder="e.g. Waterfall comparison"
              aria-label="Scenario set name"
            />
            {errors.scenarioSetName && (
              <p className="text-xs text-error-dark font-poppins">
                {errors.scenarioSetName.message}
              </p>
            )}
          </div>

          {/* Variant name */}
          <div className="space-y-1">
            <Label
              htmlFor="variantName"
              className="font-poppins text-sm text-charcoal"
            >
              Variant name
            </Label>
            <Input
              id="variantName"
              {...register('variantName')}
              placeholder="e.g. American waterfall"
              aria-label="Variant name"
            />
            {errors.variantName && (
              <p className="text-xs text-error-dark font-poppins">
                {errors.variantName.message}
              </p>
            )}
          </div>

          {/* Override fields */}
          <div className="space-y-3 rounded-md border border-beige-200 p-3">
            <p className="font-poppins text-xs uppercase text-charcoal-400">
              At least one override required
            </p>

            {/* Waterfall type */}
            <div className="space-y-1">
              <Label
                htmlFor="waterfallType"
                className="font-poppins text-sm text-charcoal"
              >
                Waterfall type
              </Label>
              <Select
                value={waterfallTypeValue ?? WATERFALL_UNSET_VALUE}
                onValueChange={(value) =>
                  setValue(
                    'waterfallType',
                    value === WATERFALL_UNSET_VALUE
                      ? undefined
                      : (value as 'american' | 'hybrid'),
                    { shouldValidate: true }
                  )
                }
              >
                <SelectTrigger id="waterfallType" aria-label="Waterfall type">
                  <SelectValue placeholder="No change" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={WATERFALL_UNSET_VALUE}>
                    No change
                  </SelectItem>
                  <SelectItem value="american">
                    American (deal-by-deal)
                  </SelectItem>
                  <SelectItem value="hybrid">Hybrid (fund-level)</SelectItem>
                </SelectContent>
              </Select>
              {errors.waterfallType && (
                <p className="text-xs text-error-dark font-poppins">
                  {errors.waterfallType.message}
                </p>
              )}
            </div>

            {/* Management fee rate */}
            <div className="space-y-1">
              <Label
                htmlFor="managementFeeRate"
                className="font-poppins text-sm text-charcoal"
              >
                Management fee rate
              </Label>
              <div className="relative">
                <Input
                  id="managementFeeRate"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  inputMode="decimal"
                  placeholder="e.g. 2"
                  className="pr-7"
                  aria-label="Management fee rate"
                  {...register('managementFeeRate', { valueAsNumber: true })}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-charcoal-400">
                  %
                </span>
              </div>
              {errors.managementFeeRate && (
                <p className="text-xs text-error-dark font-poppins">
                  {errors.managementFeeRate.message}
                </p>
              )}
            </div>
          </div>

          {/* Server error banner */}
          {serverError && (
            <Alert className="border-error/20 bg-error/5">
              <AlertDescription className="font-poppins text-sm text-error-dark">
                {serverError}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending}
              className="bg-charcoal text-white hover:bg-charcoal/90"
            >
              {createMutation.isPending ? 'Creating…' : 'Create scenario'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4.2: Run modal tests**

```powershell
& .\scripts\windows-node-env.ps1 npx.cmd vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/components/scenarios/CreateMethodologyScenarioModal.test.tsx
```

Expected: Most tests pass. If Radix Select interactions fail, the
`waterfallType` tests may need adjustment. The managementFeeRate tests should
pass since they use `fireEvent.change` with `valueAsNumber`.

- [ ] **Step 4.3: Verify Radix Select tests pass in jsdom**

The modal uses `setValue` + `watch` for the waterfall select (not a
`<Controller>`). In jsdom, Radix Select renders a trigger button with role
`combobox`. If the waterfallType tests fail because the Select portal does not
render in jsdom, add `data-testid="waterfall-select-trigger"` to the
`<SelectTrigger>` and use
`fireEvent.click(screen.getByTestId('waterfall-select-trigger'))` followed by
`fireEvent.click(screen.getByRole('option', { name: /american/i }))`. The tests
that use the fee-rate field only (no waterfallType) are not affected by this.

- [ ] **Step 4.4: Run typecheck**

```powershell
& .\scripts\windows-node-env.ps1 npm.cmd run check
```

Expected: 0 errors.

- [ ] **Step 4.5: Commit**

```
git add client/src/components/scenarios/CreateMethodologyScenarioModal.tsx \
  tests/unit/components/scenarios/CreateMethodologyScenarioModal.test.tsx
git commit -m "feat(scenarios): add CreateMethodologyScenarioModal with Zod form + mutation"
```

---

## Task 5: Wire modal into workspace page

**Files:**

- Modify: `client/src/pages/fund-scenario-workspace.tsx`
- Modify: `tests/unit/pages/fund-scenario-workspace.test.tsx`

- [ ] **Step 5.1: Add highlight prop to ScenarioSetActionCard**

In `client/src/pages/fund-scenario-workspace.tsx`, find `ScenarioSetActionCard`
(around line 386). Add `isHighlighted?: boolean` to its props interface and
apply a ring class to the article element:

```tsx
// Props interface addition
isHighlighted?: boolean;

// Article element — replace existing className
className={cn(
  'rounded-md border border-beige-200 bg-white p-4',
  isHighlighted && 'ring-2 ring-charcoal'
)}
```

Add `cn` import if not already present: `import { cn } from '@/lib/utils';`

- [ ] **Step 5.2: Pass highlight through ScenarioActionList**

In `ScenarioActionList`, add `highlightedScenarioSetId?: string | null` to props
and pass `isHighlighted={summary.id === highlightedScenarioSetId}` to each
`ScenarioSetActionCard`.

- [ ] **Step 5.3: Add state, button cluster, and modal mount to
      FundScenarioWorkspacePage**

In `FundScenarioWorkspacePage`, add:

```tsx
// After existing useState declarations
const [isCreateMethodologyOpen, setIsCreateMethodologyOpen] = useState(false);
const [highlightedScenarioSetId, setHighlightedScenarioSetId] = useState<
  string | null
>(null);
```

Add the modal import at the top of the file:

```ts
import { CreateMethodologyScenarioModal } from '@/components/scenarios/CreateMethodologyScenarioModal';
```

Replace the header
`<div className="flex flex-wrap items-center justify-between gap-3">` content.
Currently it has one button on the right. Wrap the right side in a group:

```tsx
<div className="flex flex-wrap items-center justify-between gap-3">
  <Button asChild variant="outline" size="sm">
    <Link href={`/fund-model-results/${fundId}`}>
      <ArrowLeft className="h-4 w-4" />
      Back to Results
    </Link>
  </Button>
  <div className="flex flex-wrap items-center gap-2">
    <Button
      variant="outline"
      size="sm"
      onClick={() => setIsCreateMethodologyOpen(true)}
    >
      New methodology scenario
    </Button>
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={createReserveOptimizationMutation.isPending}
      onClick={() => createReserveOptimizationMutation.mutate()}
    >
      {createReserveOptimizationMutation.isPending && (
        <RefreshCw className="h-4 w-4 animate-spin" />
      )}
      {createReserveOptimizationMutation.isPending
        ? 'Creating'
        : 'Create optimized reserve plan'}
    </Button>
  </div>
</div>
```

Add the modal mount just before the closing `</div>` of the page root:

```tsx
<CreateMethodologyScenarioModal
  fundId={fundId}
  open={isCreateMethodologyOpen}
  onOpenChange={setIsCreateMethodologyOpen}
  onSuccess={(created) => setHighlightedScenarioSetId(created.id)}
/>
```

Pass `highlightedScenarioSetId` to `ScenarioActionList`:

```tsx
<ScenarioActionList
  scenarioSets={scenarioSets}
  detailById={detailById}
  statusById={statusById}
  pendingScenarioSetId={pendingScenarioSetId}
  highlightedScenarioSetId={highlightedScenarioSetId}
  onCalculate={(detail) => {
    setPendingScenarioSetId(detail.id);
    calculateMutation.mutate(detail);
  }}
/>
```

- [ ] **Step 5.4: Add thin workspace integration test**

In `tests/unit/pages/fund-scenario-workspace.test.tsx`, add a new `it` block
inside the main `describe('FundScenarioWorkspacePage', ...)` block:

```ts
it('renders New methodology scenario button and opens modal on click', async () => {
  mockWorkspaceFetches();
  renderWorkspace();

  const newScenarioBtn = await screen.findByRole('button', {
    name: /new methodology scenario/i,
  });
  expect(newScenarioBtn).toBeInTheDocument();

  fireEvent.click(newScenarioBtn);
  expect(await screen.findByRole('dialog')).toBeInTheDocument();

  // No create POST issued merely by opening
  const createPosts = fetchSpy.mock.calls.filter(
    ([url, init]: [string, RequestInit]) =>
      url.includes('/scenario-sets') &&
      (init?.method ?? 'GET') === 'POST' &&
      !url.includes('/reserve-optimization') &&
      !url.includes('/calculate')
  );
  expect(createPosts).toHaveLength(0);
});
```

- [ ] **Step 5.5: Run all workspace and modal tests**

```powershell
& .\scripts\windows-node-env.ps1 npx.cmd vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/pages/fund-scenario-workspace.test.tsx tests/unit/components/scenarios/CreateMethodologyScenarioModal.test.tsx
```

Expected: All pass, exit 0.

```powershell
& .\scripts\windows-node-env.ps1 npm.cmd run check
```

Expected: 0 errors.

- [ ] **Step 5.6: Commit**

```
git add client/src/pages/fund-scenario-workspace.tsx \
  tests/unit/pages/fund-scenario-workspace.test.tsx
git commit -m "feat(scenarios): wire CreateMethodologyScenarioModal into workspace page"
```

---

## Task 6: Final verification

- [ ] **Step 6.1: Run all focused tests**

```powershell
& .\scripts\windows-node-env.ps1 npx.cmd vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/lib/queryClient.test.ts tests/unit/lib/fund-scenario-workspace-api.test.ts
```

Expected: All pass.

```powershell
& .\scripts\windows-node-env.ps1 npx.cmd vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/components/scenarios/CreateMethodologyScenarioModal.test.tsx tests/unit/pages/fund-scenario-workspace.test.tsx
```

Expected: All pass.

- [ ] **Step 6.2: Run scenario release gate**

```powershell
& .\scripts\windows-node-env.ps1 npm.cmd run test:scenario-release-gate
```

Expected: Passes, exit 0.

- [ ] **Step 6.3: Typecheck**

```powershell
& .\scripts\windows-node-env.ps1 npm.cmd run check
```

Expected: 0 errors.

- [ ] **Step 6.4: Lint**

```powershell
& .\scripts\windows-node-env.ps1 npm.cmd run lint
```

Expected: 0 errors.
