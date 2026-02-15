# Codex CLI Integration - Updog_restore

Multi-LLM orchestration using official OpenAI Codex CLI with ChatGPT Pro
subscription (no API costs). Claude Code orchestrates; Codex proposes in
sandbox; iterative critique drives consensus.

## Quick Start

```powershell
# 1. Check setup
.\tools\maestro\scripts\setup-maestro.ps1

# 2. Load environment
. .\tools\maestro\env.ps1

# 3. Use Codex
codex exec "Your prompt here" --sandbox read-only
```

## Configuration

| Setting   | Value           | Purpose                        |
| --------- | --------------- | ------------------------------ |
| Model     | `gpt-5.3-codex` | Automatic (CLI default)        |
| Reasoning | `xhigh`         | Highest reasoning capability   |
| Sandbox   | `read-only`     | Validates claims with evidence |
| Auth      | ChatGPT Pro     | No per-token API costs         |

## Architecture

```
+------------------+     task/prompt    +------------------+
|   Claude Code    |------------------>|  Codex CLI       |
|  (Orchestrator   |                   |  gpt-5.3-codex   |
|   + Critic)      |<-----------------|  (read-only)     |
+------------------+     proposal      +------------------+
         |
         | critique (Feasibility, Efficiency,
         |           Sophistication, Correctness)
         |
         +----------------------------------^
              (iterate until consensus)
```

**Separation of concerns:**

- Codex provides **proposals in sandbox** (read-only, evidence-backed)
- Claude Code **critiques, iterates, and executes** all actions (edits, tests,
  commits)

## Workflow Modes

### 1. One-Shot Consult (simple questions)

Single call, no iteration. For quick lookups or narrow questions.

```powershell
codex exec "How should I optimize the Express middleware chain?" --sandbox read-only
```

### 2. Iterative Collaboration (open-ended tasks)

Multiple rounds of propose-critique until consensus. Use for strategy, design,
and review tasks where the first answer is unlikely to be complete.

```
Round 1: Codex proposes  -->  Claude critiques (blocking issues?)
Round 2: Codex refines   -->  Claude critiques (important gaps?)
Round N: Consensus or max iterations reached
```

**When to use:** Architecture questions, performance optimization, code review,
open-ended "how should we" questions.

See: [snippets/common-workflows.md](snippets/common-workflows.md) for examples.

### 3. Forensic Engineer (structured features/bugs/refactors)

Four mandatory phases, each getting Codex input + Claude critique.

```
+------------+     +------------+     +------------+     +------------+
| ANALYZE    |---->|   PLAN     |---->|  EXECUTE   |---->|   VERIFY   |
| Validate   |     | Concrete   |     | Step-by-   |     | Confirm    |
| assumptions|     | steps      |     | step       |     | requirements|
+------------+     +------------+     +------------+     +------------+
```

| Phase   | Objective                            | Claude Critique Focus    |
| ------- | ------------------------------------ | ------------------------ |
| ANALYZE | Validate assumptions against code    | Accuracy, file refs      |
| PLAN    | Convert to concrete executable steps | Feasibility, specificity |
| EXECUTE | Implement with verification          | Safety, preconditions    |
| VERIFY  | Confirm requirements met             | Coverage, regressions    |

**When to use:** New features, bug fixes with unknown root cause, refactors,
anything where skipping a phase leads to rework.

See: [snippets/common-workflows.md](snippets/common-workflows.md) for examples.

## Critique Framework

Every Codex proposal is evaluated on four categories:

| Category           | Question                    | Example Issues                      |
| ------------------ | --------------------------- | ----------------------------------- |
| **Feasibility**    | Will this actually work?    | Missing deps, invalid APIs          |
| **Efficiency**     | Is there a simpler way?     | N+1 queries, unnecessary complexity |
| **Sophistication** | What edge cases are missed? | No error handling, no tests         |
| **Correctness**    | Is the logic sound?         | Wrong assumptions, flawed reasoning |

## Severity Gates

| Severity    | Meaning                      | Action                         |
| ----------- | ---------------------------- | ------------------------------ |
| `blocking`  | Must fix before proceeding   | Force another iteration        |
| `important` | Should fix, can proceed at N | Document if unresolved at exit |
| `minor`     | Nice to have                 | Note but do not block          |

**Rule:** If any `blocking` finding exists after critique, the loop MUST
iterate. Consensus is reached only when zero `blocking` findings remain.

## Orchestrator Skills

Claude Code applies these reasoning skills during critique to maximize quality.
See [snippets/orchestrator-playbook.md](snippets/orchestrator-playbook.md) for
the full operational manual.

| Skill                          | When Applied          | Purpose                                        |
| ------------------------------ | --------------------- | ---------------------------------------------- |
| Defense in Depth               | Every critique round  | Validate at every layer data passes            |
| Inversion Thinking             | ANALYZE + PLAN phases | Ask "how would this fail?" first               |
| Root Cause Tracing             | ANALYZE phase (bugs)  | Trace backward from symptom to cause           |
| Systematic Debugging           | EXECUTE phase         | 4-phase: investigate, hypothesize, fix, verify |
| Verification Before Completion | VERIFY phase          | Run commands, confirm with evidence            |

## Files

| File                                | Purpose                                |
| ----------------------------------- | -------------------------------------- |
| `env.ps1`                           | Environment setup + CLI verification   |
| `scripts/setup-maestro.ps1`         | Diagnostic script                      |
| `snippets/common-workflows.md`      | Example commands and workflow patterns |
| `snippets/orchestrator-playbook.md` | Orchestrator operational manual        |

## Auth

Codex CLI uses your ChatGPT Pro subscription via OAuth. Check status:

```powershell
codex login status
```
