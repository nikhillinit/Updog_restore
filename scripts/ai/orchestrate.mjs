#!/usr/bin/env node
/**
 * Generate subagent prompts for TypeScript error remediation
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

const outDir = path.join(rootDir, 'ai', 'out');
const promptDir = path.join(rootDir, 'ai', 'prompts');

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(promptDir, { recursive: true });

const prompts = {
  'type-safety-analyzer.md': typeSafetyPrompt(),
  'pattern-detector.md': patternDetectorPrompt(),
  'business-logic.md': businessLogicPrompt()
};

for (const [name, content] of Object.entries(prompts)) {
  fs.writeFileSync(path.join(promptDir, name), content, 'utf8');
  console.log(`✅ Created: ai/prompts/${name}`);
}

console.log(`
================================================================================
📋 Subagent Prompts Generated
================================================================================

Next steps:
1) Launch 3 subagents in parallel using the prompts in ai/prompts/
2) Have each agent save JSON output to ai/out/
   - ai/out/type-safety.json
   - ai/out/pattern-detector.json
   - ai/out/business-logic.json
3) Apply fixes manually in batches (commit per group)

Expected time: 10 minutes (agents run in parallel)
================================================================================
`);

function typeSafetyPrompt() {
  return `# Agent 1: Type Safety Analyzer

## Goal
Resolve readonly/type compatibility issues WITHOUT using 'any' or unsafe casts.

## Context
- Project uses React Query (readonly arrays from TanStack Query)
- Chart components use Recharts/Nivo libraries
- Must preserve immutability contracts
- Prefer ReadonlyArray<T> acceptance or adapters
- Use user-defined type guards over casts

## Files to Analyze
Attach these files from the repository:
1. client/src/hooks/useInvalidateQueries.ts (3 errors)
2. client/src/lib/decimal-utils.ts (2 errors)
3. client/src/components/charts/investment-breakdown-chart.tsx (1 error)
4. client/src/components/dashboard/portfolio-concentration.tsx (1 error)
5. client/src/components/forecasting/portfolio-insights.tsx (1 error)
6. client/src/components/charts/nivo-allocation-pie.tsx (1 error)

## Expected Output Format

Return a JSON array with this structure:

\`\`\`json
[
  {
    "file": "client/src/hooks/useInvalidateQueries.ts",
    "errors": [
      {
        "line": 19,
        "issue": "Type '(query: { queryKey: unknown[]; }) => boolean' is not assignable to type '(query: Query<unknown, Error, unknown, readonly unknown[]>) => boolean'",
        "rootCause": "Query.queryKey is readonly unknown[], predicate expects mutable unknown[]",
        "fixes": [
          {
            "approach": "Change function signature to accept ReadonlyArray",
            "safety": "high",
            "code": "const predicate = (query: { queryKey: ReadonlyArray<unknown> }) => { /* ... */ }",
            "reasoning": "Preserves immutability contract from React Query"
          },
          {
            "approach": "Local spread to create mutable copy",
            "safety": "medium",
            "code": "const mutableKeys = [...query.queryKey];",
            "reasoning": "Only if mutation is truly needed (unlikely)"
          }
        ],
        "chosen": 0,
        "notes": "First approach is strongly preferred - no reason to mutate query keys"
      }
    ]
  }
]
\`\`\`

## Rules
- NO 'any' casts
- NO 'as unknown[]' to downgrade readonly to mutable
- Prefer ReadonlyArray<T> in function signatures
- For chart shape differences, propose adapter functions (mappers)
- Use type guards (e.g., \`x is Decimal\`) over type assertions
- Each fix must include 'reasoning' field explaining why it's safe

## Deliverable
Save output as: **ai/out/type-safety.json**
`;
}

function patternDetectorPrompt() {
  return `# Agent 2: Pattern Detector (Mechanical Fixes)

## Goal
Provide exact import/alias rewrites and flag adapter typing.

## Context
- Vite aliases configured: @/, @components/, @core/, @context/
- Feature flags are snake_case from backend, should be camelCase in frontend
- Prefer adapter pattern over bracket access for known properties
- Use \`import type\` for type-only imports (tree-shaking)

## Files to Analyze
Attach these files:
1. client/src/core/flags/flagAdapter.ts (2 index signature errors)
2. client/src/adapters/kpiAdapter.ts (1 missing export error)
3. client/src/features/scenario/ScenarioCompareChart.tsx (1 module resolution error)
4. client/src/features/scenario/summary.ts (1 module resolution error)
5. client/src/utils/export-reserves.ts (1 missing dependency error)

## Expected Output Format

Return a JSON array:

\`\`\`json
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
\`\`\`

## Rules
- Prefer Vite aliases (@/, @components/, etc.) over relative imports
- For missing exports, identify correct export name
- For index signatures, propose proper type definition + adapter
- Include 'import type' suggestion where applicable
- Flag any cases where bracket access might be legitimate (true dictionaries)

## Deliverable
Save output as: **ai/out/pattern-detector.json**
`;
}

function businessLogicPrompt() {
  return `# Agent 3: Business Logic Specialist

## Goal
Complete discriminated unions, state machine types, and fill missing properties where domain requires.

## Context
- Waterfall: American vs European carry structures (venture capital domain)
- Fund calculations use Decimal.js for precision arithmetic
- Wizard uses XState for state machine management
- Must add exhaustiveness checks (switch + never) for discriminated unions

## Files to Analyze
Attach these files:
1. client/src/pages/WaterfallStep.tsx (6 errors - discriminated union)
2. client/src/lib/fund-calc-v2.ts (3 errors - missing properties)
3. client/src/hooks/useModelingWizard.ts (1 error - state machine type)
4. client/src/workers/simulation.worker.ts (1 error - missing export)

## Expected Output Format

Return a JSON array:

\`\`\`json
[
  {
    "file": "client/src/pages/WaterfallStep.tsx",
    "domain": "Waterfall carry structure (American vs European)",
    "problems": [
      "Property 'hurdle' does not exist on type { type: 'AMERICAN'; ... }",
      "Property 'catchUp' accessed but not in AMERICAN variant",
      "Type comparison 'AMERICAN' vs 'EUROPEAN' suggests incomplete union"
    ],
    "currentUnion": "type WaterfallStructure = { type: 'AMERICAN'; carryVesting: {...} } | { type: 'EUROPEAN'; ... }",
    "proposedTypes": "type WaterfallStructure = | { type: 'AMERICAN'; carryVesting: { cliffYears: number; vestingYears: number }; hurdle?: number; catchUp?: number; } | { type: 'EUROPEAN'; hurdle: number; catchUp: number; }",
    "exhaustivenessCheck": "function validate(w: WaterfallStructure): boolean { switch (w.type) { case 'AMERICAN': return w.carryVesting.cliffYears >= 0; case 'EUROPEAN': return w.hurdle > 0; default: const _: never = w; return _; } }",
    "reasoning": {
      "americanOptional": "American waterfall may have optional hurdle rate; not all firms use hurdles",
      "europeanRequired": "European waterfall structure always requires hurdle and catch-up rates",
      "exhaustiveness": "Never-check ensures new variants can't be added without updating all switches"
    },
    "notes": "Confirm with finance team whether AMERICAN can truly have hurdle"
  }
]
\`\`\`

## Rules
- NO casts to force compilation
- Prefer required/optional fields that reflect actual business logic
- ALWAYS include exhaustiveness check for discriminated unions
- For missing properties, determine if they should be optional or required
- Include domain reasoning (why is this field optional vs required?)
- Flag architectural concerns if types suggest deeper issues

## Deliverable
Save output as: **ai/out/business-logic.json**
`;
}
