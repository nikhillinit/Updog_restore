# Archived Backup Directories

**Archived Date:** 2025-10-07
**Location:** `archive/2025-10-07/directories-backup/`

## Contents

### 1. Updog_restore-main/ (~44KB)
- **Original Location:** Root directory
- **Content:** Single `.claude/settings.local.json` file
- **Purpose:** Appears to be a directory from an earlier download/clone
- **Last Modified:** August 9, 2025
- **Safe to Archive:** ✅ Empty except for outdated Claude settings

### 2. claude_code-multi-AI-MCP/ (~134KB)
- **Original Location:** Root directory
- **Content:** Multi-AI MCP server implementation (Python)
- **Files:** 15 files including server.py, requirements.txt, README.md
- **Purpose:** Experimental MCP server for multi-AI workflows
- **Last Modified:** October 5, 2025
- **Safe to Archive:** ✅ Referenced in docs but not actively used
- **Note:** Documented in `MCP_MULTI_AI_INCIDENT_REPORT.md`

### 3. .claude.bak.20250812_212600/ (~4KB)
- **Original Location:** Root directory (hidden)
- **Content:** Backup of `.claude/settings.local.json`
- **Created:** August 12, 2025 21:26:00
- **Safe to Archive:** ✅ Backup file, redundant with current .claude/

### 4. server - memory shim/ (~75KB)
- **Original Location:** Root directory
- **Content:** In-memory server shim with circuit breaker infrastructure
- **Files:** 25 TypeScript files
- **Purpose:** Experimental in-memory database shim
- **Last Modified:** October 7, 2025
- **Safe to Archive:** ✅ Development prototype, superseded by production server/

**Key Files:**
- `bootstrap.memory-note.txt` - Setup notes
- `infra/circuit-breaker/` - 15 circuit breaker implementation files
- `repos/memory.ts` - In-memory repository implementation

## Rationale for Archiving

All four directories are:
1. **Not in active use** - No imports from production code
2. **Backups or experiments** - Either explicit backups (.claude.bak) or development prototypes
3. **Outdated** - Last modified weeks/months ago
4. **Documented elsewhere** - Functionality exists in primary locations

## Total Space Reclaimed

**~257KB** across 4 directories

## Restoration

If needed, these directories can be copied back from archive:

```bash
cp -r archive/2025-10-07/directories-backup/claude_code-multi-AI-MCP .
```

All files preserved with original structure.
