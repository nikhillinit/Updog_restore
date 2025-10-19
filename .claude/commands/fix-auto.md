---
description: Automated repair of lint, format, and simple test failures
---

# Automated Fix Workflow

Attempt to automatically fix common issues: linting errors, formatting problems, and simple test failures.

## Execution Flow

### Phase 1: Linting

1. **Run Linter**
   ```bash
   npm run lint
   ```

2. **Auto-fix Linting**
   ```bash
   npm run lint:fix
   ```

3. **Verify Fix**
   Run lint again to confirm resolution

   **Success**: ✅ Proceed to Phase 2
   **Failure**: Report unfixable lint errors, require manual intervention

### Phase 2: Type Checking

1. **Run Type Check**
   ```bash
   npm run check
   ```

2. **Analyze Errors**
   Common auto-fixable types:
   - Missing imports (add from context)
   - Unused variables (remove or prefix with `_`)
   - Simple type annotations (add explicit types)
   - Null checks (add `!` or optional chaining)

3. **Apply Fixes**
   Use Edit tool for each fixable error

   **Success**: ✅ Proceed to Phase 3
   **Failure**: Report complex type errors, may need baseline update

### Phase 3: Test Failures

1. **Run Tests**
   ```bash
   npm run test:quick
   ```

2. **Delegate to test-repair**
   If failures detected, suggest invoking test-repair agent

3. **Verify Repair**
   Confirm all tests pass after repair

   **Success**: ✅ Proceed to Phase 4
   **Failure**: Report unfixable test failures

### Phase 4: Build Validation

1. **Build Check**
   ```bash
   npm run build
   ```

2. **Handle Failures**
   - Type errors: Return to Phase 2
   - Bundle errors: Check for circular dependencies, missing assets
   - Vite config issues: Run `npm run doctor:links` (Windows sidecar)

   **Success**: ✅ All checks passed!
   **Failure**: Report build errors

## Success Criteria

All phases must pass:
- [x] ✅ Lint: No ESLint errors
- [x] ✅ Types: No TypeScript errors (or baselined)
- [x] ✅ Tests: All tests passing
- [x] ✅ Build: Production bundle created

## Auto-Fixable Patterns

**Linting:**
- Unused imports: Remove
- Missing semicolons: Add
- Spacing/indentation: Fix with ESLint --fix
- Prefer const over let: Change declaration

**Type Errors:**
- Missing return types: Infer and add
- Implicit any: Add explicit types from context
- Missing null checks: Add optional chaining `?.`
- Unused parameters: Prefix with `_unused`

**Simple Test Failures:**
- Outdated snapshots: Update with `--updateSnapshot`
- Mock data mismatches: Align with current schema
- Assertion value changes: Update expected values if logic is correct

## Non-Auto-Fixable (Escalate)

**Linting:**
- Complexity violations (cyclomatic complexity too high)
- Accessibility violations (require design decisions)

**Type Errors:**
- Strict mode violations requiring architecture changes
- Type inference failures in complex generics
- Breaking API changes

**Test Failures:**
- Logic errors in implementation
- Breaking changes to public APIs
- Flaky tests (intermittent failures)

## Reporting

**On Success:**
```
🎉 Automated Fix Complete!

✅ Linting: Fixed X issues
✅ Types: No errors
✅ Tests: All passing (X tests)
✅ Build: Success

Ready for commit!
```

**On Partial Success:**
```
⚠️ Automated Fix Partial

✅ Linting: Fixed X issues
❌ Types: 3 errors require manual review
⏸️ Tests: Skipped (fix types first)
⏸️ Build: Skipped

Manual intervention required for:
- client/src/components/Dashboard.tsx:42 - Complex type inference
- server/routes/api.ts:15 - Breaking API change
```

**On Failure:**
```
❌ Automated Fix Failed

❌ Linting: 5 unfixable errors
❌ Types: 12 errors
❌ Tests: 8 failing
❌ Build: Failed

Critical issues detected. Review errors above.
Consider using /test-smart to isolate test failures.
```

## Integration

Works with:
- **test-repair agent**: Delegates complex test fixes
- **Pre-commit hooks**: Can run as pre-commit validation
- **CI/CD**: Dry-run mode for validation only

## Performance

- **Target runtime**: <3 minutes for full cycle
- **Parallel execution**: Lint and type-check can run together
- **Fast-fail**: Stops at first un-fixable phase

## Notes

- Always commits fixes with message: `chore: Automated lint, type, and test fixes`
- Uses git to track what was changed
- Can be run before `/deploy-check` for clean validation
