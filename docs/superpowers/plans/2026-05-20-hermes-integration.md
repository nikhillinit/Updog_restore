---
status: ACTIVE
last_updated: 2026-05-20
owner: Platform Team
categories: [planning, hermes, orchestration]
---

# Hermes Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lightweight Hermes task bus that routes research, production,
and distribution work across Claude, Codex, Kimi, and existing repo specialists
without replacing current governance.

**Architecture:** `orchestrate.js` remains the root CLI, but becomes an ESM-safe
importable module with pure routing helpers and a guarded CLI entrypoint.
Routing configuration lives under `.claude/hermes/`, while `DEV_BRAIN.md` and
small pointers in `CLAUDE.md`/`AGENTS.md` describe Hermes as subordinate to
existing repo instructions.

**Tech Stack:** Node.js ESM, Vitest server project, npm scripts, existing
discovery-map generator.

---

## File Structure

- Create `DEV_BRAIN.md`: compact Hermes operating charter included in spawned
  prompts.
- Create `.claude/hermes/SOUL.md`: Hermes-specific model identity and default
  lane boundaries.
- Create `.claude/hermes/model-routing.json`: declarative phase defaults,
  specialists, gates, and CLI binary config.
- Modify `orchestrate.js`: replace legacy bootstrap script with import-safe ESM
  routing CLI while preserving `Orchestrator` export and legacy commands.
- Modify `package.json`: add Hermes script aliases.
- Modify `.env.example`: add non-secret Hermes config and CLI binary variables.
- Modify `CLAUDE.md`: add a short Hermes pointer.
- Modify `AGENTS.md`: add a short Hermes pointer.
- Modify `docs/DISCOVERY-MAP.source.yaml`: add a schema-valid Hermes routing
  pattern; do not add invalid `path:` entries.
- Create `tests/unit/routing/hermes-routing.test.ts`: unit tests for pure
  routing helpers and import-safe entrypoint behavior.
- Regenerate `docs/_generated/router-index.json`,
  `docs/_generated/router-fast.json`, and `docs/_generated/staleness-report.md`.

## Task 1: Routing Tests

**Files:**

- Create: `tests/unit/routing/hermes-routing.test.ts`
- Modify later: `orchestrate.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/routing/hermes-routing.test.ts`:

```typescript
import { describe, expect, test } from 'vitest';

import {
  chooseModel,
  createRoutingPlan,
  isCliEntryPoint,
  parseArgs,
  resolveGate,
  scoreSpecialist,
} from '../../../orchestrate.js';

const routing = {
  defaults: {
    research: 'claude',
    production: 'codex',
    distribution: 'claude',
  },
  longContextModel: 'kimi',
  longContextTriggers: ['full repo audit', 'repo-wide'],
  manualFlags: {
    '--claude': 'claude',
    '--codex': 'codex',
    '--kimi': 'kimi',
  },
  specialists: {
    'waterfall-specialist': {
      keywords: [
        { phrase: 'waterfall calculation', weight: 4 },
        { phrase: 'carry distribution', weight: 4 },
      ],
      risk: 'financial',
    },
    'xirr-fees-validator': {
      keywords: [
        { phrase: 'xirr calculation', weight: 4 },
        { phrase: 'management fees', weight: 3 },
      ],
      risk: 'financial',
    },
  },
  scoring: {
    minScoreToAssign: 3,
    tieBreaker: 'highest-risk-wins',
    riskOrder: ['financial', 'operational', 'quality'],
  },
  gates: {
    research: 'npm run doctor:quick',
    production: 'npm run check',
    'production-financial': 'npm run calc-gate',
    distribution: 'npm run lint',
  },
};

describe('Hermes routing helpers', () => {
  test('manual model flags override phase defaults', () => {
    const args = parseArgs([
      '--phase',
      'research',
      '--task',
      'implement new filter',
      '--kimi',
    ]);

    expect(args.manualModel).toBe('kimi');
    expect(chooseModel(args.task, args.phase, routing, args.manualModel)).toBe(
      'kimi'
    );
  });

  test('xirr production work routes to financial specialist and calc gate', () => {
    const specialist = scoreSpecialist(
      'fix xirr calculation with management fees',
      routing.specialists,
      routing.scoring
    );

    expect(specialist).toEqual({
      name: 'xirr-fees-validator',
      risk: 'financial',
      score: 7,
    });
    expect(resolveGate('production', specialist, routing.gates)).toBe(
      'npm run calc-gate'
    );
  });

  test('distribution phase summary does not false-positive to waterfall specialist', () => {
    const specialist = scoreSpecialist(
      'prepare distribution summary for PR',
      routing.specialists,
      routing.scoring
    );

    expect(specialist).toBeNull();
  });

  test('long-context triggers route to kimi when no manual override is present', () => {
    expect(
      chooseModel(
        'full repo audit for agent routing',
        'research',
        routing,
        null
      )
    ).toBe('kimi');
  });

  test('createRoutingPlan combines model, specialist, risk, score, and gate', () => {
    const plan = createRoutingPlan({
      phase: 'production',
      task: 'fix xirr calculation with management fees',
      routing,
      manualModel: null,
    });

    expect(plan).toEqual({
      phase: 'production',
      task: 'fix xirr calculation with management fees',
      model: 'codex',
      specialist: 'xirr-fees-validator',
      risk: 'financial',
      score: 7,
      gate: 'npm run calc-gate',
    });
  });

  test('entrypoint guard distinguishes imports from direct CLI execution', () => {
    expect(
      isCliEntryPoint('file:///repo/orchestrate.js', [
        'node',
        '/repo/orchestrate.js',
      ])
    ).toBe(true);
    expect(
      isCliEntryPoint('file:///repo/orchestrate.js', [
        'node',
        '/repo/tests/importer.js',
      ])
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail for missing exports**

Run:
`npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/routing/hermes-routing.test.ts`

Expected: FAIL because `orchestrate.js` does not yet export `parseArgs`,
`scoreSpecialist`, `chooseModel`, `resolveGate`, `createRoutingPlan`, or
`isCliEntryPoint`.

## Task 2: Hermes Config and Governance Files

**Files:**

- Create: `DEV_BRAIN.md`
- Create: `.claude/hermes/SOUL.md`
- Create: `.claude/hermes/model-routing.json`

- [ ] **Step 1: Add `DEV_BRAIN.md`**

Create a compact charter with these sections: `Entry Points`,
`Model Co-op Defaults`, `Phase Routing`, `Specialist Escalation`, `Hard Rules`,
and `Config`.

Key wording for role boundaries:

```markdown
These are Hermes defaults for CLI-routed sessions, not replacements for
`CLAUDE.md` or `AGENTS.md`. If this file conflicts with a model-specific
governance file, the model-specific governance file wins.
```

- [ ] **Step 2: Add `.claude/hermes/SOUL.md`**

Use Hermes-only wording:

```markdown
## Boundaries

Hermes uses default model lanes to reduce handoff confusion. These lanes are
advisory inside Hermes-spawned prompts and remain subordinate to `CLAUDE.md`,
`AGENTS.md`, and direct user instructions.
```

- [ ] **Step 3: Add `.claude/hermes/model-routing.json`**

The JSON must include:

```json
{
  "version": 2,
  "defaults": {
    "research": "claude",
    "production": "codex",
    "distribution": "claude"
  },
  "longContextModel": "kimi",
  "manualFlags": {
    "--claude": "claude",
    "--codex": "codex",
    "--kimi": "kimi"
  },
  "gates": {
    "research": "npm run doctor:quick",
    "production": "npm run check",
    "production-financial": "npm run calc-gate",
    "distribution": "npm run lint"
  }
}
```

Also include specialists for `waterfall-specialist`,
`phoenix-precision-guardian`, `xirr-fees-validator`, `test-repair`,
`code-reviewer`, and `debug-expert` using weighted compound phrases.

## Task 3: Import-Safe Hermes CLI

**Files:**

- Modify: `orchestrate.js`

- [ ] **Step 1: Replace legacy implementation with ESM task bus**

Implement these exports:

```javascript
export {
  Orchestrator,
  buildPrompt,
  chooseModel,
  createRoutingPlan,
  isCliEntryPoint,
  main,
  parseArgs,
  resolveGate,
  scoreSpecialist,
};
```

The CLI entrypoint must be guarded:

```javascript
if (isCliEntryPoint(import.meta.url, process.argv)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`[hermes] ${error.message}\n`);
    process.exit(1);
  });
}
```

- [ ] **Step 2: Preserve legacy commands intentionally**

Keep `node orchestrate.js bootstrap`, `node orchestrate.js smoke`, and
`node orchestrate.js enable-algorithms` through `Orchestrator` methods. Remove
emoji from legacy output.

- [ ] **Step 3: Run the routing tests to verify green**

Run:
`npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/routing/hermes-routing.test.ts`

Expected: PASS.

## Task 4: Scripts, Environment, and Discovery Integration

**Files:**

- Modify: `package.json`
- Modify: `.env.example`
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`
- Modify: `docs/DISCOVERY-MAP.source.yaml`

