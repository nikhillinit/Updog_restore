# Task 16.0 Internal Waterfall Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.
>
> **Workflow override for this plan:** the repository workflow contract routes
> all repo edits through Hermes as a byte-identical applier (see spec, "Grilled
> decisions"). Tasks 1-4 author and validate drafts in gitignored
> `.claude/artifacts/`; Task 5 dispatches the edits; Tasks 6-7 verify and ship.
> Do not edit repo-tracked files directly in Tasks 1-4. The mandated
> single-commit bundle supersedes the usual commit-per-task cadence.

**Goal:** Ship PLAN_61 Wave F Task 16.0 -- a governance ADR plus a two-value
internal waterfall template contract and its guard test -- as an open, unmerged
PR.

**Architecture:** Draft-then-dispatch. All three file contents are authored as
pre-formatted drafts, signed off by the waterfall-specialist agent under an
evidence contract, fact-checked, then applied byte-identically via Hermes
(`orchestrate.js --phase production-financial`). Verification is a mechanical
diff plus the repo's gates.

**Tech Stack:** TypeScript, Zod, Vitest (server project + integration config),
Hermes/orchestrate.js, gh CLI.

## Global Constraints

- Spec:
  `docs/superpowers/specs/2026-07-29-task160-internal-waterfall-governance-design.md`
  (authoritative; read it first).
- Mandated commit subject, verbatim:
  `docs(economics): authorize internal whole-fund waterfall modeling (ADR)`.
- Commit 1 contains exactly: `DECISIONS.md`,
  `shared/contracts/internal-economics/internal-waterfall-template.ts`,
  `tests/unit/contract/internal-economics/internal-waterfall-template.test.ts`.
- Do not modify `shared/types/forbidden-features.ts`, weaken `FORBIDDEN_TOKENS`,
  edit Phoenix-protected paths, run a DB migration, add dependencies, or use
  emoji.
- The banned token must not appear in any `.ts` file under `client/`, `server/`,
  or `shared/` (the scanner skips only full-line `//` and `*` comment lines; the
  new contract file avoids the token entirely). It MAY appear in `DECISIONS.md`
  prose and in files under `tests/`.
- Hermes is a byte-identical applier: any deviation from signed-off drafts =
  redispatch; two failed attempts = halt with divergence report and ask the user
  (never self-authorize direct edits).
- All test runs use `TZ=UTC`. Vitest invocations are direct (`npx vitest run`
  with a single `--project`); never `npm test -- --project=X` (it unions both
  projects).
- Merge authority stays with the user: open the PR, leave it unmerged, stop. Do
  not start Task 16.1+.

---

### Task 1: Freshness re-check and divergence gate

**Files:** none (read-only).

**Interfaces:**

- Produces: confirmed ADR number (`ADR_NUM`, expected 064) and a green baseline
  for all later tasks.

- [ ] **Step 1: Run the freshness battery**

```bash
git status --short --branch
git rev-parse HEAD origin/main
git worktree list
gh run list --branch main --limit 5 --json name,status,conclusion,headSha
grep -n "^## ADR-" DECISIONS.md | tail -3
ls shared/contracts/internal-economics/ 2>&1
grep -n "'european'" shared/types/forbidden-features.ts
gh issue view 1176 --json state,updatedAt --jq '{state,updatedAt}'
```

Expected: HEAD == origin/main; exactly one worktree; CI Unified, CodeQL,
Security Deep Scan all `success` on HEAD; latest ADR heading is `ADR-063` (so
`ADR_NUM=064`; if a higher number exists, use next free and propagate through
every draft); the contracts dir does not exist; forbidden token present at line
18; issue 1176 OPEN with `updatedAt` no later than 2026-07-21.

- [ ] **Step 2: Halt check**

If any expectation fails -- issue text changed, Task 16.0 already checked, CI
red on main, or unfamiliar commits touch `DECISIONS.md`,
`shared/types/forbidden-features.ts`, or `shared/contracts/internal-economics/`
-- STOP and write a divergence report instead of proceeding.

---

### Task 2: Author and pre-format the three drafts

**Files:**

- Create: `.claude/artifacts/task160/adr.md` (gitignored draft)
- Create: `.claude/artifacts/task160/internal-waterfall-template.ts` (gitignored
  draft)
- Create: `.claude/artifacts/task160/internal-waterfall-template.test.ts`
  (gitignored draft)

**Interfaces:**

- Produces: three pre-formatted draft files consumed verbatim by Tasks 3-5.

- [ ] **Step 1: Write the ADR draft** to `.claude/artifacts/task160/adr.md`.
      This text is appended to the end of `DECISIONS.md`. Replace `064` with the
      confirmed `ADR_NUM` from Task 1:

```markdown
## ADR-064: Authorize Internal Whole-Fund Waterfall Modeling (PLAN_61 Task 16.0)

**Date:** 2026-07-29 **Status:** [ACCEPTED] Accepted **Decision:** Authorize
whole-fund carry mechanics for internal modeling under the template name
`whole_fund`, expressed by the new internal contract
`shared/contracts/internal-economics/internal-waterfall-template.ts`
(`InternalWaterfallTemplateSchema = z.enum(['whole_fund', 'deal_by_deal'])`).
The legacy European feature surface and its token stay removed;
`FORBIDDEN_TOKENS`, the coercing `WaterfallTypeSchema`
(`shared/types/forbidden-features.ts:36-38`), and
`tests/integration/forbidden-tokens.test.ts` are not weakened.

### Context

PLAN_61 Wave F introduces internal LP economics with two waterfall templates.
The template vocabulary must be authorized before any engine work (issue #1176
Task 16.0). Three facts shape the vocabulary:

1. The existing deal-by-deal ledger
   (`client/src/lib/waterfall/american-ledger.ts:142-148`) is a non-compounding
   hurdle recomputed against outstanding capital at each distribution event
   (`outstandingCapital = max(0, paidIn - distributed)`, hurdle treated as a
   minimum return above paid-in at event time). It is not strict per-security
   cost-basis netting, and the template name `deal_by_deal` must not be read as
   promising per-deal fidelity the ledger does not have.
2. The existing economics engine (`shared/lib/economics/economics-engine.ts:695`
   `runEconomicsModel`, with module-private `allocateWaterfall` at line 476)
   maintains single fund-wide `unreturnedCapital` / `prefBalance` accounts
   (lines 713-714) with compounding preferred-return accrual and no per-deal
   cost basis. It is whole-fund in substance despite its `'american'` label.
   Numerical characterization of this engine belongs to Task 16.3, not this ADR.
3. The token `'european'` is banned repo-wide by an active guard
   (`shared/types/forbidden-features.ts:16-29` and the integration scanner). The
   public `WaterfallTypeSchema` silently migrates `'european'` to `'american'`.
   Reintroducing whole-fund mechanics therefore requires a new, distinct
   internal vocabulary -- not a revival of the legacy surface. This mirrors
   deliberate product-scope divergence from Tactyc parity elsewhere: Tactyc
   documents a line-of-credit feature, and Updog bans its tokens.

### Decision

- Internal LP economics uses
  `InternalWaterfallTemplateSchema = z.enum(['whole_fund', 'deal_by_deal'])`
  from `shared/contracts/internal-economics/internal-waterfall-template.ts`.
- The internal enum is a distinct type: it never imports, re-exports, or
  round-trips the coercing public `WaterfallTypeSchema`. A contract test pins
  this (parse-rejection of both `'american'` and the banned legacy value, plus a
  source scan of the contract file). The drift it guards against has live
  precedent: `shared/contracts/kpi-selector.contract.ts:15-17` imports and
  re-exports `WaterfallTypeSchema`.
- The legacy European feature surface remains removed. The guard stack --
  `FORBIDDEN_TOKENS`, its banned-token entry, the coercion schema, and the
  integration scanner -- is unchanged.
- Whole-fund carry mechanics are authorized for INTERNAL modeling only. Engine
  relocation (16.1), primitive extraction (16.2), and numerical characterization
  plus truth cases (16.3) are separately gated follow-on tasks; the `whole_fund`
  truth-case slice additionally waits on the open G1 question (actual LPA carry
  basis).

### Consequences

- Wave F engine tasks have an authorized, contract-typed template vocabulary
  with no dependency on the banned legacy surface.
- The internal contract is the reference point for later scope guards (the live
  `WaterfallAssumptionsV1Schema` in `shared/contracts/economics-v1.contract.ts`
  is not modified by Task 16).
- waterfall-specialist sign-off on this ADR is recorded in the Task 16.0 PR
  description per the Phoenix protected-path rules.
```

- [ ] **Step 2: Write the contract draft** to
      `.claude/artifacts/task160/internal-waterfall-template.ts`:

```ts
/**
 * Internal waterfall template contract (PLAN_61 Task 16.0, ADR-064).
 *
 * A distinct internal vocabulary for LP-economics modeling. It carries no
 * legacy-migration semantics and must never import or round-trip the
 * coercing public schema in shared/types/forbidden-features (pinned by
 * tests/unit/contract/internal-economics/internal-waterfall-template.test.ts).
 */
import { z } from 'zod';

export const InternalWaterfallTemplateSchema = z.enum([
  'whole_fund',
  'deal_by_deal',
]);

export type InternalWaterfallTemplate = z.infer<
  typeof InternalWaterfallTemplateSchema
>;
```

- [ ] **Step 3: Write the test draft** to
      `.claude/artifacts/task160/internal-waterfall-template.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
// Default import on purpose: tests/setup/node-setup.ts vi.mock('fs') stubs the
// NAMED readFileSync/existsSync exports but keeps the default export real.
// Named fs imports here would read the mock, not the file.
import fs from 'node:fs';
import path from 'node:path';

import {
  InternalWaterfallTemplateSchema,
  type InternalWaterfallTemplate,
} from '../../../../shared/contracts/internal-economics/internal-waterfall-template';

const CONTRACT_PATH = path.join(
  process.cwd(),
  'shared/contracts/internal-economics/internal-waterfall-template.ts'
);

describe('InternalWaterfallTemplateSchema (Task 16.0 governance contract)', () => {
  it('accepts both internal template values', () => {
    expect(InternalWaterfallTemplateSchema.parse('whole_fund')).toBe(
      'whole_fund'
    );
    expect(InternalWaterfallTemplateSchema.parse('deal_by_deal')).toBe(
      'deal_by_deal'
    );
  });

  it('exports the inferred type', () => {
    const template: InternalWaterfallTemplate = 'whole_fund';
    expect(InternalWaterfallTemplateSchema.parse(template)).toBe('whole_fund');
  });

  it('rejects the public waterfall label', () => {
    expect(() => InternalWaterfallTemplateSchema.parse('american')).toThrow();
  });

  it('rejects the banned legacy value instead of coercing it', () => {
    // The public WaterfallTypeSchema migrates this value to 'american'. The
    // internal enum must reject it outright: no round-trip semantics. This
    // file lives under tests/, outside the token scanner's globs.
    expect(() => InternalWaterfallTemplateSchema.parse('european')).toThrow();
  });

  it('never imports or references the coercing public schema', () => {
    const source = fs.readFileSync(CONTRACT_PATH, 'utf8');
    expect(source).not.toMatch(/forbidden-features/);
    expect(source).not.toMatch(/WaterfallTypeSchema/);
  });
});
```

- [ ] **Step 4: Pre-format the drafts** so lint-staged's commit-time pass is a
      no-op (byte-identity survives the commit):

```bash
node node_modules/prettier/bin/prettier.cjs --write .claude/artifacts/task160/adr.md
node node_modules/prettier/bin/prettier.cjs --write .claude/artifacts/task160/internal-waterfall-template.ts .claude/artifacts/task160/internal-waterfall-template.test.ts
npx eslint --fix --no-warn-ignored .claude/artifacts/task160/internal-waterfall-template.ts .claude/artifacts/task160/internal-waterfall-template.test.ts || true
```

Note: eslint may error on artifacts outside its project globs -- that is
acceptable (`|| true`); prettier formatting is the load-bearing part. Re-read
the drafts after formatting; they are now frozen.

---

### Task 3: waterfall-specialist sign-off (evidence contract)

**Files:** none repo-tracked. Sign-off text saved to
`.claude/artifacts/task160/signoff.md`.

**Interfaces:**

- Consumes: the three frozen drafts from Task 2.
- Produces: recorded sign-off text for the Task 7 PR description.

- [ ] **Step 1: Dispatch the waterfall-specialist agent** with this prompt:

```text
Review the draft ADR at .claude/artifacts/task160/adr.md and the draft
contract at .claude/artifacts/task160/internal-waterfall-template.ts for
PLAN_61 Task 16.0. Validate every substantive claim against the repository:
(1) the deal_by_deal characterization against
client/src/lib/waterfall/american-ledger.ts, (2) the whole-fund-in-substance
characterization against shared/lib/economics/economics-engine.ts,
(3) the guard-stack claims against shared/types/forbidden-features.ts and
tests/integration/forbidden-tokens.test.ts. Requirements: every finding and
every confirmation MUST cite file:line evidence you actually read. Return
either SIGN-OFF (with the evidence list) or FINDINGS (numbered, each with
file:line and a concrete correction). Do not propose scope beyond Task 16.0.
```

- [ ] **Step 2: Validate the report is real.** The report must contain file:line
      citations consistent with the sources (spot-check at least two:
      `american-ledger.ts:142-148` outstanding-capital recompute;
      `economics-engine.ts:713-714` fund-wide accounts). If the report has zero
      tool-use evidence or citation-free claims, discard it and redo the review
      inline against the same checklist.

- [ ] **Step 3: Resolve findings.** Each finding is resolved against repo
      evidence; ADR edits require re-running the formatting step (Task 2 Step 4)
      and re-review of the changed section. Iterate until SIGN-OFF.

- [ ] **Step 4: Record sign-off** verbatim in
      `.claude/artifacts/task160/signoff.md` (include the evidence list).

---

### Task 4: Fact-check the dispatch brief

**Files:**

- Create: `.claude/artifacts/task160/dispatch-brief.md`

**Interfaces:**

- Consumes: frozen drafts + sign-off.
- Produces: fact-checked dispatch brief consumed by Task 5.

- [ ] **Step 1: Write the dispatch brief**:

```markdown
# Task 16.0 dispatch brief (byte-identical application)

Apply exactly three edits. Copy content byte-for-byte from the listed source
artifacts. Do not rewrite, reformat, or improve anything.

1. Append to the end of DECISIONS.md, in this exact order: one blank line, then
   a line containing exactly `---`, then one blank line, then the full content
   of .claude/artifacts/task160/adr.md verbatim (which already starts with
   `## ADR-064` and ends with a single trailing newline -- add no extra blank
   line before or after it). This reproduces the repo's existing ADR-boundary
   convention (confirmed byte-for-byte at the ADR-061/ADR-062 and
   ADR-062/ADR-063 boundaries: `<last line>\n---\n\n## ADR-NNN...`). Do NOT use
   a single blank line alone -- that does not match repo convention.
