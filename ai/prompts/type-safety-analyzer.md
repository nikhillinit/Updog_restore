# Agent 1: Type Safety Analyzer

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

```json
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
```

## Rules
- NO 'any' casts
- NO 'as unknown[]' to downgrade readonly to mutable
- Prefer ReadonlyArray<T> in function signatures
- For chart shape differences, propose adapter functions (mappers)
- Use type guards (e.g., `x is Decimal`) over type assertions
- Each fix must include 'reasoning' field explaining why it's safe

## Deliverable
Save output as: **ai/out/type-safety.json**
