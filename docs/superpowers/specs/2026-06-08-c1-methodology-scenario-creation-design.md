---
status: COMPLETE
audience: agents
last_updated: 2026-06-13
owner: 'Platform Team'
---

# C1: Methodology Scenario Creation UI — Design Spec

**Date:** 2026-06-08 **Branch:** main (off `46373b70`, #817) **Goal:** Add a
"New methodology scenario" modal to the workspace so GPs can create a
`methodology` scenario set with one variant directly from the UI, without a
direct API call.

---

## Scope

Methodology-only, one variant per creation. `waterfallTiers` is intentionally
excluded because tier editing needs a dedicated workflow. `waterfallType` and
`managementFeeRate` are the only C1 override fields.

---

## Problem

The scenario workspace (`/fund-model-results/:fundId/scenarios`) is
read/calculate-only. The only creation action today is "Create optimized reserve
plan" (a specialized reserve path). Creating a `methodology`, `fee_profile`,
`allocation`, or `sector_profile` scenario set requires a direct API call. The
backend create path (`POST /api/funds/:fundId/scenario-sets`,
`createFundScenarioSet` service, `CreateFundScenarioSetV1Schema`) is fully
implemented and tested.

---

## Non-Goals

- No `waterfallTiers` field in this modal.
- No multi-variant form (one variant only in this pass).
- No `fee_profile`, `allocation`, or `sector_profile` creation forms.
- No new API routes or schema changes.
- No changes to the comparison or calculation surfaces.

---

## Section 1: Architecture + Component Interface

**New files:**

- `client/src/components/scenarios/CreateMethodologyScenarioModal.tsx` — modal
  component
- `client/src/lib/fund-scenario-workspace-query-keys.ts` — shared cache key
  helpers
- `client/src/lib/fund-scenario-workspace-api.ts` — shared API path helpers

The modal is a self-contained feature component. Public interface:

```ts
interface CreateMethodologyScenarioModalProps {
  fundId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (created: FundScenarioSetDetailV1) => void;
}
```

`fundId` is the validated numeric string from the workspace route. `onSuccess`
receives the created detail so the workspace can highlight the new card.
`onOpenChange` follows shadcn Dialog convention — workspace passes
`setIsCreateMethodologyOpen`.

The mutation (`useMutation`) and cache invalidation live inside the modal. The
workspace `onSuccess` is a downstream hook for highlight/scroll behavior.

### Query key extraction

New file: `client/src/lib/fund-scenario-workspace-query-keys.ts`

Extracts cache key helpers currently private to `fund-scenario-workspace.tsx`:

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

`fund-scenario-workspace.tsx` replaces its local definitions with imports from
this module.

### API path helpers

New file: `client/src/lib/fund-scenario-workspace-api.ts`

Centralizes the path validation and construction currently local to
`fund-scenario-workspace.tsx`:

```ts
const FUND_ID_PATTERN = /^\d+$/;
const SCENARIO_SET_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertFundId(fundId: string): void {
  if (!FUND_ID_PATTERN.test(fundId)) throw new Error('Invalid fund ID');
}

export function assertScenarioSetId(scenarioSetId: string): void {
  if (!SCENARIO_SET_ID_PATTERN.test(scenarioSetId))
    throw new Error('Invalid scenario set ID');
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

`fund-scenario-workspace.tsx` replaces its local definitions with imports from
this module. The modal uses `scenarioApiPath(fundId, '/scenario-sets')` for the
POST path.

### Workspace integration

```tsx
// State
const [isCreateMethodologyOpen, setIsCreateMethodologyOpen] = useState(false);
const [highlightedScenarioSetId, setHighlightedScenarioSetId] = useState<string | null>(null);

// Header (right-side button cluster)
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
      {createReserveOptimizationMutation.isPending ? 'Creating' : 'Create optimized reserve plan'}
    </Button>
  </div>
</div>

// Modal mount
<CreateMethodologyScenarioModal
  fundId={fundId}
  open={isCreateMethodologyOpen}
  onOpenChange={setIsCreateMethodologyOpen}
  onSuccess={(created) => setHighlightedScenarioSetId(created.id)}
/>
```

`highlightedScenarioSetId` is passed to `ScenarioActionList` /
`ScenarioSetActionCard` to visually indicate the newly created card (e.g. a
`ring` border or "New" badge). It is cleared when the user first interacts with
the card or after a short timeout. This separates creation UX from calculation
UX — users see the new card appear and then click Calculate themselves.

---

## Section 2: Form Schema + Submission Shape

**Client-side form schema:**

```ts
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
```

The `.refine` error is placed on `waterfallType` so it surfaces near the first
override field.

**`managementFeeRate` range note:** The backend
`MethodologyOverridePayloadV1Schema` accepts `z.number().optional()` with no
range constraint. The 0–100 range and `finite()` guard are client-side product
rules, not server-derived. Test coverage for 0, 2.5, negative, and out-of-range
values is required (see Section 4).

**Payload transform (exported):**

```ts
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
```

`managementFeeRate` is submitted as the percentage value (e.g., `2` for 2%,
`2.5` for 2.5%) — matching `FundDraftWriteV1Schema` convention. Do not divide by
100 in the modal.

---

## Section 3: Component Internals

### Prerequisite: `apiRequest` error body fix

**This is a required blocker before the modal error handling will work.**

Current `client/src/lib/queryClient.ts` line ~83:

```ts
// Before
throw new ApiError(
  response.status,
  errorMessage,
  errorData.error,
  errorData.issues
);
```

The server emits both `error` (generic HTTP reason like `'conflict'`) and `code`
(specific, like `'duplicate_scenario_set_name'`). Update `apiRequest` to capture
`code`:

```ts
// Updated ErrorBody type (add code + details)
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
throw new ApiError(response.status, errorMessage, errorCode, errorData.issues);
```

The `details` field is captured in the type but not threaded into `ApiError` in
this pass — it is preserved so a future normalization pass can expose it without
another type widening. The modal helper then becomes:

```ts
import { ApiError } from '@/lib/queryClient';
function extractErrorCode(error: unknown): string | null {
  return error instanceof ApiError ? (error.errorCode ?? null) : null;
}
```

### Form setup

```ts
const form = useForm<CreateMethodologyScenarioFormValues>({
  resolver: zodResolver(CreateMethodologyScenarioFormSchema),
  defaultValues: {
    scenarioSetName: '',
    variantName: '',
    waterfallType: undefined,
    managementFeeRate: undefined,
  },
});
```

### Mutation

```ts
const queryClient = useQueryClient();
const [serverError, setServerError] = useState<string | null>(null);

const createMutation = useMutation({
  mutationFn: (payload: CreateFundScenarioSetV1) =>
    apiRequest('POST', scenarioApiPath(fundId, '/scenario-sets'), payload).then(
      (raw) => FundScenarioSetDetailV1Schema.parse(raw)
    ),
  onMutate: () => {
    setServerError(null);
  },
  onSuccess: async (created) => {
    // Seed detail cache immediately so the card loads without a second fetch.
    queryClient.setQueryData(
      scenarioSetDetailQueryKey(fundId, created.id),
      created
    );
    // Then invalidate the list/root to refresh the scenario set list and results.
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
      setServerError('Publish a fund configuration before creating scenarios.');
    } else {
      setServerError('Failed to create scenario. Please try again.');
    }
  },
});
```

### Idempotency

C1 defers idempotency key support. The submit button is disabled while the
mutation is pending, which is the only duplicate-protection mechanism in this
pass. A follow-on pass should add:

```ts
// In mutationFn options
headers: { 'Idempotency-Key': crypto.randomUUID() },
```

The backend already supports this via `x-idempotency-key` — the create service
resolves, hashes, and replays existing scenario sets on key reuse.

### Close guard

```ts
function handleOpenChange(nextOpen: boolean) {
  if (!nextOpen && createMutation.isPending) return;
  if (!nextOpen) {
    form.reset();
    setServerError(null);
  }
  onOpenChange(nextOpen);
}

