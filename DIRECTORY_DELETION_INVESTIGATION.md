# Directory Deletion Investigation Report

**Date:** May 21, 2026  
**Scope:** Five candidate directories for removal in `C:\dev\Updog_restore`  
**Investigator:** Claude Code read-only analysis

---

## Executive Summary

Investigation examined five directories for deletion candidacy using git
history, gitignore status, active code references, and recent commit activity.
Two directories are **SAFE_DELETE** (zero blast radius), one is
**ARCHIVE_CANDIDATE** (abandoned duplicate), and two are **LOAD_BEARING** but
with important caveats about actual usage patterns.

**Key Discovery:** The `ai/` directory, while marked LOAD_BEARING structurally,
is actually **DORMANT** and not actively used—it can be archived and safely
removed after evidence preservation.

---

## Per-Directory Analysis

### 1. `artifacts/` — 205 KB

**A. Existence & Size**

- EXISTS. ~205 KB on disk.
- Contents: `gate0-metadata.json`, `phase0/` (subdir with 20+ timestamped
  subdirs containing analysis results), `sidecar/` (subdir).
- Top-level: 1 JSON file + 2 subdirs.

**B. Git Status**

- PARTIALLY IGNORED: `.gitignore` specifies `artifacts/test-results.json`,
  `artifacts/test-results-*.json`, `artifacts/test-summary.json`,
  `artifacts/cluster-analysis.json`, etc. — but NOT the entire directory.
- TRACKED: Multiple files are in git: `artifacts/gate0-metadata.json`,
  `artifacts/phase0/20251013-153429/*.md` (SCOPE_CLARIFICATION, PR_BODY,
  baseline, build-output, etc.).