2. Create shared/contracts/internal-economics/internal-waterfall-template.ts
   with the exact content of
   .claude/artifacts/task160/internal-waterfall-template.ts.
3. Create
   tests/unit/contract/internal-economics/internal-waterfall-template.test.ts
   with the exact content of
   .claude/artifacts/task160/internal-waterfall-template.test.ts.

Touch no other file. Do not run git commands. Do not create directories beyond
the two parents implied above.
```

- [ ] **Step 2: Fact-check via codex** (read-only; the instruction must not
      contain the word "Review" -- the local OMX hook misroutes it):

```bash
codex exec "Fact-check the document .claude/artifacts/task160/dispatch-brief.md against this repository: verify the three target paths are correct, that the two created paths do not already exist, that DECISIONS.md ends with the ADR-063 section, and that the brief's instructions are unambiguous for a mechanical applier. List any discrepancy with file:line evidence." --sandbox read-only
```

Read the tail of the output for the verdict. Resolve discrepancies before
dispatch.

---

### Task 5: Hermes dispatch (byte-identical, two strikes)

**Files (created by Hermes, not directly):**

- Modify: `DECISIONS.md` (append ADR)
- Create: `shared/contracts/internal-economics/internal-waterfall-template.ts`
- Create:
  `tests/unit/contract/internal-economics/internal-waterfall-template.test.ts`

**Interfaces:**

- Consumes: dispatch brief + frozen drafts.
- Produces: repo files byte-identical to drafts, consumed by Tasks 6-7.

- [ ] **Step 1: Dispatch** (direct node invocation -- the npm shim mangles args;
      keyword-light task string; T3/production-financial is pinned by the phase
      flag and must not be downgraded):

```bash
node orchestrate.js --phase production-financial --task "apply the three-file bundle described in .claude/artifacts/task160/dispatch-brief.md byte-identically"
```

Known failure modes: exit code lies about work landing (adjudicate via the run
ledger and the diff, not the exit code); long runs can be harness-killed (the
brief doubles as the frozen spec, so a killed run is re-adjudicated from the
diff).

- [ ] **Step 2: Byte-verify** (mechanical, no judgment):

```bash
git status --short
awk '/^## ADR-064/{found=1} found' DECISIONS.md > .claude/artifacts/task160/applied-adr.extract.md
diff .claude/artifacts/task160/applied-adr.extract.md .claude/artifacts/task160/adr.md && echo ADR-OK
diff shared/contracts/internal-economics/internal-waterfall-template.ts .claude/artifacts/task160/internal-waterfall-template.ts && echo CONTRACT-OK
diff tests/unit/contract/internal-economics/internal-waterfall-template.test.ts .claude/artifacts/task160/internal-waterfall-template.test.ts && echo TEST-OK
```

Expected: `git status` shows exactly the three intended paths changed/added
(plus the pre-existing `.gitignore` modification and untracked handoff/spec
files); `grep -c "^## ADR-064" DECISIONS.md` is 1; all three diffs empty
(trailing-newline-only differences are acceptable -- confirm with `diff` and
eyes, then treat as pass).

- [ ] **Step 3: Two-strike policy.** On any deviation: revert the misapplied
      files
      (`git checkout -- DECISIONS.md; rm -rf shared/contracts/internal-economics tests/unit/contract/internal-economics`),
      tighten the brief with the observed failure, redispatch once. On a second
      failure: halt, write a divergence report with both attempts'
      diff-vs-drafts, and ask the user whether to authorize direct application.

---

### Task 6: Verification gates

**Files:** none (verification only).

**Interfaces:**

- Consumes: applied repo files.
- Produces: recorded gate outputs for the Task 7 PR description.

- [ ] **Step 1: Typecheck and lint**

```bash
npm run check
npm run lint
```

Expected: both pass. Note: test files are excluded from tsconfig projects, so
`npm run check` proves the contract file only; the test compiles under vitest in
the next step.

- [ ] **Step 2: New contract test (server project)**

```bash
TZ=UTC npx vitest run tests/unit/contract/internal-economics/internal-waterfall-template.test.ts --config vitest.config.mjs --configLoader native --project=server
```

Expected: 5 tests pass.

- [ ] **Step 3: Forbidden-tokens scanner (integration config -- NOT the
      handoff's `--project=server` command, which matches zero tests)**

```bash
TZ=UTC npx vitest run tests/integration/forbidden-tokens.test.ts --config vitest.config.int.ts --configLoader native
```

Expected: all tests pass (the new contract file is inside the scan globs and
contains no banned token). Contingency: if the integration globalSetup demands a
database, run against the local Postgres 16 stack (povc_dev) and note the
environment in the PR evidence.

- [ ] **Step 4: Calc gate**

```bash
TZ=UTC npm run calc-gate
```

Expected: pass (regression floor only -- it does not run the new files).

- [ ] **Step 5: Record all outputs** (pass/fail lines, not full logs) in
      `.claude/artifacts/task160/gate-evidence.md`.

---

### Task 7: Branch, commits, push, PR (leave unmerged)

**Files:**

- Commit 1: the three bundle files. Commit 2: `.gitignore`. Commit 3:
  `docs/superpowers/specs/2026-07-29-task160-internal-waterfall-governance-design.md`,
  `docs/superpowers/plans/2026-07-29-task160-internal-waterfall-governance.md`,
  regenerated `docs/_generated/` outputs.

**Interfaces:**

- Consumes: verified files, sign-off text, gate evidence.
- Produces: open unmerged PR.

- [ ] **Step 1: Branch from fresh origin/main**

```bash
git fetch origin
git checkout -b docs/task160-internal-waterfall-governance origin/main
```

(The applied changes ride along as working-tree state; `git status` must show
them plus `.gitignore` and the two docs files.)

- [ ] **Step 2: Commit 1 -- mandated bundle (explicit paths only)**

```bash
git add DECISIONS.md shared/contracts/internal-economics/internal-waterfall-template.ts tests/unit/contract/internal-economics/internal-waterfall-template.test.ts
git commit -m "docs(economics): authorize internal whole-fund waterfall modeling (ADR)"
```

Watch lint-staged output: it must not rewrite the files (drafts were
pre-formatted). If it does, the commit content diverged from sign-off -- reset
this commit, investigate the formatting delta, re-run Task 3 Step 3 on the
changed section.

- [ ] **Step 3: Commit 2 -- user-authorized gitignore chore**

```bash
git add .gitignore
git commit -m "chore: ignore audit/ directory (knowledge graph relocation)"
```

- [ ] **Step 4: Commit 3 -- spec + plan + router index**

```bash
git add docs/superpowers/specs/2026-07-29-task160-internal-waterfall-governance-design.md docs/superpowers/plans/2026-07-29-task160-internal-waterfall-governance.md
npm run docs:routing:generate
git add docs/_generated/
git commit -m "docs: add task 16.0 governance design spec and plan"
```

(Router index scans tracked files -- the `git add` of the two markdown files
must precede the generate step.)

- [ ] **Step 5: Push and verify the push actually landed** (never trust a piped
      push):

```bash
git push -u origin docs/task160-internal-waterfall-governance
git ls-remote origin docs/task160-internal-waterfall-governance
```

Expected: ls-remote shows the branch at the local HEAD SHA.

- [ ] **Step 6: Open the PR (leave unmerged)** with body assembled from
      `.claude/artifacts/task160/signoff.md` and
      `.claude/artifacts/task160/gate-evidence.md`:

```bash
gh pr create --title "docs(economics): authorize internal whole-fund waterfall modeling (ADR)" --body-file .claude/artifacts/task160/pr-body.md
```

`pr-body.md` template:

```markdown
## PLAN_61 Wave F Task 16.0: governance pre-step

Three-file bundle per issue #1176 Task 16.0 (plus user-authorized .gitignore
chore and the design spec/plan). Scope ends here; Tasks 16.1+ not started.

### waterfall-specialist sign-off

<verbatim sign-off text with evidence list>

### Gate evidence

<pass/fail lines for check, lint, contract test, forbidden-tokens via
vitest.config.int.ts, calc-gate>

Note: the forbidden-tokens integration test does not run on PR-path CI
(integration lane triggers on main/full-suite/schema paths only); it was run
locally via vitest.config.int.ts as recorded above. The new unit contract test
provides the durable PR-time guard.

Merge authority: user. This PR is intentionally left unmerged.
```

- [ ] **Step 7: Stop.** Do not merge. Do not start Task 16.1. Report the PR URL,
      the sign-off summary, and any deviations.