// <Dialog open={open} onOpenChange={handleOpenChange}>
```

This guards all `onOpenChange(false)` sources — Cancel button, Escape key, and
overlay click — via Radix's single `onOpenChange` callback.

### Waterfall select sentinel

```ts
const WATERFALL_UNSET_VALUE = '__unset__';

// In the Controller render:
<Select
  value={field.value ?? WATERFALL_UNSET_VALUE}
  onValueChange={(value) =>
    field.onChange(value === WATERFALL_UNSET_VALUE ? undefined : value)
  }
>
  <SelectItem value={WATERFALL_UNSET_VALUE}>No change</SelectItem>
  <SelectItem value="american">American (deal-by-deal)</SelectItem>
  <SelectItem value="hybrid">Hybrid (fund-level)</SelectItem>
</Select>
```

Display labels clarify the waterfall styles without changing the payload enum.

### Management fee rate input

```tsx
<Input
  type="number"
  min={0}
  max={100}
  step="0.01"
  inputMode="decimal"
  placeholder="e.g. 2"
  {...form.register('managementFeeRate', { valueAsNumber: true })}
/>
```

The `z.preprocess` handles `NaN` from an empty number input. `step="0.01"` and
`inputMode="decimal"` enable decimal entry on mobile.

### Field layout

```
DialogHeader → "New methodology scenario"
──────────────────────────────────────────────
Label: Scenario set name    [Input]            ← required, error below
Label: Variant name         [Input]            ← required, error below
──────────────────────────────────────────────
At least one override required:
Label: Waterfall type       [Select]           ← cross-field error appears here
Label: Management fee rate  [Input, "%" suffix]
──────────────────────────────────────────────
[server error alert banner if present]
──────────────────────────────────────────────
DialogFooter:  [Cancel]  [Create scenario]     ← Create disabled while isPending
```

---

## Section 4: Tests

### 4a. `tests/unit/lib/queryClient.test.ts` (new file) — REQUIRED BLOCKER

**Case: `apiRequest` preserves specific server error code** Mock a 409 response
body
`{ error: 'conflict', code: 'duplicate_scenario_set_name', message: '...' }`.
Assert `ApiError.errorCode === 'duplicate_scenario_set_name'` (not
`'conflict'`).

**Case: `apiRequest` handles response with `details` field without crashing**
Mock a 400 response body
`{ error: 'invalid_request', message: '...', details: { issues: [...] } }`.
Assert no crash and `ApiError.errorCode === 'invalid_request'`.

### 4b. `buildCreateMethodologyScenarioPayload` unit tests

- **waterfallType only** — payload contains `{ waterfallType: 'american' }`, no
  `managementFeeRate` key
- **managementFeeRate only** — payload contains `{ managementFeeRate: 2 }`, no
  `waterfallType` key
- **both fields** — payload contains both keys
- **name mapping** — `scenarioSetName` → `payload.name`; `variantName` →
  `payload.variants[0].name`
- **decimal fee** — `managementFeeRate: 2.5` → `{ managementFeeRate: 2.5 }` (not
  divided by 100)
- **zero fee** — `managementFeeRate: 0` is a valid override, payload contains
  `{ managementFeeRate: 0 }`

### 4c. `tests/unit/components/scenarios/CreateMethodologyScenarioModal.test.tsx` (new file)

| Case                                        | Setup                                                                | Assert                                                                                     |
| ------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Renders fields when open                    | `open=true`                                                          | Name, variant name, waterfall type, fee rate inputs present                                |
| Hidden when closed                          | `open=false`                                                         | Dialog content not in DOM                                                                  |
| Empty submit shows required errors          | Submit without filling                                               | "Required" under name + variant name                                                       |
| Cross-field refine                          | Fill both name fields, leave both override fields unset, submit      | Cross-field error near waterfall select                                                    |
| Valid submit (waterfallType only)           | Fill names + select 'american'                                       | `fetch` POST body has `payload: { waterfallType: 'american' }`, no `managementFeeRate` key |
| Valid submit (managementFeeRate only)       | Fill names + type `2` in fee field                                   | `fetch` POST body has `payload: { managementFeeRate: 2 }`, no `waterfallType` key          |
| Decimal fee submits correctly               | Type `2.5`                                                           | POST body has `{ managementFeeRate: 2.5 }`                                                 |
| Zero fee is valid                           | Type `0`, select no waterfall                                        | POST body has `{ managementFeeRate: 0 }`                                                   |
| Negative fee shows error                    | Type `-1`                                                            | Field error shown, no POST issued                                                          |
| Out-of-range fee shows error                | Type `101`                                                           | Field error shown, no POST issued                                                          |
| `duplicate_scenario_set_name` → field error | Mock 409 `duplicate_scenario_set_name`                               | Error message under scenario set name field                                                |
| `max_scenario_sets` → banner                | Mock 409 `max_scenario_sets`                                         | Alert banner with max-sets message                                                         |
| `no_published_config` → banner              | Mock 409 `no_published_config`                                       | Alert banner with publish-config message                                                   |
| Submit disabled while pending               | Mock fetch with deferred promise                                     | Create button is `disabled`                                                                |
| Close blocked while pending                 | Mock fetch with deferred promise, trigger close                      | `onOpenChange` not called                                                                  |
| Reset on close                              | Parent harness: open → fill → close → reopen                         | Fields show default values                                                                 |
| `onSuccess` called with detail              | Mock successful response with full `FundScenarioSetDetailV1` fixture | Callback receives the parsed detail                                                        |
| Cache invalidated on success                | Spy on `queryClient.invalidateQueries`                               | Called with `{ queryKey: workspaceQueryKey(fundId) }`                                      |
| Detail seeded in cache on success           | Spy on `queryClient.setQueryData`                                    | Called with `scenarioSetDetailQueryKey(fundId, created.id)` and the created detail         |

**Notes:**

- Pending-state tests need a deferred promise (never resolves during assertion
  window).
- Close-blocked: test Cancel button click and/or verify
  `handleOpenChange(false)` is a no-op while pending. Radix routes Escape and
  overlay through the same `onOpenChange`.
- Reset-on-close: requires a small wrapper component owning `open` state.
- Success fixture must be a complete `FundScenarioSetDetailV1` (schema-valid,
  including all required summary fields + `variants` array).

### 4d. `tests/unit/pages/fund-scenario-workspace.test.tsx` — thin integration

Add to the primary workspace test:

```ts
// Button renders
expect(
  screen.getByRole('button', { name: /new methodology scenario/i })
).toBeInTheDocument();

