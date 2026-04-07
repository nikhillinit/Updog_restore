---
phase: 02-backtesting-scenario-comparison-rewrite-p1
plan: 04
type: execute
wave: 1
depends_on: []
files_modified:
  - .a5c/processes/sensitivity-stress-panel.inputs.json
autonomous: true
requirements:
  - REQ-BCK-02
must_haves:
  truths:
    - 'The alphaFinding.severity field in
      .a5c/processes/sensitivity-stress-panel.inputs.json is the string "P1"
      instead of "informational"'
    - 'The alphaFinding.actionRequired field is updated to reference the Phase 2
      rewrite (no longer "none (recorded only ...)")'
    - 'No other field in the file is modified'
    - 'The file remains valid JSON (parses without error)'
  artifacts:
    - path: '.a5c/processes/sensitivity-stress-panel.inputs.json'
      provides:
        'Reclassified alphaFinding severity from informational to P1 — direct
        success criterion 4 in ROADMAP'
      contains: '"severity": "P1"'
  key_links:
    - from: 'alphaFinding'
      to: 'P1 triage queue'
      via: 'severity field upgrade'
      pattern: '"severity": "P1"'
---

<objective>
Reclassify the `alphaFinding.severity` field in `.a5c/processes/sensitivity-stress-panel.inputs.json` from `"informational"` to `"P1"` per CONTEXT.md D-08, ROADMAP success criterion 4, and REQ-BCK-02. Also update `alphaFinding.actionRequired` to reference the Phase 2 rewrite rather than the previous "none (recorded only ...)" disposition.

This is a one-key edit on a single JSON file. It is in its own plan because it
is contractually visible (REQ-BCK-02 maps directly to it) and its failure mode
is independent from the engine work — bundling it into the rewrite plan would
risk losing the change if the rewrite is reverted.

This plan has NO dependencies on any other Phase 2 plan and runs in parallel
with Plan 02-02. There is no `files_modified` overlap with any other plan.

Purpose: surface the alphaFinding into the P1 triage queue so it cannot be
filtered out by the informational tier downstream of the sensitivity-stress
panel babysitter process.

Output: one modified JSON file
(`.a5c/processes/sensitivity-stress-panel.inputs.json`) with `severity` changed
from `informational` to `P1` and `actionRequired` updated to reference the Phase
2 commit context. </objective>

<execution_context>
@C:/Users/nikhi/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/nikhi/.claude/get-shit-done/templates/summary.md </execution_context>

<context>
@.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-CONTEXT.md
@.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-RESEARCH.md
@CLAUDE.md

<interfaces>
<!-- Current state of the alphaFinding block. Verified by reading the file directly during planning. -->

From .a5c/processes/sensitivity-stress-panel.inputs.json (the alphaFinding
block, current state):

```json
"alphaFinding": {
  "summary": "runScenarioComparisons in backtesting-service.ts exists but does NOT pass marketParams to unifiedMonteCarloService.runSimulation. Instead it runs the default simulation and applies post-hoc ratio scaling via applyMarketAdjustment. This is a fixed-function approximation, not a real per-scenario MC run.",
  "location": "server/services/backtesting-service.ts:645-738",
  "severity": "informational",
  "actionRequired": "none (recorded only -- separate slice if anyone wants to ship alpha as a real feature)"
}
```

The file is a single top-level JSON object with multiple sibling fields. The
`alphaFinding` block is the LAST field in the object (no trailing comma after
the closing `}`). The file is referenced by the
`.a5c/processes/sensitivity-stress-panel` babysitter process — re-running that
process after this edit will pick up the new severity classification on its next
read. </interfaces> </context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Update alphaFinding severity from informational to P1 and update actionRequired to reference Phase 2</name>
  <files>.a5c/processes/sensitivity-stress-panel.inputs.json</files>
  <read_first>
    - .a5c/processes/sensitivity-stress-panel.inputs.json (FULL file — confirm the current state of the alphaFinding block, confirm the surrounding fields are unchanged, confirm valid JSON)
    - .planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-CONTEXT.md (D-08 — the locked decision)
    - .planning/REQUIREMENTS.md (REQ-BCK-02 — the requirement)
    - .planning/ROADMAP.md (Phase 2 success criterion 4 — direct mapping to this plan)
  </read_first>
  <action>
This task is one targeted edit to a JSON file. Steps:

### Step 1 — Read the current alphaFinding block

Read the file and locate the `alphaFinding` block. Confirm it currently reads:

```json
"alphaFinding": {
  "summary": "runScenarioComparisons in backtesting-service.ts exists but does NOT pass marketParams to unifiedMonteCarloService.runSimulation. Instead it runs the default simulation and applies post-hoc ratio scaling via applyMarketAdjustment. This is a fixed-function approximation, not a real per-scenario MC run.",
  "location": "server/services/backtesting-service.ts:645-738",
  "severity": "informational",
  "actionRequired": "none (recorded only -- separate slice if anyone wants to ship alpha as a real feature)"
}
```

If the current state differs (e.g., `severity` is already `P1` from a parallel
session), STOP and re-coordinate.

### Step 2 — Edit the two fields

Change `"severity": "informational"` to `"severity": "P1"`.

Change
`"actionRequired": "none (recorded only -- separate slice if anyone wants to ship alpha as a real feature)"`
to:

```
"actionRequired": "FIXED in Phase 2 (.planning/phases/02-backtesting-scenario-comparison-rewrite-p1) — runScenarioComparisons now injects scenario-specific marketParameters per scenario via Plan 02-03, applyMarketAdjustment is deleted, and a Phoenix truth case under tests/unit/truth-cases/ validates the rewrite end-to-end. See docs/plans/2026-04-XX-backtesting-scenario-comparison-rewrite.md for the before/after comparison."
```

