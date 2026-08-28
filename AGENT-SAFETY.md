# Cross-Harness Safety Invariants

Applies to every agent, model, CLI, IDE extension, and orchestration harness.
Read before branch, Git-state, CI, security, or financial-allocation work.
These controls supplement `AGENTS.md`, `CLAUDE.md`, `DEV_BRAIN.md`, and the
applicable governing policy; stricter controls win.

## Branch and Git-State Safety

- Run `git fetch origin` and cut release/repair branches only from an inspected
  `origin/main` SHA; compare local main first so unreviewed local commits cannot
  ride along.
- Keep generated agent state outside the repository, per worktree. Ignore any
  fallback repo-local state directory immediately; do not use `git add -A` near
  live state.
- Before `reset --hard`, checkout, rebase, or merge across a change that moves
  state from tracked to absent/ignored, back it up. Git can remove it from disk.
- A compatibility symlink needs both `.mimosa` and `.mimosa/` ignored; a
  directory-only ignore does not protect a symlink.

## Diagnose and Validate Evidence

- Treat memory, plans, and prior hypotheses as leads, never diagnoses. Read the
  failing assertion and actual failure before changing code or configuration.
- Review the merge-effective head and the scanned commit history separately. A
  deleted artifact can be absent from the final tree yet remain visible to a
  history scanner.
- Expect broad diffs to activate dormant path-filtered CI lanes. Triage their
  actual trigger before assigning ownership or changing scope.
- For repeatable full-suite tail flakes: prove isolation-green behavior, preserve
  CI as authority, and document evidence plus an owner action before any
  temporary `--no-verify` bypass.

## Financial Allocation Safety

- Conservation is necessary but insufficient. Test allocation order, provenance,
  global ledger consumption, and per-partner entitlements.
- If allocation provenance is unavailable, fail closed or escalate; never invent
  a priority order.
- Quantize each monetary tier once and reconstruct its distributed total from
  emitted integer units. Never subtract a raw Decimal while emitting
  independently rounded buckets.

## Security Exceptions

- Treat scanner allowlists as security-policy changes. Scope them minimally on
  first write: exact historical paths plus content-specific fixture patterns.
- Never use a path-only `generic-api-key` exemption. Prove a known secret is
  still detected outside the exemption before accepting it.

## Required Stop Condition

Stop and ask for direction when a requested shortcut would bypass a control
above, lacks authoritative provenance, or leaves a security/financial invariant
unproven.
