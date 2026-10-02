## Pi harness notes (Updog_restore)

- Project contract: AGENTS.md (loaded below). CLAUDE.md carries the same rules
  for Claude Code and is not loaded. AGENT-SAFETY.md is mandatory before branch,
  Git-state, CI, security, or financial-allocation work.
- Claude-only references in AGENTS.md map to Pi as follows:
  - `.claude/commands/*` (for example `/phoenix-truth`, `/phoenix-phase2`) are
    Pi prompt templates with the same names. Lines of the form !`cmd` inside
    them are context-gathering commands: run them with bash.
  - Named agents (`waterfall-specialist`, `phoenix-precision-guardian`,
    `xirr-fees-validator`) have no Pi runtime. Use `/specialist <name>`, or read
    `.claude/agents/<name>.md` and apply its checklist yourself. The result is
    review evidence, never approval.
- Every bash command already runs with `TZ=UTC` exported.
- `.pi/extensions/updog-guard/` hard-blocks owner-only production actions and
  asks before destructive Git commands, GitHub writes, secret reads, and
  governance or harness edits. A block is final: do not retry through another
  command, encoding, or tool. Report it and ask the user.
- Finish code changes with the `/verify` flow. Report each command with its exit
  status; never claim green without output from this session.
