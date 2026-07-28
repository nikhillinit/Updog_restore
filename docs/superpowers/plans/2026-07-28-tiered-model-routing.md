# Sophistication-Tiered Model Routing with Native MOA Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sophistication-tier axis (T0 trivial to T3 critical) to the
Hermes CLI router that selects which model fills each phase role, and a native
multi-model coding review (terra + luna fan-out, sol aggregation, lens-diverse
prompts, schema-validated JSON findings) that gates T2/T3 production work.

**Architecture:** The tier is an orthogonal axis composed with the existing
phase routing in `orchestrate.js`: phase still decides roles, artifacts, and
gates; tier decides which model fills the owner slot and how much review fires.
The MOA review is implemented natively as a diamond (parallel lens reviewers via
`codex -m`, deterministic code merge and vote, aggregator narration) because the
Hermes Agent CLI has no headless MOA entry point. Approval is decided by code
(verdict votes), never by the aggregator model. Anchors (calc-gate, tests, truth
cases) always outrank model verdicts.

**Tech Stack:** Node.js ESM (`orchestrate.js`, dependency-free), JSON config
(`.claude/hermes/model-routing.json`), Vitest (server project) in
`tests/unit/routing/`.

## Global Constraints

- Branch first: all work on `feat/tiered-model-routing` (repo rule: never commit
  to `main`).
- `orchestrate.js` stays dependency-free: no new npm packages; hand-rolled
  validation.
- TypeScript strict conventions do not apply to `orchestrate.js` (plain JS), but
  tests are TS with no `any`.
- No emoji anywhere (code, docs, logs, commit messages).
- Conventional commits (`feat:`, `test:`, `docs:`).
- Test runs use `TZ=UTC` (repo convention):
  `TZ=UTC npx vitest run <file> --project=server`.
- Existing behavior with no `--tier` flag and no tier keywords must be
  behavior-identical to today (T1 = status quo): same model, gate, and workflow
  selection. The plan object gains `tier` and `review` fields; that is the only
  observable difference.
- Financial risk (specialist `risk: "financial"`) always promotes to T3
  regardless of keyword tier; this mirrors the existing production-financial
  promotion and must never be bypassable by `--tier T0`.
- Model verdicts never override gates: a failing postflight gate fails the run
  even if every reviewer approved (already true for the reviewer path; preserve
  for MOA).
- Lane Hygiene (DEV_BRAIN.md) still applies: keyword-light `--task` strings, one
  lane at a time.

---

### Task 1: Model roster — sol, luna, terra, qwen lanes and agy headless fix

**Files:**

- Modify: `.claude/hermes/model-routing.json` (commands, manualFlags, version)
- Modify: `orchestrate.js:13` (MODEL_OVERRIDES), `orchestrate.js:110-120`
  (parseArgs flags), `orchestrate.js:11` (DOCTOR_PROVIDERS)
- Test: `tests/unit/routing/hermes-tier-routing.test.ts` (new file, started
  here, extended by later tasks)

**Interfaces:**

- Consumes: existing `routing.commands[model]` lookup in
  `executeModel`/`executeModelCapture` (unchanged).
- Produces: model names `"sol" | "luna" | "terra" | "qwen"` valid everywhere a
  model name is accepted (`--model`, ownership slots, tier config, MOA reviewer
  slots). Later tasks reference these exact names.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/routing/hermes-tier-routing.test.ts`:

```typescript
import { describe, expect, test } from 'vitest';

import { parseArgs } from '../../../orchestrate.js';

