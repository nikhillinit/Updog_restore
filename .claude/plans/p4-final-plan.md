# P4 Pipeline UI Polish -- Final Implementation Plan

**Date:** 2026-02-16 **Status:** Codex-validated (session 019c6612,
gpt-5.3-codex xhigh) **Approach:** Codebase exploration + Codex steelman

## Steelman Decisions

### 1. Scope: 25h is aggressive for solo dev -- cut to ~18h

**Cut:** Task 4.3 (DnD) deferred to P4.5. Rationale:

- DnD is the highest-risk, lowest-value task for "hardening"
- Requires new dependency, accessibility testing, drag state management
- Existing click-to-change-status via the stage API works fine
- Feature-flag it for future sprint **Keep:** 4.1, 4.2, 4.4a, 4.4b, 4.5 (without
  DnD E2E scenarios)

### 2. Optimistic locking: Skip it (last-write-wins)

- Solo GP tool with 1-2 concurrent users max
- Adding version column requires schema migration + db:push
- Client-side optimistic UI with rollback on API error is sufficient
- If needed later, add version column as P5 tech debt item

### 3. Cursor pagination + sort: Reset cursor on sort change

- Do NOT implement keyset pagination per sort column
- When user changes sort, reset to page 1 (no cursor)
- Backend adds sortBy/sortDir params but cursor only works with default sort
- Simple, correct, ships fast

### 4. DnD library: @dnd-kit/core (deferred but decision locked)

- When we do implement DnD (P4.5), use @dnd-kit/core + @dnd-kit/sortable
- Actively maintained, accessible, tree-shakeable, works with shadcn

### 5. Import dedupe: Server-side DB lookup

- Preview endpoint queries existing deals by fundId + normalized companyName +
  stage
- Returns duplicate rows with match details
- Client shows preview before confirm

### 6. Feature flags: Bulk actions only

- Bulk toolbar behind feature flag (pipeline.bulkActions)
- Import preview ships directly (replaces broken N-POST loop)
- Filters/sort ship directly (pure improvement)

## Prerequisites (Codex Round 3 findings)

### 4.0a Fix apiRequest to preserve structured errors

File: `client/src/lib/queryClient.ts:43`

- Currently: `errorData.message || errorData.error || fallback` -- loses Zod
  `issues` array
- Fix: throw a custom error class that carries both `message` and `issues`
  fields
- Required before 4.1 (field-error mapping depends on this)

### 4.0b Wire fundId from pipeline page to modals

File: `client/src/pages/pipeline.tsx:429,431`

- Currently: `<AddDealModal>` and `<ImportDealsModal>` receive no `fundId`
- Fix: add fund selector or extract from route/context
- Required before 4.2 (dedupe on fund_id meaningless without wiring)

### 4.0c Choose flag system: useUnifiedFlag + registry

Files: `client/src/hooks/useUnifiedFlag.ts`, `shared/generated/flag-types.ts`

- 3 competing systems exist; standardize on `useUnifiedFlag` with
  `flags:generate`
- Add `pipeline.bulkActions` flag to registry
- Required before 4.4b

### 4.0d Custom queryFn for pipeline queries

File: `client/src/pages/pipeline.tsx`

- Default `queryKey.join('/')` breaks with filter/sort object keys
- Add custom `queryFn` that builds URL with search params
- Preserve invalidation compatibility with existing
  `queryKey: ['/api/deals/opportunities']`
- Required before 4.4a

## Final Task Sequence

### 4.1 AddDealModal hardening (~2h)

Files: client/src/components/pipeline/AddDealModal.tsx, new shared util

- Extract parseMoney/parseIntSafe to client/src/utils/parse-helpers.ts
- Add explicit inline errors for numeric fields (bounds, integer checks)
- Map server validation errors to per-field messages (Zod issues -> field names)
- Disable dialog close during submit (onOpenChange gated on isPending)
- Success toast with company name, form reset, focus to first field
- Recoverable error banner for non-field failures
- Unit tests: happy path, required fields, invalid numeric, server error mapping

