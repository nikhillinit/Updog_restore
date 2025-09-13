# Analytics PR Fix - Resume Guide

## Current Status (as of commit fecc1e9)

### ✅ Completed
- **Phase 1**: Dependency hygiene - Zod versions aligned via drizzle-zod 0.5.1
- **Phase 2**: ESLint two-tier configuration implemented

### 🚧 In Progress
- Fixing server-side Drizzle schema errors from downgrade

### 📋 Remaining Phases
3. Add characterization tests for XIRR and waterfall
4. Refactor complex functions on feature branch
5. Diagnose and fix CI performance issues
6. Implement SSR-safe feature flags
7. Add observability and monitoring
8. Merge to main (dark) and dogfood

## Known Issues

### Critical
1. **Server schema incompatibility** - drizzle-zod 0.5.1 creates overly restrictive insert schemas
   - Files affected: `server/storage.ts`, `server/routes/*.ts`
   - Solution options:
     a. Revert to drizzle-zod 0.8.3 and fix types differently
     b. Update all server insert operations to match new schema

### Non-Critical
- Some test files use `any` types as workarounds
- Performance benchmarks still failing in CI

## Commands to Resume

```bash
# 1. Check current state
git status
npm run check

# 2. If reverting drizzle-zod:
npm install drizzle-zod@0.8.3
# Then apply alternative fix for schema types

# 3. Continue with Phase 3:
# Create characterization tests in:
# - client/src/lib/finance/__tests__/fixtures/xirr-cases.json
# - client/src/lib/waterfall/__tests__/fixtures/ledger-cases.json

# 4. Test everything
npm run test:quick
npm run lint
```

## Key Files Modified
- `shared/schema.ts` - Simplified insert schemas (may need revert)
- `eslint.config.js` - Two-tier configuration
- `tsconfig.eslint.json` - Targeted type checking config
- `client/src/lib/finance/xirr.ts` - Added export alias
- `client/src/lib/waterfall/american-ledger.ts` - Added export alias

## Context Links
- Original PR: #89
- Strategy doc: See conversation history for revised 8-phase approach
- CI failures: memory-mode, fast-checks, performance benchmarks