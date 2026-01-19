---
status: ACTIVE
last_updated: 2026-01-19
---

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

### All Fixed
- glob@11.0.3 -> 11.1.0 (CVE-2025-64756 resolved)
- diff@4.0.2 -> 8.0.3 (GHSA-73rr-hh4g-fpgx resolved)
- @react-pdf/pdfkit@3.2.0 -> 4.1.0 (obfuscation risk resolved)
- @react-pdf/renderer@3.4.5 -> 4.3.2 (dependency upgrade)

## Technical Note
Initial npm override approach failed for hoisted transitive deps.
Resolution required upgrading @react-pdf/renderer directly, which:
1. Pulled in patched @react-pdf/pdfkit 4.1.0
2. Allowed npm override for diff to apply correctly