### 4.2 ImportDealsModal + backend APIs (~5h)

Files: client/src/components/pipeline/ImportDealsModal.tsx,
server/routes/deal-pipeline.ts **Backend:**

- POST /api/deals/opportunities/import/preview -- accepts rows, returns
  summary + duplicates + invalid + warnings
- POST /api/deals/opportunities/import -- accepts validated rows + mode, returns
  imported/skipped/failed counts
- Server-side dedupe: fundId + LOWER(TRIM(companyName)) + stage lookup
- Migrate raw fetch() to apiRequest helper **Frontend:**
- Two-phase UX: Validate/Preview -> Confirm Import
- Preview summary cards: total, valid, duplicate, invalid, to-import
- Row-level error table
- Reuse shared parse-helpers.ts

### 4.4a Pipeline toolbar: filters, sort, search, URL sync (~3h)

Files: client/src/pages/pipeline.tsx, server/routes/deal-pipeline.ts
**Backend:**

- Extend PaginationSchema with sortBy (enum: updatedAt, companyName, dealSize)
  and sortDir (asc, desc)
- Dynamic orderBy in Drizzle query
- Reset cursor when sort != default **Frontend:**
- Search input (debounced, uses existing search param)
- Status filter (multi-select dropdown)
- Priority filter (single-select)
- Sort selector
- URL query param sync (useSearchParams)
- All state in URL for shareable/reload-safe views

### 4.4b Selection + bulk actions + bulk APIs (~4h)

Files: client/src/pages/pipeline.tsx, server/routes/deal-pipeline.ts
**Backend:**

- POST /api/deals/opportunities/bulk/status -- { dealIds: number[], status,
  notes? }
- POST /api/deals/opportunities/bulk/archive -- { dealIds: number[] }
- Both return { updatedIds, failed: Array<{id, reason}> }
- Zod .max(100) on dealIds array
- Idempotency on both endpoints **Frontend:**
- List-mode row selection + kanban card selection
- Selected count badge
- Bulk actions: Move status, Archive, Clear selection
- Behind feature flag: pipeline.bulkActions
- Optimistic bulk updates with partial rollback from response

### 4.5 Pipeline E2E tests (~3h)

Files: tests/e2e/pipeline-management.spec.ts,
tests/e2e/page-objects/PipelinePage.ts, playwright.config.ts

- New 'pipeline' project in playwright.config.ts with dependencies: ['smoke']
- PipelinePage page object with stable data-testid selectors
- Scenarios: add deal, validation failure, CSV import preview, filter/sort, bulk
  status
- Seed data via API calls in beforeAll
- Skip DnD scenarios (deferred)

## Total: ~19h (17h tasks + 2h prerequisites)

## Implementation Order

1. **4.0a-d prerequisites** (~2h, can partially parallelize)
2. **4.1** AddDealModal (depends on 4.0a)
3. **4.2** Import + backend APIs (depends on 4.0b, parallel with 4.1 backend
   portion)
4. **4.4a** Toolbar (depends on 4.0d)
5. **4.4b** Bulk actions (depends on 4.0c, 4.4a)
6. **4.5** E2E tests (depends on all above)

## Merge Risk Mitigation

- `deal-pipeline.ts` touched in steps 2, 3, 4 -- work sequentially
- `pipeline.tsx` touched in steps 3, 4 -- work sequentially
- `queryClient.ts` only touched in 4.0a -- no conflict risk

## Risk Register

| Risk                             | Mitigation                                                            |
| -------------------------------- | --------------------------------------------------------------------- |
| Import preview slow on large CSV | Server-side MAX_ROWS=1000, timeout guard                              |
| Bulk endpoint abuse              | Zod .max(100) on dealIds, idempotency middleware                      |
| URL param state drift            | Single source of truth in useSearchParams, no local state duplication |
| E2E flaky without seeded data    | API-seeded fixtures in beforeAll, deterministic cleanup               |
