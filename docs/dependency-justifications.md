# Package Override Justifications

This document tracks all `package.json` overrides with rationale and review dates.

## Policy

1. Each override must be documented here with:
   - Package name and version
   - Reason for override
   - Date added
   - Expected removal date or review date
   - Link to relevant issue/PR

2. Overrides are reviewed quarterly (every 90 days)
3. Stale overrides (>90 days without review) trigger CI warnings
4. Unjustified overrides fail CI builds

## Current Overrides

### None

Currently no package overrides are in use. If you need to add one:

1. Add the override to `package.json`
2. Document it here following the template below
3. Link to the PR/issue that justifies it

## Template for New Overrides

```markdown
### `package-name`

**Version**: `x.y.z`
**Added**: YYYY-MM-DD
**Reason**: Brief explanation of why this override is needed
**Issue**: Link to GitHub issue or PR
**Review Date**: YYYY-MM-DD (90 days from added)
**Removal Plan**: When/how this override can be removed
```

## Historical Overrides (Removed)

None yet.
