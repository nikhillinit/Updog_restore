# Complete Development Tooling Catalog

_Generated: 2026-05-23 | Repository: C:/dev/Updog_restore (Updog_restore,
branch: main)_

## Context

This is a read-only audit triggered by `/catalog-tooling`. The output is a
snapshot of every agent, command, skill, MCP server, package, and npm script
reachable from this repo — combining project-level assets (`.claude/`,
`package.json`) with user-level globals (agents and skills loaded via system
prompt / MCP). Batch 8 later removed package-backed agent source from
`packages/`; this snapshot is retained as historical catalog evidence.

No edits are made. To sync this into `CAPABILITIES.md`, run
`node scripts/sync-capabilities.mjs --apply` after exiting plan mode.

---

## Summary Statistics

| Category                                     | Count                                                                                                                        |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Project agents (`.claude/agents/`)           | 37                                                                                                                           |
| User-level global agents (via Task tool)     | ~95                                                                                                                          |
| Built-in agents                              | 4 (`general-purpose`, `statusline-setup`, `Explore`, `Plan`)                                                                 |
| Project slash commands (`.claude/commands/`) | 21 (19 root + 2 wshobson)                                                                                                    |
| Project skills (`.claude/skills/`)           | 43 (17 flat + 26 subdir SKILL.md)                                                                                            |
| User-level skills (plugins)                  | 100+ (gstack, memstack, superpowers, claude-code-setup, cicd-automation, frontend-design, etc.)                              |
| Agent packages (`packages/`)                 | 0 current; 6 in the historical 2026-05-23 snapshot                                                                           |
| NPM scripts                                  | 81                                                                                                                           |
| MCP servers configured                       | 2 project (`multi-ai-collab`, `taskmaster-ai`) + 5 Claude.ai globals (Context7, Gamma, Google Drive, Magic Patterns, Vercel) |
| Hooks                                        | 4 events (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse)                                                           |

---

## 1. Project Agents (`.claude/agents/` — 37)

**Phoenix domain (9):** `waterfall-specialist`, `xirr-fees-validator`,
`phoenix-precision-guardian`, `phoenix-truth-case-runner`,
`phoenix-probabilistic-engineer`, `phoenix-reserves-optimizer`,
`phoenix-capital-allocation-analyst`, `phoenix-brand-reporting-stylist`,
`phoenix-docs-scribe`

**Code & review (7):** `code-reviewer`, `code-simplifier`, `code-explorer`,
`comment-analyzer`, `type-design-analyzer`, `silent-failure-hunter`,
`legacy-modernizer`

**Testing (6):** `test-automator`, `test-repair`, `test-scaffolder`,
`pr-test-analyzer`, `playwright-test-author`, `parity-auditor`

**Performance (3):** `perf-guard`, `perf-regression-triager`,
`baseline-regression-explainer`

**Database & schema (2):** `db-migration`, `schema-drift-checker`

**Ops & debug (5):** `debug-expert`, `devops-troubleshooter`,
`incident-responder`, `chaos-engineer`, `dx-optimizer`

**Architecture & docs (3):** `database-expert`, `docs-architect`,
`context-orchestrator`

**Meta-orchestration (2):** `workflow-orchestrator`, `general-purpose`

Full metadata (model, tools, descriptions) lives in each `.md` file.

---

## 2. User-Level Global Agents (~95)

Available via `Task` tool's `subagent_type` parameter. Grouped by namespace:

- **Core (unprefixed):** `code-explorer`, `debug-expert`, `docs-architect`,
  `dx-optimizer`, `incident-responder`, `legacy-modernizer`, `test-automator`,
  plus duplicates of many project agents
- **Phoenix specialists:** mirrored from project
- **`cicd-automation:*`:** `cloud-architect`, `deployment-engineer`,
  `devops-troubleshooter`, `kubernetes-architect`, `terraform-specialist`
- **`code-refactoring:*`:** `code-reviewer`, `legacy-modernizer`
- **`code-simplifier:*`:** `code-simplifier`
- **`comprehensive-review:*`:** `architect-review`, `code-reviewer`,
  `security-auditor`
