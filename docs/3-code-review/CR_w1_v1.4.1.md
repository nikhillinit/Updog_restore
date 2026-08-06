# Code Review: WS1 Surface Contract Matrix (F_1.2.0 Child Plan A)

**Review Date**: 2026-08-05  
**Version**: 1.4.1  
**Files Reviewed**:

- `.clinerules/caveman.md`
- `.cursor/rules/caveman.mdc`
- `.github/path-filters.yml`
- `.github/workflows/ci-unified.yml`
- `.gitignore`
- `.opencode/AGENTS.md`
- `.windsurf/rules/caveman.md`
- `audit/surface-contract-matrix/MATRIX.md`
- `audit/surface-contract-matrix/README.md`
- `audit/surface-contract-matrix/auth-overrides.json`
- `audit/surface-contract-matrix/boot-proofs.json`
- `audit/surface-contract-matrix/condition-overrides.json`
- `audit/surface-contract-matrix/definition-overrides.json`
- `audit/surface-contract-matrix/dormant-candidates.json`
- `audit/surface-contract-matrix/dormant-inventory.json`
- `audit/surface-contract-matrix/listener-dispositions.json`
- `audit/surface-contract-matrix/matrix-schema.mjs`
- `audit/surface-contract-matrix/matrix.json`
- `audit/surface-contract-matrix/orphans.json`
- `audit/surface-contract-matrix/requirements.json`
- `audit/surface-contract-matrix/runtime-exclusions.json`
- `audit/surface-contract-matrix/scripts/approve-matrix.mjs`
- `audit/surface-contract-matrix/scripts/boot-proof.mjs`
- `audit/surface-contract-matrix/scripts/classify-pass.mjs`
- `audit/surface-contract-matrix/scripts/inspect-runtime.mjs`
- `audit/surface-contract-matrix/scripts/render-matrix.mjs`
- `audit/surface-contract-matrix/scripts/seed-matrix.mjs`
- `audit/surface-contract-matrix/scripts/validate-matrix.mjs`
- `audit/surface-contract-matrix/source-inventory.json`
- `docs/1-plans/F_1.2.0_v1.4-release-proof-activation.plan.md`
- `docs/1-plans/F_1.2.1_ws1-surface-contract-matrix.plan.md`
- `docs/ARCHI.md`
- `docs/_generated/router-index.json`
- `docs/_generated/staleness-report.md`
- `tests/unit/audit/surface-contract-matrix-auth.test.ts`
- `tests/unit/audit/surface-contract-matrix-inspector.test.ts`
- `tests/unit/audit/surface-contract-matrix-listeners.test.ts`
- `tests/unit/audit/surface-contract-matrix-merge-discovery.test.ts`
- `tests/unit/audit/surface-contract-matrix.test.ts`

**Plan**: `docs/1-plans/F_1.2.1_ws1-surface-contract-matrix.plan.md`

---

## Executive Summary

Change introduces a tracked, machine-validated surface contract matrix covering
API routes, client routes, workers, schedulers, listeners, WebSockets,
deployment exposures, authorization, boot proof, test evidence, and G1 approval
lifecycle. Iterative review found correctness defects across discovery,
classification, topology, validation, and reseeding; all blocking findings were
addressed and verified.

APPROVED

---

## Changes Overview

Implementation adds matrix schemas, generated artifacts, discovery and
classification tooling, deterministic rendering, approval mutation workflow,
boot probes, source-inventory hashing, and CI validation. It also adds audit
fixtures covering route-stack inspection, listener discovery, authorization
extraction, approval integrity, merge lifecycle, and artifact parity.

Current artifact contains 470 structurally valid authoring-phase rows. G1
remains deliberately open for user classification and approval. Unrelated
caveman-rule deletions and untracked Hermes workspace changes appeared in the
working-tree view but were excluded from F_1.2.1 findings.

---

## Findings

### Critical Issues

None.

### Major Issues

1. **Standalone Vercel-function path omitted `/api` prefix** —
   [matrix.json](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/matrix.json:10),
   [source-inventory.json](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/source-inventory.json:5).
   Canonical row was corrected to `api-fn:ANY:/api/telemetry/wizard`, matching
   deployed filesystem routing. **Disposition: addressed.**

