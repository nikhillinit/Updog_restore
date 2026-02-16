# REFL-021: exactOptionalPropertyTypes Requires Spread Pattern

**Created:** 2026-02-16 **Severity:** Medium **Category:** TypeScript / State
**Occurrences:** 6+ (P3 complexity refactor, P4 pipeline implementation)

## Anti-Pattern

When `exactOptionalPropertyTypes: true` is enabled in tsconfig, passing
`undefined` explicitly to an optional property is a type error:

```typescript
// FAILS: Type 'number | undefined' is not assignable to type 'number'
<Modal fundId={fundId ?? undefined} />

// FAILS: same issue with object literals
buildUrl({ search: filters.search || undefined })
```

TypeScript distinguishes between "property is missing" and "property is
`undefined`". With this flag, optional properties only accept their declared
type OR being omitted entirely -- not `undefined`.

## Root Cause

`exactOptionalPropertyTypes` (strict family) makes `{ prop?: T }` mean "prop can
be missing or T" rather than "prop can be missing, T, or undefined". This is
correct behavior but breaks common JavaScript patterns like
`prop={value ?? undefined}`.

## Fix

Use the conditional spread pattern to omit the property entirely when no value:

```typescript
// JSX props
<Modal {...(fundId != null && { fundId })} />

// Object literals
buildUrl({
  ...(filters.search && { search: filters.search }),
  ...(filters.status && { status: filters.status }),
})
```

For function parameters, use overloads or conditional spreading into the options
object.

## Detection

- TS error codes: TS2375, TS2412, or the general assignability error when
  `undefined` appears in the diagnostic
- Pattern: `?? undefined` or `|| undefined` in assignments to optional props
- Grep: `rg "\?\? undefined|\|\| undefined" --type ts`

## Files Affected (P4)

- `client/src/pages/pipeline.tsx` (buildDealsUrl params, modal props)
- `client/src/components/pipeline/AddDealModal.tsx` (fundId prop)
- `client/src/components/pipeline/ImportDealsModal.tsx` (fundId prop)

## Related

- REFL-008: TypeScript type inference from database schemas
- tsconfig.json `exactOptionalPropertyTypes: true`
