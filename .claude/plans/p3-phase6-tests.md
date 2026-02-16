# P3 Phase 6: Monte Carlo Backtesting Tests

## Goal

Write dedicated test files for the P3 Monte Carlo backtesting feature. Two new
test files (queue + components) plus extending one existing file (view-model
adapters).

## Source Files Under Test

| File                                      | Layer          | Key Exports                                                                                                                                          |
| ----------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/queues/backtesting-queue.ts`      | Server (Node)  | `initializeBacktestingQueue`, `enqueueBacktestJob`, `getBacktestJobStatus`, `subscribeToBacktestJob`, `isBacktestingTerminalStatus`, private helpers |
| `client/src/types/backtesting-ui.ts`      | Shared logic   | `toRenderableMetric`, `toJobViewModel`, `toResultViewModel`, `classifyErrorTier`                                                                     |
| `client/src/components/monte-carlo/*.tsx` | Client (jsdom) | `CalibrationStatusCard`, `DataQualityCard`, `RecommendationsPanel`, `ConfigForm`                                                                     |

## Existing Coverage

- `tests/unit/validation/backtesting-schemas.test.ts` -- 39 tests (Zod schemas)
- `tests/unit/backtesting-ui.test.ts` -- 20 tests (toJobViewModel phase/terminal
  mapping, toResultViewModel distribution filtering/metric-state). Already has
  fixture builders.
- No tests for queue logic or visualization components.

## Codex Review Findings (Applied)

1. **BLOCKING: Private helpers not exportable** -- `classifyError`,
   `initializeJobState`, `handleJobFailure`, `markJobCompleted` etc. are
   module-private. Test through captured worker processor from mocked `Worker`
   constructor.
2. **BLOCKING: enqueue-only path insufficient** -- State transitions happen in
   `processBacktestJob`. Must capture the processor callback passed to
   `new Worker(...)` and invoke it with fake `Job` objects.
3. **BLOCKING: Module-level Map state leaks** -- `jobStates` and
   `idempotencyMap` are module-level, `close()` doesn't clear them. Use
   `vi.resetModules()` + dynamic re-import per describe block.
4. **IMPORTANT: Existing test file** -- `tests/unit/backtesting-ui.test.ts`
   already covers toJobViewModel/toResultViewModel. Extend it for uncovered
   functions (`toRenderableMetric`, `classifyErrorTier`), don't duplicate.
5. **IMPORTANT: ConfigForm payload tests** -- Add: onSubmit payload composition,
   lastConfig initialization, last-metric-can't-be-deselected guard, custom
   scenario filtering.
6. **MINOR: CalibrationStatusCard SVG** -- Add stroke color + strokeDasharray
   threshold assertions.

## Plan

### Task 1: Extend `tests/unit/backtesting-ui.test.ts` (+10 tests)

**Project:** `server` (pure logic, no DOM)

Add test blocks for functions NOT yet covered:

1. **toRenderableMetric** (~5 tests)
   - Returns `{ status: 'ready', value }` for finite number
   - Returns `insufficient_data` when metricName is in incalculableMetrics
   - Returns `unavailable` for null
   - Returns `unavailable` for undefined
   - Returns `unavailable` for NaN and Infinity

2. **classifyErrorTier** (~4 tests)
   - VALIDATION_ERROR -> 'user_fixable'
   - DATA_QUALITY_LIMITATION -> 'data_quality'
   - SYSTEM_EXECUTION_FAILURE -> 'system_error'
   - null -> 'system_error' (default)

3. **ERROR_TIER_MESSAGES** (~1 test)
   - Each tier has title and guidance strings

Reuse existing fixture builders (`makeJobStatusResponse`, `makeDistribution`,
etc.).

### Task 2: `tests/unit/queues/backtesting-queue.test.ts` (~18 tests)

**Project:** `server` (Node environment)

**Mock strategy:**

- `vi.mock('bullmq')` before import -- mock Queue and Worker constructors
- Worker mock: capture the processor callback from constructor args
- Queue mock: implement `add`, `getWaitingCount`, `getJob`, `on`, `close`
- Use `vi.resetModules()` + dynamic `import()` in beforeEach to isolate
  module-level Map state

**Test groups:**

1. **isBacktestingTerminalStatus** (exported, no state needed, ~3 tests)
   - Returns true for completed, failed, timed_out, cancelled
   - Returns false for queued, simulating, unknown
   - Type guard narrows correctly

2. **initializeBacktestingQueue** (~2 tests)
   - Creates Queue and Worker with correct config
   - Returns close function that shuts down queue + worker

3. **enqueueBacktestJob** (~4 tests)
   - Throws when queue not initialized
   - Returns jobId and estimatedWaitMs
   - Idempotency: returns same jobId for duplicate key while non-terminal
   - Idempotency: allows re-enqueue after terminal status

4. **Worker processor (captured callback)** (~5 tests)
   - Happy path: calls backtestingService.runBacktest, emits completed
   - Failure: classifies error, emits failed, only throws if retryable
   - Cancellation: aborted signal -> emits cancelled
   - Timeout: job exceeds JOB_TIMEOUT_MS -> emits timed_out
   - State: getBacktestJobStatus returns correct snapshot after processing

5. **subscribeToBacktestJob** (~2 tests)
   - Calls onComplete callback when completed event fires
   - Unsubscribe removes listeners

6. **getBacktestJobStatus** (~2 tests)
   - Returns in-memory snapshot when available
   - Returns unknown snapshot when jobId not found

**Mocks needed:**

- `bullmq` -> Queue, Worker constructors
- `../services/backtesting-service` -> `backtestingService.runBacktest` (dynamic
  import in processor)

### Task 3: `tests/unit/components/monte-carlo/monte-carlo-components.test.tsx` (~22 tests)

**Project:** `client` (jsdom environment)

**Presentational components (no hooks to mock):**

1. **CalibrationStatusCard** (~5 tests)
   - Renders "Well Calibrated" label and description
   - Renders quality score number inside gauge
   - SVG stroke color: green (#10b981) when score >= 70
   - SVG stroke color: amber (#f59e0b) when score 40-69
   - SVG stroke color: red (#ef4444) when score < 40

2. **DataQualityCard** (~5 tests)
   - Renders "Good" quality badge with emerald styling
   - Renders "Poor" quality badge with red styling
   - Shows baseline age "Xd old" when hasBaseline + baselineAgeInDays set
   - Shows "Missing" when hasBaseline is false
   - Renders warning messages

3. **RecommendationsPanel** (~3 tests)
   - Returns null (no rendered output) for empty array
   - Renders numbered list items
   - Renders correct count of recommendations

**ConfigForm (needs useScenarios mock):**

4. **ConfigForm** (~9 tests)
   - Renders with default values (2020-01-01, 2025-01-01, 10000 runs)
   - Shows "Running..." text when disabled=true
   - Shows "Run Backtest" when disabled=false
   - Renders IRR/TVPI/DPI checkboxes checked by default
   - Initializes from lastConfig when provided
   - onSubmit builds correct payload (fundId, dates, runs, metrics)
   - Includes historicalScenarios only when enabled + selected
   - Includes randomSeed only when useRandomSeed enabled
   - Filters out 'custom' from scenario list

**Mocks needed:**

- `vi.mock('@/hooks/useBacktesting')` -> `useScenarios` returns
  `{ data: { scenarios: [...] } }`
- No QueryClientProvider needed (useScenarios is fully mocked)
- No wouter mock needed (ConfigForm doesn't use routing)

## Execution Order

1. Task 1 (extend existing file, pure logic, fastest)
2. Task 2 (queue tests, BullMQ mocking + state isolation)
3. Task 3 (component tests, jsdom + RTL)

## Quality Criteria

- All tests pass: `npm test -- --project=server` and
  `npm test -- --project=client`
- No new TS errors
- No flaky tests (no real timers, no network, no Redis)
- Module state fully isolated between tests (vi.resetModules for queue tests)
- Fixtures reused from existing backtesting-ui.test.ts where applicable