- [ ] **Step 1: Add package scripts**

Add:

```json
"hermes": "node orchestrate.js",
"hermes:dry": "node orchestrate.js --dry-run",
"hermes:route": "node orchestrate.js --json",
"hermes:research": "node orchestrate.js --phase research",
"hermes:production": "node orchestrate.js --phase production",
"hermes:distribution": "node orchestrate.js --phase distribution"
```

- [ ] **Step 2: Add `.env.example` entries**

Append:

```dotenv
# === Hermes Orchestration ===
HERMES_MODEL_ROUTING_FILE=.claude/hermes/model-routing.json
HERMES_DEV_BRAIN_FILE=DEV_BRAIN.md
CLAUDE_CODE_BIN=claude
CODEX_BIN=codex
KIMI_CODE_BIN=kimi-code
```

- [ ] **Step 3: Add short pointers to `CLAUDE.md` and `AGENTS.md`**

Add a short `### Hermes Dev Co-op` section near AI tooling guidance. Keep it a
pointer, not a second playbook.

- [ ] **Step 4: Add a schema-valid discovery pattern**

Add a pattern entry like:

```yaml
- id: 'hermes_dev_coop'
  priority: 124
  category: 'Orchestration'
  keywords:
    - 'hermes'
    - 'model co-op'
    - 'multi-model routing'
    - 'phase routed'
    - 'dev brain'
  target: 'DEV_BRAIN.md'
  message:
    'Hermes phase-routed model co-op charter; config lives in
    .claude/hermes/model-routing.json'
```

Adjust neighboring priorities only if the generator reports a collision.

- [ ] **Step 5: Regenerate discovery artifacts**

Run: `npm run docs:routing:generate`

Expected: updates generated routing files without schema errors.

## Task 5: Verification

**Files:**

- No new files unless a verification issue requires a fix.

- [ ] **Step 1: Verify import-safe tests**

Run:
`npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/routing/hermes-routing.test.ts`

Expected: PASS.

- [ ] **Step 2: Verify CLI routing JSON**

Run:
`node orchestrate.js --json --phase production --task "fix xirr calculation regression"`

Expected JSON includes:

```json
{
  "model": "codex",
  "specialist": "xirr-fees-validator",
  "gate": "npm run calc-gate"
}
```

- [ ] **Step 3: Verify distribution false positive**

Run:
`node orchestrate.js --json --phase distribution --task "prepare distribution summary for PR"`

Expected JSON includes `"specialist": null`.

- [ ] **Step 4: Verify manual override**

Run:
`node orchestrate.js --json --phase research --task "implement new filter" --kimi`

Expected JSON includes `"model": "kimi"`.

- [ ] **Step 5: Verify discovery artifacts**

Run: `npm run docs:routing:check`

Expected: PASS.

- [ ] **Step 6: Verify TypeScript baseline**

Run: `npm run check`

Expected: PASS or no new baseline regression.

## Self-Review

- Spec coverage: covers ESM, stdin prompt delivery, `.claude/hermes/`, safe
  exports, valid discovery integration, `calc-gate`, routing tests, legacy
  command compatibility, and Kimi command failure guidance.
- Placeholder scan: no deferred implementation placeholders are present in the
  executable tasks.
- Type consistency: test imports match planned `orchestrate.js` exports, and
  routing plan fields match CLI JSON output.

## Hardening Follow-ups

Approved follow-ups after the landed MVP:

- Enforce Hermes gates in `orchestrate.js` around real model execution.
- Keep the escape hatch limited to `--skip-preflight-gate --skip-reason`.
- Never skip production-financial postflight gates.
- Add `.claude/**/*.json` to discovery scanning so Hermes routing config is
  discoverable.
- Keep exactly one `hermes_dev_coop` discovery pattern.
- Do not add `dev-pipeline.ts` as part of this MVP hardening pass.
- Do not rewrite `orchestrate.js` wholesale; preserve the thin task-bus shape.
- Do not touch financial calculation code.

## Prune-Policy Reassessment

`DEV_BRAIN.md` and `.claude/hermes/SOUL.md` remain intentionally small runtime
prompt inputs. Their model-lane guidance, handoff rules, and Hermes identity are
not fully derivable from code, and `orchestrate.js` loads them into spawned
model prompts. Keep them unless a future change removes that runtime dependency.
