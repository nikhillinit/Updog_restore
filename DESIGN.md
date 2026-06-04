---
status: ACTIVE
last_updated: 2026-06-03
---

# Design System — Updog / Press On Ventures

The single entry point for any visual or UI decision in this repo. Read this
before touching colors, typography, spacing, components, or screen layout. It
does not replace the code-level token file or the philosophy doc; it points to
them and resolves the conflicts between the layers that have accreted on top.

## Canonical sources (two pillars)

| Pillar                      | Source of truth                                                               | Owns                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Tokens** (the values)     | `client/src/theme/presson.tokens.ts`                                          | color, typography, spacing, radius, shadow, focus, transition                                           |
| **Doctrine** (the behavior) | `docs/design/updog-design-philosophy-v3.1.1.html` (+ implementation-notes.md) | screen grammar, role modes, object hierarchy, interaction/motion/collaboration rules, acceptance rubric |

`presson.tokens.ts` flows into `tailwind.config.ts` as the `presson.*` and
`borderRadius.presson` / `boxShadow.presson-*` scales. **On any conflict between
a hardcoded value and a token, the token wins.** On any conflict between a token
value and the v3.1.1 doc's inline CSS, the token wins (the doc is a standalone
artifact; its `:root` is illustrative, not authoritative) — except where listed
under "Open reconcile items" below.

> The v3.1.1 docs are committed in-repo at `docs/design/` (landed in commit
> `e29e0eb6`, "restore truth-first UX across audit surfaces"). The Downloads
> patch is therefore already applied; do not re-apply it.

## Aesthetic direction

**Quiet, expert-grade operating workspace.** Paper / sand / ink. Editorial
minimalism for a multi-entity capital tool: dense, decision-grade tables and
metrics, command-first interaction, context-preserving drill-down. Distinction
comes from the decision-to-operations loop, not visual novelty.

- **Mood:** calm, precise, trustworthy under LP scrutiny. Numbers before chrome.
- **It is:** charcoal ink on warm white/sand, one high-contrast (black) primary
  action, muted status color, restrained motion that explains state.
- **It is NOT:** blue/purple SaaS gradients, multi-accent dashboards, decorative
  cards, social-feed clutter, novelty motion.

## Color

Canonical values from `presson.tokens.ts`:

| Role                           | Token                        | Hex                    |
| ------------------------------ | ---------------------------- | ---------------------- |
| Background / surface           | `bg` / `surface`             | `#FFFFFF`              |
| Subtle surface                 | `surfaceSubtle`              | `#F2F2F2`              |
| Border / highlight (warm sand) | `borderSubtle` / `highlight` | `#E0D8D1`              |
| Primary text (ink)             | `text`                       | `#292929`              |
| Muted text                     | `textMuted`                  | `#5A5A5A`              |
| **Accent / primary action**    | `accent` / `accentOn`        | `#292929` on `#FFFFFF` |
| Positive                       | `positive`                   | `#127E3D`              |
| Negative                       | `negative`                   | `#B00020`              |
| Warning                        | `warning`                    | `#9C6F19`              |
| Info                           | `info`                       | `#2563EB`              |

**The accent is charcoal, not blue.** Create / Save / Approve / Share / Invite
all use the same black button language (v3.1.1 P-07/interaction model).

The charcoal `50-950` and beige `50-900` numeric scales in `tailwind.config.ts`
are a sanctioned **extension** of `text`/`borderSubtle` — the production
workspace uses `charcoal-500`, `beige-200`, etc. Keep them.

**v3.1.1 extensions (sanctioned):** a muted category-tag palette for entity/tag
classification — teal `#cfe7df`, lavender `#ddd6f5`, orange `#efd9bd`, pink
`#f2d7dc` — and a single restrained slate-blue `#3769a6` for informational
accents. These are desaturated on purpose; they are tags, not accents. Do not
promote them to primary actions.

**Success vs positive (two greens, two roles — not duplicates).** `success` /
emerald `#10b981` (the `success`, `pov.success`, `semantic.success` families) is
the canonical UI-success-state color (valid, saved, complete) and is what the
app actually uses (~25 live sites). `positive #127E3D` (brand gain green,
consistent across `presson.tokens.ts` / pv2 / v3.1.1) is reserved for financial
up/gain indicators; currently unadopted in code. Use `success` for UI state,
`positive` for financial direction.

## Typography

- **Headings:** Inter (`presson.typography.heading`, Tailwind `font-heading` /
  `font-inter`)
- **Body:** Poppins (`presson.typography.body`, Tailwind `font-body` /
  `font-poppins`)
