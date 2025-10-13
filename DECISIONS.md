# Architecture Decision Records

This file documents significant architectural and technical decisions made in
this project.

The format follows the
[Architecture Decision Records (ADR)](https://adr.github.io/) pattern:

- Each decision is numbered sequentially
- Includes context, decision, consequences, alternatives considered, and status
- Timestamped for historical reference

---

## ADR-001: Unified TypeScript Strictness Across All Build Paths (2025-10-13)

### Context

The TypeScript configuration was fragmented across multiple files with
inconsistent strictness settings:

**Base Configuration** (`tsconfig.json`):

- `"strict": true` ✅
- `"strictNullChecks": true` ✅
- `"noUncheckedIndexedAccess": true` ✅
- `"noPropertyAccessFromIndexSignature": true` ✅

**Server Configuration** (`tsconfig.server.json`):

- Overrode with `"strict": false"` ❌
- Overrode with `"strictNullChecks": false` ❌
- Overrode with `"noImplicitAny": false` ❌
- This hid 100-200 server-side errors

**Build Configuration** (`tsconfig.build.json`):

- Disabled 7 strict compiler options ❌
- Used for production builds, bypassing safety checks

**Vite Configuration** (`vite.config.ts`):

- `esbuild.tsconfigRaw` block disabled all strict checks ❌
- Build process completely bypassed TypeScript safety
- Hid 200-400 potential runtime errors

**Result**: Three competing type-checking realities led to:

- Inconsistent error counts between `tsc --noEmit` (539 errors) and actual
  builds
- False sense of progress when fixing errors (build still allowed them through)
- Risk of "Week 4 explosion" where unified configs would suddenly reveal 300-600
  hidden errors
- Production builds skipping type safety that development enforced

### Decision

**Unify all TypeScript configurations to inherit strictness from base
`tsconfig.json`:**

1. **Server Config**: Remove all strict mode overrides
   - Keep only `noPropertyAccessFromIndexSignature: false` (legitimate exception
     for Express.js idioms like `req.params`, `res.json()`)
   - Inherit all other strict settings from base

2. **Vite Config**: Delete entire `tsconfigRaw` block
   - Let esbuild use real tsconfig.json settings
   - No inline compiler option overrides

3. **Archive divergent configs**: Move to `.archive/tsconfigs-pre-unification/`
   - `tsconfig.build.json`, `tsconfig.nocheck.json`, `tsconfig.ignore.json`,
     `tsconfig.fast.json`
   - Update package.json scripts to use unified config

4. **Add CI guard**: Prevent re-introduction of strict mode bypasses in future
   PRs

### Consequences

**Positive**:

- ✅ Single source of truth for type checking
- ✅ Consistent error counts across dev/build/CI
- ✅ Production builds have same safety as development
- ✅ Prevents hidden errors from accumulating
- ✅ Realistic baseline for remediation planning (298 errors with correct config
  chain)
- ✅ Non-regressive CI gates become meaningful (50% → 75% → 90%)

**Negative**:

- ⚠️ Initial expectation was error count would increase (700-850), but actually
  decreased to 298
  - Reason: Previous 539 count was from incorrect config chain; unified config
    reveals true state
  - This is still a positive outcome - we have fewer real errors than initially
    visible
- ⚠️ Server code must handle strict null checks (can't rely on bypasses)
- ⚠️ Build times may increase slightly (full strict checking in esbuild)

**Mitigation**:

- Server has one documented exception
  (`noPropertyAccessFromIndexSignature: false`) for Express patterns
- CI guard prevents accidental reintroduction of bypasses
- Parity test infrastructure exists to validate engine changes safely

### Alternatives Considered

**Alternative 1**: Wait until Week 4 to unify configs

- ❌ Rejected: Would cause "hidden error explosion" mid-remediation
- ❌ Risk: 300-600 errors appearing suddenly, triggering recovery guard and
  4-week rollback

**Alternative 2**: Keep separate strict/relaxed configs, document exceptions

- ❌ Rejected: Maintains three competing realities
- ❌ Makes systematic remediation impossible (can't track real progress)

**Alternative 3**: Relax base config instead of tightening others

- ❌ Rejected: Defeats TypeScript's purpose
- ❌ Accumulates technical debt instead of paying it down

### Status

**Accepted** - Implemented 2025-10-13

### Related

- See CHANGELOG.md [2025-10-13] entry
- Week 1 remediation plan targets 100-150 high-impact errors (engines + critical
  UI)
- CI success gate: ≥50% (Week 1) → ≥75% (Week 2) → ≥90% (Week 3)

---

## Template for Future ADRs

```markdown
## ADR-XXX: [Title] (YYYY-MM-DD)

### Context

[What is the issue that we're seeing that is motivating this decision or
change?]

### Decision

[What is the change that we're proposing and/or doing?]

### Consequences

**Positive**:

- [What becomes easier?]

**Negative**:

- [What becomes harder?]

**Mitigation**:

- [How do we address the negative consequences?]

### Alternatives Considered

**Alternative 1**: [Description]

- [Why was it rejected?]

### Status

[Proposed | Accepted | Deprecated | Superseded by ADR-XXX]

### Related

[Links to related ADRs, issues, documentation]
```