2. **Authorization extraction leaked file-wide roles into unrelated routes** —
   [matrix-schema.mjs](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/matrix-schema.mjs:955),
   [matrix.json](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/matrix.json:27827),
   [matrix.json](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/matrix.json:44615).
   Extraction is now registration- and handler-local; login and public-share
   routes carry no inherited admin role. **Disposition: addressed.**

3. **Evidence-less proposed rows retained stale suggestion-derived personas** —
   [classify-pass.mjs](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/scripts/classify-pass.mjs:272).
   Classification now resets suggestion-owned fields before applying fresh
   rules; login and public-share personas correctly remain `unknown` pending G1.
   **Disposition: addressed.**

4. **Bracket-notation route registrations were invisible to authorization
   scanning** —
   [matrix-schema.mjs](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/matrix-schema.mjs:959),
   [matrix.json](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/matrix.json:5178).
   Scanner now recognizes registrations such as `router['get'](...)`;
   flags-admin route carries `flag_read`. **Disposition: addressed.**

5. **Runtime route stack classified terminal handlers as guards** —
   [inspect-runtime.mjs](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/scripts/inspect-runtime.mjs:431).
   Last non-error callback is now the handler and preceding callbacks are
   guards, preserving actual Express execution order. **Disposition:
   addressed.**

6. **Worker deployment topology and producer triggers were guessed or
   over-attached** —
   [seed-matrix.mjs](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/scripts/seed-matrix.mjs:797),
   [seed-matrix.mjs](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/scripts/seed-matrix.mjs:856),
   [matrix.json](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/matrix.json:52541).
   Producer and consumer roles now derive from API and worker module-graph
   reachability; unresolved roles and undeterminable triggers are recorded
   explicitly. **Disposition: addressed.**

7. **Client rows omitted Railway-web deployment exposure** —
   [seed-matrix.mjs](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/scripts/seed-matrix.mjs:748).
   Client routes now carry both `vercel-web` and `railway-web` exposures, with
   proof applied separately. **Disposition: addressed.**

8. **Boot proof accepted weak HTTP responses or unrelated processes** —
   [boot-proof.mjs](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/scripts/boot-proof.mjs:131),
   [boot-proof.mjs](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/scripts/boot-proof.mjs:168).
   Probes now enforce method-specific expected statuses, free-port-before-spawn,
   live-child identity, and listener ownership. **Disposition: addressed.**

9. **Empty or partial probe result sets could pass boot polling** —
   [boot-proof.mjs](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/scripts/boot-proof.mjs:198),
   [boot-proof.mjs](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/scripts/boot-proof.mjs:218).
   Success now requires exactly one successful result for every requested path.
   **Disposition: addressed.**

10. **Railway-web proof used a hard-coded bundle path** —
    [boot-proof.mjs](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/scripts/boot-proof.mjs:352),
    [boot-proof.mjs](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/scripts/boot-proof.mjs:365).
    Probe now parses and requests the emitted hashed JavaScript URL from built
    HTML. **Disposition: addressed.**

11. **Orphan state had competing authorities and incomplete rendering** —
    [render-matrix.mjs](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/scripts/render-matrix.mjs:59),
    [render-matrix.mjs](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/scripts/render-matrix.mjs:101),
    [validate-matrix.mjs](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/scripts/validate-matrix.mjs:395).
    `orphans.json` is now authoritative; embedded matrix orphans are rejected
    and all unresolved off-row decisions are rendered. **Disposition:
    addressed.**

12. **Approval and reseed lifecycle could retain stale sign-off** —
    [matrix-schema.mjs](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/matrix-schema.mjs:1732).
    Reseed now compares prior and recomputed fingerprints/source hashes, demotes
    stale approvals, and preserves human fields only through stable-key
    lifecycle rules. **Disposition: addressed.**

13. **Listener approval wrote the wrong fingerprint field** —
    [approve-matrix.mjs](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/scripts/approve-matrix.mjs:97).
    Approval now writes `listener.fingerprint` using the listener-disposition
    fingerprint contract. **Disposition: addressed.**

14. **Policy, governance, runtime-manifest, and queue entries lacked exhaustive
    live mapping** —
    [validate-matrix.mjs](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/scripts/validate-matrix.mjs:156).
    Validator now verifies policy and governance registries plus common/runtime
    manifests and queue catalog mappings against live rows. **Disposition:
    addressed.**

15. **WebSocket runtime-manifest entry was not mapped** —
    [seed-matrix.mjs](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/scripts/seed-matrix.mjs:1461),
    [source-inventory.json](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/source-inventory.json:3280).
    `register-routes-websocket-setup` now maps to `ws:setup-websocket-servers`.
    **Disposition: addressed.**

