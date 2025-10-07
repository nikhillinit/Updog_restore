# Default Parameters Directory - Archive Note

**Archived:** 2025-10-07
**Size:** ~2MB
**Original Location:** Root directory

## Contents

### Documents
- `Capital Allocation Example.pdf` (846KB) - Example capital allocation documentation
- `README.md` (186 bytes) - Directory documentation

### Screenshots & Images
- `Screenshot 2025-10-02 020217.png` (257KB)
- `Screenshot 2025-10-02 020240.png` (283KB)
- `image (2).avif` (321KB)

### Data Files
- `us_vc_benchmarks_q2_2025_with_esop.xlsx` (6.4KB) - Q2 2025 VC benchmarks
- `US_VC_Benchmarks_with_Months-to-Exit__Q2_2025_.csv` (1.4KB)
- `Venture Capital Model^J by Foresight (4) - Cohort By Analysis.csv` (46KB)

### Subdirectories
- `ADR/` - Architecture Decision Records
- `MagicPatterns Design Code/` - UI design templates/code
- `msw/` - Mock Service Worker configurations
- `New folder/` - Miscellaneous
- `openapi/` - OpenAPI specifications
- `src/` - Source code examples

## Purpose

Reference materials, examples, and design assets used during initial development:
- Industry benchmarks (VC Q2 2025)
- Capital allocation examples
- Design patterns and templates
- Mock data configurations
- Architecture documentation

## Rationale for Archiving

1. **Reference Materials:** Not part of active codebase
2. **Development Assets:** Used during prototyping phase
3. **Size:** 2MB of non-code assets in root directory
4. **Organization:** Better suited for `docs/references/` if needed

## Restoration

If benchmark data or design assets are needed:

```bash
cp -r "archive/2025-10-07/directories-backup/Default Parameters" ./
```

Or selectively restore specific files:

```bash
cp "archive/2025-10-07/directories-backup/Default Parameters/Capital Allocation Example.pdf" docs/
```