- **`error-diagnostics:*`:** `debugger`, `error-detective`
- **`feature-dev:*`:** `code-architect`, `code-explorer`, `code-reviewer`
- **`gsd-*` (Get Sh!t Done suite — 24 agents):** `gsd-planner`,
  `gsd-roadmapper`, `gsd-debugger`, `gsd-verifier`, `gsd-code-reviewer`,
  `gsd-ai-researcher`, `gsd-eval-planner`, `gsd-framework-selector`,
  `gsd-ui-researcher`, etc.

Specialist orchestrators: `claude`, `claude-code-guide`, `optimize`, `debug`

---

## 3. Built-in Agents (4)

| Agent              | Purpose                                                         |
| ------------------ | --------------------------------------------------------------- |
| `general-purpose`  | Multi-step research and execution when no specialist fits       |
| `statusline-setup` | Configure Claude Code statusline                                |
| `Explore`          | Fast read-only code search (file patterns, symbols, references) |
| `Plan`             | Architect for designing implementation plans                    |

---

## 4. Slash Commands (`.claude/commands/` — 21)

**Root (19):** `/advise`, `/catalog-tooling`, `/db-validate`, `/deploy-check`,
`/enable-agent-memory`, `/evaluate-tools`, `/fix-auto`, `/log-change`,
`/log-decision`, `/phoenix-phase2`, `/phoenix-prob-report`, `/phoenix-truth`,
`/pr-ready`, `/pre-commit-check`, `/retrospective`, `/session-learnings`,
`/session-start`, `/test-smart`, `/workflows`

**`wshobson/` (2):** `/wshobson:deps-audit`, `/wshobson:tech-debt`

---

## 5. Skills

### Project skills (`.claude/skills/` — 43)

**Flat (17):** `INDEX.md`, `README.md`, plus 15 topic docs
(api-design-principles, memory-management, etc.)

**Subdirectory `SKILL.md` (26):** `baseline-governance`, `bias-audit`,
`bundle-size`, `claude-infra-integrity`, `control-plane`,
`financial-calc-correctness`, `frontend-ui-ux`, `owasp-security`,
`react-hook-form-stability`, `refactor-code`, `regression-checker`,
`session-learnings`, `statistical-testing`, `test-fixture-generator`,
`test-pyramid`, `ui-design-system`, and Phoenix specialists
(`phoenix-advanced-forecasting`, `phoenix-brand-reporting`,
`phoenix-capital-exit-investigator`, `phoenix-docs-sync`,
`phoenix-precision-guard`, `phoenix-reserves-optimizer`,
`phoenix-truth-case-orchestrator`, `phoenix-waterfall-ledger-semantics`,
`phoenix-workflow-orchestrator`, `phoenix-xirr-fees-validator`)

### User-level skills (100+)

Loaded from plugins. Major namespaces:

- **gstack:** `careful`, `codex`, `guard`, `health`, `investigate`, `qa`,
  `design-consultation`, `design-review`, `plan-ceo-review`, `plan-eng-review`,
  `plan-design-review`, `plan-devex-review`, `retro`, `review`, `pair-agent`,
  `learn`, `jarvis`, others
- **memstack:** `compress`, `diary`, `echo`, `familiar`, `forge`, `governor`,
  `grimoire`, `humanize`, `project`, `quill`, `scan`, `shard`, `sight`, `state`,
  `token-optimization`, `verify`, `work`
- **superpowers:** `brainstorming`, `executing-plans`,
  `dispatching-parallel-agents`, `requesting-code-review`,
  `receiving-code-review`, `subagent-driven-development`,
  `systematic-debugging`, `test-driven-development`, `using-git-worktrees`,
  `using-superpowers`, `verification-before-completion`, `writing-plans`,
  `writing-skills`, `finishing-a-development-branch`
- **cicd-automation:** `secrets-management`, `gitlab-ci-patterns`,
  `github-actions-templates`, `deployment-pipeline-design`
