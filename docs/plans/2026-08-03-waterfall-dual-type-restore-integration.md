# Dual Waterfall Restore — Wayfinder Integration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. This document is a PLAN. No product code
> changes are authorized by it; each ticket below carries its own gates.

**Goal:** Integrate the user-ruled restoration of both waterfall types
(European / whole-fund and American / deal-by-deal, user-selected per fund)
into the in-flight Wayfinder roadmap program without disturbing the T9
activation critical path.

**Architecture:** Restore the Decimal-native discriminated-union waterfall
policy layer from git history (`c9e5ece68`) into `shared/`, retire the
`'european'` forbidden-token coercion, and map the restored public vocabulary
(ADR-004: EUROPEAN/AMERICAN) 1:1 onto the already-authorized internal template
vocabulary (ADR-064: `whole_fund`/`deal_by_deal`). The work runs as a parallel
side trail (same posture as the GR2-4 trail) with a hard merge-fence at T8 soak
start. Activation (T9) still certifies `deal_by_deal` only.

**Tech Stack:** TypeScript strict, Zod, Decimal.js, Vitest (`phoenix:truth`
truth cases), Drizzle (no migration expected), React/shadcn per `DESIGN.md`.

---

## 0. Baseline reconciliation (supersedes handoff Block 2 where noted)

This plan was produced in a fresh remote clone, not the Windows working copy
the handoff describes. Differences, all resolved:

| Handoff claim | Observed here | Resolution |
| --- | --- | --- |
| Working copy on stale `feat/task-19-narratives`, 34 dirty entries; §4 branch move required | Fresh clone, clean worktree, branch `claude/waterfall-restore-plan-v8hq37` cut exactly at `origin/main` (`a3f4ed13e`, 2026-08-03) | §4's goal (plan against latest `main`) is satisfied by construction. No stash/checkout performed; no `.remember/` files exist here. |
| Recovery point `87541d4ea`; removal `ebd963a38`; American-only `404df43c4`; guard lock `a04d82658` | Same commits under different SHAs on this remote: recovery **`c9e5ece68`**, removal **`04e2175e`** (#178), American-only **`41bf0e47`**, guard lock **`531d612f`** (#527). The 2025-10-06 build commits (`c509ede6`, `3a09fbbe`, `daa4704e`) match exactly. | All §8 facts re-verified against the remapped SHAs. Use the SHAs in this table, not the handoff's. |
| "ADR-066 does not exist; `docs/adr/` stops at ADR-033" | `DECISIONS.md` on `main` runs to **ADR-065**. ADR-066/067 exist on unmerged branch `claude/roadmap-review-refinement-axvy6g`. `docs/adr/ADR-004-waterfall-names.md` is separately numbered and ACTIVE. | Handoff §11's ADR picture was incomplete. **ADR-064 and ADR-065 are directly on-point and reshape the plan** (see §2 below). |

**Four pins re-verified at `a3f4ed13e`:**

1. `shared/types/forbidden-features.ts:16-29` — `FORBIDDEN_TOKENS` (9 entries,
   `'european'` + 8 Line-of-Credit); `:36-38` — coercing `WaterfallTypeSchema`
   (`'european'` silently rewritten to `'american'`).
2. `shared/contracts/economics-v1.contract.ts:140` — `type: z.literal('american')`.
3. `shared/schemas/waterfall-policy.ts:121` — `type: z.literal('american')`.
4. `shared/lib/economics/economics-engine.ts:262-283` — `defaultWaterfall()`
   writes `'american'`, 8% hurdle, `compounded` pref, `clawbackEnabled: true`,
   `clawbackTrigger: 'final_liquidation'`.

**Recovery point re-verified:** `git show c9e5ece68:shared/schemas/waterfall-policy.ts`
is 375 lines: `calculateEuropeanWaterfall()` (line 173), `calculateAmericanWaterfall()`
(line 280), `WaterfallPolicySchema` discriminated union (line 148),
`EuropeanWaterfallSchema`/`AmericanWaterfallSchema` (119/134, shared
`validateTierPriorities` refinement), `ClawbackPolicySchema` (63). Decimal-native
throughout.

**Bounded unknowns from handoff §16, now resolved:**

- **Multi-bracket carry (design §7.3 Tier 4b, 25% above 3.0x):** NOT in the
  recovered code. The `case 'carry'` block is a single-rate split
  (`tier.rate || new Decimal(0.2)`). Tier 4b is new work, filed as a follow-on
  ticket (W-G), not part of the restore.
- **Latent defect in the recovered code:** in `calculateEuropeanWaterfall()`'s
  `carry` case, `remaining` is zeroed *before* being pushed as `amount` in the
  breakdown row, so the carry breakdown amount is always 0 (LP/GP splits are
  correct; only the reported tier amount is wrong). The same pattern must be
  checked in the American `carry` case. The restore fixes this; a truth case
  pins it (Task W-B).
- **T9 position:** #1299 (T9) and #1298 (T8 soak) are both open and blocked.
  The soak has not started. The §9 cost table has NOT stepped up — clean
  insertion is available.
- **Stored European values:** cannot be confirmed from the repo alone.
  Verification scripts (`scripts/verify-european-waterfalls.mjs`/`.sql`) exist
  at removal commit `04e2175e` and are re-read (not re-authored) in Task W-A.

---

## 1. Sequencing decision (Definition-of-Done item 1)

**Decision: the restore lands BEFORE the T9 activation flip, as a parallel
side trail off the critical path, with a hard merge-fence at T8 soak start
(#1298's first 7-day window).**

Rationale, in order of force:

1. **The §9 cost asymmetry.** After T9, CurrentForecastV2 serves the displayed
   numbers and the activation approval record names the carry basis; any
   waterfall change then costs the full restore work PLUS a restatement, a
   repeat of the T8 organic soak, and a repeat of the G3 sign-off. Before T9 it
   costs only the work. T9 has not happened; the cheap window is open.
2. **Side trail, not critical path.** GR2-3's map shows the critical path as
   #1286/#1288/#1293 -> #1294 -> #1295 -> #1296 -> #1297 -> #1298 -> #1299.
   None of the restore tickets below blocks any of those. This mirrors the
   GR2-4 precedent (#1300/#1301: "parallel non-blocking trail; neither touches
   #1294-#1299"). Because the critical path and the T9 gate are unchanged, the
   handoff's stop-and-ask condition ("integration would change the critical
   path or the T9 activation gate") is not tripped.
3. **The merge-fence.** A calculation-path merge during the soak would reset
   #1298's four-green-7-day-window clock — a critical-path delay by the back
   door. Therefore: any restore ticket not merged when the soak's first window
   opens HOLDS until after the T9 decision, and the held remainder consciously
   accepts the §9 step-up (restatement + repeat soak + re-sign-off) for its
   scope. The fence is checked per-ticket, not per-trail: earlier tickets that
   made it in stay in.
4. **Activation still certifies `deal_by_deal` only.** The restore does not add
   European evidence requirements to #1297's activation-evidence package or
   #1299's go/no-go. Zero funds hold a European value (the pre-restore schema
   silently rewrote European input; #178's audit found zero records; Task W-A
   re-verifies), so CurrentForecastV2 serves no European-derived numbers at
   flip time and the activation record's carry-basis naming stays truthful.

Ordering *inside* the trail is chosen so the highest-blast-radius change —
widening the live activation-lane contract `WaterfallAssumptionsV1Schema`
(pin 2) — goes last (Task W-F), maximizing the chance everything else lands
even if the fence closes early.

---

## 2. Architecture reconciliation: the restore lane vs ADR-064/065

This is the plan's central finding, invisible to the handoff (it believed the
ADR ledger stopped at 033). Two on-point ADRs already exist on `main`:

- **ADR-064 (2026-07-29, accepted): "Authorize Internal Whole-Fund Waterfall
  Modeling."** Whole-fund carry mechanics are ALREADY AUTHORIZED for internal
  modeling, under a deliberately new vocabulary
  (`InternalWaterfallTemplateSchema = z.enum(['whole_fund', 'deal_by_deal'])`
  in `shared/contracts/internal-economics/internal-waterfall-template.ts`),
  with explicit clauses that (a) the `'european'` token ban and guard stack are
  NOT weakened, (b) the internal enum never round-trips the coercing public
  schema, and (c) the live `WaterfallAssumptionsV1Schema` is not modified.
  It also records that the existing economics engine "is whole-fund in
  substance despite its `'american'` label."
- **ADR-065: `deal_by_deal` V1** shipped in the internal-economics lane with an
  indicative Float64 posture (a deliberate, ADR'd exception to Decimal in that
  lane only).

So there are two candidate architectures for the user's D1 ruling:

- **(a) Handoff lane:** restore `'european'`/`'american'` into the public
  schemas, un-ban the token, widen the contracts.
- **(b) ADR-064 lane:** keep the token banned, express everything as
  `whole_fund`/`deal_by_deal` internally.

**Decision: both, joined at a mapped boundary — because they solve different
layers.** ADR-064's premise for keeping the ban was "INTERNAL modeling only."
The user's ruling D2 (design §7.2) requires a **user-facing, per-fund enum
labeled "European (Whole Fund) | American (Deal by Deal)"** — that premise no
longer holds at the product layer, and a UI that must not contain the string
"European" cannot satisfy the design document. Concretely:

1. **Product/policy layer** (fund configuration, `shared/schemas/waterfall-policy.ts`,
   UI): restored to the honest ADR-004 canonical vocabulary
   (`'european'`/`'american'`, with `WHOLE_FUND`/`DEAL_BY_DEAL` as the
   documented aliases — ADR-004 already blesses exactly this bidirectional
   naming). The `'european'` entry leaves `FORBIDDEN_TOKENS` (9 -> 8); the
   coercing `WaterfallTypeSchema` becomes a plain
   `z.enum(['american', 'european'])`. The 8 Line-of-Credit tokens stay banned.
2. **Internal-economics engine layer**: keeps ADR-064's
   `whole_fund`/`deal_by_deal` template vocabulary unchanged. A pure adapter at
   the fund-config boundary maps `'european' <-> 'whole_fund'` and
   `'american' <-> 'deal_by_deal'`. ADR-064's no-round-trip contract test is
   updated to assert the mapping is explicit (adapter function), never an
   import/re-export of the public schema.
3. **Authority for the guard change:** Gate 0D (#1171 comment, 2026-07-29)
   parked European reintroduction on "business explicitly re-approves AND LPA
   terms confirmed." The managing partner's D1 ruling IS the business
   re-approval. The LPA half no longer gates architecture (see #1285
   disposition) — the design document requires both types regardless of any
   single fund's LPA. ADR-068 (below) records this as a narrow supersession of
   ADR-064's guard-preservation clause for the `'european'` token only.

**Decimal invariant:** the restored policy-layer calculators are Decimal-native
and stay so. ADR-065's Float64-indicative posture is confined to the
internal-economics lane it was ADR'd for; nothing in this plan lifts Float64
into the policy layer, and nothing forces Decimal into ADR-065's lane. The
recovered UI preview hook (`useWaterfallCalculations.ts` at `c9e5ece68`: plain
numbers, hardcoded `fundSize = 100`, fixed `carryRate = 0.2`) is a
shape-reference only and is NOT lifted (Task W-D).

---

## 3. Dispositions (Definition-of-Done items 2-4)

### T6 / #1291 — RE-SCOPED AND UN-PARKED

Currently: open, `blocked` by #1285, conditional ("executed only if the LPA
answers whole-fund; if deal-by-deal, close as not-planned-for-activation").

Disposition: **re-scoped** — the LPA conditionality is struck (superseded by
D1: whole-fund support is unconditional), and the ticket **un-parks into the
side trail** as Task W-C. Everything else in its body survives intact: truth
cases before engine code, the W5/W10 fixture pins (pref compounding, ROC/pref
base, catch-up formula), clawback-free V1 scenarios, quarterly grain via the
extracted `waterfall-tier-allocation` primitive (not `runEconomicsModel`'s
annual loop), typed per-template result rows, and specialist review. Its
blocker changes from #1285 to Task W-B (the schema/calculator restore). Its
own W4 scope guard (`economics-v1.contract.ts` unmodified) REMAINS for its
slice — the contract widening is a separate deliberate ticket (W-F), not
truth-case scope creep. It stays off the T9 critical path.

Not chosen: "un-parked as-is" (its conditional framing would instruct closing
it under the GR2-3 default — the opposite of the ruling); "superseded/closed"
(its acceptance criteria are the best-specified acceptance instrument in the
program; discarding them re-derives work for no benefit).

### #1285 — CONFIRMED as a per-fund data question; stays open, HITL

The handoff's reading is **confirmed**. Under the restore, the waterfall type
is a per-fund enum (D2), so the LPA answer stops routing architecture — both
types exist regardless. #1285 remains open (HITL, owner nikhillinit) with its
meaning narrowed to: (1) which enum value the real fund's configuration gets,
and (2) verification of the fund's actual hurdle/catch-up/clawback terms
against the GR2-3 provisional defaults, overriding them per-fund if the LPA
disagrees. Its "whole-fund reintroduction requires business re-approval"
amendment is satisfied by D1 and recorded in ADR-068. It no longer blocks
#1291. Backfill note: no data migration is expected — the coercion means no
stored `'european'` value should exist; Task W-A verifies this by re-reading
the #178 verification scripts from `04e2175e` rather than assuming it (any
production-database run needs separate authorization).

### GR2-3 — AMENDED (retained with narrowed meaning), not superseded

What survives:

- Deal-by-deal American with the simplified terms (no hurdle, 100% GP catch-up
  to a 20% split, no clawback) remains the **v1 default enum value** for funds
  that have not selected otherwise — D3 says European is more common in the
  industry, but this fund's own recorded default is American, and D2 makes the
  type a per-fund selection, so a default is legitimate.
- **Activation still requires the `deal_by_deal` template only.** The
  PLAN_61 acceptance-matrix amendment (ADR-066 on the unmerged branch) is
  retained: #1297/#1299's evidence scope is unchanged.
- #1285 stays open for LPA verification; #1296's conditional stays inert.

What is struck: the clause parking whole-fund/European **work** on the
post-activation horizon, and the closure instruction it implied for #1291.
Whole-fund/European support is built pre-activation as a side trail per §1.
The narrowed GR2-3 reads: "American/deal-by-deal is the v1 default and the
only activation-certified template; European/whole-fund is fully supported,
selectable per fund, and not activation-gating."

Not chosen: full supersession — it would needlessly reopen the acceptance
matrix and the activation evidence scope, tripping the T9-gate stop condition.

### The three-way American-defaults disagreement (handoff §11) — RESOLVED per field

Sources: roadmap/GR2-3 record ("no hurdle, no clawback"), `defaultWaterfall()`
code (8% hurdle, `compounded` pref, `clawbackEnabled: true`,
`clawbackTrigger: 'final_liquidation'`), design invariant 11 (clawback triggers
on GP-profit-share > threshold).

- **Default terms: the GR2-3 tracker record wins.** It is the adopted, ruled
  default and what #1285 verifies the LPA against. `defaultWaterfall()` is
  corrected to emit it (Task W-E). The code's `clawbackEnabled: true` is
  currently dead configuration anyway (the engine hardcodes `clawbackPaid = 0`
  per #1285's body), so this is a truth-in-labeling fix, not a numeric change —
  Task W-E proves that with a before/after engine-output comparison.
- **Clawback trigger semantics: the design document wins** (it is the ruled
  authority on waterfall product behavior). When clawback IS enabled on a fund,
  the trigger is the GP-profit-share-threshold form (invariant 11), carried by
  the restored `ClawbackPolicySchema` — not `'final_liquidation'` as a
  hardcoded default. Landed with W-B/W-E; V1 truth cases remain clawback-free
  per #1291's W5/W10 pins, with the trigger form pinned by schema tests.
- **ADR-066/067 (unmerged branch `claude/roadmap-review-refinement-axvy6g`):**
  merge them, then land ADR-068 as the amendment — do not edit history. ADR-066
  survives (activation matrix unchanged); ADR-068 strikes only its
  post-activation parking language.

---

## 4. Ticket decomposition (Definition-of-Done item 5)

Conventions per the roadmap's D4/D5/D7/D8 rulings: one working session each,
Trust-Spine envelope style, `Blocked-by` lines, "baseline = tail after #1275
merge" (already satisfied by any branch off current `main`), no hardcoded
migration numbers (none expected — a migration appearing in any ticket below is
an over-scoping signal per handoff §6). All numeric work in `shared/`, never
`client/`. Reviewers `waterfall-specialist` + `phoenix-precision-guardian` on
every ticket touching Phoenix protected paths; `phoenix:truth` must be green at
its live count (never a hardcoded number) plus the new cases.

Trail order: `W-A -> W-B -> {W-C, W-D, W-E in parallel} -> W-F`. W-G/W-H are
post-trail follow-ons.

### Task W-A: Retire the `'european'` coercion and token ban (ADR-068 lands here)

**Files:**
- Modify: `shared/types/forbidden-features.ts:16-38`
- Modify: `tests/integration/forbidden-tokens.test.ts` (assertions at lines
  160, 167-168 and the length expectation)
- Modify: `DECISIONS.md` (append ADR-068 — text in §5 below)
- No edit needed: `shared/contracts/kpi-selector.contract.ts` (imports
  `WaterfallTypeSchema`; widens for free — verify by reading lines 15-17, 90,
  143 and running its tests)

**Step 1: Write the failing tests first** — flip the guard test to the new
contract:

```ts
// tests/integration/forbidden-tokens.test.ts
expect(FORBIDDEN_TOKENS).toHaveLength(8);
expect(FORBIDDEN_TOKENS).not.toContain('european');
expect(FORBIDDEN_TOKENS).toContain('lineOfCredit'); // LoC ban intact
expect(WaterfallTypeSchema.parse('american')).toBe('american');
expect(WaterfallTypeSchema.parse('european')).toBe('european'); // intent preserved
expect(() => WaterfallTypeSchema.parse('hybrid')).toThrow();
```

Run: `npm test -- --project=server tests/integration/forbidden-tokens.test.ts`
Expected: FAIL (coercion still active).

**Step 2: Minimal implementation:**

```ts
// shared/types/forbidden-features.ts
export const FORBIDDEN_TOKENS = [
  // Line of Credit related (design 2.3 conflict tracked separately; see W-H registry)
  'lineOfCredit', 'locRate', 'locCap', 'locDraw',
  'locRepay', 'locDrawRules', 'locRepayRules', 'useLineOfCredit',
] as const;

/** Waterfall type. Both values are first-class; no legacy migration. */
export const WaterfallTypeSchema = z.enum(['american', 'european']);
```

Also update the file's doc comment (it currently declares European a removed
legacy feature) and sweep the repo-wide token scanner's allowlist/config if it
enumerates `'european'` anywhere else (`grep -rn "european" --include="*.ts" -il`
outside the waterfall feature surface).

**Step 3: Verify no stored European values** — read (do not run against
production) `git show 04e2175e:scripts/verify-european-waterfalls.mjs` and the
`.sql` twin; record in the PR whether a dev/staging run is possible; production
runs need separate authorization.

**Step 4: Full check:** `npm run check && npm test -- --project=server`. The
compile-time guard `_forbiddenKeysGuard` must still reject LoC keys.

**Step 5: Commit** `feat(waterfall): retire european token ban and coercion per ADR-068`

### Task W-B: Restore the discriminated-union policy schema and both calculators

**Files:**
- Modify: `shared/schemas/waterfall-policy.ts` (from
  `git show c9e5ece68:shared/schemas/waterfall-policy.ts`, reconciled onto the
  current file — the current `WaterfallTierTypeEnum` at line 14 already carries
  the four tier names; only the European branch and union were cut)
- Test: `shared/schemas/waterfall-policy.test.ts` (or the repo's adjacent-test
  convention)
- Verify-only: `shared/schemas/extended-fund-model.ts` and
  `shared/schemas/index.ts` (the two non-test consumers) still compile and
  their behavior for existing American policies is unchanged.

**Step 1: Failing tests** — pin the restored shape AND the recovered defect:

```ts
it('accepts european policies and preserves the discriminant', () => {
  const parsed = WaterfallPolicySchema.parse(europeanFixture);
  expect(parsed.type).toBe('european');
});

it('reports the carry tier amount in the breakdown (regression: recovered code pushed 0)', () => {
  const r = calculateEuropeanWaterfall(policy, d(1000), d(400), d(400), d(0));
  const carryRow = r.breakdown.find((b) => b.tier === 'carry');
  expect(carryRow!.amount.eq(carryRow!.lpAmount.plus(carryRow!.gpAmount))).toBe(true);
  expect(carryRow!.amount.gt(0)).toBe(true);
});
```

**Step 2: Restore** `EuropeanWaterfallSchemaCore`/`EuropeanWaterfallSchema`,
the `WaterfallPolicySchema` discriminated union, `calculateEuropeanWaterfall`,
and re-check `calculateAmericanWaterfall`'s carry case, fixing the
`remaining`-zeroed-before-push defect in both:

```ts
case 'carry': {
  const carryRate = tier.rate || new Decimal(0.2);
  const allocation = remaining;               // capture BEFORE zeroing
  const gpCarry = allocation.times(carryRate);
  const lpCarry = allocation.minus(gpCarry);
  lpTotal = lpTotal.plus(lpCarry);
  gpTotal = gpTotal.plus(gpCarry);
  remaining = new Decimal(0);
  breakdown.push({ tier: tier.tierType, amount: allocation, lpAmount: lpCarry, gpAmount: gpCarry });
  break;
}
```

Keep Decimal-native everywhere; no plain-number arithmetic enters this file.

**Step 3: Boundary adapter** to ADR-064's internal vocabulary (new small
module, e.g. `shared/contracts/internal-economics/waterfall-template-mapping.ts`):

