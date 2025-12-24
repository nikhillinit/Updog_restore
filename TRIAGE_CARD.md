# Foundation Hardening Triage Card (A-F)

Single-page reference for test failure diagnosis and repair.

---

## 0) Rules Before Touching Code

- **Capture the exact error text** and the first failing assertion
- **Do not** change shared seams (Redis/webhooks/DB test harness) without the owner
- **Single-variable rule**: change one thing per attempt
- **3-fix rule**: after 3 failed attempts -> escalate / architecture review

---

## 1) Determine Flaky vs Deterministic First

```bash
# 10 runs is usually the best signal-to-time default
./scripts/detect-flaky.sh "<test-target>" 10
```

**Interpretation:**

| Verdict | Meaning | Next Step |
|---------|---------|-----------|
| PASSING | Not currently failing here | Suspect CI/env/order/concurrency |
| FLAKY | Mixed pass/fail | Prioritize E -> A -> F |
| DETERMINISTIC FAILURE | Fails every run | Go straight to classification (A-F) |

**Post-fix gate:**

```bash
./scripts/detect-flaky.sh "<test-target>" 10 --expect-pass --fail-fast
```

---

## 2) Classify the Failure (A-F)

| Pattern | Name | Typical Signatures | Fastest Confirmation | First-Line Fix |
|---------|------|-------------------|---------------------|----------------|
| **A** | Async race / missing await | `undefined`, intermittent timeouts, order-dependent async setup | Search setup/teardown for missing `await`; run isolate + verbose | Add missing `await`; await async factories; flush microtasks; ensure teardown awaits cleanup |
| **B** | Mock drift / schema mismatch | Type mismatch, missing fields, wrong names | `npm run validate:schema-drift -- --strict` | Regenerate fixtures; centralize factories; contract tests; remove stale hand-written mocks |
| **C** | Import / resolution / alias | `Cannot find module`, ESM/CJS issues | `npx tsc --noEmit` + check aliases | Align `tsconfig.paths` + Vite/Jest/Vitest aliases; fix extensions; avoid deep relative imports |
| **D** | Type boundary / units / rounding | Cents vs dollars, `toFixed`, parse/Number weirdness | Grep numeric conversions at boundaries | Introduce `Money`/`Amount` helpers; avoid float math; encode units in types; test boundary conversions |
| **E** | Shared state contamination | Passes alone, fails in suite; "expected 0 got 1"; mutated global/singleton | Run shuffled order; run isolate; run with only file vs full suite | Reset modules/mocks; clear DB/Redis between tests; restore env vars; eliminate singleton mutation; ensure hermetic factories |
| **F** | Timers / clock / open handles | Hangs, timeouts, "pending timers"; midnight/TZ failures | Search `setTimeout/setInterval/Date.now/new Date`; check pending timers after test | Use fake timers + advance; clear intervals; `setSystemTime`; avoid real sleeps; ensure no leaked handles |

---

## 3) Minimal Diagnostic Stack (By Symptom)

### If It's Flaky (Some Pass, Some Fail)

**1. E (shared state)**
```bash
npm test -- "<test-target>" --sequence=shuffle
npm test -- "<test-target>" --isolate
```

**2. A (async)**
- Look for missing `await` in `beforeEach/beforeAll/afterEach/afterAll`
- Ensure teardown awaits cleanup

**3. F (timers)**
- Search timers/clock usage and ensure timers are cleared/advanced

### If It Times Out / Hangs

Assume **F -> A** until proven otherwise.

Check for:
- Unawaited promises
- Pending timers / intervals
- Open handles (sockets, DB clients, workers)

---

## 4) Verification Stack (Every Fix)

```bash
# 1. Single test passes
npm test -- "<test-target>"

# 2. Full file passes
npm test -- "<test-file>"

# 3. Baseline unchanged
./scripts/baseline-check.sh

# 4. Schema aligned
npm run validate:schema-drift -- --strict

# 5. Flakiness gate (10 consecutive passes)
./scripts/detect-flaky.sh "<test-target>" 10 --expect-pass --fail-fast
```

---

## 5) Commit Evidence Template

```
fix(tests): <short description>

Pattern: A/B/C/D/E/F
Root cause: <one sentence, concrete>
Fix: <what changed, why it resolves the root cause>
Guards added: <assertions, teardown, factories, schema checks>
Verification:
  - npm test -- "<test>" [PASS]
  - detect-flaky.sh 10 --expect-pass --fail-fast [PASS 10/10]
```

---

## Quick Reference: detect-flaky.sh (v5.1)

```bash
# Pre-fix: detect if test is flaky or deterministic
./scripts/detect-flaky.sh tests/unit/foo.test.ts

# Post-fix gate: require 10 consecutive passes, abort on first fail
./scripts/detect-flaky.sh tests/unit/foo.test.ts 10 --expect-pass --fail-fast

# With timeout (prevents CI hangs) and custom test command
./scripts/detect-flaky.sh tests/foo.test.ts 10 --timeout=120 --test-cmd="yarn test --"

# JSON output for CI integration
./scripts/detect-flaky.sh tests/foo.test.ts 10 --json

# Classification only (always exits 0, for scripting)
./scripts/detect-flaky.sh tests/unit/foo.test.ts 10 --report-only

# Debug: show failures and keep logs
./scripts/detect-flaky.sh tests/unit/foo.test.ts 5 --show-failures --keep-logs
```

### Exit Code Semantics (v5.1)

| Mode | PASSING | FLAKY | DETERMINISTIC | TIMEOUT |
|------|---------|-------|---------------|---------|
| Auto (default) | exit 0 | exit 1 | exit 1 | exit 1 |
| --expect-pass | exit 0 | exit 1 | exit 1 | exit 1 |
| --expect-fail | exit 1 | exit 1 | exit 0 | exit 0 |
| --report-only | exit 0 | exit 0 | exit 0 | exit 0 |

**NOTE**: Timeouts are treated as failures (exit 1, not 124).
The timeout count is included in JSON output: `"timed_out": N`

### Fail-Fast Semantics (Mode-Aware)

| Mode | --fail-fast Stops When |
|------|------------------------|
| --expect-pass | First FAILURE (gate violated) |
| --expect-fail | First PASS (reproducibility violated) |
| auto | Flakiness PROVEN (seen pass AND fail) |

---

## Pattern Investigation Order

**For FLAKY tests**: E -> A -> F (shared state is #1 culprit)

**For DETERMINISTIC failures**: Match signature to pattern table above

**For HANGS/TIMEOUTS**: F -> A (timer leaks or unawaited promises)

---

*Last updated: 2025-12-24 (v5.1)*
