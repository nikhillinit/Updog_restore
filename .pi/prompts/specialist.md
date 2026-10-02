---
description: Apply a .claude/agents checklist as a read-only review
argument-hint: '<agent-name> [focus]'
---

Act as the `$1` specialist for a read-only review. Focus: ${@:2}.

1. Read `.claude/agents/$1.md`. If it does not exist, list `.claude/agents/` and
   stop.
2. Load any skill or document it names (for example
   `.claude/skills/phoenix-*/SKILL.md`) only when the checklist needs it.
3. Scope: the uncommitted and branch-local changes
   (`git diff origin/main...HEAD` plus `git diff`) unless the focus names other
   paths.
4. Apply each checklist item. For each one, cite the file and line or command
   output that supports it. Mark an item UNKNOWN when there is no evidence. Do
   not infer a pass.
5. Do not edit files, commit, push, or post anything.

Report findings by severity with evidence. End with: "Review evidence only; not
approval."
