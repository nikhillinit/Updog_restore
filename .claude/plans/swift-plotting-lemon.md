---
last_updated: 2026-04-03
---

# M7: Tooling Entropy Reduction — Babysitter Process Plan

## Context

The repo has accumulated **350+ npm scripts**, **180+ plan/doc files** across 8+
directories, and README/BUILD_READINESS docs that reference commands most
developers never use. Milestone 7's goal: "make the repo operable without
archaeology."

The previous babysitter run (M6) used a feature-implementation process (TDD
convergence, contract-first gates). M7 is fundamentally different — audit,
classify, prune, verify — so the process is redesigned from scratch using
diverge-converge analysis of 25 improvement ideas.

**Branch**: Create `stabilization/m7-tooling-entropy` from `main` (after M6 PR
merges)

## Scope (User-Specified Sequence)

1. Inventory `package.json` scripts → supported / internal-migration / archive
2. Reduce documented command set in `README.md` and `docs/BUILD_READINESS.md`
3. Archive stale plans/docs no longer the live source of truth

## Process Design Summary

### Pre-Gate: M6 Merge Verification

Before any work, verify M6 branch is merged to `main`. If not, halt with
breakpoint asking user to merge first.

### Phase 1: Script Inventory and Dependency Mapping

**1A — Automated Analysis (parallel agent tasks)**

Three concurrent agent tasks:

| Task                        | What it produces                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Script body scanner**     | For each of the 350+ scripts: what command it runs, which files it references                                                  |
| **CI/doc cross-reference**  | Grep `.github/workflows/*.yml`, `CLAUDE.md`, `cheatsheets/*.md`, `docs/*.md` for each script name → reference count per script |
| **Script dependency graph** | Parse script bodies for `npm run X` references → directed graph of script-calls-script                                         |

Combined output: `artifacts/script-inventory.json` — per-script record with
`{ name, body, referenceCount, calledBy[], calls[], lastTouched, classification }`.

**1B — Transitive-aware classification**

Classification MUST consume the dependency graph from 1A. A script is
"reachable" if any supported script transitively calls it (e.g., `validate:core`
→ `baseline:check` → `guard:*` means all those `guard:*` scripts are reachable
and cannot be archived).

Classification rules (applied in order):

1. **Seed the supported set**: `dev`, `dev:client`, `dev:api`, `build`, `test`,
   `lint`, `check`, `db:push`, `db:studio`, `validate:core`, and any script
   referenced in `.github/workflows/*.yml` or `CLAUDE.md`
2. **Transitive closure**: Walk the dependency graph from the supported set.
   Every script reachable via `npm run X` chains is also `supported`
3. **Internal-migration**: Scripts matching `test:wave*`, `test:phase*`,
   `lint:wave*` that are NOT in the transitive closure → `internal-migration`
4. **Archive candidates**: Scripts with 0 references outside package.json AND
   not in the transitive closure AND >180 days since last git touch → `archive`
5. **Needs-review**: Everything else not yet classified

**1C — Breakpoint: Review "clearly archive" set**

Present the auto-classified "archive" scripts (those with 0 refs and >180 days
stale). User approves/rejects each batch.

**1D — Breakpoint: Review "needs-review" set**

Present borderline scripts. User classifies each as supported,
internal-migration, or archive.

**1E — Execute script cleanup**

- Remove `archive`-classified scripts from `package.json`
- Write classification to the archived sidecar snapshot
  `docs/archive/2026-q2/generated-inventory-snapshots/script-classification.json`
  (NOT package.json — JSON does not support comments). Manifest records
  `{ supported: [...], internalMigration: [...], archived: [...] }` with reason
  per entry
- Atomic commit: `chore(m7): prune N archived scripts from package.json`

**1F — Build-remediation loop**

Run the actual stabilized gate: `npm run build && npm run validate:core` (NOT
just `npm test`, which only covers unit tests). Also run
`npm run test:integration` if integration tests exist and reference scripts. If
failures reference removed scripts:

