# Task 16.0 Design: Internal Waterfall Governance Pre-Step (PLAN_61 Wave F)

Date: 2026-07-29 Status: Approved (user), pending waterfall-specialist sign-off
on ADR substance Source contract: GitHub issue #1176 Task 16.0 section;
HANDOFF.json/HANDOFF.md generated 2026-07-30T01:35:27Z at HEAD a942c3f3
Provenance: Hermes debate synthesis (terra=correctness, luna=spec-compliance,
qwen=simplicity, claude=verification lane). Lane verdicts: terra REVISE, luna
REVISE, qwen advisory (governance suggestions overruled). All findings below are
ground-checked against source, not taken on lane authority.

## Mission

Ship only Task 16.0 as one separately mergeable governance pre-step. Deliverable
ends at an open, unmerged PR. Merge authority stays with the user. Do not start
Task 16.1, 16.2, either 16.3 slice, Task 17, or later waves.

## Scope and PR shape

Branch: `docs/task160-internal-waterfall-governance` (cut from up-to-date
origin/main).

Commit 1 (mandated message, exactly these three files):

```text
docs(economics): authorize internal whole-fund waterfall modeling (ADR)
```

- Modify `DECISIONS.md`: new ADR (next free number; currently ADR-064 after
  ADR-063 at DECISIONS.md:9070 -- re-verify immediately before drafting).
- Create `shared/contracts/internal-economics/internal-waterfall-template.ts`.
- Create
  `tests/unit/contract/internal-economics/internal-waterfall-template.test.ts`.

Commit 2 (user-authorized 2026-07-29, same PR): `chore:` commit containing only
the working tree's intentional `.gitignore` change (ignores `audit/`, from the
knowledge-graph relocation).

Commit 3: this spec file as a `docs:` commit (repo precedent:
docs/superpowers/specs/ holds committed designs). A new `docs/**/*.md` file
requires regenerating the router index: `git add` the spec first, then run
`npm run docs:routing:generate` and include the regenerated `docs/_generated/`
outputs in the same commit.

## ADR content requirements

- Authorizes whole-fund carry mechanics for INTERNAL modeling under the template
  name `whole_fund`. The legacy European feature surface and its token stay
  removed; `FORBIDDEN_TOKENS`, the coercing `WaterfallTypeSchema`, and
  `tests/integration/forbidden-tokens.test.ts` are not weakened.
- Terminology (waterfall-gate finding W8): `deal_by_deal` describes the existing
  ledger accurately -- a non-compounding hurdle recomputed against outstanding
  capital per event, NOT strict per-security cost-basis netting.
- The existing economics engine is characterized as fund-wide compounding
  preferred-return accounting -- whole-fund in substance despite its
  `'american'` label. Numerical characterization is deferred to Task 16.3.
- ADR prose lives in DECISIONS.md, outside the token scanner's scope, so the
  banned token may appear in prose there.
- waterfall-specialist sign-off is required on ADR substance and terminology
  BEFORE any repository file is created (Phoenix protected-path rules).

## Contract file design

- Imports only `zod`. No import from `shared/types/forbidden-features`.
- Exports:
  - `InternalWaterfallTemplateSchema = z.enum(['whole_fund', 'deal_by_deal'])`
  - `type InternalWaterfallTemplate = z.infer<typeof InternalWaterfallTemplateSchema>`
- Zero occurrences of the banned token anywhere in the file, including comments.
  The file sits inside the scanner globs (client/server/shared); scanner-safe
  comment formats exist (full-line `//` or JSDoc `*` lines) but the design
  avoids needing them entirely.
- No transitive `node:crypto` dependency, so no client-bundle leak risk and no
  type-only import constraint for future client consumers.

## Test design (approach B: parse assertions + source scan)

Rationale: `shared/contracts/kpi-selector.contract.ts:15-17` already imports AND
re-exports `WaterfallTypeSchema` from forbidden-features -- the drift this test
forbids has live precedent. PR-path CI does not run the integration token
scanner (integration suite runs on main, explicit full-suite dispatch, or
schema-filter changes only, and `shared/contracts/**` is not in the schema
filter -- .github/path-filters.yml:163-176), so this unit test is the only
durable PR-time guard.

Assertions:

1. Parse accepts `'whole_fund'` and `'deal_by_deal'`.
2. Parse rejects `'american'`.
3. Parse rejects the legacy token -- proving the internal enum carries no
   coercion/migration semantics (the forbidden-features schema coerces it). The
   test file lives under `tests/`, outside the scanner globs
   (tests/integration/forbidden-tokens.test.ts:34), so the literal is safe
   there.
4. Source scan: read the contract file's text and assert it contains neither an
   import of `forbidden-features` nor the string `WaterfallTypeSchema`.

Implementation landmine: the source scan MUST read the file via a default `fs`
import or `vi.importActual('node:fs')` -- `tests/setup/node-setup.ts` mocks
named `readFileSync`/`existsSync` (known repo gotcha). Include a protective
comment.

## Grilled decisions (user-resolved 2026-07-29)