16. **Closed-phase gate did not fully protect requirements, off-row state, or
    exposure coverage** —
    [validate-matrix.mjs](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/scripts/validate-matrix.mjs:285),
    [validate-matrix.mjs](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/scripts/validate-matrix.mjs:363).
    Gate now recomputes off-row fingerprints, requirements hash and family
    expansions, validates runtime exclusions, and requires confirmed evidence or
    explicit `none-reviewed` coverage for every exposure. **Disposition:
    addressed.**

17. **`--close-g1` could write a closed artifact before row-integrity
    validation** —
    [validate-matrix.mjs](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/scripts/validate-matrix.mjs:336),
    [approve-matrix.mjs](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/scripts/approve-matrix.mjs:153).
    Shared `validateRowIntegrity()` now checks approved-row fingerprints,
    coverage keys/fingerprints, evidence completeness, and test-file hashes
    before closure writes. **Disposition: addressed.**

18. **Removed rows retained stale `coverage_review` keys** —
    [matrix-schema.mjs](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/matrix-schema.mjs:1838),
    [surface-contract-matrix-merge-discovery.test.ts](/Users/nikhil/code/Updog_restore/tests/unit/audit/surface-contract-matrix-merge-discovery.test.ts:278).
    Coverage preservation now requires an existing row with a matching
    fingerprint; vanished rows emit an orphan and drop coverage. **Disposition:
    addressed.**

19. **Knowledge-graph `TESTS` edges were not represented in matrix evidence** —
    [seed-matrix.mjs](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/scripts/seed-matrix.mjs:1364).
    Import-level edges now seed hashed `derived[]` entries with
    `assertion_confirmed: false`, preventing them from satisfying coverage until
    reviewed. **Disposition: addressed.**

20. **Closure and lifecycle fixes lacked refusal/regression fixtures** —
    [surface-contract-matrix.test.ts](/Users/nikhil/code/Updog_restore/tests/unit/audit/surface-contract-matrix.test.ts:300),
    [surface-contract-matrix.test.ts](/Users/nikhil/code/Updog_restore/tests/unit/audit/surface-contract-matrix.test.ts:327),
    [surface-contract-matrix-merge-discovery.test.ts](/Users/nikhil/code/Updog_restore/tests/unit/audit/surface-contract-matrix-merge-discovery.test.ts:278).
    Fixtures now reject incomplete coverage and stale approved fingerprints and
    verify vanished-row coverage removal. **Disposition: addressed.**

### Minor Issues

1. **Approval examples omitted a required row or seam selector** —
   [README.md](/Users/nikhil/code/Updog_restore/audit/surface-contract-matrix/README.md:70).
   Examples now show valid `--seam`, `--row`, and `--close-g1` invocations with
   required evidence. **Disposition: addressed.**

### Suggestions

None.

---

## Checklist

- [x] 1. Functional Requirements — passed; all blocking discovery, topology,
      lifecycle, and closure findings addressed.
- [x] 2. Code Quality — passed; shared row-integrity validation removed
      duplicated enforcement logic.
- [x] 3. Architectural Compliance — passed; audit tooling remains isolated from
      production paths and follows tracked-artifact validation patterns.
- [x] 4. API & Backend Best Practices — passed; no production endpoint
      mutations, and both deployment surfaces are represented.
- [x] 5. Calculation Correctness (Phoenix) — not applicable; no calculation
      paths changed.
- [x] 6. Frontend & React Conventions — not applicable; no production React
      implementation changed.
- [x] 7. Error Handling — passed; discovery, validation, boot proof, and
      approval paths fail with actionable errors.
- [x] 8. Security — passed; authorization evidence is route-local and stale
      approval state fails closed.
- [x] 9. Performance — passed; no practical hot-path or resource-cleanup
      regressions identified.

---

## Verdict

**APPROVED**

All reported Critical, Major, and Minor findings are addressed; no accepted
overrides or open findings remain. Current 470-row authoring artifact passes
structural validation, stale closure states are rejected, removed-row coverage
is dropped, `git diff HEAD --check` is clean, and requester-supplied lint,
typecheck, and 23-test results are green. G1 remains intentionally open for user
approval and is not an implementation defect; unrelated Hermes WIP failures and
workspace-only rule-file changes remain outside this feature’s gate.
