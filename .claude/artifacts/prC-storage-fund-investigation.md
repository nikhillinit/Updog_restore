# PR C Storage Fund Investigation

Run ID: hermes-2026-06-23T23-06-10-372Z Phase: production Owner: codex Reviewer:
claude

## Finding

`server/storage.ts` is part of `tsconfig.server.json` compilation. The reviewer
claim that those two `: Fund` literals must fail the server typecheck was a
false positive as stated: the file is not silently excluded. It passed because
`server/storage.ts` imports `Fund` from `../schema/src/index.js`, which resolves
to `schema/src/index.ts` and then `schema/src/tables.ts`. Before this fix, that
legacy `funds` table did not define `baseCurrency`, so its `Fund` select shape
did not require the field.

Separately, `@shared/schema` resolves to `shared/schema.ts`, whose `Fund` type
is select-inferred from `shared/schema/fund.ts`; that schema does define
`baseCurrency: varchar('base_currency', { length: 3 }).notNull().default('USD')`.
In Drizzle select inference, a not-null column with a default is still present
and required in the selected row shape. The default only makes insert input
optional.

## Evidence

- `tsconfig.server.json` includes `server/**/*`, `shared/**/*`, and
  `schema/src/**/*`; it excludes tests via `**/*.test.ts` and `**/*.test.tsx`.
- `npx tsc -p tsconfig.server.json --listFilesOnly --pretty false` listed
  `server/storage.ts`, `schema/src/index.ts`, and `shared/schema/fund.ts`.
- `npx tsc -p tsconfig.server.json --traceResolution --pretty false` resolved
  `../schema/src/index.js` from `server/storage.ts` to `schema/src/index.ts`.
- A TypeScript compiler API probe showed:
  - `server/storage.ts` was in the server program.
  - `server/storage.ts` `Fund` resolved to `schema/src/tables.ts` and did not
    have `baseCurrency` before the fix.
  - `tests/unit/services/projected-metrics-calculator.test.ts` was not in the
    server program, but when added to a probe program its `@shared/schema`
    `Fund` had `baseCurrency`.

## Fix

- Added `baseCurrency` to the legacy `schema/src/tables.ts` `funds` table.
- Added `baseCurrency: 'USD'` to the two in-memory `Fund` literals in
  `server/storage.ts`.
- Added `baseCurrency: 'USD'` to the `Fund` literal in
  `tests/unit/services/projected-metrics-calculator.test.ts`.

## Verification

- `npx tsc -p tsconfig.server.json --noEmit --pretty false`: pass.
- `npm run check`: pass, 0 TypeScript errors.
