# Archive Directory

This directory contains files that are no longer actively used but preserved for historical reference.

## Contents

### remediation/
Obsolete documentation from the Node.js v20.19.0 compatibility resolution process. These files documented the npx/ESM workarounds that were needed during the transition period but are no longer necessary after the final resolution.

**Files:**
- `REMEDIATION_EXEC.ps1` - PowerShell execution wrapper (Windows-specific)
- `REMEDIATION_FALLBACK.md` - Fallback strategies documentation
- `REMEDIATION_SUMMARY.md` - Comprehensive remediation summary
- `WINDOWS_NPX_WORKAROUND.md` - Windows npx workaround documentation
- `QUICK_START.md` - Quick start guide for workaround setup

**Archived:** 2025-10-05
**Reason:** Node.js engine compatibility fully resolved; workarounds no longer needed

---

### scripts/
Utility scripts created during the remediation process. These were temporary solutions for Node.js compatibility issues and have been superseded by the stable v20.19.0 configuration.

**AI Review Scripts:**
- `ai-node-version-review.mjs` - Automated Node.js version analysis
- `ai-remediation-debate.mjs` - Remediation strategy debate agent
- `ai-server-fix-debate.mjs` - Server fix strategy debate agent
- `ai-server-fix-review.mjs` - Server fix review agent

**Apply Scripts:**
- `apply-direct-node.mjs` - Direct Node.js execution approach
- `apply-npx-workaround.mjs` - npx workaround application
- `apply-sidecar-node.mjs` - Sidecar Node.js approach

**Detection & Recovery:**
- `detect-recovery-path.sh` - Recovery path detection

**Ensure Scripts:**
- `ensure-complete-local.mjs` - Complete local setup
- `ensure-local-vite.mjs` - Local Vite setup
- `ensure-sidecar.mjs` - Sidecar setup

**Lockfile Management:**
- `fresh-lockfile.sh` - Fresh lockfile generation
- `restore-lockfile.sh` - Lockfile restoration
- `verify-lockfile.sh` - Lockfile verification

**Miscellaneous:**
- `revert-to-normal.mjs` - Revert to normal configuration
- `sidecar-loader.mjs` - Sidecar loader utility
- `link-sidecar-vite.mjs` - Sidecar Vite linking

**Archived:** 2025-10-05
**Reason:** Remediation complete; Node.js v20.19.0 stable; scripts obsolete

---

## Why Archive Instead of Delete?

These files represent significant troubleshooting work and may be useful for:
1. **Historical reference** - Understanding the evolution of the build system
2. **Learning resource** - Examples of debugging complex dependency issues
3. **Future troubleshooting** - Similar issues may arise in different contexts
4. **Audit trail** - Documentation of technical decisions and their resolution

## Restoration

If you need to restore any of these files, they can be found in their respective subdirectories. However, note that they were designed for a specific set of conditions that no longer apply.

## Related Documentation

- See `CHANGELOG.md` for the complete timeline of changes
- See `DECISIONS.md` for architectural decisions related to Node.js version selection
- See commit `63fe950` for the final Node.js v20.19.0 alignment
