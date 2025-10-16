# Week 2: Server-Side TypeScript Remediation Baseline

**Track:** 1B (Server + API)
**Status:** Day-0 (baseline captured, remediation pending)
**Follows:** Week 1 Track 1A (Client+Shared, v0.1.0-ts-week1-client-complete)

## Baseline Summary

**Server TypeScript Errors:** 608 (initial count)

### Configuration Changes

Enabled full TypeScript strictness for server code by removing overrides in `tsconfig.server.json`.

**Now Inheriting from Base:**
- ✅ `strict: true`
- ✅ `exactOptionalPropertyTypes: true`
- ✅ `noUncheckedIndexedAccess: true`
- ✅ `noPropertyAccessFromIndexSignature: true`

## Error Categories (Top Patterns)

1. **TS4111** - Index signature property access (Express `req`/`res`)
2. **TS2345** - `undefined` not assignable to parameter
3. **TS2375** - `exactOptionalPropertyTypes` violations
4. **TS2532** - Object possibly undefined
5. **TS7016** - Missing type declarations for dependencies

## Strategy

Will follow Week 1 proven patterns + server-specific fixes:

1. **Express Declaration Merging** - Type custom `req`/`res` properties
2. **Bracket Notation Codemod** - Fix index signature access
3. **`spreadIfDefined` Helper** - Optional property handling
4. **Type Guards** - `isDefined<T>()` helper
5. **Install Missing @types** - `@types/swagger-jsdoc`, etc.

### Parallel Workflow

- **Phase 1:** Core API routes (Fund, Investment, Analytics)
- **Phase 2:** Infrastructure (Circuit breakers, DB adapters)
- **Phase 3:** Worker processes (Reserve calc, Monte Carlo)
- **Phase 4:** Middleware & utilities

## Success Criteria

- [ ] Server TypeScript errors: 608 → 0
- [ ] All API tests pass
- [ ] Build succeeds: `npm run build:server`
- [ ] No new runtime behavior changes
- [ ] All commits conventional format

## References

- **Week 1 Tag:** `v0.1.0-ts-week1-client-complete`
- **Week 1 PR:** #154
- **Pattern Library:** `shared/lib/ts/`
- **Kickoff Guide:** `WEEK2_KICKOFF_GUIDE.md`
- **Baseline:** `artifacts/week2/server-errors-baseline.txt`

---

**Status:** 📋 DRAFT - Baseline captured, awaiting remediation
**Risk:** 🟢 LOW (types-only, proven patterns from Week 1)
**Estimated Time:** 1-2 days (with codemods)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