// Click opens modal
fireEvent.click(
  screen.getByRole('button', { name: /new methodology scenario/i })
);
expect(await screen.findByRole('dialog')).toBeInTheDocument();

// No create POST issued merely by opening
const createPosts = fetchSpy.mock.calls.filter(
  ([url, init]) =>
    typeof url === 'string' &&
    url.includes('/scenario-sets') &&
    (init?.method ?? 'GET') === 'POST' &&
    !url.includes('/reserve-optimization') &&
    !url.includes('/calculate')
);
expect(createPosts).toHaveLength(0);
```

### Gates

```
npm run test:scenario-release-gate   # must pass before PR
npm run check                        # zero TypeScript errors
npm run lint                         # zero lint errors
```

---

## File Summary

| File                                                                      | Action                                                                              |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `client/src/lib/fund-scenario-workspace-query-keys.ts`                    | Create — cache key helpers                                                          |
| `client/src/lib/fund-scenario-workspace-api.ts`                           | Create — path/validation helpers                                                    |
| `client/src/components/scenarios/CreateMethodologyScenarioModal.tsx`      | Create — modal component                                                            |
| `client/src/lib/queryClient.ts`                                           | Modify — preserve server `code` field in `ApiError.errorCode`                       |
| `client/src/pages/fund-scenario-workspace.tsx`                            | Modify — import helpers, add state + button cluster + modal mount + highlight state |
| `tests/unit/lib/queryClient.test.ts`                                      | Create — `apiRequest` error code preservation (blocker)                             |
| `tests/unit/components/scenarios/CreateMethodologyScenarioModal.test.tsx` | Create — 19 modal cases + payload builder cases                                     |
| `tests/unit/pages/fund-scenario-workspace.test.tsx`                       | Modify — thin integration: button renders + opens modal                             |

## Closeout hardening (2026-06-13)

- Feature implemented and merged on main.
- Modal now uses a payload-scoped idempotency key plus a synchronous re-entrancy
  guard.
- Regression tests added for re-entrant single-POST behavior, same-payload retry
  key reuse, changed-payload key rotation, and the Radix Select override POST
  path.
- Deferred for separate routing: waterfall enum terminology to a domain
  specialist because it is a shared contract value, not a cosmetic label.
- Deferred for separate routing: React duplicate-key warning in a sibling
  comparison view.
- Final sign-off still requires a NON-skipped
  `npm run test:scenario-release-gate` result from CI or a provisioned DB.
