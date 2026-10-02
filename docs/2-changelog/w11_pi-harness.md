---
status: HISTORICAL
audience: both
last_updated: 2026-10-02
owner: '@nikhillinit'
---

# Changelog - Week 11, 02-10-2026, Pi Harness

**Release status**: source changes recorded on branch `chore/pi-harness`, for a
pull request against `main`. Merge is owner-gated behind `CI Gate Status`.
**Package version**: unchanged; agent tooling only, no new application version
or release tag. **Object**: chore(agents): add Pi harness mirroring the Claude
control plane. **Code review**:
[Code review](../3-code-review/CR_w11_pi-harness.md) (Codex loop). **Plan**:
none (unplanned tooling change; intent recorded in `.pi/README.md`).

## Changes

- Add project configuration for the Pi coding agent (pi.dev 1.0) under `.pi/`.
  It loads only after project trust is granted.
  - `settings.json` exports `TZ=UTC` for every shell command and loads the
    Phoenix skills and `.claude/commands` as prompt templates.
  - `APPEND_SYSTEM.md` maps the Claude-only references in `AGENTS.md` (commands,
    named agents) to Pi. The text is static to keep the prompt cache stable.
  - `extensions/updog-guard/` is a guard extension with two tiers. The hard tier
    blocks schema push, prod user provisioning with `--apply`, production
    workflow dispatch, Vercel promote/rollback, force push to main, and writes
    to `.env*` and VCS internals. The confirm tier asks before destructive Git
    commands, hook bypasses, dependency changes, GitHub writes, secret reads,
    edits to governance, CODEOWNERS, migration, and harness paths, and any
    unknown tool (MCP or another extension) that does not declare
    `readOnlyHint`. The confirm tier fails closed when no UI is available. Every
    force-push spelling to main/master is a hard block, independent of the kill
    switch. That includes `--mirror` and forced `--all` pushes, deleting remote
    main, and any force push that does not name an explicit destination branch.
    Git rules match through global options such as `git -C dir`. Legacy
    `git checkout` asks first, except for branch creation, because it cannot be
    told apart from a path restore. It reuses
    `scripts/ci/classify-change-paths.mjs` and
    `scripts/control-plane/git-guard-hook.mjs`. It reminds once when financial
    paths change without a later `phoenix:truth` run. Pending financial edits
    are tracked per session, so retries and continuations do not drop them.
  - `prompts/verify.md` (`/verify`) runs the graduated lint, type, test, and
    truth gates. `prompts/specialist.md` (`/specialist <agent>`) applies a
    `.claude/agents` checklist as a read-only review.
  - `README.md` records the design rules, what was ported from
    `.claude/settings.json`, and the guard's limits.
- `eslint.config.js`: ignore `.pi/**`, like `.claude/**`, `.codex/**`, and
  `.hermes/**`. Without it, `eslint .` parses the extension outside any tsconfig
  project and fails `npm run lint`. The guard rules are tested with
  `node --experimental-strip-types --test`.

## Verification

- `node --experimental-strip-types --test .pi/extensions/updog-guard/rules.test.ts`:
  8/8 pass.
- `tsc` strict against the installed `@earendil-works/pi-coding-agent` 1.0.0
  types: exit 0.
- Smoke test of the extension loaded through jiti (Pi's loader) with no UI: hard
  and confirm tiers block as intended, and the repo-state message and truth
  reminder fire.
- `npm run check`: exit 0, no new TypeScript errors. `npm run lint`: exit 0
  (with `NODE_OPTIONS=--max-old-space-size=8192`; a cold-cache worktree run hit
  the default heap limit).