- **claude-code-setup:** `claude-automation-recommender`
- **frontend-design:** `frontend-design`
- **andrej-karpathy-skills:** `karpathy-guidelines`
- **Misc:** `careful`, `codex`, `cross-pollination`, `senior-architect`,
  `thinking`, `thinking-effectuation`, `update-config`, `verify`, `code-review`,
  `security-review`, `loop`, `schedule`, `init`, `run`, `claude-api`,
  `keybindings-help`, `fewer-permission-prompts`, `last30days`, `rebuttal`

---

## 6. Agent Packages (`packages/` — 0 current)

The 2026-05-23 catalog snapshot listed six local agent package entries. Batch 8
removed the package-backed source after confirming there were no active app,
script, test, workflow, or root config dependencies outside package-internal
links and historical/governance references. Use `.claude/agents/`,
`.claude/commands/`, root npm scripts, and `scripts/ai-tools/` for current
tooling.

---

## 7. NPM Scripts (81, root `package.json`)

| Category             | Examples                                                                                                                                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Dev**              | `dev`, `dev:client`, `dev:api`, `preview`, `clean:spa-dist`                                                                                                                                                                                                                                      |
| **Build**            | `build`, `build:web`, `build:server`, `build:prod`, `vercel-build`, `postbuild`                                                                                                                                                                                                                  |
| **Test (16)**        | `test`, `test:unit`, `test:integration`, `test:integration:routes`, `test:integration:phase0-dbproof`, `test:smart`, `test:affected`, `test:smoke`, `test:e2e:smoke`, `test:e2e:lp-reporting`, `test:security`, `test:rls`, `test:memory`, `test:ui`, `test:quick`, `test:publish-orchestration` |
| **Lint/Quality**     | `check`, `baseline:check`, `lint`, `lint:eslint`, `lint:fix`, `validate:core`, `validate:schema-drift`, `guardrails:check`, `guard:console:check`, `guard:scripts:check`, `guard:route-imports:check`                                                                                            |
| **Database**         | `db:push`, `db:studio`, `db:seed:demo`, `db:seed:test`, `seed:multi-tenant`, `rls:quickstart`                                                                                                                                                                                                    |
| **Phoenix**          | `phoenix:truth`, `calc-gate`, `calc-gate:orphans`, `calc-gate:full`                                                                                                                                                                                                                              |
| **AI/Orchestration** | `ai`, `hermes`, `hermes:dry`, `hermes:route`, `hermes:research`, `hermes:production`, `hermes:distribution`                                                                                                                                                                                      |
| **Docs**             | `docs:lint`, `docs:check-links`, `docs:routing:generate`, `docs:routing:check`, `docs:routing:query`, `validate:claude-md`                                                                                                                                                                       |
| **Bundle/Perf**      | `bundle:check`                                                                                                                                                                                                                                                                                   |
| **Health**           | `doctor`, `doctor:quick`, `doctor:shell`                                                                                                                                                                                                                                                         |
| **Lifecycle**        | `preinstall`, `prepare`, `pre-push`, `start`                                                                                                                                                                                                                                                     |

**Capabilities sync:** `scripts/sync-capabilities.mjs` exists but has no npm
alias — invoke with `node scripts/sync-capabilities.mjs [--apply]`.

---

## 8. MCP Servers

### Project (`.mcp.json` — 2)

- **`multi-ai-collab`** — Python (`C:\Python313\python.exe`),
  Claude/Gemini/OpenAI consensus
- **`taskmaster-ai`** — `npx task-master-ai`

### Claude.ai-managed globals (5)

- **Context7** — live library docs (React, Next.js, Prisma, etc.); prefer over
  web search for SDK questions
- **Gamma** — generate presentations/docs/webpages
- **Google Drive** — file metadata, content, search
- **Magic Patterns** — UI design system / artifact generation
- **Vercel** — deploys, logs, project management

### Deferred tools (loaded via `ToolSearch`)

Includes `WebFetch`, `WebSearch`, `NotebookEdit`,
`TaskCreate/Get/List/Output/Stop/Update`, `EnterPlanMode/ExitPlanMode`,
`EnterWorktree/ExitWorktree`, `Monitor`, `CronCreate/Delete/List`,
`PushNotification`, `RemoteTrigger`, `mcp__codex__*`.

---

## 9. Configuration & Hooks (`.claude/settings.json`)

**Permissions:**

