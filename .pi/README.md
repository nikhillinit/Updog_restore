# Pi harness for Updog_restore

Project-level configuration for the [Pi](https://pi.dev) coding agent (1.0+).
Loads only after project trust (`/trust`). This file is documentation; Pi does
not load it.

## Layout

| Path                                   | Role                                                                          |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| `settings.json`                        | `TZ=UTC` shell prefix; loads Phoenix skills and `.claude/commands` as prompts |
| `APPEND_SYSTEM.md`                     | Maps Claude-only references in AGENTS.md to Pi (static text)                  |
| `extensions/updog-guard/index.ts`      | Guard runtime: tool gating, repo-state note, truth reminder, status line      |
| `extensions/updog-guard/rules.ts`      | Pure rule tables (bash, write paths, read paths)                              |
| `extensions/updog-guard/rules.test.ts` | Rule tests (Node test runner, no Pi needed)                                   |
| `prompts/verify.md`                    | `/verify`: graduated lint, types, tests, and truth gates                      |
| `prompts/specialist.md`                | `/specialist <agent>`: applies a `.claude/agents` checklist read-only         |

AGENTS.md loads as a context file without trust. `.agents/skills` (Neon) loads
automatically.

## Design rules

These follow Earendil's guidance (earendil.com/posts: "Prompt Caching In
Agents", "Pi, Minimal and Performant", "How Compaction Works in Pi", "Measuring
the Sloppiness of Code"):

1. **Keep the prefix stable.** Do not return `systemPrompt` from
   `before_agent_start`. Do not put timestamps or git state in
   `APPEND_SYSTEM.md`. Do not call `setActiveTools` per turn. Send dynamic state
   as appended transcript messages, as the guard does once per session. Each
   prefix change re-bills the whole session as uncached input.
2. **Add only what pays for itself.** Every system-prompt line costs tokens on
   every request. Put procedures in prompt templates or skills, which load on
   demand. Do not port Claude hooks that only add noise.
3. **Use no automatic continuations.** The truth reminder is appended once, with
   no `continue: true`, so it cannot loop.
4. **Fail closed without a UI.** The confirm tier blocks in print, JSON, and RPC
   modes. `CLAUDE_HOOKS_DISABLE=1` skips the confirm tier only. Hard blocks
   always apply.
5. **Reuse repo scripts.** `scripts/ci/classify-change-paths.mjs` decides which
   paths are financial. `scripts/control-plane/git-guard-hook.mjs` decides force
   pushes. Do not duplicate their logic here.
6. **Watch the diff size.** `/verify` reports net added lines. Unexplained
   growth is a defect signal.

## Claude control plane: what was ported

| Claude Code (`.claude/settings.json`)                   | Pi                                                                                      |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Deny `db:push`, `rm -rf`, `.env*`, `package.json` edits | Guard hard and confirm tiers                                                            |
| PreToolUse `git-guard-hook.mjs`                         | Called from the guard for `git push`                                                    |
| SessionStart context hook                               | One-time repo-state message                                                             |
| PostToolUse `lint:eslint` on every edit                 | Not ported. `/verify` lints once at the end, which is cheaper and avoids per-edit noise |
| PostToolUse session-file tracking                       | Not needed. Pi sessions record file operations                                          |
| UserPromptSubmit complexity hook                        | Not ported (noise)                                                                      |
| Named subagents                                         | `/specialist` prompt (read-only, evidence only)                                         |

## Limits

The guard is a seatbelt, not a sandbox. Patterns match command text, so bash can
still reach any path the user can. Quoted text can also cause false positives: a
heredoc or commit message that contains `npm run db:push` is hard-blocked.
Codemode scripts call tools through `ctx.executeTool()` and pass through the
same `tool_call` handler. Any tool the guard does not know, such as MCP or
another extension's tools, needs confirmation unless it declares `readOnlyHint`.
The forwarded `git-guard-hook.mjs` never inherits `CLAUDE_HOOKS_DISABLE` or
`CLAUDE_ACK_GIT_RISK`. Every force-push spelling to main/master is also a hard
block in `rules.ts`. That includes `--mirror`, forced `--all`, and any force
push without an explicit destination branch (no refspec, or only `HEAD`). Git
resolves those from `cd`, `-C`, upstream, and `push.default`, which text
matching cannot see, so name the branch:
`git push --force-with-lease origin <branch>`. Shell quotes are stripped before
matching. Variables, `eval`, aliases, and scripts are not expanded, so
server-side branch protection on `main` remains the real boundary. Only a bare
`npm run phoenix:truth` (or `npx vitest run ...tests/unit/truth-cases...`) with
no pipe, `;`, `&`, or substitution clears the financial reminder. User `!cmd`
shell input is not gated. For real isolation, see Pi `docs/containerization.md`.

## Change and test

Edits under `.pi/` trigger the guard's `harness` confirmation. After changing
anything, run these checks, then run `/reload` in Pi:

```bash
TZ=UTC node --experimental-strip-types --test .pi/extensions/updog-guard/rules.test.ts
```

Cost and cache checks: `/session` shows the cache hit rate and re-billed misses.
Set `showCacheMissNotices: true` in `/settings` to see misses as they happen.
