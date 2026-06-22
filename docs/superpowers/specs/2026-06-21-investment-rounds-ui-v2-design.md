# Investment-Rounds UI (v2 look, live data) + Flag Enablement — Design

- Status: DRAFT (awaiting user approval)
- Date: 2026-06-21
- Branch: `docs/investment-rounds-ui-v2-spec`
- Feature flag: `enable_investment_rounds` (OFF in registry)
- ADR: `docs/adr/ADR-023-investment-event-persistence.md`
- Backend: landed in PRs #891/#892 (table, contract, service, routes, flag)

## 1. Goal

The investment-round persistence backbone (ADR-023 L3b) is fully landed on the
prod surface (`server/app.ts:215` mounts the investments router on `makeApp`).
Two deferred follow-ups remain:

- **A — Live UI:** wire the existing round dialog to the real API and mount a
  rounds surface on a live route behind `enable_investment_rounds`. Today the
  dialog's save is `// TODO: persist new round via API` and its only consumer
  (`add-event-dropdown.tsx`) is mounted on no live route.
- **B — Flag enablement:** after A soaks, ramp `enable_investment_rounds`
  OFF → ON (dev → staging → prod) with soak evidence and a rollback.

## 2. Decisions (from brainstorming)

| # | Question | Decision |
|---|----------|----------|
| 1 | Host surface | **Live company page** `/portfolio/company/:id` (`PortfolioCompanySummaryPage`), styled with the **presson-v2 visual vocabulary** on **real data** |
| 2 | Rounds list in v1 | **Read + write** (list + add) |
| 3 | Supersede UI in v1 | **Yes** — expose supersede/correct |
| 4 | company→investment resolution | **auto-select when 1 · picker when many · disable+message when 0** |
| 5 | Trajectory ribbon | **Include** a data-driven version in v1 |
| 6 | Dialog styling | **Full pv2 restyle** of the dialog internals |

### Why not the literal v2 route

`/v2/portfolio` and `/v2/companies/:id` are routed but are **pure design
reference screens**: hardcoded `companies` mock, string-slug ids
(`'digitalwave'`), `AppShell` chrome, **no `FundContext`, no real data, no
numeric ids**. The round API needs a numeric `investmentId`, numeric `fundId`,
and fund-scoped auth. Part B requires a **prod ramp with soak evidence**, which a
mock screen cannot satisfy, and wiring a write-API into a mock route contradicts
this repo's own governance (#888 "require live provenance", #889 "stop depending
on mock-only routes"). Resolution: keep the live, fund-scoped company page as the
host and bring the **v2 aesthetic** (primitives + CSS vocabulary) to it on real
data. The v2 routes stay untouched design references.

## 3. Architecture

```
PortfolioCompanySummaryPage (/portfolio/company/:id)   [existing, live, fund-scoped]
  └─ <InvestmentRoundsSection>            [NEW] flag-gated (useFlag enable_investment_rounds)
       ├─ useCompanyInvestments(fundId, companyId)   [NEW hook]  -> bridge company→investment
       ├─ investment resolver (0 / 1 / many)         [in-section logic]
       ├─ useInvestmentRounds(investmentId)          [NEW hook]  -> GET .../rounds
       ├─ <TrajectoryRibbon rounds=...>              [NEW] data-driven pv2 ribbon
       ├─ <RoundsTable rounds=...>                   [NEW] pv2-styled list + per-row supersede
       └─ <RoundDialog>                              [REWORK of new-round-dialog.tsx]
            ├─ toInvestmentRoundCreatePayload(form, fundId)   [existing serializer]
            └─ useCreateRound(investmentId)                   [existing hook]
```

Reuse pv2 **primitives** (`Btn`, `ChartCard`, `Tag`, `KpiBand`) and `pv2-*` CSS —
**not** `AppShell` (it carries the v2 sidebar/command palette). The section is an
opt-in panel appended below the existing summary cards; existing page sections are
untouched.

## 4. Components & data flow

### 4.1 `useCompanyInvestments(fundId, companyId)` (NEW)
- `GET /api/investments?fundId={fundId}` (existing, fund-scoped, prod-mounted),
  then filter client-side by `companyId`.
- Returns `{ investments: Investment[], isLoading, error }`.
- Query key `['company-investments', fundId, companyId]`, `enabled` when both set,
  `staleTime: 60_000` (mirrors `usePortfolioCompany`).
- Rationale: no per-company investments endpoint exists; v1 filters the fund list.
  Acceptable for v1 volumes; a server-side `?companyId=` filter is a noted
  follow-on if lists grow large.

