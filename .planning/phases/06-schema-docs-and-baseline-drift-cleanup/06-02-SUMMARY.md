---
phase: 06-schema-docs-and-baseline-drift-cleanup
plan: 02
type: summary
date: 2026-04-09
status: complete
requirements:
  - REQ-DRIFT-02
  - REQ-DRIFT-03
commits:
  - 023d584f
  - 7846cdc0
  - 51c3e492
---

# Plan 06-02 Summary — Prose drift cleanup (REQ-DRIFT-02 + REQ-DRIFT-03)

## Scope

Pure prose substitution across 6 `.planning/` docs to fix two distinct drifts:

1. **REQ-DRIFT-02**: Remove hardcoded Phoenix truth-case counts (`262/262`) from
   forward-looking planning prescriptions. Point at `npm run phoenix:truth` for
   the live count instead.
2. **REQ-DRIFT-03**: Update stale console / eslint-disable / explicit-any
   baseline numbers (`374 → 39`, `132 → 29`, `~400 → 363`) and retarget the
   requirement statements away from CLAUDE.md (which does NOT contain any of
   those stale numbers) to the `.planning/` doc files that actually do.

Zero code edits. Zero test edits. Zero tripwire impact (guardrail ratchets read
`.baselines/*.json` at runtime, not the prose docs edited here).

## Files Edited (6) and Hit-Points Resolved

