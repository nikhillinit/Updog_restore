---
status: DRAFT
created: 2026-06-03
topic: Theme 2 — parallel-Hermes token-migration partition (wave 2)
authors: [claude, nikhil]
related:
  - DESIGN.md
  - client/src/theme/presson.tokens.ts
  - PR #769 (batch 1, merged 4858fc5b)
---

# Theme 2 — Parallel-Hermes Surface Partition (Wave 2)

## Problem

The design-token rollout migrated three surfaces in batch 1 (`/dashboard`,
`/fund-model-results`, `/portfolio` chrome). A census of the rest of the app
found **~3,900 raw-Tailwind color occurrences across ~125 files** still off the
canonical Press On Ventures tokens. This is a migration _program_, not a
one-shot. This spec defines how to run **wave 2** as three parallel Hermes
agents safely (no edit races), with a shared mapping so their choices converge,
landing as a single batch PR.

## Scope (decided)

- **First wave, high-value surfaces only.** Long tail deferred.
- **Three disjoint feature groups → three Hermes agents** (Portfolio, Wizard/
  fund-setup, Scenarios+analytics). Investments + cap-table deferred to wave 3.
- **Shared layer (`ui` / `layout` / `charts` / `dashboard` / `common`, ~461 occ
  / 42 files) is OUT of scope** — it is cross-cutting and is the contention
  zone; it gets its own serial PR in a later wave.
- **Single wave-2 batch PR.** All three groups land on one branch
  (`design/rollout-wave-2`), one review pass, one merge.

Non-goals: typography (resolved batch 1), shared-component migration, the
deferred Investments group, any behavioral/logic change.

---

## Section 1 — Agent ownership (disjoint file sets)

The file sets are disjoint, so three agents can edit the same working tree on
the same branch with zero merge conflict. The `npm run check` gate each run
fires is read-only, so concurrent gates are merely slow, not unsafe.

| Agent                     | Owns (glob)                                                                                                                                                                                                    | ~Occ / files | Hard boundary                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------- |
| **P** Portfolio           | `pages/portfolio-*.tsx`, `pages/CompanyDetail.tsx`, `pages/CapTables.tsx`, `components/portfolio/**`, `components/portfolio-constructor/**`                                                                    | ~728 / ~28   | MUST NOT touch `components/{ui,layout,charts,dashboard,common}` |
| **W** Wizard              | `pages/fund-setup.tsx`, `pages/*Step*.tsx` (Capital/Investment/Exit/Review/Waterfall), `components/wizard/**`, `components/modeling-wizard/**`                                                                 | ~447 / ~33   | same shared-layer exclusion                                     |
| **S** Scenarios+analytics | `pages/fund-scenario-workspace.tsx`, `pages/sensitivity-analysis.tsx`, `pages/analytics.tsx`, `pages/moic-analysis.tsx`, `components/sensitivity/**`, `components/monte-carlo/**`, `components/forecasting/**` | ~184 / ~18   | same shared-layer exclusion                                     |

**Boundary rule:** if a feature surface only renders correctly after a
shared-component change, the agent **flags it** (adds a `// TODO(design)` note)
and does not touch the shared file. Shared-layer work is a separate wave.

---

## Section 2 — Canonical mapping (shared by all three agents)

The migration error to avoid is hue→hue ("blue becomes our blue"). **The token
is chosen by semantic intent, not by hue.** Each agent applies the decision
procedure below **in order; first match wins.** This is what makes three agents
converge.

### Legal output vocabulary (the only tokens an agent may emit)

```
NEUTRALS   pov-white · pov-gray(#F2F2F2) · beige/pov-beige(#E0D8D1) · charcoal-{300..700} · pov-charcoal(#292929) · text-muted(#5A5A5A)
STATUS     success(#10b981) · error(#ef4444) · warning(#9C6F19)                 ← UI state
FINANCIAL  presson-positive(#127E3D) · presson-negative(#B00020) · presson-warning(#9C6F19) · presson-info(#2563EB)  ← $ direction
ACTION     pov-charcoal / charcoal-700  (the black button language — NOT blue)
INFO       presson-info(#2563EB) or sanctioned slate-blue(#3769a6)
TAGS       muted teal(#cfe7df) · lavender(#ddd6f5) · orange(#efd9bd) · pink(#f2d7dc)  ← classification only
```

### Hard constraints (doctrine, non-negotiable)

| Constraint                                           | Evidence                                                   | Consequence                                                      |
| ---------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| Accent/action is charcoal, **never blue**            | DESIGN.md:61; drift register `interactive.accent`→charcoal | Any blue/indigo/sky on a button/link/active/focus → **charcoal** |
| Two greens: `success`=UI-state, `positive`=financial | DESIGN.md:74–80                                            | Green splits by context; read intent                             |
| **No purple/violet/fuchsia**                         | Aesthetic: "It is NOT blue/purple SaaS"                    | Kill it; re-resolve by intent                                    |
| Teal/cyan/pink/lavender only as muted **tags**       | DESIGN.md:68–72                                            | Allowed for classification chips; never promote to accent        |