1. **Hermes is a byte-identical applier.** The signed-off drafts are the
   artifact; Hermes must reproduce them exactly. Verification is a mechanical
   diff of repo files vs drafts; any deviation is a redispatch. Grounded in the
   Tactyc north-star reference's own reconciliation rule (documented behavior
   must be reconciled with contracts, ADRs, and explicit user decisions -- not
   adapted in flight).
2. **Sign-off evidence contract.** waterfall-specialist runs as a subagent with
   a hard requirement: every finding cites file:line, and the report must show
   real tool use. A zero-tool-call or citation-free report is discarded and the
   review is redone inline.
3. **Drafts are pre-formatted before sign-off.** Run the repo's `eslint --fix` +
   prettier over the draft .ts files and prettier over the ADR text before
   specialist review, so lint-staged's commit-time formatting (package.json
   lint-staged block) is a no-op and byte-identity survives the commit.
4. **Dispatch failure policy: two strikes then halt.** Two Hermes attempts
   (second with a tightened brief). If both fail byte-verification, halt with a
   divergence report showing each attempt's diff-vs-drafts and ask the user
   whether to authorize direct application. No self-authorized fallback.
5. **ADR cites code.** file:line anchors for the economics-engine
   characterization (precedent: ADR-063 references file:line). It may also note
   that product scope deliberately diverges from Tactyc parity (Tactyc ships a
   line-of-credit feature; Updog bans its tokens).
6. **Execution proceeds in this session** after the implementation plan is
   written (handoff TTL 2026-08-01).

## Workflow (dispatch-and-orchestration contract)

1. Re-run freshness checks (HEAD, worktrees, CI on SHA, ADR number, guard
   intact, issue #1176 state).
2. Draft all three file contents in gitignored `.claude/artifacts/` only.
   Nothing repo-tracked is created before sign-off (luna finding 1).
3. waterfall-specialist agent reviews the ADR draft; resolve every finding
   against repo evidence; record explicit sign-off text for the PR description.
4. Fact-check the Hermes dispatch brief via
   `codex exec "<instruction>" --sandbox read-only`. The instruction must not
   contain the word "Review" (local OMX hook misroutes it); phrase as
   "fact-check the document".
5. Dispatch real edits:
   `node orchestrate.js --phase production-financial --task "<keyword-light>"`.
   T3 classification must not be downgraded. The detailed brief is a gitignored
   `.claude/artifacts/` file, never a tracked file (luna finding 2).
6. Hand-inspect the resulting diff: exactly the intended files, no collateral
   edits (Hermes postflight alone is insufficient).
7. Run the verification gates below.
8. Create the branch, stage paths explicitly per commit (three files for commit
   1; `.gitignore` for commit 2; this spec for commit 3), push, verify the push
   landed via `git ls-remote`, open the PR with sign-off text and gate outputs
   in the description, leave it unmerged, stop.

## Verification gates (run with TZ=UTC)

```text
npm run check
npm run lint
npx vitest run tests/unit/contract/internal-economics/internal-waterfall-template.test.ts --config vitest.config.mjs --configLoader native --project=server
npx vitest run tests/integration/forbidden-tokens.test.ts --config vitest.config.int.ts --configLoader native
npm run calc-gate
```

Correction to the handoff (terra blocker, ground-checked): the handoff's
forbidden-tokens command used `--config vitest.config.mjs --project=server`,
which matches zero tests -- vitest.config.mjs excludes `tests/integration/**`
and the server project includes only `tests/unit/**`. The integration config
(vitest.config.int.ts:26-35) is the correct entry point.

Note: `npm run calc-gate` (package.json:77) runs phoenix:truth plus a fixed test
list that does not include the new files; it is a regression floor, not proof of
contract isolation. The commit-msg hook (.husky/commit-msg:20) accepts
`docs(economics): ...`.

## Done criteria

- Fresh ADR number assigned; ADR text appended to DECISIONS.md per the content
  requirements above.
- waterfall-specialist sign-off recorded in the PR description.
- Three mandated files contain only Task 16.0 scope; commits shaped as above.
- New contract test and forbidden-tokens integration test pass locally.
- Typecheck, lint, and calc-gate pass.
- PR open and unmerged.

## Halt conditions (divergence report instead of drafting)

- Issue #1176 Task 16.0 text materially changed, or Task 16.0 already checked.
- Required CI failing on current main.
- Unfamiliar commits touching `DECISIONS.md`,
  `shared/types/forbidden-features.ts`, or
  `shared/contracts/internal-economics/`.

## Open questions (bounded, non-blocking)

- G1 (actual LPA carry basis) remains unanswered; it blocks only Task 16.3's
  `whole_fund` truth-case slice, not this task.

## Overruled debate suggestions (recorded)

- qwen: skip waterfall-specialist sign-off and dispatch via direct git.
  Overruled: both are hard requirements of the task contract and the repository
  workflow contract.
- luna's reading that drafting in `.claude/artifacts/` violates the sign-off
  ordering: rejected as a misreading -- artifacts are gitignored and
  non-repository; the ordering constraint applies to repo-tracked files. The
  design still tightens the wording (step 2 above) to remove the ambiguity.
