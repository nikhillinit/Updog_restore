# Code Review: V2 Core Financial Model + F1 Conformance Right-Sizing

**Review Date**: 2026-08-23 **Version**: 1.6.0 **Files Reviewed**: 41 files
changed, 8646 insertions(+), 265 deletions(-)

**Plan**: `.omx/plans/updog-v2-conformance-right-sized-synthesis.md` (F1 card)
**Prior plan**: `docs/1-plans/F_2.0.0_v2-core-financial-model.plan.md` (Phases
1-5)

---

## Executive Summary

V2 internal-economics calculation core (Phases 1-5, F_2.0.0) plus F1 conformance
right-sizing (strict 2.0.1 input contract, refusal-only public derivation, proof
infrastructure, CI wiring). Code review skipped -- Codex review scripts lost in
#1385 merge. Manual review performed. APPROVED with observations.

---

## Changes Overview

### F_2.0.0 Phases 1-5 (11 prior commits)

- Phase 1: contracts, guardrails, normalizer, V1 byte-freeze
- Phase 2: accrual kernel, fee-recycling enforcer, event-stream engine
- Phase 3: deal-by-deal and whole-fund waterfall engines with lane isolation
- Phase 4: receipt builder, reserve classifier, composite deriver
- Phase 5: type fixes, property tests, admission-limit benchmark

### F1 Conformance Right-Sizing (this batch)

- Strict `2.0.1` wire contract (pre-schema version check, admission guard)
- Refusal-only public derivation (`deriveInternalEconomicsV2`,
  `certifyInternalEconomicsDualLaneV2`)
- Legacy corpus adapter (`internal-economics-legacy-corpus-adapter/1.0.0`)
- Independent test oracle (`internal-economics-test-oracle/1.0.0`)
- Engine test replaying all 11 truth cases through adapter -> derive
- CI classifier + regression tests for new financial paths
- CI workflow step for V2 internal economics tests

## Findings

No critical or major findings. Manual review confirmed:

1. Oracle imports zero production modules (source-text assertion in test)
2. Corpus SHA-256 pinned and verified via raw file read
3. Adapter date clamping handles TC-005 calendar ordering (`ipEnd > term`)
4. Default `fs` import bypasses `vi.mock('fs')` named-export stub correctly
5. All 205 V2 tests pass, lint clean, typecheck clean

## Verdict

**APPROVED with observations** (Codex review infrastructure unavailable --
scripts lost in #1385 merge; manual review only).
