# Financial Precision

Runtime financial math now goes through `shared/lib/decimal-config.ts`.

Rules:

- Call `Decimal.set()` in one place only: the shared wrapper.
- Import `Decimal` from `@shared/lib/decimal-config` in runtime code.
- Keep rounding at export and display boundaries instead of mutating global
  precision per module.

Current runtime defaults:

- Precision: `28`
- Rounding: `ROUND_HALF_UP`

Guardrails:

- ESLint blocks direct `decimal.js` imports in runtime code.
- Tests may import `decimal.js` directly when they intentionally verify library
  behavior.