### Decision procedure (apply in order)

```
PRECEDENCE: apply in order, first match wins. The ordering IS the tie-breaker
that keeps roles mutually exclusive (an actionable link is rule 2, never rule 5).

1. NEUTRAL hue (slate/gray/zinc/stone/neutral)?
     bg:        50→bg-pov-gray · base→bg-white
     border:    100/200→border-beige-200 (or border-charcoal/7 hairline)
     text:      400/500→text-muted|charcoal-500 · 600/700→charcoal-600/700 · 800/900→text-pov-charcoal
     disabled/placeholder: →charcoal-300/400 (tertiary) — distinct from text-muted
2. ACTION — has an interactive affordance (onClick/href/submit, active, focus ring), ANY hue?
     → bg-pov-charcoal text-pov-white · hover bg-charcoal-700 · focus charcoal ring   [blue dies here]
3. STATUS badge/pill/alert (valid|error|caution)?
     valid→success · error/destructive→error · caution→warning   (use /10 bg, -dark text)
4a. FINANCIAL figure/delta/series encoding $ DIRECTION?
     gain→presson-positive · loss→presson-negative · at-risk→presson-warning · neutral→presson-info
4b. CATEGORICAL/comparison series (multiple entities, NO direction — e.g. Fund A/B/C bars)?
     → assign deterministically from a FIXED-ORDER palette:
       charcoal → presson-positive → presson-info → success → presson-warning → presson-negative
       (the order batch 1 used for the FMR chart). >6 series → escalate (rule 8).
5. INFORMATIONAL accent — static highlight, NO interactive affordance (info banner/tip)?
     → presson-info  (muted: slate-blue #3769a6)
6. CATEGORY TAG / entity classification chip (static label)?
     → muted tag palette (teal/lavender/orange/pink)
7. PURPLE/VIOLET/FUCHSIA → KILL → re-run 1–6 by intent (decorative → drop)
8. Ambiguous → leave class + // TODO(design): flag for reviewer; DO NOT guess
```

> Affordance test (rule 2 vs 5): does it respond to interaction
> (click/nav/submit)? Yes → action (charcoal). No, it's a static highlight →
> info. This is the IA "single predictable location" rule — precedence removes
> the ambiguity.

