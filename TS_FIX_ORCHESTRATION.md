# TypeScript Fix Orchestration Guide

## 🎯 Mission
Zero TypeScript errors with improved type coverage and maintainable architecture.

## 📊 Baseline Metrics
```bash
# Captured at start - All agents must improve these
TypeScript Errors: 120
Type Coverage: [TO BE MEASURED]
Build Status: PASSING (despite TS errors)
Test Status: [TO BE MEASURED]
Timestamp: 2025-01-22
```

## 🚦 Branch Strategy
All branches follow pattern: `ts-fix/[domain]-[specific]`
- Integration branch: `ts-fix/integration` (rebased nightly)
- PR labels: `ts-fix-schema`, `ts-fix-config`, `ts-fix-component`, `ts-fix-api`

---

## 👥 Agent Assignments

### Agent 1: Schema & Interface Alignment Specialist
**Branch**: `ts-fix/schema-fund`
**Models**: Opus > Sonnet 3.5 > Haiku

#### Quick Win Script
```typescript
// schema-diff.ts - Run with ts-node
import { Project } from 'ts-morph';

const project = new Project();
const sourceFile = project.addSourceFileAtPath('./shared/types.ts');

// Extract Fund interface properties
const fundInterface = sourceFile.getInterface('Fund');
const fundProps = new Set(fundInterface?.getProperties().map(p => p.getName()) || []);

// Extract CompleteFundSetup properties
const setupInterface = sourceFile.getInterface('CompleteFundSetup');
const setupProps = new Set(setupInterface?.getProperties().map(p => p.getName()) || []);

// Diff
console.log('In Fund but not Setup:', [...fundProps].filter(x => !setupProps.has(x)));
console.log('In Setup but not Fund:', [...setupProps].filter(x => !fundProps.has(x)));
```

#### Key Deliverables
1. Create `DraftFund` interface for wizard partial state
2. Implement `npm run gen:schema` using zod-to-ts
3. Update shared `types/index.ts` barrel file
4. Fix 40+ property mismatches in fund-setup.tsx

#### Files to Modify
- `shared/types.ts` or create `shared/types/fund.ts`
- `client/src/pages/fund-setup.tsx`
- `package.json` (add gen:schema script)

---

### Agent 2: TypeScript Configuration & Build Engineer
**Branch**: `ts-fix/config-build`
**Models**: Sonnet 3.5 > Haiku > Opus

#### Configuration Updates
```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true, // TEMPORARY - must disable before final merge
    // Remove downlevelIteration
  }
}
```

#### Vite Config Validation
```typescript
// vite.config.ts - Ensure esbuild target matches
export default defineConfig({
  esbuild: {
    target: 'es2020'
  }
  // ...
});
```

#### Key Deliverables
1. Upgrade to TypeScript ≥5.4
2. Configure modern ES target
3. Set up `tsc --watch` monitoring
4. Add type-coverage tooling

---

### Agent 3: Component Type Safety Specialist
**Branch**: `ts-fix/component-types`
**Models**: Sonnet 3.5 > Opus > Claude 3

#### Discriminated Union Solution
```typescript
// shared/types/field-value.ts
export type FieldValue = 
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'date'; value: Date }
  | { kind: 'tags'; value: string[] }
  | { kind: 'color'; value: string }
  | { kind: 'node'; value: ReactNode };

// Helper guards
export const isDateField = (value: FieldValue): value is { kind: 'date'; value: Date } => 
  value.kind === 'date';
```

#### Key Deliverables
1. Implement FieldValue discriminated union
2. Fix custom-fields-editor.tsx type issues
3. Resolve React component prop mismatches
4. Update all imports to use barrel exports

---

### Agent 4: API & Data Flow Specialist
**Branch**: `ts-fix/api-data`
**Models**: Opus > Sonnet 3.5 > Claude 3

#### Zod Schema Example
```typescript
// shared/schemas/api.ts
import { z } from 'zod';

export const FundResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  // ... complete schema
});

export type FundResponse = z.infer<typeof FundResponseSchema>;

// Usage in API calls
const response = await fetch('/api/funds');
const data = await response.json();
const validatedData = FundResponseSchema.parse(data);
```

#### Key Deliverables
1. Add zod/io-ts decoders at fetch boundaries
2. Fix Response vs Fund type confusion
3. Create type-safe API client
4. Generate types from schemas

---

## 📋 Coordination Protocol

### Real-time Monitoring
```bash
# In tmux pane - visible to all agents
npx tsc --noEmit --watch --pretty
```

### Progress Tracking
Each agent updates their section:
```markdown
## Agent 1 Status
- [x] Created DraftFund interface
- [ ] Updated fund-setup.tsx (in progress)
- [ ] gen:schema script
Errors reduced: 45 → 12
```

### Integration Rules
1. Rebase on `ts-fix/integration` daily
2. CI runs full suite on integration branch
3. No direct commits to main from agent branches

---

## ✅ Success Criteria

### Per-PR Requirements
- [ ] Error count decreased from baseline
- [ ] No new `any` types introduced
- [ ] All tests passing
- [ ] Build succeeds

### Final Merge Checklist
- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npm run type-coverage` ≥ 90%
- [ ] `npm test` → all green
- [ ] `npm run build` → success
- [ ] Lighthouse performance unchanged
- [ ] `skipLibCheck: false` in tsconfig.json
- [ ] All feature branches merged to integration
- [ ] Integration merged to main

---

## 🛠 Tooling Setup

### Install Dependencies
```bash
npm install -D type-coverage ts-morph zod zod-to-ts eslint-plugin-typescript-sort ts-prune
```

### Add NPM Scripts
```json
{
  "scripts": {
    "gen:schema": "ts-node scripts/generate-types.ts",
    "type-coverage": "type-coverage --at-least 90",
    "ts:watch": "tsc --noEmit --watch --pretty",
    "lint:types": "ts-prune",
    "test:client": "pnpm --filter './client' test"
  }
}
```

### CI Configuration
```yaml
# .github/workflows/ts-fix-integration.yml
name: TypeScript Fix Integration
on:
  push:
    branches: ['ts-fix/**']

jobs:
  type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Type Check
        run: |
          npm ci
          npx tsc --noEmit
          npm run type-coverage
```

---

## 🚀 Launch Sequence

1. **T+0**: Create this orchestration doc
2. **T+5min**: Capture baseline metrics
3. **T+10min**: All agents create branches
4. **T+15min**: Agent 2 updates tsconfig (unblocks others)
5. **T+30min**: Agent 1 creates DraftFund interface (unblocks Agent 3)
6. **T+1hr**: First integration rebase
7. **T+2hr**: Progress check & coordination
8. **T+4hr**: Target completion

---

## 📝 Notes
- Use `@ts-expect-error` with TODO comment instead of `@ts-ignore`
- Prefer unknown over any when type is truly unknown
- Document any temporary workarounds with FIXME comments