### 4.2 Investment resolver (in `InvestmentRoundsSection`)
- **0 investments** → panel renders an empty state: "No investment is recorded
  for this company yet, so there is nothing to attach a round to." Add disabled.
- **1** → auto-select that `investmentId`.
- **many** → a pv2-styled investment picker (label: `round · amount · date`);
  selection drives the rounds list + dialog target.

### 4.3 `useInvestmentRounds(investmentId)` (NEW)
- `GET /api/investments/{investmentId}/rounds` → `InvestmentRoundListResponse`.
- **Query key `investmentRoundsQueryKey(investmentId)`** (the existing
  `['investment-rounds', investmentId]` that `useCreateRound` already
  invalidates) — create/supersede auto-refresh the list.
- `enabled` only when an `investmentId` is resolved.
- **Verified server behavior (`investment-round-service.ts:194-215`):** the list
  returns **current rounds only** — superseded rounds are filtered out
  server-side via `notExists(superseding_rounds.supersedesRoundId = id)` — and is
  ordered `createdAt DESC`. The UI therefore never receives a superseded round.
  Consumers that need chronological order (the ribbon) must re-sort by
  `roundDate` themselves; never rely on list order.

### 4.4 `<TrajectoryRibbon rounds>` (NEW, data-driven)
- Models the v2 dossier "Capital trajectory" ribbon (`pages/v2/company.tsx`),
  made data-driven.
- One node per round, ordered by `roundDate` asc. Node x-position is proportional
  to `roundDate` across the min→max date span; **fallback to equal index spacing**
  when all dates are equal or there is a single round.
- Node label: `roundName`, `roundDate`, `investmentAmount` (formatted), optional
  `preMoneyValuation`.
- Only **current** rounds are plotted (the list endpoint already excludes
  superseded rounds — see 4.3), so there are no "superseded"/dashed nodes. A
  current round that is itself a correction (`supersedesRoundId != null`) may be
  marked subtly (e.g. a small "corrected" caption); no separate projected-node
  concept exists in the data. Node size is uniform (position encodes date only —
  no amount encoding, to avoid implying an unsupported visual claim).
- SVG is static (no entrance motion); honors reduced-motion by construction. Uses
  `presson.color.*` tokens (no blue), `tabular-nums` on numeric labels.
- Renders only when ≥1 round exists; otherwise the empty state covers it.

### 4.5 `<RoundsTable rounds>` (NEW, pv2 list)
- pv2 `ChartCard`-style panel, mono uppercase header, `tabular-nums` columns:
  Round · Security (`Tag`) · Date · Investment · Round size · Pre-money.
- All listed rounds are current (the endpoint excludes superseded — see 4.3), so
  there is **no `superseded` status**. A row whose `supersedesRoundId != null`
  renders a subtle **`corrected`** `Tag` (it replaced an earlier round). That is
  the only status derivable from this endpoint; full supersede *history* is not
  available from the list and is out of scope.
- Every row gets a **"Correct / supersede"** `Btn` (ghost) that opens the dialog
  pre-seeded with `supersedesRoundId = row.id` (all listed rounds are current and
  therefore supersede-able).
- Header "Add round" `Btn primary` opens the dialog with no supersede target.

### 4.6 `<RoundDialog>` — rework of `new-round-dialog.tsx` (full pv2 restyle)
Mechanics stay on Radix `Dialog` (shadcn) for accessibility (focus trap, ESC,
overlay, keyboard parity — required by the v3.1.1 rubric); **internals are
rebuilt with pv2 vocabulary** (mono labels, charcoal primary `Btn`, token-based
form controls). This reconciles "full pv2 restyle" with the rubric.

**Form → contract mapping** (via existing `toInvestmentRoundCreatePayload`):

| Form field | Control | Contract field | Notes |
|------------|---------|----------------|-------|
| Security type | select (Equity/Convertible Note/SAFE/Warrant/Other) | `securityType` | serializer maps label → wire enum |
| Round name | text | `roundName` | 1–120 chars |
| **Round date** | **`type="date"`** | `roundDate` | YYYY-MM-DD; replaces the `Jun-2024` free-text `month` |
| Currency | select (USD/EUR/GBP/CAD) | `currency` | serializer maps label → ISO |
| Investment amount | number text | `investmentAmount` | serializer → DecimalString |
| Round size | number text | `roundSize` | optional |
| Pre-money valuation | number text | `preMoneyValuation` | optional |
| `fundId` | — | `fundId` | injected by serializer from page `fundId` |
| `supersedesRoundId` | — (set by Correct action) | `supersedesRoundId` | optional |