```ts
export function toInternalTemplate(t: WaterfallType): InternalWaterfallTemplate {
  return t === 'european' ? 'whole_fund' : 'deal_by_deal';
}
export function toPublicWaterfallType(t: InternalWaterfallTemplate): WaterfallType {
  return t === 'whole_fund' ? 'european' : 'american';
}
```

Update ADR-064's no-round-trip contract test: the internal contract file still
never imports the public schema; the adapter is the single sanctioned bridge.

**Step 4:** `npm run check && npm test -- --project=server && npm run phoenix:truth`
(American truth cases must pass at their current live count — no regression).

**Step 5: Commit** `feat(waterfall): restore european/american discriminated union and calculators (from c9e5ece68)`

### Task W-C: Whole-fund truth cases (this IS re-scoped #1291)

Execute #1291's acceptance criteria verbatim minus the LPA conditionality:
`docs/waterfall-whole-fund.truth-cases.json` +
`tests/unit/truth-cases/waterfall-whole-fund.test.ts`, hand-computed expected
values in fixture comments, registered with `phoenix:truth`; W5/W10 pins;
no-hurdle/no-catch-up baselines for BOTH templates plus the conservation case;
quarterly grain via the `waterfall-tier-allocation` primitive; typed
per-template result rows; W4 scope guard test (`economics-v1.contract.ts`
untouched by this ticket); the P1b golden fixture from
`docs/plans/2026-05-08-gp-economics-extension-design.md` §6.7
(early-winner/later-loser: GP carry deferred until whole-fund ROC and pref are
satisfied). Blocked-by: W-B. Reviews: `waterfall-specialist`,
`phoenix-precision-guardian`.

