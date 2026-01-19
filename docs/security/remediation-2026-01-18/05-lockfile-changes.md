# Lockfile Changes

## Files Modified
- `package.json`: Updated glob ^11.0.3 -> ^11.1.0, added overrides
- `package-lock.json`: glob resolved to 11.1.0

## package.json Changes
```json
// devDependencies
"glob": "^11.1.0"  // was ^11.0.3

// overrides added
"diff": "^8.0.3",
"@react-pdf/pdfkit": "^4.1.0"
```

## Vulnerable Version Removal Confirmation

### Confirmed Fixed
- glob@11.0.3 -> 11.1.0 (CVE-2025-64756 resolved)

### Not Fixed (Override Limitation)
- diff@4.0.2 remains (npm override not honored for hoisted deps)
- @react-pdf/pdfkit@3.2.0 remains (npm override not honored)

## Technical Note
npm overrides have limitations with transitive dependencies that are hoisted.
The `diff` package is required by `ts-node` and `ts-morph`, both of which
declare `^4.0.1` as a peer dependency. The override syntax `"diff": "^8.0.3"`
is not being applied because npm prioritizes the declared peer dependency range.

### Recommended Resolution
1. Upgrade `ts-node` to a version that supports diff 8.x
2. Or use `npm-force-resolutions` package
3. Or migrate to yarn/pnpm which have stricter resolution mechanisms
