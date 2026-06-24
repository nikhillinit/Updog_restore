# Final Review Fix Report

## Status

DONE

## Fixes

- Scoped active override evidence to active, non-superseded rounds before role
  classification, coverage counts, and provenance hash input.
- Updated the database active override read to join `investment_rounds` and
  apply the same non-superseded active-round rule.
- Tightened LIVE provenance contract semantics so LIVE can carry only info
  structured warnings.
- Corrected the rounds-to-model contract fixture so SAFE amount-only evidence is
  not counted as follow-on model amount.

## Verification

### Focused contract tests

Command:

```powershell
$env:PATH = "$PWD\node_modules\.bin;$env:PATH"; cross-env TZ=UTC vitest run tests/unit/contract/provenance-envelope.contract.test.ts tests/unit/contract/rounds-to-model-evidence.contract.test.ts --project=server
```

Output:

```text
 RUN  v4.1.8 C:/dev/Updog_restore/.worktrees/pr-d-provenance-envelope-rounds-evidence

 ✓ |server| tests/unit/contract/rounds-to-model-evidence.contract.test.ts (4 tests) 31ms
 ✓ |server| tests/unit/contract/provenance-envelope.contract.test.ts (14 tests) 50ms

 Test Files  2 passed (2)
      Tests  18 passed (18)
   Start at  06:20:28
   Duration  3.19s (transform 1.32s, setup 1.29s, import 438ms, tests 81ms, environment 0ms)

Warning: A vi.mock("../../server/db") call in "C:/dev/Updog_restore/.worktrees/pr-d-provenance-envelope-rounds-evidence/tests/helpers/database-mock.ts" is not at the top level of the module. Although it appears nested, it will be hoisted and executed before any tests run. Move it to the top level to reflect its actual execution order. This will become an error in a future version.
See: https://vitest.dev/guide/mocking/modules#how-it-works
```

### Focused service tests

Command:

```powershell
$env:PATH = "$PWD\node_modules\.bin;$env:PATH"; cross-env TZ=UTC vitest run tests/unit/services/rounds-to-model-evidence-service.test.ts --project=server
```

Output:

```text
 RUN  v4.1.8 C:/dev/Updog_restore/.worktrees/pr-d-provenance-envelope-rounds-evidence

 ✓ |server| tests/unit/services/rounds-to-model-evidence-service.test.ts (9 tests) 129ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
   Start at  06:20:50
   Duration  3.72s (transform 1.05s, setup 757ms, import 778ms, tests 129ms, environment 0ms)

Warning: A vi.mock("../../server/db") call in "C:/dev/Updog_restore/.worktrees/pr-d-provenance-envelope-rounds-evidence/tests/helpers/database-mock.ts" is not at the top level of the module. Although it appears nested, it will be hoisted and executed before any tests run. Move it to the top level to reflect its actual execution order. This will become an error in a future version.
See: https://vitest.dev/guide/mocking/modules#how-it-works
```

### Typecheck

Command:

```powershell
npm run check
```

Output:

```text
> rest-express@1.3.2 check
> npm run baseline:check


> rest-express@1.3.2 baseline:check
> node scripts/typescript-baseline.cjs check

Running TypeScript compilation...
  Checking client (tsconfig.client.json)...
  Checking server (tsconfig.server.json)...
  Checking shared (tsconfig.shared.json)...
Found 0 TypeScript errors
  Checking client (tsconfig.client.json)...
  Checking server (tsconfig.server.json)...
  Checking shared (tsconfig.shared.json)...

TypeScript Baseline Check
──────────────────────────────────────────────────────────────────────
Baseline errors:  0
Current errors:   0
Fixed errors:     0
New errors:       0
──────────────────────────────────────────────────────────────────────

[OK] No new TypeScript errors introduced
```

### Scoped lint

Command:

```powershell
npx eslint --max-warnings 0 server/services/rounds-to-model-evidence-service.ts shared/contracts/provenance-envelope.contract.ts tests/unit/services/rounds-to-model-evidence-service.test.ts tests/unit/contract/provenance-envelope.contract.test.ts tests/unit/contract/rounds-to-model-evidence.contract.test.ts
```

Output:

```text

```

## Concerns

- Vitest reports the existing `tests/helpers/database-mock.ts` nested `vi.mock`
  warning during focused runs. This fix did not touch that helper.
