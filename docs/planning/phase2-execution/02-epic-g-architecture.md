# Epic G: Unified Feature Flags Architecture

**Status:** PLANNING
**Date:** 2026-01-22
**Objective:** Single authoritative flag system (Client + Server + YAML)

---

## Current State: FRAGMENTED

### Flag Systems Inventory (10+ systems!)

| System | Location | Flags | Status |
|--------|----------|-------|--------|
| 1. Lightweight ENV | `client/src/core/flags/featureFlags.ts` | 7 | ACTIVE |
| 2. Advanced Lib | `client/src/lib/feature-flags.ts` | 13 | ACTIVE (engines) |
| 3. Shared Definitions | `shared/feature-flags/flag-definitions.ts` | 20+ | ACTIVE |
| 4. Flag Adapter | `client/src/core/flags/flagAdapter.ts` | Bridge | ACTIVE |
| 5. Server DB Flags | `server/lib/flags.ts` | 2 | ACTIVE |
| 6. Simple Server | `server/flags.ts` | 4 | ACTIVE |
| 7a. useFlags (shared) | `client/src/shared/useFlags.ts` | Hook | ACTIVE |
| 7b. useFlags (API) | `client/src/hooks/useFlags.tsx` | Hook | ACTIVE |
| 8. Legacy JSON | `client/src/hooks/useFeatureFlag.ts` | 5 | DEAD |
| 9. YAML Defs | `flags/*.yaml` | 2 | DORMANT |

### Critical Issues

1. **Naming Conflicts:**
   - `NEW_IA` (System 1) vs `enable_new_ia` (System 3) vs `new_ia` (System 2)
   - Two `useFlag()` hooks with same name, different implementations
   - Two `useFlags()` hooks with same name, different implementations

2. **No Single Source of Truth:**
   - Three places define the same flag with different names
   - YAML files exist but aren't loaded
   - Drift risk is HIGH

3. **Dead Code:**
   - `features.json` with 5 flags (never imported)
   - `wasm_reserves`, `live_kpi_selectors` at 0% rollout (never used)

---

## Target Architecture

```
┌─────────────────────────────────────────────────────┐
│         CANONICAL FLAG REGISTRY (YAML)              │
│           flags/registry.yaml                       │
│    - All flags defined once                         │
│    - Schema: key, default, owner, risk, exposeToClient │
│    - Dependencies, expiration, rollout %            │
└─────────────────────────────────────────────────────┘
                       ↓
              ┌───────────────┐
              │   CODEGEN     │
              │ (build step)  │
              └───────────────┘
           ↙                    ↘
    ┌─────────────┐        ┌──────────────┐
    │   CLIENT    │        │    SERVER    │
    │ generated   │        │  generated   │
    │ types.ts    │        │  types.ts    │
    └─────────────┘        └──────────────┘
           ↓                      ↓
    ┌─────────────┐        ┌──────────────┐
    │  useFlag()  │        │  getFlag()   │
    │  (single)   │        │  (single)    │
    └─────────────┘        └──────────────┘
```

---

## Implementation Plan

### Phase 1: Create Canonical Registry (G1-G2)

**Task G1: Flag Inventory Consolidation**
- Merge all 30+ flags into single `flags/registry.yaml`
- Standardize naming: `snake_case` (e.g., `enable_new_ia`)
- Remove duplicates, mark dead flags

**Task G2: YAML Schema + Codegen**
```yaml
# flags/registry.yaml
flags:
  enable_new_ia:
    default: false
    description: "5-route navigation"
    owner: "gp-team"
    risk: low
    exposeToClient: true
    environments:
      development: true
      staging: false
      production: false
    dependencies: []
    expiresAt: null
```

Generate:
- `shared/generated/flag-types.ts` - TypeScript types
- `shared/generated/flag-defaults.ts` - Default values

### Phase 2: Unified Client API (G3)

**Single Hook:**
```typescript
// client/src/hooks/useFlag.ts
export function useFlag(key: FlagKey): boolean {
  // Priority: URL param > localStorage > API > default
  const override = getOverride(key);
  if (override !== null) return override;

  const { data } = useQuery({ queryKey: ['flags'] });
  return data?.[key] ?? FLAG_DEFAULTS[key];
}
```

**Single Utility:**
```typescript
// shared/flags/getFlag.ts
export function getFlag(key: FlagKey, context?: UserContext): boolean {
  // Server: DB lookup with targeting
  // Client: Same as useFlag (non-hook)
}
```

### Phase 3: Runtime Overrides (G4)

**Dev Overrides (preserved):**
- URL params: `?ff_enable_new_ia=true`
- localStorage: `ff_enable_new_ia`
- DevTools panel for toggling

**Production:**
- API endpoint `/api/flags` (ETag cached)
- User targeting via JWT context
- Kill switch via `FLAGS_DISABLED_ALL=1`

### Phase 4: Validation + Observability (G5)

**Schema Validation:**
- Zod schema for flag definitions
- CI check: unknown flags in code = error
- Dev: warn on unknown, prod: ignore safely

**Observability:**
- Telemetry: `flag_evaluated` event (rate-limited)
- Dashboard: flag usage metrics
- Audit log: flag changes with reason

### Phase 5: Deprecation (G6)

**Remove:**
- `client/src/lib/feature-flags.ts` (System 2)
- `client/src/hooks/useFeatureFlag.ts` (System 8)
- `client/src/config/features.json` (dead)
- Duplicate `useFlags.ts` implementations

**Migrate:**
- All `FLAGS.NEW_IA` → `useFlag('enable_new_ia')`
- All `isEnabled('new_ia')` → `useFlag('enable_new_ia')`

---

## Migration Path

| Component | Current | Target | Risk |
|-----------|---------|--------|------|
| AdminRoute | `FLAGS.UI_CATALOG` | `useFlag('ui_catalog')` | LOW |
| Engine selector | `isEnabled('ts_reserves')` | `getFlag('ts_reserves')` | MEDIUM |
| LegacyRouteRedirector | `useFlag('enable_new_ia')` | No change | NONE |
| API routes | `getFlags()` | `getFlag(key)` | LOW |

---

## Files to Create

| File | Purpose |
|------|---------|
| `flags/registry.yaml` | Canonical flag definitions |
| `flags/schema.ts` | Zod validation schema |
| `scripts/generate-flag-types.ts` | Codegen script |
| `shared/generated/flag-types.ts` | Generated types |
| `shared/generated/flag-defaults.ts` | Generated defaults |
| `client/src/hooks/useFlag.ts` | Unified client hook |
| `shared/flags/getFlag.ts` | Unified utility |

## Files to Delete

| File | Reason |
|------|--------|
| `client/src/lib/feature-flags.ts` | Duplicate (System 2) |
| `client/src/hooks/useFeatureFlag.ts` | Dead (System 8) |
| `client/src/config/features.json` | Dead config |
| `client/src/shared/useFlags.ts` | Merge into hooks/ |

---

## Verification

- [ ] All flags defined in registry.yaml
- [ ] Codegen produces valid TypeScript
- [ ] `useFlag()` works in client components
- [ ] `getFlag()` works on server
- [ ] Dev overrides (URL param, localStorage) work
- [ ] API endpoint returns only `exposeToClient=true` flags
- [ ] No duplicate imports in codebase
- [ ] Dead code removed