### Task W-D: Restore the fund-config UI enum and European tier fields

**Files** (reverse-diff of removal commit `04e2175e`, adapted to today's
components): `WaterfallConfig.tsx` (-123 lines then), `WaterfallSummaryCard.tsx`
(-42), `useWaterfallCalculations.ts` (-68, SHAPE REFERENCE ONLY — its plain
numbers, `fundSize = 100`, `carryRate = 0.2` must not enter any calculation
path; previews call the shared Decimal calculators and convert at the display
boundary), `client/src/lib/waterfall.ts` (-100).

Enum control per design §7.2: `European (Whole Fund) | American (Deal by Deal)`,
defaulting to American per narrowed GR2-3. `DESIGN.md` governs: charcoal
`#292929` accent, never blue; `presson.*` tokens; v3.1.1 rubric; no emoji.
Trace actual app routing before editing (CLAUDE.md pre-action check — the spec
may name the wrong component). Blocked-by: W-B. Test: RTL component tests for
both enum branches; `npm test -- --project=client`.

### Task W-E: Reconcile `defaultWaterfall()` with the GR2-3 recorded default

**Files:** `shared/lib/economics/economics-engine.ts:262-283` + its tests.

Emit the ruled default (no hurdle: `hurdleRate` 0 / `prefType: 'none'` when the
fund supplies no preferred-return input; `clawbackEnabled: false`); where
clawback IS enabled on a fund, the trigger carries design invariant 11's
GP-profit-share-threshold form via the restored `ClawbackPolicySchema`, not a
hardcoded `'final_liquidation'`. MUST include a before/after engine-output
comparison on existing fixtures proving no served number changes for existing
funds (the engine hardcodes `clawbackPaid = 0`, so `clawbackEnabled` is
expected to be numerically inert — prove it, don't assert it). If any number
DOES change, stop and surface it before merging: that would contradict the
"truth-in-labeling" premise of this ticket. Blocked-by: W-B. Reviews: both
specialists; `parity-auditor` advisory.

### Task W-F: Widen the activation-lane contract (LAST; fence-sensitive)

**Files:** `shared/contracts/economics-v1.contract.ts:140`
(`WaterfallAssumptionsV1Schema.type`: `z.literal('american')` ->
`z.enum(['american', 'european'])`), consumers, contract tests.

This is the only trail ticket touching the lane CurrentForecastV2 serves. It
merges ONLY if #1298's first soak window has not opened; otherwise it converts
to a post-activation ticket carrying the §9 step-up scope (restatement plan +
soak repetition + G3 re-sign-off) explicitly in its body. Landing it pre-soak
is safe for activation evidence because zero funds hold `'european'` (W-A's
verification) — widening accepts a value nothing yet sends. Blocked-by: W-B,
W-C (truth cases first), W-E. Supersedes the W4 freeze via ADR-068; both
specialists review.

### Task W-G (follow-on, outside the trail): Multi-bracket carry (design §7.3 Tier 4b)

New work, not restore: tiered carry thresholds by LP return multiple (e.g. 25%
above 3.0x) in both calculators + truth cases. Not folded in — GR2-3's
simplified v1 assumption blesses single-rate 20% for now. File after W-C.

### Task W-H (registry only): the handoff §10 out-of-scope items

Filed as four separate tickets, never folded into this trail: (1) missing
`Called Capital Each Period` fee basis (design §5.3 vs
`EconomicsFeeBasisSchema`, `economics-v1.contract.ts:7`); (2) annual-vs-monthly
period resolution (changes fee amounts, not presentation); (3)
`Is Retroactive Catchup` absent from the fee profile (distinct from GP carry
catch-up); (4) Line of Credit (design §2.3 Beta vs 8 banned tokens — same
conflict class as the waterfall, own decision process; ADR-064 records the ban
as deliberate Tactyc-parity divergence, so it needs its own ruling, not a
free ride on ADR-068).

---

## 5. ADR plan (Definition-of-Done item 6)

**Number:** ADR-068, on the assumption ADR-066/067 (branch
`claude/roadmap-review-refinement-axvy6g`) merge first; per ruling D8's spirit,
renumber from the live `DECISIONS.md` tail at authoring time — never trust this
document's number.

**Title:** "Restore Dual Waterfall Support (European/Whole-Fund and
American/Deal-by-Deal) as a Pre-Activation Side Trail — Gate 0D Satisfied."