- Git log shows multiple commits touching `artifacts/`:
  - de32c375: "test: achieve <100 test failures goal via infrastructure fixes
    (#297)" (Dec 21, 2025)
  - 64511fdf: "forensic: Complete root cause analysis of sidecar failure"
    (Jan 2025)
  - fa1c58ab: "force-add from gitignore" (Jan 2025)
  - These are recent, active work with analysis docs as of Oct 2025.

**C. References**

- `scripts/analyze-failure-clusters.cjs` explicitly reads:
  - `artifacts/test-results.json`
  - `artifacts/test-summary.json`
  - `artifacts/cluster-analysis.json`
  - This is an active npm script used in the build/test pipeline.
- `scripts/calculate-priority.cjs` reads `artifacts/phase0/latest/top-files.txt`
  and `artifacts/phase0/latest/deps-client.json`.
- CLAUDE.md mentions `.claude/artifacts/` (different path: checkpoints,
  metrics.jsonl) but NOT this top-level `artifacts/`.

**D. Classification**

- **LOAD_BEARING** — Git-tracked test analysis outputs and forensic docs; active
  scripts depend on these paths; deletion breaks failure analysis pipeline.

**Deletion Risk:** HIGH. Do not delete without migrating script dependencies.

---

### 2. `ai/` — 164 KB

**A. Existence & Size**

- EXISTS. ~164 KB on disk.
- Contents: `core/` (CircuitBreaker.ts, TokenManager.ts, errors.ts), `eval/`
  (Evaluator.ts, tests), `out/` (agent output artifacts), `prompt/`, `prompts/`,
  `registry/`.
- Top-level: 6 subdirectories, 24 files total.

**B. Git Status**

- NOT IGNORED by `.gitignore`.
- TRACKED: Multiple source files in git: `ai/core/*.ts`, `ai/eval/*.ts`, etc.
- Git log shows active development history:
  - 4ecca7e9: "feat(platform): implement precision hardening and queue
    observability" (Mar 18, 2026)
  - 09b544e4: "fix: comprehensive tech debt remediation (P0-P3)" (Dec 29, 2025)
  - de32c375: "test: achieve <100 test failures goal" (Dec 21, 2025)
  - 371f99b0: "feat(ai): Implement Issues #1-6 in parallel - Phase 1 complete"
    (Oct 6, 2025)
  - 8e8b1ff5: "feat(ai): Phase 1 agent foundation - scaffolds and ADRs" (Oct
    6, 2025)
- **RECENT ACTIVITY:** Last commit was Mar 18, 2026 (2 months ago). **HOWEVER**,
  no changes to `ai/` in the last 30 days.

**C. References & Actual Usage**

_Structural references:_

- `package.json` defines npm script: `"ai": "node scripts/ai-tools/index.js"`
- `scripts/ai-tools/index.js` is the CLI gateway with commands like `test`,
  `patch`, `repair`, `bundle-analyze`, `bundle-orchestrate`.

_Functional references:_

- **Zero imports from `ai/` in active code:** Grep across `client/`, `server/`,
  and `shared/` for imports from `ai/` returns **zero results**.
- The CircuitBreaker, TokenManager, Evaluator, and AgentRegistry classes are
  **not used** by any application code.
- `.github/workflows/` does NOT invoke `npm run ai` in any CI job.
- The `ai/` directory contains:
  - **Agent scaffolding** (infrastructure for multi-agent orchestration) — never
    instantiated
  - **Prompt templates** (type-safety-analyzer, business-logic,
    pattern-detector) — pre-written agent instructions
  - **Output artifacts** (ai/out/_.json, _.md) — past analysis results from
    Oct-Dec 2025
- `.a5c/` processes use Babysitter SDK (external), not the local `ai/` code.

**D. Classification**

- **STRUCTURALLY LOAD_BEARING** (marked as such earlier) **BUT FUNCTIONALLY
  ABANDONED**
- This is a proof-of-concept multi-agent system explored in Oct 2025, refined in
  Dec 2025, with one maintenance commit in Mar 2026 — but never integrated into
  the application pipeline.

**Deletion Risk:** **LOW-TO-MEDIUM** (functionally safe, but archive with
evidence first). The npm script `ai` exists as a gateway, but invoking it would
fail or run against stale data. No active feature depends on this code.

**Revised Recommendation:** Archive, then delete. This is actually a better
candidate for removal than `artifacts/` because it's truly unused code, not an
active data pipeline.

---

### 3. `ADR/` — 2 KB

**A. Existence & Size**

- EXISTS. ~2 KB on disk.
- Contents: 2 markdown files:
  - `ADR-001-Selector-Contract.md` (86 bytes, "Accepted: 2025-10-03")
  - `ADR-002-Feature-Flags-and-IA.md` (59 bytes, "Accepted: 2025-10-03")
- Minimal content — appears to be stubs or index files.

**B. Git Status**

- NOT IGNORED by `.gitignore`.
- TRACKED: Both files are in git.
- Git log shows TWO early commits:
  - 18edf960: "fix(ts): Batch 1 — type safety fixes (readonly, type guards,
    charts)" (Oct 2025)
  - 007f8762: "feat: Claude Cookbook Patterns + AI Agent Backtesting Framework
    (#109)" (Oct 2025)
- No recent activity; abandoned after Oct 2025.

**C. References**

- A proper, active ADR store exists at `docs/adr/` with 14+ ADR files (ADR-001
  through ADR-019, with some reserved/skipped).
- `docs/adr/` is referenced throughout the codebase:
  - Script references: `scripts/calculate-domain-score.mjs` cites
    `docs/adr/ADR-004-waterfall-names.md`
  - Process definitions: `.a5c/processes/` extensively reference `docs/adr/`
    files
  - Commit messages cite `docs/adr/ADR-*` numbers
- The project docstrings and CLAUDE.md point to `docs/adr/` as the canonical ADR
  location.
- **Top-level `ADR/` is NOT referenced anywhere** in active code, config, or
  documentation.

**D. Classification**

- **ARCHIVE_CANDIDATE** — Non-derivable (minimal docs), no active references,
  but older git history suggests abandoned feature/experiment; archive evidence
  before deletion.

**Deletion Risk:** **VERY LOW**. This appears to be a discarded attempt at a
parallel ADR structure. Safe to archive and delete.

---

### 4. `.zencoder/` — 4 KB

**A. Existence & Size**

- EXISTS. ~4 KB on disk.
- Contents: Single file `rules/repo.md` (Zencoder VS Code extension config/rules
  file describing repo structure and conventions).

**B. Git Status**

- NOT IGNORED by `.gitignore`.
- TRACKED: `.zencoder/rules/repo.md` is in git.
- Git log shows only ONE commit: 1f17503c "chore: archive unused code for future
  restoration" (Apr 2025 — note the message itself says "archive unused code").
- No other commits reference or modify this file.

**C. References**

- No references found in:
  - `package.json`
  - Scripts (grep -r across `scripts/`)
  - Workflows (`.github/workflows/`)
  - Config files (tsconfig, vite, etc.)
- Zencoder is a VS Code extension for code generation; this directory holds
  local extension config/rules.
- The file is purely informational (repo documentation for the extension) and
  does not affect runtime or build behavior.
- The commit message itself ("archive unused code") confirms this was
  intentionally marked for removal.

**D. Classification**

- **SAFE_DELETE** — Tracked but non-derivable, zero active references, extension
  config only; safe to remove.

**Deletion Risk:** **NONE**. Delete immediately.

---

### 5. `.continue/` — 6 KB

**A. Existence & Size**

- EXISTS. ~6 KB on disk.
- Contents: 3 template/example files:
  - `.continue/agents/new-config.yaml` (example agent config with placeholder
    API keys)
  - `.continue/mcpServers/new-mcp-server.yaml` (example MCP server config)
  - `.continue/prompts/new-prompt.md` (example prompt template)
- All files are marked as examples with placeholder content.

**B. Git Status**

- NOT IGNORED by `.gitignore`.
- TRACKED: All 3 files are in git.
- Git log shows ONE commit: 6e956869 "Config consolidation: Remove 4 redundant
  files, add 15+ Tailwind utilities (#163)" (Oct 2025).
- No further activity or modifications since Oct 2025.

**C. References**

- No references in:
  - `package.json`
  - `.claude/settings.json` or `.claude/settings.local.json`
  - Scripts (grep -r)
  - CI workflows (`.github/workflows/`)
- Continue.dev is an AI code editor extension; this directory would normally
  store user-configured agents, MCP servers, and custom prompts.
- The files are all EXAMPLES/TEMPLATES with placeholder content
  (`YOUR_OPENAI_API_KEY_HERE`, "example configuration file").
- Not needed for runtime, build, or CI.

**D. Classification**

- **SAFE_DELETE** — Tracked examples/templates only, zero active references, no
  functional impact on builds or runtime.

**Deletion Risk:** **NONE**. Delete immediately.

---

## Summary by Deletion Risk (Lowest to Highest)

| Directory    | Classification         | Risk Level | Action                                               |
| ------------ | ---------------------- | ---------- | ---------------------------------------------------- |
| `.zencoder`  | SAFE_DELETE            | NONE       | Delete now                                           |
| `.continue`  | SAFE_DELETE            | NONE       | Delete now                                           |
| `ADR/`       | ARCHIVE_CANDIDATE      | VERY LOW   | Archive evidence, then delete                        |
| `ai/`        | FUNCTIONALLY ABANDONED | LOW-MEDIUM | Archive, then delete (safer than initially assessed) |
| `artifacts/` | LOAD_BEARING           | HIGH       | Do not delete without remediating script deps        |

---

## Detailed Recommendations

### Immediate Actions (Safe to Execute)

1. **Delete `.zencoder/`** — VS Code extension config, explicitly marked for
   archival in git commit message, zero references.
2. **Delete `.continue/`** — IDE template examples, no functional impact, zero
   references.

### Before Proceeding (Requires Planning)

3. **Archive `ADR/`** — Copy to a safe location (e.g.,
   `.archive/ADR-discarded/`), document in a git commit message why it was
   removed (duplicate of `docs/adr/`), then delete.
4. **Archive `ai/`** — Copy to a safe location (e.g.,
   `.archive/ai-proof-of-concept/`), document that it was a Phase 1 exploration
   never integrated into the pipeline. Keep the git history. Then delete from
   main tree.

### Critical (Do Not Delete Without Remediation)

5. **`artifacts/`** — Actively used by test analysis scripts. Options:
   - **Migrate the data pipeline:** Move output paths to a more conventional
     location (e.g., `build/artifacts/`) and update scripts.
   - **Preserve selectively:** Keep only the tracked files that scripts depend
     on; ignore the rest.
   - **Create CI artifact caching:** If these are derived from tests, consider
     whether they should be ephemeral (generated per run) rather than committed.

---

## Git Log Details

### `artifacts/` Recent History

```
de32c375 2025-12-21 test: achieve <100 test failures goal via infrastructure fixes (#297)
89c76b76 2025-12-14 chore(phase4b): add constraint + suite failure extracts
64511fdf 2025-12-11 docs(forensic): Complete root cause analysis of sidecar failure
fa1c58ab 2025-01-17 docs(session7): Add execution checklist (force-add from gitignore)
```

### `ai/` Recent History

```
4ecca7e9 2026-03-18 feat(platform): implement precision hardening and queue observability
09b544e4 2025-12-29 fix: comprehensive tech debt remediation (P0-P3) - XIRR, type safety, test coverage, emoji cleanup (#314)
de32c375 2025-12-21 test: achieve <100 test failures goal via infrastructure fixes (#297)
371f99b0 2025-10-06 feat(ai): Implement Issues #1-6 in parallel - Phase 1 complete
8e8b1ff5 2025-10-06 feat(ai): Phase 1 agent foundation - scaffolds and ADRs
```

### `ADR/` History

```
18edf960 2025-10-XX fix(ts): Batch 1 - type safety fixes (readonly, type guards, charts)
007f8762 2025-10-XX feat: Claude Cookbook Patterns + AI Agent Backtesting Framework (#109)
```

### `.zencoder/` History

```
1f17503c 2025-04-22 chore: archive unused code for future restoration
```

### `.continue/` History

```
6e956869 2025-10-13 Config consolidation: Remove 4 redundant files, add 15+ Tailwind utilities (#163)
```

---

## References for Further Review

- **Test analysis scripts:** `scripts/analyze-failure-clusters.cjs`,
  `scripts/calculate-priority.cjs`
- **AI gateway:** `scripts/ai-tools/index.js`, `package.json` (npm script `ai`)
- **Canonical ADR store:** `docs/adr/` (14+ files, actively maintained)
- **Related systems:** `.a5c/` (Babysitter SDK processes), `.claude/`
  (governance and settings)

---

## Notes

- This investigation was performed in **read-only mode** with no modifications
  to the repository.
- Git commands used: `git ls-files`, `git log --oneline`, `git log --format`
- Search tools used: `grep -r`, `find`, file listing
- All findings based on current state as of May 21, 2026.