- Allow: `npm run lint:*|test:*|check:*|build:*|doctor:*|phoenix:*`, git read
  ops, `Read(**/*)`
- Deny: `npm run db:push:*`, `rm -rf:*`, `.env*` writes, `package.json` writes

**Hooks:** | Event | Hook | Purpose | |---|---|---| | SessionStart |
`session-start-hook.sh` | Initialize session context | | UserPromptSubmit |
`discovery-hook.sh`, `complexity-checkpoint-hook.sh` | Route + assess scope | |
PreToolUse (Bash) | `git-guard-hook.mjs` | Block dangerous git ops | |
PostToolUse (Edit/Write/MultiEdit) | `npm run lint:fix`, `post-edit-hook.mjs` |
Auto-format + validate |

**Env:** `CLAUDE_CODE_ENABLE_TELEMETRY=1`, `includeCoAuthoredBy=true`,
`cleanupPeriodDays=30`.

---

## 10. Documentation Anchors

- **`AGENTS.md`** (updated 2026-05-20) — authoritative operating guidance,
  mandatory workflow chain
- **`.claude/AGENT-DIRECTORY.md`** (updated 2025-12-29) — canonical agent
  locations + selection guide
- **`CAPABILITIES.md`** (last touched 2026-05-21) — historical inventory;
  subordinate to AGENTS.md / DISCOVERY-MAP
- **`.claude/DISCOVERY-MAP.md`** — agent-facing routing
- **`docs/INDEX.md`** — human-facing doc routing

---

## 11. Workflow Decision Tree

```
User request
  ↓
Project agent exists?     → Task(subagent_type=<name>)
  ↓ no
User-level agent exists?  → Task(subagent_type=<name>)
  ↓ no
Slash command exists?     → SlashCommand
  ↓ no
NPM script exists?        → Bash(npm run …)
  ↓ no
Skill exists?             → Skill(skill=<name>)
  ↓ no
MCP tool exists?          → mcp__<server>__<tool>
  ↓ no
Built-in agent (Explore/Plan/general-purpose) → Task
  ↓ no
Implement directly
```

---

## 12. Verification

To verify this catalog against current state:

```powershell
# Count project agents/commands
(Get-ChildItem .claude/agents -Filter *.md).Count        # expect 37
(Get-ChildItem .claude/commands -Filter *.md -Recurse).Count  # expect 21

# Count skills
(Get-ChildItem .claude/skills -Filter *.md).Count
(Get-ChildItem .claude/skills -Filter SKILL.md -Recurse).Count

# List packages
Get-ChildItem packages -Directory | Select-Object Name

# Re-run sync (dry run)
node scripts/sync-capabilities.mjs
```

---

## 13. Gaps & Recommendations

1. **`sync-capabilities.mjs` lacks npm alias.** Add
   `"capabilities:sync": "node scripts/sync-capabilities.mjs"` and
   `"capabilities:sync:apply": "node scripts/sync-capabilities.mjs --apply"` to
   `package.json` for discoverability.
2. **CAPABILITIES.md header date drifts from git mtime** (header says
   2026-03-27; git says 2026-05-21). Either let the sync script rewrite the
   header or rely on git mtime exclusively.
3. **Duplicate agent definitions** between project (`.claude/agents/`) and
   user-level globals (e.g. `code-reviewer`, `debug-expert`,
   `legacy-modernizer`). Project file wins resolution; document precedence in
   `AGENT-DIRECTORY.md`.
4. **`bmad-integration` package** has no `package.json` — either complete it or
   remove the directory.
5. **No catalog of user-level skills** in repo docs — they appear only via
   session reminders. Consider a `docs/external-skills.md` snapshot.

---

## 14. Follow-up Options

After exiting plan mode, possible next actions:

1. Run `node scripts/sync-capabilities.mjs --apply` to update `CAPABILITIES.md`
2. Add npm script aliases for the sync (gap #1 above)
3. Export this catalog to `docs/tooling-catalog.md` as a tracked snapshot
4. Create a condensed quick-reference version

This catalog itself stays in the plan file
(`C:\Users\nikhi\.claude\plans\ticklish-strolling-seal.md`) for review.