**Decision recorded:**

1. Per the managing partner's ruling (D1/D2), the platform supports both
   waterfall types as a user-selected per-fund enum; this ruling constitutes
   the business re-approval that Gate 0D (#1171, 2026-07-29 BLOCKED-EXTERNAL)
   required. LPA confirmation (#1285) no longer gates architecture; it selects
   the real fund's enum value and verifies its terms.
2. `'european'` leaves `FORBIDDEN_TOKENS` (9 -> 8) and the coercing
   `WaterfallTypeSchema` becomes an honest two-value enum — a narrow
   supersession of ADR-064's guard-preservation clause for that token only;
   the Line-of-Credit bans and the rest of ADR-064 (internal
   `whole_fund`/`deal_by_deal` vocabulary, no-round-trip rule, ADR-065's
   lane-scoped Float64 posture) stand, joined by the sanctioned boundary
   adapter.
3. GR2-3 is amended as narrowed in §3: American/deal-by-deal stays the v1
   default and the only activation-certified template (ADR-066 retained);
   the post-activation parking of whole-fund work is struck; #1291 un-parks
   re-scoped.
4. Sequencing: side trail before T9, hard merge-fence at T8 soak start,
   held-remainder rule with the §9 step-up made explicit (the cost asymmetry is
   the recorded rationale).
5. Defaults reconciliation: GR2-3 record wins for v1 default terms; design
   invariant 11 wins for clawback-trigger semantics when clawback is enabled.

ADR-004 receives a status addendum (its "EUROPEAN: Removed" row becomes
"Restored 2026-08 per ADR-068"); its canonical naming table is unchanged and is
the vocabulary this plan uses. This lands with Task W-A. Specialist sign-off
recorded in the PR per Phoenix protected-path rules.

---

## 6. Blocking dependencies against in-flight roadmap items (Definition-of-Done item 7)

| Dependency | Direction | Nature |
| --- | --- | --- |
| ADR-066/067 merge (branch `claude/roadmap-review-refinement-axvy6g`) | blocks W-A | ADR-068 amends ADR-066; merge before amending so the ledger reads in order. If that branch stalls, ADR-068 absorbs ADR-066's text and the branch is superseded — decide at W-A time. |
| #1298 (T8 soak) first window | fences W-A..W-F | The merge-fence in §1. Watch #1287/#1283 (soak target choice + preflight) as the early-warning signal that the fence is approaching. |
| #1291 | becomes Task W-C | Re-scoped per §3; its `blocked` label re-points from #1285 to the W-B PR. |
| #1285 | no longer blocks anything | Stays open, HITL, per-fund data question. |
| #1286 / merged #1303 (internal economics comparison workspace) | soft overlap with W-B/W-C | Same internal-economics surfaces; coordinate reviews, no ordering constraint. |
| ADR-064 no-round-trip contract test | touched by W-B | Updated, not weakened — the adapter is the single bridge. |
| #1294-#1299 (Waves I/J critical path) | NONE | By design. No restore ticket blocks or is blocked by them. |
| Specialist reviewers (`waterfall-specialist`, `phoenix-precision-guardian`) | every trail ticket | Phoenix protected-path requirement; single human bottleneck shared with the rest of the program — schedule reviews per-ticket, not batched at the end. |

---

## 7. Residual risks and open items

- **Fence risk:** if Wave H/I closes faster than the trail, W-F (and possibly
  W-D) miss the window and take the §9 step-up. Mitigation: trail order puts
  the fence-sensitive ticket last; the fence rule makes the fallback explicit
  rather than a scramble.
- **Reviewer bandwidth:** both specialists gate every trail ticket AND parts of
  the critical path. This is the trail's most likely schedule constraint.
- **Production data check:** "zero stored European values" is verified by
  script-reading and schema reasoning here; an actual staging/production query
  needs separate authorization (flagged in W-A).
- **`extended-fund-model.ts` consumer depth:** it consumes
  `waterfall-policy.ts` and compiled cleanly against the American-only literal;
  W-B budgets time for union-narrowing fallout there (`npm run check` will
  surface it).
- **Tracker mutations are drafted, not applied:** re-labeling #1291, the GR2-3
  amendment comment, and new W-G/W-H tickets all require user approval per the
  handoff's approval gate. The texts in §3-§5 are the drafts.

## 8. Definition-of-Done check (handoff §2)

1. Sequencing decision with rationale — §1. 2. #1291 disposition — §3.
3. #1285 disposition — §3. 4. GR2-3 disposition — §3. 5. Ticket decomposition —
§4. 6. ADR plan — §5. 7. Blocking dependencies — §6. Every repository claim
traces to a file/symbol/commit re-verified in this session (§0) or quoted from
the live tracker (#1171/#1285/#1291/#1299 read 2026-08-03).