- **Mono / data labels:** JetBrains Mono (applied 2026-06-03; verify the webfont
  is loaded, else it falls back to Roboto Mono / ui-monospace)
- Use `tabular-nums` on every numeric column (financial data must align).
- `text-wrap: balance` / `text-pretty` on headings (utilities exist in tailwind
  config).

## Spacing, radius, shadow, motion

- **Spacing:** 8px grid. `presson.spacing(n) => n*8px`. Use multiples of 4/8.
- **Radius:** `xs 4 · sm 6 · md 10 · lg 16 · xl 24` (`borderRadius.presson.*`).
- **Shadow:** `presson-sm/md/lg/card/cardHover` — restrained, never glowy.
- **Focus:** charcoal ring `0 0 0 3px rgba(41,41,41,.25)`
  (`presson.focus.ring`).
- **Transitions:** `fast 150 · normal 200 · slow 300`,
  `cubic-bezier(0.4,0,0.2,1)`.
- **Reduced motion is mandatory.** Every animation must degrade to an instant
  state change under `prefers-reduced-motion: reduce`. Set the base state to
  visible and gate entrance animations behind
  `@media (prefers-reduced-motion: no-preference)` so reduced-motion users are
  never left on `opacity:0`.

## Doctrine (v3.1.1) — behavioral guardrails

Every high-value surface answers four questions in the first viewport: **1) What
is true now? 2) What changed? 3) What is due? 4) What can I do next?**

- **Screen grammar (four zones):** persistent navigation · command header
  (breadcrumbs, search, freshness, share, command entry) · decision canvas
  (metrics, tables, charts, scenarios, primary CTAs) · context rail (people,
  deadlines, blockers, recent activity).
- **Object hierarchy:** Entity → Surface → Object → Action. Every screen makes
  the current entity, surface, object, and next action legible without
  reconstructing context from nav.
- **Role modes (one object model, three lenses):** GP decision · analyst proof ·
  ops execution. Same data, different default weighting — not separate products.
- **Interaction:** cards open context-preserving work panels (dim, blur, return
  to exact viewport/scroll/filters/entity); charts reveal proof on hover/focus
  (value, driver, delta, source, assumption); local actions stay local; saved
  views are portable; Cancel is safe, Save is explicit and audited.
- **Collaboration resolves into ownership:** mentions/comments/attachments
  create tasks, decisions, or audit records — never a free-floating feed.
- **Trust guardrails:** no unsupported claims on material numbers (cite drivers,
  assumptions, source, confidence); no hidden financial side effects.
- **LP-safe sharing:** shared views are scoped, timestamped, immutable,
  freshness-labeled, with a change summary.
- **Acceptance rubric:** a surface is not done until it passes all v3.1.1 checks
  (truth-first, accountable context, multi-entity clarity, screen grammar,
  visible urgency, place-preserving drill-down, keyboard parity, collaboration
  ownership, purposeful motion, LP-safe sharing).

## Drift register

Layers in `tailwind.config.ts` and `presson-v2.css` that accreted on top of the
canonical tokens. Classify before reuse.

| Item                                                                                | Where                        | Verdict                 | Action                                                                                                                                                                |
| ----------------------------------------------------------------------------------- | ---------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `interactive.accent: #3b82f6` (blue)                                                | tailwind.config.ts:120       | **RESOLVED 2026-06-03** | Redirected `interactive.accent` DEFAULT/hover/active to charcoal (was blue `#3b82f6`); sole consumer was the dead ButtonEnhanced — T-G.                               |
| `interactive.primary.focus: #0ea5e9` (sky)                                          | tailwind.config.ts:112       | **RESOLVED 2026-06-03** | `interactive.primary.focus` `#0ea5e9` -> `#292929` charcoal; feeds `.focus-visible-ring` / `.btn-enhanced` — T-G.                                                     |
| `financial.stable: #8b5cf6` (purple)                                                | tailwind.config.ts:179       | **RESOLVED 2026-06-03** | Deleted the unused `financial` color group (zero code refs) — T-A.                                                                                                    |
| `pov.success #10B981` vs `semantic.success #10b981` vs canonical `positive #127E3D` | tailwind.config.ts:42/57/138 | **RESOLVED 2026-06-03** | Not drift — two roles (T-F option A). `success`/emerald `#10b981` = canonical UI-success (~25 live sites); `positive #127E3D` = brand gain, reserved. No code change. |
| `confidence.*` (critical/low/medium/high/excellent)                                 | tailwind.config.ts:46        | **EXTENSION (scoped)**  | Legit semantic palette for AI-confidence indicators only. Do not use as general UI accent (it introduces blue `#3b82f6`).                                             |
| Enhanced micro-interactions (`fade-in`, `card-hover`, `confidence-glow`, …)         | tailwind.config.ts:282-356   | **EXTENSION**           | Keep, but every consumer must honor reduced-motion (see Motion).                                                                                                      |
| `--pv2-mute: #7A7A7A`                                                               | presson-v2.css:11            | **RESOLVED 2026-06-03** | Set `--pv2-mute` to canonical `#5A5A5A` — T-B.                                                                                                                        |
| `--pv2-*` pos/neg/rule                                                              | presson-v2.css:13-18         | **CANONICAL (aligned)** | `#127E3D`/`#B00020`/`#E0D8D1` already match tokens. Good.                                                                                                             |
| `/v2/*` has no `@media` (no responsive, no reduced-motion)                          | presson-v2.css               | **LEGACY-DRIFT**        | Tracked in the scenario-surfaces fix plan; bring `/v2` under canonical motion + responsive rules.                                                                     |
| charcoal/beige numeric scales                                                       | tailwind.config.ts:144-170   | **EXTENSION**           | Sanctioned; consistent with `#292929`/`#E0D8D1`.                                                                                                                      |