**Dropped from the dialog** (backend `.strict()` rejects them, and they fail the
trust guardrail "no unsupported claims on material numbers"):
- Graduation Rate
- Advanced Share Data (share price / shares purchased / owned / issued / FD)
- Client-computed "Post-Money / Ownership" display block (derived, unsourced)

**DESIGN.md compliance:** remove `povc-bg-primary hover:bg-blue-700`,
`text-blue-600`, `bg-yellow-50` etc. → charcoal accent + tokens. Accent is
charcoal, never blue.

**Save flow:** `handleSave` builds `InvestmentRoundEditForm` →
`toInvestmentRoundCreatePayload(form, fundId)` → `useCreateRound(investmentId)`.
`useCreateRound` already sends `Content-Type: application/json` + a fresh
`Idempotency-Key` (`crypto.randomUUID()`), so 415/428 are avoided by construction.
On success: close dialog, success toast, list + ribbon refresh via query
invalidation.

### 4.7 New pv2 form-control CSS
`presson-v2.css` has no input/select/field classes (only `pv2-cmdk-input`,
`pv2-slider-input`). Add a small, token-based set — `pv2-field`, `pv2-label`,
`pv2-input`, `pv2-select` — using `var(--pv2-*)` tokens, charcoal focus ring, and
no entrance motion (or gated under `prefers-reduced-motion: no-preference`). Keep
it minimal; these are reused by the dialog and the investment picker.

## 5. Error / status handling (truthful states)

`apiRequest` throws `ApiError` with `.status`. A `roundErrorMessage(status, body)`
mapper drives inline dialog errors and toasts:

| Status | Server body | User message |
|--------|-------------|--------------|
| 201 | created | success; close + refresh |
| 200 | replayed (idempotency) | treat as success; refresh |
| 400 | validation / `fundId mismatch` | "Check the highlighted fields." (inline) |
| 400 | `supersede_target_other_investment` | "That round belongs to a different investment." |
| 401 | no authenticated user (`enforceProvidedFundScope`) | "Your session expired. Sign in and retry." |
| 403 | fund-scope denied (`enforceProvidedFundScope`) | "You don't have access to this fund." |
| 404 | investment / `supersede_target_missing` | "That investment or round no longer exists. Refresh and retry." |
| 409 | `idempotency_key_reused` | "This looks like a duplicate submission. Refresh and retry." |
| 409 | `round_already_superseded` | "This round was already superseded. Refresh to see the latest." |
| 428 | precondition_required | defensive generic error (should not occur; key always sent) |
| 5xx | — | "Something went wrong saving the round. Try again." |

Errors never silently swallow: the dialog stays open on failure with the mapped
message; the mutation's `error` is the single source.

The route's `400 invalid_investment_fund_scope` (investment with a NULL `fundId`)
is **unreachable via this UI**: the resolver only ever selects from
`GET /api/investments?fundId=X`, which `storage.getInvestments(fundId)` filters to
`fundId === X`, so NULL-fund investments are never offered. No UI handling needed;
documented here so the mapper's default-case covers it defensively.

## 6. Supersede flow (v1)

1. User clicks "Correct / supersede" on a round row (all listed rounds are
   current, so all are supersede-able).
2. Dialog opens with a banner "Correcting {roundName} ({roundDate})" and
   `supersedesRoundId` set to that row's id; the user enters the corrected values.
3. Submit posts to the same `POST .../rounds` with `supersedesRoundId`.
4. On 201: list + ribbon refetch. Because the list excludes superseded rounds, the
   **original row drops out** and the new (corrected) row appears in its place,
   carrying the `corrected` tag (`supersedesRoundId != null`). There is no "both
   rows shown" state.
5. 409 `round_already_superseded` (someone already corrected it) / 404
   `supersede_target_missing` surface the mapped messages above (append-only
   model; no destructive edit). After a 409, a refetch will already show the
   newer correction.

## 7. Design & trust compliance

- **DESIGN.md:** charcoal accent only; JetBrains-mono data labels; `tabular-nums`
  on every numeric column; 8px spacing grid; restrained motion; **reduced-motion
  mandatory** on any new CSS (the file is flagged legacy-drift for missing
  `@media` — new classes must not regress it).
- **v3.1.1 acceptance rubric:** truth-first (no derived/unsourced numbers — hence
  the dropped calc block), place-preserving drill-down (dialog returns to the
  page), keyboard parity (Radix dialog), purposeful motion, no hidden financial
  side effects (explicit Save; Cancel is safe).

