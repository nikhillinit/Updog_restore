# Agent 3: Business Logic Specialist

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

```json
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
```

## Rules
- NO casts to force compilation
- Prefer required/optional fields that reflect actual business logic
- ALWAYS include exhaustiveness check for discriminated unions
- For missing properties, determine if they should be optional or required
- Include domain reasoning (why is this field optional vs required?)
- Flag architectural concerns if types suggest deeper issues

## Deliverable
Save output as: **ai/out/business-logic.json**