## Reconcile items (resolved 2026-06-02)

The three design artifacts disagreed on a few values. Resolved, with
`presson.tokens.ts` as the tie-breaker:

1. **Mono font: JetBrains Mono.** Was `ui-monospace` (tokens) / Fira Code
   (tailwind) / JetBrains (`/v2` + v3.1.1 doc). Applied 2026-06-03 (T-D):
   `presson.tokens.ts` mono + tailwind `font-mono` set to the JetBrains Mono
   stack. Verify a JetBrains Mono webfont is actually loaded; otherwise it falls
   back to Roboto Mono / ui-monospace.
2. **Body font: Inter heading + Poppins body (unchanged).** The v3.1.1 doc's
   Inter-only rendering was page styling, not a mandate. No migration.
3. **Warning: `#9C6F19`** (canonical) over v3.1.1's `#a95c00`. Applied
   2026-06-03 (T-H) to `pov.warning` + `warning.DEFAULT`. **Resolved 2026-06-03
   as two roles** (the success/positive pattern): brand `warning` `#9C6F19` is
   the status-warning token (now used across the migrated `dashboard` and
   `fund-model-results` surfaces); `semantic.warning` deliberately stays amber
   as the AI-confidence-low color. Its only consumers are
   `.ai-confidence-badge.low` (`design-system.css`) and
   `.ai-confidence-indicator` low state (`tailwind.config.ts`), which must stay
   amber for confidence-ramp coherence with `confidence.low`. No general/status
   surface consumes `semantic.warning`, so no code change was required — the
   roles are already cleanly separated.
4. **Card radius: canonical scale** (`md 10` / `lg 16`); cards map to `lg`. No
   `14px` token unless brand requires it.

## Relationship to existing docs

- This file + `client/src/theme/presson.tokens.ts` + `tailwind.config.ts` are
  the source of truth for tokens and doctrine. The former
  `enhanced-design-system-guide.md` and
  `ENHANCED_DESIGN_SYSTEM_IMPLEMENTATION.md` were pruned (2026-06-03): they
  documented the deleted "enhanced" component library (PremiumCardEnhanced,
  ButtonEnhanced, etc.). Confidence/semantic color tokens and the animation
  classes they described still live in `tailwind.config.ts` +
  `client/src/styles/design-system.css`.

## Decisions log

| Date       | Decision                                                                                                                                                                                     | Rationale                                                                                                                                                                                                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-06-02 | Created DESIGN.md ratifying `presson.tokens.ts` + v3.1.1 doctrine as the two canonical pillars; recorded drift register and open reconcile items                                             | Repo had a canonical token file, an active component guide, a v3.1.1 doctrine package, and accreted contradictory color/font layers (blue accent, purple, two greens, three monos). Surfaced by /design-review of the scenario surfaces; consolidated by /design-consultation. |
| 2026-06-02 | Resolved font reconcile items: mono = JetBrains Mono; body = Inter + Poppins (unchanged). Warning = `#9C6F19`, radius = canonical scale. Confirmed v3.1.1 docs already in-repo (`e29e0eb6`). | User decisions via /design-consultation. Mono unification staged as token-cleanup T-D; added `## Design System` pointer to CLAUDE.md.                                                                                                                                          |