## 8. Testing strategy

Client (jsdom, Vitest + RTL):
- Serializer is already covered (`investment-round-edit-model`). Add tests for the
  **form → `InvestmentRoundEditForm`** assembly (date passthrough, dropped fields
  absent, currency/security label mapping).
- `useCompanyInvestments` filters by `companyId`; `useInvestmentRounds` hits the
  right key and is invalidated by create.
- `InvestmentRoundsSection`: 0/1/many resolver branches; flag OFF renders nothing;
  flag ON renders the panel.
- `RoundsTable`: `corrected` tag shows iff `supersedesRoundId != null`; no
  `superseded` state is ever rendered (list is current-only).
- `RoundDialog`: maps each status (incl. 401/403/404/409×2/428) to the right
  message; success closes + refreshes; supersede pre-seeds `supersedesRoundId`.
- `TrajectoryRibbon`: node count = current-round count; re-sorts by `roundDate`
  (not list order); equal-spacing fallback for single/identical dates.

Integration (real Postgres, gated):
- The backend create/list/supersede path is covered by existing L3b int tests; the
  UI work is client-only and adds no new server route. **Any new
  `tests/integration/*` that builds the schema via drizzle-kit push MUST call
  `applyInvestmentRoundConstraints` after push** (UNIQUE(id,fund_id) precondition).
- Local box is Node 24 (outside engine range): trust CI for the suite. Dispatch
  the full suite on the branch: `gh workflow run ci-unified.yml --ref <branch>
  -f run_full_suite=true`.

## 9. Part B — flag enablement & ramp

`enable_investment_rounds` (registry, `exposeToClient: true`, gates UI at mount;
the API does not check the flag — flipping it only shows/hides the UI).

**The flag is NOT a security control.** The rounds API (`server/app.ts:215` on
`makeApp`) is already live and writable in prod since #891/#892, gated only by the
global `/api` auth + `enforceProvidedFundScope`. Ramping the flag exposes the *UI*;
it does not change API exposure. **Rollback = flag OFF hides the UI only** — it
does not disable the API and does not delete rounds already written.

**Hard precondition for a usable prod ramp:** there is no live "create investment"
UI; `investments` rows exist only via seed scripts and
`server/services/demo-profile-import-service.ts`. If target companies have no
investment rows, the panel shows the 0-investment empty state and nothing can be
created. **Do not ramp to prod until real investments exist for the target fund's
companies** (confirm via the imported/seeded data).