- Identify which removed script is needed
- Either restore it (reclassify to supported) or fix the caller
- Re-run until green
- Max 3 remediation attempts before breakpoint

### Phase 2: Document Command Set Reduction

**2A — Audit current docs**

Agent reads:

- `README.md` essential commands section
- `docs/BUILD_READINESS.md` command reference
- `CLAUDE.md` essential commands section
- `cheatsheets/daily-workflow.md`

Cross-references against Phase 1 "supported" list. Identifies:

- Commands documented but not in supported set → remove from docs
- Supported commands not documented → consider adding

**2B — Execute doc rewrite**

Rewrite command sections to show ONLY supported scripts. Group by purpose:

- Development: `dev`, `dev:client`, `dev:api`
- Testing: `test`, `test:quick`, `test:ui`
- Building: `build`, `check`
- Database: `db:push`, `db:studio`
- Validation: `validate:core`, `lint`

Cap at **<20 documented commands**. Add footnote: "Run `npm run` for the full
script list."

**2C — CLAUDE.md alignment gate**

Verify `CLAUDE.md` "Essential Commands" section matches the supported set
exactly. Fix any drift.

**2D — Breakpoint: Review rewritten docs**

User reviews the README.md and BUILD_READINESS.md changes before commit.

**2E — Commit**

Atomic commit: `docs(m7): reduce documented commands to supported set`

### Phase 3: Archive Stale Plans and Docs

**3A — Reference-first doc staleness audit**

Classification starts from **active references**, not milestone age. A doc is
"live" if any active file references it.

Step 1: Build the reference set. Grep `README.md`, `CLAUDE.md`,
`BUILD_READINESS.md`, `STABILIZATION-ROADMAP.md`, `cheatsheets/*.md`,
`docs/INDEX.md`, `.claude/DISCOVERY-MAP.md`, and all `.github/workflows/*.yml`
for paths pointing into the target directories. Any file referenced by an active
doc is `keep` regardless of age.

Step 2: For each unreferenced file, check if it is the current source-of-truth
for a decision, milestone, or contract (grep for its unique identifiers like ADR
numbers, milestone IDs, contract names). If yes → `keep`.

Step 3: Remaining unreferenced files are classified by derivability test (from
CLAUDE.md governance): "Could a future session reconstruct this from code and
git log alone?" If YES → `archive`. If it contains non-derivable institutional
memory → `keep`.

Target directories:

| Directory                  | File count | Notes                                                               |
| -------------------------- | ---------- | ------------------------------------------------------------------- |
| `docs/plans/`              | 15         | Active references from README/BUILD_READINESS must be checked first |
| `.claude/plans/`           | 16         | Session-specific, but check for cross-references                    |
| `.claude/planning/`        | 3          | Check if still referenced                                           |
| `.taskmaster/docs/`        | 6          | Check if taskmaster is actively used                                |
| `docs/planning/`           | 37 nested  | Check for active cross-references                                   |
| `.claude/memory/sessions/` | 34         | Session artifacts — per CLAUDE.md governance: delete if derivable   |

Per-file classification: `keep` (referenced or source-of-truth), `archive`
(unreferenced and derivable), `delete` (empty/duplicate/session artifact that is
derivable from git).

**3B — Breakpoint: Review classification**

Present the full classification list. User approves before any file moves.

**3C — Execute archival**

- Move `archive` files to `docs/archive/m7-cleanup/` with directory structure
  preserved
- Delete `delete` files
- Create `docs/archive/m7-cleanup/MANIFEST.md` listing every moved file, origin
  path, and reason
- Fix any cross-references that pointed at moved files
- Atomic commit: `chore(m7): archive N stale plan/doc files`

**3D — Link integrity check**

Run `npm run docs:check-links` (if available) or grep for broken
`](docs/plans/...` references.

### Phase 4: Final Verification

**4A — Core validation gate**: `npm run validate:core` — this is the stabilized
gate, not `npm test` alone

**4B — Full test suite**: `npm test` + `npm run test:integration` (if
integration tests reference scripts)