describe('model roster expansion', () => {
  test.each([
    ['--sol', 'sol'],
    ['--luna', 'luna'],
    ['--terra', 'terra'],
    ['--qwen', 'qwen'],
  ])('%s sets manualModel %s', (flag, model) => {
    const options = parseArgs([flag, '--task', 'demo task']);
    expect(options.manualModel).toBe(model);
  });

  test('--model accepts the new names', () => {
    const options = parseArgs(['--model', 'terra', '--task', 'demo task']);
    expect(options.manualModel).toBe('terra');
  });

  test('--model rejects unknown names', () => {
    expect(() => parseArgs(['--model', 'gpt6', '--task', 'demo task'])).toThrow(
      /Unknown model/
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
`TZ=UTC npx vitest run tests/unit/routing/hermes-tier-routing.test.ts --project=server`
Expected: FAIL (`--sol` is not parsed; `manualModel` stays null).

- [ ] **Step 3: Implement**

In `orchestrate.js` line 13, extend the override set:

```javascript
const MODEL_OVERRIDES = new Set([
  'claude',
  'codex',
  'kimi',
  'gemini',
  'agy',
  'sol',
  'luna',
  'terra',
  'qwen',
]);
```

In `parseArgs`, after the existing `--agy` branch (line 119-120), add:

```javascript
    } else if (arg === '--sol') {
      options.manualModel = 'sol';
    } else if (arg === '--luna') {
      options.manualModel = 'luna';
    } else if (arg === '--terra') {
      options.manualModel = 'terra';
    } else if (arg === '--qwen') {
      options.manualModel = 'qwen';
    }
```

In `orchestrate.js` line 11, add ollama to the doctor roster:

```javascript
const DOCTOR_PROVIDERS = [
  'claude',
  'codex',
  'kimi-cli',
  'gemini',
  'agy',
  'ollama',
];
```

In `.claude/hermes/model-routing.json`: bump `"version": 2` to `"version": 3`;
add to `manualFlags`:

```json
    "--sol": "sol",
    "--luna": "luna",
    "--terra": "terra",
    "--qwen": "qwen"
```

Add to `commands` (sol/luna/terra reuse the codex binary with a model flag; qwen
pipes stdin through Ollama; agy gains `-p` so it stops opening an interactive
session when spawned headless):

```json
    "sol": {
      "binEnv": "CODEX_BIN",
      "defaultBin": "codex",
      "args": ["exec", "--sandbox", "danger-full-access", "-m", "gpt-5.6-sol"]
    },
    "luna": {
      "binEnv": "CODEX_BIN",
      "defaultBin": "codex",
      "args": ["exec", "--sandbox", "read-only", "-m", "gpt-5.6-luna"]
    },
    "terra": {
      "binEnv": "CODEX_BIN",
      "defaultBin": "codex",
      "args": ["exec", "--sandbox", "read-only", "-m", "gpt-5.6-terra"]
    },
    "qwen": {
      "binEnv": "OLLAMA_BIN",
      "defaultBin": "ollama",
      "args": ["run", "qwen3.6:latest"]
    }
```

and change the existing `agy` entry's args from `[]` to `["-p"]`.

Note: luna and terra are read-only sandboxes on purpose — they are reviewer
lanes and must not write; sol keeps write access as an
implementation/aggregation lane.

- [ ] **Step 4: Run the tests to verify they pass**

Run:
`TZ=UTC npx vitest run tests/unit/routing/hermes-tier-routing.test.ts --project=server`
Expected: PASS.

Also run the existing suite to confirm no regression:
`TZ=UTC npx vitest run tests/unit/routing/ --project=server` Expected: PASS.

- [ ] **Step 5: Verify the new lanes spawn headlessly (manual smoke, no
      assertions committed)**

```bash
echo "Reply with the single word OK." | ollama run qwen3.6:latest | head -3
echo "Reply with the single word OK." | agy -p 2>&1 | head -3
```

Expected: each prints a short response containing OK. If `agy -p` does not read
stdin, change its args to `["--print"]` and retry; if it still fails, record the
failure in the commit message body and leave the agy entry as-is (agy is not
used by any tier default — it remains a manual-override lane).

- [ ] **Step 6: Commit**

```bash
git add orchestrate.js .claude/hermes/model-routing.json tests/unit/routing/hermes-tier-routing.test.ts
git commit -m "feat(hermes): add sol, luna, terra, qwen model lanes and headless agy args"
```

---

### Task 2: Tier configuration and classifyTier

**Files:**

- Modify: `.claude/hermes/model-routing.json` (new top-level `tiers` and
  `moaReview` sections)
- Modify: `orchestrate.js` (new exported function `classifyTier`; `parseArgs`
  gains `--tier`)
- Test: `tests/unit/routing/hermes-tier-routing.test.ts`

**Interfaces:**

- Consumes: keyword-scoring idiom from `scoreSpecialist` (`orchestrate.js:148`)
  — same `{phrase, weight}` shape and `minScore` threshold.
- Produces:
  `classifyTier(task: string, routing: object, explicitTier: string|null) -> { tier: 'T0'|'T1'|'T2'|'T3', source: 'flag'|'keyword'|'default', matched: string[] }`.
  Task 3 consumes this exact return shape. `parseArgs` result gains
  `tier: string|null`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/routing/hermes-tier-routing.test.ts`:

```typescript
import { classifyTier } from '../../../orchestrate.js';

const tierRouting = {
  tiers: {
    T0: {
      label: 'trivial',
      keywords: [
        { phrase: 'fix typo', weight: 3 },
        { phrase: 'rename', weight: 3 },
        { phrase: 'reformat', weight: 3 },
      ],
      minScore: 3,
      modelByPhase: {
        research: 'qwen',
        production: 'qwen',
        distribution: 'qwen',
      },
      review: 'none',
    },
    T2: {
      label: 'complex',
      keywords: [
        { phrase: 'multi-module', weight: 4 },
        { phrase: 'architecture', weight: 3 },
        { phrase: 'race condition', weight: 4 },
      ],
      minScore: 3,
      modelByPhase: {
        research: 'claude',
        production: 'sol',
        distribution: 'claude',
      },
      review: 'moa',
    },
    T3: {
      label: 'critical',
      modelByPhase: {
        research: 'claude',
        production: 'sol',
        distribution: 'claude',
      },
      review: 'moa-strict',
    },
  },
};

describe('classifyTier', () => {
  test('explicit tier flag wins over keywords', () => {
    const result = classifyTier('fix typo in README', tierRouting, 'T2');
    expect(result).toEqual({ tier: 'T2', source: 'flag', matched: [] });
  });

  test('keyword match selects T0', () => {
    const result = classifyTier(
      'fix typo in the settings page',
      tierRouting,
      null
    );
    expect(result.tier).toBe('T0');
    expect(result.source).toBe('keyword');
    expect(result.matched).toContain('fix typo');
  });

  test('keyword match selects T2', () => {
    const result = classifyTier(
      'untangle race condition in queue worker',
      tierRouting,
      null
    );
    expect(result.tier).toBe('T2');
  });

  test('higher tier wins when both match', () => {
    const result = classifyTier(
      'reformat the multi-module architecture docs',
      tierRouting,
      null
    );
    expect(result.tier).toBe('T2');
  });

  test('no match defaults to T1', () => {
    const result = classifyTier(
      'add pagination to funds endpoint',
      tierRouting,
      null
    );
    expect(result).toEqual({ tier: 'T1', source: 'default', matched: [] });
  });

  test('T3 is never keyword-assigned (no keywords configured)', () => {
    const result = classifyTier('critical urgent important', tierRouting, null);
    expect(result.tier).toBe('T1');
  });

  test('invalid explicit tier throws', () => {
    expect(() => classifyTier('demo', tierRouting, 'T9')).toThrow(
      /Unknown tier/
    );
  });

  test('missing tiers config defaults to T1', () => {
    const result = classifyTier('anything at all', {}, null);
    expect(result).toEqual({ tier: 'T1', source: 'default', matched: [] });
  });
});

describe('parseArgs --tier', () => {
  test('accepts valid tier', () => {
    const options = parseArgs(['--tier', 'T2', '--task', 'demo task']);
    expect(options.tier).toBe('T2');
  });

  test('rejects invalid tier', () => {
    expect(() => parseArgs(['--tier', 'T5', '--task', 'demo task'])).toThrow(
      /Unknown tier/
    );
  });

  test('defaults to null', () => {
    const options = parseArgs(['--task', 'demo task']);
    expect(options.tier).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
`TZ=UTC npx vitest run tests/unit/routing/hermes-tier-routing.test.ts --project=server`
Expected: FAIL (`classifyTier` is not exported; `--tier` unknown).

- [ ] **Step 3: Implement**

In `orchestrate.js`, add near the top (after `MODEL_OVERRIDES`):

```javascript
const TIER_NAMES = ['T0', 'T1', 'T2', 'T3'];
```

Add `tier: null` to the `options` object in `parseArgs` (line 47-60 block), and
a parse branch alongside `--phase`:

```javascript
    } else if (arg === '--tier') {
      const tier = argv[index + 1] || '';
      if (!TIER_NAMES.includes(tier)) {
        throw new Error(`Unknown tier "${tier}". Expected one of: ${TIER_NAMES.join(', ')}.`);
      }
      options.tier = tier;
      index += 1;
    }
```

Add the function (after `scoreSpecialist`, before `chooseModel`) and export it:

```javascript
// Sophistication tier classification. Explicit flag wins; otherwise weighted
// keyword scoring per tier (same idiom as scoreSpecialist); highest matching
// tier wins; absent config or no match falls back to T1 (status quo behavior).
function classifyTier(task, routing, explicitTier = null) {
  if (explicitTier) {
    if (!TIER_NAMES.includes(explicitTier)) {
      throw new Error(
        `Unknown tier "${explicitTier}". Expected one of: ${TIER_NAMES.join(', ')}.`
      );
    }
    return { tier: explicitTier, source: 'flag', matched: [] };
  }

  const tiers = routing.tiers || {};
  const input = String(task || '').toLowerCase();
  let best = null;

  for (const name of TIER_NAMES) {
    const config = tiers[name];
    if (!config || !Array.isArray(config.keywords)) continue;

    const minScore = config.minScore ?? 3;
    let score = 0;
    const matched = [];
    for (const keyword of config.keywords) {
      const phrase = String(keyword.phrase || '').toLowerCase();
      const weight = keyword.weight || 1;
      if (phrase && input.includes(phrase)) {
        score += weight;
        matched.push(phrase);
      }
    }
    if (score >= minScore) {
      best = { tier: name, source: 'keyword', matched };
    }
  }

  return best || { tier: 'T1', source: 'default', matched: [] };
}
```

(The loop iterates T0 through T3 in order and keeps the last hit, so the highest
matching tier wins.)

Add to `.claude/hermes/model-routing.json` (top level):

```json
  "tiers": {
    "T0": {
      "label": "trivial",
      "keywords": [
        { "phrase": "fix typo", "weight": 3 },
        { "phrase": "reformat", "weight": 3 },
        { "phrase": "rename", "weight": 3 },
        { "phrase": "doc tweak", "weight": 3 },
        { "phrase": "one-liner", "weight": 3 },
        { "phrase": "bump version", "weight": 3 }
      ],
      "minScore": 3,
      "modelByPhase": { "research": "qwen", "production": "qwen", "distribution": "qwen" },
      "review": "none"
    },
    "T2": {
      "label": "complex",
      "keywords": [
        { "phrase": "multi-module", "weight": 4 },
        { "phrase": "architecture", "weight": 3 },
        { "phrase": "cross-cutting", "weight": 3 },
        { "phrase": "migration", "weight": 3 },
        { "phrase": "race condition", "weight": 4 },
        { "phrase": "concurrency", "weight": 3 },
        { "phrase": "performance regression", "weight": 3 }
      ],
      "minScore": 3,
      "modelByPhase": { "research": "claude", "production": "sol", "distribution": "claude" },
      "review": "moa"
    },
    "T3": {
      "label": "critical",
      "modelByPhase": { "research": "claude", "production": "sol", "distribution": "claude" },
      "review": "moa-strict"
    }
  },
  "moaReview": {
    "reviewers": [
      { "model": "terra", "lens": "correctness" },
      { "model": "luna", "lens": "spec-compliance" }
    ],
    "strictExtraReviewer": { "model": "claude", "lens": "numeric-precision" },
    "aggregator": "sol"
  }
```

T1 deliberately has no entry: absence of tier config means phase defaults and
existing review behavior, guaranteeing the status-quo path stays byte-identical.
T3 has no keywords: it is reachable only by explicit flag or financial promotion
(Task 3).

- [ ] **Step 4: Run the tests to verify they pass**

Run:
`TZ=UTC npx vitest run tests/unit/routing/hermes-tier-routing.test.ts --project=server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add orchestrate.js .claude/hermes/model-routing.json tests/unit/routing/hermes-tier-routing.test.ts
git commit -m "feat(hermes): tier classification with --tier flag and keyword scoring"
```

---

### Task 3: Tier-aware routing in createRoutingPlan and chooseModel

**Files:**

- Modify: `orchestrate.js:198-209` (`chooseModel`), `orchestrate.js:345-397`
  (`createRoutingPlan`)
- Test: `tests/unit/routing/hermes-tier-routing.test.ts`

**Interfaces:**

- Consumes: `classifyTier` return shape from Task 2; model names from Task 1.
- Produces: `chooseModel(task, phase, routing, manualModel, tierConfig)` — new
  optional fifth param, the tier's config object (or null). `createRoutingPlan`
  result gains `plan.tier = { name, source, matched }` and
  `plan.review = 'none'|'standard'|'moa'|'moa-strict'`. Tasks 5-7 consume
  `plan.review` and `plan.tier` with these exact names.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/routing/hermes-tier-routing.test.ts` (reuse `tierRouting`
from Task 2, merged with the phase/specialist fixture fields):

```typescript
import { chooseModel, createRoutingPlan } from '../../../orchestrate.js';

const fullRouting = {
  defaults: { research: 'claude', production: 'codex', distribution: 'claude' },
  longContextModel: 'kimi',
  longContextTriggers: ['full repo audit'],
  gates: {
    research: 'npm run doctor:quick',
    production: 'npm run check',
    'production-financial': 'npm run calc-gate',
    distribution: 'npm run lint',
  },
  specialists: {
    'waterfall-specialist': {
      keywords: [{ phrase: 'waterfall calculation', weight: 4 }],
      risk: 'financial',
    },
  },
  scoring: {
    minScoreToAssign: 3,
    riskOrder: ['financial', 'operational', 'quality'],
  },
  ...tierRouting,
};

describe('tier-aware routing', () => {
  test('T0 keyword task routes to qwen with review none', () => {
    const plan = createRoutingPlan({
      phase: 'production',
      task: 'fix typo in banner',
      routing: fullRouting,
    });
    expect(plan.model).toBe('qwen');
    expect(plan.tier).toEqual({
      name: 'T0',
      source: 'keyword',
      matched: ['fix typo'],
    });
    expect(plan.review).toBe('none');
  });

  test('T1 default keeps phase default model and standard review', () => {
    const plan = createRoutingPlan({
      phase: 'production',
      task: 'add pagination to funds endpoint',
      routing: fullRouting,
    });
    expect(plan.model).toBe('codex');
    expect(plan.tier.name).toBe('T1');
    expect(plan.review).toBe('standard');
  });

  test('T2 keyword task routes production to sol with moa review', () => {
    const plan = createRoutingPlan({
      phase: 'production',
      task: 'untangle race condition in worker pool',
      routing: fullRouting,
    });
    expect(plan.model).toBe('sol');
    expect(plan.review).toBe('moa');
  });

  test('financial specialist promotes any tier to T3 moa-strict', () => {
    const plan = createRoutingPlan({
      phase: 'production',
      task: 'fix typo in waterfall calculation docs',
      routing: fullRouting,
      explicitTier: 'T0',
    });
    expect(plan.tier).toEqual({
      name: 'T3',
      source: 'financial-promotion',
      matched: [],
    });
    expect(plan.review).toBe('moa-strict');
    expect(plan.gate).toBe('npm run calc-gate');
  });

  test('manual model override beats tier model', () => {
    const plan = createRoutingPlan({
      phase: 'production',
      task: 'fix typo in banner',
      routing: fullRouting,
      manualModel: 'claude',
    });
    expect(plan.model).toBe('claude');
    expect(plan.tier.name).toBe('T0');
  });

  test('long-context trigger beats tier model', () => {
    expect(
      chooseModel(
        'full repo audit of typo fixes',
        'research',
        fullRouting,
        null,
        fullRouting.tiers.T0
      )
    ).toBe('kimi');
  });

  test('explicit tier flows through createRoutingPlan', () => {
    const plan = createRoutingPlan({
      phase: 'research',
      task: 'plain task',
      routing: fullRouting,
      explicitTier: 'T2',
    });
    expect(plan.model).toBe('claude');
    expect(plan.tier).toEqual({ name: 'T2', source: 'flag', matched: [] });
  });

  test('tier model override is reflected in ownership owner', () => {
    const routingWithOwnership = {
      ...fullRouting,
      ownership: {
        production: {
          owner: 'codex',
          reviewer: 'claude',
          role: 'worker-executor',
          artifact: 'diff plus tests',
        },
      },
    };
    const plan = createRoutingPlan({
      phase: 'production',
      task: 'untangle race condition in worker pool',
      routing: routingWithOwnership,
    });
    expect(plan.ownership.owner).toBe('sol');
  });

  test('T1 ownership owner is unchanged', () => {
    const routingWithOwnership = {
      ...fullRouting,
      ownership: {
        production: {
          owner: 'codex',
          reviewer: 'claude',
          role: 'worker-executor',
          artifact: 'diff plus tests',
        },
      },
    };
    const plan = createRoutingPlan({
      phase: 'production',
      task: 'add pagination to funds endpoint',
      routing: routingWithOwnership,
    });
    expect(plan.ownership.owner).toBe('codex');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
`TZ=UTC npx vitest run tests/unit/routing/hermes-tier-routing.test.ts --project=server`
Expected: FAIL (`plan.tier` undefined; `chooseModel` ignores fifth arg).

- [ ] **Step 3: Implement**

Replace `chooseModel` (orchestrate.js:198-209):

```javascript
function chooseModel(
  task,
  phase,
  routing,
  manualModel = null,
  tierConfig = null
) {
  if (manualModel) return manualModel;

  const input = task.toLowerCase();
  for (const trigger of routing.longContextTriggers || []) {
    if (input.includes(String(trigger).toLowerCase())) {
      return routing.longContextModel || 'kimi';
    }
  }

  if (tierConfig?.modelByPhase?.[phase]) {
    return tierConfig.modelByPhase[phase];
  }

  return routing.defaults?.[phase] || 'claude';
}
```

In `createRoutingPlan` (orchestrate.js:345), accept `explicitTier = null` in the
destructured params. After the `specialist` line, add:

```javascript
let tierResult = classifyTier(task, routing, explicitTier);
if (specialist?.risk === 'financial' && tierResult.tier !== 'T3') {
  tierResult = { tier: 'T3', source: 'financial-promotion', matched: [] };
}
const tierConfig = routing.tiers?.[tierResult.tier] || null;
```

Change the `model` line to pass the tier config:

```javascript
const model = chooseModel(task, phase, routing, manualModel, tierConfig);
```

When the tier supplied the model, sync the ownership display so plan and prompt
name the executing model (Codex review comment 2). The `ownership` binding
becomes reassignable:

```javascript
let ownership = resolveOwnership(phase, specialist, routing.ownership || {});
if (
  ownership &&
  tierConfig?.modelByPhase?.[phase] &&
  model === tierConfig.modelByPhase[phase]
) {
  ownership = { ...ownership, owner: model };
}
```

Add to the `plan` object literal:

```javascript
    tier: { name: tierResult.tier, source: tierResult.source, matched: tierResult.matched },
    review: tierConfig?.review || 'standard',
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
`TZ=UTC npx vitest run tests/unit/routing/hermes-tier-routing.test.ts --project=server`
Expected: PASS.

Also run:
`TZ=UTC npx vitest run tests/unit/routing/ tests/regressions/REFL-039.test.ts --project=server`
Expected: PASS (status quo unchanged for existing tests; if any existing test
asserts the full plan object shape, update it to include `tier`/`review` and
note that in the commit).

- [ ] **Step 5: Commit**

```bash
git add orchestrate.js tests/unit/routing/hermes-tier-routing.test.ts
git commit -m "feat(hermes): tier-aware model selection and review policy in routing plan"
```

---

### Task 4: Findings node contract — extractFindingsReport

**Files:**

- Modify: `orchestrate.js` (new exported functions `validateFindingsReport`,
  `extractFindingsReport`)
- Test: `tests/unit/routing/hermes-moa-review.test.ts` (new file)

**Interfaces:**

- Consumes: nothing from earlier tasks (pure functions).
- Produces:
  - `validateFindingsReport(value: unknown) -> { ok: boolean, error: string|null }`
  - `extractFindingsReport(output: string) -> { ok: true, report: FindingsReport } | { ok: false, error: string }`
  - `FindingsReport = { verdict: 'approve'|'changes', summary: string, findings: Array<{ file: string, line: number, severity: 'high'|'medium'|'low', lens: string, claim: string, evidence?: string }> }`
  - Task 5 consumes both functions and the `FindingsReport` shape verbatim.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/routing/hermes-moa-review.test.ts`:

````typescript
import { describe, expect, test } from 'vitest';

import {
  extractFindingsReport,
  validateFindingsReport,
} from '../../../orchestrate.js';

const validReport = {
  verdict: 'changes',
  summary: 'One high severity issue.',
  findings: [
    {
      file: 'server/routes/funds.ts',
      line: 42,
      severity: 'high',
      lens: 'correctness',
      claim: 'Cursor not validated.',
    },
  ],
};

describe('validateFindingsReport', () => {
  test('accepts a valid report', () => {
    expect(validateFindingsReport(validReport)).toEqual({
      ok: true,
      error: null,
    });
  });

  test('accepts approve with empty findings', () => {
    expect(
      validateFindingsReport({
        verdict: 'approve',
        summary: 'Clean.',
        findings: [],
      }).ok
    ).toBe(true);
  });

  test('rejects unknown verdict', () => {
    expect(
      validateFindingsReport({ ...validReport, verdict: 'maybe' }).ok
    ).toBe(false);
  });

  test('rejects finding without file', () => {
    const report = {
      ...validReport,
      findings: [{ line: 1, severity: 'low', lens: 'x', claim: 'y' }],
    };
    expect(validateFindingsReport(report).ok).toBe(false);
  });

  test('rejects non-integer line', () => {
    const report = {
      ...validReport,
      findings: [{ ...validReport.findings[0], line: 'forty-two' }],
    };
    expect(validateFindingsReport(report).ok).toBe(false);
  });

  test('rejects unknown severity', () => {
    const report = {
      ...validReport,
      findings: [{ ...validReport.findings[0], severity: 'catastrophic' }],
    };
    expect(validateFindingsReport(report).ok).toBe(false);
  });

  test('rejects non-object input', () => {
    expect(validateFindingsReport('APPROVED').ok).toBe(false);
  });

  test('rejects approve with nonempty findings', () => {
    expect(
      validateFindingsReport({
        verdict: 'approve',
        summary: 's',
        findings: validReport.findings,
      }).ok
    ).toBe(false);
  });

  test('rejects changes with empty findings', () => {
    expect(
      validateFindingsReport({ verdict: 'changes', summary: 's', findings: [] })
        .ok
    ).toBe(false);
  });

  test('rejects non-string evidence', () => {
    const report = {
      ...validReport,
      findings: [{ ...validReport.findings[0], evidence: 42 }],
    };
    expect(validateFindingsReport(report).ok).toBe(false);
  });
});

describe('extractFindingsReport', () => {
  test('extracts a fenced json block from prose', () => {
    const output = [
      'Here is my review.',
      '```json',
      JSON.stringify(validReport),
      '```',
      'Done.',
    ].join('\n');
    const result = extractFindingsReport(output);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.report.verdict).toBe('changes');
  });

  test('extracts bare JSON output', () => {
    const result = extractFindingsReport(JSON.stringify(validReport));
    expect(result.ok).toBe(true);
  });

  test('uses the last fenced block when several exist', () => {
    const first = JSON.stringify({
      verdict: 'approve',
      summary: 'draft',
      findings: [],
    });
    const output = [
      '```json',
      first,
      '```',
      'Revised:',
      '```json',
      JSON.stringify(validReport),
      '```',
    ].join('\n');
    const result = extractFindingsReport(output);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.report.verdict).toBe('changes');
  });

  test('fails on missing JSON', () => {
    expect(extractFindingsReport('Looks good to me!').ok).toBe(false);
  });

  test('fails on JSON with wrong shape', () => {
    expect(extractFindingsReport('```json\n{"hello":"world"}\n```').ok).toBe(
      false
    );
  });
});
````

- [ ] **Step 2: Run the tests to verify they fail**

Run:
`TZ=UTC npx vitest run tests/unit/routing/hermes-moa-review.test.ts --project=server`
Expected: FAIL (functions not exported).

- [ ] **Step 3: Implement**

Add to `orchestrate.js` (after `parseApprovalSignal`, before `formatStepInput`),
and export both:

````javascript
const FINDING_SEVERITIES = new Set(['high', 'medium', 'low']);
const REPORT_VERDICTS = new Set(['approve', 'changes']);

// Node contract for MOA reviewer output. Hand-rolled (orchestrate.js is
// dependency-free). Lenient on extra properties, strict on required shape.
function validateFindingsReport(value) {
  const fail = (error) => ({ ok: false, error });
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fail('report must be an object');
  }
  if (!REPORT_VERDICTS.has(value.verdict)) {
    return fail(`verdict must be one of: ${[...REPORT_VERDICTS].join(', ')}`);
  }
  if (typeof value.summary !== 'string') {
    return fail('summary must be a string');
  }
  if (!Array.isArray(value.findings)) {
    return fail('findings must be an array');
  }
  for (const [index, finding] of value.findings.entries()) {
    if (!finding || typeof finding !== 'object')
      return fail(`findings[${index}] must be an object`);
    if (typeof finding.file !== 'string' || !finding.file)
      return fail(`findings[${index}].file required`);
    if (!Number.isInteger(finding.line) || finding.line < 1)
      return fail(`findings[${index}].line must be a positive integer`);
    if (!FINDING_SEVERITIES.has(finding.severity))
      return fail(`findings[${index}].severity must be high|medium|low`);
    if (typeof finding.lens !== 'string' || !finding.lens)
      return fail(`findings[${index}].lens required`);
    if (typeof finding.claim !== 'string' || !finding.claim)
      return fail(`findings[${index}].claim required`);
    if (finding.evidence !== undefined && typeof finding.evidence !== 'string')
      return fail(`findings[${index}].evidence must be a string when present`);
  }
  if (value.verdict === 'approve' && value.findings.length > 0) {
    return fail('verdict approve requires an empty findings array');
  }
  if (value.verdict === 'changes' && value.findings.length === 0) {
    return fail('verdict changes requires at least one finding');
  }
  return { ok: true, error: null };
}

// Pulls the last fenced ```json block (or, failing that, the whole output) and
// validates it against the findings contract.
function extractFindingsReport(output) {
  const text = String(output || '');
  const fenced = [...text.matchAll(/```json\s*\n([\s\S]*?)```/g)];
  const candidates =
    fenced.length > 0 ? [fenced[fenced.length - 1][1]] : [text.trim()];

  for (const candidate of candidates) {
    let parsed;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      return {
        ok: false,
        error: 'no parseable JSON report found in reviewer output',
      };
    }
    const valid = validateFindingsReport(parsed);
    if (!valid.ok) {
      return { ok: false, error: valid.error };
    }
    return { ok: true, report: parsed };
  }
  return {
    ok: false,
    error: 'no parseable JSON report found in reviewer output',
  };
}
````

- [ ] **Step 4: Run the tests to verify they pass**

Run:
`TZ=UTC npx vitest run tests/unit/routing/hermes-moa-review.test.ts --project=server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add orchestrate.js tests/unit/routing/hermes-moa-review.test.ts
git commit -m "feat(hermes): schema-validated findings node contract for MOA review"
```

---

### Task 5: runMoaReview — parallel lens fan-out, code-decided vote, degraded guard

**Files:**

- Modify: `orchestrate.js` (new exported functions `findingKey`, `runMoaReview`)
- Test: `tests/unit/routing/hermes-moa-review.test.ts`

**Interfaces:**

- Consumes: `extractFindingsReport` (Task 4);
  `executeModelCapture(model, prompt, routing, env)` (orchestrate.js:563) as the
  default executor.
- Produces:
  - `findingKey(finding) -> string` — `"<file>:<line>:<normalized claim>"`, used
    for dedup here and in Task 6's repair loop.
  - `runMoaReview({ artifact, task, mode, moaConfig, routing, env, executor }) -> Promise<MoaResult>`
  - `MoaResult = { approved: boolean, degraded: boolean, findings: Finding[], votes: Array<{ model, lens, verdict: 'approve'|'changes'|'error', error: string|null }>, aggregatorSummary: string|null }`
  - `mode` is `'moa'` (2 reviewers, unanimous approve, degraded tolerated loudly
    if at least one reviewer succeeds) or `'moa-strict'` (3 reviewers, at least
    2 approvals, any degradation fails). Task 6 consumes `MoaResult` verbatim.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/routing/hermes-moa-review.test.ts`:

````typescript
import { findingKey, runMoaReview } from '../../../orchestrate.js';

const moaConfig = {
  reviewers: [
    { model: 'terra', lens: 'correctness' },
    { model: 'luna', lens: 'spec-compliance' },
  ],
  strictExtraReviewer: { model: 'claude', lens: 'numeric-precision' },
  aggregator: 'sol',
};

const routingStub = { commands: {} };

function reviewerOutput(
  verdict: 'approve' | 'changes',
  findings: object[] = []
) {
  return {
    code: 0,
    output:
      '```json\n' +
      JSON.stringify({ verdict, summary: 's', findings }) +
      '\n```',
  };
}

const finding = {
  file: 'a.ts',
  line: 3,
  severity: 'high',
  lens: 'correctness',
  claim: 'Bad cursor.',
};

describe('findingKey', () => {
  test('normalizes whitespace and case of the claim', () => {
    expect(findingKey({ file: 'a.ts', line: 3, claim: 'Bad  Cursor.' })).toBe(
      'a.ts:3:bad cursor.'
    );
  });
});

describe('runMoaReview', () => {
  test('moa mode approves when both reviewers approve; aggregator not spawned for zero findings', async () => {
    const calls: string[] = [];
    const executor = async (model: string) => {
      calls.push(model);
      return reviewerOutput('approve');
    };
    const result = await runMoaReview({
      artifact: 'diff',
      task: 't',
      mode: 'moa',
      moaConfig,
      routing: routingStub,
      executor,
    });
    expect(result.approved).toBe(true);
    expect(result.degraded).toBe(false);
    expect(calls.sort()).toEqual(['luna', 'terra']);
  });

  test('moa mode requests changes when any reviewer requests changes; findings are unioned', async () => {
    const executor = async (model: string) =>
      model === 'terra'
        ? reviewerOutput('changes', [finding])
        : reviewerOutput('approve');
    const result = await runMoaReview({
      artifact: 'diff',
      task: 't',
      mode: 'moa',
      moaConfig,
      routing: routingStub,
      executor,
    });
    expect(result.approved).toBe(false);
    expect(result.findings).toHaveLength(1);
  });

  test('moa mode with one failed reviewer is degraded but still decides from the survivor', async () => {
    const executor = async (model: string) =>
      model === 'terra'
        ? { code: 1, output: 'crash' }
        : reviewerOutput('approve');
    const result = await runMoaReview({
      artifact: 'diff',
      task: 't',
      mode: 'moa',
      moaConfig,
      routing: routingStub,
      executor,
    });
    expect(result.degraded).toBe(true);
    expect(result.approved).toBe(true);
    expect(result.votes.find((vote) => vote.model === 'terra')?.verdict).toBe(
      'error'
    );
  });

  test('moa mode with all reviewers failed is degraded and not approved', async () => {
    const executor = async () => ({ code: 1, output: 'crash' });
    const result = await runMoaReview({
      artifact: 'diff',
      task: 't',
      mode: 'moa',
      moaConfig,
      routing: routingStub,
      executor,
    });
    expect(result.degraded).toBe(true);
    expect(result.approved).toBe(false);
  });

  test('moa-strict spawns three reviewers and approves on 2-of-3', async () => {
    const calls: string[] = [];
    const executor = async (model: string) => {
      calls.push(model);
      return model === 'luna'
        ? reviewerOutput('changes', [finding])
        : reviewerOutput('approve');
    };
    const result = await runMoaReview({
      artifact: 'diff',
      task: 't',
      mode: 'moa-strict',
      moaConfig,
      routing: routingStub,
      executor,
    });
    expect(calls.sort()).toEqual(['claude', 'luna', 'terra']);
    expect(result.approved).toBe(true);
  });

  test('moa-strict fails closed on any degradation even with 2 approvals', async () => {
    const executor = async (model: string) =>
      model === 'claude'
        ? { code: 1, output: 'crash' }
        : reviewerOutput('approve');
    const result = await runMoaReview({
      artifact: 'diff',
      task: 't',
      mode: 'moa-strict',
      moaConfig,
      routing: routingStub,
      executor,
    });
    expect(result.degraded).toBe(true);
    expect(result.approved).toBe(false);
  });

  test('invalid JSON from a reviewer counts as error vote', async () => {
    const executor = async (model: string) =>
      model === 'terra'
        ? { code: 0, output: 'LGTM!' }
        : reviewerOutput('approve');
    const result = await runMoaReview({
      artifact: 'diff',
      task: 't',
      mode: 'moa',
      moaConfig,
      routing: routingStub,
      executor,
    });
    expect(result.degraded).toBe(true);
    expect(result.votes.find((vote) => vote.model === 'terra')?.verdict).toBe(
      'error'
    );
  });

  test('duplicate findings across reviewers are deduped by findingKey', async () => {
    const duplicate = { ...finding, lens: 'spec-compliance' };
    const executor = async (model: string) =>
      model === 'terra'
        ? reviewerOutput('changes', [finding])
        : reviewerOutput('changes', [duplicate]);
    const result = await runMoaReview({
      artifact: 'diff',
      task: 't',
      mode: 'moa',
      moaConfig,
      routing: routingStub,
      executor,
    });
    expect(result.findings).toHaveLength(1);
  });

  test('duplicate finding keeps the higher severity', async () => {
    const low = { ...finding, severity: 'low' };
    const executor = async (model: string) =>
      model === 'terra'
        ? reviewerOutput('changes', [low])
        : reviewerOutput('changes', [finding]);
    const result = await runMoaReview({
      artifact: 'diff',
      task: 't',
      mode: 'moa',
      moaConfig,
      routing: routingStub,
      executor,
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe('high');
  });

  test('aggregator runs when findings exist and its prose is captured', async () => {
    const calls: string[] = [];
    const executor = async (model: string) => {
      calls.push(model);
      if (model === 'sol')
        return { code: 0, output: 'Merged review narrative.' };
      return model === 'terra'
        ? reviewerOutput('changes', [finding])
        : reviewerOutput('approve');
    };
    const result = await runMoaReview({
      artifact: 'diff',
      task: 't',
      mode: 'moa',
      moaConfig,
      routing: routingStub,
      executor,
    });
    expect(calls).toContain('sol');
    expect(result.aggregatorSummary).toBe('Merged review narrative.');
  });
});
````

- [ ] **Step 2: Run the tests to verify they fail**

Run:
`TZ=UTC npx vitest run tests/unit/routing/hermes-moa-review.test.ts --project=server`
Expected: FAIL (functions not exported).

- [ ] **Step 3: Implement**

Add to `orchestrate.js` (after `extractFindingsReport`), export both:

````javascript
function findingKey(finding) {
  const claim = String(finding.claim || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return `${finding.file}:${finding.line}:${claim}`;
}

function buildMoaReviewerPrompt({ task, artifact, lens }) {
  return [
    'You are one reviewer in a multi-model code review panel.',
    `Your assigned lens: ${lens}. Review ONLY through this lens; other lenses are covered by other reviewers.`,
    'Adversarial stance: actively try to find problems. Approve only if you find none through your lens.',
    '',
    `TASK UNDER REVIEW: ${task}`,
    '',
    '--- ARTIFACT (diff / implementation output) ---',
    artifact,
    '--- END ARTIFACT ---',
    '',
    'Respond with ONLY a fenced json block of this exact shape:',
    '```json',
    '{"verdict": "approve" | "changes", "summary": "<one sentence>", "findings": [{"file": "<path>", "line": <int>, "severity": "high" | "medium" | "low", "lens": "<your lens>", "claim": "<the defect>", "evidence": "<why>"}]}',
    '```',
    'verdict "approve" requires an empty findings array. No prose outside the block.',
  ].join('\n');
}

// The MOA coding-review diamond: parallel lens reviewers, deterministic merge
// and vote in code, optional aggregator narration. Approval is decided HERE,
// never by a model: moa = all successful reviewers approve (degraded tolerated
// loudly if at least one survives); moa-strict = >=2 approvals AND zero
// degradation. Findings are unioned and deduped by findingKey.
async function runMoaReview({
  artifact,
  task,
  mode,
  moaConfig,
  routing,
  env = process.env,
  executor = executeModelCapture,
}) {
  const reviewers = [...(moaConfig.reviewers || [])];
  if (mode === 'moa-strict' && moaConfig.strictExtraReviewer) {
    reviewers.push(moaConfig.strictExtraReviewer);
  }

  const votes = await Promise.all(
    reviewers.map(async ({ model, lens }) => {
      try {
        const { code, output } = await executor(
          model,
          buildMoaReviewerPrompt({ task, artifact, lens }),
          routing,
          env
        );
        if (code !== 0) {
          return {
            model,
            lens,
            verdict: 'error',
            error: `exit code ${code}`,
            findings: [],
          };
        }
        const extracted = extractFindingsReport(output);
        if (!extracted.ok) {
          return {
            model,
            lens,
            verdict: 'error',
            error: extracted.error,
            findings: [],
          };
        }
        return {
          model,
          lens,
          verdict: extracted.report.verdict,
          error: null,
          findings: extracted.report.findings,
        };
      } catch (error) {
        return {
          model,
          lens,
          verdict: 'error',
          error: error.message,
          findings: [],
        };
      }
    })
  );

  const succeeded = votes.filter((vote) => vote.verdict !== 'error');
  const approvals = succeeded.filter(
    (vote) => vote.verdict === 'approve'
  ).length;
  const degraded = succeeded.length < reviewers.length;

  const SEVERITY_RANK = { high: 3, medium: 2, low: 1 };
  const byKey = new Map();
  for (const vote of votes) {
    for (const finding of vote.findings) {
      const key = findingKey(finding);
      const existing = byKey.get(key);
      if (
        !existing ||
        SEVERITY_RANK[finding.severity] > SEVERITY_RANK[existing.severity]
      ) {
        byKey.set(key, finding);
      }
    }
  }
  const findings = [...byKey.values()];

  let approved;
  if (mode === 'moa-strict') {
    approved = !degraded && approvals >= 2;
  } else {
    approved = succeeded.length > 0 && approvals === succeeded.length;
  }

  let aggregatorSummary = null;
  if (findings.length > 0 && moaConfig.aggregator) {
    try {
      const aggregatorPrompt = [
        'You aggregate a multi-model code review. The verdict is already decided by vote; do not change it.',
        `Merged findings (${findings.length}):`,
        JSON.stringify(findings, null, 2),
        '',
        'Write a concise reviewer-facing narrative: group related findings, order by severity, one paragraph max per finding.',
      ].join('\n');
      const { code, output } = await executor(
        moaConfig.aggregator,
        aggregatorPrompt,
        routing,
        env
      );
      if (code === 0) aggregatorSummary = output.trim();
    } catch {
      // narration is best-effort; the vote already decided the outcome
    }
  }

  return {
    approved,
    degraded,
    findings,
    votes: votes.map(({ model, lens, verdict, error }) => ({
      model,
      lens,
      verdict,
      error,
    })),
    aggregatorSummary,
  };
}
````

- [ ] **Step 4: Run the tests to verify they pass**

Run:
`TZ=UTC npx vitest run tests/unit/routing/hermes-moa-review.test.ts --project=server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add orchestrate.js tests/unit/routing/hermes-moa-review.test.ts
git commit -m "feat(hermes): native MOA review diamond with lens fan-out and code-decided vote"
```

---

### Task 6: Wire MOA review into workflow planning and execution with dedup repair loop

**Files:**

- Modify: `orchestrate.js:239-343` (`createWorkflowPlan`),
  `orchestrate.js:768-897` (`executeWorkflow`)
- Test: `tests/unit/routing/hermes-moa-review.test.ts`

**Interfaces:**

- Consumes: `plan.review` (Task 3), `runMoaReview`/`findingKey`/`MoaResult`
  (Task 5), existing `executeWorkflow` deps injection.
- Produces: workflow steps may include
  `{ role: 'moa-review', model: <aggregator>, action: 'multi-model lens review of artifact', mode: 'moa'|'moa-strict' }`.
  `executeWorkflow` accepts `deps.moaRunner` (defaults to `runMoaReview`) and
  its ledger record gains `moa: MoaResult|null`. Repair loop treats MOA findings
  as reviewer input, dedupes by `findingKey` across rounds, and exits early when
  a round adds no new findings.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/routing/hermes-moa-review.test.ts`:

```typescript
import { createWorkflowPlan, executeWorkflow } from '../../../orchestrate.js';

describe('createWorkflowPlan with MOA review', () => {
  const ownership = {
    owner: 'sol',
    reviewer: 'claude',
    role: 'worker-executor',
    artifact: 'diff plus tests',
  };

  test('review policy moa inserts a moa-review step after owner', () => {
    const workflow = createWorkflowPlan({
      requestedWorkflow: 'pair',
      phase: 'production',
      model: 'sol',
      specialist: null,
      gate: 'npm run check',
      ownership: { effectivePhase: 'production', ...ownership },
      risk: 'standard',
      review: 'moa',
      moaConfig: { aggregator: 'sol' },
    });
    const roles = workflow.steps.map((step) => step.role);
    expect(roles.indexOf('moa-review')).toBeGreaterThan(roles.indexOf('owner'));
    expect(
      workflow.steps.find((step) => step.role === 'moa-review')?.mode
    ).toBe('moa');
  });

  test('review policy none omits moa-review', () => {
    const workflow = createWorkflowPlan({
      requestedWorkflow: 'solo',
      phase: 'production',
      model: 'qwen',
      specialist: null,
      gate: 'npm run check',
      ownership: { effectivePhase: 'production', ...ownership },
      risk: 'standard',
      review: 'none',
    });
    expect(workflow.steps.some((step) => step.role === 'moa-review')).toBe(
      false
    );
  });

  test('review policy none suppresses the reviewer step too', () => {
    const workflow = createWorkflowPlan({
      requestedWorkflow: 'pair',
      phase: 'production',
      model: 'qwen',
      specialist: null,
      gate: 'npm run check',
      ownership: { effectivePhase: 'production', ...ownership },
      risk: 'standard',
      review: 'none',
    });
    expect(workflow.steps.some((step) => step.role === 'reviewer')).toBe(false);
  });

  test('review workflow mode never gets a moa step (no artifact to review)', () => {
    const workflow = createWorkflowPlan({
      requestedWorkflow: 'review',
      phase: 'production',
      model: 'sol',
      specialist: null,
      gate: 'npm run check',
      ownership: { effectivePhase: 'production', ...ownership },
      risk: 'standard',
      review: 'moa',
      moaConfig: { aggregator: 'sol' },
    });
    expect(workflow.steps.some((step) => step.role === 'moa-review')).toBe(
      false
    );
  });
});

describe('executeWorkflow with MOA review', () => {
  const moaStepPlan = (mode: 'moa' | 'moa-strict') => ({
    phase: 'production',
    risk: 'standard',
    gate: null,
    review: mode,
    workflow: {
      selected: 'pair',
      steps: [
        { role: 'owner', model: 'sol', action: 'execute production lane' },
        {
          role: 'moa-review',
          model: 'sol',
          action: 'multi-model lens review of artifact',
          mode,
        },
        { role: 'reviewer', model: 'claude', action: 'review diff plus tests' },
      ],
    },
  });

  const approvingRunStep = async ({ step }: { step: { role: string } }) =>
    step.role === 'reviewer'
      ? { code: 0, output: 'APPROVED', approved: true }
      : { code: 0, output: 'artifact-v1' };

  test('approved moa and reviewer exit zero with moa result in record', async () => {
    const moaRunner = async () => ({
      approved: true,
      degraded: false,
      findings: [],
      votes: [],
      aggregatorSummary: null,
    });
    const record = await executeWorkflow(moaStepPlan('moa'), {
      runStep: approvingRunStep,
      moaRunner,
      writeRunLedger: null,
    });
    expect(record.exitCode).toBe(0);
    expect(record.moa?.approved).toBe(true);
  });

  test('moa changes trigger repair; second clean round approves', async () => {
    const finding = {
      file: 'a.ts',
      line: 3,
      severity: 'high',
      lens: 'correctness',
      claim: 'Bad cursor.',
    };
    let round = 0;
    const moaRunner = async () => {
      round += 1;
      return round === 1
        ? {
            approved: false,
            degraded: false,
            findings: [finding],
            votes: [],
            aggregatorSummary: null,
          }
        : {
            approved: true,
            degraded: false,
            findings: [],
            votes: [],
            aggregatorSummary: null,
          };
    };
    const record = await executeWorkflow(moaStepPlan('moa'), {
      runStep: approvingRunStep,
      moaRunner,
      writeRunLedger: null,
    });
    expect(record.exitCode).toBe(0);
    expect(record.repairs).toBe(1);
  });

  test('repeated identical findings exit as dry loop without exhausting maxRepairs', async () => {
    const finding = {
      file: 'a.ts',
      line: 3,
      severity: 'high',
      lens: 'correctness',
      claim: 'Bad cursor.',
    };
    let moaCalls = 0;
    const moaRunner = async () => {
      moaCalls += 1;
      return {
        approved: false,
        degraded: false,
        findings: [finding],
        votes: [],
        aggregatorSummary: null,
      };
    };
    const record = await executeWorkflow(moaStepPlan('moa'), {
      runStep: approvingRunStep,
      moaRunner,
      maxRepairs: 5,
      writeRunLedger: null,
    });
    expect(record.exitCode).toBe(1);
    expect(moaCalls).toBe(2);
  });

  test('moa-strict degraded fails immediately without burning repairs', async () => {
    let moaCalls = 0;
    const moaRunner = async () => {
      moaCalls += 1;
      return {
        approved: false,
        degraded: true,
        findings: [],
        votes: [],
        aggregatorSummary: null,
      };
    };
    const record = await executeWorkflow(moaStepPlan('moa-strict'), {
      runStep: approvingRunStep,
      moaRunner,
      writeRunLedger: null,
    });
    expect(record.exitCode).toBe(1);
    expect(record.moa?.degraded).toBe(true);
    expect(moaCalls).toBe(1);
    expect(record.repairs).toBe(0);
  });

  test('workflow without moa step never invokes moaRunner', async () => {
    let called = false;
    const moaRunner = async () => {
      called = true;
      return {
        approved: true,
        degraded: false,
        findings: [],
        votes: [],
        aggregatorSummary: null,
      };
    };
    const plan = {
      phase: 'production',
      risk: 'standard',
      gate: null,
      workflow: {
        selected: 'solo',
        steps: [
          { role: 'owner', model: 'codex', action: 'execute production lane' },
        ],
      },
    };
    const record = await executeWorkflow(plan, {
      runStep: approvingRunStep,
      moaRunner,
      writeRunLedger: null,
    });
    expect(called).toBe(false);
    expect(record.exitCode).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
`TZ=UTC npx vitest run tests/unit/routing/hermes-moa-review.test.ts --project=server`
Expected: FAIL (`createWorkflowPlan` ignores `review`; `executeWorkflow` has no
MOA handling).

- [ ] **Step 3: Implement**

In `createWorkflowPlan` (orchestrate.js:239), accept `review = 'standard'` and
`moaConfig = null` in the destructured params. Immediately after the
specialist-step push block (after line 281) — so declared order matches
execution order (owner, specialist, moa-review, reviewer) — add, with the same
owner-lane guard as the owner step so `review` and `debate` workflows never get
an artifact-less MOA step (Codex review comments 3 and 4):

```javascript
if (
  (review === 'moa' || review === 'moa-strict') &&
  selected !== 'review' &&
  selected !== 'debate' &&
  ownerModel
) {
  steps.push({
    role: 'moa-review',
    model: moaConfig?.aggregator || 'sol',
    action: 'multi-model lens review of artifact',
    mode: review,
  });
}
```

When `review === 'none'`, suppress the reviewer step as well — T0 means no
review at all (Codex review comment 5): extend the reviewer-push condition
(orchestrate.js:283-292) to also require `review !== 'none'`.

In `createRoutingPlan`, pass the new fields where `createWorkflowPlan` is
invoked (orchestrate.js:373):

```javascript
plan.workflow = createWorkflowPlan({
  requestedWorkflow,
  phase,
  model,
  specialist,
  gate,
  ownership,
  risk,
  debate: routing.debate || null,
  review: tierConfig?.review || 'standard',
  moaConfig: routing.moaReview || null,
});
```

In `executeWorkflow` (orchestrate.js:768): resolve the step and runner near the
other `stepByRole` lookups:

```javascript
const moaStep = stepByRole('moa-review');
const moaRunner = deps.moaRunner || runMoaReview;
const routing = deps.routing || null;
const env = deps.env || process.env;
```

IMPORTANT scope note: declare `let moaResult = null;` at function scope, next to
the existing `let artifact = null;` declaration (orchestrate.js:813) — the final
`record` object references it, so it must NOT be declared inside the review
block below.

Replace the reviewer block (orchestrate.js:838-847) with a combined review loop.
`runReviewRound` runs MOA (when present) and the reviewer sequentially within
the round; rounds repeat while unapproved, bounded by `maxRepairs` AND by the
dry-loop check (a round whose MOA findings are all already in `seenFindingKeys`
stops iterating):

```javascript
const seenFindingKeys = new Set();

const runReviewRound = async (attempt) => {
  let roundApproved = true;
  let repairInput = '';

  if (moaStep) {
    moaResult = await moaRunner({
      artifact: artifact ?? '',
      task: plan.task ?? '',
      mode: moaStep.mode,
      moaConfig: deps.moaConfig || routing?.moaReview || {},
      routing,
      env,
    });
    records.push({
      role: 'moa-review',
      model: moaStep.model,
      attempt,
      code: moaResult.degraded && moaStep.mode === 'moa-strict' ? 1 : 0,
      approved: moaResult.approved,
      output: JSON.stringify({
        votes: moaResult.votes,
        findings: moaResult.findings,
      }),
    });
    if (moaResult.degraded) {
      process.stderr.write(
        `[hermes] WARNING: MOA review degraded (mode ${moaStep.mode}): ${JSON.stringify(moaResult.votes)}\n`
      );
    }
    if (!moaResult.approved) {
      roundApproved = false;
      repairInput += `MOA REVIEW FINDINGS:\n${JSON.stringify(moaResult.findings, null, 2)}\n`;
    }
  }

  let reviewerApproved = null;
  if (reviewerStep) {
    const review = await runRecorded(reviewerStep, artifact, attempt);
    reviewerApproved = Boolean(review.approved);
    if (!review.approved) {
      roundApproved = false;
      repairInput += `REVIEWER OUTPUT:\n${review.output ?? ''}`;
    }
  }

  return { roundApproved, repairInput, reviewerApproved };
};

if (moaStep || reviewerStep) {
  let round = await runReviewRound(0);
  approved = round.roundApproved;

  while (!approved && repairs < maxRepairs && ownerStep) {
    if (moaResult?.degraded && moaStep?.mode === 'moa-strict') {
      break; // transport failure: repairing code cannot fix a crashed reviewer lane
    }
    const newKeys = (moaResult?.findings || [])
      .map(findingKey)
      .filter((key) => !seenFindingKeys.has(key));
    const moaIsSoleRejector =
      moaStep &&
      moaResult &&
      !moaResult.approved &&
      round.reviewerApproved !== false;
    if (
      moaIsSoleRejector &&
      !moaResult.degraded &&
      newKeys.length === 0 &&
      repairs > 0
    ) {
      break; // dry loop: MOA repeats known findings and nothing else rejects
    }
    for (const key of newKeys) seenFindingKeys.add(key);

    repairs += 1;
    const repair = await runRecorded(ownerStep, round.repairInput, repairs);
    artifact = repair.output ?? artifact;
    round = await runReviewRound(repairs);
    approved = round.roundApproved;
  }
}
```

(Delete the old `if (reviewerStep) { ... }` block this replaces; keep
`specialistStep` handling above it unchanged.)

Extend the exit-code derivation (orchestrate.js:863-870) with an MOA clause
after the reviewer clause:

```javascript
  } else if (moaStep && moaResult && !moaResult.approved) {
    exitCode = 1;
  }
```

Add `moa: moaResult` to the `record` object (orchestrate.js:872-886), and in
`main()` pass routing, env, and any injected MOA runner through to
`executeWorkflow` (orchestrate.js:1126) so injected environments and runners
reach the MOA lanes exactly as they reach owner lanes (Codex review comment 11):

```javascript
const record = await executeWorkflow(plan, {
  runStep,
  gateRunner,
  writeRunLedger: ledgerWriter,
  clock,
  runId,
  routing,
  env,
  moaRunner: deps.moaRunner,
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
`TZ=UTC npx vitest run tests/unit/routing/hermes-moa-review.test.ts --project=server`
Expected: PASS.

Regression check:
`TZ=UTC npx vitest run tests/unit/routing/ tests/regressions/REFL-039.test.ts --project=server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add orchestrate.js tests/unit/routing/hermes-moa-review.test.ts
git commit -m "feat(hermes): MOA review step in workflow execution with dedup repair loop"
```

---

### Task 7: CLI surface — --tier plumbing, dry-run visibility, help text

**Files:**

- Modify: `orchestrate.js:1078-1086` (`main` plan construction),
  `orchestrate.js:899-936` (`printHelp`)
- Test: `tests/unit/routing/hermes-tier-routing.test.ts`

**Interfaces:**

- Consumes: `options.tier` (Task 2), `explicitTier` param of `createRoutingPlan`
  (Task 3).
- Produces: end-to-end `--tier` behavior; `--json` and `--dry-run` output
  includes `tier` and `review` fields (they already will, being part of the plan
  object — the tests here pin that contract).

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/routing/hermes-tier-routing.test.ts`:

```typescript
import { main } from '../../../orchestrate.js';

describe('main --tier plumbing', () => {
  function captureIo() {
    let stdout = '';
    return {
      io: {
        stdout: {
          write: (chunk: string) => {
            stdout += chunk;
          },
        },
        stderr: { write: () => {} },
      },
      read: () => stdout,
    };
  }

  test('--json includes tier and review from explicit flag', async () => {
    const { io, read } = captureIo();
    const code = await main(
      [
        '--json',
        '--tier',
        'T2',
        '--phase',
        'production',
        '--task',
        'plain task',
      ],
      {},
      io as never,
      { routing: fullRouting, brain: 'stub', soul: '' }
    );
    expect(code).toBe(0);
    const plan = JSON.parse(read());
    expect(plan.tier).toEqual({ name: 'T2', source: 'flag', matched: [] });
    expect(plan.review).toBe('moa');
    expect(plan.model).toBe('sol');
  });

  test('help text documents --tier', async () => {
    const { io, read } = captureIo();
    await main(['--help'], {}, io as never, {});
    expect(read()).toContain('--tier');
  });

  test('T2 production dispatch auto-upgrades to live workflow with MOA', async () => {
    const { io } = captureIo();
    let moaCalled = false;
    const moaRunner = async () => {
      moaCalled = true;
      return {
        approved: true,
        degraded: false,
        findings: [],
        votes: [],
        aggregatorSummary: null,
      };
    };
    const runStep = async ({ step }: { step: { role: string } }) =>
      step.role === 'reviewer'
        ? { code: 0, output: 'APPROVED', approved: true }
        : { code: 0, output: 'artifact' };
    const gateRunner = () => ({ status: 0 });
    const code = await main(
      [
        '--phase',
        'production',
        '--task',
        'untangle race condition in worker pool',
      ],
      {},
      io as never,
      {
        routing: fullRouting,
        brain: 'stub',
        soul: '',
        runStep,
        moaRunner,
        gateRunner,
        writeRunLedger: null,
      }
    );
    expect(code).toBe(0);
    expect(moaCalled).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
`TZ=UTC npx vitest run tests/unit/routing/hermes-tier-routing.test.ts --project=server`
Expected: FAIL (`main` does not pass `explicitTier`; help lacks `--tier`).

- [ ] **Step 3: Implement**

In `main()` (orchestrate.js:1078), add `explicitTier: options.tier,` to the
`createRoutingPlan` call.

Auto-upgrade T2/T3 production dispatches to live workflow execution so the MOA
review actually gates them (Codex review comment 1 — without this, a plain
dispatch would skip the review the tier mandates). After the plan is built:

```javascript
let autoWorkflow = false;
if (
  (plan.review === 'moa' || plan.review === 'moa-strict') &&
  plan.phase === 'production' &&
  !options.workflowProvided &&
  !options.dryRun &&
  !options.json
) {
  plan = createRoutingPlan({
    phase: options.phase,
    task: options.task,
    routing,
    manualModel: options.manualModel,
    requestedWorkflow: 'pair',
    skipPreflightGate: options.skipPreflightGate,
    gateSkipReason: options.gateSkipReason,
    explicitTier: options.tier,
  });
  autoWorkflow = true;
}
```

This requires `const plan` to become `let plan`, the `liveExecution` computation
moving to after this block as
`const liveExecution = options.live || autoWorkflow || env.HERMES_LIVE === '1' || env.HERMES_LIVE === 'true';`,
and the workflow-execution branch condition becoming
`(options.workflowProvided || autoWorkflow) && liveExecution && plan.workflow`.
The planning-only guard (`--workflow` without `--live`) keeps its existing
condition on `options.workflowProvided`.

Expose the tier through the public API as well (Codex review comment 12):
`Orchestrator.plan()` and `Orchestrator.execute()` each accept
`explicitTier = null` and pass it to `createRoutingPlan`.

In `printHelp`, add under `Model overrides:`:

```
Tier overrides:
  --tier <T0|T1|T2|T3>
                 Force the sophistication tier. Default: keyword-scored, T1 fallback.
                 T0 trivial (qwen, no review) | T1 standard (phase defaults)
                 T2 complex (sol production, MOA review) | T3 critical (MOA-strict review).
                 Financial tasks always promote to T3 and carry the calc-gate;
                 a nonfinancial --tier T3 keeps its ordinary phase gate.
```

and extend the model overrides line to mention the new flags:

```
  --claude | --codex | --kimi | --gemini | --agy | --sol | --luna | --terra | --qwen
  --model <claude|codex|kimi|gemini|agy|sol|luna|terra|qwen>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
`TZ=UTC npx vitest run tests/unit/routing/hermes-tier-routing.test.ts --project=server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add orchestrate.js tests/unit/routing/hermes-tier-routing.test.ts
git commit -m "feat(hermes): --tier CLI flag, dry-run tier visibility, help text"
```

---

### Task 8: Documentation — DEV_BRAIN.md tier section and ADR

**Files:**

- Modify: `DEV_BRAIN.md` (new section after "Phase Routing")
- Modify: `DECISIONS.md` (new ADR entry)

**Interfaces:**

- Consumes: the shipped behavior of Tasks 1-7 (documentation must match
  implementation exactly; verify each claim against the code before writing).
- Produces: governance text future sessions rely on.

- [ ] **Step 1: Add the tier section to DEV_BRAIN.md**

Insert after the "Phase Routing" table:

```markdown
## Sophistication Tiers (added 2026-07-28)

Tier is an orthogonal axis composed with phase routing: phase decides roles,
artifacts, and gates; tier decides which model fills the owner slot and how much
review fires. Explicit `--tier` wins; otherwise keyword scoring; financial
specialist risk always promotes to T3 and cannot be overridden downward.

| Tier | Meaning  | Owner model (research/production/distribution) | Review                                         |
| ---- | -------- | ---------------------------------------------- | ---------------------------------------------- |
| T0   | trivial  | qwen / qwen / qwen (local Ollama)              | none                                           |
| T1   | standard | phase defaults (claude / codex / claude)       | existing reviewer flow                         |
| T2   | complex  | claude / sol / claude                          | MOA: all surviving reviewers must approve      |
| T3   | critical | claude / sol / claude                          | MOA-strict: 3 lenses, 2-of-3 vote, fail-closed |

MOA review rules (REFL-lineage: graph-engineering verifier protocol):

1. Reviewers get fresh context (no owner conversation), distinct lenses
   (correctness, spec-compliance, numeric-precision), and must return a
   schema-validated JSON findings report; free-text reviews are error votes.
2. Approval is decided by code from verdict votes, never by the aggregator.
3. Degraded fan-in is loud: a failed reviewer warns on stderr in T2 (the
   surviving reviewers then decide) and fails the run immediately in T3 with no
   repair attempts (transport failures are not code defects).
4. Anchor precedence: no model verdict overrides a gate. calc-gate, tests, and
   Phoenix truth cases outrank any number of approving models.
5. Repair loop dedups findings by file:line:claim across rounds and exits when
   MOA is the sole rejector and surfaces nothing new (dry loop), bounded by
   maxRepairs.
6. Tier-based owner fill is an explicit owner decision recorded in the ADR
   below; the REFL-039 rule that plan/implement/review role assignments change
   only by explicit owner decision is unaffected.

Model lanes: sol/luna/terra are gpt-5.6 variants via the codex CLI (`-m`);
qwen3.6 runs locally via Ollama (quota-free T0 lane); agy is a manual-override
lane (`--agy`). luna/terra run read-only sandboxes (reviewer lanes must not
write).

Operational note: the MOA step executes only in live workflow mode. T2/T3
production dispatches therefore run as
`node orchestrate.js --workflow pair --live --phase production --task "..."`. A
plain dispatch without `--workflow --live` still routes the tier's owner model
but skips the MOA step.
```

- [ ] **Step 2: Add the ADR to DECISIONS.md**

Find the latest ADR number:
`grep -oE "ADR-[0-9]+" DECISIONS.md | sort -t- -k2 -n | tail -1`, use the next
number (NNN below), and match the surrounding entry format in the file. Content:

```markdown
## ADR-NNN: Sophistication-tiered model routing with native MOA review

Date: 2026-07-28 Status: Accepted

Context: Multiple model lanes became available (gpt-5.6 sol/luna/terra via codex
CLI, local qwen3.6 via Ollama, agy) beyond the original claude/codex/kimi trio.
Routing every task to premium lanes wastes quota on trivial work and
under-reviews critical financial work. The Hermes Agent (Nous) MOA preset was
considered for multi-model review but has no headless CLI entry point and sends
identical prompts to all reference models.

Decision: Add a sophistication tier axis (T0-T3) to orchestrate.js, composed
orthogonally with phase routing (phase = roles and gates, tier = model fill and
review depth). Implement the coding-review diamond natively: parallel
lens-diverse reviewers (terra correctness, luna spec-compliance, claude
numeric-precision for T3), schema-validated JSON findings as the node contract,
approval decided by code vote (unanimous for T2, 2-of-3 fail-closed for T3), sol
as non-authoritative aggregator/narrator. Financial risk always promotes to T3.
Anchors (gates, truth cases) outrank all model verdicts.

Consequences: T0 work runs quota-free on local qwen. T2/T3 production diffs get
multi-model adversarial review without a Hermes Agent dependency. The repair
loop dedups findings across rounds and exits dry. Degraded review fan-in is loud
in T2 and fatal in T3. orchestrate.js remains dependency-free; routing stays
deterministic and dry-run auditable.
```

- [ ] **Step 3: Verify documentation matches implementation**

Re-read the DEV_BRAIN.md table against `.claude/hermes/model-routing.json` tiers
section and `runMoaReview` vote logic. Every model name, vote threshold, and
failure behavior must match the code. Fix any drift now.

- [ ] **Step 4: Commit**

```bash
git add DEV_BRAIN.md DECISIONS.md
git commit -m "docs(hermes): tier routing section in DEV_BRAIN and ADR for tiered MOA review"
```

---

### Task 9: End-to-end verification

**Files:**

- No new files; verification only.

**Interfaces:**

- Consumes: everything above.
- Produces: evidence for the PR description.

- [ ] **Step 0: Config-integrity tests against the real v3 config**

Append to `tests/unit/routing/hermes-tier-routing.test.ts` (Codex review
comments 15 and 17 — pins the shipped config to the parser and command roster so
drift fails CI):

```typescript
import { readFileSync } from 'node:fs';

describe('model-routing.json v3 integrity', () => {
  const real = JSON.parse(
    readFileSync(
      new URL('../../../.claude/hermes/model-routing.json', import.meta.url),
      'utf8'
    )
  );

  test('every tier model has a commands entry', () => {
    for (const tier of Object.values(real.tiers) as Array<{
      modelByPhase?: Record<string, string>;
    }>) {
      for (const model of Object.values(tier.modelByPhase ?? {})) {
        expect(real.commands[model]).toBeDefined();
      }
    }
  });

  test('every MOA reviewer and aggregator has a commands entry', () => {
    const models = [
      ...real.moaReview.reviewers.map(
        (reviewer: { model: string }) => reviewer.model
      ),
      real.moaReview.strictExtraReviewer.model,
      real.moaReview.aggregator,
    ];
    for (const model of models) {
      expect(real.commands[model]).toBeDefined();
    }
  });

  test('every manualFlags entry parses to its model', () => {
    for (const [flag, model] of Object.entries(real.manualFlags)) {
      expect(parseArgs([flag, '--task', 'demo']).manualModel).toBe(model);
    }
  });
});
```

Run:
`TZ=UTC npx vitest run tests/unit/routing/hermes-tier-routing.test.ts --project=server`
Expected: PASS. Commit:
`git add tests/unit/routing/hermes-tier-routing.test.ts && git commit -m "test(hermes): config integrity for model-routing v3"`

- [ ] **Step 1: Full routing test suite**

Run:
`TZ=UTC npx vitest run tests/unit/routing/ tests/regressions/REFL-039.test.ts --project=server`
Expected: PASS, zero failures.

- [ ] **Step 2: Dry-run audit per tier (no model spawns)**

```bash
node orchestrate.js --dry-run --phase production --task "fix typo in dashboard label" | head -30
node orchestrate.js --dry-run --phase production --task "add pagination to funds endpoint" | head -30
node orchestrate.js --dry-run --phase production --task "untangle race condition in worker pool" | head -30
node orchestrate.js --dry-run --tier T3 --phase production --task "adjust rounding in waterfall calculation" | head -30
```

Expected: routing plans show tier T0/qwen/none, T1/codex/standard, T2/sol/moa,
T3/sol/moa-strict with calc-gate respectively.

- [ ] **Step 3: T0 live smoke (cheapest possible end-to-end)**

```bash
node orchestrate.js --phase distribution --task "one-liner: summarize the repo purpose from CLAUDE.md in two sentences"
```

Expected: preflight `npm run lint` gate runs, qwen executes via Ollama, exit
code 0. This exercises the full lane (gate, spawn via commands config, ledger
write to `ai-logs/hermes/runs/`) without touching premium quota. If lint is
slow, this is still the correct gate for distribution — do not skip it.

- [ ] **Step 4: Typecheck and lint the repo**

Run: `npm run check && npm run lint` Expected: PASS (orchestrate.js is plain JS
but the test files are TS and must typecheck).

- [ ] **Step 5: Commit any fixes, then hand off**

If steps 1-4 surfaced fixes, commit them (`fix(hermes): ...`). Then follow
superpowers:finishing-a-development-branch to merge or raise the PR. PR
description must cite: test suite output, the four dry-run tier classifications,
and the T0 live smoke exit code.