| File                                 | Hit-points | Representative before → after                                                                                                                                                                  |
| ------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.planning/codebase/CONCERNS.md`     | 3          | `374 disallowed calls` → `39 disallowed calls per .baselines/console-prod-baseline.json`                                                                                                       |
| `.planning/codebase/CONVENTIONS.md`  | 2          | `~400 pre-existing baselines` → `363 pre-existing baselines per .baselines/eslint-output.json`                                                                                                 |
| `.planning/codebase/INTEGRATIONS.md` | 1          | `baseline 374 disallowed calls` → `baseline 39 disallowed calls per .baselines/console-prod-baseline.json`                                                                                     |
| `.planning/PROJECT.md`               | 6          | `Console + eslint-disable ratchets prevent debt regression (374 / 132 baselines)` → `Console + eslint-disable ratchets prevent debt regression (current totals 39 / 29 per .baselines/*.json)` |
| `.planning/REQUIREMENTS.md`          | 2          | REQ-DRIFT-02 + REQ-DRIFT-03 blocks rewritten to drop `262/262` example + retarget from CLAUDE.md                                                                                               |
| `.planning/ROADMAP.md`               | 4          | line 102 REQ-DRIFT-03 description, Phase 6 success criteria 3 + 4, and Phase 5 criterion 2 at line 73                                                                                          |

**Total hit-points:** 18 across 6 files (planner estimated 13 + the plan-missed
ones at PROJECT.md REQ-DRIFT-03 rephrase, ROADMAP.md:73, and ROADMAP.md Phase 6
success criterion 3).

## Deviations from Plan-as-Written

The plan (`06-02-PLAN.md`) correctly identified the structural intent but
undersized the edit set in three places. All three deviations preserved the
plan's acceptance contract and were documented in commit bodies:

1. **PROJECT.md REQ-DRIFT-03 replacement** (commit 7846cdc0): The plan's Step 4
   replacement text contained `374 / 132 baselines` and `~400 any` literals
   inside backticks. This violated the plan's own acceptance criterion
   (`grep -cE "\b(374|132)\b" .planning/PROJECT.md` returns 0). The plan caught
   this exact issue for ROADMAP.md line 102 (Step 3) and applied a bare-word
   escape hatch there, but did not propagate the same fix to PROJECT.md Step 4.
   Applied the same pattern: rewrote REQ-DRIFT-03 to describe the fix using only
   the live numbers `39 / 29 / 363` plus a generic "stale baseline numbers"
   phrase. Same fix applied to REQUIREMENTS.md REQ-DRIFT-03 block in commit
   51c3e492.

2. **ROADMAP.md:73 (Phase 5 closed criterion)** (commit 51c3e492): Contained
   "truth-case suite still exits 0 with 262/262 passing" — a frozen-in-time
   Phase 5 success criterion. Not in the plan's hit-list but caught by the
   plan's acceptance regex (`phoenix.*\d{2,3}/\d{2,3}`). Rewrote to preserve
   historical meaning ("truth-case suite still exits 0") while removing the
   hardcoded number and pointing at `npm run phoenix:truth`.

3. **ROADMAP.md Phase 6 success criterion 3** (commit 51c3e492): Read "CLAUDE.md
   baseline section reflects the actual numbers..." The plan said "NO change
   needed there" because it already contained `39 / 29 / 363`, but it still
   named CLAUDE.md as the target — contradicting the rest of the retargeting
   work. Updated to name the four `.planning/` doc files and added the explicit
   "CLAUDE.md at project root is NOT a target" note for consistency.

## Historical Recap Preserved

`.planning/PROJECT.md:152` still reads "Phoenix truth cases: 258 → 262 (Plan
02-05 added 4 GFC scenario tests with deterministic seed)". This is a frozen
M8-close recap (classified as `historical-record` per research §"REQ-DRIFT-02
Hit List") and was NOT touched. Verified by:

```bash
grep -c "Phoenix truth cases: 258" .planning/PROJECT.md
# → 1
```

## Retarget Note Present in Both Files

Both `.planning/REQUIREMENTS.md` and `.planning/ROADMAP.md` now contain explicit
retarget notes so future sessions don't hunt CLAUDE.md for non-existent
occurrences:

- `REQUIREMENTS.md:73-76`: "CLAUDE.md at the project root does NOT contain the
  stale baseline numbers anywhere — the original ROADMAP phrasing that named
  CLAUDE.md was wrong and is being corrected in this same plan."
- `ROADMAP.md:105-106`: "CLAUDE.md is NOT a target — original phrasing was
  wrong."
- `ROADMAP.md:141-142`: "CLAUDE.md at project root is NOT a target — original
  phrasing was wrong."

## Deferred-by-Policy Files (Intentionally Untouched)

The following files contain stale baseline numbers or hardcoded phoenix counts
but are classified as historical records and were NOT edited:

- `.planning/STATE.md`
- `.planning/phases/**/*-SUMMARY.md`, `*-CONTEXT.md`, `*-PLAN.md`
- `.planning/CHANGELOG.md`
- `docs/archive/**`
- `archive/**`
- `docs/PHOENIX-SOT/evidence-ledger.md`
- `CLAUDE.md` at project root (explicitly does NOT contain `374`, `132`, or
  `~400`)

Verified by `git log --since="1 hour ago" --pretty=format: --name-only`: only
the 6 target files appear, zero deferred files in the diff.

## Post-Plan Verification

| Check                                                                                                                                                                                                | Result                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `grep -rcE "\b(374\|132)\b" .planning/PROJECT.md .planning/ROADMAP.md .planning/REQUIREMENTS.md .planning/codebase/CONCERNS.md .planning/codebase/CONVENTIONS.md .planning/codebase/INTEGRATIONS.md` | 0 across all 6                                               |
| `grep -rcE "~400" <same 6 files>`                                                                                                                                                                    | 0 across all 6                                               |
| `grep -cE "262/262\|phoenix.*[0-9]{2,3}/[0-9]{2,3}" .planning/ROADMAP.md .planning/REQUIREMENTS.md .planning/PROJECT.md`                                                                             | 0 across all 3                                               |
| `grep -c "Phoenix truth cases: 258" .planning/PROJECT.md`                                                                                                                                            | 1 (preserved)                                                |
| `grep -c "console-prod-baseline.json" .planning/PROJECT.md`                                                                                                                                          | ≥1 (present)                                                 |
| `grep -c "CLAUDE.md at the project root does NOT contain" .planning/REQUIREMENTS.md`                                                                                                                 | 1                                                            |
| `grep -c "CLAUDE.md is NOT a target" .planning/ROADMAP.md`                                                                                                                                           | 1                                                            |
| `npm run check`                                                                                                                                                                                      | exit 0, 0 TS errors                                          |
| `npm run validate:core`                                                                                                                                                                              | exit 0                                                       |
| `npm run lint`                                                                                                                                                                                       | exit 0                                                       |
| `npm run baseline:check`                                                                                                                                                                             | exit 0, 0 TS errors                                          |
| `node scripts/guardrails/console-ratchet.mjs`                                                                                                                                                        | pass: current 39 ≤ baseline 39                               |
| `node scripts/guardrails/eslint-disable-ratchet.mjs`                                                                                                                                                 | pass: current 28 ≤ baseline 29                               |
| `TZ=UTC npm run phoenix:truth`                                                                                                                                                                       | **262 passed across 6 test files** (unchanged from pre-plan) |

## Atomic Commits

| SHA        | Subject                                                                               | Files                                        |
| ---------- | ------------------------------------------------------------------------------------- | -------------------------------------------- |
| `023d584f` | `docs(06-02): update stale baseline numbers in .planning/codebase/`                   | CONCERNS.md, CONVENTIONS.md, INTEGRATIONS.md |
| `7846cdc0` | `docs(06-02): retarget REQ-DRIFT-03 + clean baseline numbers in PROJECT.md`           | PROJECT.md                                   |
| `51c3e492` | `docs(06-02): retarget REQ-DRIFT-02 + REQ-DRIFT-03 in REQUIREMENTS.md and ROADMAP.md` | REQUIREMENTS.md, ROADMAP.md                  |

Each commit is independently revertable. Prettier auto-formatted the markdown
during pre-commit but did not alter semantics.

## Phoenix Count (Informational)

Pre-plan: not captured (the plan explicitly forbids capturing it in committed
docs). Post-plan: **262 passed across 6 test files**. Plan 06-02 touched zero
calc paths, so the count is unchanged by construction.

## Surprises

1. **Plan-as-written contained its own forbidden numbers.** REQ-DRIFT-03
   replacement text in Step 4 (PROJECT.md) and Step 2 (REQUIREMENTS.md)
   literally contained `374`, `132`, `~400` inside backticks as "historical
   drift reference". This violated the plan's own acceptance criterion. The plan
   caught this for ROADMAP.md line 102 and provided a bare-word escape hatch,
   but did not propagate the fix to the other replacement blocks. Resolution:
   applied the same bare-word pattern to all replacement blocks.
2. **Missed hit at ROADMAP.md:73.** Phase 5 closed success criterion embedded
   "262/262 passing" — not in the plan's hit-list but caught by the plan's
   acceptance regex `phoenix.*\d{2,3}/\d{2,3}`. Resolution: rewrote to preserve
   historical meaning while removing the number.
3. **ROADMAP.md Phase 6 success criterion 3 still named CLAUDE.md.** Plan said
   "NO change needed there" but the text contradicted the rest of the
   retargeting. Resolution: updated for consistency.
4. **No tripwire impact.** Both guardrail ratchets passed unchanged — they read
   `.baselines/*.json` at runtime, not the prose docs edited here (as predicted
   by research §"Tripwire Script Audit").

## Status

**Complete.** All success criteria met, all phase gates green, ready for Plan
06-01 (introspect-then-decide, non-autonomous).