**4C — Reference integrity**: Grep for any remaining reference to removed
scripts in `.github/`, `CLAUDE.md`, `cheatsheets/`

**4D — Exit criteria audit** — uses the actual M7 exit criteria from
`docs/STABILIZATION-ROADMAP.md:251-262`:

- "Short, obvious supported command path" — README/BUILD_READINESS document only
  the supported set, grouped by purpose
- "Historical docs no longer competing with live docs" — no stale plan in an
  active directory that could be mistaken for current guidance
- "Inventory scripts into supported, internal migration, and archive" —
  `docs/archive/2026-q2/generated-inventory-snapshots/script-classification.json`
  records the historical classification snapshot
- All archived files have manifest entries in
  `docs/archive/m7-cleanup/MANIFEST.md`

NOTE: No invented quantity targets (e.g., ">30% reduction"). The exit criteria
are qualitative: is the repo operable without archaeology?

**4E — Roadmap update**: Mark M7 as `[COMPLETE]` in
`docs/STABILIZATION-ROADMAP.md`

**4F — Breakpoint: Final approval**

User reviews all changes before final commit.

## Process File Structure

This process package is currently documentation-only. The canonical artifacts
for M7 planning are:

- `.claude/plans/swift-plotting-lemon.md`
- `.a5c/processes/m7-tooling-entropy.process.md`
- `.a5c/processes/m7-tooling-entropy.diagram.md`

No executable `.a5c/processes/*.js` runner or `methodologies/gsd/*` agent assets
exist in this repo today. If automation is added later, it should be introduced
explicitly in a follow-up change rather than implied by this plan.

**Composition**:

- Phase 1: inventory + transitive classification
- Phase 2: command-path documentation reduction
- Phase 3: reference-first archival with derivability checks
- Phase 4: stabilized verification against roadmap exit criteria

## Breakpoint Summary

| Phase | Breakpoint                | Purpose                             |
| ----- | ------------------------- | ----------------------------------- |
| Pre   | M6 merge check            | Ensure prerequisite met             |
| 1C    | Archive scripts review    | Approve clearly-dead script removal |
| 1D    | Borderline scripts review | Classify ambiguous scripts          |
| 1F    | Build failure (if any)    | Approve script restoration          |
| 2D    | Doc rewrite review        | Approve command set reduction       |
| 3B    | Doc classification review | Approve archival/deletion list      |
| 4F    | Final approval            | Approve all M7 changes              |

## Critical Files

- `package.json` — 350+ scripts to triage
- `README.md` — command documentation
- `docs/BUILD_READINESS.md` — build/deploy reference
- `CLAUDE.md` — essential commands section
- `cheatsheets/daily-workflow.md` — development patterns
- `docs/STABILIZATION-ROADMAP.md` — M7 status
- `.github/workflows/*.yml` — CI script references
- `docs/plans/*`, `.claude/plans/*`, `docs/planning/*` — triage targets

## Risks and Mitigations

| Risk                               | Mitigation                                                   |
| ---------------------------------- | ------------------------------------------------------------ |
| Remove script CI depends on        | CI cross-reference audit in 1A; build-remediation loop in 1F |
| Break script-calls-script chain    | Dependency graph in 1A catches inter-script references       |
| Remove script another dev uses     | Breakpoint review gates; CLAUDE.md alignment gate            |
| Break doc cross-references         | Link integrity check in 3D                                   |
| Stale doc is actually still needed | Conservative "keep" default; breakpoint before deletion      |

## Verification (Post-Implementation)

1. `npm run validate:core` passes (the stabilized gate — includes build + unit
   tests + baseline)
2. `npm run build` succeeds
3. `npm test` passes (unit test subset)
4. No grep hits for removed scripts in `.github/`, `CLAUDE.md`, `cheatsheets/`
5. README/BUILD_READINESS document only scripts that exist in package.json
6. No stale plan in an active directory competes with live guidance
7. `docs/archive/2026-q2/generated-inventory-snapshots/script-classification.json`
   preserves the historical classification snapshot
8. `docs/archive/m7-cleanup/MANIFEST.md` exists and is complete
