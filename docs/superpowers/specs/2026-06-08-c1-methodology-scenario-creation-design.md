# C1: Methodology Scenario Creation UI — Design Spec

**Date:** 2026-06-08 **Branch:** main (off `46373b70`, #817) **Goal:** Add a
"New methodology scenario" modal to the workspace so GPs can create a
`methodology` scenario set with one variant directly from the UI, without a
direct API call.

---

## Scope

Methodology-only, one variant per creation. `waterfallTiers` excluded — tier
editing is a separate workflow. `waterfallType` and `managementFeeRate` are the
only exposed override fields.

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

**New file:**
`client/src/components/scenarios/CreateMethodologyScenarioModal.tsx`

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
receives the created detail so the workspace can optionally highlight it.
`onOpenChange` follows shadcn Dialog convention — workspace passes
`setIsCreateMethodologyOpen`.

The mutation (`useMutation`) and cache invalidation
(`queryClient.invalidateQueries`) live inside the modal. The workspace
`onSuccess` callback is a downstream hook for selection, scroll, or toast — not
responsible for cache invalidation.

**Query key extraction:**

New file: `client/src/lib/fund-scenario-workspace-query-keys.ts`

Extracts the cache key helpers currently private to
`fund-scenario-workspace.tsx` so both the workspace page and modal share the
same cache root without duplicating literals:

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

**Workspace integration:**

```tsx
// State
const [isCreateMethodologyOpen, setIsCreateMethodologyOpen] = useState(false);

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
  onSuccess={() => {}}
/>
```

---

## Section 2: Form Schema + Submission Shape

**Client-side form schema:**

```ts
const OptionalPercentageNumberSchema = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) return undefined;
  if (typeof value === 'number' && Number.isNaN(value)) return undefined;
  return Number(value);
}, z.number().min(0).max(100).optional());

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

**Payload transform (exported, independently testable):**

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

`managementFeeRate` is submitted as the percentage value (e.g., `2` for 2%) —
matching `FundDraftWriteV1Schema` convention. Do not divide by 100 in the modal.

---

## Section 3: Component Internals

### apiRequest update (prerequisite)

The current `apiRequest` reads `errorData.error` into `ApiError.errorCode` but
not `errorData.code`. The server route emits both `error` (generic HTTP reason)
and `code` (specific, e.g., `duplicate_scenario_set_name`). Update `apiRequest`
once, backward-compatibly:

```ts
type ErrorBody = {
  message?: string;
  error?: string;
  code?: string;
  issues?: Array<{ path: (string | number)[]; message: string }>;
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

The modal then uses:

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
    apiRequest(
      'POST',
      `/api/funds/${encodeURIComponent(fundId)}/scenario-sets`,
      payload
    ).then((raw) => FundScenarioSetDetailV1Schema.parse(raw)),
  onMutate: () => {
    setServerError(null);
  },
  onSuccess: async (created) => {
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
  <SelectItem value="american">American</SelectItem>
  <SelectItem value="hybrid">Hybrid</SelectItem>
</Select>
```

### Field layout

```
DialogHeader → "New methodology scenario"
──────────────────────────────────────────────
Label: Scenario set name    [Input]            ← required, error below
Label: Variant name         [Input]            ← required, error below
──────────────────────────────────────────────
At least one override required:
Label: Waterfall type       [Select]           ← cross-field error appears here
Label: Management fee rate  [Input type=number, "%" suffix]
──────────────────────────────────────────────
[server error alert banner if present]
──────────────────────────────────────────────
DialogFooter:  [Cancel]  [Create scenario]     ← Create disabled while isPending
```

`managementFeeRate` uses
`{...form.register('managementFeeRate', { valueAsNumber: true })}`. The
`z.preprocess` handles `NaN` from an empty number input.

---

## Section 4: Tests

### 4a. `tests/unit/lib/queryClient.test.ts` (new file)

**Case: `apiRequest` preserves specific server error code**

Mock a 409 response body
`{ error: 'conflict', code: 'duplicate_scenario_set_name', message: '...' }`.
Assert that the thrown `ApiError.errorCode === 'duplicate_scenario_set_name'`
(not `'conflict'`).

This is a required blocker — without the `apiRequest` fix, the modal cannot
distinguish specific server errors.

### 4b. `buildCreateMethodologyScenarioPayload` unit tests

Four cases (inline in the modal test file or a separate util test):

- **waterfallType only** — payload contains `{ waterfallType: 'american' }`, no
  `managementFeeRate` key
- **managementFeeRate only** — payload contains `{ managementFeeRate: 2 }`, no
  `waterfallType` key
- **both fields** — payload contains both keys
- **name mapping** — `scenarioSetName` maps to `payload.name`; `variantName`
  maps to `payload.variants[0].name`

### 4c. `tests/unit/components/scenarios/CreateMethodologyScenarioModal.test.tsx` (new file)

| Case                                  | Setup                                                                | Assert                                                                                                                    |
| ------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Renders fields when open              | `open=true`                                                          | Name, variant name, waterfall type, fee rate fields present                                                               |
| Hidden when closed                    | `open=false`                                                         | Dialog content not in DOM                                                                                                 |
| Empty submit shows required errors    | Submit without filling                                               | "Required" under name + variant name                                                                                      |
| Cross-field refine                    | Fill both name fields, leave both override fields unset, submit      | Cross-field error near waterfall select                                                                                   |
| Valid submit (waterfallType only)     | Fill names + select 'american', submit                               | `fetch` called with `{ overrideType: 'methodology', payload: { waterfallType: 'american' } }`, no `managementFeeRate` key |
| Valid submit (managementFeeRate only) | Fill names + type fee rate, submit                                   | `fetch` called with `{ managementFeeRate: 2 }`, no `waterfallType` key                                                    |
| Duplicate name error                  | Mock 409 `duplicate_scenario_set_name`                               | Field error under scenario set name field                                                                                 |
| Max sets error                        | Mock 409 `max_scenario_sets`                                         | Alert banner with max-sets message                                                                                        |
| No published config error             | Mock 409 `no_published_config`                                       | Alert banner with publish-config message                                                                                  |
| Submit disabled while pending         | Mock fetch with deferred promise                                     | Create button is disabled                                                                                                 |
| Close blocked while pending           | Mock fetch with deferred promise, click Cancel                       | `onOpenChange` not called                                                                                                 |
| Reset on close                        | Parent harness: open → fill fields → close → reopen                  | Fields show default values                                                                                                |
| onSuccess called with detail          | Mock successful response with full `FundScenarioSetDetailV1` fixture | `onSuccess` called with the parsed detail                                                                                 |
| Cache invalidated on success          | Spy on `queryClient.invalidateQueries`                               | Called with `{ queryKey: workspaceQueryKey(fundId) }`                                                                     |

**Notes on specific cases:**

- Pending-state tests need a manually controlled deferred promise (resolve never
  called during assertion).
- Close-blocked test: prefer clicking Cancel button (which should be
  disabled/guarded while pending) or use the `handleOpenChange` guard directly.
- Reset-on-close: requires a small wrapper component owning `open` state.
- Success fixture: must be a complete `FundScenarioSetDetailV1` including all
  required summary fields + `variants` array; partial fixtures fail schema
  parsing.

### 4d. `tests/unit/pages/fund-scenario-workspace.test.tsx` — thin integration addition

Add to the primary workspace test ("loads scenario sets without polling reserve
status for sync sets"):

```ts
// "New methodology scenario" button renders
expect(
  screen.getByRole('button', { name: /new methodology scenario/i })
).toBeInTheDocument();

// Clicking it opens the modal (no POST issued)
fireEvent.click(
  screen.getByRole('button', { name: /new methodology scenario/i })
);
// Modal dialog appears
expect(await screen.findByRole('dialog')).toBeInTheDocument();
// No create POST issued merely by opening the modal
const createCalls = fetchSpy.mock.calls.filter(
  ([url, init]) =>
    typeof url === 'string' &&
    url.includes('/scenario-sets') &&
    (init?.method ?? 'GET') === 'POST' &&
    !url.includes('/reserve-optimization') &&
    !url.includes('/calculate')
);
expect(createCalls).toHaveLength(0);
```

### Gates

```
npm run test:scenario-release-gate   # must pass before PR
npm run check                        # zero TypeScript errors
npm run lint                         # zero lint errors
```

---

## File Summary

| File                                                                      | Action                                                                            |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `client/src/lib/fund-scenario-workspace-query-keys.ts`                    | Create — query key helpers extracted from workspace page                          |
| `client/src/components/scenarios/CreateMethodologyScenarioModal.tsx`      | Create — modal component                                                          |
| `client/src/lib/queryClient.ts`                                           | Modify — preserve `code` field from server error response in `ApiError.errorCode` |
| `client/src/pages/fund-scenario-workspace.tsx`                            | Modify — import query keys, add state + button + modal mount                      |
| `tests/unit/lib/queryClient.test.ts`                                      | Create — `apiRequest` error code preservation                                     |
| `tests/unit/components/scenarios/CreateMethodologyScenarioModal.test.tsx` | Create — modal unit tests (14 cases)                                              |
| `tests/unit/pages/fund-scenario-workspace.test.tsx`                       | Modify — thin integration: button renders + opens modal                           |