**Taxonomy validation (IA + cognitive-design):** roles are mutually exclusive by
precedence and collectively exhaustive after adding 4b (categorical series), the
affordance test, and disabled/placeholder. Color is treated as a preattentive
channel (Cleveland–McGill) carrying real meaning — hierarchy (gray ramp) and
financial direction (green/red) — so the acceptance bar forbids flattening
(AC#2/#4) or over-coloring (AC#9), not just residual raw classes.

> **Colorblind safety (the #1 a11y risk).** The financial pair
> `presson-positive` (green) / `presson-negative` (red) is unsafe as a SOLE
> channel (~8% of men). The tokens are fixed by doctrine, so the rule is:
> **color must not be the only cue.** Where gain/loss is conveyed by hue alone
> (chart series, deltas, badges), confirm a redundant non-color cue exists (sign
> +/−, ▲/▼, position, or label). If color is the sole channel, flag
> `// TODO(a11y)` — do NOT add markup in this PR (out of color-migration scope),
> just track it. Chart series stay ≤6 hues (rule 4b) per the 5–7-hue legibility
> limit.

### Central judgment call (rule 3 vs 4), encoded by example

- `bg-green-100 text-green-800` on a "Saved" badge → `success` (UI state).
- `text-green-600` on a `+12.4% MOIC` figure → `presson-positive` (financial).
- Same hue, different token — intent decides.

**Known collision to eyeball (from batch 1):** `presson-positive` #127E3D vs
`success` #10b981 are adjacent greens. Flag any chart legend where both
co-occur.

---

## Section 3 — Dispatch mechanics

**Precondition:** branch off main first — `git switch -c design/rollout-wave-2`.
All three agents operate in this one working tree on this branch.

Per agent (P / W / S):

1. **Write a spec file** `.hermes-wave2-<group>.md` (repo-relative, deleted
   after) containing: the Section 2 mapping + decision procedure verbatim, the
   exact owned file glob, the shared-layer boundary rule, and the per-surface
   task list. Keep the `--task` string **finance-keyword-free** (detail lives in
   the file) so the dispatch is not self-promoted to the production-financial
   calc gate.
2. **Dry-run** to confirm routing:
   `node orchestrate.js --dry-run --phase production --task "migrate <group> surfaces to canonical tokens per spec file"`
   → expect `risk: standard, score: 0`.
3. **Live run**, backgrounded, **staggered ~2–3s apart** (so the
   millisecond-timestamped `runId` does not collide):
   `node orchestrate.js --phase production --task "..."` with
   `dangerouslyDisableSandbox: true` on the Bash call (sandbox breaks Codex's
   auth websocket). Long jobs auto-background → completion notification.
4. **Concurrency:** three at once is fine (disjoint files, read-only gate). If
   Codex rate-limits, fall back to two-at-a-time. **No silent cap** — log if any
   group is dropped or deferred.

---

## Section 4 — Review & integration

Hermes postflight is tsc-only, so the reviewer (Claude) verifies each completed
agent:

1. **Scope diff:** `git diff` the agent's owned files only; confirm no files
   outside the glob and no shared-layer touches (catch subagent collateral).
2. **Residual grep:** re-run the off-token regex on the owned globs → expect
   near-zero, only explicit `// TODO(design)` escalations remaining.
3. **Gate:** `npm run check` after each agent (catches type breakage early).
4. **Targeted tests:** run touched-area unit tests (client project). Local box
   is Node 24 (outside engine range) — trust CI for the full suite +
   integration.
5. **Commit** each agent's diff as a separate conventional commit on
   `design/rollout-wave-2`
   (`design(rollout): wave 2 — <group> token migration`). Commit only when the
   user asks (standing rule); accumulate, then push on word.
6. **Visual verification** (proven recipe): `ALLOW_MEMORY_STORAGE=1 npm run dev`
   → Vite live on :5173 (NOT :5000, which serves a stale build). Drive with the
   installed Playwright + chromium headless shell. Eyeball each migrated surface
   against the acceptance bar. Note: the FMR cashflow chart is behind the
   DB-backed `enable_gp_economics_engine` flag (off in memory mode) — verify any
   flag-gated chart palette by faithful render, as in batch 1.
7. **One wave-2 PR** with all three surfaces; one review pass; squash-merge.

---

## Section 5 — Risks & acceptance criteria

### Risks

| ID  | Risk                                               | Mitigation                                                             |
| --- | -------------------------------------------------- | ---------------------------------------------------------------------- |
| R1  | Cross-file edit race between agents                | Disjoint globs + boundary rule + post-hoc scope diff (Section 4.1)     |
| R2  | `runId` ms-collision on the run ledger             | Stagger launches ~2–3s; cosmetic log impact only                       |
| R3  | Codex concurrency / rate limit                     | Fall back to two-at-a-time; log the throttle                           |
| R4  | Inconsistent token choices across the three agents | Shared Section 2 mapping + reviewer cross-surface cohesion diff        |
| R5  | Semantic flattening (4 grays → 1 mush)             | Acceptance criteria #2/#4 below; live eyeball                          |
| R6  | Feature surface needs a shared-layer change        | Agent flags `// TODO(design)`, does not touch; deferred to shared wave |
| R7  | Flag-gated chart can't be live-verified            | Faithful-render verification (batch-1 precedent) or explicit deferral  |

### Acceptance criteria — what "good" looks like (frontend-design quality bar)

A surface is done only when **all** hold:

1. **Zero raw off-token classes** remain on owned surfaces, except explicit
   `// TODO(design)` escalations.
2. **Hierarchy preserved.** Ink / muted / tertiary stay visually distinct — no
   collapsing the gray ramp into one tone. Refined-minimalist restraint, not a
   gray mush.
3. **Charcoal-dominant + single sharp accent** intact. **Zero** blue/indigo/sky
   as an action; **zero** purple/violet/fuchsia anywhere.
4. **Financial direction still legible.** Gains read positive-green, losses
   negative-red — color still encodes meaning; direction is not flattened to
   neutral.
5. **Cross-surface cohesion.** Same role → same token across all three groups; a
   reviewer scanning the three diffs sees one consistent hand.
6. **Refined details.** `tabular-nums` on financial columns preserved/added; 8px
   spacing; warm sand borders (not cold gray); restrained shadows (never glowy).
7. **Reduced-motion honored** on any animated class touched.
8. **Gates green.** `npm run check` clean; targeted tests pass; live eyeball
   PASS per surface.
9. **No new color meaning added.** Migration preserves the existing semantic
   load — it does not introduce `presson-info` (or any accent) where charcoal/
   neutral already sufficed. Color stays a sparing, meaningful channel (Tufte
   data-ink). When in doubt, demote to neutral, don't add an accent.
10. **No accessibility regression.** Migration introduces no NEW reliance on
    red/green hue as the sole gain/loss signal; any pre-existing sole-channel
    encoding the agent touches is flagged `// TODO(a11y)` (fix deferred — out of
    color-migration scope). Chart series ≤6 hues.

---

## Open questions / deferred

- Investments + cap-table group → wave 3.
- Shared layer (`ui`/`layout`/`charts`/`dashboard`/`common`) → dedicated serial
  PR (its own wave).
- Page-file long tail (variance-tracking 186, time-travel 35, etc.) not in any
  named group → later waves.

## Next step

After spec approval → invoke `writing-plans` to produce the executable
implementation plan (per-agent task lists + the wave-2 branch/PR checklist).
