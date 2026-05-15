# Domain Docs

How engineering skills should consume this repo's domain documentation when
exploring the codebase.

## Layout

This is a single-context repo.

- Read root guidance first: `CLAUDE.md`, then repo search, then `docs/INDEX.md`.
- Use `DECISIONS.md` for architectural rationale that still lives in the root
  decision log.
- Use `docs/adr/` for standalone ADRs that affect the area being changed.
- There is currently no root `CONTEXT.md` or `CONTEXT-MAP.md`. If one appears
  later, read it before proposing domain terminology or architectural changes.

## Before exploring

Read only the context relevant to the task:

- `CLAUDE.md` for active repo rules.
- `docs/INDEX.md` for documentation routing.
- `DECISIONS.md` and the relevant files in `docs/adr/` for prior decisions.
- Domain docs under `docs/PHOENIX-SOT/`, `docs/notebooklm-sources/`, or
  cheatsheets when the work touches fund modeling, waterfall, XIRR, reserves,
  pacing, cohort, variance, or reporting behavior.

If a referenced context file does not exist, proceed silently. Do not create
`CONTEXT.md` upfront; create or update domain docs only when the project records
non-derivable terminology or decisions.

## Use project vocabulary

When output names a domain concept in an issue title, refactor proposal,
hypothesis, or test name, use the term already present in the domain docs. Do
not drift to synonyms the docs explicitly avoid.

If the concept is missing from the docs, either reconsider whether the term is
invented or note the documentation gap for a future domain-doc pass.

## Flag ADR conflicts

If a recommendation contradicts an existing ADR or `DECISIONS.md` entry, call
that out explicitly instead of silently overriding it.