| Stage | Action | Gate / soak evidence | Rollback |
|-------|--------|----------------------|----------|
| dev | registry `development: true`; `npm run flags:generate` | A merged + CI green; manual create/list/**supersede** smoke in dev | set `development: false` |
| staging | `staging: true` | dev soak clean; verify writes vs real Postgres, fund-scope holds, no 5xx in logs over the soak window | `staging: false` |
| prod | `production: true` (registry) + redeploy | staging soak evidence: rounds created + visible, no error-rate regression, fund-scope verified | flag OFF + redeploy (hides UI; API stays harmlessly mounted) |

Each ramp is its own small PR. Soak windows and exact durations are confirmed with
the user at ramp time; this spec fixes the **order and the gates**, not calendar
dates.

## 10. Out of scope (YAGNI)

- Editing a round in place (model is append-only + supersede).
- The `/cases` endpoint (still 501) and performance-case UI.
- Server-side `?companyId=` investments filter (client filter for v1).
- Promoting `/v2/*` routes to real data.
- Graduation-rate / share-cap-table capture (deferred fields).
- Restyling the rest of `PortfolioCompanySummaryPage` to pv2 (only the new
  section adopts the v2 look).

## 11. File inventory

**New**
- `client/src/hooks/useCompanyInvestments.ts`
- `client/src/hooks/useInvestmentRounds.ts`
- `client/src/components/investments/investment-rounds-section.tsx`
- `client/src/components/investments/rounds-table.tsx`
- `client/src/components/investments/trajectory-ribbon.tsx`
- pv2 form-control rules appended to `client/src/styles/presson-v2.css`
- Tests alongside each (`*.test.ts[x]`)

**Modified**
- `client/src/components/investments/new-round-dialog.tsx` (rewire + pv2 restyle +
  field changes + charcoal)
- `client/src/pages/portfolio-company-summary.tsx` (flag-gated mount of the
  section; replace the "rounds remain outside the live path" copy when ON)
- `flags/registry.yaml` (Part B ramps) + regenerated flag artifacts

**Untouched**
- `add-event-dropdown.tsx` (orphaned; not on the v1 path — left as-is unless we
  later host the broader event menu)
- Server routes/contract/service (already landed)

## 12. Risks

- **Investment-existence precondition (highest risk):** company-centric product;
  no live create-investment UI; `investments` populated only by seed/demo-import.
  The 0-investment empty state is the **common** case, not an error, and it gates
  the prod ramp (see 9). If the conclusion is "investments rarely exist," revisit
  whether rounds should attach to a different entity before investing further.
- **Idempotency-Key semantics (P2):** `useCreateRound` mints
  `crypto.randomUUID()` inside `mutationFn`, so a user's manual re-submit of the
  "same" round gets a new key and is **not** deduped (only an in-flight re-fire of
  one mutation call is). `useMutation` default `retry` is 0, so no silent retry
  duplication. If duplicate-on-retry matters, mint the key once per dialog submit
  (state/`useRef`) and pass it in. Left as-is for v1; flagged for the plan.
- **Dialog prop contract change:** `new-round-dialog` currently takes
  `investment?: { id: string; company: string }`. The rework must pass a numeric
  `investmentId` and numeric `fundId` (the serializer/route require numerics);
  make the new prop shape explicit when implementing.
- **Date/timezone:** `type="date"` yields `YYYY-MM-DD` (matches the contract); the
  table/ribbon must parse and format with `timeZone: 'UTC'` (as the host page's
  `formatDate` already does) to avoid off-by-one day shifts.
- **Visual cohesion:** a pv2 panel inside an otherwise-shadcn page. Mitigated by
  scoping the v2 look to a clearly-bounded section; a `/plan-design-review` /
  `/design-review` pass is recommended before the flag ramps.
- **pv2 CSS drift:** new form-control classes must add reduced-motion/responsive,
  not inherit the file's legacy gaps.

## 13. Execution

Per the workflow contract: Claude plans/verifies; every code + test edit is
dispatched via Hermes (`node orchestrate.js --phase production --task "..."`),
each diff reviewed before commit, `npm run check` per batch, full-suite CI on the
branch. Implementation is sequenced in the companion plan
(`superpowers:writing-plans`).

## 14. Evaluation log

External adversarial review was requested via Hermes/codex but the local AI
toolchain was down: the Hermes claude lane is out of API credits; the codex CLI
(`0.118.0`) is too old for the only model its ChatGPT account can use (`gpt-5.5`),
and every fallback model is "not supported with a ChatGPT account"; kimi crashes
on a Windows charmap encoding bug. So this spec was hardened by a code-grounded
self-red-team against the same checklist. Corrections applied:

- **P0** Supersede model corrected: `listRoundsForInvestment`
  (`investment-round-service.ts:194-215`) excludes superseded rounds and orders
  `createdAt DESC`. Removed all "superseded Tag / dashed node" logic; the only
  derivable badge is `corrected` (`supersedesRoundId != null`); after a supersede
  the old row drops out. (§4.3, §4.4, §4.5, §6, §8)
- **P1** Error map gained `401`; documented `400 invalid_investment_fund_scope`
  as unreachable via the resolver. (§5)
- **P1** Flag is UI-only; API already live/writable since #891/#892; rollback is
  UI-only and non-destructive. (§9)
- **P1** Investment-existence precondition (no live create-investment UI) made a
  hard prod-ramp gate and top risk. (§9, §12)
- **P2** Ribbon must self-sort by `roundDate`; idempotency-key per-attempt
  semantics; dialog numeric-prop contract change; UTC date formatting. (§4.4, §12)

### Precondition verification (investments existence)

Verified at the code layer (prod DB not reachable from this host — `vercel env
pull` is blocked):
- `server/services/demo-profile-import-service.ts` (the real ingestion path) has a
  first-class `investments` section: it validates each investment references a real
  company (`assertReferencesResolvable`, ~L369-380) and inserts one per company
  (`store.insertInvestment(fundId, row, companyId)`, ~L751-762).
- `scripts/seed-db.ts` likewise creates investments linked to companies (L81-113).

Conclusion: investments are a supported, populated entity — the feature is **not**
architecturally dead. The residual is data-dependent (does a given prod fund's
import bundle include investments?) and can only be confirmed against the live DB
at ramp time. That confirmation is already a hard gate in §9; no architecture
change needed.

Open follow-up: re-run an external codex review once the CLI is upgraded
(`npm install -g @openai/codex@latest`) or Hermes credits are restored.
