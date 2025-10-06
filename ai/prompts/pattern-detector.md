# Agent 2: Pattern Detector (Mechanical Fixes)

## Goal
Provide exact import/alias rewrites and flag adapter typing.

## Context
- Vite aliases configured: @/, @components/, @core/, @context/
- Feature flags are snake_case from backend, should be camelCase in frontend
- Prefer adapter pattern over bracket access for known properties
- Use `import type` for type-only imports (tree-shaking)

## Files to Analyze
Attach these files:
1. client/src/core/flags/flagAdapter.ts (2 index signature errors)
2. client/src/adapters/kpiAdapter.ts (1 missing export error)
3. client/src/features/scenario/ScenarioCompareChart.tsx (1 module resolution error)
4. client/src/features/scenario/summary.ts (1 module resolution error)
5. client/src/utils/export-reserves.ts (1 missing dependency error)

## Expected Output Format

Return a JSON array:

```json
[
  {
    "file": "client/src/features/scenario/ScenarioCompareChart.tsx",
    "errorType": "module_resolution",
    "autoFixable": true,
    "currentImport": "import { api } from './api'",
    "fixedImport": "import { api } from '@/features/scenario/api'",
    "alias": "@/",
    "confidence": "high",
    "notes": "Relative import should use Vite alias"
  },
  {
    "file": "client/src/core/flags/flagAdapter.ts",
    "errorType": "index_signature",
    "autoFixable": false,
    "problem": "Property 'enable_new_ia' comes from index signature, must access with ['enable_new_ia']",
    "proposedTypes": {
      "RawFlags": "Record<string, boolean | number>",
      "CleanFlags": "{ enableNewIA: boolean; enableKPISelectors: boolean; }",
      "adapter": "function adaptFlags(raw: RawFlags): CleanFlags { return { enableNewIA: !!raw['enable_new_ia'], enableKPISelectors: !!raw['enable_kpi_selectors'] }; }"
    },
    "reasoning": "Domain model should use camelCase, adapter centralizes snake_case→camelCase conversion"
  }
]
```

## Rules
- Prefer Vite aliases (@/, @components/, etc.) over relative imports
- For missing exports, identify correct export name
- For index signatures, propose proper type definition + adapter
- Include 'import type' suggestion where applicable
- Flag any cases where bracket access might be legitimate (true dictionaries)

## Deliverable
Save output as: **ai/out/pattern-detector.json**
