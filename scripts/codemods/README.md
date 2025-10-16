# Codemods

## TS4111: Bracketize index-signature property access (surgical)

This codemod replaces `obj.prop` with `obj["prop"]` **only when safe**:

- The left-hand type has a **string or number index signature**, **and**
- The accessed property **does not** exist as a declared member on that type,
- For **unions**, **every** constituent must satisfy the same condition.

> Why: `noPropertyAccessFromIndexSignature: true` forbids dot access on index-only types.

### Dry run
```bash
npm run codemod:ts4111:dry
```
Writes a JSON summary to `artifacts/week2/ts4111-codemod-report.json` (no file changes).

### Apply by directory (atomic commits)
```bash
npm run codemod:ts4111:services
git add server/services && git commit -m "fix(services): TS4111 codemod (bracketize index access)"

npm run codemod:ts4111:routes
git add server/routes && git commit -m "fix(routes): TS4111 codemod (bracketize index access)"

npm run codemod:ts4111:middleware
git add server/middleware && git commit -m "fix(middleware): TS4111 codemod (bracketize index access)"
```

### Single file trial
```bash
npm run codemod:ts4111:file -- server/services/performance-prediction.ts
```

### Notes
- Skips `.d.ts`, test files, and non-TS sources.
- Leaves declared members (keeps dot notation when property exists).
- Leaves `any`/`unknown`/type-parameter cases untouched.
- Honors workspace ESM (uses `tsx`).
