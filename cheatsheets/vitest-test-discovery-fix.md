# Vitest Test Discovery Fix Cheatsheet

## Problem: "No test suite found in file" Error

### Symptoms
- Tests fail with error: `Error: No test suite found in file C:/path/to/test.ts`
- Only affects tests that import from helper modules
- Simple tests without imports work fine
- Error occurs during test collection phase, before tests can run

### Root Cause
When `globals: true` is enabled in Vitest config, importing test functions (`describe`, `it`, `expect`, `beforeAll`, etc.) from 'vitest' creates a naming conflict that prevents test discovery.

### Quick Fix

**Remove redundant imports from test files:**

```typescript
// ❌ WRONG - Causes "No test suite found" error
import { describe, it, expect, beforeAll } from 'vitest';
import { testDb } from '../../helpers/test-database';

describe('My Test', () => {
  it('should work', () => {
    expect(1).toBe(1);
  });
});
```

```typescript
// ✅ CORRECT - Globals are already available
// Note: globals: true is enabled, so describe/it/expect are global
import { testDb } from '../../helpers/test-database';

describe('My Test', () => {
  it('should work', () => {
    expect(1).toBe(1);
  });
});
```

### Configuration Requirements

**vitest.config.ts or project config:**
```typescript
export default defineConfig({
  test: {
    globals: true,  // ← This must be true
    // ... other config
  },
});
```

Or for projects:
```typescript
projects: [
  {
    test: {
      name: 'server',
      globals: true,  // ← Add this to each project
      environment: 'node',
      // ...
    },
  },
]
```

### Setup File Issues

**Avoid using test hooks in setup files:**

```typescript
// ❌ WRONG - Can cause "Vitest failed to find the runner" error
// tests/setup/node-setup.ts
import { vi, beforeAll, afterAll } from 'vitest';

beforeAll(() => {  // ← This can fail before runner is initialized
  console.warn = vi.fn();
});
```

```typescript
// ✅ CORRECT - Direct patching or use beforeEach
// tests/setup/node-setup-fixed.ts
import { vi } from 'vitest';

// Option 1: Direct patching (no restoration needed for tests)
console.warn = vi.fn();
console.error = vi.fn();

// Option 2: Use beforeEach if you need per-test isolation
// (but only if runner is guaranteed to be initialized)
```

### Troubleshooting Steps

1. **Check if test imports from 'vitest':**
   ```bash
   grep -r "import.*from 'vitest'" tests/
   ```

2. **Verify globals are enabled:**
   ```bash
   grep -r "globals:" vitest.config.ts
   ```

3. **Test with minimal config:**
   ```typescript
   // vitest.minimal.config.ts
   export default defineConfig({
     test: {
       globals: true,
       environment: 'node',
       include: ['tests/**/*.test.ts'],
       setupFiles: [],  // Bypass all setup files
     },
   });
   ```

4. **Run single test in isolation:**
   ```bash
   npx vitest run --config vitest.minimal.config.ts path/to/single.test.ts
   ```

### Database Mock Normalization

For tests using database mocks with JSONB and array columns:

**Helper functions (database-mock-helpers.ts):**
```typescript
// Parse Postgres array literal to JS array
export function parsePgTextArray(lit: unknown): string[] | undefined {
  if (Array.isArray(lit)) return lit as string[];
  const s = String(lit).trim();
  if (!s.startsWith('{') || !s.endsWith('}')) return undefined;
  const body = s.slice(1, -1);
  if (!body) return [];
  return body.split(',').map(token => {
    const t = token.trim();
    return t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
  });
}

// Column type mappings
export const JSONB_COLS: Record<string, Set<string>> = {
  fund_state_snapshots: new Set(['portfolio_state','fund_metrics','metadata']),
  // ... other tables
};

export const ARRAY_COLS: Record<string, Set<string>> = {
  fund_state_snapshots: new Set(['tags']),
  // ... other tables
};
```

### Common Pitfalls

1. **Mixed import styles** - Either use globals OR imports, not both
2. **Setup file hooks** - Avoid beforeAll/afterAll in setup files
3. **vi.mock() placement** - Must be at module scope, not inside functions
4. **JSONB expectations** - Mock should return objects, not JSON strings
5. **Array expectations** - Handle both JS arrays and Postgres literals

### ESLint Rule to Prevent

Add to `.eslintrc.js`:
```javascript
rules: {
  'no-restricted-imports': ['error', {
    paths: [{
      name: 'vitest',
      importNames: ['describe', 'it', 'expect', 'beforeAll', 'afterAll', 'beforeEach', 'afterEach'],
      message: 'These are globally available when globals: true is enabled'
    }]
  }]
}
```

### Files Modified in Fix
- `tests/helpers/database-mock.ts` - Added normalization
- `tests/helpers/database-mock-helpers.ts` - New normalization functions
- `tests/setup/node-setup-fixed.ts` - Fixed setup without hooks
- `tests/unit/database/time-travel-schema.test.ts` - Removed vitest imports
- `vitest.fixed.config.ts` - Added globals: true to projects

### Result
- ✅ All 23 time-travel schema tests passing
- ✅ Test discovery working for all test files
- ✅ Database mock properly handling PostgreSQL types