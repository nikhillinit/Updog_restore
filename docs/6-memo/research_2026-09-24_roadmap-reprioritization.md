# Research: Roadmap and Task Queue Reprioritization

**Date**: 24-09-2026 **Author**: Claude Code (TRIP-research), for owner review
**Status**: PROPOSED. Records no owner approval and grants no merge, runtime,
schema, provider, or production authority. **Evidence pin**: `origin/main` at
`f6ef7d5de` (#1576), CI Unified green.

## Summary

The tracked queue (reconciled program plan, September 12) no longer matches what
the repository executed. Its "Now" slot, capital-planning decision acceptance,
has had no source activity since #1505 (September 11) because its fixture,
oracle, and tolerance inputs are still owner-unset. Meanwhile 50 merged PRs
(#1510 to #1576) followed four untracked roadmaps. Production still serves
version 1.3.2 from July 30; 188 commits on `main` are not deployed. This memo
proposes one queue: ship what is built first, qualify the new write paths before
the release, close the remaining QA and workspace defects, and keep the Program
A and C gates unchanged.

## Questions Investigated

### Q1: Which September 12 queue rows are done, open, or stale?

**Finding**: No row has closure evidence in the repository or the tracker. The
"Now" row is starved, not in progress. The A rows (#1283, #1287, #1294 to #1299)
and C rows have had no activity after the September 12 tracker sync. The
deferred rows are unchanged. **Confidence**: High (live `gh` and `git` reads on
2026-09-24). **Evidence**: `gh issue list` shows every Program A, C, fee,
waterfall, and dependency issue last updated 2026-09-12. `git log` shows no
commit on `scripts/run-f115-capital-planning-e2e.mjs` or
`scripts/measure-f115-capital-plan-capacity.mjs` after #1505. The unmerged
capital-planning plan branch named in the reconciled plan is no longer on
`origin`.

### Q2: What work landed or opened outside the tracked queue?

**Finding**: Four untracked roadmaps drove September 13 to 24. Their state:

| Source (untracked unless noted)                                                               | Items                                                                                                                                             | State on `main`                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QA closure handoff, 2026-09-17 (three PRs plus an owner packet)                               | PR A server scope, PR B position value, PR C client reliability (C1 to C10)                                                                       | PR A landed as #1535 and #1536 (findings 1, 3, 4, 8, 10). PR B landed as #1537 (F-02). PR C has no branch or PR; none of C1 to C10 has complete closure evidence, and C3 is verified open (`ReallocationTab.tsx:25` hard-codes `currentVersion = 1` for preview and commit). |
| Semantic convergence spec and plan (tracked, #1541)                                           | Items 1 to 5 (P0 defects), item 6 production release, items 7 to 10 product work                                                                  | Items 1 to 5 landed (#1544, #1548, #1543, #1549, #1542). Item 6 not done. Items 7 to 10 not scoped.                                                                                                                                                                          |
| September 20 delivery handoff; its IDs are called SEP20-R01 to SEP20-R07 here                 | SEP20-R01 Node parity, R02 investment authorization, R03 round evidence, R07 Joi patch; R04 durability; R05 stale-write protection; R06 readiness | R01, R02, R03, R07 landed (#1555, #1557). R04 has characterization only (#1554). R05 draft CAS arrived with fund workspace Batch A and B; scenario routes still carry no `If-Match` contract. No repository plan records R04 to R06 disposition.                             |
| Stabilize-and-qualify engineering review, 2026-09-23 (PR1, D13, PR2, PR3a, PR3b)              | PR1 heavy-PR test lanes, D13 real-store fixtures, PR2 workspace journey qualification, PR3a canary residue contract v2, PR3b receipt uniqueness   | PR1 landed (#1570). D13 landed (#1571). PR3a is partial: #1558 reserves the HTTP workflow vector in `canary-residue-service.ts`, but the versioned characterization and release evidence consumers are missing. PR2 not started. PR3b waits on owner decision D11.           |
| Fund workspace (Batch A #1558, Batch B #1562, follow-ups #1564, #1567 to #1569, #1572, #1576) | Durable fund workflow commands (migration 0060), client transport, workspace, draft settlement (F_1.15.0), bootstrap save (F_1.15.1)              | Landed. Open: Batch C (visual verdict, keyboard and zoom, real-backend journey, acceptance record), duplicate autosave after a fast bootstrap save (`TODOS.md`), missing-draft dialog dead end and dead hydration fetch (`CR_w10_draft-recovery-fence.md`, Minor 1).         |

**Confidence**: High for landed items (merge commits and PR bodies). Medium for
"not started" (spot checks and absent branches, not exhaustive audits).

### Q3: What blocks the release, and how large is the gap?

**Finding**: 188 commits separate `068430726` (production, version 1.3.2,
released 2026-07-30) from `main` (version 1.6.0). The last `release-production`
dispatch (2026-08-07) failed in "Clean Production Schema Audit" with "Production
schema audit found drift; deployment promotion is blocked." One
`prod-schema-reconcile` run succeeded on 2026-08-18; no release was dispatched
after it. The September 16 QA audit still found the journal-0027 table absent in
production, and the journal has since grown to entry 60
(`0060_fund_workflow_commands`). Run `32196991205` (August 18) applied 0050
to 0053. The plausible unverified gap is 0027 plus 0054 to 0060.
`prod-schema-reconcile.yml` exposes apply modes only through 0057, so 0058 to
0060 have no production apply route yet. **Confidence**: High for the gap and
the failure. Medium for the current production schema contents (inferred from
the September 16 audit, not probed today). **Evidence**: `/api/version` on the
production alias returns version 1.3.2;
`gh run list --workflow release-production.yml`; failed-run log; journal tail.

Two further release checks:

1. Canary residue. `release-production.yml` runs
   `tests/smoke/release-canaries.spec.ts` (line 988), which drives
   `POST /api/funds`, `PUT /api/funds/:id/draft` and `POST /api/funds/finalize`.
   #1558 reserves that HTTP vector (44 total, 5 fund events, 5 receipts) in
   `server/services/canary-residue-service.ts`. The aggregate cap check in
   `scripts/release/assert-canary-residue.mjs` can pass under the intended
   three-times-v1 caps, but the policy-measurement schema in
   `shared/contracts/release-evidence-fragment-v1.contract.ts` requires measured
   residue to equal the frozen v1 vector and rejects 44/5/5. PR3a is therefore a
   release blocker.
2. Runtime version. Production reports Node `v20.20.2`; `package.json` pins
   `22.x` and `22.23.2`. Confirm the Vercel project Node setting before a
   dispatch.

### Q4: What order is right for an internal tool with about five users?

**Finding**: Value reaches users only through a release, so the release path is
the priority. The new write paths (finalize, draft save, two-session edit) have
three critical test gaps recorded by the September 23 review. Close those gaps
(PR2) before the release, not after it. Keep capital-planning acceptance ready
to run as soon as the owner sets its inputs; do not hold an implementation slot
empty for it. **Confidence**: Medium. It is a judgment on priority; the gates
themselves are unchanged.

## Key Findings

1. **The documented "Now" slot is empty.** It waits on owner-unset inputs; the
   executed lane was correctness, workspace, and CI work that the tracked queue
   does not list.
2. **Nothing built since July 30 is deployed.** The release is blocked by schema
   drift. The plausible gap is 0027 plus 0054 to 0060, and 0058 to 0060 have no
   production apply route.
3. **The plan ID F_1.15.0 now has two meanings.** The reconciled plan uses it
   for capital-planning acceptance; `docs/1-plans/F_1.15.0_*` is fund draft
   command settlement (closed by #1574). The capital-planning plan documents
   were never merged.
4. **Three unrelated "R0x" series exist**: the September 12 review disposition
   (tracked), the September 20 delivery handoff (untracked, called SEP20-Rxx
   here), and a set of reference reports. Cite them with their series name.
5. **The open-PR queue is empty apart from Dependabot** (seven PRs, including
   two dependency groups and an ESLint 10 major). There is no in-flight product
   work to protect.

## Recommendations

- **Recommended**: adopt the queue below as a September 24 amendment to the
  reconciled program plan. It keeps every existing gate and changes only
  resource order.

| Order                 | Work                                                                                                                                                                                                                                                                     | Who acts                                                    | Exit                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1                     | Stabilize PR3a: versioned canary residue characterization and evidence consumers. #1558 already reserves the HTTP workflow vector (44 total, 5 fund events, 5 receipts), but the release evidence contract still requires measured residue to equal the frozen v1 vector | Agent implements; owner merges                              | Release evidence consumers accept the HTTP lifecycle vector                       |
| 2                     | Release rehearsal in parallel, read-only and non-production: exact missing-object and ledger vectors against the journal, schema audit against a disposable copy, Vercel Node setting                                                                                    | Agent prepares; owner approves any provider access          | Owner packet listing each gap and whether an admitted apply route exists          |
| 3                     | Stabilize PR2: fund workspace journey qualification on the real backend and the built `makeApp` runtime (lost finalize response, stale-ETag 412, double submit)                                                                                                          | Agent implements; owner merges                              | Both runtimes green on the exact candidate; a failing case fails `CI Gate Status` |
| 4                     | Production apply capability only for gaps without an admitted route: `prod-schema-reconcile` modes stop at 0057, so 0058 to 0060 need governed modes if the rehearsal shows them missing                                                                                 | Agent implements; owner merges                              | Bounded, rehearsed apply mode per missing migration                               |
| 5                     | Owner-authorized bounded schema dispatches with fresh backup or restore evidence, then a fresh post-apply audit and immutable candidate certification                                                                                                                    | Owner dispatches; agent verifies                            | Clean schema audit on the certified candidate                                     |
| 6                     | Separate owner-authorized `release-production` dispatch of the certified candidate                                                                                                                                                                                       | Owner only                                                  | Production `/api/version` reports the candidate; post-promotion smoke green       |
| 7                     | QA closure PR C (client reliability items C1 to C10, `TODOS.md`); the `ReallocationTab` version item first because a hard-coded version defeats optimistic locking                                                                                                       | Agent implements; owner merges                              | Items present with tests; `npm run build:web` green                               |
| 8                     | Fund workspace defects: duplicate autosave after a fast bootstrap save, missing-draft dialog dead end and dead hydration fetch, Batch C acceptance                                                                                                                       | Agent implements; owner signs the visual verdict            | One PUT per settled save; dialog recovers; Batch C acceptance record              |
| Owner-gated, parallel | Capital-planning acceptance (five-row, two-session scorecard using the existing `f115` scripts)                                                                                                                                                                          | Workspace owner sets fixture, oracle, tolerance; agent runs | Unchanged from the September 12 amendment                                         |
| Read-only lane        | Program A Task 7 Steps 1 to 1b (#1283, #1287) and C specification decisions                                                                                                                                                                                              | Unchanged                                                   | Unchanged                                                                         |
| Next product          | Semantic convergence items 7 to 10, reconciled against C1 to C3 first (item 9 overlaps C1 and C2; item 10 overlaps C3c)                                                                                                                                                  | Owner selects                                               | One merged scope, not two parallel programs                                       |
| Conditional           | SEP20-R04 recalculation durability and SEP20-R05 scenario CAS: proposed externally, no repository plan; plan only when a defect or release need is shown                                                                                                                 | Owner decides                                               | A reviewed plan, or recorded deferral                                             |
| Maintenance           | Dependabot triage (#1565, #1556 first; #1446 ESLint 10 is a major migration); #1373; #1375 to #1379 stay deferred                                                                                                                                                        | Agent triages; owner merges                                 | Outside any frozen candidate                                                      |
| Deferred              | Fee and economics (F_1.3.0), waterfall (F_1.4.0), cookie sessions, evidence drawer consolidation, substrate T14 and the reserve assembler                                                                                                                                | Unchanged                                                   | Unchanged                                                                         |

- **Rationale**: the release evidence contract rejects the HTTP canary vector
  today, so PR3a is a repository-provable release blocker and goes first. Items
  2 to 6 move already-built work to users, with schema mutation and release
  dispatch kept as separate owner actions under the governing policy. Items 7
  and 8 are small, known defects on surfaces users touch. None of it widens
  scope or adds a mechanism.
- **Alternatives considered**: (a) keep the September 12 order: rejected because
  its "Now" slot cannot start without owner inputs; (b) release first, qualify
  later: rejected because the three critical gaps are on new write paths that
  create funds; (c) promote SEP20-R04 durability now: rejected until a defect or
  release need is shown, because Batch A already made fund creation and draft
  save durable.

## Open Questions

- **Owner**: reassign a plan ID for capital-planning acceptance, since F_1.15.0
  is taken. This memo mints no ID.
- **Owner**: set the capital-planning fixture, oracle, tolerance, and scoring
  inputs, or park the acceptance explicitly.
- **Owner**: answer D11 (which receipt-uniqueness invariant) to unblock PR3b.
- **Owner**: QA packet items still open: LP portal delete or rebuild,
  `ReallocationTab` keep or delete, null or zero ownership policy, real-Postgres
  two-organization RLS tests.
- **Owner**: Program A needs four qualifying seven-day windows. For about five
  internal users, confirm that this gate is still wanted as written. This memo
  does not propose a change.
- **Verify in rehearsal**: the exact production missing-object vector; 0027 and
  0054 to 0060 are inferred, not probed.

## Next Steps

- [ ] Owner reviews this memo and the September 24 amendment.
- [ ] Item 1 PR3a and item 2 release rehearsal, in parallel.
- [ ] Item 3 PR2 on a branch cut from `origin/main`.
- [ ] Owner answers the open questions above.

## Appendix

### Cross-check

An independent Codex fact-check (2026-09-24) confirmed the premise and supplied
three corrections now in this memo: PR3a is partly implemented and blocks at the
evidence contract, not at the aggregate cap; 0050 to 0053 were applied on August
18 and 0058 to 0060 have no production apply mode; schema dispatch and release
dispatch are separate owner actions. It also moved PR3a ahead of PR2 and made
the rehearsal parallel. Its live tracker and production reads failed on
authentication, so those claims rest on this session's `gh` and HTTP reads.

### References

- `docs/superpowers/plans/2026-09-03-updog-reconciled-program-plan.md`
- `docs/superpowers/specs/2026-09-17-semantic-convergence.md`
- `docs/superpowers/plans/2026-09-17-semantic-convergence-p0.md`
- `docs/3-code-review/CR_w10_draft-recovery-fence.md`
- `TODOS.md` ("Duplicate autosave after a fast direct bootstrap save")
- `.github/workflows/release-production.yml`