(Use the actual filename committed by Plan 02-06 if you know it; otherwise leave
the `XX` placeholder — Plan 02-06 will replace it during its own execution if
needed. The placeholder is acceptable because the filename is auto-resolvable
from the directory listing.)

Do NOT modify any other field in the JSON object. Do NOT reorder the fields. Do
NOT add or remove the trailing newline at the end of the file. Use the Edit tool
with old_string/new_string targeting only the two specific lines.

### Step 3 — Verify the file is still valid JSON

After saving, run:

```bash
node -e "JSON.parse(require('fs').readFileSync('.a5c/processes/sensitivity-stress-panel.inputs.json', 'utf-8')); console.log('OK: valid JSON');"
```

Expected: `OK: valid JSON`. If the file fails to parse, the edit broke a comma
or brace — undo and retry.

Also confirm the new severity value is present:

```bash
grep -c '"severity": "P1"' .a5c/processes/sensitivity-stress-panel.inputs.json
```

Expected: at least `1`. (There may be other `severity` keys elsewhere in the
file — `1` or more is fine.)

Confirm the old value is gone:

```bash
grep -c '"severity": "informational"' .a5c/processes/sensitivity-stress-panel.inputs.json
```

Expected: `0` matches IF `informational` only appeared on the alphaFinding
block. If grep returns `>0`, check whether there are OTHER `informational`
severities in the file unrelated to alphaFinding — if so, leave them alone (only
the alphaFinding block is in scope per D-08).

### Step 4 — Verify the actionRequired update

```bash
grep -c "FIXED in Phase 2" .a5c/processes/sensitivity-stress-panel.inputs.json
```

Expected: `1`.

```bash
grep -c "recorded only" .a5c/processes/sensitivity-stress-panel.inputs.json
```

Expected: `0` (the old phrase is gone from the alphaFinding block). </action>
<verify> <automated>node -e "const data =
JSON.parse(require('fs').readFileSync('.a5c/processes/sensitivity-stress-panel.inputs.json',
'utf-8')); if (data.alphaFinding.severity !== 'P1') { console.error('FAIL:
severity is', data.alphaFinding.severity, 'expected P1'); process.exit(1); } if
(!/FIXED in Phase 2/.test(data.alphaFinding.actionRequired)) {
console.error('FAIL: actionRequired does not reference Phase 2');
process.exit(1); } console.log('OK: alphaFinding severity is P1 and
actionRequired references Phase 2');"</automated> </verify>
<acceptance_criteria> - File
`.a5c/processes/sensitivity-stress-panel.inputs.json` parses as valid JSON -
`data.alphaFinding.severity === "P1"` (verified via the node -e script) -
`data.alphaFinding.actionRequired` contains the substring `FIXED in Phase 2` -
`data.alphaFinding.summary` is unchanged from the pre-edit state -
`data.alphaFinding.location` is unchanged from the pre-edit state -
`git diff .a5c/processes/sensitivity-stress-panel.inputs.json` shows exactly two
edited lines: one for severity, one for actionRequired - No other fields in the
file are modified (no whitespace shuffles, no field reorderings)
</acceptance_criteria> <done>The alphaFinding severity is reclassified to P1,
actionRequired references the Phase 2 rewrite, the file is valid JSON, and no
other fields are touched.</done> </task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                          | Description                                                                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| babysitter process -> JSON config | The `.a5c/processes/sensitivity-stress-panel.inputs.json` file is read by the babysitter process at run-time. The file is committed to the repo and only edited via PR review. No external write path. |

## STRIDE Threat Register

| Threat ID  | Category                 | Component                                | Disposition | Mitigation Plan                                                                                                                                                                                                                |
| ---------- | ------------------------ | ---------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-02-04-01 | Tampering                | JSON file integrity                      | mitigate    | The acceptance criteria run `JSON.parse` on the file post-edit, so any syntax error (broken comma, brace, quote) is caught immediately.                                                                                        |
| T-02-04-02 | Information Disclosure   | n/a                                      | accept      | The file contains no secrets or PII. The change is a string label edit.                                                                                                                                                        |
| T-02-04-03 | Repudiation              | who reclassified the finding             | accept      | The git commit history records the change. The actionRequired field references Phase 2 explicitly so future readers know why the upgrade happened.                                                                             |
| T-02-04-04 | Triage queue mis-routing | severity stays informational by accident | mitigate    | The acceptance criteria check `data.alphaFinding.severity === "P1"` directly via JSON parse, not via grep — so a false positive from a similar severity field elsewhere in the file cannot mask a missed edit on alphaFinding. |

</threat_model>

<verification>
- The `node -e` script in the verify block confirms `alphaFinding.severity === "P1"` and `actionRequired` references Phase 2
- `git diff` shows exactly two edited lines on the alphaFinding block
- The file parses as valid JSON
- No other fields are modified
</verification>

<success_criteria>

- `.a5c/processes/sensitivity-stress-panel.inputs.json` has
  `alphaFinding.severity === "P1"` (D-08)
- `alphaFinding.actionRequired` references the Phase 2 rewrite and the
  docs/plans plan doc filename
- The file is valid JSON
- No other fields are touched
- ROADMAP success criterion 4 is satisfied
- REQ-BCK-02 is closed

</success_criteria>

<output>
After completion, create `.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-04-SUMMARY.md` documenting:

- The exact before-and-after diff of the two edited lines
- Confirmation that `JSON.parse` succeeds on the post-edit file
- A reminder for Plan 02-06: "The actionRequired field references the docs/plans
  filename — if Plan 02-06 picks a different date in the filename than the
  placeholder, update this field as well in the same commit so the
  cross-reference stays accurate." </output>
